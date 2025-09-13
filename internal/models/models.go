package models

import (
	"time"
)

// Endpoint 端点表 - GORM模型
type Endpoint struct {
	ID          int64          `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Name        string         `json:"name" gorm:"type:text;uniqueIndex;not null;column:name"`
	URL         string         `json:"url" gorm:"type:text;uniqueIndex;not null;column:url"`
	IP          string         `json:"ip" gorm:"type:text;column:ip"`
	APIPath     string         `json:"apiPath" gorm:"type:text;not null;column:api_path"`
	APIKey      string         `json:"apiKey" gorm:"type:text;not null;column:api_key"`
	Status      EndpointStatus `json:"status" gorm:"type:text;default:'OFFLINE';column:status"`
	Color       *string        `json:"color,omitempty" gorm:"type:text;default:'default';column:color"`
	OS          *string        `json:"os,omitempty" gorm:"type:text;column:os"`
	Arch        *string        `json:"arch,omitempty" gorm:"type:text;column:arch"`
	Ver         *string        `json:"ver,omitempty" gorm:"type:text;column:ver"`
	Log         *string        `json:"log,omitempty" gorm:"type:text;column:log"`
	TLS         *string        `json:"tls,omitempty" gorm:"type:text;column:tls"`
	Crt         *string        `json:"crt,omitempty" gorm:"type:text;column:crt"`
	TunnelCount int64          `json:"tunnelCount,omitempty" gorm:"default:0;column:tunnel_count"`
	KeyPath     *string        `json:"keyPath,omitempty" gorm:"type:text;column:key_path"`
	Uptime      *int64         `json:"uptime,omitempty" gorm:"column:uptime"`
	LastCheck   time.Time      `json:"lastCheck" gorm:"column:last_check"`
	CreatedAt   time.Time      `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt   time.Time      `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`

	// 关联
	Tunnels []Tunnel `json:"tunnels,omitempty" gorm:"foreignKey:EndpointID"`
}

// TableName 设置表名
func (Endpoint) TableName() string {
	return "endpoints"
}

// Tunnel 隧道表 - GORM模型
type Tunnel struct {
	ID            int64        `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Name          string       `json:"name" gorm:"type:text;not null;index;column:name"`
	EndpointID    int64        `json:"endpointId" gorm:"not null;index;column:endpoint_id;uniqueIndex:idx_tunnel_unique"`
	Type          TunnelType   `json:"type" gorm:"type:text;not null;column:type"`
	Status        TunnelStatus `json:"status" gorm:"type:text;default:'stopped';index;column:status"`
	TunnelAddress string       `json:"tunnelAddress" gorm:"type:text;not null;column:tunnel_address"`
	TunnelPort    string       `json:"tunnelPort" gorm:"type:text;not null;column:tunnel_port"`
	TargetAddress string       `json:"targetAddress" gorm:"type:text;not null;column:target_address"`
	TargetPort    string       `json:"targetPort" gorm:"type:text;not null;column:target_port"`
	TLSMode       TLSMode      `json:"tlsMode" gorm:"type:text;column:tls_mode"`
	CertPath      *string      `json:"certPath,omitempty" gorm:"type:text;column:cert_path"`
	KeyPath       *string      `json:"keyPath,omitempty" gorm:"type:text;column:key_path"`
	LogLevel      LogLevel     `json:"logLevel" gorm:"type:text;default:'inherit';column:log_level"`
	CommandLine   string       `json:"commandLine" gorm:"type:text;not null;column:command_line"`
	Password      *string      `json:"password,omitempty" gorm:"type:text;column:password"`
	InstanceID    *string      `json:"instanceId,omitempty" gorm:"type:text;index;column:instance_id;uniqueIndex:idx_tunnel_unique"`
	Restart       *bool        `json:"restart" gorm:"type:bool;column:restart"`
	Mode          *TunnelMode  `json:"mode,omitempty" gorm:"type:int;column:mode"`
	Rate          *int64       `json:"rate,omitempty" gorm:"type:int;column:rate"`
	Read          *string      `json:"read,omitempty" gorm:"type:text;column:read"`

	EnableLogStore bool `json:"enable_log_store,omitempty" gorm:"default:true;type:bool;column:enable_log_store"`

	// 网络流量统计
	TCPRx int64 `json:"tcpRx" gorm:"default:0;column:tcp_rx"`
	TCPTx int64 `json:"tcpTx" gorm:"default:0;column:tcp_tx"`
	UDPRx int64 `json:"udpRx" gorm:"default:0;column:udp_rx"`
	UDPTx int64 `json:"udpTx" gorm:"default:0;column:udp_tx"`

	// 连接池和延迟信息
	TCPs *int64 `json:"tcps,omitempty" gorm:"column:tcps"`
	UDPs *int64 `json:"udps,omitempty" gorm:"column:udps"`
	Pool *int64 `json:"pool,omitempty" gorm:"column:pool"`
	Ping *int64 `json:"ping,omitempty" gorm:"column:ping"`

	// 端口范围
	Min *int64 `json:"min,omitempty" gorm:"column:min"`
	Max *int64 `json:"max,omitempty" gorm:"column:max"`

	// 最大连接数限制
	Slot *int64 `json:"slot,omitempty" gorm:"column:slot"`

	CreatedAt     time.Time  `json:"createdAt" gorm:"autoCreateTime;index;column:created_at"`
	UpdatedAt     time.Time  `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`
	LastEventTime NullTime `json:"lastEventTime,omitempty" gorm:"column:last_event_time;type:datetime"`

	// 关联
	Endpoint   Endpoint    `json:"endpoint,omitempty" gorm:"foreignKey:EndpointID"`
	TunnelTags []TunnelTag `json:"tunnelTags,omitempty" gorm:"foreignKey:TunnelID"`
	Tags       []Tag       `json:"tags,omitempty" gorm:"many2many:tunnel_tags;"`
}

// TableName 设置表名
func (Tunnel) TableName() string {
	return "tunnels"
}

// TunnelRecycle 隧道回收站 - GORM模型
type TunnelRecycle struct {
	ID            int64      `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Name          string     `json:"name" gorm:"type:text;not null;column:name"`
	EndpointID    int64      `json:"endpointId" gorm:"not null;column:endpoint_id"`
	Mode          TunnelType `json:"mode" gorm:"type:text;not null;column:mode"`
	TunnelAddress string     `json:"tunnelAddress" gorm:"type:text;not null;column:tunnel_address"`
	TunnelPort    string     `json:"tunnelPort" gorm:"type:text;not null;column:tunnel_port"`
	TargetAddress string     `json:"targetAddress" gorm:"type:text;not null;column:target_address"`
	TargetPort    string     `json:"targetPort" gorm:"type:text;not null;column:target_port"`
	TLSMode       TLSMode    `json:"tlsMode" gorm:"type:text;default:'inherit';column:tls_mode"`
	CertPath      *string    `json:"certPath,omitempty" gorm:"type:text;column:cert_path"`
	KeyPath       *string    `json:"keyPath,omitempty" gorm:"type:text;column:key_path"`
	LogLevel      LogLevel   `json:"logLevel" gorm:"type:text;default:'inherit';column:log_level"`
	CommandLine   string     `json:"commandLine" gorm:"type:text;not null;column:command_line"`
	Password      *string    `json:"password,omitempty" gorm:"type:text;column:password"`
	InstanceID    *string    `json:"instanceId,omitempty" gorm:"type:text;column:instance_id"`
	Restart       bool       `json:"restart" gorm:"default:false;column:restart"`
	TCPRx         int64      `json:"tcpRx" gorm:"default:0;column:tcp_rx"`
	TCPTx         int64      `json:"tcpTx" gorm:"default:0;column:tcp_tx"`
	UDPRx         int64      `json:"udpRx" gorm:"default:0;column:udp_rx"`
	UDPTx         int64      `json:"udpTx" gorm:"default:0;column:udp_tx"`
	Min           *int64     `json:"min,omitempty" gorm:"column:min"`
	Max           *int64     `json:"max,omitempty" gorm:"column:max"`
	Slot          *int64     `json:"slot,omitempty" gorm:"column:slot"`
	CreatedAt     time.Time  `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	DeletedAt     time.Time  `json:"deletedAt" gorm:"autoCreateTime;column:deleted_at"`
}

// TableName 设置表名
func (TunnelRecycle) TableName() string {
	return "tunnel_recycle"
}

// TunnelOperationLog 操作日志表 - GORM模型
type TunnelOperationLog struct {
	ID         int64           `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	TunnelID   *int64          `json:"tunnelId,omitempty" gorm:"index;column:tunnel_id"`
	TunnelName string          `json:"tunnelName" gorm:"type:text;not null;column:tunnel_name"`
	Action     OperationAction `json:"action" gorm:"type:text;not null;index;column:action"`
	Status     string          `json:"status" gorm:"type:text;not null;column:status"`
	Message    *string         `json:"message,omitempty" gorm:"type:text;column:message"`
	CreatedAt  time.Time       `json:"createdAt" gorm:"autoCreateTime;index;column:created_at"`
}

// TableName 设置表名
func (TunnelOperationLog) TableName() string {
	return "tunnel_operation_logs"
}

// EndpointSSE SSE推送数据表 - GORM模型
type EndpointSSE struct {
	ID         int64        `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	EventType  SSEEventType `json:"eventType" gorm:"type:text;not null;column:event_type"`
	PushType   string       `json:"pushType" gorm:"type:text;not null;column:push_type"`
	EventTime  time.Time    `json:"eventTime" gorm:"not null;column:event_time"`
	EndpointID int64        `json:"endpointId" gorm:"not null;index;column:endpoint_id"`

	// 实例信息
	InstanceID   string  `json:"instanceId" gorm:"type:text;not null;column:instance_id"`
	InstanceType *string `json:"instanceType,omitempty" gorm:"type:text;column:instance_type"`
	Status       *string `json:"status,omitempty" gorm:"type:text;column:status"`
	URL          *string `json:"url,omitempty" gorm:"type:text;column:url"`

	// 网络统计
	TCPRx int64 `json:"tcpRx" gorm:"default:0;column:tcp_rx"`
	TCPTx int64 `json:"tcpTx" gorm:"default:0;column:tcp_tx"`
	UDPRx int64 `json:"udpRx" gorm:"default:0;column:udp_rx"`
	UDPTx int64 `json:"udpTx" gorm:"default:0;column:udp_tx"`

	// 连接池和延迟信息
	Pool *int64 `json:"pool,omitempty" gorm:"column:pool"`
	Ping *int64 `json:"ping,omitempty" gorm:"column:ping"`

	// 日志信息
	Logs *string `json:"logs,omitempty" gorm:"type:text;column:logs"`

	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`

	// 其他信息
	Alias   *string `json:"alias,omitempty" gorm:"type:text;column:alias"`
	Restart *bool   `json:"restart,omitempty" gorm:"column:restart"`

	// 关联
	Endpoint Endpoint `json:"endpoint,omitempty" gorm:"foreignKey:EndpointID"`
}

// TableName 设置表名
func (EndpointSSE) TableName() string {
	return "endpoint_sse"
}

// SystemConfig 系统配置表 - GORM模型
type SystemConfig struct {
	ID          int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Key         string    `json:"key" gorm:"type:text;uniqueIndex;not null;column:key"`
	Value       string    `json:"value" gorm:"type:text;not null;column:value"`
	Description *string   `json:"description,omitempty" gorm:"type:text;column:description"`
	CreatedAt   time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt   time.Time `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`
}

// TableName 设置表名
func (SystemConfig) TableName() string {
	return "system_configs"
}

// UserSession 用户会话表 - GORM模型
type UserSession struct {
	ID        int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	SessionID string    `json:"sessionId" gorm:"type:text;uniqueIndex;not null;column:session_id"`
	Username  string    `json:"username" gorm:"type:text;not null;column:username"`
	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	ExpiresAt time.Time `json:"expiresAt" gorm:"not null;column:expires_at"`
	IsActive  bool      `json:"isActive" gorm:"default:true;column:is_active"`
}

// TableName 设置表名
func (UserSession) TableName() string {
	return "user_sessions"
}

// Tag 标签表 - GORM模型
type Tag struct {
	ID        int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Name      string    `json:"name" gorm:"type:text;uniqueIndex;not null;column:name"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime;index;column:created_at"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`

	// 关联
	Tunnels []Tunnel `json:"tunnels,omitempty" gorm:"many2many:tunnel_tags;"`
}

// TableName 设置表名
func (Tag) TableName() string {
	return "tags"
}

// TunnelTag 隧道标签关联表 - GORM模型
type TunnelTag struct {
	ID        int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	TunnelID  int64     `json:"tunnel_id" gorm:"not null;index;column:tunnel_id"`
	TagID     int64     `json:"tag_id" gorm:"not null;index;column:tag_id"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime;column:created_at"`

	// 关联
	Tunnel Tunnel `json:"tunnel,omitempty" gorm:"foreignKey:TunnelID"`
	Tag    Tag    `json:"tag,omitempty" gorm:"foreignKey:TagID"`
}

// TableName 设置表名
func (TunnelTag) TableName() string {
	return "tunnel_tags"
}

// OAuthUser OAuth用户表 - GORM模型
type OAuthUser struct {
	ID         int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	Provider   string    `json:"provider" gorm:"type:text;not null;column:provider"`
	ProviderID string    `json:"providerId" gorm:"type:text;not null;column:provider_id"`
	Username   string    `json:"username" gorm:"type:text;not null;column:username"`
	Data       string    `json:"data" gorm:"type:text;column:data"`
	CreatedAt  time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt  time.Time `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`
}

// TableName 设置表名
func (OAuthUser) TableName() string {
	return "oauth_users"
}

// ServiceHistory 服务历史监控表 - GORM模型（类似Nezha的ServiceHistory表）
type ServiceHistory struct {
	ID         int64  `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	EndpointID int64  `json:"endpointId" gorm:"not null;index;column:endpoint_id"`
	InstanceID string `json:"instanceId" gorm:"type:text;not null;index;column:instance_id"`

	// 聚合后的网络流量总变化量（差值累计）和平均值
	DeltaTCPIn  int64   `json:"deltaTcpIn" gorm:"default:0;column:delta_tcp_in"`   // TCP入站总流量变化
	DeltaTCPOut int64   `json:"deltaTcpOut" gorm:"default:0;column:delta_tcp_out"` // TCP出站总流量变化
	DeltaUDPIn  int64   `json:"deltaUdpIn" gorm:"default:0;column:delta_udp_in"`   // UDP入站总流量变化
	DeltaUDPOut int64   `json:"deltaUdpOut" gorm:"default:0;column:delta_udp_out"` // UDP出站总流量变化
	AvgPing     float64 `json:"avgPing" gorm:"default:0;column:avg_ping"`          // 平均延迟
	AvgPool     int64   `json:"avgPool" gorm:"default:0;column:avg_pool"`          // 平均连接池
	AvgTCPs     int64   `json:"avgTcps" gorm:"default:0;column:avg_tcps"`          // 平均TCP连接数
	AvgUDPs     int64   `json:"avgUdps" gorm:"default:0;column:avg_udps"`          // 平均UDP连接数

	// 平均速度字段（bytes/s）
	AvgSpeedIn  float64 `json:"avgSpeedIn" gorm:"default:0;column:avg_speed_in"`   // 平均入站速度 (TCP+UDP)
	AvgSpeedOut float64 `json:"avgSpeedOut" gorm:"default:0;column:avg_speed_out"` // 平均出站速度 (TCP+UDP)

	// 统计信息
	RecordCount int       `json:"recordCount" gorm:"default:0;column:record_count"`    // 参与聚合的数据点数量
	UpCount     int       `json:"upCount" gorm:"default:0;column:up_count"`            // 在线次数（用于加权平均）
	RecordTime  time.Time `json:"recordTime" gorm:"not null;index;column:record_time"` // 记录时间（每分钟一条记录）
	CreatedAt   time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`

	// 关联
	Endpoint *Endpoint `json:"endpoint,omitempty" gorm:"foreignKey:EndpointID"`
}

// TableName 设置表名
func (ServiceHistory) TableName() string {
	return "service_history"
}
