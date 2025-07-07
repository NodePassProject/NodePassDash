package api

import (
	log "NodePassDash/internal/log"
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"

	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
)

// TunnelHandler 隧道相关的处理器
type TunnelHandler struct {
	tunnelService *tunnel.Service
	sseManager    *sse.Manager
}

// NewTunnelHandler 创建隧道处理器实例
func NewTunnelHandler(tunnelService *tunnel.Service, sseManager *sse.Manager) *TunnelHandler {
	return &TunnelHandler{
		tunnelService: tunnelService,
		sseManager:    sseManager,
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
		Password      string          `json:"password"`
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
		Password:      raw.Password,
		Min:           minVal,
		Max:           maxVal,
	}

	log.Infof("[Master-%v] 创建隧道请求: %v", req.EndpointID, req.Name)

	// 使用等待模式创建隧道，超时时间为 3 秒
	newTunnel, err := h.tunnelService.CreateTunnelAndWait(req, 3*time.Second)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// CreateTunnelAndWait 已经包含了设置别名的逻辑，这里不需要再调用

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

	// 如果不是移入回收站，先获取端点ID用于后续清理文件日志
	var endpointID int64
	var shouldClearLogs = !req.Recycle
	if shouldClearLogs {
		// 在删除前先获取端点ID
		if err := h.tunnelService.DB().QueryRow(`SELECT endpointId FROM "Tunnel" WHERE instanceId = ?`, req.InstanceID).Scan(&endpointID); err != nil {
			// 如果从Tunnel表获取失败，尝试从EndpointSSE表获取
			if err := h.tunnelService.DB().QueryRow(`SELECT DISTINCT endpointId FROM "EndpointSSE" WHERE instanceId = ? LIMIT 1`, req.InstanceID).Scan(&endpointID); err != nil {
				log.Warnf("[API] 无法获取端点ID用于清理文件日志: instanceID=%s, err=%v", req.InstanceID, err)
				shouldClearLogs = false
			}
		}
	}

	if err := h.tunnelService.DeleteTunnelAndWait(req.InstanceID, 3*time.Second, req.Recycle); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 如果不是移入回收站，则清理文件日志
	if shouldClearLogs && h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		if err := h.sseManager.GetFileLogger().ClearLogs(endpointID, req.InstanceID); err != nil {
			log.Warnf("[API] 清理隧道文件日志失败: endpointID=%d, instanceID=%s, err=%v", endpointID, req.InstanceID, err)
		} else {
			log.Infof("[API] 已清理隧道文件日志: endpointID=%d, instanceID=%s", endpointID, req.InstanceID)
		}
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
		Password      string          `json:"password"`
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
			Password:      rawCreate.Password,
			Min:           minVal,
			Max:           maxVal,
		}

		// 使用等待模式创建新隧道，超时时间为 3 秒
		newTunnel, err := h.tunnelService.CreateTunnelAndWait(createReq, 3*time.Second)
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

// HandleClearTunnelLogs DELETE /api/dashboard/logs
// 清空隧道操作日志
func (h *TunnelHandler) HandleClearTunnelLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	deleted, err := h.tunnelService.ClearOperationLogs()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"deletedCount": deleted,
	})
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

// HandlePatchTunnelAttributes 处理隧道属性更新 (PATCH /api/tunnels/{id}/attributes)
// 支持更新别名和重启策略
func (h *TunnelHandler) HandlePatchTunnelAttributes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取隧道ID
	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道ID",
		})
		return
	}

	tunnelID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道ID",
		})
		return
	}

	// 解析请求体
	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 只允许更新 alias 字段
	if alias, ok := updates["alias"]; ok {
		aliasStr, ok := alias.(string)
		if !ok {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "alias 必须是字符串类型",
			})
			return
		}

		filteredUpdates := map[string]interface{}{"alias": aliasStr}
		if err := h.tunnelService.PatchTunnel(tunnelID, filteredUpdates); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: "隧道别名更新成功",
		})
		return
	}

	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(tunnel.TunnelResponse{
		Success: false,
		Error:   "只允许更新 alias 字段",
	})
}

// HandleSetTunnelRestart 设置隧道重启策略的专用接口
func (h *TunnelHandler) HandleSetTunnelRestart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	idStr := vars["id"]
	if idStr == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道ID",
		})
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道ID",
		})
		return
	}

	var requestData struct {
		Restart bool `json:"restart"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	if err := h.tunnelService.SetTunnelRestart(id, requestData.Restart); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(tunnel.TunnelResponse{
		Success: true,
		Message: fmt.Sprintf("自动重启已%s", map[bool]string{true: "开启", false: "关闭"}[requestData.Restart]),
	})
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

	// 1. 查询隧道及端点信息（包含主控的tls和log信息）
	var tunnelRecord struct {
		ID              int64
		InstanceIDNS    sql.NullString
		Name            string
		Mode            string
		Status          string
		EndpointID      int64
		EndpointName    sql.NullString
		EndpointTLS     sql.NullString
		EndpointLog     sql.NullString
		EndpointVersion sql.NullString
		TunnelPort      string
		TargetPort      string
		TLSMode         string
		LogLevel        string
		TunnelAddress   string
		TargetAddress   string
		CommandLine     string
		PasswordNS      sql.NullString
		TCPRx           int64
		TCPTx           int64
		UDPRx           int64
		UDPTx           int64
		Min             sql.NullInt64
		Max             sql.NullInt64
		Restart         bool
	}

	query := `SELECT t.id, t.instanceId, t.name, t.mode, t.status, t.endpointId,
		   e.name, e.tls, e.log, e.ver, t.tunnelPort, t.targetPort, t.tlsMode, t.logLevel,
		   t.tunnelAddress, t.targetAddress, t.commandLine, t.password,
		   t.tcpRx, t.tcpTx, t.udpRx, t.udpTx,
		   t.min, t.max, t.restart
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
		&tunnelRecord.EndpointTLS,
		&tunnelRecord.EndpointLog,
		&tunnelRecord.EndpointVersion,
		&tunnelRecord.TunnelPort,
		&tunnelRecord.TargetPort,
		&tunnelRecord.TLSMode,
		&tunnelRecord.LogLevel,
		&tunnelRecord.TunnelAddress,
		&tunnelRecord.TargetAddress,
		&tunnelRecord.CommandLine,
		&tunnelRecord.PasswordNS,
		&tunnelRecord.TCPRx,
		&tunnelRecord.TCPTx,
		&tunnelRecord.UDPRx,
		&tunnelRecord.UDPTx,
		&tunnelRecord.Min,
		&tunnelRecord.Max,
		&tunnelRecord.Restart,
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
	endpointTLS := ""
	if tunnelRecord.EndpointTLS.Valid {
		endpointTLS = tunnelRecord.EndpointTLS.String
	}
	endpointLog := ""
	if tunnelRecord.EndpointLog.Valid {
		endpointLog = tunnelRecord.EndpointLog.String
	}
	endpointVersion := ""
	if tunnelRecord.EndpointVersion.Valid {
		endpointVersion = tunnelRecord.EndpointVersion.String
	}
	password := ""
	if tunnelRecord.PasswordNS.Valid {
		password = tunnelRecord.PasswordNS.String
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

	// 2. 组装响应（不再包含日志数据）
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
			"endpoint":        endpointName,
			"endpointId":      tunnelRecord.EndpointID,
			"endpointVersion": endpointVersion,
			"password":        password, // 添加密码字段
			"config": map[string]interface{}{
				"listenPort":  listenPort,
				"targetPort":  targetPort,
				"tls":         tunnelRecord.TLSMode != "mode0",
				"logLevel":    tunnelRecord.LogLevel,
				"tlsMode":     tunnelRecord.TLSMode,
				"endpointTLS": endpointTLS, // 主控的TLS配置
				"endpointLog": endpointLog, // 主控的Log配置
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
				"restart": tunnelRecord.Restart,
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

	// 使用 map 来存储每分钟的最新流量记录
	minuteTrafficMap := make(map[string]map[string]interface{})

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

			// 格式化时间到分钟用于流量趋势去重
			minuteKey := createdAt.Format("2006-01-02 15:04")
			// 存储这一分钟的最新流量记录（由于是按时间降序，先出现的是最新的）
			if _, exists := minuteTrafficMap[minuteKey]; !exists {
				minuteTrafficMap[minuteKey] = map[string]interface{}{
					"timestamp": minuteKey,
					"tcpRx":     tcpRx.Int64,
					"tcpTx":     tcpTx.Int64,
					"udpRx":     udpRx.Int64,
					"udpTx":     udpTx.Int64,
				}
			}
		}
	}

	// 将去重后的流量数据转换为 slice，并按时间排序
	for _, record := range minuteTrafficMap {
		trafficTrend = append(trafficTrend, record)
	}

	// 按时间排序（升序）
	sort.Slice(trafficTrend, func(i, j int) bool {
		return trafficTrend[i]["timestamp"].(string) < trafficTrend[j]["timestamp"].(string)
	})

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

	// 使用等待模式快速创建隧道，超时时间为 3 秒
	if err := h.tunnelService.QuickCreateTunnelAndWait(req.EndpointID, req.URL, req.Name, 3*time.Second); err != nil {
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

// HandleQuickBatchCreateTunnel 批量快速创建隧道
func (h *TunnelHandler) HandleQuickBatchCreateTunnel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Rules []struct {
			EndpointID int64  `json:"endpointId"`
			URL        string `json:"url"`
			Name       string `json:"name"`
		} `json:"rules"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	if len(req.Rules) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   "请至少提供一条隧道规则",
		})
		return
	}

	// 验证所有规则
	for i, rule := range req.Rules {
		if rule.EndpointID == 0 || rule.URL == "" || strings.TrimSpace(rule.Name) == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 条规则：endpointId、url、name 均不能为空", i+1),
			})
			return
		}
	}

	// 批量创建隧道
	var successCount, failCount int
	var errorMessages []string

	for i, rule := range req.Rules {
		// 使用等待模式批量创建隧道，超时时间为 3 秒
		if err := h.tunnelService.QuickCreateTunnelAndWait(rule.EndpointID, rule.URL, rule.Name, 3*time.Second); err != nil {
			failCount++
			errorMessages = append(errorMessages, fmt.Sprintf("第 %d 条规则失败：%s", i+1, err.Error()))
			log.Errorf("[API] 批量创建隧道失败 - 规则 %d: %v", i+1, err)
		} else {
			successCount++
			log.Infof("[API] 批量创建隧道成功 - 规则 %d: %s", i+1, rule.Name)
		}
	}

	// 返回结果
	if failCount == 0 {
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: fmt.Sprintf("成功创建 %d 个隧道", successCount),
		})
	} else if successCount == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: false,
			Error:   fmt.Sprintf("所有隧道创建失败：%s", strings.Join(errorMessages, "; ")),
		})
	} else {
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{
			Success: true,
			Message: fmt.Sprintf("部分成功：成功创建 %d 个隧道，失败 %d 个。失败原因：%s",
				successCount, failCount, strings.Join(errorMessages, "; ")),
		})
	}
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
		var endpointURL, endpointAPIPath, endpointAPIKey, endpointName string
		db := h.tunnelService.DB()
		err := db.QueryRow(
			"SELECT url, apiPath, apiKey, name FROM \"Endpoint\" WHERE id = ?",
			req.Inbounds.MasterID,
		).Scan(&endpointURL, &endpointAPIPath, &endpointAPIKey, &endpointName)
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

		// 生成隧道名称 - 单端模式使用主控名-single-时间戳
		tunnelName := fmt.Sprintf("%s-single-%d", endpointName, time.Now().Unix())

		// 使用等待模式创建隧道，超时时间为 3 秒
		if err := h.tunnelService.QuickCreateTunnelAndWait(req.Inbounds.MasterID, tunnelURL, tunnelName, 3*time.Second); err != nil {
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
			Name    string
		}

		db := h.tunnelService.DB()
		// 获取server endpoint信息
		err := db.QueryRow(
			"SELECT id, url, apiPath, apiKey, name FROM \"Endpoint\" WHERE id = ?",
			serverConfig.MasterID,
		).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.APIPath, &serverEndpoint.APIKey, &serverEndpoint.Name)
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
			"SELECT id, url, apiPath, apiKey, name FROM \"Endpoint\" WHERE id = ?",
			clientConfig.MasterID,
		).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.APIPath, &clientEndpoint.APIKey, &clientEndpoint.Name)
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

		// ⇔生成隧道名称 - 格式：${入口主控名}to${出口主控名}-${类型}-${时间}
		timestamp := time.Now().Unix()
		serverTunnelName := fmt.Sprintf("%s->%s-s-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
		clientTunnelName := fmt.Sprintf("%s->%s-c-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)

		log.Infof("[API] 开始创建双端隧道 - 先创建server端，再创建client端")

		// 第一步：创建server端隧道（使用等待模式）
		log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
		if err := h.tunnelService.QuickCreateTunnelAndWait(serverConfig.MasterID, serverURL, serverTunnelName, 3*time.Second); err != nil {
			log.Errorf("[API] 创建server端隧道失败: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建server端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤1完成: server端隧道创建成功")

		// 第二步：创建client端隧道（使用等待模式）
		log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
		if err := h.tunnelService.QuickCreateTunnelAndWait(clientConfig.MasterID, clientURL, clientTunnelName, 3*time.Second); err != nil {
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
			Name    string
		}

		db := h.tunnelService.DB()
		// 获取server endpoint信息
		err := db.QueryRow(
			"SELECT id, url, apiPath, apiKey, name FROM \"Endpoint\" WHERE id = ?",
			serverConfig.MasterID,
		).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.APIPath, &serverEndpoint.APIKey, &serverEndpoint.Name)
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
			"SELECT id, url, apiPath, apiKey, name FROM \"Endpoint\" WHERE id = ?",
			clientConfig.MasterID,
		).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.APIPath, &clientEndpoint.APIKey, &clientEndpoint.Name)
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

		// 生成隧道名称 - 格式：${入口主控名}to${出口主控名}-${类型}-${时间}
		timestamp := time.Now().Unix()
		serverTunnelName := fmt.Sprintf("%s->%s-s-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
		clientTunnelName := fmt.Sprintf("%s->%s-c-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)

		log.Infof("[API] 开始创建内网穿透隧道 - 先创建server端，再创建client端")

		// 第一步：创建server端隧道（使用等待模式）
		log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
		if err := h.tunnelService.QuickCreateTunnelAndWait(serverConfig.MasterID, serverURL, serverTunnelName, 3*time.Second); err != nil {
			log.Errorf("[API] 创建server端隧道失败: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{
				Success: false,
				Error:   "创建server端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤1完成: server端隧道创建成功")

		// 第二步：创建client端隧道（使用等待模式）
		log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
		if err := h.tunnelService.QuickCreateTunnelAndWait(clientConfig.MasterID, clientURL, clientTunnelName, 3*time.Second); err != nil {
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

	// 如果不是移入回收站，预先获取端点ID用于清理文件日志
	var instanceEndpointMap = make(map[string]int64)
	if !req.Recycle {
		for _, iid := range req.InstanceIDs {
			var endpointID int64
			if err := h.tunnelService.DB().QueryRow(`SELECT endpointId FROM "Tunnel" WHERE instanceId = ?`, iid).Scan(&endpointID); err == nil {
				instanceEndpointMap[iid] = endpointID
			} else {
				// 尝试从EndpointSSE表获取
				if err := h.tunnelService.DB().QueryRow(`SELECT DISTINCT endpointId FROM "EndpointSSE" WHERE instanceId = ? LIMIT 1`, iid).Scan(&endpointID); err == nil {
					instanceEndpointMap[iid] = endpointID
				}
			}
		}
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

			// 如果不是移入回收站，清理文件日志
			if !req.Recycle {
				if endpointID, exists := instanceEndpointMap[iid]; exists {
					if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
						if err := h.sseManager.GetFileLogger().ClearLogs(endpointID, iid); err != nil {
							log.Warnf("[API] 批量删除-清理隧道文件日志失败: endpointID=%d, instanceID=%s, err=%v", endpointID, iid, err)
						} else {
							log.Infof("[API] 批量删除-已清理隧道文件日志: endpointID=%d, instanceID=%s", endpointID, iid)
						}
					}
				}
			}
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

// HandleBatchActionTunnels 批量操作隧道（启动、停止、重启）
func (h *TunnelHandler) HandleBatchActionTunnels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 请求结构体
	type batchActionRequest struct {
		// 根据数据库 ID 操作
		IDs []int64 `json:"ids"`
		// 操作类型: start, stop, restart
		Action string `json:"action"`
	}

	// 操作结果
	type actionResult struct {
		ID         int64  `json:"id"`
		InstanceID string `json:"instanceId"`
		Name       string `json:"name"`
		Success    bool   `json:"success"`
		Error      string `json:"error,omitempty"`
	}

	// 响应结构体
	type batchActionResponse struct {
		Success   bool           `json:"success"`
		Operated  int            `json:"operated"`
		FailCount int            `json:"failCount"`
		Error     string         `json:"error,omitempty"`
		Results   []actionResult `json:"results,omitempty"`
		Action    string         `json:"action"`
	}

	var req batchActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchActionResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 验证操作类型
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchActionResponse{
			Success: false,
			Error:   "无效的操作类型，支持: start, stop, restart",
		})
		return
	}

	// 验证 ID 列表
	if len(req.IDs) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchActionResponse{
			Success: false,
			Error:   "请提供要操作的隧道ID列表",
		})
		return
	}

	// 限制批量操作的数量
	const maxBatchSize = 50
	if len(req.IDs) > maxBatchSize {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(batchActionResponse{
			Success: false,
			Error:   fmt.Sprintf("批量操作数量不能超过 %d 个", maxBatchSize),
		})
		return
	}

	log.Infof("[API] 开始批量%s操作，共 %d 个隧道", req.Action, len(req.IDs))

	var results []actionResult
	successCount := 0
	failCount := 0

	// 逐个处理每个隧道
	for _, tunnelID := range req.IDs {
		result := actionResult{
			ID: tunnelID,
		}

		// 获取隧道的 instanceID 和名称
		instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("获取实例ID失败: %v", err)
			failCount++
			results = append(results, result)
			continue
		}
		result.InstanceID = instanceID

		// 获取隧道名称（用于日志）
		tunnelName, err := h.tunnelService.GetTunnelNameByID(tunnelID)
		if err != nil {
			tunnelName = fmt.Sprintf("Tunnel-%d", tunnelID)
		}
		result.Name = tunnelName

		// 执行操作
		actionReq := tunnel.TunnelActionRequest{
			InstanceID: instanceID,
			Action:     req.Action,
		}

		if err := h.tunnelService.ControlTunnel(actionReq); err != nil {
			result.Success = false
			result.Error = err.Error()
			failCount++
			log.Warnf("[API] 批量%s操作失败 - 隧道: %s (ID: %d, InstanceID: %s), 错误: %v",
				req.Action, tunnelName, tunnelID, instanceID, err)
		} else {
			result.Success = true
			successCount++
			log.Infof("[API] 批量%s操作成功 - 隧道: %s (ID: %d, InstanceID: %s)",
				req.Action, tunnelName, tunnelID, instanceID)
		}

		results = append(results, result)
	}

	// 构建响应
	response := batchActionResponse{
		Success:   successCount > 0,
		Operated:  successCount,
		FailCount: failCount,
		Results:   results,
		Action:    req.Action,
	}

	// 设置整体错误信息
	if failCount > 0 && successCount == 0 {
		response.Error = "所有操作都失败了"
	} else if failCount > 0 {
		response.Error = fmt.Sprintf("部分操作失败: %d 个成功, %d 个失败", successCount, failCount)
	}

	statusCode := http.StatusOK
	if successCount == 0 {
		statusCode = http.StatusBadRequest
	}

	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)

	log.Infof("[API] 批量%s操作完成 - 成功: %d, 失败: %d", req.Action, successCount, failCount)
}

// HandleGetTunnelTrafficTrend 获取隧道流量趋势数据 (GET /api/tunnels/{id}/traffic-trend)
func (h *TunnelHandler) HandleGetTunnelTrafficTrend(w http.ResponseWriter, r *http.Request) {
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

	// 查询隧道基本信息
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

	trafficTrend := make([]map[string]interface{}, 0)

	if instanceID.Valid && instanceID.String != "" {
		// 流量趋势 - 查询24小时内的数据
		trendRows, err := db.Query(`SELECT eventTime, tcpRx, tcpTx, udpRx, udpTx FROM "EndpointSSE" WHERE endpointId = ? AND instanceId = ? AND pushType IN ('update','initial') AND (tcpRx IS NOT NULL OR tcpTx IS NOT NULL OR udpRx IS NOT NULL OR udpTx IS NOT NULL) AND eventTime >= datetime('now', '-24 hours') ORDER BY eventTime ASC`, endpointID, instanceID.String)
		if err == nil {
			defer trendRows.Close()

			// 使用 map 来存储每分钟的最新记录
			minuteMap := make(map[string]map[string]interface{})

			for trendRows.Next() {
				var eventTime time.Time
				var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
				if err := trendRows.Scan(&eventTime, &tcpRx, &tcpTx, &udpRx, &udpTx); err == nil {
					// 格式化时间到分钟
					minuteKey := eventTime.Format("2006-01-02 15:04")

					// 存储这一分钟的最新记录（由于是按时间升序，后面的会覆盖前面的）
					minuteMap[minuteKey] = map[string]interface{}{
						"eventTime": minuteKey,
						"tcpRx":     tcpRx.Int64,
						"tcpTx":     tcpTx.Int64,
						"udpRx":     udpRx.Int64,
						"udpTx":     udpTx.Int64,
					}
				}
			}

			// 将 map 转换为有序的 slice
			type TrafficPoint struct {
				EventTime string `json:"eventTime"`
				TcpRx     int64  `json:"tcpRx"`
				TcpTx     int64  `json:"tcpTx"`
				UdpRx     int64  `json:"udpRx"`
				UdpTx     int64  `json:"udpTx"`
			}

			var sortedPoints []TrafficPoint
			for _, record := range minuteMap {
				sortedPoints = append(sortedPoints, TrafficPoint{
					EventTime: record["eventTime"].(string),
					TcpRx:     record["tcpRx"].(int64),
					TcpTx:     record["tcpTx"].(int64),
					UdpRx:     record["udpRx"].(int64),
					UdpTx:     record["udpTx"].(int64),
				})
			}

			// 按时间排序
			sort.Slice(sortedPoints, func(i, j int) bool {
				return sortedPoints[i].EventTime < sortedPoints[j].EventTime
			})

			// 计算差值并构建最终的流量趋势数据
			for i := 1; i < len(sortedPoints); i++ {
				current := sortedPoints[i]
				previous := sortedPoints[i-1]

				// 计算差值，确保非负数
				tcpRxDiff := int64(0)
				if current.TcpRx >= previous.TcpRx {
					tcpRxDiff = current.TcpRx - previous.TcpRx
				}

				tcpTxDiff := int64(0)
				if current.TcpTx >= previous.TcpTx {
					tcpTxDiff = current.TcpTx - previous.TcpTx
				}

				udpRxDiff := int64(0)
				if current.UdpRx >= previous.UdpRx {
					udpRxDiff = current.UdpRx - previous.UdpRx
				}

				udpTxDiff := int64(0)
				if current.UdpTx >= previous.UdpTx {
					udpTxDiff = current.UdpTx - previous.UdpTx
				}

				// 添加差值数据到趋势中
				trafficTrend = append(trafficTrend, map[string]interface{}{
					"eventTime": current.EventTime,
					"tcpRxDiff": float64(tcpRxDiff), // 确保JSON序列化为数字
					"tcpTxDiff": float64(tcpTxDiff), // 确保JSON序列化为数字
					"udpRxDiff": float64(udpRxDiff), // 确保JSON序列化为数字
					"udpTxDiff": float64(udpTxDiff), // 确保JSON序列化为数字
				})
			}

			// 补充缺失的时间点到当前时间
			if len(trafficTrend) > 0 {
				// 获取最后一个数据点的时间
				lastItem := trafficTrend[len(trafficTrend)-1]
				lastTimeStr := lastItem["eventTime"].(string)

				// 解析最后时间
				lastTime, err := time.Parse("2006-01-02 15:04", lastTimeStr)
				if err == nil {
					now := time.Now()
					// 计算时间差（分钟）
					timeDiffMinutes := int(now.Sub(lastTime).Minutes())

					// 如果最后数据时间距离当前时间超过2分钟，就补充虚拟时间点
					if timeDiffMinutes > 2 {
						// 从最后数据时间的下一分钟开始补充
						currentTime := lastTime.Add(time.Minute)

						for currentTime.Before(now) {
							// 格式化为 "YYYY-MM-DD HH:mm" 格式
							virtualTimeStr := currentTime.Format("2006-01-02 15:04")

							// 添加虚拟数据点（所有流量差值都为0）
							trafficTrend = append(trafficTrend, map[string]interface{}{
								"eventTime": virtualTimeStr,
								"tcpRxDiff": float64(0),
								"tcpTxDiff": float64(0),
								"udpRxDiff": float64(0),
								"udpTxDiff": float64(0),
							})

							// 移动到下一分钟
							currentTime = currentTime.Add(time.Minute)
						}
					}
				}
			}
		}
	}

	// 返回流量趋势数据
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"trafficTrend": trafficTrend,
	})
}

// HandleUpdateTunnelV2 新版隧道更新逻辑 (PUT /api/tunnels/{id})
// 特点：
// 1. 不再删除后重建，而是构建命令行后调用 NodePass PUT /v1/instance/{id}
// 2. 调用成功后等待 SSE 更新数据库中的 commandLine 字段；超时则直接更新本地数据库。
// 3. 若远端返回 405 等错误，则回退到旧逻辑 HandleUpdateTunnel。
func (h *TunnelHandler) HandleUpdateTunnelV2(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	tunnelIDStr := vars["id"]
	tunnelID, err := strconv.ParseInt(tunnelIDStr, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "无效的隧道ID"})
		return
	}

	// 解析请求体（与创建接口保持一致）
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
		Password      string          `json:"password"`
		Min           json.RawMessage `json:"min"`
		Max           json.RawMessage `json:"max"`
	}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "无效的请求数据"})
		return
	}

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

	tunnelPort, err1 := parseInt(raw.TunnelPort)
	targetPort, err2 := parseInt(raw.TargetPort)
	if err1 != nil || err2 != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "端口号格式错误，应为数字"})
		return
	}

	// 构建命令行
	var commandLine string
	if raw.Password != "" {
		commandLine = fmt.Sprintf("%s://%s@%s:%d/%s:%d", raw.Mode, raw.Password, raw.TunnelAddress, tunnelPort, raw.TargetAddress, targetPort)
	} else {
		commandLine = fmt.Sprintf("%s://%s:%d/%s:%d", raw.Mode, raw.TunnelAddress, tunnelPort, raw.TargetAddress, targetPort)
	}

	var queryParams []string
	if raw.LogLevel != "" && raw.LogLevel != "inherit" {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", raw.LogLevel))
	}
	if raw.Mode == "server" && raw.TLSMode != "" && raw.TLSMode != "inherit" {
		var tlsNum string
		switch raw.TLSMode {
		case "mode0":
			tlsNum = "0"
		case "mode1":
			tlsNum = "1"
		case "mode2":
			tlsNum = "2"
		}
		if tlsNum != "" {
			queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsNum))
		}
		if raw.TLSMode == "mode2" && raw.CertPath != "" && raw.KeyPath != "" {
			queryParams = append(queryParams, fmt.Sprintf("crt=%s", raw.CertPath), fmt.Sprintf("key=%s", raw.KeyPath))
		}
	}
	if raw.Mode == "client" {
		// 处理 min/max
		minVal, _ := parseInt(raw.Min)
		maxVal, _ := parseInt(raw.Max)
		if minVal >= 0 {
			queryParams = append(queryParams, fmt.Sprintf("min=%d", minVal))
		}
		if maxVal >= 0 {
			queryParams = append(queryParams, fmt.Sprintf("max=%d", maxVal))
		}
	}
	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	// 获取实例ID
	instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: err.Error()})
		return
	}

	// 获取端点信息
	var endpoint struct{ URL, APIPath, APIKey string }
	if err := h.tunnelService.DB().QueryRow(`SELECT url, apiPath, apiKey FROM "Endpoint" e JOIN "Tunnel" t ON e.id = t.endpointId WHERE t.id = ?`, tunnelID).Scan(&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "查询端点信息失败"})
		return
	}

	npClient := nodepass.NewClient(endpoint.URL, endpoint.APIPath, endpoint.APIKey, nil)
	log.Infof("[API] 准备调用 UpdateInstanceV1: instanceID=%s, commandLine=%s", instanceID, commandLine)
	if err := npClient.UpdateInstanceV1(instanceID, commandLine); err != nil {
		log.Errorf("[API] UpdateInstanceV1 调用失败: %v", err)
		// 若远端返回 405，则回退旧逻辑（删除+重建）
		if strings.Contains(err.Error(), "405") || strings.Contains(err.Error(), "404") {
			log.Infof("[API] 检测到405/404错误，回退到旧逻辑")
			// 删除旧实例
			if delErr := h.tunnelService.DeleteTunnelAndWait(instanceID, 3*time.Second, true); delErr != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，删除旧实例错误: " + delErr.Error()})
				return
			}

			// 重新创建
			minVal, _ := parseInt(raw.Min)
			maxVal, _ := parseInt(raw.Max)
			createReq := tunnel.CreateTunnelRequest{
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
				Password:      raw.Password,
				Min:           minVal,
				Max:           maxVal,
			}
			newTunnel, crtErr := h.tunnelService.CreateTunnelAndWait(createReq, 3*time.Second)
			if crtErr != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，创建新实例错误: " + crtErr.Error()})
				return
			}
			json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: true, Message: "编辑实例成功(回退旧逻辑)", Tunnel: newTunnel})
			return
		}
		// 其他错误
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: false, Error: err.Error()})
		return
	}

	// 调用成功后等待数据库同步
	success := false
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var dbCmd, dbStatus string
		if scanErr := h.tunnelService.DB().QueryRow(`SELECT commandLine, status FROM "Tunnel" WHERE instanceId = ?`, instanceID).Scan(&dbCmd, &dbStatus); scanErr == nil {
			if dbCmd == commandLine && dbStatus == "running" {
				success = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}

	if !success {
		// 超时，直接更新本地数据库
		minVal, _ := parseInt(raw.Min)
		maxVal, _ := parseInt(raw.Max)
		_, _ = h.tunnelService.DB().Exec(`UPDATE "Tunnel" SET name = ?, mode = ?, tunnelAddress = ?, tunnelPort = ?, targetAddress = ?, targetPort = ?, tlsMode = ?, certPath = ?, keyPath = ?, logLevel = ?, commandLine = ?, min = ?, max = ?, status = ?, updatedAt = ? WHERE id = ?`,
			raw.Name, raw.Mode, raw.TunnelAddress, tunnelPort, raw.TargetAddress, targetPort, raw.TLSMode, raw.CertPath, raw.KeyPath, raw.LogLevel, commandLine, minVal, maxVal, "running", time.Now(), tunnelID)
	}

	json.NewEncoder(w).Encode(tunnel.TunnelResponse{Success: true, Message: "编辑实例成功"})
}

// HandleExportTunnelLogs 导出隧道的所有日志文件和EndpointSSE记录
func (h *TunnelHandler) HandleExportTunnelLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	vars := mux.Vars(r)
	tunnelIDStr := vars["id"]

	// 解析隧道ID
	tunnelID, err := strconv.ParseInt(tunnelIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid tunnel ID", http.StatusBadRequest)
		return
	}

	// 获取隧道信息
	db := h.tunnelService.DB()
	var tunnelName, instanceID string
	var endpointID int64

	err = db.QueryRow(`
		SELECT name, endpointId, instanceId 
		FROM Tunnel 
		WHERE id = ?
	`, tunnelID).Scan(&tunnelName, &endpointID, &instanceID)

	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Tunnel not found", http.StatusNotFound)
			return
		}
		log.Errorf("[API] 获取隧道信息失败: %v", err)
		http.Error(w, "Failed to get tunnel info", http.StatusInternalServerError)
		return
	}

	// 创建zip缓冲区
	var zipBuffer bytes.Buffer
	zipWriter := zip.NewWriter(&zipBuffer)

	// 1. 获取并添加现有的.log文件
	logFileCount := 0
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		// 直接读取现有的.log文件，使用FileLogger的实际目录结构
		// 根据FileLogger的实现，目录结构应该是: baseDir/endpoint_{endpointId}/{instanceId}/*.log
		baseDir := "logs" // 这里可能需要根据实际配置调整
		logDir := filepath.Join(baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID)

		// 检查日志目录是否存在
		if _, err := os.Stat(logDir); err == nil {
			// 遍历目录中的所有.log文件
			err := filepath.Walk(logDir, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil // 忽略错误，继续处理
				}

				// 只处理.log文件
				if !info.IsDir() && strings.HasSuffix(info.Name(), ".log") {
					// 读取文件内容
					fileContent, err := os.ReadFile(path)
					if err != nil {
						log.Warnf("[API] 读取日志文件失败: %s, err: %v", path, err)
						return nil
					}

					// 使用原始文件名作为zip内的文件名
					zipFileName := info.Name()
					writer, err := zipWriter.Create(zipFileName)
					if err != nil {
						log.Warnf("[API] 创建zip文件条目失败: %s, err: %v", zipFileName, err)
						return nil
					}

					_, err = writer.Write(fileContent)
					if err != nil {
						log.Warnf("[API] 写入zip文件失败: %s, err: %v", zipFileName, err)
					} else {
						logFileCount++
						log.Debugf("[API] 成功添加日志文件: %s", zipFileName)
					}
				}
				return nil
			})

			if err != nil {
				log.Warnf("[API] 遍历日志目录失败: %v", err)
			}
		} else {
			log.Warnf("[API] 日志目录不存在: %s", logDir)
		}
	}

	// 2. 获取并添加EndpointSSE记录
	sseRecords := []map[string]interface{}{}
	rows, err := db.Query(`
		SELECT id, eventType, pushType, eventTime, endpointId, instanceId, 
		       instanceType, status, url, tcpRx, tcpTx, udpRx, udpTx, 
		       logs, createdAt, alias, restart
		FROM "EndpointSSE" 
		WHERE endpointId = ? AND instanceId = ?
		ORDER BY createdAt DESC
	`, endpointID, instanceID)

	if err != nil {
		log.Warnf("[API] 获取EndpointSSE记录失败: %v", err)
	} else {
		defer rows.Close()

		for rows.Next() {
			var record struct {
				ID           int64     `json:"id"`
				EventType    string    `json:"eventType"`
				PushType     string    `json:"pushType"`
				EventTime    time.Time `json:"eventTime"`
				EndpointID   int64     `json:"endpointId"`
				InstanceID   string    `json:"instanceId"`
				InstanceType *string   `json:"instanceType"`
				Status       *string   `json:"status"`
				URL          *string   `json:"url"`
				TCPRx        int64     `json:"tcpRx"`
				TCPTx        int64     `json:"tcpTx"`
				UDPRx        int64     `json:"udpRx"`
				UDPTx        int64     `json:"udpTx"`
				Logs         *string   `json:"logs"`
				CreatedAt    time.Time `json:"createdAt"`
				Alias        *string   `json:"alias"`
				Restart      *bool     `json:"restart"`
			}

			err := rows.Scan(
				&record.ID, &record.EventType, &record.PushType, &record.EventTime,
				&record.EndpointID, &record.InstanceID, &record.InstanceType,
				&record.Status, &record.URL, &record.TCPRx, &record.TCPTx,
				&record.UDPRx, &record.UDPTx, &record.Logs, &record.CreatedAt,
				&record.Alias, &record.Restart,
			)

			if err != nil {
				log.Warnf("[API] 扫描EndpointSSE记录失败: %v", err)
				continue
			}

			// 转换为map以便JSON序列化
			recordMap := map[string]interface{}{
				"id":         record.ID,
				"eventType":  record.EventType,
				"pushType":   record.PushType,
				"eventTime":  record.EventTime.Format(time.RFC3339),
				"endpointId": record.EndpointID,
				"instanceId": record.InstanceID,
				"tcpRx":      record.TCPRx,
				"tcpTx":      record.TCPTx,
				"udpRx":      record.UDPRx,
				"udpTx":      record.UDPTx,
				"createdAt":  record.CreatedAt.Format(time.RFC3339),
			}

			// 添加可选字段
			if record.InstanceType != nil {
				recordMap["instanceType"] = *record.InstanceType
			}
			if record.Status != nil {
				recordMap["status"] = *record.Status
			}
			if record.URL != nil {
				recordMap["url"] = *record.URL
			}
			if record.Logs != nil {
				recordMap["logs"] = *record.Logs
			}
			if record.Alias != nil {
				recordMap["alias"] = *record.Alias
			}
			if record.Restart != nil {
				recordMap["restart"] = *record.Restart
			}

			sseRecords = append(sseRecords, recordMap)
		}
	}

	// 将SSE记录写入zip作为CSV文件
	if len(sseRecords) > 0 {
		writer, err := zipWriter.Create("sse_records.csv")
		if err == nil {
			// 写入CSV头部
			csvHeader := "ID,EventType,PushType,EventTime,EndpointID,InstanceID,InstanceType,Status,URL,TCPRx,TCPTx,UDPRx,UDPTx,Logs,CreatedAt,Alias,Restart\n"
			writer.Write([]byte(csvHeader))

			// 写入数据行
			for _, record := range sseRecords {
				csvLine := fmt.Sprintf("%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v,%v\n",
					getFieldValue(record, "id"),
					getFieldValue(record, "eventType"),
					getFieldValue(record, "pushType"),
					getFieldValue(record, "eventTime"),
					getFieldValue(record, "endpointId"),
					getFieldValue(record, "instanceId"),
					getFieldValue(record, "instanceType"),
					getFieldValue(record, "status"),
					getFieldValue(record, "url"),
					getFieldValue(record, "tcpRx"),
					getFieldValue(record, "tcpTx"),
					getFieldValue(record, "udpRx"),
					getFieldValue(record, "udpTx"),
					escapeCSVField(fmt.Sprintf("%v", getFieldValue(record, "logs"))),
					getFieldValue(record, "createdAt"),
					getFieldValue(record, "alias"),
					getFieldValue(record, "restart"),
				)
				writer.Write([]byte(csvLine))
			}
		}
	}

	// 3. 添加导出信息文件
	exportInfo := map[string]interface{}{
		"tunnelId":       tunnelID,
		"tunnelName":     tunnelName,
		"instanceId":     instanceID,
		"endpointId":     endpointID,
		"exportTime":     time.Now().Format(time.RFC3339),
		"logFileCount":   logFileCount,
		"sseRecordCount": len(sseRecords),
	}

	exportInfoData, err := json.MarshalIndent(exportInfo, "", "  ")
	if err == nil {
		writer, err := zipWriter.Create("export_info.json")
		if err == nil {
			writer.Write(exportInfoData)
		}
	}

	// 4. 获取并添加现有的.log文件
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		// 直接读取现有的.log文件
		baseDir := "logs" // 根据实际的日志目录结构调整
		logDir := filepath.Join(baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID)

		// 检查日志目录是否存在
		if _, err := os.Stat(logDir); err == nil {
			// 遍历目录中的所有.log文件
			err := filepath.Walk(logDir, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil // 忽略错误，继续处理
				}

				// 只处理.log文件
				if !info.IsDir() && strings.HasSuffix(info.Name(), ".log") {
					// 读取文件内容
					fileContent, err := os.ReadFile(path)
					if err != nil {
						log.Warnf("[API] 读取日志文件失败: %s, err: %v", path, err)
						return nil
					}

					// 使用相对路径作为zip内的文件名
					zipFileName := fmt.Sprintf("logs/%s", info.Name())
					writer, err := zipWriter.Create(zipFileName)
					if err != nil {
						log.Warnf("[API] 创建zip文件条目失败: %s, err: %v", zipFileName, err)
						return nil
					}

					_, err = writer.Write(fileContent)
					if err != nil {
						log.Warnf("[API] 写入zip文件失败: %s, err: %v", zipFileName, err)
					}
				}
				return nil
			})

			if err != nil {
				log.Warnf("[API] 遍历日志目录失败: %v", err)
			}
		} else {
			log.Warnf("[API] 日志目录不存在: %s", logDir)
		}
	}

	// 关闭zip writer
	err = zipWriter.Close()
	if err != nil {
		log.Errorf("[API] 关闭zip writer失败: %v", err)
		http.Error(w, "Failed to create zip file", http.StatusInternalServerError)
		return
	}

	// 设置响应头
	filename := fmt.Sprintf("%s_logs_%s.zip", tunnelName, time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", zipBuffer.Len()))

	// 发送zip文件
	_, err = w.Write(zipBuffer.Bytes())
	if err != nil {
		log.Errorf("[API] 发送zip文件失败: %v", err)
		return
	}

	log.Infof("[API] 成功导出隧道 %s (ID: %d) 的日志文件，包含 %d 个.log文件和 %d 条SSE记录",
		tunnelName, tunnelID, logFileCount, len(sseRecords))
}

// getFieldValue 从map中安全获取字段值
func getFieldValue(record map[string]interface{}, key string) interface{} {
	if val, exists := record[key]; exists {
		return val
	}
	return ""
}

// escapeCSVField 转义CSV字段中的特殊字符
func escapeCSVField(field string) string {
	// 如果字段包含逗号、引号或换行符，需要用引号包围并转义内部引号
	if strings.Contains(field, ",") || strings.Contains(field, "\"") || strings.Contains(field, "\n") || strings.Contains(field, "\r") {
		// 转义内部引号
		escaped := strings.ReplaceAll(field, "\"", "\"\"")
		return fmt.Sprintf("\"%s\"", escaped)
	}
	return field
}
