package websocket

import (
	"encoding/json"
	"time"

	log "NodePassDash/internal/log"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// WebSocket配置常量
	writeWait      = 10 * time.Second    // 写入超时
	pongWait       = 60 * time.Second    // 等待pong消息的时间
	pingPeriod     = (pongWait * 9) / 10 // 发送ping消息的间隔
	maxMessageSize = 512                 // 最大消息大小
)

// NewHub 创建新的Hub实例
func NewHub() *Hub {
	return &Hub{
		systemClients:   make(map[int64]map[*Client]bool),
		tunnelClients:   make(map[string]map[*Client]bool),
		register:        make(chan *Client, 256),
		unregister:      make(chan *Client, 256),
		systemBroadcast: make(chan *BroadcastMessage, 256),
		tunnelBroadcast: make(chan *TunnelBroadcastMessage, 256),
		done:            make(chan struct{}),
	}
}

// Run 启动Hub的主循环
func (h *Hub) Run() {
	log.Info("WebSocket Hub 启动")
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case message := <-h.systemBroadcast:
			h.broadcastToEndpoint(message.EndpointID, message.Data)

		case message := <-h.tunnelBroadcast:
			h.broadcastToInstance(message.InstanceID, message.Data)

		case <-h.done:
			log.Info("WebSocket Hub 停止")
			return
		}
	}
}

// Stop 停止Hub
func (h *Hub) Stop() {
	close(h.done)
}

// registerClient 注册新客户端
func (h *Hub) registerClient(client *Client) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if client.Type == "system" {
		if h.systemClients[client.EndpointID] == nil {
			h.systemClients[client.EndpointID] = make(map[*Client]bool)
		}
		h.systemClients[client.EndpointID][client] = true
		log.Infof("WebSocket system 客户端已连接 - EndpointID: %d, ClientID: %s, 总连接数: %d",
			client.EndpointID, client.ID, h.getSystemClientCount(client.EndpointID))
	} else if client.Type == "tunnel" {
		if h.tunnelClients[client.InstanceID] == nil {
			h.tunnelClients[client.InstanceID] = make(map[*Client]bool)
		}
		h.tunnelClients[client.InstanceID][client] = true
		log.Infof("WebSocket tunnel 客户端已连接 - InstanceID: %s, ClientID: %s, 总连接数: %d",
			client.InstanceID, client.ID, h.getTunnelClientCount(client.InstanceID))
	}
}

// unregisterClient 注销客户端
func (h *Hub) unregisterClient(client *Client) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if client.Type == "system" {
		if clients, ok := h.systemClients[client.EndpointID]; ok {
			if _, ok := clients[client]; ok {
				delete(clients, client)
				close(client.Send)

				// 如果这个endpoint没有客户端了，清理map
				if len(clients) == 0 {
					delete(h.systemClients, client.EndpointID)
				}

				log.Infof("WebSocket system 客户端已断开 - EndpointID: %d, ClientID: %s, 剩余连接数: %d",
					client.EndpointID, client.ID, h.getSystemClientCount(client.EndpointID))
			}
		}
	} else if client.Type == "tunnel" {
		if clients, ok := h.tunnelClients[client.InstanceID]; ok {
			if _, ok := clients[client]; ok {
				delete(clients, client)
				close(client.Send)

				// 如果这个instance没有客户端了，清理map
				if len(clients) == 0 {
					delete(h.tunnelClients, client.InstanceID)
				}

				log.Infof("WebSocket tunnel 客户端已断开 - InstanceID: %s, ClientID: %s, 剩余连接数: %d",
					client.InstanceID, client.ID, h.getTunnelClientCount(client.InstanceID))
			}
		}
	}
}

// broadcastToEndpoint 向指定endpoint的所有客户端广播消息
func (h *Hub) broadcastToEndpoint(endpointID int64, data []byte) {
	h.mutex.RLock()
	clients := h.systemClients[endpointID]
	h.mutex.RUnlock()

	if clients == nil {
		return
	}

	for client := range clients {
		select {
		case client.Send <- data:
		default:
			// 如果发送通道已满，关闭客户端连接
			h.unregister <- client
		}
	}
}

// broadcastToInstance 向指定instance的所有客户端广播消息
func (h *Hub) broadcastToInstance(instanceID string, data []byte) {
	h.mutex.RLock()
	clients := h.tunnelClients[instanceID]
	h.mutex.RUnlock()

	if clients == nil {
		return
	}

	for client := range clients {
		select {
		case client.Send <- data:
		default:
			// 如果发送通道已满，关闭客户端连接
			h.unregister <- client
		}
	}
}

// getSystemClientCount 获取指定endpoint的客户端连接数
func (h *Hub) getSystemClientCount(endpointID int64) int {
	if clients, ok := h.systemClients[endpointID]; ok {
		return len(clients)
	}
	return 0
}

// getTunnelClientCount 获取指定instance的客户端连接数
func (h *Hub) getTunnelClientCount(instanceID string) int {
	if clients, ok := h.tunnelClients[instanceID]; ok {
		return len(clients)
	}
	return 0
}

// GetConnectedEndpoints 获取所有有连接的endpoint ID列表
func (h *Hub) GetConnectedEndpoints() []int64 {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	endpoints := make([]int64, 0, len(h.systemClients))
	for endpointID := range h.systemClients {
		endpoints = append(endpoints, endpointID)
	}
	return endpoints
}

// GetConnectedInstances 获取所有有连接的instance ID列表
func (h *Hub) GetConnectedInstances() []string {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	instances := make([]string, 0, len(h.tunnelClients))
	for instanceID := range h.tunnelClients {
		instances = append(instances, instanceID)
	}
	return instances
}

// BroadcastToEndpoint 向指定endpoint广播消息的公共方法
func (h *Hub) BroadcastToEndpoint(endpointID int64, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	select {
	case h.systemBroadcast <- &BroadcastMessage{
		EndpointID: endpointID,
		Data:       jsonData,
	}:
		return nil
	default:
		log.Warnf("WebSocket system 广播队列已满，丢弃消息 - EndpointID: %d", endpointID)
		return nil
	}
}

// BroadcastToInstance 向指定instance广播消息的公共方法
func (h *Hub) BroadcastToInstance(instanceID string, data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	select {
	case h.tunnelBroadcast <- &TunnelBroadcastMessage{
		InstanceID: instanceID,
		Data:       jsonData,
	}:
		return nil
	default:
		log.Warnf("WebSocket tunnel 广播队列已满，丢弃消息 - InstanceID: %s", instanceID)
		return nil
	}
}

// NewSystemClient 创建新的system客户端实例
func NewSystemClient(conn *websocket.Conn, endpointID int64, hub *Hub) *Client {
	return &Client{
		ID:         uuid.New().String(),
		EndpointID: endpointID,
		Type:       "system",
		Conn:       conn,
		Send:       make(chan []byte, 256),
		Hub:        hub,
		LastPong:   time.Now(),
	}
}

// NewTunnelClient 创建新的tunnel客户端实例
func NewTunnelClient(conn *websocket.Conn, instanceID string, hub *Hub) *Client {
	return &Client{
		ID:         uuid.New().String(),
		InstanceID: instanceID,
		Type:       "tunnel",
		Conn:       conn,
		Send:       make(chan []byte, 256),
		Hub:        hub,
		LastPong:   time.Now(),
	}
}

// ReadPump 处理从客户端读取消息
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.LastPong = time.Now()
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Errorf("WebSocket读取错误 - ClientID: %s, Error: %v", c.ID, err)
			}
			break
		}
	}
}

// WritePump 处理向客户端发送消息
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// 如果有更多消息排队，一起发送
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
