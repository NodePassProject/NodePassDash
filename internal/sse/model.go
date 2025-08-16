package sse

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// EventType SSE事件类型
type EventType string

const (
	EventTypeInitial  EventType = "initial"
	EventTypeCreate   EventType = "create"
	EventTypeUpdate   EventType = "update"
	EventTypeDelete   EventType = "delete"
	EventTypeShutdown EventType = "shutdown"
	EventTypeLog      EventType = "log"
)

// EndpointStatus 端点状态
type EndpointStatus string

const (
	EndpointStatusOnline     EndpointStatus = "ONLINE"
	EndpointStatusOffline    EndpointStatus = "OFFLINE"
	EndpointStatusFail       EndpointStatus = "FAIL"
	EndpointStatusDisconnect EndpointStatus = "DISCONNECT"
)

// SSEEvent SSE事件数据
type SSEEvent struct {
	ID           int64     `json:"id"`
	EventType    EventType `json:"eventType"`
	PushType     string    `json:"pushType"`
	EventTime    time.Time `json:"eventTime"`
	EndpointID   int64     `json:"endpointId"`
	InstanceID   string    `json:"instanceId"`
	InstanceType string    `json:"instanceType,omitempty"`
	Status       string    `json:"status,omitempty"`
	URL          string    `json:"url,omitempty"`
	TcpRx        int64     `json:"tcpRx,omitempty"`
	TcpTx        int64     `json:"tcpTx,omitempty"`
	UdpRx        int64     `json:"udpRx,omitempty"`
	UdpTx        int64     `json:"udpTx,omitempty"`
	Logs         string    `json:"logs,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

// EndpointConnection 端点连接状态
type EndpointConnection struct {
	EndpointID int64
	URL        string
	APIPath    string
	APIKey     string
	Client     *http.Client
	Cancel     context.CancelFunc

	// 连接状态管理
	mu                     sync.RWMutex
	isManuallyDisconnected bool      // 是否手动断开
	lastConnectAttempt     time.Time // 最后一次连接尝试时间
	reconnectAttempts      int       // 重连尝试次数
	isConnected            bool      // 当前连接状态
}

// SetManuallyDisconnected 设置手动断开状态
func (ec *EndpointConnection) SetManuallyDisconnected(manual bool) {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	ec.isManuallyDisconnected = manual
}

// IsManuallyDisconnected 检查是否手动断开
func (ec *EndpointConnection) IsManuallyDisconnected() bool {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	return ec.isManuallyDisconnected
}

// SetConnected 设置连接状态
func (ec *EndpointConnection) SetConnected(connected bool) {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	ec.isConnected = connected
	if connected {
		ec.reconnectAttempts = 0
	}
}

// IsConnected 检查连接状态
func (ec *EndpointConnection) IsConnected() bool {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	return ec.isConnected
}

// UpdateLastConnectAttempt 更新最后连接尝试时间
func (ec *EndpointConnection) UpdateLastConnectAttempt() {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	ec.lastConnectAttempt = time.Now()
	ec.reconnectAttempts++
}

// ResetLastConnectAttempt 重置最后连接尝试时间（用于立即重连）
func (ec *EndpointConnection) ResetLastConnectAttempt() {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	ec.lastConnectAttempt = time.Time{} // 重置为零值，确保可以立即重连
}

// GetLastConnectAttempt 获取最后连接尝试时间
func (ec *EndpointConnection) GetLastConnectAttempt() time.Time {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	return ec.lastConnectAttempt
}

// GetReconnectAttempts 获取重连尝试次数
func (ec *EndpointConnection) GetReconnectAttempts() int {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	return ec.reconnectAttempts
}

// Event 事件类型
type Event struct {
	Type    string      `json:"type"`
	Data    interface{} `json:"data"`
	Message string      `json:"message,omitempty"`
}

// Client SSE 客户端
type Client struct {
	ID     string
	Writer http.ResponseWriter
	Events chan Event
}

// Close 关闭客户端连接
func (c *Client) Close() {
	close(c.Events)
}

// Send 发送数据给客户端
func (c *Client) Send(data []byte) error {
	// 这里实现SSE数据发送逻辑
	// 由于这是一个简化的实现，我们只是将数据写入到Events通道
	select {
	case c.Events <- Event{
		Type: "data",
		Data: string(data),
	}:
		return nil
	default:
		return fmt.Errorf("客户端事件通道已满")
	}
}

// SetDisconnected 设置客户端断开状态
func (c *Client) SetDisconnected(disconnected bool) {
	// 这里可以实现断开状态的设置逻辑
	// 目前是一个空实现
}
