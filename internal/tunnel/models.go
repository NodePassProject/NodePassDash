package tunnel

import (
	"time"
)

// TunnelStatus 隧道状态枚举
type TunnelStatus string

const (
	StatusRunning TunnelStatus = "running"
	StatusStopped TunnelStatus = "stopped"
	StatusError   TunnelStatus = "error"
	StatusOffline TunnelStatus = "offline"
)

// TunnelMode 隧道模式枚举
type TunnelMode string

const (
	ModeServer TunnelMode = "server"
	ModeClient TunnelMode = "client"
)

// TLSMode TLS模式枚举
type TLSMode string

const (
	TLSModeInherit TLSMode = "inherit"
	TLSMode0       TLSMode = "mode0"
	TLSMode1       TLSMode = "mode1"
	TLSMode2       TLSMode = "mode2"
)

// LogLevel 日志级别枚举
type LogLevel string

const (
	LogLevelInherit LogLevel = "inherit"
	LogLevelDebug   LogLevel = "debug"
	LogLevelInfo    LogLevel = "info"
	LogLevelWarn    LogLevel = "warn"
	LogLevelError   LogLevel = "error"
)

// Tunnel 隧道基本信息
type Tunnel struct {
	ID            int64        `json:"id"`
	InstanceID    string       `json:"instanceId"`
	Name          string       `json:"name"`
	EndpointID    int64        `json:"endpointId"`
	Mode          TunnelMode   `json:"mode"`
	TunnelAddress string       `json:"tunnelAddress"`
	TunnelPort    int          `json:"tunnelPort"`
	TargetAddress string       `json:"targetAddress"`
	TargetPort    int          `json:"targetPort"`
	TLSMode       TLSMode      `json:"tlsMode"`
	CertPath      string       `json:"certPath,omitempty"`
	KeyPath       string       `json:"keyPath,omitempty"`
	LogLevel      LogLevel     `json:"logLevel"`
	CommandLine   string       `json:"commandLine"`
	Password      string       `json:"password,omitempty"`
	Min           *int         `json:"min"`
	Max           *int         `json:"max"`
	Restart       bool         `json:"restart"`
	Status        TunnelStatus `json:"status"`
	CreatedAt     time.Time    `json:"createdAt"`
	UpdatedAt     time.Time    `json:"updatedAt"`
}

// Tag 标签信息
type Tag struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// TunnelWithStats 带统计信息的隧道
type TunnelWithStats struct {
	Tunnel
	Traffic struct {
		TCPRx     int64  `json:"tcpRx"`
		TCPTx     int64  `json:"tcpTx"`
		UDPRx     int64  `json:"udpRx"`
		UDPTx     int64  `json:"udpTx"`
		Pool      *int64 `json:"pool,omitempty"`
		Ping      *int64 `json:"ping,omitempty"`
		Total     int64  `json:"total"`
		Formatted struct {
			TCPRx string `json:"tcpRx"`
			TCPTx string `json:"tcpTx"`
			UDPRx string `json:"udpRx"`
			UDPTx string `json:"udpTx"`
			Total string `json:"total"`
		} `json:"formatted"`
	} `json:"traffic"`
	EndpointName string `json:"endpoint"`
	Type         string `json:"type"`
	Avatar       string `json:"avatar"`
	StatusInfo   struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"status"`
	Tag *Tag `json:"tag,omitempty"` // 标签信息
}

// CreateTunnelRequest 创建隧道请求
type CreateTunnelRequest struct {
	Name          string   `json:"name" validate:"required"`
	EndpointID    int64    `json:"endpointId" validate:"required"`
	Mode          string   `json:"mode" validate:"required,oneof=server client"`
	TunnelAddress string   `json:"tunnelAddress"`
	TunnelPort    int      `json:"tunnelPort" validate:"required"`
	TargetAddress string   `json:"targetAddress"`
	TargetPort    int      `json:"targetPort" validate:"required"`
	TLSMode       TLSMode  `json:"tlsMode"`
	CertPath      string   `json:"certPath,omitempty"`
	KeyPath       string   `json:"keyPath,omitempty"`
	LogLevel      LogLevel `json:"logLevel"`
	Password      string   `json:"password,omitempty"`
	Min           int      `json:"min,omitempty"`
	Max           int      `json:"max,omitempty"`
	Restart       bool     `json:"restart"`
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
	ID            int64    `json:"id" validate:"required"`
	Name          string   `json:"name,omitempty"`
	TunnelAddress string   `json:"tunnelAddress,omitempty"`
	TunnelPort    int      `json:"tunnelPort,omitempty"`
	TargetAddress string   `json:"targetAddress,omitempty"`
	TargetPort    int      `json:"targetPort,omitempty"`
	TLSMode       TLSMode  `json:"tlsMode,omitempty"`
	CertPath      string   `json:"certPath,omitempty"`
	KeyPath       string   `json:"keyPath,omitempty"`
	LogLevel      LogLevel `json:"logLevel,omitempty"`
	Password      string   `json:"password,omitempty"`
	Min           int      `json:"min,omitempty"`
	Restart       bool     `json:"restart"`
	Max           int      `json:"max,omitempty"`
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
