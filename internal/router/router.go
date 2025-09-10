package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tag"
	"NodePassDash/internal/tunnel"
	"NodePassDash/internal/websocket"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SetupRouter 创建并配置主路由器
func SetupRouter(db *gorm.DB, sseService *sse.Service, sseManager *sse.Manager, wsService *websocket.Service) *gin.Engine {
	r := gin.Default()

	// 全局中间件
	r.Use(corsMiddleware())

	// 健康检查
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API路由
	setupAPIRoutes(r, db, sseService, sseManager, wsService)

	return r
}

// setupAPIRoutes 设置API路由
func setupAPIRoutes(r *gin.Engine, db *gorm.DB, sseService *sse.Service, sseManager *sse.Manager, wsService *websocket.Service) {
	apiGroup := r.Group("/api")
	{
		// 创建服务实例
		authService := auth.NewService(db)
		endpointService := endpoint.NewService(db)
		tunnelService := tunnel.NewService(db)
		tagService := tag.NewService(db)
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
		api.SetupTagRoutes(apiGroup, tagService)
		api.SetupVersionRoutes(apiGroup)
	}
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
