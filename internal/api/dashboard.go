package api

import (
	"NodePassDash/internal/dashboard"
	"encoding/json"
	"net/http"
	"strconv"
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

// HandleGetOverallStats 获取总体统计数据
func (h *DashboardHandler) HandleGetOverallStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取总体统计数据
	var stats struct {
		TotalEndpoints int64   `json:"total_endpoints"`
		TotalTunnels   int64   `json:"total_tunnels"`
		TotalTraffic   float64 `json:"total_traffic"` // 单位：GB
		CurrentSpeed   float64 `json:"current_speed"` // 单位：MB/s
	}

	// 获取主控总数
	if err := h.dashboardService.DB().Raw("SELECT COUNT(*) FROM endpoints").Scan(&stats.TotalEndpoints).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "获取主控总数失败: " + err.Error(),
		})
		return
	}

	// 获取实例总数
	if err := h.dashboardService.DB().Raw("SELECT COUNT(*) FROM tunnels").Scan(&stats.TotalTunnels).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "获取总流量失败: " + err.Error(),
		})
		return
	}
	stats.TotalTraffic = float64(totalBytes) / (1024 * 1024 * 1024) // 转换为GB

	// 当前速率暂时返回0，后续实现
	stats.CurrentSpeed = 0

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}

// HandleGetStats 获取仪表盘统计数据
func (h *DashboardHandler) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取时间范围参数
	timeRange := r.URL.Query().Get("range")
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
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "无效的时间范围参数",
		})
		return
	}

	// 获取统计数据
	stats, err := h.dashboardService.GetStats(dashboard.TimeRange(timeRange))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "获取仪表盘数据失败: " + err.Error(),
		})
		return
	}

	// 直接输出统计数据，保持与前端期望的数据结构一致
	json.NewEncoder(w).Encode(stats)
}

// HandleTrafficTrend GET /api/dashboard/traffic-trend
func (h *DashboardHandler) HandleTrafficTrend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// hours 参数可选
	hrsStr := r.URL.Query().Get("hours")
	hours := 24
	if hrsStr != "" {
		if v, err := strconv.Atoi(hrsStr); err == nil && v > 0 {
			hours = v
		}
	}

	trend, err := h.dashboardService.GetTrafficTrend(hours)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}

	if trend == nil {
		trend = make([]dashboard.TrafficTrendItem, 0)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "data": trend, "count": len(trend)})
}

// HandleGetTunnelStats GET /api/dashboard/tunnel-stats
func (h *DashboardHandler) HandleGetTunnelStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取隧道统计数据
	var stats struct {
		Total   int64 `json:"total"`
		Running int64 `json:"running"`
		Stopped int64 `json:"stopped"`
		Error   int64 `json:"error"`
		Offline int64 `json:"offline"`
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
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}
