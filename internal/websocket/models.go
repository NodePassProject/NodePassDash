package websocket

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client 表示一个WebSocket客户端连接
type Client struct {
	ID         string          // 唯一标识符
	EndpointID int64           // 关联的endpoint ID (用于system-monitor)
	InstanceID string          // 关联的instance ID (用于tunnel-monitor)
	Type       string          // 连接类型: "system" 或 "tunnel"
	Conn       *websocket.Conn // WebSocket连接
	Send       chan []byte     // 发送数据的通道
	Hub        *Hub            // 所属的Hub
	LastPong   time.Time       // 最后一次收到pong的时间
}

// Hub 管理所有的WebSocket连接
type Hub struct {
	// 按endpointID分组的system-monitor客户端连接
	systemClients map[int64]map[*Client]bool

	// 按instanceID分组的tunnel-monitor客户端连接
	tunnelClients map[string]map[*Client]bool

	// 注册新的客户端连接
	register chan *Client

	// 注销客户端连接
	unregister chan *Client

	// 广播消息到指定endpoint的所有客户端
	systemBroadcast chan *BroadcastMessage

	// 广播消息到指定instance的所有客户端
	tunnelBroadcast chan *TunnelBroadcastMessage

	// 互斥锁保护clients map
	mutex sync.RWMutex

	// 用于停止hub的通道
	done chan struct{}
}

// BroadcastMessage 广播消息结构
type BroadcastMessage struct {
	EndpointID int64  // 目标endpoint ID
	Data       []byte // 要发送的数据
}

// TunnelBroadcastMessage tunnel广播消息结构
type TunnelBroadcastMessage struct {
	InstanceID string // 目标instance ID
	Data       []byte // 要发送的数据
}

// EndpointSystemInfo endpoint系统信息
type EndpointSystemInfo struct {
	EndpointID int64       `json:"endpointId"`
	Timestamp  int64       `json:"timestamp"` // Unix时间戳（毫秒）
	Status     string      `json:"status"`    // online, offline, error
	Info       interface{} `json:"info,omitempty"`
	Error      string      `json:"error,omitempty"`
}

// TunnelInstanceInfo tunnel实例信息
type TunnelInstanceInfo struct {
	InstanceID string      `json:"instanceId"`
	Timestamp  int64       `json:"timestamp"` // Unix时间戳（毫秒）
	Status     string      `json:"status"`    // online, offline, error
	Info       interface{} `json:"info,omitempty"`
	Error      string      `json:"error,omitempty"`
}
