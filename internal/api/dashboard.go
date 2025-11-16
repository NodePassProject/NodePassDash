package api

import (
	"NodePassDash/internal/dashboard"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// DashboardHandler 仪表盘相关的处理器
type DashboardHandler struct {
	dashboardService *dashboard.Service
}

// NewDashboardHandler 创建仪表盘处理器实例
func NewDashboardHandler(dashboardService *dashboard.Service) *DashboardHandler {
	return &DashboardHandler{
		dashboardService: dashboardService,
	}
}

// setupDashboardRoutes 设置仪表盘相关路由
func SetupDashboardRoutes(rg *gin.RouterGroup, dashboardService *dashboard.Service) {
	// 创建DashboardHandler实例
	dashboardHandler := NewDashboardHandler(dashboardService)

	// 仪表盘流量趋势
	rg.GET("/dashboard/traffic-trend", dashboardHandler.HandleTrafficTrend)

	// 仪表盘统计数据
	rg.GET("/dashboard/stats", dashboardHandler.HandleGetStats)
	rg.GET("/dashboard/tunnel-stats", dashboardHandler.HandleGetTunnelStats)

	// 每周流量统计
	rg.GET("/dashboard/weekly-stats", dashboardHandler.HandleWeeklyStats)

	//rg.GET("/dashboard/overall-stats", dashboardHandler.HandleGetOverallStats)
}

// HandleGetOverallStats 获取总体统计数据
func (h *DashboardHandler) HandleGetOverallStats(c *gin.Context) {

	// 获取总体统计数据
	var stats struct {
		TotalEndpoints int64   `json:"total_endpoints"`
		TotalTunnels   int64   `json:"total_tunnels"`
		TotalTraffic   float64 `json:"total_traffic"` // 单位：GB
		CurrentSpeed   float64 `json:"current_speed"` // 单位：MB/s
	}

	// 获取主控总数
	if err := h.dashboardService.DB().Raw("SELECT COUNT(*) FROM endpoints").Scan(&stats.TotalEndpoints).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "获取主控总数失败: " + err.Error(),
		})
		return
	}

	// 获取实例总数
	if err := h.dashboardService.DB().Raw("SELECT COUNT(*) FROM tunnels").Scan(&stats.TotalTunnels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "获取实例总数失败: " + err.Error(),
		})
		return
	}

	// 获取总流量（TCP + UDP）
	var totalBytes int64
	if err := h.dashboardService.DB().Raw(`
		SELECT COALESCE(SUM(tcp_rx + tcp_tx + udp_rx + udp_tx), 0)
		FROM tunnels
	`).Scan(&totalBytes).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "获取总流量失败: " + err.Error(),
		})
		return
	}
	stats.TotalTraffic = float64(totalBytes) / (1024 * 1024 * 1024) // 转换为GB

	// 当前速率暂时返回0，后续实现
	stats.CurrentSpeed = 0

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
	})
}

// HandleGetStats 获取仪表盘统计数据
func (h *DashboardHandler) HandleGetStats(c *gin.Context) {

	// 获取时间范围参数
	timeRange := c.Query("range")
	if timeRange == "" {
		timeRange = "all"
	}

	// 验证时间范围参数
	var validRange bool
	switch dashboard.TimeRange(timeRange) {
	case dashboard.TimeRangeToday,
		dashboard.TimeRangeWeek,
		dashboard.TimeRangeMonth,
		dashboard.TimeRangeYear,
		dashboard.TimeRangeAllTime:
		validRange = true
	}

	if !validRange {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "无效的时间范围参数",
		})
		return
	}

	// 获取统计数据
	stats, err := h.dashboardService.GetStats(dashboard.TimeRange(timeRange))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "获取仪表盘数据失败: " + err.Error(),
		})
		return
	}

	// 直接输出统计数据，保持与前端期望的数据结构一致
	c.JSON(http.StatusOK, stats)
}

// HandleTrafficTrend GET /api/dashboard/traffic-trend
func (h *DashboardHandler) HandleTrafficTrend(c *gin.Context) {

	// hours 参数可选
	hrsStr := c.Query("hours")
	hours := 24
	if hrsStr != "" {
		if v, err := strconv.Atoi(hrsStr); err == nil && v > 0 {
			hours = v
		}
	}

	trend, err := h.dashboardService.GetTrafficTrend(hours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	if trend == nil {
		trend = make([]dashboard.TrafficTrendItem, 0)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": trend, "count": len(trend)})
}

// HandleGetTunnelStats GET /api/dashboard/tunnel-stats
func (h *DashboardHandler) HandleGetTunnelStats(c *gin.Context) {

	// 获取隧道统计数据
	var stats struct {
		Total          int64 `json:"total"`
		Running        int64 `json:"running"`
		Stopped        int64 `json:"stopped"`
		Error          int64 `json:"error"`
		Offline        int64 `json:"offline"`
		TotalEndpoints int64 `json:"total_endpoints"`
		TotalServices  int64 `json:"total_services"`
	}

	// 使用原生 SQL 查询统计数据
	query := `
		SELECT 
			COUNT(*) AS total,
			COUNT(CASE WHEN status = 'running' THEN 1 END) AS running,
			COUNT(CASE WHEN status = 'stopped' THEN 1 END) AS stopped,
			COUNT(CASE WHEN status = 'error' THEN 1 END) AS error,
			COUNT(CASE WHEN status = 'offline' OR status IS NULL THEN 1 END) AS offline
		FROM tunnels
		`

	err := h.dashboardService.DB().Raw(query).Scan(&stats).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// 获取主控总数
	err = h.dashboardService.DB().Raw("SELECT COUNT(*) FROM endpoints").Scan(&stats.TotalEndpoints).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "获取主控总数失败: " + err.Error(),
		})
		return
	}

	// 获取服务总数
	err = h.dashboardService.DB().Raw("SELECT COUNT(*) FROM services").Scan(&stats.TotalServices).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "获取服务总数失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
	})
}

// HandleWeeklyStats GET /api/dashboard/weekly-stats
func (h *DashboardHandler) HandleWeeklyStats(c *gin.Context) {
	weeklyStats, err := h.dashboardService.GetWeeklyStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "获取每周统计数据失败: " + err.Error(),
		})
		return
	}

	// 确保返回空数组而不是nil
	if weeklyStats == nil {
		weeklyStats = make([]dashboard.WeeklyStatsItem, 0)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    weeklyStats,
		"count":   len(weeklyStats),
	})
}
