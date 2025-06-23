package sse

import (
	"NodePassDash/internal/db"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Service SSE服务
type Service struct {
	// 客户端管理
	clients    map[string]*Client            // 全局客户端
	tunnelSubs map[string]map[string]*Client // 隧道订阅者
	mu         sync.RWMutex

	// 数据存储
	db *sql.DB

	// 异步持久化队列
	storeJobCh chan models.EndpointSSE // 事件持久化任务队列

	// 批处理相关
	batchUpdateCh  chan models.EndpointSSE       // 批量更新通道
	batchTimer     *time.Timer                   // 批处理定时器
	batchMu        sync.Mutex                    // 批处理锁
	pendingUpdates map[string]models.EndpointSSE // 待处理的更新 key: instanceID

	// 事件缓存
	eventCache     map[int64][]models.EndpointSSE // 端点事件缓存
	eventCacheMu   sync.RWMutex
	maxCacheEvents int

	// 健康检查
	healthCheckInterval time.Duration
	lastEventTime       map[int64]time.Time
	lastEventMu         sync.RWMutex

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
}

// NewService 创建SSE服务实例
func NewService(db *sql.DB) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{
		clients:             make(map[string]*Client),
		tunnelSubs:          make(map[string]map[string]*Client),
		db:                  db,
		storeJobCh:          make(chan models.EndpointSSE, 1000), // 缓冲大小按需调整
		batchUpdateCh:       make(chan models.EndpointSSE, 100),  // 批量更新通道
		batchTimer:          time.NewTimer(1 * time.Second),      // 批处理定时器
		pendingUpdates:      make(map[string]models.EndpointSSE), // 待处理的更新 key: instanceID
		eventCache:          make(map[int64][]models.EndpointSSE),
		maxCacheEvents:      100,
		healthCheckInterval: 30 * time.Second,
		lastEventTime:       make(map[int64]time.Time),
		ctx:                 ctx,
		cancel:              cancel,
	}

	// 启动异步持久化 worker，默认 1 条，可在外部自行调用 StartStoreWorkers 增加并发
	s.StartStoreWorkers(1)

	// 启动批处理 worker
	go s.startBatchProcessor()

	return s
}

// AddClient 添加新的SSE客户端
func (s *Service) AddClient(clientID string, w http.ResponseWriter) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.clients[clientID] = &Client{
		ID:     clientID,
		Writer: w,
	}

	// 记录日志
	// log.Infof("SSE客户端已添加,clientID=%s totalClients=%d", clientID, len(s.clients))
}

// RemoveClient 移除SSE客户端
func (s *Service) RemoveClient(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.clients, clientID)

	// 记录日志
	// log.Infof("SSE客户端已移除,clientID=%s remaining=%d", clientID, len(s.clients))

	// 清理隧道订阅
	for tunnelID, subs := range s.tunnelSubs {
		delete(subs, clientID)
		if len(subs) == 0 {
			delete(s.tunnelSubs, tunnelID)
		}
	}
}

// SubscribeToTunnel 订阅隧道事件
func (s *Service) SubscribeToTunnel(clientID, tunnelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.tunnelSubs[tunnelID]; !exists {
		s.tunnelSubs[tunnelID] = make(map[string]*Client)
	}

	if client, exists := s.clients[clientID]; exists {
		s.tunnelSubs[tunnelID][clientID] = client
		log.Infof("客户端订阅隧道clientID=%s tunnelID=%s subCount=%d", clientID, tunnelID, len(s.tunnelSubs[tunnelID]))
	}
}

// UnsubscribeFromTunnel 取消隧道订阅
func (s *Service) UnsubscribeFromTunnel(clientID, tunnelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if subs, exists := s.tunnelSubs[tunnelID]; exists {
		delete(subs, clientID)
		if len(subs) == 0 {
			delete(s.tunnelSubs, tunnelID)
		}
		log.Infof("客户端取消隧道订阅clientID=%s tunnelID=%s remainingSubs=%d", clientID, tunnelID, len(subs))
	}
}

// ProcessEvent 处理SSE事件
func (s *Service) ProcessEvent(endpointID int64, event models.EndpointSSE) error {
	// 异步处理事件，避免阻塞SSE接收
	select {
	case s.storeJobCh <- event:
		// 成功投递到存储队列
	default:
		log.Warnf("[Master-%d]事件存储队列已满，丢弃事件", endpointID)
		return fmt.Errorf("存储队列已满")
	}

	// 立即处理隧道状态变更（使用重试机制）
	go func() {
		if err := s.processEventImmediate(endpointID, event); err != nil {
			log.Warnf("[Master-%d#SSE]立即处理事件失败: %v", endpointID, err)
		}
	}()

	return nil
}

// processEventImmediate 立即处理事件的核心逻辑
func (s *Service) processEventImmediate(endpointID int64, event models.EndpointSSE) error {
	// 对于更新事件，使用批处理以减少数据库锁竞争
	if event.EventType == models.SSEEventTypeUpdate {
		select {
		case s.batchUpdateCh <- event:
			// 成功投递到批处理队列
			return nil
		default:
			// 批处理队列满，直接处理
			log.Warnf("[Master-%d#SSE]批处理队列已满，直接处理事件", endpointID)
		}
	}

	// Critical 事件（创建、删除、初始化）立即处理
	switch event.EventType {
	case models.SSEEventTypeShutdown:
		s.handleShutdownEvent(event)
	case models.SSEEventTypeInitial:
		s.handleInitialEvent(event)
	case models.SSEEventTypeCreate:
		s.handleCreateEvent(event)
	case models.SSEEventTypeUpdate:
		s.handleUpdateEvent(event)
	case models.SSEEventTypeDelete:
		s.handleDeleteEvent(event)
	case models.SSEEventTypeLog:
		s.handleLogEvent(event)
		log.Debugf("[Master-%d#SSE]处理log事件，准备推送给前端，instanceID=%s", endpointID, event.InstanceID)
	}

	// 更新最后事件时间
	s.updateLastEventTime(endpointID)

	// 推流转发给前端订阅
	if event.EventType != models.SSEEventTypeInitial {
		if event.InstanceID != "" {
			log.Debugf("[Master-%d#SSE]准备推送事件给前端，eventType=%s instanceID=%s", endpointID, event.EventType, event.InstanceID)
			s.sendTunnelUpdateByInstanceId(event.InstanceID, event)
		}
		return nil
	}

	return nil
}

func (s *Service) handleShutdownEvent(event models.EndpointSSE) {
	s.updateEndpointStatus(event.EndpointID, models.EndpointStatusOffline)
}

func (s *Service) updateEndpointStatus(endpointID int64, status models.EndpointStatus) {
	// 更新端点状态到数据库
	_, err := s.db.Exec(`
		UPDATE "Endpoint" 
		SET status = ?, updatedAt = CURRENT_TIMESTAMP 
		WHERE id = ? AND status != ?
	`, status, endpointID, status)

	if err != nil {
		log.Errorf("[Master-%d#SSE]更新端点状态失败: %v", endpointID, err)
		return
	}

	log.Infof("[Master-%d#SSE]端点状态已更新为: %s", endpointID, status)

}

// StartStoreWorkers 启动固定数量的事件持久化 worker
func (s *Service) StartStoreWorkers(n int) {
	if n <= 0 {
		n = 1 // 默认至少 1 个
	}
	for i := 0; i < n; i++ {
		go s.storeWorkerLoop()
	}
}

// storeWorkerLoop 持续消费 storeJobCh 并写入数据库
func (s *Service) storeWorkerLoop() {
	for {
		select {
		case <-s.ctx.Done():
			return // 服务关闭
		case ev := <-s.storeJobCh:
			if err := s.storeEvent(ev); err != nil {
				log.Warnf("[Master-%d]异步存储事件失败,err=%v", ev.EndpointID, err)
			}
		}
	}
}

// storeEvent 存储SSE事件
func (s *Service) storeEvent(event models.EndpointSSE) error {
	// 插入数据库
	_, err := s.db.Exec(`
		INSERT INTO "EndpointSSE" (
			eventType, pushType, eventTime, endpointId,
			instanceId, instanceType, status, url,
			tcpRx, tcpTx, udpRx, udpTx,
			logs, createdAt
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		event.EventType, event.PushType, event.EventTime, event.EndpointID,
		event.InstanceID, event.InstanceType, event.Status, event.URL,
		event.TCPRx, event.TCPTx, event.UDPRx, event.UDPTx,
		event.Logs, time.Now(),
	)
	if err != nil {
		return err
	}

	// 更新事件缓存
	s.updateEventCache(event)

	return nil
}

/**
* 事件缓存
* 功能：维护每个端点最近 N 条事件的环形缓存。
* 并发安全：借助互斥锁保证多 goroutine 同时写缓存时不会出现竞态。
* 好处：
* 前端（或新连入的 SSE 客户端）可以在连接时一次性拉取"最近若干事件"，快速同步状态；
* 控制内存，防止长时间运行后事件无限增长。
 */
// updateEventCache 更新事件缓存 把一条刚处理完的 SSE 事件追加进内存缓存，且保证每个端点的缓存长度不会超过设定上限
func (s *Service) updateEventCache(event models.EndpointSSE) {
	// eventCacheMu 是一把读写互斥锁（sync.RWMutex）用来保护 eventCache 这张 Map。
	// 这里用 Lock()（写锁），确保在添加/裁剪缓存期间不会有其他 goroutine 并发读写。
	// defer Unlock() 保证函数返回时自动释放锁，防止忘记解锁导致死锁。
	s.eventCacheMu.Lock()
	defer s.eventCacheMu.Unlock()
	// eventCache 结构：map[int64][]models.EndpointSSE，键是 EndpointID，值是该端点对应的事件切片。
	// 先取出该端点现有的事件切片 cache，随后 append 把新事件追加到末尾。
	cache := s.eventCache[event.EndpointID]
	cache = append(cache, event)

	// 保持缓存大小
	if len(cache) > s.maxCacheEvents {
		// s.maxCacheEvents 是一个阈值（构造函数里默认 100）。
		// 如果 cache 超过这个阈值，就把多余的头部元素裁掉，只保留最近 maxCacheEvents 条：
		// cache[len(cache)-s.maxCacheEvents:] 等价于"从尾部往前数 maxCacheEvents 条"。
		// 这样能确保内存占用可控，同时保留最新的事件供后续重放。
		cache = cache[len(cache)-s.maxCacheEvents:]
	}
	// 最后把更新后的 cache 写回 eventCache 中，确保并发安全。
	s.eventCache[event.EndpointID] = cache
}

// broadcastEvent 广播事件到所有相关客户端
func (s *Service) broadcastEvent(event models.EndpointSSE) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// 序列化事件
	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Warn("序列化事件失败", "err", err)
		return
	}

	// 构造SSE消息
	message := fmt.Sprintf("data: %s\n\n", eventJSON)

	// 发送到所有全局客户端
	for _, client := range s.clients {
		fmt.Fprint(client.Writer, message)
		if f, ok := client.Writer.(http.Flusher); ok {
			f.Flush()
		}
	}

	// 如果是隧道相关事件，发送到订阅者
	if event.InstanceID != "" {
		if subs, exists := s.tunnelSubs[event.InstanceID]; exists {
			for _, client := range subs {
				fmt.Fprint(client.Writer, message)
				if f, ok := client.Writer.(http.Flusher); ok {
					f.Flush()
				}
			}
		}
	}
}

// updateLastEventTime 更新最后事件时间
func (s *Service) updateLastEventTime(endpointID int64) {
	s.lastEventMu.Lock()
	defer s.lastEventMu.Unlock()
	s.lastEventTime[endpointID] = time.Now()
}

// Close 关闭SSE服务
func (s *Service) Close() {
	s.cancel()

	// 关闭批处理定时器
	if s.batchTimer != nil {
		s.batchTimer.Stop()
	}

	// 关闭持久化队列，等待 worker 退出
	close(s.storeJobCh)

	// 清理所有客户端连接
	s.mu.Lock()
	defer s.mu.Unlock()

	s.clients = make(map[string]*Client)
	s.tunnelSubs = make(map[string]map[string]*Client)

	log.Info("SSE服务已关闭")
}

// stringPtr 创建字符串指针
func stringPtr(s string) *string {
	return &s
}

// valueOrEmpty 返回指针指向的值，若指针为 nil 则返回提供的默认值（泛型实现）
// 使用泛型以支持多种类型，不对值做比较，仅返回零值或默认值
func valueOrEmpty[T any](p *T, def T) T {
	if p == nil {
		return def
	}
	return *p
}

// ============================= 新增辅助方法 =============================

// sendTunnelUpdateByInstanceId 按隧道实例 ID 推送事件，仅发送给订阅了该隧道的客户端
func (s *Service) sendTunnelUpdateByInstanceId(instanceID string, data interface{}) {
	// 为避免在读锁状态下修改 map，拆分为两步：读取 +（可能）清理
	s.mu.RLock()
	subs, exists := s.tunnelSubs[instanceID]
	s.mu.RUnlock()

	if !exists || len(subs) == 0 {
		// 没有订阅者，记录调试日志后退出
		// log.Debugf("[Inst.%s]无隧道订阅者，跳过推送", instanceID)
		return
	}

	// 记录推送准备日志
	payload, err := json.Marshal(data)
	if err != nil {
		log.Warnf("[Inst.%s]序列化隧道事件失败,err=%v", instanceID, err)
		return
	}

	message := fmt.Sprintf("data: %s\n\n", payload)

	failedIDs := make([]string, 0)
	sent := 0

	for id, client := range subs {
		if _, err := fmt.Fprint(client.Writer, message); err == nil {
			if f, ok := client.Writer.(http.Flusher); ok {
				f.Flush()
			}
			sent++
		} else {
			failedIDs = append(failedIDs, id)
			log.Warnf("[Inst.%s]推送失败给客户端: %s, err=%v", instanceID, id, err)
		}
	}

	if len(failedIDs) > 0 {
		s.mu.Lock()
		for _, fid := range failedIDs {
			delete(subs, fid)
		}
		// 若订阅者列表空，则移除隧道映射
		if len(subs) == 0 {
			delete(s.tunnelSubs, instanceID)
		}
		s.mu.Unlock()
	}
	log.Debugf("[Inst.%s]隧道事件已推送", instanceID)
}

// sendGlobalUpdate 推送全局事件（仪表盘 / 列表等使用），会发送给所有客户端
func (s *Service) sendGlobalUpdate(data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Warnf("序列化全局事件失败,err=%v", err)
		return
	}

	message := fmt.Sprintf("data: %s\n\n", payload)

	s.mu.RLock()
	clientsCopy := make(map[string]*Client, len(s.clients))
	for id, cl := range s.clients {
		clientsCopy[id] = cl
	}
	s.mu.RUnlock()

	failedIDs := make([]string, 0)
	sent := 0

	for id, client := range clientsCopy {
		if _, err := fmt.Fprint(client.Writer, message); err == nil {
			if f, ok := client.Writer.(http.Flusher); ok {
				f.Flush()
			}
			sent++
		} else {
			failedIDs = append(failedIDs, id)
		}
	}

	if len(failedIDs) > 0 {
		s.mu.Lock()
		for _, fid := range failedIDs {
			delete(s.clients, fid)
		}
		s.mu.Unlock()
	}

	log.Infof("全局事件已推送,sent=%d", sent)
}

// updateTunnelData 根据事件更新 Tunnel 表及 Endpoint.tunnelCount
func (s *Service) updateTunnelData(event models.EndpointSSE) {
	// 记录函数调用及关键字段
	log.Debugf("[Inst.%s]updateTunnelData,eventType=%s instanceID=%s endpointID=%d", event.InstanceID, event.EventType, event.InstanceID, event.EndpointID)

	// log 事件仅用于日志推流，无需更新隧道表
	if event.EventType == models.SSEEventTypeLog || event.InstanceID == "" {
		return
	}

	// 使用事务保证一致性
	tx, err := s.db.Begin()
	if err != nil {
		log.Errorf("[Inst.%s]开始事务失败,err=%v", event.InstanceID, err)
		return
	}

	defer func() {
		_ = tx.Rollback()
	}()

	// 判断隧道是否存在（endpointId + instanceId 唯一）
	var tunnelID int64
	err = tx.QueryRow(`SELECT id FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, event.EndpointID, event.InstanceID).Scan(&tunnelID)

	now := time.Now()

	statusVal := ""
	if event.Status != nil {
		statusVal = *event.Status
	}

	if err == sql.ErrNoRows {
		// 仅在 create/initial 事件时插入
		if event.EventType == models.SSEEventTypeCreate || event.EventType == models.SSEEventTypeInitial {
			// 若类型为空则跳过处理，避免回显消息写库
			if event.InstanceType == nil || *event.InstanceType == "" {
			} else {
				log.Infof("[Inst.%s]sse推送创建隧道实例,instanceType=%s", event.InstanceID, *event.InstanceType)
				// 解析 URL 获取详细配置
				var (
					tunnelAddr, tunnelPort, targetAddr, targetPort, tlsMode, logLevel, commandLine string
					cfg                                                                            parsedURL
				)
				if event.URL != nil {
					cfg = parseInstanceURL(*event.URL, *event.InstanceType)
					tunnelAddr = cfg.TunnelAddress
					tunnelPort = cfg.TunnelPort
					targetAddr = cfg.TargetAddress
					targetPort = cfg.TargetPort
					tlsMode = cfg.TLSMode
					logLevel = cfg.LogLevel
					commandLine = *event.URL
				}

				if tlsMode == "" {
					tlsMode = "inherit"
				}
				if logLevel == "" {
					logLevel = "inherit"
				}

				_, err = tx.Exec(`INSERT INTO "Tunnel" (
					instanceId, endpointId, name, mode,
					status, tunnelAddress, tunnelPort, targetAddress, targetPort,
					tlsMode, certPath, keyPath, logLevel, commandLine,
					min, max,
					tcpRx, tcpTx, udpRx, udpTx,
					createdAt, updatedAt, lastEventTime
				) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
					event.InstanceID,
					event.EndpointID,
					event.InstanceID,
					*event.InstanceType,
					statusVal,
					tunnelAddr,
					tunnelPort,
					targetAddr,
					targetPort,
					tlsMode,
					cfg.CertPath,
					cfg.KeyPath,
					logLevel,
					commandLine,
					func() interface{} {
						if cfg.Min != "" {
							return cfg.Min
						}
						return nil
					}(),
					func() interface{} {
						if cfg.Max != "" {
							return cfg.Max
						}
						return nil
					}(),
					event.TCPRx,
					event.TCPTx,
					event.UDPRx,
					event.UDPTx,
					now,
					now,
					event.EventTime,
				)
				if err != nil {
					log.Errorf("[Inst.%s]插入隧道记录失败,err=%v", event.InstanceID, err)
					return
				}
				log.Infof("[Inst.%s]隧道记录已插入", event.InstanceID)
			}
		}
	} else if err == nil {
		// 读取当前状态以判断是否需要更新
		var currentStatus string
		if err := tx.QueryRow(`SELECT status FROM "Tunnel" WHERE id = ?`, tunnelID).Scan(&currentStatus); err != nil {
			log.Warnf("[Inst.%s]查询当前隧道状态失败,err=%v", event.InstanceID, err)
		}

		if statusVal != "" && statusVal == currentStatus {
			// 状态一致，无需更新
			log.Debugf("[Inst.%s]隧道状态未变化，跳过更新,status=%s", event.InstanceID, currentStatus)
		} else {
			log.Infof("[Inst.%s]sse推送更新隧道实例,oldStatus=%s newStatus=%s", event.InstanceID, currentStatus, statusVal)

			// 如果是 delete 事件，直接删除记录
			if event.EventType == models.SSEEventTypeDelete {
				if _, err := tx.Exec(`DELETE FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, event.EndpointID, event.InstanceID); err != nil {
					log.Warnf("[Inst.%s]删除隧道记录失败,err=%v", event.InstanceID, err)
				} else {
					log.Infof("[Inst.%s]已删除隧道记录", event.InstanceID)
				}
			} else {
				// 更新已有隧道
				var setParts []string
				var args []interface{}

				if statusVal != "" {
					setParts = append(setParts, "status = ?")
					args = append(args, statusVal)
				}

				setParts = append(setParts, "tcpRx = ?", "tcpTx = ?", "udpRx = ?", "udpTx = ?", "lastEventTime = ?", "updatedAt = ?")
				args = append(args, event.TCPRx, event.TCPTx, event.UDPRx, event.UDPTx, event.EventTime, now)

				query := fmt.Sprintf(`UPDATE "Tunnel" SET %s WHERE instanceId = ?`, strings.Join(setParts, ", "))
				args = append(args, event.InstanceID)

				if _, err := tx.Exec(query, args...); err != nil {
					log.Errorf("[Inst.%s]更新隧道记录失败,err=%v", event.InstanceID, err)
					return
				}
			}
		}
	} else {
		log.Errorf("[Inst.%s]查询隧道记录失败,err=%v", event.InstanceID, err)
		return
	}

	// 重新计算并更新 Endpoint.tunnelCount
	_, err = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, event.EndpointID, event.EndpointID)
	if err != nil {
		log.Errorf("[Master-%d]更新端点隧道计数失败,err=%v", event.EndpointID, err)
		return
	}

	log.Debugf("[Master-%d]端点隧道计数已刷新", event.EndpointID)

	_ = tx.Commit()

	// log.Info("updateTunnelData 完成", "instanceID", event.InstanceID, "eventType", event.EventType)
}

// parseInstanceURL 解析隧道实例 URL，返回各字段（简化版）
type parsedURL struct {
	TunnelAddress string
	TunnelPort    string
	TargetAddress string
	TargetPort    string
	TLSMode       string
	LogLevel      string
	CertPath      string
	KeyPath       string
	Min           string
	Max           string
}

func parseInstanceURL(raw, mode string) parsedURL {
	// 默认值
	res := parsedURL{
		TLSMode:  "inherit",
		LogLevel: "inherit",
		CertPath: "",
		KeyPath:  "",
	}

	if raw == "" {
		return res
	}

	// 分离 protocol://hostPart/pathPart?query
	var hostPart, pathPart, queryPart string
	// strip protocol
	if idx := strings.Index(raw, "://"); idx != -1 {
		raw = raw[idx+3:]
	}

	// split query
	if qIdx := strings.Index(raw, "?"); qIdx != -1 {
		queryPart = raw[qIdx+1:]
		raw = raw[:qIdx]
	}

	// split path
	if pIdx := strings.Index(raw, "/"); pIdx != -1 {
		hostPart = raw[:pIdx]
		pathPart = raw[pIdx+1:]
	} else {
		hostPart = raw
	}

	// hostPart => tunnel address:port
	if hostPart != "" {
		if strings.Contains(hostPart, ":") {
			parts := strings.SplitN(hostPart, ":", 2)
			res.TunnelAddress = parts[0]
			res.TunnelPort = parts[1]
		} else {
			// 只有端口或地址
			if _, err := strconv.Atoi(hostPart); err == nil {
				res.TunnelPort = hostPart
			} else {
				res.TunnelAddress = hostPart
			}
		}
	}

	// pathPart => target address:port
	if pathPart != "" {
		if strings.Contains(pathPart, ":") {
			parts := strings.SplitN(pathPart, ":", 2)
			res.TargetAddress = parts[0]
			res.TargetPort = parts[1]
		} else {
			if _, err := strconv.Atoi(pathPart); err == nil {
				res.TargetPort = pathPart
			} else {
				res.TargetAddress = pathPart
			}
		}
	}

	// query params
	if queryPart != "" {
		for _, kv := range strings.Split(queryPart, "&") {
			if kv == "" {
				continue
			}
			parts := strings.SplitN(kv, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key, val := parts[0], parts[1]
			switch key {
			case "tls":
				if mode == "server" {
					switch val {
					case "0":
						res.TLSMode = "mode0"
					case "1":
						res.TLSMode = "mode1"
					case "2":
						res.TLSMode = "mode2"
					}
				}
			case "log":
				res.LogLevel = strings.ToLower(val)
			case "crt":
				res.CertPath = val
			case "key":
				res.KeyPath = val
			case "min":
				res.Min = val
			case "max":
				res.Max = val
			}
		}
	}

	return res
}

// ======================== 事件处理器 ============================

func (s *Service) handleInitialEvent(e models.EndpointSSE) {
	if e.InstanceType == nil || *e.InstanceType == "" {
		return
	}
	cfg := parseInstanceURL(ptrString(e.URL), *e.InstanceType)
	if err := s.withTx(func(tx *sql.Tx) error { return s.tunnelCreate(tx, e, cfg) }); err != nil {
	}
}

func (s *Service) handleCreateEvent(e models.EndpointSSE) {
	cfg := parseInstanceURL(ptrString(e.URL), *e.InstanceType)
	if err := s.withTx(func(tx *sql.Tx) error { return s.tunnelCreate(tx, e, cfg) }); err != nil {
	}
}

func (s *Service) handleUpdateEvent(e models.EndpointSSE) {
	if err := s.withTx(func(tx *sql.Tx) error {
		cfg := parseInstanceURL(ptrString(e.URL), ptrStringDefault(e.InstanceType, ""))
		return s.tunnelUpdate(tx, e, cfg)
	}); err != nil {
	}
}

func (s *Service) handleDeleteEvent(e models.EndpointSSE) {
	if err := s.withTx(func(tx *sql.Tx) error { return s.tunnelDelete(tx, e.EndpointID, e.InstanceID) }); err != nil {
	}
}

func (s *Service) handleLogEvent(e models.EndpointSSE) {
	// log.Debug("处理 log 事件", "instanceID", e.InstanceID)

}

// =============== 隧道 CRUD ===============

func (s *Service) tunnelExists(tx *sql.Tx, endpointID int64, instanceID string) (bool, error) {
	var cnt int
	if err := tx.QueryRow(`SELECT COUNT(1) FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, endpointID, instanceID).Scan(&cnt); err != nil {
		return false, err
	}
	return cnt > 0, nil
}

func (s *Service) tunnelCreate(tx *sql.Tx, e models.EndpointSSE, cfg parsedURL) error {
	exists, err := s.tunnelExists(tx, e.EndpointID, e.InstanceID)
	if err != nil || exists {
		log.Warnf("[Master-%d#SSE]Inst.%s已存在记录，跳过创建", e.EndpointID, e.InstanceID)
		return err
	}
	name := e.InstanceID
	if cfg.LogLevel == "" {
		cfg.LogLevel = "inherit"
	}
	if e.InstanceType != nil && *e.InstanceType == "server" {
		if cfg.TLSMode == "" {
			cfg.TLSMode = "inherit"
		}
	}

	_, err = tx.Exec(`INSERT INTO "Tunnel" (
		instanceId, endpointId, name, mode,
		status, tunnelAddress, tunnelPort, targetAddress, targetPort,
		tlsMode, certPath, keyPath, logLevel, commandLine,
		min, max,
		tcpRx, tcpTx, udpRx, udpTx,
		createdAt, updatedAt, lastEventTime
	) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		e.InstanceID, e.EndpointID, name, ptrStringDefault(e.InstanceType, ""), ptrStringDefault(e.Status, "stopped"),
		cfg.TunnelAddress, cfg.TunnelPort, cfg.TargetAddress, cfg.TargetPort,
		cfg.TLSMode, cfg.CertPath, cfg.KeyPath, cfg.LogLevel, ptrString(e.URL),
		func() interface{} {
			if cfg.Min != "" {
				return cfg.Min
			}
			return nil
		}(),
		func() interface{} {
			if cfg.Max != "" {
				return cfg.Max
			}
			return nil
		}(),
		e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, time.Now(), time.Now(), e.EventTime,
	)
	if err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s创建隧道失败,err=%v", e.EndpointID, e.InstanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s创建隧道成功", e.EndpointID, e.InstanceID)

	// 更新端点隧道计数
	_, err = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, e.EndpointID, e.EndpointID)
	log.Infof("[Master-%d#SSE]更新端点隧道计数", e.EndpointID)
	return err
}

func (s *Service) tunnelUpdate(tx *sql.Tx, e models.EndpointSSE, cfg parsedURL) error {
	var curStatus string
	var curTCPRx, curTCPTx, curUDPRx, curUDPTx int64
	var curEventTime sql.NullTime

	err := tx.QueryRow(`SELECT status, tcpRx, tcpTx, udpRx, udpTx, lastEventTime FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, e.EndpointID, e.InstanceID).
		Scan(&curStatus, &curTCPRx, &curTCPTx, &curUDPRx, &curUDPTx, &curEventTime)
	if err == sql.ErrNoRows {
		log.Infof("[Master-%d#SSE]Inst.%s不存在，跳过更新", e.EndpointID, e.InstanceID)
		return nil // 尚未创建对应记录，等待后续 create/initial
	}
	if err != nil {
		return err // 查询错误
	}

	newStatus := ptrStringDefault(e.Status, curStatus)

	statusChanged := newStatus != curStatus
	trafficChanged := curTCPRx != e.TCPRx || curTCPTx != e.TCPTx || curUDPRx != e.UDPRx || curUDPTx != e.UDPTx

	// 只有状态/流量变化且事件时间更新时才更新
	if !statusChanged && !trafficChanged {
		return nil
	}

	if curEventTime.Valid && !e.EventTime.After(curEventTime.Time) {
		log.Infof("[Master-%d#SSE]Inst.%s旧事件时间，跳过更新", e.EndpointID, e.InstanceID)
		return nil
	}

	_, err = tx.Exec(`UPDATE "Tunnel" SET status = ?, tcpRx = ?, tcpTx = ?, udpRx = ?, udpTx = ?, lastEventTime = ?, updatedAt = ? WHERE endpointId = ? AND instanceId = ?`,
		newStatus, e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, e.EventTime, time.Now(), e.EndpointID, e.InstanceID)
	if err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s更新隧道失败,err=%v", e.EndpointID, e.InstanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s更新隧道成功", e.EndpointID, e.InstanceID)
	return err
}

func (s *Service) tunnelDelete(tx *sql.Tx, endpointID int64, instanceID string) error {
	exists, err := s.tunnelExists(tx, endpointID, instanceID)
	if err != nil {
		return err
	}
	if !exists {
		log.Debugf("[Master-%d#SSE]Inst.%s不存在，跳过删除", endpointID, instanceID)
		return nil // 无需删除
	}

	if _, err := tx.Exec(`DELETE FROM "Tunnel" WHERE endpointId = ? AND instanceId = ?`, endpointID, instanceID); err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s删除隧道失败,err=%v", endpointID, instanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s删除隧道成功", endpointID, instanceID)

	// 更新端点隧道计数
	_, err = tx.Exec(`UPDATE "Endpoint" SET tunnelCount = (
		SELECT COUNT(*) FROM "Tunnel" WHERE endpointId = ?
	) WHERE id = ?`, endpointID, endpointID)
	return err
}

func (s *Service) withTx(fn func(*sql.Tx) error) error {
	return db.TxWithRetry(fn)
}

// helper
func ptrString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptrStringDefault(s *string, def string) string {
	if s == nil || *s == "" {
		return def
	}
	return *s
}

// startBatchProcessor 启动批处理处理器
func (s *Service) startBatchProcessor() {
	for {
		select {
		case <-s.ctx.Done():
			return
		case event := <-s.batchUpdateCh:
			s.addToBatch(event)
		case <-s.batchTimer.C:
			s.flushBatch()
			s.batchTimer.Reset(200 * time.Millisecond) // 200ms 批处理间隔
		}
	}
}

// addToBatch 添加事件到批处理队列
func (s *Service) addToBatch(event models.EndpointSSE) {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()

	// 使用 instanceID 作为键，最新的事件会覆盖旧的
	s.pendingUpdates[event.InstanceID] = event

	// 如果积累了足够的更新，立即刷新
	if len(s.pendingUpdates) >= 10 {
		s.flushBatchUnsafe()
	}
}

// flushBatch 刷新批处理队列（外部调用）
func (s *Service) flushBatch() {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.flushBatchUnsafe()
}

// flushBatchUnsafe 刷新批处理队列（内部调用，需要持有锁）
func (s *Service) flushBatchUnsafe() {
	if len(s.pendingUpdates) == 0 {
		return
	}

	// 收集所有待处理的事件
	events := make([]models.EndpointSSE, 0, len(s.pendingUpdates))
	for _, event := range s.pendingUpdates {
		events = append(events, event)
	}

	// 清空待处理队列
	s.pendingUpdates = make(map[string]models.EndpointSSE)

	// 批量处理事件
	go func() {
		if err := s.processBatchEvents(events); err != nil {
			log.Errorf("批量处理事件失败: %v", err)
		}
	}()
}

// processBatchEvents 批量处理事件
func (s *Service) processBatchEvents(events []models.EndpointSSE) error {
	return db.TxWithRetry(func(tx *sql.Tx) error {
		for _, event := range events {
			if err := s.processSingleEventInTx(tx, event); err != nil {
				log.Warnf("[Master-%d#SSE]Inst.%s批量处理失败: %v", event.EndpointID, event.InstanceID, err)
				// 继续处理其他事件，不中断整个批次
			}
		}
		return nil
	})
}

// processSingleEventInTx 在事务中处理单个事件
func (s *Service) processSingleEventInTx(tx *sql.Tx, event models.EndpointSSE) error {
	cfg := parseInstanceURL(ptrString(event.URL), ptrStringDefault(event.InstanceType, ""))

	switch event.EventType {
	case models.SSEEventTypeInitial, models.SSEEventTypeCreate:
		return s.tunnelCreate(tx, event, cfg)
	case models.SSEEventTypeUpdate:
		return s.tunnelUpdate(tx, event, cfg)
	case models.SSEEventTypeDelete:
		return s.tunnelDelete(tx, event.EndpointID, event.InstanceID)
	}
	return nil
}
