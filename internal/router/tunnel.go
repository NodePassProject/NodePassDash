package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"

	"github.com/gin-gonic/gin"
)

// setupTunnelRoutes 设置隧道相关路由
func setupTunnelRoutes(rg *gin.RouterGroup, tunnelService *tunnel.Service, sseManager *sse.Manager, sseProcessor *metrics.SSEProcessor) {
	// 创建TunnelHandler实例
	tunnelHandler := api.NewTunnelHandler(tunnelService, sseManager)
	tunnelMetricsHandler := api.NewTunnelMetricsHandler(tunnelService, sseProcessor)

	// 实例相关路由
	rg.GET("/endpoints/:endpointId/instances", httpToGin(tunnelHandler.HandleGetInstances))
	rg.GET("/endpoints/:endpointId/instances/:instanceId", httpToGin(tunnelHandler.HandleGetInstance))
	rg.POST("/endpoints/:endpointId/instances/:instanceId/control", httpToGin(tunnelHandler.HandleControlInstance))

	// 隧道相关路由
	rg.GET("/tunnels", httpToGin(tunnelHandler.HandleGetTunnels))
	rg.POST("/tunnels", httpToGin(tunnelHandler.HandleCreateTunnel))
	rg.POST("/tunnels/batch", httpToGin(tunnelHandler.HandleBatchCreateTunnels))
	rg.POST("/tunnels/batch-new", httpToGin(tunnelHandler.HandleNewBatchCreateTunnels))
	rg.DELETE("/tunnels/batch", httpToGin(tunnelHandler.HandleBatchDeleteTunnels))
	rg.POST("/tunnels/batch/action", httpToGin(tunnelHandler.HandleBatchActionTunnels))
	rg.POST("/tunnels/create_by_url", httpToGin(tunnelHandler.HandleQuickCreateTunnel))
	rg.POST("/tunnels/quick-batch", httpToGin(tunnelHandler.HandleQuickBatchCreateTunnel))
	rg.POST("/tunnels/template", httpToGin(tunnelHandler.HandleTemplateCreate))
	rg.PATCH("/tunnels", httpToGin(tunnelHandler.HandlePatchTunnels))
	rg.PATCH("/tunnels/:id", httpToGin(tunnelHandler.HandlePatchTunnels))
	rg.PATCH("/tunnels/:id/attributes", httpToGin(tunnelHandler.HandlePatchTunnelAttributes))
	rg.PATCH("/tunnels/:id/restart", httpToGin(tunnelHandler.HandleSetTunnelRestart))
	rg.GET("/tunnels/:id", httpToGin(tunnelHandler.HandleGetTunnels))
	rg.PUT("/tunnels/:id", httpToGin(tunnelHandler.HandleUpdateTunnelV2))
	rg.DELETE("/tunnels/:id", httpToGin(tunnelHandler.HandleDeleteTunnel))
	rg.PATCH("/tunnels/:id/status", httpToGin(tunnelHandler.HandleControlTunnel))
	rg.POST("/tunnels/:id/action", httpToGin(tunnelHandler.HandleControlTunnel))
	rg.GET("/tunnels/:id/details", httpToGin(tunnelHandler.HandleGetTunnelDetails))
	rg.GET("/tunnels/:id/logs", httpToGin(tunnelHandler.HandleTunnelLogs))
	rg.GET("/tunnels/:id/traffic-trend", httpToGin(tunnelHandler.HandleGetTunnelTrafficTrend))
	rg.GET("/tunnels/:id/ping-trend", httpToGin(tunnelHandler.HandleGetTunnelPingTrend))
	rg.GET("/tunnels/:id/pool-trend", httpToGin(tunnelHandler.HandleGetTunnelPoolTrend))
	rg.GET("/tunnels/:id/export-logs", httpToGin(tunnelHandler.HandleExportTunnelLogs))

	// 新的统一 metrics 趋势接口 - 基于 ServiceHistory 表，使用 instanceId
	rg.GET("/tunnels/:instanceId/metrics-trend", tunnelMetricsHandler.HandleGetTunnelMetricsTrend)

	// 隧道日志相关路由（使用dashboard路径但由tunnel handler处理）
	rg.GET("/dashboard/logs", httpToGin(tunnelHandler.HandleGetTunnelLogs))
	rg.DELETE("/dashboard/logs", httpToGin(tunnelHandler.HandleClearTunnelLogs))
}
