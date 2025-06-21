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
	Min           int          `json:"min,omitempty"`
	Max           int          `json:"max,omitempty"`
	Status        TunnelStatus `json:"status"`
	CreatedAt     time.Time    `json:"createdAt"`
	UpdatedAt     time.Time    `json:"updatedAt"`
}

// TunnelWithStats 带统计信息的隧道
type TunnelWithStats struct {
	Tunnel
	Traffic struct {
		TCPRx     int64 `json:"tcpRx"`
		TCPTx     int64 `json:"tcpTx"`
		UDPRx     int64 `json:"udpRx"`
		UDPTx     int64 `json:"udpTx"`
		Total     int64 `json:"total"`
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
	Min           int      `json:"min,omitempty"`
	Max           int      `json:"max,omitempty"`
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
	Min           int      `json:"min,omitempty"`
	Max           int      `json:"max,omitempty"`
}

// TunnelActionRequest 隧道操作请求
type TunnelActionRequest struct {
	InstanceID string `json:"instanceId" validate:"required"`
	Action     string `json:"action" validate:"required,oneof=start stop restart"`
}

// TunnelResponse API 响应
type TunnelResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
	Tunnel  interface{} `json:"tunnel,omitempty"`
}
