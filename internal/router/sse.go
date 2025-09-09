package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/sse"

	"github.com/gin-gonic/gin"
)

// setupSSERoutes 设置SSE相关路由
func setupSSERoutes(rg *gin.RouterGroup, sseService *sse.Service, sseManager *sse.Manager) {
	// 创建SSEHandler实例
	sseHandler := api.NewSSEHandler(sseService, sseManager)

	// SSE 相关路由
	rg.GET("/sse/tunnel/:tunnelId", httpToGin(sseHandler.HandleTunnelSSE))      // 实例详情页用
	rg.GET("/sse/nodepass-proxy", httpToGin(sseHandler.HandleNodePassSSEProxy)) // 主控详情页代理用
	rg.POST("/sse/test", httpToGin(sseHandler.HandleTestSSEEndpoint))           // 添加主控的时候 测试sse是否通用

	// 日志清理相关路由
	rg.GET("/sse/log-cleanup/stats", httpToGin(sseHandler.HandleLogCleanupStats))
	rg.GET("/sse/log-cleanup/config", httpToGin(sseHandler.HandleLogCleanupConfig))
	rg.POST("/sse/log-cleanup/config", httpToGin(sseHandler.HandleLogCleanupConfig))
	rg.POST("/sse/log-cleanup/trigger", httpToGin(sseHandler.HandleTriggerLogCleanup))
}
