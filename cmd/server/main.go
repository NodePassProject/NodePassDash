package main

import (
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	dbPkg "NodePassDash/internal/db"
	"NodePassDash/internal/endpoint"
	// "NodePassDash/internal/lifecycle"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/router"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"NodePassDash/internal/websocket"
	"context"
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Version 会在构建时通过 -ldflags "-X main.Version=xxx" 注入
var Version = "dev"

//go:embed dist
var distFS embed.FS

// serveStaticFile 从嵌入文件系统中提供静态文件
func serveStaticFile(c *gin.Context, fsys fs.FS, fileName, contentType string) {
	fileData, err := fsys.Open(fileName)
	if err != nil {
		c.Status(404)
		return
	}
	defer fileData.Close()

	stat, err := fileData.Stat()
	if err != nil {
		c.Status(500)
		return
	}

	c.DataFromReader(200, stat.Size(), contentType, fileData, nil)
}

// parseFlags 解析命令行参数并处理基础配置
func parseFlags() (resetPwd bool, port, certFile, keyFile string, showVersion, disableLogin, sseDebugLog bool) {
	// 命令行参数处理
	resetPwdCmd := flag.Bool("resetpwd", false, "重置管理员密码")
	portFlag := flag.String("port", "", "HTTP 服务端口 (优先级高于环境变量 PORT)，默认 3000")
	versionFlag := flag.Bool("version", false, "显示版本信息")
	vFlag := flag.Bool("v", false, "显示版本信息")
	logLevelFlag := flag.String("log-level", "", "设置日志级别 (DEBUG, INFO, WARN, ERROR)")
	// TLS 证书相关参数
	tlsCertFlag := flag.String("cert", "", "TLS 证书文件路径")
	tlsKeyFlag := flag.String("key", "", "TLS 私钥文件路径")
	// 禁用用户名密码登录参数
	disableLoginFlag := flag.Bool("disable-login", false, "禁用用户名密码登录，仅允许 OAuth2 登录")
	// SSE 调试日志参数
	sseDebugLogFlag := flag.Bool("sse-debug-log", false, "启用 SSE 消息调试日志")

	flag.Parse()

	// 设置日志级别
	logLevel := *logLevelFlag
	if logLevel == "" {
		logLevel = os.Getenv("LOG-LEVEL")
	}
	if logLevel == "" {
		logLevel = "info"
	}
	if err := log.SetLogLevel(logLevel); err != nil {
		log.Errorf("设置日志级别失败: %v", err)
	}

	// 读取端口：命令行 > 环境变量 > 默认值
	port = "3000"
	if env := os.Getenv("PORT"); env != "" {
		port = env
	}
	if *portFlag != "" {
		port = *portFlag
	}

	// ------------------- 处理 TLS 证书 -------------------
	certFile = *tlsCertFlag
	keyFile = *tlsKeyFlag
	if certFile == "" {
		certFile = os.Getenv("TLS_CERT")
	}
	if keyFile == "" {
		keyFile = os.Getenv("TLS_KEY")
	}

	// 设置 disable-login 配置
	// 优先级：命令行参数 > 环境变量
	disableLogin = *disableLoginFlag
	if !disableLogin {
		if env := os.Getenv("DISABLE_LOGIN"); env == "true" || env == "1" {
			disableLogin = true
		}
	}

	// 设置 SSE 调试日志配置
	// 优先级：命令行参数 > 环境变量
	sseDebugLog = *sseDebugLogFlag
	if !sseDebugLog {
		if env := os.Getenv("SSE_DEBUG_LOG"); env == "true" || env == "1" {
			sseDebugLog = true
		}
	}

	return *resetPwdCmd, port, certFile, keyFile, *versionFlag || *vFlag, disableLogin, sseDebugLog
}

// setupStaticFiles 配置静态文件服务
func setupStaticFiles(ginRouter *gin.Engine) error {
	// 添加静态文件服务
	// 创建 dist 子文件系统
	distSubFS, err := fs.Sub(distFS, "dist")
	if err != nil {
		return fmt.Errorf("创建 dist 子文件系统失败: %v", err)
	}

	// 创建 assets 子文件系统（用于 JS/CSS 等构建资源）
	assetsSubFS, err := fs.Sub(distSubFS, "assets")
	if err != nil {
		return fmt.Errorf("创建 assets 子文件系统失败: %v", err)
	}

	// JS/CSS 等构建资源
	ginRouter.StaticFS("/assets", http.FS(assetsSubFS))

	// 处理根目录的静态文件（favicon, logo 等）
	ginRouter.GET("/favicon.ico", func(c *gin.Context) {
		serveStaticFile(c, distSubFS, "favicon.ico", "image/x-icon")
	})

	// 具体处理已知的 SVG 文件
	svgFiles := []string{
		"nodepass-logo-1.svg",
		"nodepass-logo-2.svg",
		"nodepass-logo-3.svg",
		"cloudflare-svgrepo-com.svg",
		"github-icon-svgrepo-com.svg",
		"vite.svg",
	}

	for _, svgFile := range svgFiles {
		svgFile := svgFile // 避免闭包问题
		ginRouter.GET("/"+svgFile, func(c *gin.Context) {
			serveStaticFile(c, distSubFS, svgFile, "image/svg+xml")
		})
	}

	ginRouter.NoRoute(func(c *gin.Context) {
		// SPA 支持：如果是API路由但未找到，返回404；否则返回index.html
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(404, gin.H{"error": "API route not found"})
			return
		}
		// 其他路径返回 index.html 支持 SPA
		indexData, err := distSubFS.Open("index.html")
		if err != nil {
			c.String(500, "Failed to load index.html")
			return
		}
		defer indexData.Close()

		stat, err := indexData.Stat()
		if err != nil {
			c.String(500, "Failed to get index.html info")
			return
		}

		c.DataFromReader(200, stat.Size(), "text/html; charset=utf-8", indexData, nil)
	})

	return nil
}

// initializeServices 初始化所有服务
func initializeServices(sseDebugLog bool) (*gorm.DB, *auth.Service, *endpoint.Service, *tunnel.Service, *dashboard.Service, *sse.Service, *sse.Manager, *websocket.Service, error) {
	// 获取GORM数据库连接
	gormDB := dbPkg.GetDB()
	log.Info("数据库连接成功")

	// 系统初始化（首次启动输出初始用户名和密码） - 在所有其他初始化之前
	authService := auth.NewService(gormDB)
	if _, _, err := authService.InitializeSystem(); err != nil && err.Error() != "系统已初始化" {
		log.Errorf("系统初始化失败: %v", err)
	}

	// 初始化端点缓存
	if err := nodepass.InitializeCache(gormDB); err != nil {
		log.Errorf("初始化端点缓存失败: %v", err)
	} else {
		log.Infof("端点缓存初始化成功，加载了 %d 个端点", nodepass.GetCache().Count())
	}

	// 初始化其他服务
	endpointService := endpoint.NewService(gormDB)
	tunnelService := tunnel.NewService(gormDB)
	dashboardService := dashboard.NewService(gormDB)

	// 创建SSE服务和管理器（延迟启动避免数据库竞争）
	sseService := sse.NewService(gormDB, endpointService)
	// 临时解决方案：从GORM获取底层的sql.DB用于SSE Manager
	sqlDB, err := gormDB.DB()
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, fmt.Errorf("获取底层sql.DB失败: %v", err)
	}
	sseManager := sse.NewManager(sqlDB, sseService, sseDebugLog)

	// 设置Manager引用到Service（避免循环依赖）
	sseService.SetManager(sseManager)

	// 创建WebSocket服务
	wsService := websocket.NewService()

	// 设置WebSocket服务的tunnel service依赖
	wsService.SetTunnelService(tunnelService)

	return gormDB, authService, endpointService, tunnelService, dashboardService, sseService, sseManager, wsService, nil
}

// startHTTPServer 启动HTTP/HTTPS服务器
func startHTTPServer(ginRouter *gin.Engine, port, certFile, keyFile string) *http.Server {
	// 组合监听地址
	addr := fmt.Sprintf(":%s", port)

	// 创建HTTP服务器
	server := &http.Server{
		Addr:    addr,
		Handler: ginRouter,
	}

	// 启动HTTP/HTTPS服务器
	go func() {
		if certFile != "" && keyFile != "" {
			log.Infof("NodePassDash[%s] 启动在 https://localhost:%s (TLS)", Version, port)
			if err := server.ListenAndServeTLS(certFile, keyFile); err != http.ErrServerClosed {
				log.Errorf("HTTPS 服务器错误: %v", err)
			}
			return
		}

		log.Infof("NodePassDash[%s] 启动在 http://localhost:%s", Version, port)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Errorf("HTTP 服务器错误: %v", err)
		}
	}()

	return server
}

// startBackgroundServices 启动后台服务
func startBackgroundServices(gormDB *gorm.DB, sseService *sse.Service, sseManager *sse.Manager, wsService *websocket.Service) *dashboard.TrafficScheduler {
	// 启动流量调度器（用于优化流量数据查询性能）
	trafficScheduler := dashboard.NewTrafficScheduler(gormDB)
	go func() {
		trafficScheduler.Start()
		log.Info("流量数据优化调度器已启动")
	}()

	// 启动SSE相关服务
	go func() {
		sseManager.StartDaemon()

		// 初始化SSE系统
		if err := sseManager.InitializeSystem(); err != nil {
			log.Errorf("初始化SSE系统失败: %v", err)
		}
		log.Info("SSE系统已启动")
	}()

	// 启动WebSocket服务
	go func() {
		wsService.Start()
		log.Info("WebSocket系统已启动")
	}()

	return trafficScheduler
}

// gracefulShutdown 优雅关闭服务
func gracefulShutdown(server *http.Server, trafficScheduler *dashboard.TrafficScheduler, wsService *websocket.Service, sseManager *sse.Manager, sseService *sse.Service) {
	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	// 关闭服务
	log.Infof("正在关闭服务器...")

	// 关闭增强系统（暂时注释掉）
	// if err := lifecycleManager.Shutdown(); err != nil {
	// 	log.Errorf("增强系统关闭失败: %v", err)
	// }

	// 2. 关闭流量调度器
	if trafficScheduler != nil {
		trafficScheduler.Stop()
	}

	// 3. 关闭WebSocket系统
	if wsService != nil {
		wsService.Stop()
	}

	// 4. 关闭SSE系统
	if sseManager != nil {
		sseManager.Close()
	}
	if sseService != nil {
		sseService.Close()
	}

	// 5. 优雅关闭HTTP服务器
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Errorf("服务器关闭错误: %v", err)
	}

	log.Infof("✅ 服务器已安全关闭")
}

func main() {
	resetPwd, port, certFile, keyFile, showVersion, disableLogin, sseDebugLog := parseFlags()

	// 如果指定了版本参数，显示版本信息后退出
	if showVersion {
		fmt.Printf("NodePassDash %s\n", Version)
		fmt.Printf("Go version: %s\n", runtime.Version())
		fmt.Printf("OS/Arch: %s/%s\n", runtime.GOOS, runtime.GOARCH)
		return
	}

	// 如果指定了 --resetpwd，则进入密码重置流程后退出
	if resetPwd {
		// 获取GORM数据库连接
		gormDB := dbPkg.GetDB()
		authService := auth.NewService(gormDB)
		if _, _, err := authService.ResetAdminPassword(); err != nil {
			log.Errorf("重置密码失败: %v", err)
		}
		return
	}

	// 初始化所有服务
	gormDB, authService, endpointService, tunnelService, dashboardService, sseService, sseManager, wsService, err := initializeServices(sseDebugLog)
	if err != nil {
		log.Errorf("服务初始化失败: %v", err)
		return
	}
	defer func() {
		if err := dbPkg.Close(); err != nil {
			log.Errorf("关闭数据库连接失败: %v", err)
		}
	}()

	// 延迟启动SSE组件和流量调度器
	var trafficScheduler *dashboard.TrafficScheduler

	// 使用 Gin 路由器 - 标准Go项目结构
	log.Info("使用 Gin 路由器 (标准架构)")
	gin.SetMode(gin.ReleaseMode) // 设置为生产模式

	ginRouter := router.SetupRouter(gormDB, sseService, sseManager, wsService, Version)

	// 配置静态文件服务
	if err := setupStaticFiles(ginRouter); err != nil {
		log.Errorf("配置静态文件服务失败: %v", err)
		return
	}

	// 创建上下文和取消函数
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 始终设置 disable_login 配置以确保状态一致性
	if disableLogin {
		if err := authService.SetSystemConfig("disable_login", "true"); err != nil {
			log.Errorf("设置 disable-login 配置失败: %v", err)
		} else {
			log.Infof("已启用 disable-login 模式，仅允许 OAuth2 登录")
		}
	} else {
		// 如果没有启用 disable-login，确保数据库中的值为 false
		if err := authService.SetSystemConfig("disable_login", "false"); err != nil {
			log.Errorf("重置 disable-login 配置失败: %v", err)
		}
	}

	// 启动SSE系统
	if err := sseManager.InitializeSystem(); err != nil {
		log.Errorf("初始化SSE系统失败: %v", err)
	}

	// 启动HTTP/HTTPS服务器
	server := startHTTPServer(ginRouter, port, certFile, keyFile)

	// 等待服务器启动完成，然后启动后台服务
	time.Sleep(2 * time.Second)

	// 启动后台服务
	trafficScheduler = startBackgroundServices(gormDB, sseService, sseManager, wsService)

	// 记录未使用的变量以避免编译错误
	_ = authService
	_ = endpointService
	_ = tunnelService
	_ = dashboardService
	_ = ctx

	// 优雅关闭服务
	gracefulShutdown(server, trafficScheduler, wsService, sseManager, sseService)
}
