package api

import (
	log "NodePassDash/internal/log"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"

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

	// 如果存在 SSE 监听，先断开
	if h.sseManager != nil {
		log.Infof("[Master-%v] 删除端点前，先断开 SSE 监听", id)
		h.sseManager.DisconnectEndpoint(id)
		log.Infof("[Master-%v] 已断开 SSE 监听", id)
	}

	if err := h.endpointService.DeleteEndpoint(id); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
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
			go func(eid int64) {
				ep, err := h.endpointService.GetEndpointByID(eid)
				if err == nil {
					log.Infof("[Master-%v] 手动重连端点，启动 SSE", eid)
					if err := h.sseManager.ConnectEndpoint(eid, ep.URL, ep.APIPath, ep.APIKey); err != nil {
						log.Errorf("[Master-%v] 手动重连端点失败: %v", eid, err)
					}
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

// HandleEndpointLogs GET /api/endpoints/{id}/logs
// 根据 endpointId 查询最近 limit 条日志(eventType = 'log')
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

	db := h.endpointService.DB()

	rows, err := db.Query(`SELECT id, logs, tcpRx, tcpTx, udpRx, udpTx, createdAt FROM "EndpointSSE" WHERE endpointId = ? AND eventType = 'log' ORDER BY createdAt DESC LIMIT ?`, endpointID, limit)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	defer rows.Close()

	logs := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int64
		var logsStr sql.NullString
		var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
		var createdAt time.Time
		if err := rows.Scan(&id, &logsStr, &tcpRx, &tcpTx, &udpRx, &udpTx, &createdAt); err == nil {
			logs = append(logs, map[string]interface{}{
				"id":        id,
				"message":   logsStr.String,
				"isHtml":    true,
				"traffic":   map[string]int64{"tcpRx": tcpRx.Int64, "tcpTx": tcpTx.Int64, "udpRx": udpRx.Int64, "udpTx": udpTx.Int64},
				"timestamp": createdAt,
			})
		}
	}

	// 返回数据，兼容旧前端结构
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":    logs,
		"success": true,
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

	// 构造动态 SQL
	where := []string{"endpointId = ?", "eventType = 'log'"}
	args := []interface{}{endpointID}

	if instanceID != "" {
		where = append(where, "instanceId = ?")
		args = append(args, instanceID)
	}

	if start != "" {
		where = append(where, "createdAt >= ?")
		args = append(args, start)
	}
	if end != "" {
		where = append(where, "createdAt <= ?")
		args = append(args, end)
	}

	if level != "" && level != "all" {
		where = append(where, "LOWER(logs) LIKE ?")
		args = append(args, "%"+level+"%")
	}

	whereSQL := strings.Join(where, " AND ")

	// 查询总数
	countSQL := "SELECT COUNT(*) FROM \"EndpointSSE\" WHERE " + whereSQL
	var total int
	if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 查询分页数据
	offset := (page - 1) * size
	dataSQL := "SELECT id, createdAt, logs, instanceId FROM \"EndpointSSE\" WHERE " + whereSQL + " ORDER BY createdAt DESC LIMIT ? OFFSET ?"
	argsWithLim := append(args, size, offset)
	rows, err := db.Query(dataSQL, argsWithLim...)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	defer rows.Close()

	logs := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id int64
		var createdAt time.Time
		var logsStr sql.NullString
		var instanceID sql.NullString
		if err := rows.Scan(&id, &createdAt, &logsStr, &instanceID); err == nil {
			logs = append(logs, map[string]interface{}{
				"id":       id,
				"createAt": createdAt.Format("2006-01-02 15:04:05"),
				"message":  logsStr.String,
				"instanceId": func() string {
					if instanceID.Valid {
						return instanceID.String
					}
					return ""
				}(),
				"level": func() string { // 简单解析日志行级别
					upper := strings.ToUpper(logsStr.String)
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
			if total%size == 0 {
				return total / size
			} else {
				return total/size + 1
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
	rows, err := db.Query(`SELECT id, name, mode, tunnelAddress, tunnelPort, targetAddress, targetPort, tlsMode,
		certPath, keyPath, logLevel, commandLine, instanceId, tcpRx, tcpTx, udpRx, udpTx, min, max
		FROM "TunnelRecycle" WHERE endpointId = ? ORDER BY id DESC`, endpointID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	defer rows.Close()

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
		TCPRx         int64          `json:"tcpRx"`
		TCPTx         int64          `json:"tcpTx"`
		UDPRx         int64          `json:"udpRx"`
		UDPTx         int64          `json:"udpTx"`
		Min           sql.NullInt64  `json:"min"`
		Max           sql.NullInt64  `json:"max"`
	}

	list := make([]recycleItem, 0)
	for rows.Next() {
		var item recycleItem
		if err := rows.Scan(
			&item.ID, &item.Name, &item.Mode, &item.TunnelAddress, &item.TunnelPort, &item.TargetAddress, &item.TargetPort, &item.TLSMode,
			&item.CertPath, &item.KeyPath, &item.LogLevel, &item.CommandLine, &item.InstanceID, &item.TCPRx, &item.TCPTx, &item.UDPRx, &item.UDPTx, &item.Min, &item.Max,
		); err == nil {
			list = append(list, item)
		}
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
	var count int
	err = db.QueryRow(`SELECT COUNT(*) FROM "TunnelRecycle" WHERE endpointId = ?`, endpointID).Scan(&count)
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
	var instanceNS sql.NullString
	err := db.QueryRow(`SELECT instanceId FROM "TunnelRecycle" WHERE id = ? AND endpointId = ?`, recycleID, endpointID).Scan(&instanceNS)
	if err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "记录不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	tx, err := db.Begin()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 删除 TunnelRecycle 记录
	if _, err := tx.Exec(`DELETE FROM "TunnelRecycle" WHERE id = ?`, recycleID); err != nil {
		tx.Rollback()
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 删除 EndpointSSE 记录
	if instanceNS.Valid {
		if _, err := tx.Exec(`DELETE FROM "EndpointSSE" WHERE endpointId = ? AND instanceId = ?`, endpointID, instanceNS.String); err != nil {
			tx.Rollback()
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

// refreshTunnels 同步指定端点的隧道信息
func (h *EndpointHandler) refreshTunnels(endpointID int64) error {
	log.Infof("[API] 刷新端点 %v 的隧道信息", endpointID)
	// 获取端点信息
	ep, err := h.endpointService.GetEndpointByID(endpointID)
	if err != nil {
		return err
	}

	// 创建 NodePass 客户端并获取实例列表
	npClient := nodepass.NewClient(ep.URL, ep.APIPath, ep.APIKey, nil)
	instances, err := npClient.GetInstances()
	if err != nil {
		return err
	}

	db := h.endpointService.DB()
	tx, err := db.Begin()
	if err != nil {
		return err
	}

	// 记录 NodePass 实例 ID，便于后续删除不存在的隧道
	instanceIDSet := make(map[string]struct{})

	// Upsert
	for _, inst := range instances {
		if inst.Type == "" {
			continue
		}
		instanceIDSet[inst.ID] = struct{}{}

		parsed := parseInstanceURL(inst.URL, inst.Type)

		convPort := func(p string) int {
			v, _ := strconv.Atoi(p)
			return v
		}
		convInt := func(s string) int {
			v, _ := strconv.Atoi(s)
			return v
		}

		// 检查隧道是否存在
		var tunnelID int64
		err := tx.QueryRow(`SELECT id FROM "Tunnel" WHERE instanceId = ?`, inst.ID).Scan(&tunnelID)
		if err != nil && err != sql.ErrNoRows {
			tx.Rollback()
			return err
		}

		if err == sql.ErrNoRows {
			// 插入新隧道
			name := fmt.Sprintf("auto-%s", inst.ID)
			_, err = tx.Exec(`INSERT INTO "Tunnel" (
				instanceId, name, endpointId, mode, tunnelAddress, tunnelPort, targetAddress, targetPort,
				tlsMode, certPath, keyPath, logLevel, commandLine, status, min, max,
				tcpRx, tcpTx, udpRx, udpTx, createdAt, updatedAt)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				inst.ID, name, endpointID, inst.Type,
				parsed.TunnelAddress, convPort(parsed.TunnelPort), parsed.TargetAddress, convPort(parsed.TargetPort),
				parsed.TLSMode, parsed.CertPath, parsed.KeyPath, parsed.LogLevel, inst.URL, inst.Status,
				convInt(parsed.Min), convInt(parsed.Max),
				inst.TCPRx, inst.TCPTx, inst.UDPRx, inst.UDPTx)
			if err != nil {
				tx.Rollback()
				return err
			}
			log.Infof("[API] 端点 %d 更新：插入新隧道 %v", endpointID, inst.ID)
		} else {
			// 更新已有隧道（除 name 外其它字段全部更新）
			_, err = tx.Exec(`UPDATE "Tunnel" SET 
				mode = ?, tunnelAddress = ?, tunnelPort = ?, targetAddress = ?, targetPort = ?,
				tlsMode = ?, certPath = ?, keyPath = ?, logLevel = ?, commandLine = ?, status = ?,
				min = ?, max = ?, tcpRx = ?, tcpTx = ?, udpRx = ?, udpTx = ?, updatedAt = CURRENT_TIMESTAMP
				WHERE id = ?`,
				inst.Type, parsed.TunnelAddress, convPort(parsed.TunnelPort), parsed.TargetAddress, convPort(parsed.TargetPort),
				parsed.TLSMode, parsed.CertPath, parsed.KeyPath, parsed.LogLevel, inst.URL, inst.Status,
				convInt(parsed.Min), convInt(parsed.Max), inst.TCPRx, inst.TCPTx, inst.UDPRx, inst.UDPTx, tunnelID)
			if err != nil {
				tx.Rollback()
				return err
			}
			log.Infof("[API] 端点 %d 更新：更新隧道信息 %v", endpointID, inst.ID)
		}
	}

	// 删除已不存在的隧道
	rows, err := tx.Query(`SELECT id, instanceId FROM "Tunnel" WHERE endpointId = ?`, endpointID)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id int64
		var iid string
		if err := rows.Scan(&id, &iid); err == nil {
			if _, ok := instanceIDSet[iid]; !ok {
				if _, err := tx.Exec(`DELETE FROM "Tunnel" WHERE id = ?`, id); err != nil {
					tx.Rollback()
					return err
				}
				log.Infof("[API] 端点 %d 更新：删除隧道 %v", endpointID, id)
			}
		}
	}

	// 更新端点隧道数量
	_, _ = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?) WHERE id = ?`, endpointID, endpointID)
	log.Infof("[API] 端点 %d 更新：更新隧道数量", endpointID)
	return tx.Commit()
}

// parseInstanceURL 解析隧道 URL，逻辑与 tunnel 包保持一致（简化复制）
func parseInstanceURL(raw, mode string) struct {
	TunnelAddress string
	TunnelPort    string
	TargetAddress string
	TargetPort    string
	TLSMode       string
	LogLevel      string
	CertPath      string
	KeyPath       string
	Min           string
	Max           string
} {
	type parsedURL struct {
		TunnelAddress string
		TunnelPort    string
		TargetAddress string
		TargetPort    string
		TLSMode       string
		LogLevel      string
		CertPath      string
		KeyPath       string
		Min           string
		Max           string
	}

	res := parsedURL{TLSMode: "inherit", LogLevel: "inherit"}

	if raw == "" {
		return res
	}

	// 去协议
	if idx := strings.Index(raw, "://"); idx != -1 {
		raw = raw[idx+3:]
	}

	// query 部分
	var query string
	if qIdx := strings.Index(raw, "?"); qIdx != -1 {
		query = raw[qIdx+1:]
		raw = raw[:qIdx]
	}

	// host 与 path
	var hostPart, pathPart string
	if pIdx := strings.Index(raw, "/"); pIdx != -1 {
		hostPart = raw[:pIdx]
		pathPart = raw[pIdx+1:]
	} else {
		hostPart = raw
	}

	if hostPart != "" {
		if strings.Contains(hostPart, ":") {
			parts := strings.SplitN(hostPart, ":", 2)
			res.TunnelAddress = parts[0]
			res.TunnelPort = parts[1]
		} else {
			if _, err := strconv.Atoi(hostPart); err == nil {
				res.TunnelPort = hostPart
			} else {
				res.TunnelAddress = hostPart
			}
		}
	}

	if pathPart != "" {
		if strings.Contains(pathPart, ":") {
			parts := strings.SplitN(pathPart, ":", 2)
			res.TargetAddress = parts[0]
			res.TargetPort = parts[1]
		} else {
			if _, err := strconv.Atoi(pathPart); err == nil {
				res.TargetPort = pathPart
			} else {
				res.TargetAddress = pathPart
			}
		}
	}

	if query != "" {
		for _, kv := range strings.Split(query, "&") {
			if kv == "" {
				continue
			}
			parts := strings.SplitN(kv, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key, val := parts[0], parts[1]
			switch key {
			case "tls":
				if mode == "server" {
					switch val {
					case "0":
						res.TLSMode = "mode0"
					case "1":
						res.TLSMode = "mode1"
					case "2":
						res.TLSMode = "mode2"
					}
				}
			case "log":
				res.LogLevel = strings.ToLower(val)
			case "crt":
				res.CertPath = val
			case "key":
				res.KeyPath = val
			case "min":
				res.Min = val
			case "max":
				res.Max = val
			}
		}
	}

	return res
}
