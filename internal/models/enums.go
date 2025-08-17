package models

// EndpointStatus 端点状态枚举
type EndpointStatus string

const (
	EndpointStatusOnline     EndpointStatus = "ONLINE"
	EndpointStatusOffline    EndpointStatus = "OFFLINE"
	EndpointStatusFail       EndpointStatus = "FAIL"
	EndpointStatusDisconnect EndpointStatus = "DISCONNECT"
)

// SSEEventType SSE事件类型枚举
type SSEEventType string

const (
	SSEEventTypeInitial  SSEEventType = "initial"  // 接建立时发送，包含所有实例的当前状态
	SSEEventTypeCreate   SSEEventType = "create"   // 建新实例时发送
	SSEEventTypeUpdate   SSEEventType = "update"   // 例更新时发送 (状态变更、启动/停止操作)
	SSEEventTypeDelete   SSEEventType = "delete"   // 例被删除时发送
	SSEEventTypeShutdown SSEEventType = "shutdown" // 控服务即将关闭时发送，通知前端应用关闭连接
	SSEEventTypeLog      SSEEventType = "log"      //例产生新日志内容时发送，包含日志文本（事件仅推送普通日志，流量/健康检查日志已被过滤）
)

// TunnelStatus 隧道状态枚举
type TunnelStatus string

const (
	TunnelStatusRunning TunnelStatus = "running"
	TunnelStatusStopped TunnelStatus = "stopped"
	TunnelStatusError   TunnelStatus = "error"
	TunnelStatusOffline TunnelStatus = "offline"
)

// TunnelType 隧道模式枚举
type TunnelType string

const (
	TunnelModeServer TunnelType = "server"
	TunnelModeClient TunnelType = "client"
)

// TLSMode TLS模式枚举
type TLSMode string

const (
	TLSModeInherit TLSMode = ""
	TLS0           TLSMode = "0"
	TLS1           TLSMode = "1"
	TLS2           TLSMode = "2"
)

// TLSMode TLS模式枚举
type TunnelMode string

const (
	Mode0 TunnelMode = "0"
	Mode1 TunnelMode = "1"
	Mode2 TunnelMode = "2"
)

// LogLevel 日志级别枚举
type LogLevel string

const (
	LogLevelInherit LogLevel = ""
	LogLevelDebug   LogLevel = "debug"
	LogLevelInfo    LogLevel = "info"
	LogLevelWarn    LogLevel = "warn"
	LogLevelError   LogLevel = "error"
	LogLevelEvent   LogLevel = "event"
	LogLevelNone    LogLevel = "none"
)

// OperationAction 操作类型枚举
type OperationAction string

const (
	OperationActionCreate       OperationAction = "create"
	OperationActionCreated      OperationAction = "created"
	OperationActionDelete       OperationAction = "delete"
	OperationActionDeleted      OperationAction = "deleted"
	OperationActionStart        OperationAction = "start"
	OperationActionStarted      OperationAction = "started"
	OperationActionStop         OperationAction = "stop"
	OperationActionStopped      OperationAction = "stopped"
	OperationActionRestart      OperationAction = "restart"
	OperationActionRestarted    OperationAction = "restarted"
	OperationActionRename       OperationAction = "rename"
	OperationActionRenamed      OperationAction = "renamed"
	OperationActionResetTraffic OperationAction = "reset_traffic"
	OperationActionError        OperationAction = "error"
)
