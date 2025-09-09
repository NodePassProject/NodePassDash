package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/dashboard"

	"github.com/gin-gonic/gin"
)

// setupDashboardRoutes 设置仪表盘相关路由
func setupDashboardRoutes(rg *gin.RouterGroup, dashboardService *dashboard.Service) {
	// 创建DashboardHandler实例
	dashboardHandler := api.NewDashboardHandler(dashboardService)

	// 仪表盘流量趋势
	rg.GET("/dashboard/traffic-trend", dashboardHandler.HandleTrafficTrend)

	// 仪表盘统计数据
	rg.GET("/dashboard/stats", dashboardHandler.HandleGetStats)
	rg.GET("/dashboard/tunnel-stats", dashboardHandler.HandleGetTunnelStats)
	rg.GET("/dashboard/overall-stats", dashboardHandler.HandleGetOverallStats)
}
