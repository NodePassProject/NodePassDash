package api

import (
	"NodePassDash/internal/db"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/mattn/go-ieproxy"
	"gorm.io/gorm"

	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/sse"
	"strings"
)

// EndpointHandler 端点相关的处理器
type EndpointHandler struct {
	endpointService *endpoint.Service
	sseManager      *sse.Manager
}

// NewEndpointHandler 创建端点处理器实例
func NewEndpointHandler(endpointService *endpoint.Service, mgr *sse.Manager) *EndpointHandler {
	return &EndpointHandler{
		endpointService: endpointService,
		sseManager:      mgr,
	}
}

// HandleGetEndpoints 获取端点列表
func (h *EndpointHandler) HandleGetEndpoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	endpoints, err := h.endpointService.GetEndpoints()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "获取端点列表失败: " + err.Error(),
		})
		return
	}

	if endpoints == nil {
		endpoints = []endpoint.EndpointWithStats{}
	}
	json.NewEncoder(w).Encode(endpoints)
}

// HandleCreateEndpoint 创建新端点
func (h *EndpointHandler) HandleCreateEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req endpoint.CreateEndpointRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 对请求数据进行清理和trim处理
	req.Name = strings.TrimSpace(req.Name)
	req.URL = strings.TrimSpace(req.URL)
	req.APIPath = strings.TrimSpace(req.APIPath)
	req.APIKey = strings.TrimSpace(req.APIKey)

	// 验证请求数据
	if req.Name == "" || req.URL == "" || req.APIPath == "" || req.APIKey == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "缺少必填字段",
		})
		return
	}

	newEndpoint, err := h.endpointService.CreateEndpoint(req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 创建成功后，异步启动 SSE 监听
	if h.sseManager != nil && newEndpoint != nil {
		go func(ep *endpoint.Endpoint) {
			log.Infof("[Master-%v] 创建成功，准备启动 SSE 监听", ep.ID)
			if err := h.sseManager.ConnectEndpoint(ep.ID, ep.URL, ep.APIPath, ep.APIKey); err != nil {
				log.Errorf("[Master-%v] 启动 SSE 监听失败: %v", ep.ID, err)
			}
		}(newEndpoint)
	}

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success:  true,
		Message:  "端点创建成功",
		Endpoint: newEndpoint,
	})
}

// HandleUpdateEndpoint 更新端点信息 (PUT /api/endpoints/{id})
func (h *EndpointHandler) HandleUpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	var body struct {
		Name    string `json:"name"`
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 对请求数据进行清理和trim处理
	body.Name = strings.TrimSpace(body.Name)
	body.URL = strings.TrimSpace(body.URL)
	body.APIPath = strings.TrimSpace(body.APIPath)
	body.APIKey = strings.TrimSpace(body.APIKey)

	req := endpoint.UpdateEndpointRequest{
		ID:      id,
		Action:  "update",
		Name:    body.Name,
		URL:     body.URL,
		APIPath: body.APIPath,
		APIKey:  body.APIKey,
	}

	updatedEndpoint, err := h.endpointService.UpdateEndpoint(req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success:  true,
		Message:  "端点更新成功",
		Endpoint: updatedEndpoint,
	})
}

// HandleDeleteEndpoint 删除端点 (DELETE /api/endpoints/{id})
func (h *EndpointHandler) HandleDeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 先获取端点下所有实例ID用于清理文件日志
	var instanceIDs []string
	db := h.endpointService.DB()

	// 从Tunnel表获取实例ID
	var tunnels []models.Tunnel
	if err := db.Select("DISTINCT instance_id").Where("endpoint_id = ? AND instance_id IS NOT NULL AND instance_id != ''", id).Find(&tunnels).Error; err == nil {
		for _, tunnel := range tunnels {
			if tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
				instanceIDs = append(instanceIDs, *tunnel.InstanceID)
			}
		}
	}

	// 从TunnelRecycle表也获取实例ID
	var recycledTunnels []models.TunnelRecycle
	if err := db.Select("DISTINCT instance_id").Where("endpoint_id = ? AND instance_id IS NOT NULL AND instance_id != ''", id).Find(&recycledTunnels).Error; err == nil {
		for _, tunnel := range recycledTunnels {
			if tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
				instanceIDs = append(instanceIDs, *tunnel.InstanceID)
			}
		}
	}

	// 如果存在 SSE 监听，先断开
	if h.sseManager != nil {
		log.Infof("[Master-%v] 删除端点前，先断开 SSE 监听", id)
		h.sseManager.DisconnectEndpoint(id)
		log.Infof("[Master-%v] 已断开 SSE 监听", id)
	}

	log.Infof("[Master-%v] 开始删除端点数据", id)
	if err := h.endpointService.DeleteEndpoint(id); err != nil {
		log.Errorf("[Master-%v] 删除端点失败: %v", id, err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 清理所有相关的文件日志
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		for _, instanceID := range instanceIDs {
			if err := h.sseManager.GetFileLogger().ClearLogs(id, instanceID); err != nil {
				log.Warnf("[API] 端点删除-清理文件日志失败: endpointID=%d, instanceID=%s, err=%v", id, instanceID, err)
			} else {
				log.Infof("[API] 端点删除-已清理文件日志: endpointID=%d, instanceID=%s", id, instanceID)
			}
		}
	}

	log.Infof("[Master-%v] 端点及其隧道已删除", id)

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success: true,
		Message: "端点删除成功",
	})
}

// HandlePatchEndpoint PATCH /api/endpoints/{id}
func (h *EndpointHandler) HandlePatchEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]

	// 先解析 body，可能包含 id
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	var id int64
	if idStr != "" {
		parsed, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{
				Success: false,
				Error:   "无效的端点ID",
			})
			return
		}
		id = parsed
	} else {
		// 从 body 提取 id 字段（JSON 编码后数字为 float64）
		if idVal, ok := body["id"].(float64); ok {
			id = int64(idVal)
		} else {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{
				Success: false,
				Error:   "缺少端点ID",
			})
			return
		}
	}

	action, _ := body["action"].(string)
	switch action {
	case "rename":
		name, _ := body["name"].(string)
		name = strings.TrimSpace(name) // 清理和trim处理
		req := endpoint.UpdateEndpointRequest{
			ID:     id,
			Action: "rename",
			Name:   name,
		}
		if _, err := h.endpointService.UpdateEndpoint(req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: err.Error()})
			return
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: true,
			Message: "端点名称已更新",
			Endpoint: map[string]interface{}{
				"id":   id,
				"name": name,
			},
		})
	case "reconnect":
		if h.sseManager != nil {
			ep, err := h.endpointService.GetEndpointByID(id)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: "获取端点信息失败: " + err.Error()})
				return
			}

			// 先测试端点连接
			if err := h.testEndpointConnection(ep.URL, ep.APIPath, ep.APIKey, 5000); err != nil {
				log.Warnf("[Master-%v] 端点连接测试失败: %v", id, err)
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: "主控离线或无法连接: " + err.Error()})
				return
			}

			go func(eid int64) {
				log.Infof("[Master-%v] 手动重连端点，启动 SSE", eid)
				if err := h.sseManager.ConnectEndpoint(eid, ep.URL, ep.APIPath, ep.APIKey); err != nil {
					log.Errorf("[Master-%v] 手动重连端点失败: %v", eid, err)
				}
			}(id)
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: true, Message: "端点已重连"})
	case "disconnect":
		if h.sseManager != nil {
			go func(eid int64) {
				log.Infof("[Master-%v] 手动断开端点 SSE", eid)
				h.sseManager.DisconnectEndpoint(eid)

				// 更新端点状态为 OFFLINE
				// if err := h.endpointService.UpdateEndpointStatus(eid, endpoint.StatusOffline); err != nil {
				// 	log.Errorf("[Master-%v] 更新端点状态为 OFFLINE 失败: %v", eid, err)
				// } else {
				// 	log.Infof("[Master-%v] 端点状态已更新为 OFFLINE", eid)
				// }
			}(id)
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: true, Message: "端点已断开"})
	case "refresTunnel":
		if err := h.refreshTunnels(id); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: err.Error()})
			return
		}
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: true, Message: "隧道刷新完成"})
	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: "不支持的操作类型"})
	}
}

// HandleGetSimpleEndpoints GET /api/endpoints/simple
func (h *EndpointHandler) HandleGetSimpleEndpoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	excludeFailed := r.URL.Query().Get("excludeFailed") == "true"
	endpoints, err := h.endpointService.GetSimpleEndpoints(excludeFailed)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{Success: false, Error: err.Error()})
		return
	}

	if endpoints == nil {
		endpoints = []endpoint.SimpleEndpoint{}
	}
	json.NewEncoder(w).Encode(endpoints)
}

// TestConnectionRequest 测试端点连接请求
type TestConnectionRequest struct {
	URL     string `json:"url"`
	APIPath string `json:"apiPath"`
	APIKey  string `json:"apiKey"`
	Timeout int    `json:"timeout"`
}

// HandleTestEndpoint POST /api/endpoints/test
func (h *EndpointHandler) HandleTestEndpoint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "无效请求体"})
		return
	}

	// 对请求数据进行清理和trim处理
	req.URL = strings.TrimSpace(req.URL)
	req.APIPath = strings.TrimSpace(req.APIPath)
	req.APIKey = strings.TrimSpace(req.APIKey)

	if req.Timeout <= 0 {
		req.Timeout = 10000
	}

	testURL := req.URL + req.APIPath + "/events"

	client := &http.Client{
		Timeout: time.Duration(req.Timeout) * time.Millisecond,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	httpReq, err := http.NewRequest("GET", testURL, nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	httpReq.Header.Set("X-API-Key", req.APIKey)
	httpReq.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(httpReq)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "HTTP错误", "status": resp.StatusCode, "details": string(bodyBytes)})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "端点连接测试成功", "status": resp.StatusCode})
}

// HandleEndpointStatus GET /api/endpoints/status (SSE)
func (h *EndpointHandler) HandleEndpointStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	send := func() {
		endpoints, err := h.endpointService.GetEndpoints()
		if err != nil {
			return
		}
		data, _ := json.Marshal(endpoints)
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	send()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	notify := r.Context().Done()
	for {
		select {
		case <-notify:
			return
		case <-ticker.C:
			send()
		}
	}
}

// HandleEndpointLogs 根据 endpointId 查询最近 limit 条日志(从文件读取)
func (h *EndpointHandler) HandleEndpointLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少端点ID"})
		return
	}

	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	// 解析 limit 参数，默认 1000
	limit := 1000
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}

	// 解析 instanceId 参数
	instanceID := r.URL.Query().Get("instanceId")
	if instanceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少实例ID"})
		return
	}

	// 解析 days 参数，默认查询最近3天
	days := 3
	if d := r.URL.Query().Get("days"); d != "" {
		if v, err := strconv.Atoi(d); err == nil && v > 0 && v <= 30 {
			days = v
		}
	}

	// TODO: 这里需要获取文件日志管理器的引用
	// 暂时返回模拟数据，实际实现需要从SSE服务获取fileLogger
	logs := []map[string]interface{}{
		{
			"id":        1,
			"message":   fmt.Sprintf("端点%d实例%s的文件日志示例", endpointID, instanceID),
			"isHtml":    true,
			"traffic":   map[string]int64{"tcpRx": 0, "tcpTx": 0, "udpRx": 0, "udpTx": 0},
			"timestamp": time.Now(),
		},
	}

	// 返回数据，兼容旧前端结构
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":        logs,
		"success":     true,
		"storageMode": "file", // 标识为文件存储模式
		"info":        fmt.Sprintf("从文件读取端点%d最近%d天的日志，限制%d条", endpointID, days, limit),
	})
}

// HandleSearchEndpointLogs GET /api/endpoints/{id}/logs/search
// 支持查询条件: level, instanceId, start, end, page, size
func (h *EndpointHandler) HandleSearchEndpointLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "缺少端点ID"})
		return
	}
	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	q := r.URL.Query()
	level := strings.ToLower(q.Get("level"))
	instanceID := q.Get("instanceId")
	start := q.Get("start")
	end := q.Get("end")
	page, _ := strconv.Atoi(q.Get("page"))
	if page <= 0 {
		page = 1
	}
	size, _ := strconv.Atoi(q.Get("size"))
	if size <= 0 {
		size = 20
	}

	// 如果仅提供日期(yyyy-mm-dd)，转换为起止时间字符串
	constDateLayout := "2006-01-02"
	constDateTimeLayout := "2006-01-02 15:04:05"

	if len(start) == 10 {
		if t, err := time.Parse(constDateLayout, start); err == nil {
			start = t.Format(constDateTimeLayout) // 默认 00:00:00 已包含
		}
	}
	if len(end) == 10 {
		if t, err := time.Parse(constDateLayout, end); err == nil {
			// 设置为当天 23:59:59 末尾
			end = t.Add(24*time.Hour - time.Second).Format(constDateTimeLayout)
		}
	}

	db := h.endpointService.DB()

	// 构造GORM查询
	query := db.Model(&models.EndpointSSE{}).Where("endpoint_id = ? AND event_type = 'log'", endpointID)

	if instanceID != "" {
		query = query.Where("instance_id = ?", instanceID)
	}

	if start != "" {
		query = query.Where("created_at >= ?", start)
	}
	if end != "" {
		query = query.Where("created_at <= ?", end)
	}

	if level != "" && level != "all" {
		query = query.Where("LOWER(logs) LIKE ?", "%"+level+"%")
	}

	// 查询总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 查询分页数据
	offset := (page - 1) * size
	var endpointSSEList []models.EndpointSSE
	if err := query.Select("id, created_at, logs, instance_id").Order("created_at DESC").Limit(size).Offset(offset).Find(&endpointSSEList).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	logs := make([]map[string]interface{}, 0)
	for _, sse := range endpointSSEList {
		logsStr := ""
		if sse.Logs != nil {
			logsStr = *sse.Logs
		}
		instanceIDStr := ""
		if sse.InstanceID != "" {
			instanceIDStr = sse.InstanceID
		}

		logs = append(logs, map[string]interface{}{
			"id":         sse.ID,
			"createAt":   sse.CreatedAt.Format("2006-01-02 15:04:05"),
			"message":    logsStr,
			"instanceId": instanceIDStr,
			"level": func() string { // 简单解析日志行级别
				upper := strings.ToUpper(logsStr)
				switch {
				case strings.Contains(upper, "ERROR"):
					return "ERROR"
				case strings.Contains(upper, "WARN"):
					return "WARN"
				case strings.Contains(upper, "DEBUG"):
					return "DEBUG"
				case strings.Contains(upper, "EVENTS"):
					return "EVENTS"
				default:
					return "INFO"
				}
			}(),
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"total":   total,
		"page":    page,
		"size":    size,
		"totalPages": func() int {
			if size == 0 {
				return 0
			}
			totalInt := int(total)
			if totalInt%size == 0 {
				return totalInt / size
			} else {
				return totalInt/size + 1
			}
		}(),
		"logs": logs,
	})
}

// HandleRecycleList 获取指定端点回收站隧道 (GET /api/endpoints/{id}/recycle)
func (h *EndpointHandler) HandleRecycleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	vars := mux.Vars(r)
	idStr := vars["id"]
	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	db := h.endpointService.DB()

	// 查询 TunnelRecycle 表所有字段
	var recycledTunnels []models.TunnelRecycle
	if err := db.Where("endpoint_id = ?", endpointID).Order("id DESC").Find(&recycledTunnels).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	type recycleItem struct {
		ID            int64          `json:"id"`
		Name          string         `json:"name"`
		Mode          string         `json:"mode"`
		TunnelAddress string         `json:"tunnelAddress"`
		TunnelPort    string         `json:"tunnelPort"`
		TargetAddress string         `json:"targetAddress"`
		TargetPort    string         `json:"targetPort"`
		TLSMode       string         `json:"tlsMode"`
		CertPath      sql.NullString `json:"certPath"`
		KeyPath       sql.NullString `json:"keyPath"`
		LogLevel      string         `json:"logLevel"`
		CommandLine   string         `json:"commandLine"`
		InstanceID    sql.NullString `json:"instanceId"`
		Password      string         `json:"password"`
		TCPRx         int64          `json:"tcpRx"`
		TCPTx         int64          `json:"tcpTx"`
		UDPRx         int64          `json:"udpRx"`
		UDPTx         int64          `json:"udpTx"`
		Min           sql.NullInt64  `json:"min"`
		Max           sql.NullInt64  `json:"max"`
	}

	list := make([]recycleItem, 0)
	for _, tunnel := range recycledTunnels {
		item := recycleItem{
			ID:            tunnel.ID,
			Name:          tunnel.Name,
			Mode:          string(tunnel.Mode),
			TunnelAddress: tunnel.TunnelAddress,
			TunnelPort:    tunnel.TunnelPort,
			TargetAddress: tunnel.TargetAddress,
			TargetPort:    tunnel.TargetPort,
			TLSMode:       string(tunnel.TLSMode),
			LogLevel:      string(tunnel.LogLevel),
			CommandLine:   tunnel.CommandLine,
			Password:      "", // 密码字段不返回
			TCPRx:         tunnel.TCPRx,
			TCPTx:         tunnel.TCPTx,
			UDPRx:         tunnel.UDPRx,
			UDPTx:         tunnel.UDPTx,
		}

		// 处理可选字段
		if tunnel.CertPath != nil {
			item.CertPath = sql.NullString{String: *tunnel.CertPath, Valid: true}
		}
		if tunnel.KeyPath != nil {
			item.KeyPath = sql.NullString{String: *tunnel.KeyPath, Valid: true}
		}
		if tunnel.InstanceID != nil {
			item.InstanceID = sql.NullString{String: *tunnel.InstanceID, Valid: true}
		}
		if tunnel.Min != nil {
			item.Min = sql.NullInt64{Int64: *tunnel.Min, Valid: true}
		}
		if tunnel.Max != nil {
			item.Max = sql.NullInt64{Int64: *tunnel.Max, Valid: true}
		}

		list = append(list, item)
	}

	json.NewEncoder(w).Encode(list)
}

// HandleRecycleCount 获取回收站数量 (GET /api/endpoints/{id}/recycle/count)
func (h *EndpointHandler) HandleRecycleCount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	vars := mux.Vars(r)
	idStr := vars["id"]
	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	db := h.endpointService.DB()
	var count int64
	err = db.Model(&models.TunnelRecycle{}).Where("endpoint_id = ?", endpointID).Count(&count).Error
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"count": count})
}

// HandleRecycleDelete 删除回收站记录并清空相关 SSE (DELETE /api/endpoints/{endpointId}/recycle/{recycleId})
func (h *EndpointHandler) HandleRecycleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	epStr := vars["endpointId"]
	recStr := vars["recycleId"]

	endpointID, err1 := strconv.ParseInt(epStr, 10, 64)
	recycleID, err2 := strconv.ParseInt(recStr, 10, 64)
	if err1 != nil || err2 != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "无效的ID"})
		return
	}

	db := h.endpointService.DB()

	// 获取 instanceId
	var tunnelRecycle models.TunnelRecycle
	err := db.Select("instance_id").Where("id = ? AND endpoint_id = ?", recycleID, endpointID).First(&tunnelRecycle).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "记录不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		// 删除 TunnelRecycle 记录
		if err := tx.Delete(&models.TunnelRecycle{}, recycleID).Error; err != nil {
			return err
		}

		// 删除 EndpointSSE 记录
		if tunnelRecycle.InstanceID != nil && *tunnelRecycle.InstanceID != "" {
			if err := tx.Delete(&models.EndpointSSE{}, "endpoint_id = ? AND instance_id = ?", endpointID, *tunnelRecycle.InstanceID).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 清理文件日志（如果有有效的实例ID）
	if tunnelRecycle.InstanceID != nil && *tunnelRecycle.InstanceID != "" && h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		if err := h.sseManager.GetFileLogger().ClearLogs(endpointID, *tunnelRecycle.InstanceID); err != nil {
			log.Warnf("[API] 回收站删除-清理文件日志失败: endpointID=%d, instanceID=%s, err=%v", endpointID, *tunnelRecycle.InstanceID, err)
		} else {
			log.Infof("[API] 回收站删除-已清理文件日志: endpointID=%d, instanceID=%s", endpointID, *tunnelRecycle.InstanceID)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// HandleRecycleListAll 获取全部端点的回收站隧道 (GET /api/recycle)
func (h *EndpointHandler) HandleRecycleListAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db := h.endpointService.DB()

	// 使用GORM查询TunnelRecycle
	var recycledTunnels []models.TunnelRecycle
	if err := db.Order("id DESC").Find(&recycledTunnels).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 获取所有端点信息用于映射
	var endpoints []models.Endpoint
	if err := db.Find(&endpoints).Error; err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 创建端点ID到名称的映射
	endpointMap := make(map[int64]string)
	for _, ep := range endpoints {
		endpointMap[ep.ID] = ep.Name
	}

	type recycleItemAll struct {
		ID            int64          `json:"id"`
		EndpointID    int64          `json:"endpointId"`
		EndpointName  string         `json:"endpointName"`
		Name          string         `json:"name"`
		Mode          string         `json:"mode"`
		TunnelAddress string         `json:"tunnelAddress"`
		TunnelPort    string         `json:"tunnelPort"`
		TargetAddress string         `json:"targetAddress"`
		TargetPort    string         `json:"targetPort"`
		TLSMode       string         `json:"tlsMode"`
		CertPath      sql.NullString `json:"certPath"`
		KeyPath       sql.NullString `json:"keyPath"`
		LogLevel      string         `json:"logLevel"`
		CommandLine   string         `json:"commandLine"`
		InstanceID    sql.NullString `json:"instanceId"`
		Password      string         `json:"password"`
		TCPRx         int64          `json:"tcpRx"`
		TCPTx         int64          `json:"tcpTx"`
		UDPRx         int64          `json:"udpRx"`
		UDPTx         int64          `json:"udpTx"`
		Min           sql.NullInt64  `json:"min"`
		Max           sql.NullInt64  `json:"max"`
	}

	list := make([]recycleItemAll, 0)
	for _, tunnel := range recycledTunnels {
		item := recycleItemAll{
			ID:            tunnel.ID,
			EndpointID:    tunnel.EndpointID,
			EndpointName:  endpointMap[tunnel.EndpointID],
			Name:          tunnel.Name,
			Mode:          string(tunnel.Mode),
			TunnelAddress: tunnel.TunnelAddress,
			TunnelPort:    tunnel.TunnelPort,
			TargetAddress: tunnel.TargetAddress,
			TargetPort:    tunnel.TargetPort,
			TLSMode:       string(tunnel.TLSMode),
			LogLevel:      string(tunnel.LogLevel),
			CommandLine:   tunnel.CommandLine,
			Password:      "", // 密码字段不返回
			TCPRx:         tunnel.TCPRx,
			TCPTx:         tunnel.TCPTx,
			UDPRx:         tunnel.UDPRx,
			UDPTx:         tunnel.UDPTx,
		}

		// 处理可选字段
		if tunnel.CertPath != nil {
			item.CertPath = sql.NullString{String: *tunnel.CertPath, Valid: true}
		}
		if tunnel.KeyPath != nil {
			item.KeyPath = sql.NullString{String: *tunnel.KeyPath, Valid: true}
		}
		if tunnel.InstanceID != nil {
			item.InstanceID = sql.NullString{String: *tunnel.InstanceID, Valid: true}
		}
		if tunnel.Min != nil {
			item.Min = sql.NullInt64{Int64: *tunnel.Min, Valid: true}
		}
		if tunnel.Max != nil {
			item.Max = sql.NullInt64{Int64: *tunnel.Max, Valid: true}
		}

		list = append(list, item)
	}

	json.NewEncoder(w).Encode(list)
}

// HandleRecycleClearAll 清空全部回收站记录 (DELETE /api/recycle)
func (h *EndpointHandler) HandleRecycleClearAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	db := h.endpointService.DB()

	// 先获取所有回收站记录用于清理文件日志
	var recycleItems []struct {
		EndpointID int64
		InstanceID sql.NullString
	}

	var allRecycles []models.TunnelRecycle
	if err := db.Select("endpoint_id, instance_id").Where("instance_id IS NOT NULL AND instance_id != ''").Find(&allRecycles).Error; err == nil {
		for _, recycle := range allRecycles {
			item := struct {
				EndpointID int64
				InstanceID sql.NullString
			}{
				EndpointID: recycle.EndpointID,
			}
			if recycle.InstanceID != nil {
				item.InstanceID = sql.NullString{String: *recycle.InstanceID, Valid: true}
			}
			recycleItems = append(recycleItems, item)
		}
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		// 删除 EndpointSSE 记录中对应实例
		if err := tx.Where("instance_id IN (SELECT instance_id FROM tunnel_recycles WHERE instance_id IS NOT NULL AND instance_id != '')").Delete(&models.EndpointSSE{}).Error; err != nil {
			return err
		}

		// 删除所有回收站记录
		if err := tx.Where("1 = 1").Delete(&models.TunnelRecycle{}).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 清理所有相关的文件日志
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		for _, item := range recycleItems {
			if item.InstanceID.Valid {
				if err := h.sseManager.GetFileLogger().ClearLogs(item.EndpointID, item.InstanceID.String); err != nil {
					log.Warnf("[API] 清空回收站-清理文件日志失败: endpointID=%d, instanceID=%s, err=%v", item.EndpointID, item.InstanceID.String, err)
				} else {
					log.Infof("[API] 清空回收站-已清理文件日志: endpointID=%d, instanceID=%s", item.EndpointID, item.InstanceID.String)
				}
			}
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// refreshTunnels 同步指定端点的隧道信息
func (h *EndpointHandler) refreshTunnels(endpointID int64) error {
	log.Infof("[API] 刷新端点 %v 的隧道信息", endpointID)

	// 获取端点信息
	ep, err := h.endpointService.GetEndpointByID(endpointID)
	if err != nil {
		log.Errorf("[API] 获取端点信息失败: %v", err)
		return fmt.Errorf("获取端点信息失败: %v", err)
	}

	// 创建 NodePass 客户端并获取实例列表
	npClient := nodepass.NewClient(ep.URL, ep.APIPath, ep.APIKey, nil)
	instances, err := npClient.GetInstances()
	if err != nil {
		log.Errorf("[API] 获取实例列表失败: %v", err)
		return fmt.Errorf("获取实例列表失败: %v", err)
	}

	db := h.endpointService.DB()
	if db == nil {
		return fmt.Errorf("数据库连接不可用")
	}

	// 记录 NodePass 实例 ID，便于后续删除不存在的隧道
	instanceIDSet := make(map[string]struct{})

	// 使用事务执行
	err = db.Transaction(func(tx *gorm.DB) error {
		// Upsert 操作
		for _, inst := range instances {
			if inst.Type == "" {
				continue
			}
			instanceIDSet[inst.ID] = struct{}{}

			parsed := nodepass.ParseTunnelURL(inst.URL)
			if parsed == nil {
				log.Warnf("[API] 端点 %d 更新：无法解析隧道URL: %s", endpointID, inst.URL)
				continue
			}

			// 设置必要的字段
			parsed.EndpointID = endpointID
			parsed.InstanceID = &inst.ID
			parsed.Status = models.TunnelStatus(inst.Status)
			parsed.TCPRx = inst.TCPRx
			parsed.TCPTx = inst.TCPTx
			parsed.UDPRx = inst.UDPRx
			parsed.UDPTx = inst.UDPTx
			parsed.Restart = &inst.Restart
			parsed.CommandLine = inst.URL
			parsed.UpdatedAt = time.Now()

			// 检查隧道是否存在
			var tunnel models.Tunnel
			err := tx.Where("instance_id = ? AND endpoint_id = ?", inst.ID, endpointID).First(&tunnel).Error
			if err != nil && err != gorm.ErrRecordNotFound {
				return fmt.Errorf("查询隧道失败: %v", err)
			}

			if err == gorm.ErrRecordNotFound {
				// 插入新隧道
				name := fmt.Sprintf("auto-%s", inst.ID)
				if inst.Alias != "" {
					name = inst.Alias
					log.Infof("[API] 端点 %d 更新：使用别名作为隧道名称: %s -> %s", endpointID, inst.ID, name)
				}
				parsed.Name = name

				err = tx.Create(parsed).Error
				if err != nil {
					return fmt.Errorf("创建隧道失败: %v", err)
				}
				log.Infof("[API] 端点 %d 更新：插入新隧道 %v", endpointID, inst.ID)
			} else {
				// 更新已有隧道
				var nameParam interface{}
				if inst.Alias != "" {
					nameParam = inst.Alias
					log.Infof("[API] 端点 %d 更新：使用别名更新隧道名称: %s -> %s", endpointID, inst.ID, inst.Alias)
				}

				// 准备更新数据
				updateData := map[string]interface{}{
					"type":             parsed.Type,
					"tunnel_address":   parsed.TunnelAddress,
					"tunnel_port":      parsed.TunnelPort,
					"target_address":   parsed.TargetAddress,
					"target_port":      parsed.TargetPort,
					"tls_mode":         parsed.TLSMode,
					"log_level":        parsed.LogLevel,
					"command_line":     inst.URL,
					"status":           models.TunnelStatus(inst.Status),
					"tcp_rx":           inst.TCPRx,
					"tcp_tx":           inst.TCPTx,
					"udp_rx":           inst.UDPRx,
					"udp_tx":           inst.UDPTx,
					"restart":          inst.Restart,
					"mode":             parsed.Mode,
					"read":             parsed.Read,
					"rate":             parsed.Rate,
					"cert_path":        parsed.CertPath,
					"key_path":         parsed.KeyPath,
					"password":         parsed.Password,
					"min":              parsed.Min,
					"max":              parsed.Max,
					"enable_sse_store": true,
					"enable_log_store": true,
					"updated_at":       time.Now(),
				}

				// 如果有别名，则更新名称
				if nameParam != nil {
					updateData["name"] = nameParam
				}

				err = tx.Model(&models.Tunnel{}).Where("id = ?", tunnel.ID).Updates(updateData).Error
				if err != nil {
					return fmt.Errorf("更新隧道失败: %v", err)
				}
				log.Infof("[API] 端点 %d 更新：更新隧道信息 %v", endpointID, inst.ID)
			}
		}

		// 删除已不存在的隧道
		var existingTunnels []models.Tunnel
		err = tx.Select("id, instance_id").Where("endpoint_id = ?", endpointID).Find(&existingTunnels).Error
		if err != nil {
			return fmt.Errorf("查询现有隧道失败: %v", err)
		}

		for _, tunnel := range existingTunnels {
			if tunnel.InstanceID != nil {
				if _, ok := instanceIDSet[*tunnel.InstanceID]; !ok {
					err = tx.Delete(&models.Tunnel{}, tunnel.ID).Error
					if err != nil {
						return fmt.Errorf("删除隧道失败: %v", err)
					}
					log.Infof("[API] 端点 %d 更新：删除隧道 %v", endpointID, tunnel.ID)
				}
			}
		}

		log.Infof("[API] 端点 %d 更新：将异步更新隧道数量", endpointID)
		return nil
	})

	// 如果事务成功，异步更新隧道计数
	if err == nil {
		go func(id int64) {
			time.Sleep(50 * time.Millisecond)
			// 调用端点服务的隧道计数更新方法
			updateEndpointTunnelCount(id)
		}(endpointID)
	}

	return err
}

// testEndpointConnection 测试端点连接是否可用
func (h *EndpointHandler) testEndpointConnection(url, apiPath, apiKey string, timeoutMs int) error {
	testURL := url + apiPath + "/events"

	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			Proxy:           ieproxy.GetProxyFunc(),
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	httpReq, err := http.NewRequest("GET", testURL, nil)
	if err != nil {
		return fmt.Errorf("创建请求失败: %v", err)
	}
	httpReq.Header.Set("X-API-Key", apiKey)
	httpReq.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("连接失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP错误: %d", resp.StatusCode)
	}

	return nil
}

// HandleGetEndpointInfo 获取端点系统信息
func (h *EndpointHandler) HandleGetEndpointInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 获取端点信息
	ep, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 创建NodePass客户端
	client := nodepass.NewClient(ep.URL, ep.APIPath, ep.APIKey, nil)

	// 尝试获取系统信息 (处理低版本API不存在的情况)
	var info *nodepass.NodePassInfo
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Warnf("[Master-%v] 获取系统信息失败(可能为低版本): %v", ep.ID, r)
			}
		}()

		info, err = client.GetInfo()
		if err != nil {
			log.Warnf("[Master-%v] 获取系统信息失败: %v", ep.ID, err)
			// 不返回错误，继续处理
		}
	}()

	// 如果成功获取到信息，更新数据库
	if info != nil && err == nil {
		epInfo := endpoint.NodePassInfo{
			OS:     info.OS,
			Arch:   info.Arch,
			Ver:    info.Ver,
			Name:   info.Name,
			Log:    info.Log,
			TLS:    info.TLS,
			Crt:    info.Crt,
			Key:    info.Key,
			Uptime: info.Uptime, // 直接传递指针，service层会处理nil情况
		}
		if updateErr := h.endpointService.UpdateEndpointInfo(id, epInfo); updateErr != nil {
			log.Errorf("[Master-%v] 更新系统信息失败: %v", ep.ID, updateErr)
		} else {
			// 在日志中显示uptime信息（如果可用）
			uptimeMsg := "未知"
			if info.Uptime != nil {
				uptimeMsg = fmt.Sprintf("%d秒", *info.Uptime)
			}
			log.Infof("[Master-%v] 系统信息已更新: OS=%s, Arch=%s, Ver=%s, Uptime=%s", ep.ID, info.OS, info.Arch, info.Ver, uptimeMsg)
		}

		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success:  true,
			Message:  "系统信息获取成功",
			Endpoint: info,
		})
	} else {
		// 返回当前已存储的信息
		var storedUptime *int64
		if ep.Uptime != nil && *ep.Uptime > 0 {
			storedUptime = ep.Uptime
		}

		infoResponse := endpoint.NodePassInfo{
			OS: func() string {
				if ep.OS != nil {
					return *ep.OS
				}
				return ""
			}(),
			Arch: func() string {
				if ep.Arch != nil {
					return *ep.Arch
				}
				return ""
			}(),
			Ver: func() string {
				if ep.Ver != nil {
					return *ep.Ver
				}
				return ""
			}(),
			Name: ep.Name,
			Log: func() string {
				if ep.Log != nil {
					return *ep.Log
				}
				return ""
			}(),
			TLS: func() string {
				if ep.TLS != nil {
					return *ep.TLS
				}
				return ""
			}(),
			Crt: func() string {
				if ep.Crt != nil {
					return *ep.Crt
				}
				return ""
			}(),
			Key: func() string {
				if ep.KeyPath != nil {
					return *ep.KeyPath
				}
				return ""
			}(),
			Uptime: storedUptime,
		}

		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success:  true,
			Message:  "返回已存储的系统信息",
			Endpoint: infoResponse,
		})
	}
}

// HandleGetEndpointDetail 获取端点详细信息
func (h *EndpointHandler) HandleGetEndpointDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 先获取端点基本信息（用于连接NodePass API）
	ep, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 尝试调用NodePass API获取最新信息并更新数据库
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Warnf("[Master-%v] 获取最新系统信息失败(panic): %v", ep.ID, r)
			}
		}()

		// 创建NodePass客户端
		client := nodepass.NewClient(ep.URL, ep.APIPath, ep.APIKey, nil)

		// 尝试获取系统信息
		info, err := client.GetInfo()
		if err != nil {
			log.Warnf("[Master-%v] 调用NodePass API获取系统信息失败: %v", ep.ID, err)
			return
		}

		if info != nil {
			// 更新数据库中的系统信息
			epInfo := endpoint.NodePassInfo{
				OS:     info.OS,
				Arch:   info.Arch,
				Ver:    info.Ver,
				Name:   info.Name,
				Log:    info.Log,
				TLS:    info.TLS,
				Crt:    info.Crt,
				Key:    info.Key,
				Uptime: info.Uptime,
			}
			if updateErr := h.endpointService.UpdateEndpointInfo(id, epInfo); updateErr != nil {
				log.Errorf("[Master-%v] 更新系统信息到数据库失败: %v", ep.ID, updateErr)
			} else {
				// 在日志中显示uptime信息（如果可用）
				uptimeMsg := "未知"
				if info.Uptime != nil {
					uptimeMsg = fmt.Sprintf("%d秒", *info.Uptime)
				}
				log.Infof("[Master-%v] 详情页刷新：系统信息已更新: OS=%s, Arch=%s, Ver=%s, Uptime=%s", ep.ID, info.OS, info.Arch, info.Ver, uptimeMsg)
			}
		}
	}()

	// 重新从数据库获取最新的端点详细信息
	updatedEp, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(endpoint.EndpointResponse{
		Success:  true,
		Message:  "获取端点详情成功",
		Endpoint: updatedEp,
	})
}

// HandleEndpointFileLogs 获取端点文件日志
func (h *EndpointHandler) HandleEndpointFileLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	endpointID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpoint ID", http.StatusBadRequest)
		return
	}

	// 获取查询参数
	instanceID := r.URL.Query().Get("instanceId")
	daysStr := r.URL.Query().Get("days")
	if instanceID == "" {
		http.Error(w, "Missing instanceId parameter", http.StatusBadRequest)
		return
	}

	days := 7 // 默认查询最近7天
	if daysStr != "" {
		if d, err := strconv.Atoi(daysStr); err == nil && d > 0 && d <= 30 {
			days = d
		}
	}

	// 从文件日志管理器读取日志（最多1000条）
	logs, err := h.sseManager.GetFileLogger().ReadRecentLogs(endpointID, instanceID, days, 1000)
	if err != nil {
		log.Warnf("[API]读取文件日志失败: %v", err)
		http.Error(w, "Failed to read file logs", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success":   true,
		"logs":      logs,
		"storage":   "file",
		"days":      days,
		"timestamp": time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleClearEndpointFileLogs 清空端点文件日志
func (h *EndpointHandler) HandleClearEndpointFileLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	endpointID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpoint ID", http.StatusBadRequest)
		return
	}

	// 获取查询参数
	instanceID := r.URL.Query().Get("instanceId")
	if instanceID == "" {
		http.Error(w, "Missing instanceId parameter", http.StatusBadRequest)
		return
	}

	// 清空文件日志
	err = h.sseManager.GetFileLogger().ClearLogs(endpointID, instanceID)
	if err != nil {
		log.Warnf("[API]清空文件日志失败: %v", err)
		http.Error(w, "Failed to clear file logs", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "文件日志已清空",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleEndpointStats 获取端点统计信息
// GET /api/endpoints/{id}/stats
func (h *EndpointHandler) HandleEndpointStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	endpointID, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpoint ID", http.StatusBadRequest)
		return
	}

	// 获取隧道数量和流量统计
	tunnelCount, totalTcpIn, totalTcpOut, totalUdpIn, totalUdpOut, err := h.getTunnelStats(endpointID)
	if err != nil {
		log.Errorf("获取隧道统计失败: %v", err)
		http.Error(w, "获取隧道统计失败", http.StatusInternalServerError)
		return
	}

	// 获取文件日志统计
	fileLogCount, fileLogSize, err := h.getFileLogStats(endpointID)
	if err != nil {
		log.Errorf("获取文件日志统计失败: %v", err)
		// 文件日志统计失败不影响其他统计，设置为0
		fileLogCount = 0
		fileLogSize = 0
	}

	// 计算总流量
	totalTrafficIn := totalTcpIn + totalUdpIn
	totalTrafficOut := totalTcpOut + totalUdpOut

	stats := map[string]interface{}{
		"tunnelCount":     tunnelCount,
		"fileLogCount":    fileLogCount,
		"fileLogSize":     fileLogSize,
		"totalTrafficIn":  totalTrafficIn,
		"totalTrafficOut": totalTrafficOut,
		"tcpTrafficIn":    totalTcpIn,
		"tcpTrafficOut":   totalTcpOut,
		"udpTrafficIn":    totalUdpIn,
		"udpTrafficOut":   totalUdpOut,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}

// getTunnelStats 获取隧道数量和流量统计
func (h *EndpointHandler) getTunnelStats(endpointID int64) (int, int64, int64, int64, int64, error) {
	var result struct {
		Count  int   `json:"count"`
		TcpIn  int64 `json:"tcp_in"`
		TcpOut int64 `json:"tcp_out"`
		UdpIn  int64 `json:"udp_in"`
		UdpOut int64 `json:"udp_out"`
	}

	err := h.endpointService.DB().Raw(`
		SELECT 
			COUNT(*) as count,
			COALESCE(SUM(tcp_rx), 0) as tcp_in,
			COALESCE(SUM(tcp_tx), 0) as tcp_out,
			COALESCE(SUM(udp_rx), 0) as udp_in,
			COALESCE(SUM(udp_tx), 0) as udp_out
		FROM tunnels 
		WHERE endpoint_id = ?
	`, endpointID).Scan(&result).Error

	return result.Count, result.TcpIn, result.TcpOut, result.UdpIn, result.UdpOut, err
}

// getFileLogStats 获取文件日志统计
func (h *EndpointHandler) getFileLogStats(endpointID int64) (int, int64, error) {
	if h.sseManager == nil {
		return 0, 0, fmt.Errorf("SSE管理器未初始化")
	}

	// 获取文件日志管理器
	fileLogger := h.sseManager.GetFileLogger()
	if fileLogger == nil {
		return 0, 0, fmt.Errorf("文件日志管理器未初始化")
	}

	// 计算该端点的文件日志统计
	endpointDir := fmt.Sprintf("logs/endpoint_%d", endpointID)
	fileCount, totalSize := h.calculateDirStats(endpointDir)

	return fileCount, totalSize, nil
}

// calculateDirStats 计算目录下的文件统计
func (h *EndpointHandler) calculateDirStats(dirPath string) (int, int64) {
	fileCount := 0
	totalSize := int64(0)

	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // 忽略错误，继续处理
		}

		if !info.IsDir() && filepath.Ext(path) == ".log" {
			fileCount++
			totalSize += info.Size()
		}

		return nil
	})

	return fileCount, totalSize
}

// updateEndpointTunnelCount 更新端点的隧道计数，使用重试机制避免死锁
func updateEndpointTunnelCount(endpointID int64) {
	err := db.ExecuteWithRetry(func(db *gorm.DB) error {
		return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
			Update("tunnel_count", gorm.Expr("(SELECT COUNT(*) FROM tunnels WHERE endpoint_id = ?)", endpointID)).Error
	})

	if err != nil {
		log.Errorf("[API]更新端点 %d 隧道计数失败: %v", endpointID, err)
	} else {
		log.Debugf("[API]端点 %d 隧道计数已更新", endpointID)
	}
}
