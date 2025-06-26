package sse

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
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
}

// eventJob 表示一个待处理的 SSE 消息
type eventJob struct {
	endpointID int64
	payload    string
}

// NewManager 创建SSE管理器
func NewManager(db *sql.DB, service *Service) *Manager {
	return &Manager{
		service:     service,
		db:          db,
		connections: make(map[int64]*EndpointConnection),
		jobs:        make(chan eventJob, 4096), // 缓冲可按需调整 //    size := getEnvInt("SSE_JOB_BUFFER", 4096)
	}
}

// InitializeSystem 初始化系统
func (m *Manager) InitializeSystem() error {
	log.Infof("开始初始化系统")
	// 统计需要重连的端点数量（过滤掉已明确失败的端点）
	var total int
	if err := m.db.QueryRow(`SELECT COUNT(*) FROM "Endpoint" WHERE status != 'FAIL'`).Scan(&total); err == nil {
		log.Infof("扫描到需重连的端点数量: %d", total)
	}

	// 获取所有端点
	rows, err := m.db.Query(`
		SELECT id, url, apiPath, apiKey 
		FROM "Endpoint" 
		WHERE status != 'FAIL'
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
		delete(m.connections, endpointID)
	}

	// 创建新的上下文
	ctx, cancel := context.WithCancel(context.Background())

	// 创建连接
	conn := &EndpointConnection{
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
		Cancel: cancel,
	}

	m.connections[endpointID] = conn

	// 启动SSE监听
	go m.listenSSE(ctx, conn)

	// 立即标记端点为 ONLINE（监听协程会负责后续状态更新）
	m.markEndpointOnline(endpointID)

	return nil
}

// DisconnectEndpoint 断开端点SSE连接
func (m *Manager) DisconnectEndpoint(endpointID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if conn, exists := m.connections[endpointID]; exists {
		log.Infof("[Master-%d#SSE]正在断开连接", endpointID)
		conn.Cancel()
		delete(m.connections, endpointID)
		log.Infof("[Master-%d#SSE]连接已断开", endpointID)
		m.markEndpointFail(endpointID)
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

	// 在独立 goroutine 中订阅；SubscribeChanRawWithContext 会阻塞直至 ctx.Done()
	go func() {
		if err := client.SubscribeChanRawWithContext(ctx, events); err != nil {
			log.Errorf("[Master-%d#SSE]订阅失败 %v", conn.EndpointID, err)
		}
	}()

	for {
		select {
		case <-ctx.Done():
			client.Unsubscribe(events)
			return
		case ev, ok := <-events:
			// case ev := <-events:
			if !ok {
				log.Warnf("[Master-%d#SSE]事件通道已关闭", conn.EndpointID)
				return
			}
			if ev == nil {
				continue
			}
			log.Debugf("[Master-%d#SSE]MSG: %s", conn.EndpointID, ev.Data)

			// 投递到全局 worker pool 异步处理
			select {
			case m.jobs <- eventJob{endpointID: conn.EndpointID, payload: string(ev.Data)}:
			default:
				// 如果队列已满，记录告警，避免阻塞 r3labs 读取协程
				log.Warnf("[Master-%d#SSE]事件处理队列已满，丢弃消息", conn.EndpointID)
			}
		}
	}
}

// Close 关闭所有 SSE 连接
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, conn := range m.connections {
		conn.Cancel()
	}
	m.connections = make(map[int64]*EndpointConnection)
}

// markEndpointFail 更新端点状态为 FAIL
func (m *Manager) markEndpointFail(endpointID int64) {
	// 更新端点状态为 FAIL，避免重复写
	res, err := m.db.Exec(`UPDATE "Endpoint" SET status = 'FAIL', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status != 'FAIL'`, endpointID)
	if err != nil {
		// 更新失败直接返回
		log.Errorf("[Master-%d#SSE]更新状态为 FAIL 失败 %v", endpointID, err)
		return
	}

	// 仅当确实修改了行时再打印成功日志
	if rows, err := res.RowsAffected(); err == nil && rows > 0 {
		log.Infof("[Master-%d#SSE]更新状态为 FAIL", endpointID)
	}
}

// markEndpointOnline 更新端点状态为 ONLINE
func (m *Manager) markEndpointOnline(endpointID int64) {
	// 尝试更新状态为 ONLINE
	res, err := m.db.Exec(`UPDATE "Endpoint" SET status = 'ONLINE', updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status != 'ONLINE'`, endpointID)
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

// processPayload 解析 JSON 并调用 service.ProcessEvent
func (m *Manager) processPayload(endpointID int64, payload string) {
	if payload == "" {
		return
	}
	var event struct {
		Type      string          `json:"type"`
		Time      interface{}     `json:"time"`
		Logs      interface{}     `json:"logs"`
		Instance  json.RawMessage `json:"instance"`
		Instances json.RawMessage `json:"instances"`
	}

	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		log.Errorf("[Master-%d]解码 SSE JSON 失败 %v", endpointID, err)
		return
	}

	var logsStr string
	if event.Logs != nil {
		if s, ok := event.Logs.(string); ok {
			logsStr = s
		} else {
			logsStr = fmt.Sprintf("%v", event.Logs)
		}
	}

	// 处理 create / update / delete / log 单实例事件
	var inst struct {
		ID     string `json:"id"`
		Type   string `json:"type"`
		Status string `json:"status"`
		URL    string `json:"url"`
		TCPRx  int64  `json:"tcprx"`
		TCPTx  int64  `json:"tcptx"`
		UDPRx  int64  `json:"udprx"`
		UDPTx  int64  `json:"udptx"`
	}
	if err := json.Unmarshal(event.Instance, &inst); err != nil {
		log.Errorf("[Master-%d#SSE]解析实例数据失败 %v", endpointID, err)
		return
	}

	evt := models.EndpointSSE{
		EventType:    models.SSEEventType(event.Type),
		PushType:     event.Type,
		EventTime:    time.Now(),
		EndpointID:   endpointID,
		InstanceID:   inst.ID,
		InstanceType: &inst.Type,
		Status:       &inst.Status,
		URL:          &inst.URL,
		TCPRx:        inst.TCPRx,
		TCPTx:        inst.TCPTx,
		UDPRx:        inst.UDPRx,
		UDPTx:        inst.UDPTx,
		Logs:         &logsStr,
	}

	if err := m.service.ProcessEvent(endpointID, evt); err != nil {
		log.Errorf("[Master-%d#SSE]处理事件失败 %v", endpointID, err)
	}
}
