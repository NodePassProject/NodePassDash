package api

import (
	"NodePassDash/internal/sse"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
)

// MemoryAPIHandler 基于内存的API处理器
type MemoryAPIHandler struct {
	sseService *sse.Service
}

// NewMemoryAPIHandler 创建内存API处理器
func NewMemoryAPIHandler(sseService *sse.Service) *MemoryAPIHandler {
	return &MemoryAPIHandler{
		sseService: sseService,
	}
}

// HandleDashboardData 获取仪表板数据（从内存聚合）
// GET /api/memory/dashboard
func (h *MemoryAPIHandler) HandleDashboardData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	data := h.sseService.GetDashboardData()

	response := map[string]interface{}{
		"success":   true,
		"message":   "仪表板数据获取成功",
		"data":      data,
		"timestamp": time.Now().Unix(),
		"source":    "memory", // 标明数据来源
	}

	json.NewEncoder(w).Encode(response)
}

// HandleEndpointRealTimeData 获取端点实时数据（从内存）
// GET /api/memory/endpoints/{endpointId}/realtime
func (h *MemoryAPIHandler) HandleEndpointRealTimeData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	endpointIDStr := vars["endpointId"]
	if endpointIDStr == "" {
		http.Error(w, "Missing endpoint ID", http.StatusBadRequest)
		return
	}

	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpoint ID", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	data := h.sseService.GetEndpointRealTimeData(endpointID)
	if data == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "端点未找到或不在内存中",
		})
		return
	}

	// 读取数据时加锁
	data.Mu.RLock()
	responseData := map[string]interface{}{
		"id":     data.Host.ID,
		"name":   data.Host.Name,
		"url":    data.Host.URL,
		"status": data.State.Status,
		"stats":  data.State.Stats,
		"tunnels": func() []map[string]interface{} {
			tunnels := make([]map[string]interface{}, 0, len(data.State.Tunnels))
			for instanceID, tunnel := range data.State.Tunnels {
				tunnels = append(tunnels, map[string]interface{}{
					"instanceId":     instanceID,
					"instanceType":   tunnel.InstanceType,
					"status":         tunnel.Status,
					"tcpRx":          tunnel.TCPRx,
					"tcpTx":          tunnel.TCPTx,
					"udpRx":          tunnel.UDPRx,
					"udpTx":          tunnel.UDPTx,
					"pool":           tunnel.Pool,
					"ping":           tunnel.Ping,
					"lastUpdateTime": tunnel.LastUpdateTime.Unix(),
				})
			}
			return tunnels
		}(),
		"trafficSnapshot": data.State.TrafficSnapshot,
		"lastUpdateTime":  data.State.LastUpdateTime.Unix(),
	}
	data.Mu.RUnlock()

	response := map[string]interface{}{
		"success":   true,
		"data":      responseData,
		"timestamp": time.Now().Unix(),
		"source":    "memory",
	}

	json.NewEncoder(w).Encode(response)
}

// HandleAllEndpointsRealTimeData 获取所有端点实时数据（从内存）
// GET /api/memory/endpoints/realtime
func (h *MemoryAPIHandler) HandleAllEndpointsRealTimeData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	allData := h.sseService.GetAllEndpointRealTimeData()

	endpoints := make([]map[string]interface{}, 0, len(allData))
	for endpointID, data := range allData {
		data.Mu.RLock()
		endpointData := map[string]interface{}{
			"id":               endpointID,
			"name":             data.Host.Name,
			"url":              data.Host.URL,
			"status":           data.State.Status,
			"connectionStatus": data.State.ConnectionStatus,
			"tunnelCount":      len(data.State.Tunnels),
			"stats":            data.State.Stats,
			"lastUpdateTime":   data.State.LastUpdateTime.Unix(),
		}
		data.Mu.RUnlock()

		endpoints = append(endpoints, endpointData)
	}

	response := map[string]interface{}{
		"success":   true,
		"data":      endpoints,
		"total":     len(endpoints),
		"timestamp": time.Now().Unix(),
		"source":    "memory",
	}

	json.NewEncoder(w).Encode(response)
}

// HandleTunnelRealTimeData 获取隧道实时数据（从内存）
// GET /api/memory/endpoints/{endpointId}/tunnels/{instanceId}/realtime
func (h *MemoryAPIHandler) HandleTunnelRealTimeData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	endpointIDStr := vars["endpointId"]
	instanceID := vars["instanceId"]

	if endpointIDStr == "" || instanceID == "" {
		http.Error(w, "Missing endpoint ID or instance ID", http.StatusBadRequest)
		return
	}

	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpoint ID", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	tunnelData := h.sseService.GetTunnelRealTimeData(endpointID, instanceID)
	if tunnelData == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "隧道未找到或不在内存中",
		})
		return
	}

	response := map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"instanceId":     tunnelData.InstanceID,
			"instanceType":   tunnelData.InstanceType,
			"status":         tunnelData.Status,
			"url":            tunnelData.URL,
			"alias":          tunnelData.Alias,
			"restart":        tunnelData.Restart,
			"tcpRx":          tunnelData.TCPRx,
			"tcpTx":          tunnelData.TCPTx,
			"udpRx":          tunnelData.UDPRx,
			"udpTx":          tunnelData.UDPTx,
			"pool":           tunnelData.Pool,
			"ping":           tunnelData.Ping,
			"lastUpdateTime": tunnelData.LastUpdateTime.Unix(),
			"lastEventTime":  tunnelData.LastEventTime.Unix(),
		},
		"timestamp": time.Now().Unix(),
		"source":    "memory",
	}

	json.NewEncoder(w).Encode(response)
}

// HandleTrafficTrendData 获取流量趋势数据（从内存快照）
// GET /api/memory/endpoints/{endpointId}/traffic/trend?hours=24
func (h *MemoryAPIHandler) HandleTrafficTrendData(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	endpointIDStr := vars["endpointId"]
	if endpointIDStr == "" {
		http.Error(w, "Missing endpoint ID", http.StatusBadRequest)
		return
	}

	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpoint ID", http.StatusBadRequest)
		return
	}

	// 解析 hours 参数
	hours := 24 // 默认24小时
	if h := r.URL.Query().Get("hours"); h != "" {
		if parsedHours, err := strconv.Atoi(h); err == nil && parsedHours > 0 && parsedHours <= 168 { // 最多7天
			hours = parsedHours
		}
	}

	w.Header().Set("Content-Type", "application/json")

	trendData := h.sseService.GetTrafficTrendData(endpointID, hours)

	response := map[string]interface{}{
		"success":   true,
		"data":      trendData,
		"hours":     hours,
		"count":     len(trendData),
		"timestamp": time.Now().Unix(),
		"source":    "memory",
	}

	json.NewEncoder(w).Encode(response)
}

// HandleMemoryStats 获取内存管理统计信息
// GET /api/memory/stats
func (h *MemoryAPIHandler) HandleMemoryStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	stats := h.sseService.GetStats()

	response := map[string]interface{}{
		"success":   true,
		"data":      stats,
		"timestamp": time.Now().Unix(),
	}

	json.NewEncoder(w).Encode(response)
}

// HandleOptimizedSSE 优化的SSE推送（基于内存数据）
// GET /api/memory/sse/global
func (h *MemoryAPIHandler) HandleOptimizedSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// 发送连接成功消息
	w.Write([]byte("data: " + `{"type":"connected","message":"优化SSE连接成功","source":"memory"}` + "\n\n"))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// 创建定时器，每2秒推送一次内存数据
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			// 从内存获取最新数据并推送
			dashboardData := h.sseService.GetDashboardData()
			allEndpoints := h.sseService.GetAllEndpointRealTimeData()

			// 构造推送数据
			pushData := map[string]interface{}{
				"type":      "dashboard_update",
				"dashboard": dashboardData,
				"endpoints": func() []map[string]interface{} {
					endpoints := make([]map[string]interface{}, 0, len(allEndpoints))
					for endpointID, data := range allEndpoints {
						data.Mu.RLock()
						endpoints = append(endpoints, map[string]interface{}{
							"id":               endpointID,
							"status":           data.State.Status,
							"connectionStatus": data.State.ConnectionStatus,
							"tunnelCount":      len(data.State.Tunnels),
							"stats":            data.State.Stats,
							"lastUpdateTime":   data.State.LastUpdateTime.Unix(),
						})
						data.Mu.RUnlock()
					}
					return endpoints
				}(),
				"timestamp": time.Now().Unix(),
				"source":    "memory",
			}

			// 序列化并发送
			if jsonData, err := json.Marshal(pushData); err == nil {
				w.Write([]byte("data: " + string(jsonData) + "\n\n"))
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			}
		}
	}
}

// HandleTunnelOptimizedSSE 优化的隧道SSE推送（基于内存数据）
// GET /api/memory/sse/tunnels/{instanceId}
func (h *MemoryAPIHandler) HandleTunnelOptimizedSSE(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	instanceID := vars["instanceId"]
	if instanceID == "" {
		http.Error(w, "Missing instance ID", http.StatusBadRequest)
		return
	}

	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Cache-Control")
	w.Header().Set("X-Accel-Buffering", "no") // 禁用nginx缓冲

	// 发送连接成功消息（使用标准SSE格式）
	w.Write([]byte("data: " + `{"type":"connected","message":"隧道SSE连接成功","instanceId":"` + instanceID + `","source":"memory"}` + "\n\n"))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// 创建定时器，每1秒推送一次隧道数据
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			// 遍历所有端点寻找指定的隧道
			allEndpoints := h.sseService.GetAllEndpointRealTimeData()
			var tunnelData map[string]interface{}
			var found bool

			for endpointID, endpoint := range allEndpoints {
				endpoint.Mu.RLock()
				if tunnel, exists := endpoint.State.Tunnels[instanceID]; exists {
					tunnelData = map[string]interface{}{
						"type":           "tunnel_update",
						"endpointId":     endpointID,
						"instanceId":     tunnel.InstanceID,
						"instanceType":   tunnel.InstanceType,
						"status":         tunnel.Status,
						"tcpRx":          tunnel.TCPRx,
						"tcpTx":          tunnel.TCPTx,
						"udpRx":          tunnel.UDPRx,
						"udpTx":          tunnel.UDPTx,
						"pool":           tunnel.Pool,
						"ping":           tunnel.Ping,
						"lastUpdateTime": tunnel.LastUpdateTime.Unix(),
						"timestamp":      time.Now().Unix(),
						"source":         "memory",
					}
					found = true
				}
				endpoint.Mu.RUnlock()

				if found {
					break
				}
			}

			if found {
				// 序列化并发送隧道数据
				if jsonData, err := json.Marshal(tunnelData); err == nil {
					w.Write([]byte("data: " + string(jsonData) + "\n\n"))
					if f, ok := w.(http.Flusher); ok {
						f.Flush()
					}
				}
			} else {
				// 隧道不存在，发送未找到消息
				notFoundData := map[string]interface{}{
					"type":       "tunnel_not_found",
					"instanceId": instanceID,
					"message":    "隧道未找到",
					"timestamp":  time.Now().Unix(),
					"source":     "memory",
				}
				if jsonData, err := json.Marshal(notFoundData); err == nil {
					w.Write([]byte("data: " + string(jsonData) + "\n\n"))
					if f, ok := w.(http.Flusher); ok {
						f.Flush()
					}
				}
			}
		}
	}
}
