package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/group"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/middleware"
	"NodePassDash/internal/services"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"NodePassDash/internal/websocket"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SetupRouter 创建并配置主路由器
func SetupRouter(db *gorm.DB, sseService *sse.Service, sseManager *sse.Manager, wsService *websocket.Service, version string) *gin.Engine {
	r := gin.Default()

	// 全局中间件
	r.Use(corsMiddleware())

	// 健康检查
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Setup 状态探测(Ready 模式下也响应)
	// 与 cmd/server/setup.go 中 Setup 模式下的同名路由形成统一约定,
	// 前端启动时无论后端在哪个模式都能拿到一致的 JSON 形状。
	r.GET("/api/setup/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"initialized": true,
			"setup_mode":  false,
			"version":     version,
		})
	})

	// 防御深度:在 Ready 模式下,Setup 的 POST 路由必须显式返回 403。
	// 否则攻击者扫到这些路径会拿到 200 + index.html(SPA fallback),
	// 看起来像是路径存在,容易误导扫描脚本与安全审计工具。
	setupAlreadyCompleted := func(c *gin.Context) {
		c.JSON(http.StatusForbidden, gin.H{
			"error":       "setup_already_completed",
			"description": "数据库已初始化,Setup 向导不再可用。要重新初始化,请删除项目根目录 .env 后重启服务。",
		})
	}
	r.POST("/api/setup/test-connection", setupAlreadyCompleted)
	r.POST("/api/setup/initialize", setupAlreadyCompleted)

	// 文档代理路由
	r.Any("/docs-proxy/*path", docsProxyHandler)

	// API路由
	setupAPIRoutes(r, db, sseService, sseManager, wsService, version)

	return r
}

// setupAPIRoutes 设置API路由
func setupAPIRoutes(r *gin.Engine, db *gorm.DB, sseService *sse.Service, sseManager *sse.Manager, wsService *websocket.Service, version string) {
	apiGroup := r.Group("/api")
	{
		// 创建服务实例
		authService := auth.NewService(db)
		endpointService := endpoint.NewService(db)
		tunnelService := tunnel.NewService(db)
		groupService := group.NewService(db)
		servicesService := services.NewService(db, tunnelService, sseManager)
		dashboardService := dashboard.NewService(db)

		// 创建 Metrics 系统相关的处理器
		metricsAggregator := metrics.NewMetricsAggregator(db)
		sseProcessor := metrics.NewSSEProcessor(metricsAggregator)

		// 设置认证路由（包含公开和受保护的路由）
		api.SetupAuthRoutes(apiGroup, authService)

		// 创建认证中间件
		authMiddleware := middleware.AuthMiddleware(authService)

		// 创建受保护的路由组（所有业务 API 都需要认证）
		protectedGroup := apiGroup.Group("")
		protectedGroup.Use(authMiddleware)
		{
			// 设置各模块的受保护路由
			api.SetupEndpointRoutes(protectedGroup, endpointService, sseManager)
			api.SetupTunnelRoutes(protectedGroup, tunnelService, sseManager, sseProcessor)
			api.SetupSSERoutes(protectedGroup, sseService, sseManager)
			api.SetupWebSocketRoutes(protectedGroup, wsService)
			api.SetupDashboardRoutes(protectedGroup, dashboardService)
			api.SetupDataRoutes(protectedGroup, db, sseManager, endpointService, tunnelService)
			api.SetupGroupRoutes(protectedGroup, groupService)
			api.SetupServicesRoutes(protectedGroup, servicesService, tunnelService)
			api.SetupVersionRoutes(protectedGroup, version)
			api.SetupDebugRoutes(protectedGroup)
		}
	}
}

// docsProxyHandler 文档代理处理器
func docsProxyHandler(c *gin.Context) {
	// 获取路径参数
	path := c.Param("path")

	// 构建目标 URL
	targetURL := fmt.Sprintf("https://raw.githubusercontent.com%s", path)

	// 创建 HTTP 客户端
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// 创建请求
	req, err := http.NewRequest(c.Request.Method, targetURL, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建请求失败"})
		return
	}

	// 复制请求头（排除某些不需要的头）
	for name, values := range c.Request.Header {
		if !shouldSkipHeader(name) {
			for _, value := range values {
				req.Header.Add(name, value)
			}
		}
	}

	// 发送请求
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "代理请求失败"})
		return
	}
	defer resp.Body.Close()

	// 复制响应头
	for name, values := range resp.Header {
		if !shouldSkipHeader(name) {
			for _, value := range values {
				c.Header(name, value)
			}
		}
	}

	// 设置状态码
	c.Status(resp.StatusCode)

	// 复制响应体
	_, err = io.Copy(c.Writer, resp.Body)
	if err != nil {
		// 日志记录错误，但不再发送响应（因为已经开始写入）
		fmt.Printf("复制响应体失败: %v\n", err)
	}
}

// shouldSkipHeader 检查是否应该跳过某些头部
func shouldSkipHeader(name string) bool {
	skipHeaders := []string{
		"Connection",
		"Proxy-Connection",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailers",
		"Transfer-Encoding",
		"Upgrade",
	}

	for _, skip := range skipHeaders {
		if strings.EqualFold(name, skip) {
			return true
		}
	}
	return false
}

// corsMiddleware CORS中间件
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// 如果带 Origin 头，则回显；否则允许所有
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		} else {
			c.Header("Access-Control-Allow-Origin", "*")
		}

		c.Header("Access-Control-Allow-Credentials", "true")

		// 回显浏览器预检要求的 Headers，如果没有则给常用默认值
		reqHeaders := c.GetHeader("Access-Control-Request-Headers")
		if reqHeaders == "" {
			reqHeaders = "Content-Type, Authorization"
		}
		c.Header("Access-Control-Allow-Headers", reqHeaders)

		// 同理回显预检方法，或允许常见方法
		reqMethod := c.GetHeader("Access-Control-Request-Method")
		if reqMethod == "" {
			reqMethod = "GET, POST, PUT, PATCH, DELETE"
		}
		c.Header("Access-Control-Allow-Methods", reqMethod)

		// 预检结果缓存 12 小时，减少重复 OPTIONS
		c.Header("Access-Control-Max-Age", "43200")

		// 预检请求直接返回
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusOK)
			return
		}

		c.Next()
	}
}
