package models

import (
	"time"
)

// Endpoint 端点表
type Endpoint struct {
	ID          int64          `json:"id" db:"id"`
	Name        string         `json:"name" db:"name"`
	URL         string         `json:"url" db:"url"`
	APIPath     string         `json:"apiPath" db:"apiPath"`
	APIKey      string         `json:"apiKey" db:"apiKey"`
	Status      EndpointStatus `json:"status" db:"status"`
	LastCheck   time.Time      `json:"lastCheck" db:"lastCheck"`
	CreatedAt   time.Time      `json:"createdAt" db:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt" db:"updatedAt"`
	Color       *string        `json:"color,omitempty" db:"color"`
	TunnelCount int            `json:"tunnelCount" db:"tunnelCount"`
}

// Tunnel 隧道表
type Tunnel struct {
	ID            int64        `json:"id" db:"id"`
	Name          string       `json:"name" db:"name"`
	EndpointID    int64        `json:"endpointId" db:"endpointId"`
	Mode          TunnelMode   `json:"mode" db:"mode"`
	Status        TunnelStatus `json:"status" db:"status"`
	TunnelAddress string       `json:"tunnelAddress" db:"tunnelAddress"`
	TunnelPort    string       `json:"tunnelPort" db:"tunnelPort"`
	TargetAddress string       `json:"targetAddress" db:"targetAddress"`
	TargetPort    string       `json:"targetPort" db:"targetPort"`
	TLSMode       TLSMode      `json:"tlsMode" db:"tlsMode"`
	CertPath      *string      `json:"certPath,omitempty" db:"certPath"`
	KeyPath       *string      `json:"keyPath,omitempty" db:"keyPath"`
	LogLevel      LogLevel     `json:"logLevel" db:"logLevel"`
	CommandLine   string       `json:"commandLine" db:"commandLine"`
	Password      *string      `json:"password,omitempty" db:"password"`
	InstanceID    *string      `json:"instanceId,omitempty" db:"instanceId"`

	// 网络流量统计
	TCPRx int64 `json:"tcpRx" db:"tcpRx"`
	TCPTx int64 `json:"tcpTx" db:"tcpTx"`
	UDPRx int64 `json:"udpRx" db:"udpRx"`
	UDPTx int64 `json:"udpTx" db:"udpTx"`

	// 连接池和延迟信息
	Pool *int64 `json:"pool,omitempty" db:"pool"`
	Ping *int64 `json:"ping,omitempty" db:"ping"`

	CreatedAt     time.Time  `json:"createdAt" db:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt" db:"updatedAt"`
	LastEventTime *time.Time `json:"lastEventTime,omitempty" db:"lastEventTime"`
}

// TunnelOperationLog 操作日志表
type TunnelOperationLog struct {
	ID         int64           `json:"id" db:"id"`
	TunnelID   *int64          `json:"tunnelId,omitempty" db:"tunnelId"`
	TunnelName string          `json:"tunnelName" db:"tunnelName"`
	Action     OperationAction `json:"action" db:"action"`
	Status     string          `json:"status" db:"status"`
	Message    *string         `json:"message,omitempty" db:"message"`
	CreatedAt  time.Time       `json:"createdAt" db:"createdAt"`
}

// EndpointSSE SSE推送数据表
type EndpointSSE struct {
	ID         int64        `json:"id" db:"id"`
	EventType  SSEEventType `json:"eventType" db:"eventType"`
	PushType   string       `json:"pushType" db:"pushType"`
	EventTime  time.Time    `json:"eventTime" db:"eventTime"`
	EndpointID int64        `json:"endpointId" db:"endpointId"`

	// 实例信息
	InstanceID   string  `json:"instanceId" db:"instanceId"`
	InstanceType *string `json:"instanceType,omitempty" db:"instanceType"`
	Status       *string `json:"status,omitempty" db:"status"`
	URL          *string `json:"url,omitempty" db:"url"`

	// 网络统计
	TCPRx int64 `json:"tcpRx" db:"tcpRx"`
	TCPTx int64 `json:"tcpTx" db:"tcpTx"`
	UDPRx int64 `json:"udpRx" db:"udpRx"`
	UDPTx int64 `json:"udpTx" db:"udpTx"`

	// 连接池和延迟信息
	Pool *int64 `json:"pool,omitempty" db:"pool"`
	Ping *int64 `json:"ping,omitempty" db:"ping"`

	// 日志信息
	Logs *string `json:"logs,omitempty" db:"logs"`

	CreatedAt time.Time `json:"createdAt" db:"createdAt"`

	// 其他信息
	Alias   *string `json:"alias,omitempty" db:"alias"`
	Restart *bool   `json:"restart,omitempty" db:"restart"`
}

// SystemConfig 系统配置表
type SystemConfig struct {
	ID          int64     `json:"id" db:"id"`
	Key         string    `json:"key" db:"key"`
	Value       string    `json:"value" db:"value"`
	Description *string   `json:"description,omitempty" db:"description"`
	CreatedAt   time.Time `json:"createdAt" db:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updatedAt"`
}

// UserSession 用户会话表
type UserSession struct {
	ID        int64     `json:"id" db:"id"`
	SessionID string    `json:"sessionId" db:"sessionId"`
	Username  string    `json:"username" db:"username"`
	CreatedAt time.Time `json:"createdAt" db:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt" db:"expiresAt"`
	IsActive  bool      `json:"isActive" db:"isActive"`
}

// TunnelGroup 隧道分组
type TunnelGroup struct {
	ID          int       `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	Type        string    `json:"type" db:"type"` // single, double, custom
	Color       string    `json:"color" db:"color"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// TunnelGroupMember 隧道分组成员
type TunnelGroupMember struct {
	ID        int       `json:"id" db:"id"`
	GroupID   int       `json:"group_id" db:"group_id"`
	TunnelID  string    `json:"tunnel_id" db:"tunnel_id"`
	Role      string    `json:"role" db:"role"` // source, target, member
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// TunnelGroupWithMembers 分组及其成员信息
type TunnelGroupWithMembers struct {
	TunnelGroup
	Members []TunnelGroupMember `json:"members"`
}

// CreateTunnelGroupRequest 创建分组请求
type CreateTunnelGroupRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Type        string `json:"type" binding:"required"` // single, double, custom
	TunnelIDs   []int  `json:"tunnel_ids"`
}

// UpdateTunnelGroupRequest 更新分组请求
type UpdateTunnelGroupRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
	TunnelIDs   []int  `json:"tunnel_ids"`
}
