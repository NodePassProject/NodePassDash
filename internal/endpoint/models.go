package endpoint

import "time"

// EndpointStatus 端点状态枚举
type EndpointStatus string

const (
	StatusOnline     EndpointStatus = "ONLINE"
	StatusOffline    EndpointStatus = "OFFLINE"
	StatusFail       EndpointStatus = "FAIL"
	StatusDisconnect EndpointStatus = "DISCONNECT"
)

// Endpoint 端点基本信息
type Endpoint struct {
	ID        int64          `json:"id"`
	Name      string         `json:"name"`
	URL       string         `json:"url"`
	APIPath   string         `json:"apiPath"`
	APIKey    string         `json:"apiKey"`
	Status    EndpointStatus `json:"status"`
	Color     string         `json:"color,omitempty"`
	OS        string         `json:"os,omitempty"`
	Arch      string         `json:"arch,omitempty"`
	Ver       string         `json:"ver,omitempty"`
	Log       string         `json:"log,omitempty"`
	TLS       string         `json:"tls,omitempty"`
	Crt       string         `json:"crt,omitempty"`
	KeyPath   string         `json:"keyPath,omitempty"`
	LastCheck time.Time      `json:"lastCheck"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

// EndpointWithStats 带统计信息的端点
type EndpointWithStats struct {
	Endpoint
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
	OS   string `json:"os"`
	Arch string `json:"arch"`
	Ver  string `json:"ver"`
	Name string `json:"name"`
	Log  string `json:"log"`
	TLS  string `json:"tls"`
	Crt  string `json:"crt"`
	Key  string `json:"key"`
}
