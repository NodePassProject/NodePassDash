package main

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"archive/zip"
	"context"
	"database/sql"
	"embed"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

// Version 会在构建时通过 -ldflags "-X main.Version=xxx" 注入
var Version = "dev"

//go:embed dist.zip
var distZip embed.FS

// extractDistIfNeeded 如果当前目录没有 dist 文件夹则解压嵌入的 zip
func extractDistIfNeeded() error {
	// 检查 dist 目录是否已存在
	if _, err := os.Stat("dist"); err == nil {
		log.Infof("dist 目录已存在，跳过解压")
		return nil
	}

	log.Infof("dist 目录不存在，开始解压嵌入的 dist.zip...")

	// 读取嵌入的 zip 文件
	zipData, err := distZip.ReadFile("dist.zip")
	if err != nil {
		return fmt.Errorf("无法读取嵌入的 dist.zip: %v", err)
	}

	// 创建临时文件
	tmpFile, err := os.CreateTemp("", "dist-*.zip")
	if err != nil {
		return fmt.Errorf("无法创建临时文件: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	defer tmpFile.Close()

	// 写入 zip 数据到临时文件
	if _, err := tmpFile.Write(zipData); err != nil {
		return fmt.Errorf("无法写入临时文件: %v", err)
	}
	tmpFile.Close()

	// 解压 zip 文件
	if err := unzip(tmpFile.Name(), "."); err != nil {
		return fmt.Errorf("解压失败: %v", err)
	}

	log.Infof("成功解压 dist 目录")
	return nil
}

// unzip 解压 zip 文件到指定目录
func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	// 创建目标目录
	os.MkdirAll(dest, 0755)

	// 解压函数
	extractAndWriteFile := func(f *zip.File) error {
		rc, err := f.Open()
		if err != nil {
			return err
		}
		defer rc.Close()

		path := filepath.Join(dest, "dist", f.Name)

		// 检查路径是否安全（防止 zip bomb）
		destDir := filepath.Join(filepath.Clean(dest), "dist")
		if !strings.HasPrefix(path, destDir+string(os.PathSeparator)) && path != destDir {
			return fmt.Errorf("无效的文件路径: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(path, f.FileInfo().Mode())
			return nil
		}

		// 创建文件的目录
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return err
		}

		outFile, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.FileInfo().Mode())
		if err != nil {
			return err
		}
		defer outFile.Close()

		_, err = io.Copy(outFile, rc)
		return err
	}

	for _, f := range r.File {
		err := extractAndWriteFile(f)
		if err != nil {
			return err
		}
	}

	return nil
}

func main() {
	// 命令行参数处理
	resetPwdCmd := flag.Bool("resetpwd", false, "重置管理员密码")
	portFlag := flag.String("port", "", "HTTP 服务端口 (优先级高于环境变量 PORT)，默认 3000")
	flag.Parse()

	// 解压 dist 目录（如果需要）
	if err := extractDistIfNeeded(); err != nil {
		log.Errorf("解压 dist 失败: %v", err)
		return
	}

	// 确保public目录存在
	dbDir := "public"
	if err := ensureDir(dbDir); err != nil {
		log.Errorf("创建数据库目录失败: %v", err)
		return
	}
	// 如果指定了 --resetpwd，则进入密码重置流程后退出
	if *resetPwdCmd {
		// 打开数据库
		db, err := sql.Open("sqlite3", "file:public/sqlite.db?_journal_mode=WAL&_busy_timeout=5000&_fk=1")
		if err != nil {
			log.Errorf("连接数据库失败: %v", err)
		}
		defer db.Close()

		authService := auth.NewService(db)
		if _, _, err := authService.ResetAdminPassword(); err != nil {
			log.Errorf("重置密码失败: %v", err)
		}
		return
	}

	// 打开数据库连接
	db, err := sql.Open("sqlite3", "file:public/sqlite.db?_journal_mode=WAL&_busy_timeout=10000&_fk=1&_sync=NORMAL&_cache_size=1000000")
	if err != nil {
		log.Errorf("连接数据库失败: %v", err)
	}
	defer db.Close()

	// 优化连接池配置，避免过多并发连接
	db.SetMaxOpenConns(6)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(0)               // 连接不过期
	db.SetConnMaxIdleTime(5 * time.Minute) // 空闲连接5分钟后关闭

	// 初始化数据库表结构
	if err := initDatabase(db); err != nil {
		log.Errorf("初始化数据库失败: %v", err)
	}

	// 初始化服务
	authService := auth.NewService(db)
	endpointService := endpoint.NewService(db)
	tunnelService := tunnel.NewService(db)
	dashboardService := dashboard.NewService(db)

	// 创建SSE服务和管理器（需先于处理器创建）
	sseService := sse.NewService(db)
	sseManager := sse.NewManager(db, sseService)
	// 适当减少 worker 数量，避免过多并发写入
	workerCount := runtime.NumCPU()
	if workerCount > 4 {
		workerCount = 4 // 最多4个worker
	}
	sseManager.StartWorkers(workerCount)

	// 初始化处理器
	authHandler := api.NewAuthHandler(authService)
	endpointHandler := api.NewEndpointHandler(endpointService, sseManager)
	tunnelHandler := api.NewTunnelHandler(tunnelService)
	dashboardHandler := api.NewDashboardHandler(dashboardService)

	// 创建API路由器 (仅处理 /api/*)
	apiRouter := api.NewRouter(db, sseService, sseManager)

	// 顶层路由器，用于同时处理 API 和静态资源
	rootRouter := mux.NewRouter()
	rootRouter.StrictSlash(true)

	// 注册 API 路由
	rootRouter.PathPrefix("/api/").Handler(apiRouter)

	// 静态文件服务 - 使用解压后的 dist 目录
	fs := http.FileServer(http.Dir("dist"))
	rootRouter.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 如果请求路径以 /api/ 开头，交给 API 处理器
		if strings.HasPrefix(r.URL.Path, "/api/") {
			apiRouter.ServeHTTP(w, r)
			return
		}

		// 检查文件是否存在
		if _, err := http.Dir("dist").Open(r.URL.Path); err != nil {
			// 如果文件不存在，返回 index.html 以支持 SPA
			http.ServeFile(w, r, "dist/index.html")
			return
		}

		// 提供静态文件
		fs.ServeHTTP(w, r)
	})

	// 读取端口：命令行 > 环境变量 > 默认值
	port := "3000"
	if env := os.Getenv("PORT"); env != "" {
		port = env
	}
	if *portFlag != "" {
		port = *portFlag
	}
	addr := fmt.Sprintf(":%s", port)

	// 创建上下文和取消函数
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 系统初始化（首次启动输出初始用户名和密码）
	if _, _, err := authService.InitializeSystem(); err != nil && err.Error() != "系统已初始化" {
		log.Errorf("系统初始化失败: %v", err)
	}

	// 启动SSE系统
	if err := sseManager.InitializeSystem(); err != nil {
		log.Errorf("初始化SSE系统失败: %v", err)
	}

	// 创建HTTP服务器
	server := &http.Server{
		Addr:    addr,
		Handler: rootRouter,
	}

	// 启动HTTP服务器
	go func() {
		log.Infof("NodePassDash[%s]启动在 http://localhost:%s", Version, port)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Errorf("HTTP服务器错误: %v", err)
		}
	}()

	// 记录未使用的变量以避免编译错误
	_ = authHandler
	_ = endpointHandler
	_ = tunnelHandler
	_ = dashboardHandler
	_ = ctx

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	// 关闭服务
	log.Infof("正在关闭服务器...")

	// 关闭SSE系统
	sseManager.Close()
	sseService.Close()

	// 优雅关闭HTTP服务器
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Errorf("服务器关闭错误: %v", err)
	}

	log.Infof("服务器已关闭")
}

// initDatabase 创建必须的表结构（如不存在）
func initDatabase(db *sql.DB) error {
	createEndpointsTable := `
	CREATE TABLE IF NOT EXISTS "Endpoint" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		url TEXT NOT NULL UNIQUE,
		apiPath TEXT NOT NULL,
		apiKey TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'OFFLINE',
		color TEXT DEFAULT 'default',
		lastCheck DATETIME DEFAULT CURRENT_TIMESTAMP,
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		tunnelCount INTEGER DEFAULT 0
	);`

	createTunnelTable := `
	CREATE TABLE IF NOT EXISTS "Tunnel" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		endpointId INTEGER NOT NULL,
		mode TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'stopped',
		tunnelAddress TEXT NOT NULL,
		tunnelPort TEXT NOT NULL,
		targetAddress TEXT NOT NULL,
		targetPort TEXT NOT NULL,
		tlsMode TEXT NOT NULL,
		certPath TEXT,
		keyPath TEXT,
		logLevel TEXT NOT NULL DEFAULT 'info',
		commandLine TEXT NOT NULL,
		instanceId TEXT,
		tcpRx INTEGER DEFAULT 0,
		tcpTx INTEGER DEFAULT 0,
		udpRx INTEGER DEFAULT 0,
		udpTx INTEGER DEFAULT 0,
		min INTEGER,
		max INTEGER,
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		lastEventTime DATETIME,
		FOREIGN KEY (endpointId) REFERENCES "Endpoint"(id) ON DELETE CASCADE
	);`

	createTunnelRecycleTable := `
	CREATE TABLE IF NOT EXISTS "TunnelRecycle" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		endpointId INTEGER NOT NULL,
		mode TEXT NOT NULL,
		tunnelAddress TEXT NOT NULL,
		tunnelPort TEXT NOT NULL,
		targetAddress TEXT NOT NULL,
		targetPort TEXT NOT NULL,
		tlsMode TEXT NOT NULL,
		certPath TEXT,
		keyPath TEXT,
		logLevel TEXT NOT NULL DEFAULT 'info',
		commandLine TEXT NOT NULL,
		instanceId TEXT,
		tcpRx INTEGER DEFAULT 0,
		tcpTx INTEGER DEFAULT 0,
		udpRx INTEGER DEFAULT 0,
		udpTx INTEGER DEFAULT 0,
		min INTEGER,
		max INTEGER,
		FOREIGN KEY (endpointId) REFERENCES "Endpoint"(id) ON DELETE CASCADE
	);`

	createEndpointSSE := `
	CREATE TABLE IF NOT EXISTS "EndpointSSE" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		eventType TEXT NOT NULL,
		pushType TEXT NOT NULL,
		eventTime DATETIME NOT NULL,
		endpointId INTEGER NOT NULL,
		instanceId TEXT NOT NULL,
		instanceType TEXT,
		status TEXT,
		url TEXT,
		tcpRx INTEGER DEFAULT 0,
		tcpTx INTEGER DEFAULT 0,
		udpRx INTEGER DEFAULT 0,
		udpTx INTEGER DEFAULT 0,
		logs TEXT,
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (endpointId) REFERENCES "Endpoint"(id) ON DELETE CASCADE
	);`

	createTunnelLog := `
	CREATE TABLE IF NOT EXISTS "TunnelOperationLog" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		tunnelId INTEGER,
		tunnelName TEXT NOT NULL,
		action TEXT NOT NULL,
		status TEXT NOT NULL,
		message TEXT,
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`

	createSystemConfig := `
	CREATE TABLE IF NOT EXISTS "SystemConfig" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		KEY TEXT NOT NULL UNIQUE,
		value TEXT NOT NULL,
		description TEXT,
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`

	createUserSession := `
	CREATE TABLE IF NOT EXISTS "UserSession" (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sessionId TEXT NOT NULL UNIQUE,
		username TEXT NOT NULL,
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		expiresAt DATETIME NOT NULL,
		isActive BOOLEAN NOT NULL DEFAULT 1
	);`

	// 依次执行创建表 SQL
	if _, err := db.Exec(createEndpointsTable); err != nil {
		return err
	}
	if _, err := db.Exec(createTunnelTable); err != nil {
		return err
	}
	if _, err := db.Exec(createTunnelRecycleTable); err != nil {
		return err
	}
	if _, err := db.Exec(createEndpointSSE); err != nil {
		return err
	}
	if _, err := db.Exec(createTunnelLog); err != nil {
		return err
	}
	if _, err := db.Exec(createSystemConfig); err != nil {
		return err
	}
	if _, err := db.Exec(createUserSession); err != nil {
		return err
	}

	// ---- 旧库兼容：为 Tunnel 表添加 min / max 列 ----
	if err := ensureColumn(db, "Tunnel", "min", "INTEGER"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Tunnel", "max", "INTEGER"); err != nil {
		return err
	}

	return nil
}

// ensureDir 确保目录存在，如果不存在则创建
func ensureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		log.Infof("创建目录: %s", dir)
		return os.MkdirAll(dir, 0755)
	}
	return nil
}

// ensureColumn 若列不存在则 ALTER TABLE 添加，幂等安全
func ensureColumn(db *sql.DB, table, column, typ string) error {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var exists bool
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dfltValue interface{}
		var pk int
		_ = rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk)
		if name == column {
			exists = true
			break
		}
	}

	if !exists {
		_, err := db.Exec(`ALTER TABLE "` + table + `" ADD COLUMN ` + column + ` ` + typ)
		return err
	}
	return nil
}
