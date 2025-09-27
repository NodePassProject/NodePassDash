package sse

import (
	"context"
	"errors"
	"fmt"
	"io"
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
	ID           string
	Writer       http.ResponseWriter
	disconnected bool
	mu           sync.RWMutex
}

// Close 关闭客户端连接
func (c *Client) Close() {
	// 这里可以实现关闭逻辑，例如关闭Writer
	// 目前是一个空实现
}

// Send 发送数据给客户端
func (c *Client) Send(data []byte) error {
	// 检查客户端是否已断开
	if c.IsDisconnected() {
		return errors.New("客户端已断开连接")
	}

	// 使用标准SSE格式发送数据
	// 格式: "data: {json数据}\n\n"
	sseData := fmt.Sprintf("data: %s\n\n", string(data))

	// 直接写入HTTP响应流
	_, err := c.Writer.Write([]byte(sseData))
	if err != nil {
		// 检查是否是连接断开相关的错误
		if isConnectionError(err) {
			c.SetDisconnected(true)
			return fmt.Errorf("客户端连接已断开: %v", err)
		}
		return fmt.Errorf("写入SSE数据失败: %v", err)
	}

	// 立即刷新缓冲区，确保数据被发送
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}

	return nil
}

// SetDisconnected 设置客户端断开状态
func (c *Client) SetDisconnected(disconnected bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.disconnected = disconnected
}

// IsDisconnected 检查客户端是否已断开
func (c *Client) IsDisconnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.disconnected
}

// isConnectionError 检查错误是否为连接断开相关错误
func isConnectionError(err error) bool {
	// 检查常见的连接断开错误
	if errors.Is(err, io.ErrShortWrite) {
		return true
	}

	// 检查错误信息中是否包含连接断开的关键字
	errorStr := err.Error()
	connectionErrors := []string{
		"broken pipe",
		"connection reset",
		"use of closed network connection",
		"short write",
		"connection aborted",
	}

	for _, errPattern := range connectionErrors {
		if contains(errorStr, errPattern) {
			return true
		}
	}

	return false
}

// contains 检查字符串是否包含子字符串（简单实现）
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
