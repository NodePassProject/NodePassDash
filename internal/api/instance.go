package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/instance"
)

// InstanceHandler 实例相关的处理器
type InstanceHandler struct {
	instanceService *instance.Service
	endpointService *endpoint.Service
}

// NewInstanceHandler 创建实例处理器
func NewInstanceHandler(instanceService *instance.Service, endpointService *endpoint.Service) *InstanceHandler {
	return &InstanceHandler{
		instanceService: instanceService,
		endpointService: endpointService,
	}
}

// HandleGetInstances 获取实例列表
func (h *InstanceHandler) HandleGetInstances(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 从URL中获取端点ID
	endpointIDStr := r.URL.Query().Get("endpointId")
	if endpointIDStr == "" {
		// 尝试从路径 /api/endpoints/{endpointId}/instances 提取
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		// 期望格式: api, endpoints, {endpointId}, instances
		if len(parts) >= 4 {
			endpointIDStr = parts[2]
		}
	}

	if endpointIDStr == "" {
		http.Error(w, "Missing endpointId parameter", http.StatusBadRequest)
		return
	}

	// 解析端点ID
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpointId parameter", http.StatusBadRequest)
		return
	}

	// 使用服务层获取端点信息
	endpoint, err := h.endpointService.GetEndpointByID(endpointID)
	if err != nil {
		http.Error(w, "Endpoint not found", http.StatusNotFound)
		return
	}

	// 获取实例列表
	instances, err := h.instanceService.GetInstances(endpoint.URL, endpoint.APIPath, endpoint.APIKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 返回实例列表
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(instances)
}

// HandleGetInstance 获取单个实例信息
func (h *InstanceHandler) HandleGetInstance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 从URL中获取端点ID和实例ID
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}
	endpointIDStr := parts[3]
	instanceID := parts[4]

	// 解析端点ID
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpointId parameter", http.StatusBadRequest)
		return
	}

	// 使用服务层获取端点信息
	endpoint, err := h.endpointService.GetEndpointByID(endpointID)
	if err != nil {
		http.Error(w, "Endpoint not found", http.StatusNotFound)
		return
	}

	// 获取实例信息
	instance, err := h.instanceService.GetInstance(endpoint.URL, endpoint.APIPath, endpoint.APIKey, instanceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 返回实例信息
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(instance)
}

// HandleControlInstance 控制实例状态
func (h *InstanceHandler) HandleControlInstance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 从URL中获取端点ID和实例ID
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}
	endpointIDStr := parts[3]
	instanceID := parts[4]

	// 解析请求体
	var req struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 验证action
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}

	// 解析端点ID
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid endpointId parameter", http.StatusBadRequest)
		return
	}

	// 使用服务层获取端点信息
	endpoint, err := h.endpointService.GetEndpointByID(endpointID)
	if err != nil {
		http.Error(w, "Endpoint not found", http.StatusNotFound)
		return
	}

	// 控制实例状态
	err = h.instanceService.ControlInstance(endpoint.URL, endpoint.APIPath, endpoint.APIKey, instanceID, req.Action)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 返回成功响应
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
