package sse

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/nodepass"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/mattn/go-ieproxy"
	"github.com/r3labs/sse/v2"
)

// Manager SSE连接管理器
type Manager struct {
	service *Service     // 负责业务处理的 Service，真正解析并落库等逻辑由它完成
	db      *sql.DB      // 数据库连接，用于查询端点信息、持久化数据
	mu      sync.RWMutex // 读写锁，保护并发访问 connections

	// 连接管理
	connections map[int64]*EndpointConnection

	// 事件处理 worker pool
	jobs chan eventJob // 投递待解析/处理的原始 SSE 事件

	// 守护进程相关
	daemonCtx    context.Context    // 守护进程上下文
	daemonCancel context.CancelFunc // 守护进程取消函数
	daemonWg     sync.WaitGroup     // 等待组，确保守护进程正常关闭
}

// eventJob 表示一个待处理的 SSE 消息
type eventJob struct {
	endpointID int64
	payload    string
}

// NewManager 创建SSE管理器
func NewManager(db *sql.DB, service *Service) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	m := &Manager{
		service:      service,
		db:           db,
		connections:  make(map[int64]*EndpointConnection),
		jobs:         make(chan eventJob, 30000), // 增加缓冲大小到30000
		daemonCtx:    ctx,
		daemonCancel: cancel,
	}

	// 启动worker处理事件 - 增加worker数量到12个
	m.StartWorkers(12) // 启动12个worker处理事件

	return m
}

// StartDaemon 启动守护进程
func (m *Manager) StartDaemon() {
	log.Info("SSE守护进程启动")

	// 启动重连守护协程
	m.daemonWg.Add(1)
	go m.reconnectDaemon()

	// 启动健康检查守护协程
	m.daemonWg.Add(1)
	go m.healthCheckDaemon()

}

// StopDaemon 停止守护进程
func (m *Manager) StopDaemon() {
	log.Info("正在停止SSE守护进程")
	m.daemonCancel()
	m.daemonWg.Wait()
	log.Info("SSE守护进程已停止")
}

// reconnectDaemon 重连守护协程，每分钟检查一次需要重连的端点
func (m *Manager) reconnectDaemon() {
	defer m.daemonWg.Done()

	ticker := time.NewTicker(1 * time.Minute) // 每分钟检查一次
	defer ticker.Stop()

	for {
		select {
		case <-m.daemonCtx.Done():
			log.Info("重连守护协程退出")
			return
		case <-ticker.C:
			m.checkAndReconnect()
		}
	}
}

// healthCheckDaemon 健康检查守护协程，每30秒检查连接健康状态
func (m *Manager) healthCheckDaemon() {
	defer m.daemonWg.Done()

	ticker := time.NewTicker(30 * time.Second) // 每30秒检查一次
	defer ticker.Stop()

	for {
		select {
		case <-m.daemonCtx.Done():
			log.Info("健康检查守护协程退出")
			return
		case <-ticker.C:
			m.performHealthCheck()
		}
	}
}

// checkAndReconnect 检查并重连断开的端点
func (m *Manager) checkAndReconnect() {
	m.mu.RLock()
	// 复制需要检查的连接列表，避免长时间持有读锁
	connectionsToCheck := make([]*EndpointConnection, 0, len(m.connections))
	for _, conn := range m.connections {
		connectionsToCheck = append(connectionsToCheck, conn)
	}
	m.mu.RUnlock()

	needReconnectCount := 0

	for _, conn := range connectionsToCheck {
		// 跳过手动断开的连接
		if conn.IsManuallyDisconnected() {
			continue
		}

		// 跳过已连接的端点
		if conn.IsConnected() {
			continue
		}

		// 检查是否需要重连（距离上次尝试至少30秒）
		timeSinceLastAttempt := time.Since(conn.GetLastConnectAttempt())
		if timeSinceLastAttempt < 30*time.Second {
			log.Debugf("[Master-%d#守护进程]距离上次重连尝试仅%v，跳过本次检查",
				conn.EndpointID, timeSinceLastAttempt.Round(time.Second))
			continue
		}

		needReconnectCount++
		log.Infof("[Master-%d#守护进程]尝试重连端点，重试次数：%d",
			conn.EndpointID, conn.GetReconnectAttempts())

		// 尝试重连
		if err := m.reconnectEndpoint(conn); err != nil {
			log.Errorf("[Master-%d#守护进程]重连失败：%v", conn.EndpointID, err)
		}
	}

	if needReconnectCount > 0 {
		log.Infof("守护进程检查完成，尝试重连%d个端点", needReconnectCount)
	}
}

// reconnectEndpoint 重连指定端点
func (m *Manager) reconnectEndpoint(conn *EndpointConnection) error {
	conn.UpdateLastConnectAttempt()

	// 先取消旧的连接
	if conn.Cancel != nil {
		conn.Cancel()
	}

	// 创建新的连接
	return m.ConnectEndpoint(conn.EndpointID, conn.URL, conn.APIPath, conn.APIKey)
}

// performHealthCheck 执行健康检查
func (m *Manager) performHealthCheck() {
	m.mu.RLock()
	connectionCount := len(m.connections)
	connectedCount := 0
	disconnectedCount := 0
	manuallyDisconnectedCount := 0

	// 详细记录每个连接的状态（调试用）
	connectionDetails := make([]string, 0, len(m.connections))

	for endpointID, conn := range m.connections {
		if conn.IsManuallyDisconnected() {
			manuallyDisconnectedCount++
			connectionDetails = append(connectionDetails, fmt.Sprintf("端点%d(手动断开)", endpointID))
		} else if conn.IsConnected() {
			connectedCount++
			connectionDetails = append(connectionDetails, fmt.Sprintf("端点%d(已连接)", endpointID))
		} else {
			disconnectedCount++
			connectionDetails = append(connectionDetails, fmt.Sprintf("端点%d(已断开)", endpointID))
		}
	}
	m.mu.RUnlock()

	log.Debugf("SSE连接健康检查：总连接数=%d，活跃连接数=%d，断开连接数=%d，手动断开数=%d",
		connectionCount, connectedCount, disconnectedCount, manuallyDisconnectedCount)

	// 如果有断开的连接，记录详细信息
	if disconnectedCount > 0 {
		log.Debugf("连接详情：%v", connectionDetails)
	}
}

// InitializeSystem 初始化系统
func (m *Manager) InitializeSystem() error {
	log.Infof("开始初始化系统")
	// 统计需要重连的端点数量（过滤掉已明确失败和手动断开的端点）
	var total int
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM endpoints WHERE status NOT IN ('FAIL', 'DISCONNECT')`).Scan(&total); err == nil {
		log.Infof("扫描到需重连的端点数量: %d", total)
	}

	// 获取所有端点
	rows, err := m.db.Query(`
		SELECT id, url, api_path, api_key 
		FROM endpoints 
		WHERE status NOT IN ('FAIL', 'DISCONNECT')
	`)
	if err != nil {
		return fmt.Errorf("查询端点失败: %v", err)
	}
	defer rows.Close()

	// 为每个端点创建SSE连接
	for rows.Next() {
		var endpoint struct {
			ID      int64
			URL     string
			APIPath string
			APIKey  string
		}
		if err := rows.Scan(&endpoint.ID, &endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
			log.Errorf("扫描端点数据失败 %v", err)
			continue
		}

		if err := m.ConnectEndpoint(endpoint.ID, endpoint.URL, endpoint.APIPath, endpoint.APIKey); err != nil {
			log.Errorf("[Master-%d#SSE]连接失败%v", endpoint.ID, err)
		}
	}

	return nil
}

// ConnectEndpoint 连接端点SSE
func (m *Manager) ConnectEndpoint(endpointID int64, url, apiPath, apiKey string) error {
	log.Infof("[Master-%d#SSE]尝试连接->%s", endpointID, url)
	m.mu.Lock()
	defer m.mu.Unlock()

	// 如果已存在连接，先关闭
	if conn, exists := m.connections[endpointID]; exists {
		log.Infof("[Master-%d#SSE]已存在连接，先关闭", endpointID)
		conn.Cancel()
		// 不要删除连接对象，只是重置状态
		conn.SetConnected(false)
	} else {
		// 创建新的连接对象
		m.connections[endpointID] = &EndpointConnection{
			EndpointID: endpointID,
			URL:        url,
			APIPath:    apiPath,
			APIKey:     apiKey,
			Client: &http.Client{
				Transport: &http.Transport{
					// 启用系统/环境代理检测：先读 env，再回退到系统代理
					Proxy:           ieproxy.GetProxyFunc(),
					TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
					DialContext: (&net.Dialer{
						Timeout:   30 * time.Second,
						KeepAlive: 30 * time.Second,
						DualStack: true, // 兼容 IPv4/IPv6
					}).DialContext,
				},
			},
		}
	}

	conn := m.connections[endpointID]

	// 创建新的上下文
	ctx, cancel := context.WithCancel(m.daemonCtx)
	conn.Cancel = cancel

	// 重置连接状态（不是手动断开）
	conn.SetManuallyDisconnected(false)
	conn.UpdateLastConnectAttempt()

	// 启动SSE监听
	go m.listenSSE(ctx, conn)

	// 不要立即标记为ONLINE，等待SSE连接真正建立后再更新状态
	return nil
}

// DisconnectEndpoint 断开端点SSE连接
func (m *Manager) DisconnectEndpoint(endpointID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, exists := m.connections[endpointID]; exists {
		log.Infof("[Master-%d#SSE]手动断开连接", endpointID)

		// 标记为手动断开，阻止自动重连
		conn.SetManuallyDisconnected(true)
		conn.SetConnected(false)

		// 取消连接
		conn.Cancel()

		// 从连接池中删除
		delete(m.connections, endpointID)

		log.Infof("[Master-%d#SSE]连接已断开", endpointID)
		m.markEndpointDisconnect(endpointID)
	}
}

// listenSSE 使用 r3labs/sse 监听端点
func (m *Manager) listenSSE(ctx context.Context, conn *EndpointConnection) {
	sseURL := fmt.Sprintf("%s%s/events", conn.URL, conn.APIPath)
	log.Infof("[Master-%d#SSE]开始监听", conn.EndpointID)

	client := sse.NewClient(sseURL)
	client.Headers["X-API-Key"] = conn.APIKey
	// 自签名 SSL + 代理支持
	client.Connection.Transport = &http.Transport{
		// 启用系统/环境代理检测：先读 env，再回退到系统代理
		Proxy:           ieproxy.GetProxyFunc(),
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	// 使用默认 ReconnectStrategy（指数退避），不限重试次数
	events := make(chan *sse.Event)

	// 添加连接状态跟踪
	connectionEstablished := false

	// 在独立 goroutine 中订阅；SubscribeChanRawWithContext 会阻塞直至 ctx.Done()
	go func() {
		if err := client.SubscribeChanRawWithContext(ctx, events); err != nil {
			log.Errorf("[Master-%d#SSE]订阅失败 %v", conn.EndpointID, err)
			// 订阅失败时才标记为断开
			conn.SetConnected(false)
			if !conn.IsManuallyDisconnected() {
				log.Infof("[Master-%d#SSE]订阅失败，将由守护进程重连", conn.EndpointID)
				// 重置最后连接尝试时间，让守护进程可以立即重连
				conn.ResetLastConnectAttempt()
				m.markEndpointFail(conn.EndpointID)
			}
		}
	}()

	// 设置一个超时检查，如果在合理时间内没有接收到任何事件，则认为连接失败
	connectionTimeout := time.NewTimer(10 * time.Second)
	defer connectionTimeout.Stop()

	for {
		select {
		case <-ctx.Done():
			client.Unsubscribe(events)
			// 上下文取消，通常是手动断开或系统关闭
			conn.SetConnected(false)
			log.Infof("[Master-%d#SSE]监听协程退出", conn.EndpointID)
			return
		case <-connectionTimeout.C:
			// 连接超时，如果还没有建立连接则认为失败
			if !connectionEstablished {
				log.Warnf("[Master-%d#SSE]连接超时，未能在规定时间内建立连接", conn.EndpointID)
				conn.SetConnected(false)
				if !conn.IsManuallyDisconnected() {
					m.markEndpointFail(conn.EndpointID)
					conn.ResetLastConnectAttempt()
				}
				return
			}
		case ev, ok := <-events:
			if !ok {
				// 事件通道关闭，这是真正的连接断开
				log.Warnf("[Master-%d#SSE]事件通道已关闭", conn.EndpointID)
				conn.SetConnected(false)
				// 如果不是手动断开，标记需要重连
				if !conn.IsManuallyDisconnected() {
					log.Infof("[Master-%d#SSE]连接意外断开，将由守护进程重连", conn.EndpointID)
					// 重置最后连接尝试时间，让守护进程可以立即重连
					conn.ResetLastConnectAttempt()
					m.markEndpointFail(conn.EndpointID)
				}
				return
			}
			if ev == nil {
				continue
			}

			// 第一次接收到事件时，标记连接成功
			if !connectionEstablished {
				connectionEstablished = true
				conn.SetConnected(true)
				m.markEndpointOnline(conn.EndpointID)
				log.Infof("[Master-%d#SSE]连接已建立，接收到首个事件", conn.EndpointID)
				// 停止超时计时器
				connectionTimeout.Stop()
			}

			log.Debugf("[Master-%d#SSE]收到SSE消息: %s", conn.EndpointID, ev.Data)

			// 投递到全局 worker pool 异步处理
			select {
			case m.jobs <- eventJob{endpointID: conn.EndpointID, payload: string(ev.Data)}:
				// 成功投递到队列
			default:
				// 如果队列已满，记录告警，避免阻塞 r3labs 读取协程
				preview := string(ev.Data)
				if len(preview) > 100 {
					preview = preview[:100] + "..."
				}
				log.Warnf("[Master-%d#SSE]事件处理队列已满，丢弃消息: %s", conn.EndpointID, preview)
			}
		}
	}
}

// Close 关闭所有 SSE 连接
func (m *Manager) Close() {
	// 先停止守护进程
	m.StopDaemon()

	m.mu.Lock()
	defer m.mu.Unlock()

	log.Info("正在关闭所有SSE连接")
	for endpointID, conn := range m.connections {
		log.Infof("[Master-%d#SSE]关闭连接", endpointID)
		conn.SetManuallyDisconnected(true) // 标记为手动断开
		conn.Cancel()
	}
	m.connections = make(map[int64]*EndpointConnection)
	log.Info("所有SSE连接已关闭")
}

// GetConnectionStatus 获取连接状态信息
func (m *Manager) GetConnectionStatus() map[int64]map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	status := make(map[int64]map[string]interface{})
	for endpointID, conn := range m.connections {
		status[endpointID] = map[string]interface{}{
			"connected":             conn.IsConnected(),
			"manually_disconnected": conn.IsManuallyDisconnected(),
			"reconnect_attempts":    conn.GetReconnectAttempts(),
			"last_connect_attempt":  conn.GetLastConnectAttempt(),
		}
	}
	return status
}

// markEndpointFail 更新端点状态为 FAIL
func (m *Manager) markEndpointFail(endpointID int64) {
	// 更新端点状态为 FAIL，避免重复写
	res, err := m.db.Exec(`UPDATE endpoints SET status = 'FAIL', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'FAIL'`, endpointID)
	if err != nil {
		// 更新失败直接返回
		log.Errorf("[Master-%d#SSE]更新状态为 FAIL 失败 %v", endpointID, err)
		return
	}

	// 仅当确实修改了行时再打印成功日志
	if rows, err := res.RowsAffected(); err == nil && rows > 0 {
		log.Infof("[Master-%d#SSE]更新状态为 FAIL", endpointID)

		// 将该端点下的所有隧道标记为离线
		if err := m.setTunnelsOfflineForEndpoint(endpointID); err != nil {
			log.Errorf("[Master-%d#SSE]设置隧道离线状态失败: %v", endpointID, err)
		}
	}
}

// markEndpointDisconnect 更新端点状态为 DISCONNECT
func (m *Manager) markEndpointDisconnect(endpointID int64) {
	// 更新端点状态为 DISCONNECT，避免重复写
	res, err := m.db.Exec(`UPDATE endpoints SET status = 'DISCONNECT', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'DISCONNECT'`, endpointID)
	if err != nil {
		// 更新失败直接返回
		log.Errorf("[Master-%d#SSE]更新状态为 DISCONNECT 失败 %v", endpointID, err)
		return
	}

	// 仅当确实修改了行时再打印成功日志
	if rows, err := res.RowsAffected(); err == nil && rows > 0 {
		log.Infof("[Master-%d#SSE]更新状态为 DISCONNECT", endpointID)

		// 将该端点下的所有隧道标记为离线
		if err := m.setTunnelsOfflineForEndpoint(endpointID); err != nil {
			log.Errorf("[Master-%d#SSE]设置隧道离线状态失败: %v", endpointID, err)
		}
	}
}

// setTunnelsOfflineForEndpoint 将指定端点下的所有隧道标记为离线状态
func (m *Manager) setTunnelsOfflineForEndpoint(endpointID int64) error {
	// 更新该端点下所有隧道的状态为离线
	res, err := m.db.Exec(`
		UPDATE tunnels 
		SET status = 'offline', updated_at = CURRENT_TIMESTAMP 
		WHERE endpoint_id = ? AND status != 'offline'
	`, endpointID)

	if err != nil {
		return err
	}

	// 获取受影响的行数
	if rows, err := res.RowsAffected(); err == nil && rows > 0 {
		log.Infof("[Master-%d#SSE]已将 %d 个隧道状态更新为离线", endpointID, rows)
	}

	return nil
}

// markEndpointOnline 更新端点状态为 ONLINE
func (m *Manager) markEndpointOnline(endpointID int64) {
	// 尝试更新状态为 ONLINE
	res, err := m.db.Exec(`UPDATE endpoints SET status = 'ONLINE', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'ONLINE'`, endpointID)
	if err != nil {
		// 更新失败，记录错误并返回
		log.Errorf("[Master-%d#SSE]更新状态为 ONLINE 失败 %v", endpointID, err)
		return
	}

	// 更新成功才输出成功日志
	// 仅当确实修改了行时再打印成功日志
	if rows, err := res.RowsAffected(); err == nil && rows > 0 {
		log.Infof("[Master-%d#SSE]更新状态为 ONLINE", endpointID)
	}
}

// StartWorkers 启动固定数量的后台 worker 处理事件
func (m *Manager) StartWorkers(n int) {
	if n <= 0 {
		n = 4 // 默认 4 个
	}
	for i := 0; i < n; i++ {
		go m.workerLoop()
	}
}

// workerLoop 持续从 m.jobs 获取事件并处理
func (m *Manager) workerLoop() {
	for job := range m.jobs {
		m.processPayload(job.endpointID, job.payload)
	}
}

type SSEResp struct {
	Type     string `json:"type"`
	Time     string `json:"time"`
	Instance struct {
		nodepass.InstanceResult        // 不加inline标签
		URL                     string `json:"url"`
	} `json:"instance"`
	Logs *string `json:"logs"`
	// JSON中不存在的字段，后续手动设置
	TimeStamp  time.Time `json:"-"` // 不参与JSON序列化/反序列化
	EndpointID int64     `json:"-"` // 处理ID
}

// processPayload 解析 JSON 并调用 service.ProcessEvent
func (m *Manager) processPayload(endpointID int64, payloadStr string) {
	if payloadStr == "" {
		return
	}

	var payload SSEResp
	if err := json.Unmarshal([]byte(payloadStr), &payload); err != nil {
		log.Errorf("[Master-%d]解码 SSE JSON 失败 %v", endpointID, err)
		return
	}

	// 解析时间字符串
	payload.EndpointID = endpointID
	if parsedTime, err := time.Parse(time.RFC3339, payload.Time); err == nil {
		payload.TimeStamp = parsedTime
	} else {
		payload.TimeStamp = time.Now()
	}

	m.service.ProcessEvent(payload)
}

// GetFileLogger 获取文件日志管理器
func (m *Manager) GetFileLogger() *log.FileLogger {
	if m.service != nil {
		return m.service.GetFileLogger()
	}
	return nil
}

// NotifyEndpointStatusChanged 通知端点状态变化
func (m *Manager) NotifyEndpointStatusChanged(endpointID int64, status string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, exists := m.connections[endpointID]; exists {
		switch status {
		case "OFFLINE", "FAIL":
			if conn.IsConnected() {
				log.Infof("[Master-%d#SSE]端点状态变为%s，标记连接为断开", endpointID, status)
				conn.SetConnected(false)
				// 不是手动断开，应该进行重连
				if !conn.IsManuallyDisconnected() {
					log.Infof("[Master-%d#SSE]端点状态变化导致断开，将由守护进程重连", endpointID)
					// 重置最后连接尝试时间，让守护进程可以立即重连
					conn.ResetLastConnectAttempt()
				}
			}
		case "DISCONNECT":
			// 手动断开，不需要重连
			if conn.IsConnected() {
				log.Infof("[Master-%d#SSE]端点状态变为DISCONNECT，标记连接为断开", endpointID)
				conn.SetConnected(false)
			}
		case "ONLINE":
			// 端点恢复在线，但不主动设置连接状态，让实际的SSE连接来更新
			log.Debugf("[Master-%d#SSE]端点状态变为ONLINE", endpointID)
		}
	}
}
