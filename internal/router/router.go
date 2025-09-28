package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/group"
	"NodePassDash/internal/metrics"
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
		dashboardService := dashboard.NewService(db)

		// 创建 Metrics 系统相关的处理器
		metricsAggregator := metrics.NewMetricsAggregator(db)
		sseProcessor := metrics.NewSSEProcessor(metricsAggregator)

		// 设置各模块的路由
		api.SetupAuthRoutes(apiGroup, authService)
		api.SetupEndpointRoutes(apiGroup, endpointService, sseManager)
		api.SetupTunnelRoutes(apiGroup, tunnelService, sseManager, sseProcessor)
		api.SetupSSERoutes(apiGroup, sseService, sseManager)
		api.SetupWebSocketRoutes(apiGroup, wsService)
		api.SetupDashboardRoutes(apiGroup, dashboardService)
		api.SetupDataRoutes(apiGroup, db, sseManager, endpointService, tunnelService)
		api.SetupGroupRoutes(apiGroup, groupService)
		api.SetupVersionRoutes(apiGroup, version)
		api.SetupDebugRoutes(apiGroup)
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
