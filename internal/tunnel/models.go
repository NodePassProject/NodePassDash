package tunnel

import (
	"NodePassDash/internal/models"
)

// 使用统一模型定义
type Tunnel = models.Tunnel
type TunnelStatus = models.TunnelStatus
type TunnelType = models.TunnelType
type TLSMode = models.TLSMode
type LogLevel = models.LogLevel
type Group = models.Group
type TunnelMode = models.TunnelMode

// 状态常量 - 保持向后兼容
const (
	StatusRunning = models.TunnelStatusRunning
	StatusStopped = models.TunnelStatusStopped
	StatusError   = models.TunnelStatusError
	StatusOffline = models.TunnelStatusOffline
)

// 模式常量 - 保持向后兼容
const (
	ModeServer = models.TunnelModeServer
	ModeClient = models.TunnelModeClient
)

// TLS模式常量 - 保持向后兼容
const (
	TLSModeInherit = models.TLSModeInherit
	TLS0           = models.TLS0
	TLS1           = models.TLS1
	TLS2           = models.TLS2
)

// 日志级别常量 - 保持向后兼容
const (
	LogLevelInherit = models.LogLevelInherit
	LogLevelDebug   = models.LogLevelDebug
	LogLevelInfo    = models.LogLevelInfo
	LogLevelWarn    = models.LogLevelWarn
	LogLevelError   = models.LogLevelError
	LogLevelEvent   = models.LogLevelEvent
	LogLevelNone    = models.LogLevelNone
)

// TunnelQueryParams 隧道查询参数
type TunnelQueryParams struct {
	Search          string `json:"search"`            // 搜索关键词
	Status          string `json:"status"`            // 状态筛选
	EndpointID      string `json:"endpoint_id"`       // 主控筛选
	EndpointGroupID string `json:"endpoint_group_id"` // 主控组筛选
	PortFilter      string `json:"port_filter"`       // 端口筛选
	GroupID         string `json:"group_id"`          // 分组筛选
	Page            int    `json:"page"`              // 页码
	PageSize        int    `json:"page_size"`         // 每页大小
	SortBy          string `json:"sort_by"`           // 排序字段
	SortOrder       string `json:"sort_order"`        // 排序方向
}

// TunnelListResult 隧道列表结果
type TunnelListResult struct {
	Data       []TunnelWithStats `json:"data"`        // 数据列表
	Total      int               `json:"total"`       // 总数
	Page       int               `json:"page"`        // 当前页码
	PageSize   int               `json:"page_size"`   // 每页大小
	TotalPages int               `json:"total_pages"` // 总页数
}

// TunnelWithStats 带统计信息的隧道
type TunnelWithStats struct {
	ID              int64        `json:"id"`                   // 隧道ID
	Name            string       `json:"name"`                 // 隧道名称
	EndpointID      int64        `json:"endpointId"`           // 端点ID
	Type            TunnelType   `json:"type"`                 // 隧道类型
	Status          TunnelStatus `json:"status"`               // 隧道状态
	TunnelAddress   string       `json:"tunnelAddress"`        // 隧道地址
	TunnelPort      string       `json:"tunnelPort"`           // 隧道端口
	TargetAddress   string       `json:"targetAddress"`        // 目标地址
	TargetPort      string       `json:"targetPort"`           // 目标端口
	InstanceID      *string      `json:"instanceId,omitempty"` // 实例ID
	TotalRx         int64        `json:"totalRx"`              // TCP+UDP 接收汇总
	TotalTx         int64        `json:"totalTx"`              // TCP+UDP 发送汇总
	EndpointName    string       `json:"endpoint"`             // 端点名称
	EndpointVersion string       `json:"version,omitempty"`    // 端点版本
}

// CreateTunnelRequest 创建隧道请求
type CreateTunnelRequest struct {
	Name           string      `json:"name" validate:"required"`
	EndpointID     int64       `json:"endpointId" validate:"required"`
	Type           string      `json:"type" validate:"required,oneof=server client"`
	TunnelAddress  string      `json:"tunnelAddress"`
	TunnelPort     int         `json:"tunnelPort" validate:"required"`
	TargetAddress  string      `json:"targetAddress"`
	TargetPort     int         `json:"targetPort" validate:"required"`
	TLSMode        TLSMode     `json:"tlsMode"`
	CertPath       string      `json:"certPath,omitempty"`
	KeyPath        string      `json:"keyPath,omitempty"`
	LogLevel       LogLevel    `json:"logLevel"`
	Password       string      `json:"password,omitempty"`
	Min            *int        `json:"min,omitempty"`
	Max            *int        `json:"max,omitempty"`
	Restart        bool        `json:"restart"`
	Mode           *TunnelMode `json:"mode,omitempty"`
	Read           *string     `json:"read,omitempty"`
	Rate           *int        `json:"rate,omitempty"`
	Slot           *int        `json:"slot,omitempty"`
	ProxyProtocol  *bool       `json:"proxyProtocol,omitempty"`
	Tags           []string    `json:"tags,omitempty"`
	EnableSSEStore bool        `json:"enable_sse_store,omitempty"`
	EnableLogStore bool        `json:"enable_log_store,omitempty"`
}

// BatchCreateTunnelItem 批量创建隧道的单个项目
type BatchCreateTunnelItem struct {
	EndpointID   int64  `json:"endpointId" validate:"required"`
	InboundsPort int    `json:"inbounds_port" validate:"required"` // 对应tunnelPort
	OutboundHost string `json:"outbound_host" validate:"required"` // 对应targetAddress
	OutboundPort int    `json:"outbound_port" validate:"required"` // 对应targetPort
	Name         string `json:"name,omitempty"`                    // 隧道名称（可选，不提供则自动生成）
}

// BatchCreateTunnelRequest 批量创建隧道请求
type BatchCreateTunnelRequest struct {
	Items []BatchCreateTunnelItem `json:"items" validate:"required,dive"`
}

// BatchCreateTunnelResponse 批量创建隧道响应
type BatchCreateTunnelResponse struct {
	Success      bool                `json:"success"`
	Message      string              `json:"message,omitempty"`
	Error        string              `json:"error,omitempty"`
	Results      []BatchCreateResult `json:"results,omitempty"`
	SuccessCount int                 `json:"successCount"`
	FailCount    int                 `json:"failCount"`
}

// BatchCreateResult 批量创建的单个结果
type BatchCreateResult struct {
	Index    int    `json:"index"`
	Success  bool   `json:"success"`
	Message  string `json:"message,omitempty"`
	Error    string `json:"error,omitempty"`
	TunnelID int64  `json:"tunnelId,omitempty"`
}

// StandardBatchCreateItem 标准模式批量创建项
type StandardBatchCreateItem struct {
	Log        string `json:"log" validate:"required"`
	Name       string `json:"name" validate:"required"`
	EndpointID int64  `json:"endpointId" validate:"required"`
	TunnelPort int    `json:"tunnel_port" validate:"required"`
	TargetHost string `json:"target_host" validate:"required"`
	TargetPort int    `json:"target_port" validate:"required"`
}

// ConfigBatchCreateConfig 配置模式的单个配置项
type ConfigBatchCreateConfig struct {
	Dest       string `json:"dest" validate:"required"`
	ListenPort int    `json:"listen_port" validate:"required"`
	Name       string `json:"name" validate:"required"`
}

// ConfigBatchCreateItem 配置模式批量创建项
type ConfigBatchCreateItem struct {
	Log        string                    `json:"log" validate:"required"`
	EndpointID int64                     `json:"endpointId" validate:"required"`
	Config     []ConfigBatchCreateConfig `json:"config" validate:"required,dive"`
}

// NewBatchCreateRequest 新的批量创建请求
type NewBatchCreateRequest struct {
	Mode     string                    `json:"mode" validate:"required,oneof=standard config"`
	Standard []StandardBatchCreateItem `json:"standard,omitempty"`
	Config   []ConfigBatchCreateItem   `json:"config,omitempty"`
}

// NewBatchCreateResponse 新的批量创建响应
type NewBatchCreateResponse struct {
	Success      bool                `json:"success"`
	Message      string              `json:"message,omitempty"`
	Error        string              `json:"error,omitempty"`
	Results      []BatchCreateResult `json:"results,omitempty"`
	SuccessCount int                 `json:"successCount"`
	FailCount    int                 `json:"failCount"`
}

// UpdateTunnelRequest 更新隧道请求
type UpdateTunnelRequest struct {
	ID             int64       `json:"id" validate:"required"`
	Name           string      `json:"name,omitempty"`
	TunnelAddress  string      `json:"tunnelAddress,omitempty"`
	TunnelPort     int         `json:"tunnelPort,omitempty"`
	TargetAddress  string      `json:"targetAddress,omitempty"`
	TargetPort     int         `json:"targetPort,omitempty"`
	TLSMode        TLSMode     `json:"tlsMode,omitempty"`
	CertPath       string      `json:"certPath,omitempty"`
	KeyPath        string      `json:"keyPath,omitempty"`
	LogLevel       LogLevel    `json:"logLevel,omitempty"`
	Password       string      `json:"password,omitempty"`
	Min            *int        `json:"min,omitempty"`
	Max            *int        `json:"max,omitempty"`
	Restart        bool        `json:"restart"`
	Mode           *TunnelMode `json:"mode,omitempty"`
	Read           *string     `json:"read,omitempty"`
	Rate           *int        `json:"rate,omitempty"`
	Slot           *int        `json:"slot,omitempty"`
	EnableSSEStore bool        `json:"enable_sse_store,omitempty"`
	EnableLogStore bool        `json:"enable_log_store,omitempty"`
}

// TunnelActionRequest 隧道操作请求
type TunnelActionRequest struct {
	InstanceID string `json:"instanceId" validate:"required"`
	Action     string `json:"action" validate:"required,oneof=start stop restart"`
}

// TunnelResponse API 响应
type TunnelResponse struct {
	Success   bool        `json:"success"`
	Message   string      `json:"message,omitempty"`
	Error     string      `json:"error,omitempty"`
	Tunnel    interface{} `json:"tunnel,omitempty"`
	TunnelIDs []int64     `json:"tunnel_ids,omitempty"` // 创建的隧道ID列表
}
