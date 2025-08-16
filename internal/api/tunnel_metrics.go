package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	log "NodePassDash/internal/log"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/tunnel"

	"strings"

	"github.com/gorilla/mux"
)

// TunnelMetricsHandler 改进版的隧道指标处理器，基于 Nezha 的 avg_delay 机制
type TunnelMetricsHandler struct {
	tunnelService *tunnel.Service
	sseProcessor  *metrics.SSEProcessor
}

// NewTunnelMetricsHandler 创建隧道指标处理器
func NewTunnelMetricsHandler(tunnelService *tunnel.Service, sseProcessor *metrics.SSEProcessor) *TunnelMetricsHandler {
	return &TunnelMetricsHandler{
		tunnelService: tunnelService,
		sseProcessor:  sseProcessor,
	}
}

// HandleGetTunnelTrafficTrendV2 获取隧道流量趋势数据（改进版）
// GET /api/tunnels/{id}/traffic-trend
func (h *TunnelMetricsHandler) HandleGetTunnelTrafficTrendV2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少隧道ID"})
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	// 解析小时数参数，默认24小时
	hours := 24
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsedHours, err := strconv.Atoi(h); err == nil && parsedHours > 0 && parsedHours <= 168 { // 最多7天
			hours = parsedHours
		}
	}

	db := h.tunnelService.DB()

	// 查询隧道基本信息
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "隧道不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	var trafficTrend []map[string]interface{}

	if instanceID.Valid && instanceID.String != "" {
		// 使用新的聚合器获取分钟级平均流量数据
		trendData, err := h.sseProcessor.GetTrafficTrend(endpointID, instanceID.String, hours)
		if err != nil {
			log.Errorf("获取流量趋势失败 [%d_%s]: %v", endpointID, instanceID.String, err)
			// 回退到空数据，不阻止响应
			trafficTrend = make([]map[string]interface{}, 0)
		} else {
			trafficTrend = trendData
		}

		// 补充缺失的时间点到当前时间（每分钟一个点）
		trafficTrend = h.fillMissingTimePoints(trafficTrend, hours, "traffic")

		log.Debugf("流量趋势查询完成 [%d_%s]: %d 个数据点", endpointID, instanceID.String, len(trafficTrend))
	}

	// 返回流量趋势数据，格式与原接口兼容
	response := map[string]interface{}{
		"success":      true,
		"trafficTrend": trafficTrend,
		"hours":        hours,
		"count":        len(trafficTrend),
		"source":       "aggregated_metrics", // 标识数据来源
		"timestamp":    time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGetTunnelPingTrendV2 获取隧道延迟趋势数据（改进版）
// GET /api/tunnels/{id}/ping-trend
func (h *TunnelMetricsHandler) HandleGetTunnelPingTrendV2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少隧道ID"})
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	// 解析小时数参数，默认24小时
	hours := 24
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsedHours, err := strconv.Atoi(h); err == nil && parsedHours > 0 && parsedHours <= 168 { // 最多7天
			hours = parsedHours
		}
	}

	db := h.tunnelService.DB()

	// 查询隧道基本信息
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "隧道不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	var pingTrend []map[string]interface{}

	if instanceID.Valid && instanceID.String != "" {
		// 使用新的聚合器获取分钟级平均延迟数据
		trendData, err := h.sseProcessor.GetPingTrend(endpointID, instanceID.String, hours)
		if err != nil {
			log.Errorf("获取延迟趋势失败 [%d_%s]: %v", endpointID, instanceID.String, err)
			// 回退到空数据，不阻止响应
			pingTrend = make([]map[string]interface{}, 0)
		} else {
			pingTrend = trendData
		}

		// 补充缺失的时间点到当前时间（每分钟一个点）
		pingTrend = h.fillMissingTimePoints(pingTrend, hours, "ping")

		log.Debugf("延迟趋势查询完成 [%d_%s]: %d 个数据点", endpointID, instanceID.String, len(pingTrend))
	}

	// 返回延迟趋势数据，格式与原接口兼容
	response := map[string]interface{}{
		"success":   true,
		"pingTrend": pingTrend,
		"hours":     hours,
		"count":     len(pingTrend),
		"source":    "aggregated_metrics", // 标识数据来源
		"timestamp": time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGetTunnelPoolTrendV2 获取隧道连接池趋势数据（改进版）
// GET /api/tunnels/{id}/pool-trend
func (h *TunnelMetricsHandler) HandleGetTunnelPoolTrendV2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少隧道ID"})
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	// 解析小时数参数，默认24小时
	hours := 24
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsedHours, err := strconv.Atoi(h); err == nil && parsedHours > 0 && parsedHours <= 168 { // 最多7天
			hours = parsedHours
		}
	}

	db := h.tunnelService.DB()

	// 查询隧道基本信息
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "隧道不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	var poolTrend []map[string]interface{}

	if instanceID.Valid && instanceID.String != "" {
		// 使用新的聚合器获取分钟级平均连接池数据
		trendData, err := h.sseProcessor.GetPoolTrend(endpointID, instanceID.String, hours)
		if err != nil {
			log.Errorf("获取连接池趋势失败 [%d_%s]: %v", endpointID, instanceID.String, err)
			// 回退到空数据，不阻止响应
			poolTrend = make([]map[string]interface{}, 0)
		} else {
			poolTrend = trendData
		}

		// 补充缺失的时间点到当前时间（每分钟一个点）
		poolTrend = h.fillMissingTimePoints(poolTrend, hours, "pool")

		log.Debugf("连接池趋势查询完成 [%d_%s]: %d 个数据点", endpointID, instanceID.String, len(poolTrend))
	}

	// 返回连接池趋势数据，格式与原接口兼容
	response := map[string]interface{}{
		"success":   true,
		"poolTrend": poolTrend,
		"hours":     hours,
		"count":     len(poolTrend),
		"source":    "aggregated_metrics", // 标识数据来源
		"timestamp": time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// fillMissingTimePoints 补充缺失的时间点，确保每分钟都有数据点
func (h *TunnelMetricsHandler) fillMissingTimePoints(data []map[string]interface{}, hours int, metricType string) []map[string]interface{} {
	if len(data) == 0 {
		// 如果没有任何数据，创建全零的时间序列
		return h.createEmptyTimeSeries(hours, metricType)
	}

	// 创建时间索引映射
	timeMap := make(map[string]map[string]interface{})
	for _, item := range data {
		if eventTime, ok := item["eventTime"].(string); ok {
			timeMap[eventTime] = item
		}
	}

	// 生成完整的时间序列
	result := make([]map[string]interface{}, 0)
	now := time.Now()
	startTime := now.Add(-time.Duration(hours) * time.Hour)

	for current := startTime.Truncate(time.Minute); current.Before(now); current = current.Add(time.Minute) {
		timeKey := current.Format("2006-01-02 15:04")

		if existingData, exists := timeMap[timeKey]; exists {
			// 使用现有数据
			result = append(result, existingData)
		} else {
			// 创建缺失时间点的零值数据
			zeroData := h.createZeroDataPoint(timeKey, metricType)
			result = append(result, zeroData)
		}
	}

	return result
}

// createEmptyTimeSeries 创建空的时间序列
func (h *TunnelMetricsHandler) createEmptyTimeSeries(hours int, metricType string) []map[string]interface{} {
	result := make([]map[string]interface{}, 0)
	now := time.Now()
	startTime := now.Add(-time.Duration(hours) * time.Hour)

	for current := startTime.Truncate(time.Minute); current.Before(now); current = current.Add(time.Minute) {
		timeKey := current.Format("2006-01-02 15:04")
		zeroData := h.createZeroDataPoint(timeKey, metricType)
		result = append(result, zeroData)
	}

	return result
}

// createZeroDataPoint 创建零值数据点
func (h *TunnelMetricsHandler) createZeroDataPoint(timeKey, metricType string) map[string]interface{} {
	data := map[string]interface{}{
		"eventTime": timeKey,
	}

	switch metricType {
	case "ping":
		data["ping"] = float64(0)
		data["minPing"] = float64(0)
		data["maxPing"] = float64(0)
		data["successRate"] = float64(0)

	case "pool":
		data["pool"] = float64(0)
		data["minPool"] = float64(0)
		data["maxPool"] = float64(0)

	case "traffic":
		data["tcpRxRate"] = float64(0)
		data["tcpTxRate"] = float64(0)
		data["udpRxRate"] = float64(0)
		data["udpTxRate"] = float64(0)
	}

	return data
}

// HandleGetTunnelMetricsTrend 获取隧道所有趋势数据的统一接口（基于ServiceHistory表）
// GET /api/tunnels/{instanceId}/metrics-trend
func (h *TunnelMetricsHandler) HandleGetTunnelMetricsTrend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	instanceId := vars["instanceId"]
	if instanceId == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少实例ID"})
		return
	}

	// 解析小时数参数，默认24小时
	// hours := 24
	// if h := r.URL.Query().Get("hours"); h != "" {
	// 	if parsedHours, err := strconv.Atoi(h); err == nil && parsedHours > 0 && parsedHours <= 168 { // 最多7天
	// 		hours = parsedHours
	// 	}
	// }

	// 构建统一的趋势数据响应
	unifiedData, err := h.getUnifiedTrendDataFromServiceHistory(instanceId, 24)
	if err != nil {
		// 如果数据库已关闭，则不再继续刷日志
		if strings.Contains(err.Error(), "database is closed") {
			log.Warnf("趋势数据查询取消（数据库已关闭）[%s]", instanceId)
		} else {
			log.Errorf("获取统一趋势数据失败 [%s]: %v", instanceId, err)
		}
		// 回退到空数据，不阻止响应
		log.Info("回退到空数据，不阻止响应")
		unifiedData = h.createEmptyTrendData(24)
	}

	// 安全地获取数据长度，支持不同的数据类型
	getArrayLength := func(data interface{}) int {
		if data == nil {
			return 0
		}
		switch v := data.(type) {
		case []float64:
			return len(v)
		case []interface{}:
			return len(v)
		case []int64:
			return len(v)
		default:
			return 0
		}
	}

	trafficLen := getArrayLength(unifiedData["traffic"].(map[string]interface{})["avg_delay"])
	pingLen := getArrayLength(unifiedData["ping"].(map[string]interface{})["avg_delay"])
	poolLen := getArrayLength(unifiedData["pool"].(map[string]interface{})["avg_delay"])

	log.Debugf("ServiceHistory趋势查询完成 [%s]: 数据点数量 = traffic:%d, ping:%d, pool:%d",
		instanceId, trafficLen, pingLen, poolLen,
	)

	// 返回统一的趋势数据
	response := map[string]interface{}{
		"success":   true,
		"data":      unifiedData,
		"timestamp": time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getUnifiedTrendDataFromServiceHistory 从ServiceHistory表获取统一的趋势数据
func (h *TunnelMetricsHandler) getUnifiedTrendDataFromServiceHistory(instanceID string, hours int) (map[string]interface{}, error) {
	db := h.tunnelService.DB()
	startTime := time.Now().Add(-time.Duration(hours) * time.Hour)

	log.Debugf("[API] 查询ServiceHistory: instanceID=%s, startTime=%v, hours=%d, currentTime=%v",
		instanceID, startTime.Format("2006-01-02 15:04:05"), hours, time.Now().Format("2006-01-02 15:04:05"))

	// 查询ServiceHistory表数据
	var metrics []struct {
		RecordTime  time.Time `json:"record_time"`
		AvgPing     float64   `json:"avg_ping"`
		AvgPool     float64   `json:"avg_pool"`
		DeltaTCPIn  float64   `json:"delta_tcp_in"`
		DeltaTCPOut float64   `json:"delta_tcp_out"`
		DeltaUDPIn  float64   `json:"delta_udp_in"`
		DeltaUDPOut float64   `json:"delta_udp_out"`
		AvgSpeedIn  float64   `json:"avg_speed_in"`
		AvgSpeedOut float64   `json:"avg_speed_out"`
	}

	query := `SELECT record_time, avg_ping, avg_pool, delta_tcp_in, delta_tcp_out, delta_udp_in, delta_udp_out, avg_speed_in, avg_speed_out 
			  FROM service_history 
			  WHERE instance_id = ? AND record_time >= ? 
			  ORDER BY record_time ASC`

	rows, err := db.Query(query, instanceID, startTime)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var metric struct {
			RecordTime  time.Time `json:"record_time"`
			AvgPing     float64   `json:"avg_ping"`
			AvgPool     float64   `json:"avg_pool"`
			DeltaTCPIn  float64   `json:"delta_tcp_in"`
			DeltaTCPOut float64   `json:"delta_tcp_out"`
			DeltaUDPIn  float64   `json:"delta_udp_in"`
			DeltaUDPOut float64   `json:"delta_udp_out"`
			AvgSpeedIn  float64   `json:"avg_speed_in"`
			AvgSpeedOut float64   `json:"avg_speed_out"`
		}

		if err := rows.Scan(&metric.RecordTime, &metric.AvgPing, &metric.AvgPool, &metric.DeltaTCPIn, &metric.DeltaTCPOut, &metric.DeltaUDPIn, &metric.DeltaUDPOut, &metric.AvgSpeedIn, &metric.AvgSpeedOut); err != nil {
			return nil, err
		}

		metrics = append(metrics, metric)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	log.Debugf("[API] ServiceHistory查询结果: 找到 %d 条记录", len(metrics))

	// 如果有数据，直接使用查询到的数据，不进行时间点补全
	if len(metrics) > 0 {
		// 构建数据数组
		var (
			timestampsMs []int64
			trafficData  []float64
			pingData     []float64
			poolData     []float64
			speedInData  []float64
			speedOutData []float64
		)

		// 按时间排序
		for _, metric := range metrics {
			// 时间戳转换为毫秒
			timestampsMs = append(timestampsMs, metric.RecordTime.UnixMilli())

			// 添加数据
			pingData = append(pingData, metric.AvgPing)
			poolData = append(poolData, metric.AvgPool)
			// 流量数据：TCP+UDP总流量变化（bytes/min）
			totalTraffic := metric.DeltaTCPIn + metric.DeltaTCPOut + metric.DeltaUDPIn + metric.DeltaUDPOut
			trafficData = append(trafficData, totalTraffic)
			// 速度数据：使用新的速度字段
			speedInData = append(speedInData, metric.AvgSpeedIn)
			speedOutData = append(speedOutData, metric.AvgSpeedOut)

		}

		// 构建返回数据
		result := map[string]interface{}{
			"traffic": map[string]interface{}{
				"avg_delay":  trafficData,
				"created_at": timestampsMs,
			},
			"ping": map[string]interface{}{
				"avg_delay":  pingData,
				"created_at": timestampsMs,
			},
			"pool": map[string]interface{}{
				"avg_delay":  poolData,
				"created_at": timestampsMs,
			},
			"speed_in": map[string]interface{}{
				"avg_delay":  speedInData,
				"created_at": timestampsMs,
			},
			"speed_out": map[string]interface{}{
				"avg_delay":  speedOutData,
				"created_at": timestampsMs,
			},
		}

		log.Debugf("[API] 直接返回查询数据: %d 条记录", len(metrics))
		return result, nil
	}

	// 如果没有数据，生成空的时间序列
	log.Debugf("[API] 无数据，生成空时间序列")
	return h.createEmptyTrendData(hours), nil
}

// getUnifiedTrendData 获取统一的趋势数据，确保时间戳对齐（保留原方法用于兼容）
// func (h *TunnelMetricsHandler) getUnifiedTrendData(endpointID int64, instanceID string, hours int) (map[string]interface{}, error) {
// 	// 直接从 MinuteMetrics 表查询数据
// 	aggregator := h.sseProcessor.GetAggregator()
// 	startTime := time.Now().Add(-time.Duration(hours) * time.Hour)

// 	// 查询聚合数据
// 	var metrics []struct {
// 		MetricTime   time.Time `json:"metric_time"`
// 		AvgPing      float64   `json:"avg_ping"`
// 		MinPing      float64   `json:"min_ping"`
// 		MaxPing      float64   `json:"max_ping"`
// 		SuccessRate  float64   `json:"success_rate"`
// 		AvgPool      float64   `json:"avg_pool"`
// 		MinPool      float64   `json:"min_pool"`
// 		MaxPool      float64   `json:"max_pool"`
// 		AvgTCPRxRate float64   `json:"avg_tcp_rx_rate"`
// 		AvgTCPTxRate float64   `json:"avg_tcp_tx_rate"`
// 		AvgUDPRxRate float64   `json:"avg_udp_rx_rate"`
// 		AvgUDPTxRate float64   `json:"avg_udp_tx_rate"`
// 		TrafficCount int       `json:"traffic_count"`
// 	}

// 	query := aggregator.DB().
// 		Table("minute_metrics").
// 		Select("metric_time, avg_ping, min_ping, max_ping, success_rate, avg_pool, min_pool, max_pool, avg_tcp_rx_rate, avg_tcp_tx_rate, avg_udp_rx_rate, avg_udp_tx_rate, traffic_count").
// 		Where("endpoint_id = ? AND instance_id = ? AND metric_time >= ?", endpointID, instanceID, startTime).
// 		Order("metric_time ASC")

// 	if err := query.Find(&metrics).Error; err != nil {
// 		return nil, err
// 	}

// 	// 生成完整的时间序列（每分钟一个点）
// 	timePoints := h.generateTimePoints(startTime, hours)

// 	// 创建数据映射
// 	dataMap := make(map[time.Time]struct {
// 		AvgPing      float64
// 		MinPing      float64
// 		MaxPing      float64
// 		SuccessRate  float64
// 		AvgPool      float64
// 		MinPool      float64
// 		MaxPool      float64
// 		AvgTCPRxRate float64
// 		AvgTCPTxRate float64
// 		AvgUDPRxRate float64
// 		AvgUDPTxRate float64
// 		TrafficCount int
// 	})

// 	// 填充实际数据
// 	for _, metric := range metrics {
// 		dataMap[metric.MetricTime.Truncate(time.Minute)] = struct {
// 			AvgPing      float64
// 			MinPing      float64
// 			MaxPing      float64
// 			SuccessRate  float64
// 			AvgPool      float64
// 			MinPool      float64
// 			MaxPool      float64
// 			AvgTCPRxRate float64
// 			AvgTCPTxRate float64
// 			AvgUDPRxRate float64
// 			AvgUDPTxRate float64
// 			TrafficCount int
// 		}{
// 			AvgPing:      metric.AvgPing,
// 			MinPing:      metric.MinPing,
// 			MaxPing:      metric.MaxPing,
// 			SuccessRate:  metric.SuccessRate,
// 			AvgPool:      metric.AvgPool,
// 			MinPool:      metric.MinPool,
// 			MaxPool:      metric.MaxPool,
// 			AvgTCPRxRate: metric.AvgTCPRxRate,
// 			AvgTCPTxRate: metric.AvgTCPTxRate,
// 			AvgUDPRxRate: metric.AvgUDPRxRate,
// 			AvgUDPTxRate: metric.AvgUDPTxRate,
// 			TrafficCount: metric.TrafficCount,
// 		}
// 	}

// 	// 构建对齐的数据数组
// 	var (
// 		timestampsMs []int64
// 		trafficData  []float64
// 		pingData     []float64
// 		poolData     []float64
// 		speedData    []float64
// 	)

// 	for _, timePoint := range timePoints {
// 		// 时间戳转换为毫秒
// 		timestampsMs = append(timestampsMs, timePoint.UnixMilli())

// 		if data, exists := dataMap[timePoint]; exists {
// 			// 有实际数据
// 			pingData = append(pingData, data.AvgPing)
// 			poolData = append(poolData, data.AvgPool)
// 			// 流量数据：TCP+UDP总流量（bytes/min）
// 			totalTraffic := data.AvgTCPIn + data.AvgTCPOut + data.AvgUDPIn + data.AvgUDPOut
// 			trafficData = append(trafficData, totalTraffic)
// 			// 速度数据：使用TCP流量
// 			tcpSpeed := data.AvgTCPIn + data.AvgTCPOut
// 			speedData = append(speedData, tcpSpeed)
// 		} else {
// 			// 无数据，填充0
// 			pingData = append(pingData, 0)
// 			poolData = append(poolData, 0)
// 			trafficData = append(trafficData, 0)
// 			speedData = append(speedData, 0)
// 		}
// 	}

// 	// 构建返回数据
// 	result := map[string]interface{}{
// 		"traffic": map[string]interface{}{
// 			"avg_delay":  trafficData,
// 			"created_at": timestampsMs,
// 		},
// 		"ping": map[string]interface{}{
// 			"avg_delay":  pingData,
// 			"created_at": timestampsMs,
// 		},
// 		"pool": map[string]interface{}{
// 			"avg_delay":  poolData,
// 			"created_at": timestampsMs,
// 		},
// 		"speed": map[string]interface{}{
// 			"avg_delay":  speedData,
// 			"created_at": timestampsMs,
// 		},
// 	}

// 	return result, nil
// }

// generateTimePoints 生成完整的时间点序列
func (h *TunnelMetricsHandler) generateTimePoints(startTime time.Time, hours int) []time.Time {
	var timePoints []time.Time
	current := startTime.Truncate(time.Minute)
	// 结束时间设为当前时间的前一分钟，避免包含当前分钟（可能还没有数据）
	end := time.Now().Add(-time.Minute).Truncate(time.Minute)

	for current.Before(end) || current.Equal(end) {
		timePoints = append(timePoints, current)
		current = current.Add(time.Minute)
	}

	return timePoints
}

// createEmptyTrendData 创建空的趋势数据
func (h *TunnelMetricsHandler) createEmptyTrendData(hours int) map[string]interface{} {
	// 生成时间点
	startTime := time.Now().Add(-time.Duration(hours) * time.Hour).Truncate(time.Minute)
	timePoints := h.generateTimePoints(startTime, hours)

	var (
		timestampsMs []int64
		emptyData    []float64
	)

	for _, timePoint := range timePoints {
		timestampsMs = append(timestampsMs, timePoint.UnixMilli())
		emptyData = append(emptyData, 0)
	}

	return map[string]interface{}{
		"traffic": map[string]interface{}{
			"avg_delay":  emptyData,
			"created_at": timestampsMs,
		},
		"ping": map[string]interface{}{
			"avg_delay":  emptyData,
			"created_at": timestampsMs,
		},
		"pool": map[string]interface{}{
			"avg_delay":  emptyData,
			"created_at": timestampsMs,
		},
		"speed_in": map[string]interface{}{
			"avg_delay":  emptyData,
			"created_at": timestampsMs,
		},
		"speed_out": map[string]interface{}{
			"avg_delay":  emptyData,
			"created_at": timestampsMs,
		},
	}
}

// GetMetricsStats 获取指标统计信息（调试用）
func (h *TunnelMetricsHandler) GetMetricsStats() map[string]interface{} {
	return h.sseProcessor.GetStats()
}
