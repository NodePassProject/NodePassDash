package endpoint

import (
	"NodePassDash/internal/models"
)

// 使用统一模型定义
type Endpoint = models.Endpoint
type EndpointStatus = models.EndpointStatus

// 状态常量 - 保持向后兼容
const (
	StatusOnline     = models.EndpointStatusOnline
	StatusOffline    = models.EndpointStatusOffline
	StatusFail       = models.EndpointStatusFail
	StatusDisconnect = models.EndpointStatusDisconnect
)

// EndpointWithStats 带统计信息的端点
type EndpointWithStats struct {
	models.Endpoint
	TunnelCount   int `json:"tunnelCount"`
	ActiveTunnels int `json:"activeTunnels"`
}

// CreateEndpointRequest 创建端点请求
type CreateEndpointRequest struct {
	Name    string `json:"name" validate:"required,max=50"`
	URL     string `json:"url" validate:"required,url"`
	APIPath string `json:"apiPath" validate:"required"`
	APIKey  string `json:"apiKey" validate:"required,max=200"`
	Color   string `json:"color,omitempty"`
}

// UpdateEndpointRequest 更新端点请求
type UpdateEndpointRequest struct {
	ID      int64  `json:"id" validate:"required"`
	Action  string `json:"action" validate:"required,oneof=update rename"`
	Name    string `json:"name,omitempty" validate:"omitempty,max=50"`
	URL     string `json:"url,omitempty" validate:"omitempty,url"`
	APIPath string `json:"apiPath,omitempty"`
	APIKey  string `json:"apiKey,omitempty" validate:"omitempty,max=200"`
}

// EndpointResponse API 响应
type EndpointResponse struct {
	Success  bool        `json:"success"`
	Message  string      `json:"message,omitempty"`
	Error    string      `json:"error,omitempty"`
	Endpoint interface{} `json:"endpoint,omitempty"`
}

// NodePassInfo NodePass实例的系统信息
type NodePassInfo struct {
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	Ver    string `json:"ver"`
	Name   string `json:"name"`
	Log    string `json:"log"`
	TLS    string `json:"tls"`
	Crt    string `json:"crt"`
	Key    string `json:"key"`
	Uptime *int64 `json:"uptime,omitempty"` // 使用指针类型，支持低版本兼容
}
