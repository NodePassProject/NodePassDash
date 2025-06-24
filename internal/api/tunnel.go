package api

import (
	log "NodePassDash/internal/log"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"NodePassDash/internal/tunnel"
)

// TunnelHandler 隧道相关的处理器
type TunnelHandler struct {
	tunnelService *tunnel.Service
}

// NewTunnelHandler 创建隧道处理器实例
func NewTunnelHandler(tunnelService *tunnel.Service) *TunnelHandler {
	return &TunnelHandler{
		tunnelService: tunnelService,
	}
}

// HandleGetTunnels 获取隧道列表
func (h *TunnelHandler) HandleGetTunnels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tunnels, err := h.tunnelService.GetTunnels()
	if err != nil {
		log.Errorf("[API] 获取隧道列表失败: %v", err)

		// 构建详细的错误信息
		errorDetail := map[string]interface{}{
			"success": false,
			"error":   "获取隧道列表失败: " + err.Error(),
			"details": map[string]interface{}{
				"timestamp": time.Now().Format(time.RFC3339),
				"operation": "GetTunnels",
				"hint":      "可能存在数据格式问题，建议检查数据库中的端口字段是否包含非数字内容",
			},
		}

		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(errorDetail)
		return
	}

	if tunnels == nil {
		tunnels = []tunnel.TunnelWithStats{}
	}
	json.NewEncoder(w).Encode(tunnels)
}

// HandleCreateTunnel 创建新隧道
func (h *TunnelHandler) HandleCreateTunnel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 兼容前端将端口作为字符串提交的情况
	var raw struct {
		Name          string          `json:"name"`
		EndpointID    int64           `json:"endpointId"`
		Mode          string          `json:"mode"`
		TunnelAddress string          `json:"tunnelAddress"`
		TunnelPort    json.RawMessage `json:"tunnelPort"`
		TargetAddress string          `json:"targetAddress"`
		TargetPort    json.RawMessage `json:"targetPort"`
		TLSMode       string          `json:"tlsMode"`
		CertPath      string          `json:"certPath"`
		KeyPath       string          `json:"keyPath"`
		LogLevel      string          `json:"logLevel"`
		Min           json.RawMessage `json:"min"`
		Max           json.RawMessage `json:"max"`
	}

	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 解析整数工具（针对 min/max 字段，允许字符串或数字）
	parseIntField := func(j json.RawMessage) (int, error) {
		if j == nil {
			return 0, nil
		}
		var i int
		if err := json.Unmarshal(j, &i); err == nil {
			return i, nil
		}
		var s string
		if err := json.Unmarshal(j, &s); err == nil {
			return strconv.Atoi(s)
		}
		return 0, strconv.ErrSyntax
	}

	tunnelPort, err1 := parseIntField(raw.TunnelPort)
	targetPort, err2 := parseIntField(raw.TargetPort)
	if err1 != nil || err2 != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "端口号格式错误，应为数字",
		})
		return
	}

	minVal, err3 := parseIntField(raw.Min)
	maxVal, err4 := parseIntField(raw.Max)
	if err3 != nil || err4 != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "min/max 参数格式错误，应为数字",
		})
		return
	}

	req := tunnel.CreateTunnelRequest{
		Name:          raw.Name,
		EndpointID:    raw.EndpointID,
		Mode:          raw.Mode,
		TunnelAddress: raw.TunnelAddress,
		TunnelPort:    tunnelPort,
		TargetAddress: raw.TargetAddress,
		TargetPort:    targetPort,
		TLSMode:       tunnel.TLSMode(raw.TLSMode),
		CertPath:      raw.CertPath,
		KeyPath:       raw.KeyPath,
		LogLevel:      tunnel.LogLevel(raw.LogLevel),
		Min:           minVal,
		Max:           maxVal,
	}

	log.Infof("[Master-%v] 创建隧道请求: %v", req.EndpointID, req.Name)

	newTunnel, err := h.tunnelService.CreateTunnel(req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(tunnel.TunnelResponse{
		Success: true,
		Message: "隧道创建成功",
		Tunnel:  newTunnel,
	})
}

// HandleBatchCreateTunnels 批量创建隧道
func (h *TunnelHandler) HandleBatchCreateTunnels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req tunnel.BatchCreateTunnelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 验证请求
	if len(req.Items) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   "批量创建项目不能为空",
		})
		return
	}

	// 限制批量创建的数量，避免过多请求影响性能
	const maxBatchSize = 50
	if len(req.Items) > maxBatchSize {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   fmt.Sprintf("批量创建数量不能超过 %d 个", maxBatchSize),
		})
		return
	}

	// 基础验证每个项目的必填字段
	for i, item := range req.Items {
		if item.EndpointID <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的端点ID无效", i+1),
			})
			return
		}
		if item.InboundsPort <= 0 || item.InboundsPort > 65535 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的入口端口无效", i+1),
			})
			return
		}
		if item.OutboundHost == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的出口地址不能为空", i+1),
			})
			return
		}
		if item.OutboundPort <= 0 || item.OutboundPort > 65535 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的出口端口无效", i+1),
			})
			return
		}
	}

	log.Infof("[API] 接收到批量创建隧道请求，包含 %d 个项目", len(req.Items))

	// 调用服务层批量创建
	response, err := h.tunnelService.BatchCreateTunnels(req)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   "批量创建失败: " + err.Error(),
		})
		return
	}

	// 根据结果设置HTTP状态码
	if response.Success {
		if response.FailCount > 0 {
			// 部分成功
			w.WriteHeader(http.StatusPartialContent)
		} else {
			// 全部成功
			w.WriteHeader(http.StatusOK)
		}
	} else {
		// 全部失败
		w.WriteHeader(http.StatusBadRequest)
	}

	json.NewEncoder(w).Encode(response)
}

// HandleDeleteTunnel 删除隧道
func (h *TunnelHandler) HandleDeleteTunnel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		InstanceID string `json:"instanceId"`
		Recycle    bool   `json:"recycle"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req) // 即使失败也无妨，后续再判断

	// 兼容前端使用 query 参数 recycle=1
	if !req.Recycle {
		q := r.URL.Query().Get("recycle")
		if q == "1" || strings.ToLower(q) == "true" {
			req.Recycle = true
		}
	}

	// 如果未提供 instanceId ，则尝试从路径参数中解析数据库 id
	if req.InstanceID == "" {
		vars := mux.Vars(r)
		if idStr, ok := vars["id"]; ok && idStr != "" {
			if tunnelID, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				if iid, e := h.tunnelService.GetInstanceIDByTunnelID(tunnelID); e == nil {
					req.InstanceID = iid
				} else {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(tunnel.TunnelResponse{
						Success: false,
						Error:   e.Error(),
					})
					return
				}
			}
		}
	}

	if req.InstanceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道实例ID",
		})
		return
	}

	if err := h.tunnelService.DeleteTunnelAndWait(req.InstanceID, 3*time.Second, req.Recycle); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(tunnel.TunnelResponse{
		Success: true,
		Message: "隧道删除成功",
	})
}

// HandleControlTunnel 控制隧道状态
func (h *TunnelHandler) HandleControlTunnel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req tunnel.TunnelActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 尝试从路径参数中获取数据库 ID 并转换为 instanceId（若 body 中缺失）
	if req.InstanceID == "" {
		vars := mux.Vars(r)
		if idStr, ok := vars["id"]; ok && idStr != "" {
			if tunnelID, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				if iid, e := h.tunnelService.GetInstanceIDByTunnelID(tunnelID); e == nil {
					req.InstanceID = iid
				} else {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(tunnel.TunnelResponse{
						Success: false,
						Error:   e.Error(),
					})
					return
				}
			}
		}
	}

	if req.InstanceID == "" || req.Action == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道实例ID或操作类型",
		})
		return
	}

	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的操作类型，支持: start, stop, restart",
		})
		return
	}

	if err := h.tunnelService.ControlTunnel(req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(tunnel.TunnelResponse{
		Success: true,
		Message: "操作成功",
	})
}

// HandleUpdateTunnel 更新隧道配置
func (h *TunnelHandler) HandleUpdateTunnel(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	tunnelIDStr := vars["id"]

	tunnelID, err := strconv.ParseInt(tunnelIDStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道ID",
		})
		return
	}

	// 尝试解析为创建/替换请求体（与创建接口保持一致）
	var rawCreate struct {
		Name          string          `json:"name"`
		EndpointID    int64           `json:"endpointId"`
		Mode          string          `json:"mode"`
		TunnelAddress string          `json:"tunnelAddress"`
		TunnelPort    json.RawMessage `json:"tunnelPort"`
		TargetAddress string          `json:"targetAddress"`
		TargetPort    json.RawMessage `json:"targetPort"`
		TLSMode       string          `json:"tlsMode"`
		CertPath      string          `json:"certPath"`
		KeyPath       string          `json:"keyPath"`
		LogLevel      string          `json:"logLevel"`
		Min           json.RawMessage `json:"min"`
		Max           json.RawMessage `json:"max"`
	}

	if err := json.NewDecoder(r.Body).Decode(&rawCreate); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 如果请求体包含 EndpointID 和 Mode，则认定为"替换"逻辑，否则执行原 Update 逻辑
	if rawCreate.EndpointID != 0 && rawCreate.Mode != "" {
		// 1. 获取旧 instanceId
		instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: err.Error()})
			return
		}

		// 2. 删除旧实例（回收站=true）
		if err := h.tunnelService.DeleteTunnelAndWait(instanceID, 3*time.Second, true); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，遭遇无法删除旧实例: " + err.Error()})
			return
		}
		log.Infof("[Master-%v] 编辑实例=>删除旧实例: %v", rawCreate.EndpointID, instanceID)

		// 工具函数解析 int 字段
		parseInt := func(j json.RawMessage) (int, error) {
			if j == nil {
				return 0, nil
			}
			var i int
			if err := json.Unmarshal(j, &i); err == nil {
				return i, nil
			}
			var s string
			if err := json.Unmarshal(j, &s); err == nil {
				return strconv.Atoi(s)
			}
			return 0, strconv.ErrSyntax
		}

		tunnelPort, _ := parseInt(rawCreate.TunnelPort)
		targetPort, _ := parseInt(rawCreate.TargetPort)
		minVal, _ := parseInt(rawCreate.Min)
		maxVal, _ := parseInt(rawCreate.Max)

		createReq := tunnel.CreateTunnelRequest{
			Name:          rawCreate.Name,
			EndpointID:    rawCreate.EndpointID,
			Mode:          rawCreate.Mode,
			TunnelAddress: rawCreate.TunnelAddress,
			TunnelPort:    tunnelPort,
			TargetAddress: rawCreate.TargetAddress,
			TargetPort:    targetPort,
			TLSMode:       tunnel.TLSMode(rawCreate.TLSMode),
			CertPath:      rawCreate.CertPath,
			KeyPath:       rawCreate.KeyPath,
			LogLevel:      tunnel.LogLevel(rawCreate.LogLevel),
			Min:           minVal,
			Max:           maxVal,
		}

		newTunnel, err := h.tunnelService.CreateTunnel(createReq)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，无法创建新实例: " + err.Error()})
			return
		}
		log.Infof("[Master-%v] 编辑实例=>创建新实例: %v", rawCreate.EndpointID, newTunnel.InstanceID)

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: true, Message: "编辑实例成功", Tunnel: newTunnel})
		return
	}

	// -------- 原局部更新逻辑 ----------
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "不支持的更新请求"})
}

// HandleGetTunnelLogs GET /api/tunnel-logs
func (h *TunnelHandler) HandleGetTunnelLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}
	}

	logs, err := h.tunnelService.GetOperationLogs(limit)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	// 格式化为前端需要的字段；若无数据也返回空数组而非 null
	resp := make([]map[string]interface{}, 0)
	for _, l := range logs {
		statusType := "warning"
		if l.Status == "success" {
			statusType = "success"
		} else if l.Status == "failed" {
			statusType = "danger"
		}
		resp = append(resp, map[string]interface{}{
			"id":       l.ID,
			"time":     l.CreatedAt.Format(time.RFC3339),
			"action":   l.Action,
			"instance": l.TunnelName,
			"status": map[string]interface{}{
				"type": statusType,
				"text": l.Status,
			},
			"message": l.Message.String,
		})
	}

	json.NewEncoder(w).Encode(resp)
}

// HandlePatchTunnels 处理 PATCH /api/tunnels 请求 (启动/停止/重启/重命名)
// 该接口兼容旧版前端：
// 1. action 为 start/stop/restart 时，根据 instanceId 操作隧道状态
// 2. action 为 rename 时，根据 id 修改隧道名称
func (h *TunnelHandler) HandlePatchTunnels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 定义与旧版前端保持一致的请求结构
	var raw struct {
		// 用于状态控制
		InstanceID string `json:"instanceId"`
		// 用于重命名
		ID int64 `json:"id"`
		// 操作类型：start | stop | restart | rename
		Action string `json:"action"`
		// 当 action 为 rename 时的新名称
		Name string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 若 URL 中包含 {id}，且 body 中未提供 id，则从路径参数读取
	if raw.ID == 0 {
		vars := mux.Vars(r)
		if idStr, ok := vars["id"]; ok && idStr != "" {
			if tid, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				raw.ID = tid
			}
		}
	}

	if raw.Action == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少操作类型(action)",
		})
		return
	}

	switch raw.Action {
	case "start", "stop", "restart":
		if raw.InstanceID == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "缺少隧道实例ID(instanceId)",
			})
			return
		}

		if err := h.tunnelService.ControlTunnel(tunnel.TunnelActionRequest{
			InstanceID: raw.InstanceID,
			Action:     raw.Action,
		}); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: "操作成功",
		})

	case "rename":
		if raw.ID == 0 || raw.Name == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "重命名操作需提供有效的 id 和 name",
			})
			return
		}

		if err := h.tunnelService.RenameTunnel(raw.ID, raw.Name); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: "隧道重命名成功",
		})

	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的操作类型，支持: start, stop, restart, rename",
		})
	}
}

// HandleGetTunnelDetails 获取隧道详细信息 (GET /api/tunnels/{id}/details)
func (h *TunnelHandler) HandleGetTunnelDetails(w http.ResponseWriter, r *http.Request) {
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

	db := h.tunnelService.DB()

	// 1. 查询隧道及端点信息
	var tunnelRecord struct {
		ID            int64
		InstanceIDNS  sql.NullString
		Name          string
		Mode          string
		Status        string
		EndpointID    int64
		EndpointName  sql.NullString
		TunnelPort    string
		TargetPort    string
		TLSMode       string
		LogLevel      string
		TunnelAddress string
		TargetAddress string
		CommandLine   string
		TCPRx         int64
		TCPTx         int64
		UDPRx         int64
		UDPTx         int64
		Min           sql.NullInt64
		Max           sql.NullInt64
	}

	query := `SELECT t.id, t.instanceId, t.name, t.mode, t.status, t.endpointId,
		   e.name, t.tunnelPort, t.targetPort, t.tlsMode, t.logLevel,
		   t.tunnelAddress, t.targetAddress, t.commandLine,
		   t.tcpRx, t.tcpTx, t.udpRx, t.udpTx,
		   t.min, t.max
		   FROM "Tunnel" t
		   LEFT JOIN "Endpoint" e ON t.endpointId = e.id
		   WHERE t.id = ?`
	if err := db.QueryRow(query, id).Scan(
		&tunnelRecord.ID,
		&tunnelRecord.InstanceIDNS,
		&tunnelRecord.Name,
		&tunnelRecord.Mode,
		&tunnelRecord.Status,
		&tunnelRecord.EndpointID,
		&tunnelRecord.EndpointName,
		&tunnelRecord.TunnelPort,
		&tunnelRecord.TargetPort,
		&tunnelRecord.TLSMode,
		&tunnelRecord.LogLevel,
		&tunnelRecord.TunnelAddress,
		&tunnelRecord.TargetAddress,
		&tunnelRecord.CommandLine,
		&tunnelRecord.TCPRx,
		&tunnelRecord.TCPTx,
		&tunnelRecord.UDPRx,
		&tunnelRecord.UDPTx,
		&tunnelRecord.Min,
		&tunnelRecord.Max,
	); err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "隧道不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}

	instanceID := ""
	if tunnelRecord.InstanceIDNS.Valid {
		instanceID = tunnelRecord.InstanceIDNS.String
	}
	endpointName := ""
	if tunnelRecord.EndpointName.Valid {
		endpointName = tunnelRecord.EndpointName.String
	}

	// 状态映射
	statusType := "danger"
	statusText := "已停止"
	if tunnelRecord.Status == "running" {
		statusType = "success"
		statusText = "运行中"
	} else if tunnelRecord.Status == "error" {
		statusType = "warning"
		statusText = "错误"
	}

	// 端口转换
	listenPort, _ := strconv.Atoi(tunnelRecord.TunnelPort)
	targetPort, _ := strconv.Atoi(tunnelRecord.TargetPort)

	// 2. 查询日志记录 (最多 200 条)
	logs := make([]map[string]interface{}, 0)
	trafficTrend := make([]map[string]interface{}, 0)

	if instanceID != "" {
		// 日志
		logRows, err := db.Query(`SELECT id, logs, eventTime FROM "EndpointSSE" WHERE endpointId = ? AND instanceId = ? AND eventType = 'log' AND logs IS NOT NULL ORDER BY eventTime DESC LIMIT 200`, tunnelRecord.EndpointID, instanceID)
		if err == nil {
			defer logRows.Close()
			idx := 0
			for logRows.Next() {
				var logID int64
				var logsStr sql.NullString
				var eventTime sql.NullTime
				if err := logRows.Scan(&logID, &logsStr, &eventTime); err == nil {
					message := ""
					if logsStr.Valid {
						message = processAnsiColors(logsStr.String)
					}
					idx++
					logs = append(logs, map[string]interface{}{
						"id":      idx,
						"message": message,
						"isHtml":  true,
						"traffic": map[string]int64{"tcpRx": 0, "tcpTx": 0, "udpRx": 0, "udpTx": 0},
						"timestamp": func() interface{} {
							if eventTime.Valid {
								return eventTime.Time
							} else {
								return nil
							}
						}(),
					})
				}
			}
		}

		// 流量趋势
		trendRows, err := db.Query(`SELECT eventTime, tcpRx, tcpTx, udpRx, udpTx FROM "EndpointSSE" WHERE endpointId = ? AND instanceId = ? AND pushType IN ('update','initial') AND (tcpRx IS NOT NULL OR tcpTx IS NOT NULL OR udpRx IS NOT NULL OR udpTx IS NOT NULL) ORDER BY eventTime ASC LIMIT 100`, tunnelRecord.EndpointID, instanceID)
		if err == nil {
			defer trendRows.Close()
			for trendRows.Next() {
				var eventTime time.Time
				var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
				if err := trendRows.Scan(&eventTime, &tcpRx, &tcpTx, &udpRx, &udpTx); err == nil {
					trafficTrend = append(trafficTrend, map[string]interface{}{
						"eventTime": eventTime.Format(time.RFC3339),
						"tcpRx":     tcpRx.Int64,
						"tcpTx":     tcpTx.Int64,
						"udpRx":     udpRx.Int64,
						"udpTx":     udpTx.Int64,
					})
				}
			}
		}
	}

	// 3. 组装响应
	resp := map[string]interface{}{
		"tunnelInfo": map[string]interface{}{
			"id":         tunnelRecord.ID,
			"instanceId": instanceID,
			"name":       tunnelRecord.Name,
			"type":       map[string]string{"server": "服务端", "client": "客户端"}[tunnelRecord.Mode],
			"status": map[string]string{
				"type": statusType,
				"text": statusText,
			},
			"endpoint":   endpointName,
			"endpointId": tunnelRecord.EndpointID,
			"config": map[string]interface{}{
				"listenPort": listenPort,
				"targetPort": targetPort,
				"tls":        tunnelRecord.TLSMode != "mode0",
				"logLevel":   tunnelRecord.LogLevel,
				"tlsMode":    tunnelRecord.TLSMode,
				"min": func() interface{} {
					if tunnelRecord.Min.Valid {
						return tunnelRecord.Min.Int64
					}
					return nil
				}(),
				"max": func() interface{} {
					if tunnelRecord.Max.Valid {
						return tunnelRecord.Max.Int64
					}
					return nil
				}(),
			},
			"traffic": map[string]int64{
				"tcpRx": tunnelRecord.TCPRx,
				"tcpTx": tunnelRecord.TCPTx,
				"udpRx": tunnelRecord.UDPRx,
				"udpTx": tunnelRecord.UDPTx,
			},
			"tunnelAddress": tunnelRecord.TunnelAddress,
			"targetAddress": tunnelRecord.TargetAddress,
			"commandLine":   tunnelRecord.CommandLine,
		},
		"logs":         logs,
		"trafficTrend": trafficTrend,
	}

	json.NewEncoder(w).Encode(resp)
}

// HandleTunnelLogs 获取指定隧道日志 (GET /api/tunnels/{id}/logs)
func (h *TunnelHandler) HandleTunnelLogs(w http.ResponseWriter, r *http.Request) {
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

	db := h.tunnelService.DB()

	// 查询隧道获得 endpointId 与 instanceId
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpointId, instanceId FROM "Tunnel" WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "隧道不存在"})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	if !instanceID.Valid || instanceID.String == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"logs":        []interface{}{},
				"trafficData": []interface{}{},
			},
		})
		return
	}

	// 获取日志
	logRows, err := db.Query(`SELECT id, logs, tcpRx, tcpTx, udpRx, udpTx, createdAt FROM "EndpointSSE" WHERE endpointId = ? AND instanceId = ? AND eventType = 'log' ORDER BY createdAt DESC LIMIT 100`, endpointID, instanceID.String)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
		return
	}
	defer logRows.Close()

	logs := make([]map[string]interface{}, 0)
	trafficTrend := make([]map[string]interface{}, 0)

	for logRows.Next() {
		var id int64
		var logsStr sql.NullString
		var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
		var createdAt time.Time
		if err := logRows.Scan(&id, &logsStr, &tcpRx, &tcpTx, &udpRx, &udpTx, &createdAt); err == nil {
			logs = append(logs, map[string]interface{}{
				"id":        id,
				"message":   processAnsiColors(ptrString(logsStr)),
				"isHtml":    true,
				"traffic":   map[string]int64{"tcpRx": tcpRx.Int64, "tcpTx": tcpTx.Int64, "udpRx": udpRx.Int64, "udpTx": udpTx.Int64},
				"timestamp": createdAt,
			})
			trafficTrend = append(trafficTrend, map[string]interface{}{
				"timestamp": createdAt,
				"tcpRx":     tcpRx.Int64,
				"tcpTx":     tcpTx.Int64,
				"udpRx":     udpRx.Int64,
				"udpTx":     udpTx.Int64,
			})
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"logs":        logs,
			"trafficData": trafficTrend,
		},
	})
}

// processAnsiColors 将 ANSI 颜色码转换为 HTML span
func processAnsiColors(text string) string {
	// 移除时间戳前缀（可选）
	text = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\\s\d{2}:\d{2}:\d{2}\.\d{3}\\s`).ReplaceAllString(text, "")
	// 移除 ESC 字符
	text = strings.ReplaceAll(text, "\u001B", "")

	// 替换颜色代码
	colorMap := map[*regexp.Regexp]string{
		regexp.MustCompile(`\[32m`): "<span class=\"text-green-400\">",
		regexp.MustCompile(`\[31m`): "<span class=\"text-red-400\">",
		regexp.MustCompile(`\[33m`): "<span class=\"text-yellow-400\">",
		regexp.MustCompile(`\[34m`): "<span class=\"text-blue-400\">",
		regexp.MustCompile(`\[35m`): "<span class=\"text-purple-400\">",
		regexp.MustCompile(`\[36m`): "<span class=\"text-cyan-400\">",
		regexp.MustCompile(`\[37m`): "<span class=\"text-gray-400\">",
		regexp.MustCompile(`\[0m`):  "</span>",
	}
	for re, repl := range colorMap {
		text = re.ReplaceAllString(text, repl)
	}

	// 确保标签闭合
	openTags := strings.Count(text, "<span")
	closeTags := strings.Count(text, "</span>")
	if openTags > closeTags {
		text += strings.Repeat("</span>", openTags-closeTags)
	}
	return text
}

// ptrString 安全地从 sql.NullString 获取字符串
func ptrString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

// HandleQuickCreateTunnel 根据 URL 快速创建隧道
func (h *TunnelHandler) HandleQuickCreateTunnel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		EndpointID int64  `json:"endpointId"`
		URL        string `json:"url"`
		Name       string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	if req.EndpointID == 0 || req.URL == "" || strings.TrimSpace(req.Name) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "endpointId、url、name 均不能为空",
		})
		return
	}

	if err := h.tunnelService.QuickCreateTunnel(req.EndpointID, req.URL, req.Name); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(tunnel.TunnelResponse{
		Success: true,
		Message: "隧道创建成功",
	})
}

// HandleTemplateCreate 处理模板创建请求
func (h *TunnelHandler) HandleTemplateCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 定义请求结构体
	var req struct {
		Log        string `json:"log"`
		ListenHost string `json:"listen_host,omitempty"`
		ListenPort int    `json:"listen_port"`
		Mode       string `json:"mode"`
		TLS        int    `json:"tls,omitempty"`
		CertPath   string `json:"cert_path,omitempty"`
		KeyPath    string `json:"key_path,omitempty"`
		Inbounds   *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		} `json:"inbounds,omitempty"`
		Outbounds *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		} `json:"outbounds,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	log.Infof("[API] 模板创建请求: mode=%s, listen_host=%s, listen_port=%d", req.Mode, req.ListenHost, req.ListenPort)

	switch req.Mode {
	case "single":
		if req.Inbounds == nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "单端模式缺少inbounds配置",
			})
			return
		}

		// 获取中转主控信息
		var endpointURL, endpointAPIPath, endpointAPIKey string
		db := h.tunnelService.DB()
		err := db.QueryRow(
			"SELECT url, apiPath, apiKey FROM \"Endpoint\" WHERE id = ?",
			req.Inbounds.MasterID,
		).Scan(&endpointURL, &endpointAPIPath, &endpointAPIKey)
		if err != nil {
			if err == sql.ErrNoRows {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的中转主控不存在",
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "查询中转主控失败",
			})
			return
		}

		// 构建单端转发的URL，支持listen_host
		var listenAddr string
		if req.ListenHost != "" {
			listenAddr = fmt.Sprintf("%s:%d", req.ListenHost, req.ListenPort)
		} else {
			listenAddr = fmt.Sprintf(":%d", req.ListenPort)
		}

		tunnelURL := fmt.Sprintf("client://%s/%s:%d?log=%s",
			listenAddr,
			req.Inbounds.TargetHost,
			req.Inbounds.TargetPort,
			req.Log,
		)

		// 生成隧道名称
		tunnelName := fmt.Sprintf("template-single-%d-%d", req.Inbounds.MasterID, time.Now().Unix())

		// 使用QuickCreateTunnel创建隧道
		if err := h.tunnelService.QuickCreateTunnel(req.Inbounds.MasterID, tunnelURL, tunnelName); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建单端隧道失败: " + err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: "单端转发隧道创建成功",
		})

	case "bothway":
		if req.Inbounds == nil || req.Outbounds == nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "双端模式缺少inbounds或outbounds配置",
			})
			return
		}

		// 根据type字段确定哪个是server，哪个是client
		var serverConfig, clientConfig *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		}

		if req.Inbounds.Type == "server" {
			serverConfig = req.Inbounds
			clientConfig = req.Outbounds
		} else {
			serverConfig = req.Outbounds
			clientConfig = req.Inbounds
		}

		// 获取endpoint信息
		var serverEndpoint, clientEndpoint struct {
			ID      int64
			URL     string
			APIPath string
			APIKey  string
		}

		db := h.tunnelService.DB()
		// 获取server endpoint信息
		err := db.QueryRow(
			"SELECT id, url, apiPath, apiKey FROM \"Endpoint\" WHERE id = ?",
			serverConfig.MasterID,
		).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.APIPath, &serverEndpoint.APIKey)
		if err != nil {
			if err == sql.ErrNoRows {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的服务端主控不存在",
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "查询服务端主控失败",
			})
			return
		}

		// 获取client endpoint信息
		err = db.QueryRow(
			"SELECT id, url, apiPath, apiKey FROM \"Endpoint\" WHERE id = ?",
			clientConfig.MasterID,
		).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.APIPath, &clientEndpoint.APIKey)
		if err != nil {
			if err == sql.ErrNoRows {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的客户端主控不存在",
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "查询客户端主控失败",
			})
			return
		}

		// 从server端URL中提取IP
		serverIP := strings.TrimPrefix(serverEndpoint.URL, "http://")
		serverIP = strings.TrimPrefix(serverIP, "https://")
		if idx := strings.Index(serverIP, ":"); idx != -1 {
			serverIP = serverIP[:idx]
		}
		if idx := strings.Index(serverIP, "/"); idx != -1 {
			serverIP = serverIP[:idx]
		}

		// 双端转发：server端监听listen_port，转发到outbounds的target
		serverURL := fmt.Sprintf("server://:%d/%s:%d",
			req.ListenPort,
			serverConfig.TargetHost,
			serverConfig.TargetPort,
		)
		if req.TLS > 0 {
			serverURL += fmt.Sprintf("?tls=%d&log=%s", req.TLS, req.Log)
			// 如果是TLS 2且提供了证书路径，添加证书参数
			if req.TLS == 2 && req.CertPath != "" && req.KeyPath != "" {
				serverURL += fmt.Sprintf("&cert=%s&key=%s", req.CertPath, req.KeyPath)
			}
		} else {
			serverURL += fmt.Sprintf("?log=%s", req.Log)
		}

		// 双端转发：client端连接到server的IP:listen_port，转发到inbounds的target
		clientURL := fmt.Sprintf("client://%s:%d/%s:%d?log=%s",
			serverIP,
			req.ListenPort,
			clientConfig.TargetHost,
			clientConfig.TargetPort,
			req.Log,
		)

		// 生成隧道名称
		timestamp := time.Now().Unix()
		serverTunnelName := fmt.Sprintf("template-server-%d-%d", serverConfig.MasterID, timestamp)
		clientTunnelName := fmt.Sprintf("template-client-%d-%d", clientConfig.MasterID, timestamp)

		log.Infof("[API] 开始创建双端隧道 - 先创建server端，再创建client端")

		// 第一步：创建server端隧道
		log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
		if err := h.tunnelService.QuickCreateTunnel(serverConfig.MasterID, serverURL, serverTunnelName); err != nil {
			log.Errorf("[API] 创建server端隧道失败: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建server端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤1完成: server端隧道创建成功")

		// 第二步：创建client端隧道
		log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
		if err := h.tunnelService.QuickCreateTunnel(clientConfig.MasterID, clientURL, clientTunnelName); err != nil {
			log.Errorf("[API] 创建client端隧道失败: %v", err)
			// 如果client端创建失败，可以考虑回滚server端，但这里先简单处理
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建client端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤2完成: client端隧道创建成功")
		log.Infof("[API] 双端隧道创建完成")

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: "双端转发隧道创建成功",
		})

	case "intranet":
		if req.Inbounds == nil || req.Outbounds == nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "内网穿透模式缺少inbounds或outbounds配置",
			})
			return
		}

		// 根据type字段确定哪个是server，哪个是client
		var serverConfig, clientConfig *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		}

		if req.Inbounds.Type == "server" {
			serverConfig = req.Inbounds
			clientConfig = req.Outbounds
		} else {
			serverConfig = req.Outbounds
			clientConfig = req.Inbounds
		}

		// 获取endpoint信息
		var serverEndpoint, clientEndpoint struct {
			ID      int64
			URL     string
			APIPath string
			APIKey  string
		}

		db := h.tunnelService.DB()
		// 获取server endpoint信息
		err := db.QueryRow(
			"SELECT id, url, apiPath, apiKey FROM \"Endpoint\" WHERE id = ?",
			serverConfig.MasterID,
		).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.APIPath, &serverEndpoint.APIKey)
		if err != nil {
			if err == sql.ErrNoRows {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的服务端主控不存在",
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "查询服务端主控失败",
			})
			return
		}

		// 获取client endpoint信息
		err = db.QueryRow(
			"SELECT id, url, apiPath, apiKey FROM \"Endpoint\" WHERE id = ?",
			clientConfig.MasterID,
		).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.APIPath, &clientEndpoint.APIKey)
		if err != nil {
			if err == sql.ErrNoRows {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的客户端主控不存在",
				})
				return
			}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "查询客户端主控失败",
			})
			return
		}

		// 从server端URL中提取IP
		serverIP := strings.TrimPrefix(serverEndpoint.URL, "http://")
		serverIP = strings.TrimPrefix(serverIP, "https://")
		if idx := strings.Index(serverIP, ":"); idx != -1 {
			serverIP = serverIP[:idx]
		}
		if idx := strings.Index(serverIP, "/"); idx != -1 {
			serverIP = serverIP[:idx]
		}

		// 内网穿透：server端监听listen_port，目标是用户要访问的地址
		serverURL := fmt.Sprintf("server://:%d/%s:%d",
			req.ListenPort,
			serverConfig.TargetHost,
			serverConfig.TargetPort,
		)
		if req.TLS > 0 {
			serverURL += fmt.Sprintf("?tls=%d&log=%s", req.TLS, req.Log)
			// 如果是TLS 2且提供了证书路径，添加证书参数
			if req.TLS == 2 && req.CertPath != "" && req.KeyPath != "" {
				serverURL += fmt.Sprintf("&cert=%s&key=%s", req.CertPath, req.KeyPath)
			}
		} else {
			serverURL += fmt.Sprintf("?log=%s", req.Log)
		}

		// 内网穿透：client端连接到server的IP:listen_port，转发到最终目标
		clientURL := fmt.Sprintf("client://%s:%d/%s:%d?log=%s",
			serverIP,
			req.ListenPort,
			clientConfig.TargetHost,
			clientConfig.TargetPort,
			req.Log,
		)

		// 生成隧道名称
		timestamp := time.Now().Unix()
		serverTunnelName := fmt.Sprintf("template-intranet-server-%d-%d", serverConfig.MasterID, timestamp)
		clientTunnelName := fmt.Sprintf("template-intranet-client-%d-%d", clientConfig.MasterID, timestamp)

		log.Infof("[API] 开始创建内网穿透隧道 - 先创建server端，再创建client端")

		// 第一步：创建server端隧道
		log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
		if err := h.tunnelService.QuickCreateTunnel(serverConfig.MasterID, serverURL, serverTunnelName); err != nil {
			log.Errorf("[API] 创建server端隧道失败: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建server端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤1完成: server端隧道创建成功")

		// 第二步：创建client端隧道
		log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
		if err := h.tunnelService.QuickCreateTunnel(clientConfig.MasterID, clientURL, clientTunnelName); err != nil {
			log.Errorf("[API] 创建client端隧道失败: %v", err)
			// 如果client端创建失败，可以考虑回滚server端，但这里先简单处理
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建client端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤2完成: client端隧道创建成功")
		log.Infof("[API] 内网穿透隧道创建完成")

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: "内网穿透隧道创建成功",
		})

	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "不支持的隧道模式: " + req.Mode,
		})
		return
	}
}

// HandleBatchDeleteTunnels 批量删除隧道 (DELETE /api/tunnels/batch)
func (h *TunnelHandler) HandleBatchDeleteTunnels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type batchDeleteRequest struct {
		// 根据数据库 ID 删除，可选
		IDs []int64 `json:"ids"`
		// 根据实例 ID 删除，可选
		InstanceIDs []string `json:"instanceIds"`
		// 是否移入回收站
		Recycle bool `json:"recycle"`
	}

	type itemResult struct {
		ID         int64  `json:"id,omitempty"`
		InstanceID string `json:"instanceId"`
		Success    bool   `json:"success"`
		Error      string `json:"error,omitempty"`
	}

	type batchDeleteResponse struct {
		Success   bool         `json:"success"`
		Deleted   int          `json:"deleted"`
		FailCount int          `json:"failCount"`
		Error     string       `json:"error,omitempty"`
		Results   []itemResult `json:"results,omitempty"`
	}

	var req batchDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchDeleteResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 至少提供一种 ID
	if len(req.IDs) == 0 && len(req.InstanceIDs) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchDeleteResponse{
			Success: false,
			Error:   "缺少隧道ID",
		})
		return
	}

	// 将 IDs 转换为 instanceIDs
	for _, id := range req.IDs {
		if iid, err := h.tunnelService.GetInstanceIDByTunnelID(id); err == nil {
			req.InstanceIDs = append(req.InstanceIDs, iid)
		}
	}

	if len(req.InstanceIDs) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchDeleteResponse{
			Success: false,
			Error:   "没有有效的隧道实例ID",
		})
		return
	}

	// 开始删除
	var resp batchDeleteResponse
	for _, iid := range req.InstanceIDs {
		r := itemResult{InstanceID: iid}
		if err := h.tunnelService.DeleteTunnelAndWait(iid, 3*time.Second, req.Recycle); err != nil {
			r.Success = false
			r.Error = err.Error()
			resp.FailCount++
		} else {
			r.Success = true
			resp.Deleted++
		}
		resp.Results = append(resp.Results, r)
	}

	resp.Success = resp.FailCount == 0

	// 设置状态码
	if resp.Success {
		if resp.FailCount > 0 {
			w.WriteHeader(http.StatusPartialContent)
		} else {
			w.WriteHeader(http.StatusOK)
		}
	} else {
		w.WriteHeader(http.StatusBadRequest)
	}

	_ = json.NewEncoder(w).Encode(resp)
}

// HandleNewBatchCreateTunnels 新的批量创建隧道处理
func (h *TunnelHandler) HandleNewBatchCreateTunnels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req tunnel.NewBatchCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 添加调试日志，显示接收到的原始请求数据
	reqBytes, _ := json.MarshalIndent(req, "", "  ")
	log.Infof("[API] 接收到新的批量创建请求，原始数据: %s", string(reqBytes))

	// 验证请求模式
	if req.Mode == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "请求模式不能为空",
		})
		return
	}

	// 根据模式验证具体数据
	switch req.Mode {
	case "standard":
		if len(req.Standard) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   "标准模式批量创建项目不能为空",
			})
			return
		}

		// 限制批量创建的数量
		const maxBatchSize = 50
		if len(req.Standard) > maxBatchSize {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   fmt.Sprintf("标准模式批量创建数量不能超过 %d 个", maxBatchSize),
			})
			return
		}

		// 验证每个项目的必填字段
		for i, item := range req.Standard {
			if item.EndpointID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的端点ID无效", i+1),
				})
				return
			}
			if item.TunnelPort <= 0 || item.TunnelPort > 65535 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的隧道端口无效", i+1),
				})
				return
			}
			if item.TargetHost == "" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的目标地址不能为空", i+1),
				})
				return
			}
			if item.TargetPort <= 0 || item.TargetPort > 65535 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的目标端口无效", i+1),
				})
				return
			}
			if item.Name == "" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的隧道名称不能为空", i+1),
				})
				return
			}
		}

	case "config":
		if len(req.Config) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   "配置模式批量创建项目不能为空",
			})
			return
		}

		// 计算总的配置项数量并验证
		totalConfigs := 0
		for _, configItem := range req.Config {
			totalConfigs += len(configItem.Config)
		}

		const maxBatchSize = 50
		if totalConfigs > maxBatchSize {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   fmt.Sprintf("配置模式批量创建数量不能超过 %d 个", maxBatchSize),
			})
			return
		}

		// 验证每个配置项
		for i, configItem := range req.Config {
			if configItem.EndpointID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 个配置组的端点ID无效", i+1),
				})
				return
			}

			if len(configItem.Config) == 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 个配置组的配置列表不能为空", i+1),
				})
				return
			}

			for j, config := range configItem.Config {
				if config.ListenPort <= 0 || config.ListenPort > 65535 {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
						Success: false,
						Error:   fmt.Sprintf("第 %d 个配置组第 %d 项的监听端口无效", i+1, j+1),
					})
					return
				}
				if config.Dest == "" {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
						Success: false,
						Error:   fmt.Sprintf("第 %d 个配置组第 %d 项的目标地址不能为空", i+1, j+1),
					})
					return
				}
				if config.Name == "" {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
						Success: false,
						Error:   fmt.Sprintf("第 %d 个配置组第 %d 项的隧道名称不能为空", i+1, j+1),
					})
					return
				}
			}
		}

	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "不支持的批量创建模式: " + req.Mode,
		})
		return
	}

	log.Infof("[API] 接收到新的批量创建隧道请求，模式: %s", req.Mode)

	// 调用服务层新的批量创建
	response, err := h.tunnelService.NewBatchCreateTunnels(req)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "新批量创建失败: " + err.Error(),
		})
		return
	}

	// 根据结果设置HTTP状态码
	if response.Success {
		if response.FailCount > 0 {
			// 部分成功
			w.WriteHeader(http.StatusPartialContent)
		} else {
			// 全部成功
			w.WriteHeader(http.StatusOK)
		}
	} else {
		// 全部失败
		w.WriteHeader(http.StatusBadRequest)
	}

	json.NewEncoder(w).Encode(response)
}
