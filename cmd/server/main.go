package main

import (
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	dbPkg "NodePassDash/internal/db"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/router"

	// "NodePassDash/internal/lifecycle"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"NodePassDash/internal/websocket"
	"archive/zip"
	"context"
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

	"github.com/gin-gonic/gin"
)

// Version 会在构建时通过 -ldflags "-X main.Version=xxx" 注入
var Version = "dev"

//go:embed dist.zip
var distZip embed.FS

// extractDistIfNeeded 如果当前目录没有 dist 文件夹则解压嵌入的 zip
func extractDistIfNeeded() error {
	// 检查 dist 目录是否已存在
	if _, err := os.Stat("dist"); err == nil {
		log.Debug("dist 目录已存在，跳过解压")
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
	versionFlag := flag.Bool("version", false, "显示版本信息")
	vFlag := flag.Bool("v", false, "显示版本信息")
	logLevelFlag := flag.String("log-level", "", "设置日志级别 (DEBUG, INFO, WARN, ERROR)")
	// TLS 证书相关参数
	tlsCertFlag := flag.String("cert", "", "TLS 证书文件路径")
	tlsKeyFlag := flag.String("key", "", "TLS 私钥文件路径")
	// 禁用用户名密码登录参数
	disableLoginFlag := flag.Bool("disable-login", false, "禁用用户名密码登录，仅允许 OAuth2 登录")

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

	// 如果指定了版本参数，显示版本信息后退出
	if *versionFlag || *vFlag {
		fmt.Printf("NodePassDash %s\n", Version)
		fmt.Printf("Go version: %s\n", runtime.Version())
		fmt.Printf("OS/Arch: %s/%s\n", runtime.GOOS, runtime.GOARCH)
		return
	}

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
		// 获取GORM数据库连接
		gormDB := dbPkg.GetDB()
		authService := auth.NewService(gormDB)
		if _, _, err := authService.ResetAdminPassword(); err != nil {
			log.Errorf("重置密码失败: %v", err)
		}
		return
	}

	// 获取GORM数据库连接
	gormDB := dbPkg.GetDB()
	defer func() {
		if err := dbPkg.Close(); err != nil {
			log.Errorf("关闭数据库连接失败: %v", err)
		}
	}()

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
		log.Errorf("获取底层sql.DB失败: %v", err)
		return
	}
	sseManager := sse.NewManager(sqlDB, sseService)

	// 设置Manager引用到Service（避免循环依赖）
	sseService.SetManager(sseManager)

	// 创建WebSocket服务
	wsService := websocket.NewService()

	// 设置WebSocket服务的tunnel service依赖
	wsService.SetTunnelService(tunnelService)

	// 延迟启动SSE组件和流量调度器
	var trafficScheduler *dashboard.TrafficScheduler

	// 使用 Gin 路由器 - 标准Go项目结构
	log.Info("使用 Gin 路由器 (标准架构)")
	gin.SetMode(gin.ReleaseMode) // 设置为生产模式

	ginRouter := router.SetupRouter(gormDB, sseService, sseManager, wsService)

	// 添加静态文件服务
	ginRouter.Static("/assets", "dist/assets")               // 静态资源
	ginRouter.StaticFile("/favicon.ico", "dist/favicon.ico") // favicon
	ginRouter.NoRoute(func(c *gin.Context) {
		// SPA 支持：如果是API路由但未找到，返回404；否则返回index.html
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(404, gin.H{"error": "API route not found"})
			return
		}
		// 其他路径返回 index.html 支持 SPA
		c.File("dist/index.html")
	})

	// 读取端口：命令行 > 环境变量 > 默认值
	port := "3000"
	if env := os.Getenv("PORT"); env != "" {
		port = env
	}
	if *portFlag != "" {
		port = *portFlag
	}

	// ------------------- 处理 TLS 证书 -------------------
	certFile := *tlsCertFlag
	keyFile := *tlsKeyFlag
	if certFile == "" {
		certFile = os.Getenv("TLS_CERT")
	}
	if keyFile == "" {
		keyFile = os.Getenv("TLS_KEY")
	}

	// 组合监听地址
	addr := fmt.Sprintf(":%s", port)

	// 创建上下文和取消函数
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 系统初始化已在上面完成，此处删除重复

	// 设置 disable-login 配置
	// 优先级：命令行参数 > 环境变量
	shouldDisableLogin := *disableLoginFlag
	if !shouldDisableLogin {
		if env := os.Getenv("DISABLE_LOGIN"); env == "true" || env == "1" {
			shouldDisableLogin = true
		}
	}

	// 始终设置 disable_login 配置以确保状态一致性
	if shouldDisableLogin {
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

	// 等待服务器启动完成，然后启动后台服务
	time.Sleep(2 * time.Second)

	// 启动流量调度器（用于优化流量数据查询性能）
	trafficScheduler = dashboard.NewTrafficScheduler(gormDB)
	go func() {
		trafficScheduler.Start()
		log.Info("流量数据优化调度器已启动")
	}()

	// 启动SSE相关服务
	go func() {
		sseService.StartStoreWorkers(4) // 减少worker数量
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

	// 记录未使用的变量以避免编译错误
	_ = authService
	_ = endpointService
	_ = tunnelService
	_ = dashboardService
	_ = sseService
	_ = sseManager
	_ = trafficScheduler
	_ = wsService
	_ = ctx

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

	// 关闭流量调度器
	if trafficScheduler != nil {
		trafficScheduler.Stop()
	}

	// 关闭WebSocket系统
	if wsService != nil {
		wsService.Stop()
	}

	// 关闭SSE系统
	if sseManager != nil {
		sseManager.Close()
	}
	if sseService != nil {
		sseService.Close()
	}

	// 优雅关闭HTTP服务器
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Errorf("服务器关闭错误: %v", err)
	}

	log.Infof("服务器已关闭")
}

// ensureDir 确保目录存在，如果不存在则创建
func ensureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		log.Infof("创建目录: %s", dir)
		return os.MkdirAll(dir, 0755)
	}
	return nil
}
