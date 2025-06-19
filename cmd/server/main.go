package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"NodePassDash/internal/api"
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	// 打开数据库连接
	db, err := sql.Open("sqlite3", "/tmp/sqlite.db")
	if err != nil {
		log.Fatalf("连接数据库失败: %v", err)
	}
	defer db.Close()

	// 初始化数据库表结构
	if err := initDatabase(db); err != nil {
		log.Fatalf("初始化数据库失败: %v", err)
	}

	// 初始化服务
	authService := auth.NewService(db)
	endpointService := endpoint.NewService(db)
	tunnelService := tunnel.NewService(db)
	dashboardService := dashboard.NewService(db)

	// 创建SSE服务和管理器（需先于处理器创建）
	sseService := sse.NewService(db)
	sseManager := sse.NewManager(db, sseService)

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

	// 静态文件服务
	fs := http.FileServer(http.Dir("dist"))
	rootRouter.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 如果请求路径以 /api/ 开头，交给 API 处理器（理论上不会进入该函数，但保险起见）
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

	// 创建HTTP服务器
	server := &http.Server{
		Addr:    ":3000",
		Handler: rootRouter,
	}

	// 创建上下文和取消函数
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 系统初始化（首次启动输出初始用户名和密码）
	if _, _, err := authService.InitializeSystem(); err != nil && err.Error() != "系统已初始化" {
		log.Fatalf("系统初始化失败: %v", err)
	}

	// 启动SSE系统
	if err := sseManager.InitializeSystem(); err != nil {
		log.Printf("初始化SSE系统失败: %v", err)
	}

	// 启动HTTP服务器
	go func() {
		log.Printf("服务器启动在 http://localhost:3000")
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP服务器错误: %v", err)
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
	log.Println("正在关闭服务器...")

	// 关闭SSE系统
	sseManager.Close()
	sseService.Close()

	// 优雅关闭HTTP服务器
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("服务器关闭错误: %v", err)
	}

	log.Println("服务器已关闭")
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
		createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		lastEventTime DATETIME,
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
		key TEXT NOT NULL UNIQUE,
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

	return nil
}
