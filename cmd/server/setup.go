package main

import (
	"NodePassDash/internal/auth"
	dbPkg "NodePassDash/internal/db"
	"NodePassDash/internal/db/dialect"
	log "NodePassDash/internal/log"
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
	gormpg "gorm.io/driver/postgres"
	gormsqlite "gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupState 跟踪 setup 模式下"是否已完成初始化",用于在完成后退出进程让外部 supervisor 重启。
type setupState struct {
	done atomic.Bool
}

// runSetupMode 启动一个最小化 HTTP 服务,只挂 /api/setup/* 和静态资源。
// SSE/WS/scheduler/auth 业务路由完全不挂。
// 用户提交一条龙后,该函数会触发优雅关闭让外部 supervisor 重启。
func runSetupMode(port, certFile, keyFile string) {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	// 拦截非 setup 的 /api/* 请求,提前返回 503 setup_required。
	// 必须在路由匹配之前介入,所以走全局 middleware。
	r.Use(func(c *gin.Context) {
		p := c.Request.URL.Path
		const apiPrefix = "/api/"
		const setupPrefix = "/api/setup/"
		if len(p) >= len(apiPrefix) && p[:len(apiPrefix)] == apiPrefix &&
			!(len(p) >= len(setupPrefix) && p[:len(setupPrefix)] == setupPrefix) {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error":       "setup_required",
				"description": "请先完成数据库初始化(/setup)",
			})
			return
		}
		c.Next()
	})

	state := &setupState{}

	r.GET("/api/setup/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"initialized": false,
			"setup_mode":  true,
			"version":     Version,
		})
	})

	r.POST("/api/setup/test-connection", func(c *gin.Context) {
		var req setupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := testConnection(req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	r.POST("/api/setup/initialize", func(c *gin.Context) {
		var req setupRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := runSetupInitialize(req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		state.done.Store(true)
		c.JSON(http.StatusOK, gin.H{"requires_restart": true})
	})

	// 静态资源 + SPA NoRoute 由 setupStaticFiles 统一注册
	if err := setupStaticFiles(r); err != nil {
		log.Errorf("[Setup]配置静态文件服务失败: %v", err)
		return
	}

	server := startHTTPServer(r, port, certFile, keyFile)

	log.Infof("NodePassDash[%s] 已进入 Setup 模式,请打开 http://localhost:%s 完成初始化", Version, port)

	// 等待: setup 完成 / SIGTERM / SIGINT
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-quit:
			log.Info("收到退出信号,关闭 Setup 模式")
			gracefulShutdownHTTP(server)
			return
		case <-ticker.C:
			if state.done.Load() {
				// 给客户端一点时间收到响应再关闭
				log.Info("Setup 完成,即将退出进程让 supervisor 重启")
				time.Sleep(1 * time.Second)
				gracefulShutdownHTTP(server)
				return
			}
		}
	}
}

// setupRequest 是 setup 向导从前端提交的载荷。
// 仅 initialize 接口需要 admin 字段,test-connection 时可留空。
type setupRequest struct {
	Driver string `json:"driver" binding:"required"`

	SQLite struct {
		Path    string `json:"path"`
		WALMode bool   `json:"wal_mode"`
	} `json:"sqlite"`

	Postgres struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		Database string `json:"database"`
		SSLMode  string `json:"ssl_mode"`
		TimeZone string `json:"timezone"`
	} `json:"postgres"`

	Admin struct {
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"admin"`
}

// toConfig 把请求转成 DBConfig。
func (r setupRequest) toConfig() dbPkg.DBConfig {
	cfg := dbPkg.GetDBConfig("db") // 拿当前默认值 + env 合并值
	cfg.Driver = r.Driver

	switch r.Driver {
	case dialect.NameSQLite, "sqlite3":
		if r.SQLite.Path != "" {
			cfg.Database = r.SQLite.Path
		}
		cfg.WALMode = r.SQLite.WALMode
	case dialect.NamePostgres, "postgresql", "pg":
		if r.Postgres.Host != "" {
			cfg.PostgresHost = r.Postgres.Host
		}
		if r.Postgres.Port > 0 {
			cfg.PostgresPort = r.Postgres.Port
		}
		cfg.PostgresUser = r.Postgres.User
		cfg.PostgresPassword = r.Postgres.Password
		cfg.PostgresDatabase = r.Postgres.Database
		if r.Postgres.SSLMode != "" {
			cfg.PostgresSSLMode = r.Postgres.SSLMode
		}
		if r.Postgres.TimeZone != "" {
			cfg.PostgresTimeZone = r.Postgres.TimeZone
		}
	}

	// 应用方言默认池子
	d := dialect.For(cfg.Driver)
	if d != nil {
		pool := d.DefaultPool()
		if cfg.MaxOpenConns <= 0 {
			cfg.MaxOpenConns = pool.MaxOpenConns
		}
		if cfg.MaxIdleConns <= 0 {
			cfg.MaxIdleConns = pool.MaxIdleConns
		}
	}
	return cfg
}

// testConnection 尝试用提供的参数连接数据库,Ping 通即关闭,不持久化任何东西。
func testConnection(req setupRequest) error {
	cfg := req.toConfig()
	gormDB, err := openGORMFromConfig(cfg)
	if err != nil {
		return err
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		return fmt.Errorf("获取底层 sql.DB 失败: %v", err)
	}
	defer sqlDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("数据库连接测试失败: %v", err)
	}
	return nil
}

// runSetupInitialize 是 setup 一条龙的核心。按顺序执行:
//  1. 用提供的参数打开 DB + Ping
//  2. AutoMigrate 建所有表
//  3. 用 admin 凭据写第一个管理员
//  4. 把数据库参数合并写入项目根目录的 .env
//
// 前 3 步在 DB 端持久化,只有都成功才会落盘 .env。
// .env 一旦落盘下次重启就会进 Ready 模式;若 .env 落盘失败,
// 数据库里的表和管理员账号会保留,用户可手工创建 .env 后重启。
func runSetupInitialize(req setupRequest) error {
	if req.Admin.Username == "" || req.Admin.Password == "" {
		return fmt.Errorf("管理员账号和密码不能为空")
	}

	cfg := req.toConfig()

	// 1. 打开数据库
	gormDB, err := openGORMFromConfig(cfg)
	if err != nil {
		return err
	}
	sqlDB, err := gormDB.DB()
	if err != nil {
		return fmt.Errorf("获取底层 sql.DB 失败: %v", err)
	}
	defer sqlDB.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("数据库连接测试失败: %v", err)
	}

	// 2. AutoMigrate
	if err := dbPkg.AutoMigrate(gormDB); err != nil {
		return fmt.Errorf("建表失败: %v", err)
	}

	// 3. 写管理员账号
	authSvc := auth.NewService(gormDB)
	if err := authSvc.InitializeSystemWithCredentials(req.Admin.Username, req.Admin.Password); err != nil {
		return fmt.Errorf("创建管理员失败: %v", err)
	}

	// 4. 合并写入 .env(保留用户已有行,只替换/追加受管理的 KEY)
	if err := cfg.SaveToEnvFile(dbPkg.EnvFileName); err != nil {
		return fmt.Errorf("写入 %s 失败: %v", dbPkg.EnvFileName, err)
	}

	log.Info("[Setup]数据库初始化、管理员账号创建、.env 配置已就绪,等待重启")
	return nil
}

// openGORMFromConfig 根据 DBConfig 打开一个**独立**的 GORM 实例(不污染全局)。
// 与 db.openGORM 行为一致,但故意不复用 sync.Once 包裹的 GetDB:
// setup 模式需要每次试探连接,失败时不能让 sync.Once 锁住后续重试。
func openGORMFromConfig(cfg dbPkg.DBConfig) (*gorm.DB, error) {
	switch cfg.Driver {
	case dialect.NameSQLite, "sqlite3":
		dsn := cfg.BuildSQLiteDSN()
		// 确保父目录存在(SQLite 路径可能含子目录)
		if dir := filepath.Dir(cfg.Database); dir != "" && dir != "." {
			_ = os.MkdirAll(dir, 0o755)
		}
		sqlDB, err := sql.Open("sqlite3", dsn)
		if err != nil {
			return nil, fmt.Errorf("打开 SQLite 失败: %v", err)
		}
		return gorm.Open(gormsqlite.Dialector{Conn: sqlDB}, &gorm.Config{})

	case dialect.NamePostgres, "postgresql", "pg":
		dsn := cfg.BuildPostgresDSN()
		return gorm.Open(gormpg.Open(dsn), &gorm.Config{})
	}
	return nil, fmt.Errorf("不支持的 driver: %q", cfg.Driver)
}

// gracefulShutdownHTTP 仅关闭 HTTP server(setup 模式没有其他需要清理的资源)。
func gracefulShutdownHTTP(server *http.Server) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Errorf("Setup HTTP 服务器关闭错误: %v", err)
	}
}
