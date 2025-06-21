package models

// EndpointStatus 端点状态枚举
type EndpointStatus string

const (
	EndpointStatusOnline  EndpointStatus = "ONLINE"
	EndpointStatusOffline EndpointStatus = "OFFLINE"
	EndpointStatusFail    EndpointStatus = "FAIL"
)

// SSEEventType SSE事件类型枚举
type SSEEventType string

const (
	SSEEventTypeInitial  SSEEventType = "initial"
	SSEEventTypeCreate   SSEEventType = "create"
	SSEEventTypeUpdate   SSEEventType = "update"
	SSEEventTypeDelete   SSEEventType = "delete"
	SSEEventTypeShutdown SSEEventType = "shutdown"
	SSEEventTypeLog      SSEEventType = "log"
)

// TunnelStatus 隧道状态枚举
type TunnelStatus string

const (
	TunnelStatusRunning TunnelStatus = "running"
	TunnelStatusStopped TunnelStatus = "stopped"
	TunnelStatusError   TunnelStatus = "error"
)

// TunnelMode 隧道模式枚举
type TunnelMode string

const (
	TunnelModeServer TunnelMode = "server"
	TunnelModeClient TunnelMode = "client"
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
	LogLevelFatal   LogLevel = "fatal"
)

// OperationAction 操作类型枚举
type OperationAction string

const (
	OperationActionCreated   OperationAction = "created"
	OperationActionDeleted   OperationAction = "deleted"
	OperationActionStarted   OperationAction = "started"
	OperationActionStopped   OperationAction = "stopped"
	OperationActionRestarted OperationAction = "restarted"
	OperationActionRenamed   OperationAction = "renamed"
	OperationActionError     OperationAction = "error"
)
