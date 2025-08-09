package sse

import (
	"NodePassDash/internal/db"
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// Service SSE服务
type Service struct {
	// 客户端管理
	clients    map[string]*Client            // 全局客户端
	tunnelSubs map[string]map[string]*Client // 隧道订阅者
	mu         sync.RWMutex

	// 数据存储
	db *gorm.DB

	// 端点服务引用
	endpointService *endpoint.Service

	// Manager引用（用于状态通知）
	manager *Manager

	// 异步持久化队列
	storeJobCh chan models.EndpointSSE // 事件持久化任务队列

	// 批处理相关
	batchUpdateCh  chan models.EndpointSSE       // 批量更新通道
	batchTimer     *time.Timer                   // 批处理定时器
	batchMu        sync.Mutex                    // 批处理锁
	pendingUpdates map[string]models.EndpointSSE // 待处理的更新 key: instanceID

	// 批量插入相关
	batchInsertCh   chan models.EndpointSSE // 批量插入通道
	batchInsertMu   sync.Mutex              // 批量插入锁
	batchInsertBuf  []models.EndpointSSE    // 批量插入缓冲区
	batchInsertSize int                     // 批量插入大小

	// 事件缓存
	eventCache     map[int64][]models.EndpointSSE // 端点事件缓存
	eventCacheMu   sync.RWMutex
	maxCacheEvents int

	// 健康检查
	healthCheckInterval time.Duration
	lastEventTime       map[int64]time.Time
	lastEventMu         sync.RWMutex

	// 日志清理配置（仅针对数据库中的非日志事件）
	logRetentionDays    int           // 日志保留天数
	logCleanupInterval  time.Duration // 清理间隔
	maxLogRecordsPerDay int           // 每天最大日志记录数
	enableLogCleanup    bool          // 是否启用日志清理

	// 文件日志管理器
	fileLogger *log.FileLogger // 文件日志管理器

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
}

// NewService 创建SSE服务实例
func NewService(db *gorm.DB, endpointService *endpoint.Service) *Service {
	ctx, cancel := context.WithCancel(context.Background())

	// 创建日志目录路径
	logDir := filepath.Join("logs")

	s := &Service{
		clients:             make(map[string]*Client),
		tunnelSubs:          make(map[string]map[string]*Client),
		db:                  db,
		endpointService:     endpointService,
		storeJobCh:          make(chan models.EndpointSSE, 5000), // 增加缓冲大小到5000
		batchUpdateCh:       make(chan models.EndpointSSE, 100),  // 批量更新通道
		batchTimer:          time.NewTimer(1 * time.Second),      // 批处理定时器
		pendingUpdates:      make(map[string]models.EndpointSSE), // 待处理的更新 key: instanceID
		batchInsertCh:       make(chan models.EndpointSSE, 100),  // 批量插入通道
		batchInsertMu:       sync.Mutex{},                        // 批量插入锁
		batchInsertBuf:      make([]models.EndpointSSE, 0),       // 批量插入缓冲区
		batchInsertSize:     100,                                 // 批量插入大小
		eventCache:          make(map[int64][]models.EndpointSSE),
		maxCacheEvents:      100,
		healthCheckInterval: 30 * time.Second,
		lastEventTime:       make(map[int64]time.Time),
		// 日志清理配置 - 默认保留7天日志，每24小时清理一次，每天最多10000条日志
		logRetentionDays:    7,
		logCleanupInterval:  24 * time.Hour,
		maxLogRecordsPerDay: 10000,
		enableLogCleanup:    true,
		// 初始化文件日志管理器
		fileLogger: log.NewFileLogger(logDir),
		ctx:        ctx,
		cancel:     cancel,
	}

	// 启动异步持久化 worker，增加到 4 个worker以提高处理能力
	s.StartStoreWorkers(4)

	// 启动批处理 worker
	go s.startBatchProcessor()

	// 启动批量插入 worker
	go s.startBatchInsertProcessor()

	// 启动日志清理守护协程
	if s.enableLogCleanup {
		go s.startLogCleanupDaemon()
	}

	return s
}

// SetManager 设置Manager引用（避免循环依赖）
func (s *Service) SetManager(manager *Manager) {
	s.manager = manager
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

	// 安全地移除客户端，将Writer设为nil防止后续误用
	if client, exists := s.clients[clientID]; exists {
		client.Writer = nil
	}
	delete(s.clients, clientID)

	// 记录日志
	// log.Infof("SSE客户端已移除,clientID=%s remaining=%d", clientID, len(s.clients))

	// 清理隧道订阅
	for tunnelID, subs := range s.tunnelSubs {
		if client, exists := subs[clientID]; exists {
			client.Writer = nil
		}
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

// processEventImmediate 立即处理事件（同步处理）
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
		// log.Debugf("[Master-%d#SSE]处理log事件，准备推送给前端，instanceID=%s", endpointID, event.InstanceID)
	}

	// 更新最后事件时间
	s.updateLastEventTime(endpointID)

	// 推流转发给前端订阅
	if event.EventType != models.SSEEventTypeInitial {
		if event.InstanceID != "" {
			// log.Debugf("[Master-%d#SSE]准备推送事件给前端，eventType=%s instanceID=%s", endpointID, event.EventType, event.InstanceID)
			s.sendTunnelUpdateByInstanceId(event.InstanceID, event)
		}
		return nil
	}

	return nil
}

// handleShutdownEvent 处理关闭事件
func (s *Service) handleShutdownEvent(event models.EndpointSSE) {
	// 更新端点状态为离线
	s.updateEndpointStatus(event.EndpointID, models.EndpointStatusOffline)
}

// updateEndpointStatus 更新端点状态
func (s *Service) updateEndpointStatus(endpointID int64, status models.EndpointStatus) {
	// 使用GORM更新端点状态
	err := s.db.Model(&models.Endpoint{}).
		Where("id = ?", endpointID).
		Updates(map[string]interface{}{
			"status":     status,
			"last_check": time.Now(),
			"updated_at": time.Now(),
		}).Error

	if err != nil {
		log.Errorf("[Master-%d#SSE]更新端点状态失败: %v", endpointID, err)
		return
	}

	log.Infof("[Master-%d]端点状态已更新为: %s", endpointID, status)

	// 如果端点状态变为离线，设置所有相关隧道为离线状态
	if status == models.EndpointStatusOffline {
		if err := s.setTunnelsOfflineForEndpoint(endpointID); err != nil {
			log.Errorf("[Master-%d]设置隧道离线状态失败: %v", endpointID, err)
		}
	}

	// 通知Manager状态变化
	if s.manager != nil {
		s.manager.NotifyEndpointStatusChanged(endpointID, string(status))
	}
}

// setTunnelsOfflineForEndpoint 将端点的所有隧道设置为离线状态
func (s *Service) setTunnelsOfflineForEndpoint(endpointID int64) error {
	// 使用GORM批量更新隧道状态
	result := s.db.Model(&models.Tunnel{}).
		Where("endpoint_id = ?", endpointID).
		Updates(map[string]interface{}{
			"status":          models.TunnelStatusOffline,
			"updated_at":      time.Now(),
			"last_event_time": time.Now(),
		})

	if result.Error != nil {
		return result.Error
	}

	log.Infof("[Master-%d]已将%d个隧道设置为离线状态", endpointID, result.RowsAffected)
	return nil
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
	// 对于日志类型事件，写入文件而不是数据库
	if event.EventType == models.SSEEventTypeLog {
		// 写入文件日志
		logContent := ""
		if event.Logs != nil {
			logContent = *event.Logs
		}

		if err := s.fileLogger.WriteLog(event.EndpointID, event.InstanceID, logContent); err != nil {
			log.Warnf("[Master-%d]写入文件日志失败: %v", event.EndpointID, err)
			return err
		}

		// 更新事件缓存（仍然保留在内存中供实时推送）
		s.updateEventCache(event)
		return nil
	}

	// 非日志事件使用批量插入
	select {
	case s.batchInsertCh <- event:
		// 成功投递到批量插入队列
		log.Debugf("[Master-%d]事件已投递到批量插入队列", event.EndpointID)
	default:
		// 批量插入队列满，回退到单条插入
		log.Warnf("[Master-%d]批量插入队列已满，使用单条插入", event.EndpointID)
		return s.singleInsertEvent(event)
	}

	// 更新事件缓存
	s.updateEventCache(event)
	return nil
}

// singleInsertEvent 单条插入事件（回退方案）
func (s *Service) singleInsertEvent(event models.EndpointSSE) error {
	// 使用GORM插入事件，添加超时控制
	done := make(chan error, 1)
	go func() {
		done <- s.db.Create(&event).Error
	}()

	// 设置5秒超时
	select {
	case err := <-done:
		if err != nil {
			log.Warnf("[Master-%d]数据库插入事件失败: %v", event.EndpointID, err)
			return err
		}
	case <-time.After(5 * time.Second):
		log.Warnf("[Master-%d]数据库插入事件超时", event.EndpointID)
		return fmt.Errorf("数据库插入超时")
	}

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
		if client.Writer == nil {
			continue
		}
		fmt.Fprint(client.Writer, message)
		if f, ok := client.Writer.(http.Flusher); ok {
			f.Flush()
		}
	}

	// 如果是隧道相关事件，发送到订阅者
	if event.InstanceID != "" {
		if subs, exists := s.tunnelSubs[event.InstanceID]; exists {
			for _, client := range subs {
				if client.Writer == nil {
					continue
				}
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

// GetFileLogger 获取文件日志管理器
func (s *Service) GetFileLogger() *log.FileLogger {
	return s.fileLogger
}

// GetDB 获取数据库连接
func (s *Service) GetDB() *gorm.DB {
	return s.db
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

	// 关闭文件日志管理器
	if s.fileLogger != nil {
		s.fileLogger.Close()
	}

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
		if client.Writer == nil {
			failedIDs = append(failedIDs, id)
			continue
		}
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
		if client.Writer == nil {
			failedIDs = append(failedIDs, id)
			continue
		}
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
	// 使用GORM的Transaction方法
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 判断隧道是否存在（endpointId + instanceId 唯一）
		var tunnel models.Tunnel
		if err := tx.Where("endpoint_id = ? AND instance_id = ?", event.EndpointID, event.InstanceID).First(&tunnel).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
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

						newTunnel := models.Tunnel{
							EndpointID:    event.EndpointID,
							Name:          event.InstanceID, // 使用 instanceID 作为名称
							Mode:          models.TunnelMode(*event.InstanceType),
							Status:        models.TunnelStatus(ptrStringDefault(event.Status, "stopped")),
							TunnelAddress: tunnelAddr,
							TunnelPort:    tunnelPort,
							TargetAddress: targetAddr,
							TargetPort:    targetPort,
							TLSMode:       models.TLSMode(tlsMode),
							LogLevel:      models.LogLevel(logLevel),
							CommandLine:   commandLine,
						}

						// 处理可选字段
						newTunnel.InstanceID = &event.InstanceID
						if cfg.CertPath != "" {
							newTunnel.CertPath = &cfg.CertPath
						}
						if cfg.KeyPath != "" {
							newTunnel.KeyPath = &cfg.KeyPath
						}
						if cfg.Password != "" {
							newTunnel.Password = &cfg.Password
						}

						// 处理Min/Max字段
						if cfg.Min != "" {
							if minVal, err := strconv.ParseInt(cfg.Min, 10, 64); err == nil {
								newTunnel.Min = &minVal
							}
						}
						if cfg.Max != "" {
							if maxVal, err := strconv.ParseInt(cfg.Max, 10, 64); err == nil {
								newTunnel.Max = &maxVal
							}
						}

						// 处理其他字段
						newTunnel.TCPRx = event.TCPRx
						newTunnel.TCPTx = event.TCPTx
						newTunnel.UDPRx = event.UDPRx
						newTunnel.UDPTx = event.UDPTx
						newTunnel.Pool = event.Pool
						newTunnel.Ping = event.Ping
						if event.Restart != nil {
							newTunnel.Restart = *event.Restart
						} else {
							newTunnel.Restart = false
						}
						newTunnel.CreatedAt = time.Now()
						newTunnel.UpdatedAt = time.Now()
						newTunnel.LastEventTime = &event.EventTime

						if event.Alias != nil && *event.Alias != "" {
							newTunnel.Name = *event.Alias
							log.Infof("[Inst.%s]Inst.%s使用别名作为隧道名称: %s", event.InstanceID, event.InstanceID, newTunnel.Name)
						}

						if err := tx.Create(&newTunnel).Error; err != nil {
							log.Errorf("[Inst.%s]插入隧道记录失败,err=%v", event.InstanceID, err)
							return err
						}
						log.Infof("[Inst.%s]隧道记录已插入", event.InstanceID)
					}
				}
			} else {
				// 获取状态值
				statusVal := ""
				if event.Status != nil {
					statusVal = *event.Status
				}

				// 读取当前状态以判断是否需要更新
				var currentStatus string
				if err := tx.Model(&models.Tunnel{}).Where("id = ?", tunnel.ID).Select("status").Scan(&currentStatus).Error; err != nil {
					log.Warnf("[Inst.%s]查询当前隧道状态失败,err=%v", event.InstanceID, err)
				}

				if statusVal != "" && statusVal == currentStatus {
					// 状态一致，无需更新
					log.Debugf("[Inst.%s]隧道状态未变化，跳过更新,status=%s", event.InstanceID, currentStatus)
				} else {
					log.Infof("[Inst.%s]sse推送更新隧道实例,oldStatus=%s newStatus=%s", event.InstanceID, currentStatus, statusVal)

					// 如果是 delete 事件，直接删除记录
					if event.EventType == models.SSEEventTypeDelete {
						if err := tx.Delete(&models.Tunnel{}, "endpoint_id = ? AND instance_id = ?", event.EndpointID, event.InstanceID).Error; err != nil {
							log.Warnf("[Inst.%s]删除隧道记录失败,err=%v", event.InstanceID, err)
						} else {
							log.Infof("[Inst.%s]已删除隧道记录", event.InstanceID)
						}
					} else {
						// 更新已有隧道
						updateFields := map[string]interface{}{
							"tcp_rx":          event.TCPRx,
							"tcp_tx":          event.TCPTx,
							"udp_rx":          event.UDPRx,
							"udp_tx":          event.UDPTx,
							"pool":            event.Pool,
							"ping":            event.Ping,
							"last_event_time": &event.EventTime,
							"updated_at":      time.Now(),
						}

						// 只有状态不为空时才更新状态
						if statusVal != "" {
							updateFields["status"] = models.TunnelStatus(statusVal)
						}

						if err := tx.Model(&models.Tunnel{}).Where("instance_id = ?", event.InstanceID).Updates(updateFields).Error; err != nil {
							log.Errorf("[Inst.%s]更新隧道记录失败,err=%v", event.InstanceID, err)
							return err
						}
					}
				}
			}
		} else {
			log.Errorf("[Inst.%s]查询隧道记录失败,err=%v", event.InstanceID, err)
			return err
		}

		// 延迟更新端点隧道计数（避免死锁）
		log.Debugf("[Master-%d]隧道数据更新完成，将异步刷新端点计数", event.EndpointID)

		return nil
	})

	if err != nil {
		log.Errorf("[Inst.%s]更新隧道数据失败: %v", event.InstanceID, err)
	} else {
		// 异步更新端点隧道计数（避免死锁）
		go func(endpointID int64) {
			time.Sleep(50 * time.Millisecond) // 稍作延迟
			s.updateEndpointTunnelCount(endpointID)
		}(event.EndpointID)
	}
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
	Password      string
	Min           string
	Max           string
}

// 内部工具函数: 解析地址:端口 (兼容 IPv6 字面量)
func parsePart(part string) (addr, port string) {
	part = strings.TrimSpace(part)
	if part == "" {
		return "", ""
	}

	// 处理方括号包围的IPv6地址格式：[IPv6]:port
	if strings.HasPrefix(part, "[") {
		if end := strings.Index(part, "]"); end != -1 {
			addr = part[:end+1]
			if len(part) > end+1 && part[end+1] == ':' {
				port = part[end+2:]
			}
			return
		}
	}

	// 检查是否包含冒号
	if strings.Contains(part, ":") {
		// 判断是否为IPv6地址（包含多个冒号或双冒号）
		colonCount := strings.Count(part, ":")
		if colonCount > 1 || strings.Contains(part, "::") {
			// 可能是IPv6地址，尝试从右侧找最后一个冒号作为端口分隔符
			lastColonIdx := strings.LastIndex(part, ":")
			// 检查最后一个冒号后面是否为纯数字（端口号）
			if lastColonIdx != -1 && lastColonIdx < len(part)-1 {
				potentialPort := part[lastColonIdx+1:]
				if portNum, err := strconv.Atoi(potentialPort); err == nil && portNum > 0 && portNum <= 65535 {
					// 最后部分是有效的端口号
					addr = part[:lastColonIdx]
					port = potentialPort
					return
				}
			}
			// 没有找到有效端口，整个部分都是地址
			addr = part
			return
		} else {
			// 只有一个冒号，按照传统方式分割
			pieces := strings.SplitN(part, ":", 2)
			addr, port = pieces[0], pieces[1]
		}
	} else {
		// 没有冒号，判断是纯数字端口还是地址
		if _, err := strconv.Atoi(part); err == nil {
			port = part
		} else {
			addr = part
		}
	}
	return
}

func parseInstanceURL(raw, mode string) parsedURL {
	// 默认值
	res := parsedURL{
		TLSMode:  "inherit",
		LogLevel: "inherit",
		CertPath: "",
		KeyPath:  "",
		Password: "",
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

	// 分离用户认证信息 (password@)
	if atIdx := strings.Index(raw, "@"); atIdx != -1 {
		res.Password = raw[:atIdx]
		raw = raw[atIdx+1:]
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

	// hostPart
	if hostPart != "" {
		addr, port := parsePart(hostPart)
		res.TunnelAddress = addr
		res.TunnelPort = port
	}

	// pathPart
	if pathPart != "" {
		addr, port := parsePart(pathPart)
		res.TargetAddress = addr
		res.TargetPort = port
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
				// URL解码证书路径
				if decodedVal, err := url.QueryUnescape(val); err == nil {
					res.CertPath = decodedVal
				} else {
					res.CertPath = val // 解码失败时使用原值
				}
			case "key":
				// URL解码密钥路径
				if decodedVal, err := url.QueryUnescape(val); err == nil {
					res.KeyPath = decodedVal
				} else {
					res.KeyPath = val // 解码失败时使用原值
				}
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
		// 当InstanceType为空时，尝试获取端点系统信息
		go s.fetchAndUpdateEndpointInfo(e.EndpointID)
		return
	}
	cfg := parseInstanceURL(ptrString(e.URL), *e.InstanceType)
	if err := s.withTx(func(tx *gorm.DB) error { return s.tunnelCreateOrUpdate(tx, e, cfg) }); err != nil {
	}
}

func (s *Service) handleCreateEvent(e models.EndpointSSE) {
	cfg := parseInstanceURL(ptrString(e.URL), *e.InstanceType)
	if err := s.withTx(func(tx *gorm.DB) error { return s.tunnelCreate(tx, e, cfg) }); err != nil {
		log.Errorf("[Master-%d#SSE]处理创建事件失败: %v", e.EndpointID, err)
	} else {
		// 异步更新端点隧道计数
		go func(endpointID int64) {
			time.Sleep(50 * time.Millisecond)
			s.updateEndpointTunnelCount(endpointID)
		}(e.EndpointID)
	}
}

func (s *Service) handleUpdateEvent(e models.EndpointSSE) {
	if err := s.withTx(func(tx *gorm.DB) error {
		cfg := parseInstanceURL(ptrString(e.URL), ptrStringDefault(e.InstanceType, ""))
		return s.tunnelUpdate(tx, e, cfg)
	}); err != nil {
	}
}

func (s *Service) handleDeleteEvent(e models.EndpointSSE) {
	if err := s.withTx(func(tx *gorm.DB) error { return s.tunnelDelete(tx, e.EndpointID, e.InstanceID) }); err != nil {
		log.Errorf("[Master-%d#SSE]处理删除事件失败: %v", e.EndpointID, err)
	} else {
		// 异步更新端点隧道计数
		go func(endpointID int64) {
			time.Sleep(50 * time.Millisecond)
			s.updateEndpointTunnelCount(endpointID)
		}(e.EndpointID)
	}
}

func (s *Service) handleLogEvent(e models.EndpointSSE) {
	// log.Debug("处理 log 事件", "instanceID", e.InstanceID)

}

// =============== 隧道 CRUD ===============

func (s *Service) tunnelExists(tx *gorm.DB, endpointID int64, instanceID string) (bool, error) {
	var tunnel models.Tunnel
	err := tx.Where("endpoint_id = ? AND instance_id = ?", endpointID, instanceID).First(&tunnel).Error
	if err == nil {
		return true, nil
	}
	if err == gorm.ErrRecordNotFound {
		return false, nil
	}
	return false, err
}

func (s *Service) tunnelCreate(tx *gorm.DB, e models.EndpointSSE, cfg parsedURL) error {
	exists, err := s.tunnelExists(tx, e.EndpointID, e.InstanceID)
	if err != nil || exists {
		log.Warnf("[Master-%d#SSE]Inst.%s已存在记录，跳过创建", e.EndpointID, e.InstanceID)
		return err
	}

	// 如果 SSE 事件包含 alias，使用 alias 作为隧道名称，否则使用 instanceID
	name := e.InstanceID
	if e.Alias != nil && *e.Alias != "" {
		name = *e.Alias
		log.Infof("[Master-%d#SSE]Inst.%s使用别名作为隧道名称: %s", e.EndpointID, e.InstanceID, name)
	}

	if cfg.LogLevel == "" {
		cfg.LogLevel = "inherit"
	}
	if e.InstanceType != nil && *e.InstanceType == "server" {
		if cfg.TLSMode == "" {
			cfg.TLSMode = "inherit"
		}
	}

	// 处理重启策略字段
	restart := false // 默认值为 false
	if e.Restart != nil {
		restart = *e.Restart
		log.Infof("[Master-%d#SSE]Inst.%s创建隧道时设置重启策略: %t", e.EndpointID, e.InstanceID, restart)
	}

	// 处理可能为 nil 的字段
	poolValue := e.Pool
	pingValue := e.Ping

	newTunnel := models.Tunnel{
		EndpointID:    e.EndpointID,
		Name:          name,
		Mode:          models.TunnelMode(*e.InstanceType),
		Status:        models.TunnelStatus(ptrStringDefault(e.Status, "stopped")),
		TunnelAddress: cfg.TunnelAddress,
		TunnelPort:    cfg.TunnelPort,
		TargetAddress: cfg.TargetAddress,
		TargetPort:    cfg.TargetPort,
		TLSMode:       models.TLSMode(cfg.TLSMode),
		LogLevel:      models.LogLevel(cfg.LogLevel),
		CommandLine:   *e.URL,
	}

	// 处理可选字段
	newTunnel.InstanceID = &e.InstanceID
	if cfg.CertPath != "" {
		newTunnel.CertPath = &cfg.CertPath
	}
	if cfg.KeyPath != "" {
		newTunnel.KeyPath = &cfg.KeyPath
	}
	if cfg.Password != "" {
		newTunnel.Password = &cfg.Password
	}

	// 处理Min/Max字段
	if cfg.Min != "" {
		if minVal, err := strconv.ParseInt(cfg.Min, 10, 64); err == nil {
			newTunnel.Min = &minVal
		}
	}
	if cfg.Max != "" {
		if maxVal, err := strconv.ParseInt(cfg.Max, 10, 64); err == nil {
			newTunnel.Max = &maxVal
		}
	}

	// 处理其他字段
	newTunnel.TCPRx = e.TCPRx
	newTunnel.TCPTx = e.TCPTx
	newTunnel.UDPRx = e.UDPRx
	newTunnel.UDPTx = e.UDPTx
	newTunnel.Pool = poolValue
	newTunnel.Ping = pingValue
	newTunnel.Restart = restart
	newTunnel.CreatedAt = time.Now()
	newTunnel.UpdatedAt = time.Now()
	newTunnel.LastEventTime = &e.EventTime

	if e.Alias != nil && *e.Alias != "" {
		newTunnel.Name = *e.Alias
		log.Infof("[Master-%d#SSE]Inst.%s使用别名作为隧道名称: %s", e.EndpointID, e.InstanceID, newTunnel.Name)
	}

	if err := tx.Create(&newTunnel).Error; err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s创建隧道失败,err=%v", e.EndpointID, e.InstanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s创建隧道成功", e.EndpointID, e.InstanceID)

	// 更新端点隧道计数
	// 移除同步隧道计数更新，改为异步处理避免死锁
	log.Infof("[Master-%d#SSE]隧道创建完成，将异步更新端点计数", e.EndpointID)
	return err
}

func (s *Service) tunnelUpdate(tx *gorm.DB, e models.EndpointSSE, cfg parsedURL) error {
	// 查询当前隧道记录
	var currentTunnel models.Tunnel
	err := tx.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&currentTunnel).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Infof("[Master-%d#SSE]Inst.%s不存在，跳过更新", e.EndpointID, e.InstanceID)
			return nil // 尚未创建对应记录，等待后续 create/initial
		}
		return err // 查询错误
	}

	// 提取当前值
	curStatus := string(currentTunnel.Status)
	curTCPRx := currentTunnel.TCPRx
	curTCPTx := currentTunnel.TCPTx
	curUDPRx := currentTunnel.UDPRx
	curUDPTx := currentTunnel.UDPTx
	var curEventTime time.Time
	if currentTunnel.LastEventTime != nil {
		curEventTime = *currentTunnel.LastEventTime
	}
	curName := currentTunnel.Name
	curRestart := currentTunnel.Restart
	curMode := string(currentTunnel.Mode)

	newStatus := ptrStringDefault(e.Status, curStatus)

	statusChanged := newStatus != curStatus
	trafficChanged := curTCPRx != e.TCPRx || curTCPTx != e.TCPTx || curUDPRx != e.UDPRx || curUDPTx != e.UDPTx

	// 检查别名是否变化
	aliasChanged := false
	newName := curName
	if e.Alias != nil && *e.Alias != "" && *e.Alias != curName {
		aliasChanged = true
		newName = *e.Alias
		log.Infof("[Master-%d#SSE]Inst.%s别名变化: %s -> %s", e.EndpointID, e.InstanceID, curName, newName)
	}

	// 检查重启策略是否变化
	restartChanged := false
	newRestart := curRestart
	if e.Restart != nil && *e.Restart != curRestart {
		restartChanged = true
		newRestart = *e.Restart
		log.Infof("[Master-%d#SSE]Inst.%s重启策略变化: %t -> %t", e.EndpointID, e.InstanceID, curRestart, newRestart)
	}

	// 计算新的模式
	newMode := ptrStringDefault(e.InstanceType, curMode)
	modeChanged := newMode != curMode // 仅用于调试
	_ = modeChanged

	// 避免未使用编译错误
	_ = statusChanged
	_ = trafficChanged
	_ = aliasChanged
	_ = restartChanged

	// 若事件时间早于已记录时间，跳过更新
	if curEventTime.After(e.EventTime) {
		log.Infof("[Master-%d#SSE]Inst.%s旧事件时间，跳过更新", e.EndpointID, e.InstanceID)
		return nil
	}

	// 写入所有可更新字段
	minVal := func() interface{} {
		if cfg.Min != "" {
			return cfg.Min
		}
		return nil
	}()
	maxVal := func() interface{} {
		if cfg.Max != "" {
			return cfg.Max
		}
		return nil
	}()

	// 处理可能为 nil 的字段
	poolValue := e.Pool
	pingValue := e.Ping

	if err := tx.Model(&models.Tunnel{}).Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).Updates(map[string]interface{}{
		"status":          newStatus,
		"tcp_rx":          e.TCPRx,
		"tcp_tx":          e.TCPTx,
		"udp_rx":          e.UDPRx,
		"udp_tx":          e.UDPTx,
		"pool":            poolValue,
		"ping":            pingValue,
		"name":            newName,
		"mode":            newMode,
		"restart":         newRestart,
		"tunnel_address":  cfg.TunnelAddress,
		"tunnel_port":     cfg.TunnelPort,
		"target_address":  cfg.TargetAddress,
		"target_port":     cfg.TargetPort,
		"tls_mode":        cfg.TLSMode,
		"cert_path":       cfg.CertPath,
		"key_path":        cfg.KeyPath,
		"log_level":       cfg.LogLevel,
		"command_line":    *e.URL,
		"password":        cfg.Password,
		"min":             minVal,
		"max":             maxVal,
		"last_event_time": e.EventTime,
		"updated_at":      time.Now(),
	}).Error; err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s更新隧道失败,err=%v", e.EndpointID, e.InstanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s更新隧道成功", e.EndpointID, e.InstanceID)
	return err
}

func (s *Service) tunnelDelete(tx *gorm.DB, endpointID int64, instanceID string) error {
	exists, err := s.tunnelExists(tx, endpointID, instanceID)
	if err != nil {
		return err
	}
	if !exists {
		log.Debugf("[Master-%d#SSE]Inst.%s不存在，跳过删除", endpointID, instanceID)
		return nil // 无需删除
	}

	if err := tx.Delete(&models.Tunnel{}, "endpoint_id = ? AND instance_id = ?", endpointID, instanceID).Error; err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s删除隧道失败,err=%v", endpointID, instanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s删除隧道成功，将异步更新端点计数", endpointID, instanceID)

	// 移除同步隧道计数更新，改为异步处理避免死锁
	return nil
}

// tunnelCreateOrUpdate 根据隧道是否存在来决定创建或更新
func (s *Service) tunnelCreateOrUpdate(tx *gorm.DB, e models.EndpointSSE, cfg parsedURL) error {
	exists, err := s.tunnelExists(tx, e.EndpointID, e.InstanceID)
	if err != nil {
		return err
	}

	if exists {
		log.Infof("[Master-%d#SSE]Inst.%s已存在，执行更新操作", e.EndpointID, e.InstanceID)
		return s.tunnelUpdate(tx, e, cfg)
	} else {
		log.Infof("[Master-%d#SSE]Inst.%s不存在，执行创建操作", e.EndpointID, e.InstanceID)
		// 直接执行创建逻辑（从tunnelCreate复制，但跳过存在性检查）

		// 如果 SSE 事件包含 alias，使用 alias 作为隧道名称，否则使用 instanceID
		name := e.InstanceID
		if e.Alias != nil && *e.Alias != "" {
			name = *e.Alias
			log.Infof("[Master-%d#SSE]Inst.%s使用别名作为隧道名称: %s", e.EndpointID, e.InstanceID, name)
		}

		if cfg.LogLevel == "" {
			cfg.LogLevel = "inherit"
		}
		if e.InstanceType != nil && *e.InstanceType == "server" {
			if cfg.TLSMode == "" {
				cfg.TLSMode = "inherit"
			}
		}

		// 处理重启策略字段
		restart := false // 默认值为 false
		if e.Restart != nil {
			restart = *e.Restart
			log.Infof("[Master-%d#SSE]Inst.%s创建隧道时设置重启策略: %t", e.EndpointID, e.InstanceID, restart)
		}

		// 处理可能为 nil 的字段
		poolValue := e.Pool
		pingValue := e.Ping

		newTunnel := models.Tunnel{
			EndpointID:    e.EndpointID,
			Name:          name,
			Mode:          models.TunnelMode(*e.InstanceType),
			Status:        models.TunnelStatus(ptrStringDefault(e.Status, "stopped")),
			TunnelAddress: cfg.TunnelAddress,
			TunnelPort:    cfg.TunnelPort,
			TargetAddress: cfg.TargetAddress,
			TargetPort:    cfg.TargetPort,
			TLSMode:       models.TLSMode(cfg.TLSMode),
			LogLevel:      models.LogLevel(cfg.LogLevel),
			CommandLine:   *e.URL,
		}

		// 处理可选字段
		newTunnel.InstanceID = &e.InstanceID
		if cfg.CertPath != "" {
			newTunnel.CertPath = &cfg.CertPath
		}
		if cfg.KeyPath != "" {
			newTunnel.KeyPath = &cfg.KeyPath
		}
		if cfg.Password != "" {
			newTunnel.Password = &cfg.Password
		}

		// 处理Min/Max字段
		if cfg.Min != "" {
			if minVal, err := strconv.ParseInt(cfg.Min, 10, 64); err == nil {
				newTunnel.Min = &minVal
			}
		}
		if cfg.Max != "" {
			if maxVal, err := strconv.ParseInt(cfg.Max, 10, 64); err == nil {
				newTunnel.Max = &maxVal
			}
		}

		// 处理其他字段
		newTunnel.TCPRx = e.TCPRx
		newTunnel.TCPTx = e.TCPTx
		newTunnel.UDPRx = e.UDPRx
		newTunnel.UDPTx = e.UDPTx
		newTunnel.Pool = poolValue
		newTunnel.Ping = pingValue
		newTunnel.Restart = restart
		newTunnel.CreatedAt = time.Now()
		newTunnel.UpdatedAt = time.Now()
		newTunnel.LastEventTime = &e.EventTime

		if e.Alias != nil && *e.Alias != "" {
			newTunnel.Name = *e.Alias
			log.Infof("[Master-%d#SSE]Inst.%s使用别名作为隧道名称: %s", e.EndpointID, e.InstanceID, newTunnel.Name)
		}

		if err := tx.Create(&newTunnel).Error; err != nil {
			log.Errorf("[Master-%d#SSE]Inst.%s创建隧道失败,err=%v", e.EndpointID, e.InstanceID, err)
			return err
		}
		log.Infof("[Master-%d#SSE]Inst.%s创建隧道成功，将异步更新端点计数", e.EndpointID, e.InstanceID)

		// 移除同步隧道计数更新，改为异步处理避免死锁
		return err
	}
}

func (s *Service) withTx(fn func(*gorm.DB) error) error {
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
	// 收集需要更新隧道计数的端点ID
	endpointIDs := make(map[int64]bool)
	for _, event := range events {
		endpointIDs[event.EndpointID] = true
	}

	err := db.TxWithRetry(func(tx *gorm.DB) error {
		for _, event := range events {
			if err := s.processSingleEventInTx(tx, event); err != nil {
				log.Warnf("[Master-%d#SSE]Inst.%s批量处理失败: %v", event.EndpointID, event.InstanceID, err)
				// 继续处理其他事件，不中断整个批次
			}
		}
		return nil
	})

	// 如果事务成功，异步更新所有涉及端点的隧道计数
	if err == nil {
		for endpointID := range endpointIDs {
			go func(id int64) {
				time.Sleep(50 * time.Millisecond)
				s.updateEndpointTunnelCount(id)
			}(endpointID)
		}
	}

	return err
}

// processSingleEventInTx 在事务中处理单个事件
func (s *Service) processSingleEventInTx(tx *gorm.DB, event models.EndpointSSE) error {
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

// fetchAndUpdateEndpointInfo 获取并更新端点系统信息
func (s *Service) fetchAndUpdateEndpointInfo(endpointID int64) {
	// 获取端点信息
	ep, err := s.endpointService.GetEndpointByID(endpointID)
	if err != nil {
		log.Errorf("[Master-%d] 获取端点信息失败: %v", endpointID, err)
		return
	}

	// 创建NodePass客户端
	client := nodepass.NewClient(ep.URL, ep.APIPath, ep.APIKey, nil)

	// 尝试获取系统信息 (处理低版本API不存在的情况)
	var info *nodepass.NodePassInfo
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Warnf("[Master-%d] 获取系统信息失败(可能为低版本): %v", endpointID, r)
			}
		}()

		info, err = client.GetInfo()
		if err != nil {
			log.Warnf("[Master-%d] 获取系统信息失败: %v", endpointID, err)
			// 不返回错误，继续处理
		}
	}()

	// 如果成功获取到信息，更新数据库
	if info != nil && err == nil {
		epInfo := endpoint.NodePassInfo{
			OS:     info.OS,
			Arch:   info.Arch,
			Ver:    info.Ver,
			Name:   info.Name,
			Log:    info.Log,
			TLS:    info.TLS,
			Crt:    info.Crt,
			Key:    info.Key,
			Uptime: info.Uptime, // 直接传递指针，service层会处理nil情况
		}
		if updateErr := s.endpointService.UpdateEndpointInfo(endpointID, epInfo); updateErr != nil {
			log.Errorf("[Master-%d] 更新系统信息失败: %v", endpointID, updateErr)
		} else {
			// 在日志中显示uptime信息（如果可用）
			uptimeMsg := "未知"
			if info.Uptime != nil {
				uptimeMsg = fmt.Sprintf("%d秒", *info.Uptime)
			}
			log.Infof("[Master-%d] 系统信息已更新: OS=%s, Arch=%s, Ver=%s, Uptime=%s", endpointID, info.OS, info.Arch, info.Ver, uptimeMsg)
		}
	}
}

// BroadcastToAll 广播事件到所有客户端（用于系统更新等全局消息）
func (s *Service) BroadcastToAll(event Event) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Warn("序列化事件失败", "err", err)
		return
	}

	message := fmt.Sprintf("data: %s\n\n", eventJSON)

	for _, client := range s.clients {
		if client.Writer == nil {
			continue
		}
		fmt.Fprint(client.Writer, message)
		if f, ok := client.Writer.(http.Flusher); ok {
			f.Flush()
		}
	}
}

// ==================== 日志清理相关方法 ====================

// startLogCleanupDaemon 启动日志清理守护协程
func (s *Service) startLogCleanupDaemon() {
	log.Infof("启动日志清理守护协程，保留%d天日志，每%v清理一次", s.logRetentionDays, s.logCleanupInterval)

	ticker := time.NewTicker(s.logCleanupInterval)
	defer ticker.Stop()

	// 立即执行一次清理
	s.cleanupOldLogs()

	for {
		select {
		case <-s.ctx.Done():
			log.Info("日志清理守护协程已停止")
			return
		case <-ticker.C:
			s.cleanupOldLogs()
		}
	}
}

// cleanupOldLogs 清理过期日志
func (s *Service) cleanupOldLogs() {
	startTime := time.Now()

	// 计算保留截止时间
	cutoffTime := time.Now().AddDate(0, 0, -s.logRetentionDays)

	// 1. 清理数据库中的非日志事件（基于时间）
	deletedRows, err := s.cleanupNonLogEventsByTime(cutoffTime)
	if err != nil {
		log.Errorf("按时间清理数据库事件失败: %v", err)
		return
	}

	// 2. 如果设置了每日最大记录数，则进行数量限制清理（仅针对数据库事件）
	if s.maxLogRecordsPerDay > 0 {
		limitDeletedRows, err := s.cleanupNonLogEventsByCount()
		if err != nil {
			log.Errorf("按数量清理数据库事件失败: %v", err)
		} else {
			deletedRows += limitDeletedRows
		}
	}

	// 3. 执行VACUUM以回收空间
	s.vacuumDatabase()

	duration := time.Since(startTime)
	if deletedRows > 0 {
		log.Infof("数据库事件清理完成，删除了%d条非日志记录，耗时%v", deletedRows, duration)
	} else {
		log.Debugf("数据库事件清理完成，无记录需要删除，耗时%v", duration)
	}

	// 注意：文件日志清理需通过手动触发或由fileLogger自动管理
}

// cleanupNonLogEventsByTime 按时间清理数据库中的非日志事件
func (s *Service) cleanupNonLogEventsByTime(cutoffTime time.Time) (int64, error) {
	result := s.db.Where("event_type != ? AND created_at < ?", models.SSEEventTypeLog, cutoffTime).Delete(&models.EndpointSSE{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

// cleanupNonLogEventsByCount 按数量清理数据库中的非日志事件（保留每个端点最多N条事件）
func (s *Service) cleanupNonLogEventsByCount() (int64, error) {
	// 获取所有端点ID
	rows, err := s.db.Model(&models.EndpointSSE{}).Where("event_type != ?", models.SSEEventTypeLog).Select("DISTINCT endpoint_id").Rows()
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	var totalDeleted int64

	for rows.Next() {
		var endpointID int64
		if err := rows.Scan(&endpointID); err != nil {
			continue
		}

		// 为每个端点清理超出限制的非日志事件
		deleted, err := s.cleanupNonLogEventsByCountForEndpoint(endpointID)
		if err != nil {
			log.Warnf("清理端点%d的非日志事件失败: %v", endpointID, err)
			continue
		}
		totalDeleted += deleted
	}

	return totalDeleted, nil
}

// cleanupNonLogEventsByCountForEndpoint 为特定端点清理超出数量限制的非日志事件
func (s *Service) cleanupNonLogEventsByCountForEndpoint(endpointID int64) (int64, error) {
	// 删除超出每天最大记录数的非日志事件（保留最新的）
	result := s.db.Where("event_type != ? AND endpoint_id = ? AND id NOT IN (SELECT id FROM endpoint_sses WHERE event_type != ? AND endpoint_id = ? ORDER BY created_at DESC LIMIT ?)", models.SSEEventTypeLog, endpointID, models.SSEEventTypeLog, endpointID, s.maxLogRecordsPerDay).Delete(&models.EndpointSSE{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

// vacuumDatabase 执行数据库空间优化操作 (MySQL使用OPTIMIZE TABLE)
func (s *Service) vacuumDatabase() {
	startTime := time.Now()
	// MySQL的InnoDB引擎会自动管理空间，不需要手动VACUUM
	// 这里可以选择性地对主要表执行OPTIMIZE TABLE，但通常不是必需的
	tables := []string{"endpoint_sses", "tunnels", "endpoints"}
	for _, table := range tables {
		if err := s.db.Exec(fmt.Sprintf("OPTIMIZE TABLE %s", table)).Error; err != nil {
			log.Debugf("优化表 %s 失败（可忽略）: %v", table, err)
		}
	}
	log.Debugf("数据库优化完成，耗时%v", time.Since(startTime))
}

// SetLogCleanupConfig 设置日志清理配置
func (s *Service) SetLogCleanupConfig(retentionDays int, cleanupInterval time.Duration, maxRecordsPerDay int, enabled bool) {
	s.logRetentionDays = retentionDays
	s.logCleanupInterval = cleanupInterval
	s.maxLogRecordsPerDay = maxRecordsPerDay
	s.enableLogCleanup = enabled

	log.Infof("日志清理配置已更新: 保留%d天, 清理间隔%v, 每天最大%d条, 启用状态%t",
		retentionDays, cleanupInterval, maxRecordsPerDay, enabled)
}

// TriggerLogCleanup 手动触发日志清理（公共方法）
func (s *Service) TriggerLogCleanup() {
	log.Info("手动触发日志清理")

	// 1. 清理数据库中的非日志事件
	s.cleanupOldLogs()

	// 2. 手动触发文件日志清理
	if s.fileLogger != nil {
		s.fileLogger.TriggerCleanup()
	}
}

// GetLogCleanupStats 获取日志清理统计信息
func (s *Service) GetLogCleanupStats() map[string]interface{} {
	// 获取数据库中非日志事件的统计
	var totalDbEvents int64
	s.db.Model(&models.EndpointSSE{}).Where("event_type != ?", models.SSEEventTypeLog).Count(&totalDbEvents)

	// 获取文件日志统计
	fileLogStats := s.fileLogger.GetLogStats()

	stats := map[string]interface{}{
		"totalLogRecords":  totalDbEvents, // 数据库中的非日志事件数量
		"retentionDays":    s.logRetentionDays,
		"cleanupInterval":  s.logCleanupInterval.String(),
		"maxRecordsPerDay": s.maxLogRecordsPerDay,
		"cleanupEnabled":   s.enableLogCleanup,
		// 文件日志统计
		"fileLogStats":   fileLogStats,
		"logStorageMode": "hybrid", // 混合模式：事件存数据库，日志存文件
	}

	// 获取最老的数据库事件时间
	var oldestDbEvent time.Time
	if err := s.db.Model(&models.EndpointSSE{}).Where("event_type != ?", models.SSEEventTypeLog).Order("created_at ASC").Limit(1).Scan(&oldestDbEvent).Error; err == nil {
		stats["oldestDbEventAge"] = time.Since(oldestDbEvent).String()
	}

	return stats
}

// updateEndpointTunnelCount 更新端点的隧道计数，使用重试机制避免死锁
func (s *Service) updateEndpointTunnelCount(endpointID int64) {
	err := db.ExecuteWithRetry(func(db *gorm.DB) error {
		return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
			Update("tunnel_count", gorm.Expr("(SELECT COUNT(*) FROM tunnels WHERE endpoint_id = ?)", endpointID)).Error
	})

	if err != nil {
		log.Errorf("[Master-%d#SSE]更新端点隧道计数失败,err=%v", endpointID, err)
	} else {
		log.Debugf("[Master-%d#SSE]端点隧道计数已更新", endpointID)
	}
}

// startBatchInsertProcessor 启动批量插入处理器
func (s *Service) startBatchInsertProcessor() {
	ticker := time.NewTicker(100 * time.Millisecond) // 每100ms检查一次
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case event := <-s.batchInsertCh:
			s.addToBatchInsert(event)
		case <-ticker.C:
			s.flushBatchInsert()
		}
	}
}

// addToBatchInsert 添加事件到批量插入缓冲区
func (s *Service) addToBatchInsert(event models.EndpointSSE) {
	s.batchInsertMu.Lock()
	defer s.batchInsertMu.Unlock()

	s.batchInsertBuf = append(s.batchInsertBuf, event)

	// 如果缓冲区满了，立即刷新
	if len(s.batchInsertBuf) >= s.batchInsertSize {
		s.flushBatchInsertUnsafe()
	}
}

// flushBatchInsert 刷新批量插入缓冲区
func (s *Service) flushBatchInsert() {
	s.batchInsertMu.Lock()
	defer s.batchInsertMu.Unlock()
	s.flushBatchInsertUnsafe()
}

// flushBatchInsertUnsafe 刷新批量插入缓冲区（内部调用，需要持有锁）
func (s *Service) flushBatchInsertUnsafe() {
	if len(s.batchInsertBuf) == 0 {
		return
	}

	// 复制缓冲区数据
	events := make([]models.EndpointSSE, len(s.batchInsertBuf))
	copy(events, s.batchInsertBuf)

	// 清空缓冲区
	s.batchInsertBuf = s.batchInsertBuf[:0]

	// 异步批量插入
	go func() {
		if err := s.batchInsertEvents(events); err != nil {
			log.Errorf("批量插入事件失败: %v", err)
		}
	}()
}

// batchInsertEvents 批量插入事件到数据库
func (s *Service) batchInsertEvents(events []models.EndpointSSE) error {
	if len(events) == 0 {
		return nil
	}

	// 使用事务批量插入
	err := s.db.Transaction(func(tx *gorm.DB) error {
		return tx.Create(&events).Error
	})

	if err != nil {
		log.Errorf("批量插入%d个事件失败: %v", len(events), err)
		return err
	}

	log.Debugf("批量插入%d个事件成功", len(events))
	return nil
}

// GetQueueStats 获取队列统计信息
func (s *Service) GetQueueStats() map[string]interface{} {
	s.batchInsertMu.Lock()
	batchInsertSize := len(s.batchInsertBuf)
	s.batchInsertMu.Unlock()

	return map[string]interface{}{
		"storeJobCh_len":     len(s.storeJobCh),
		"storeJobCh_cap":     cap(s.storeJobCh),
		"batchInsertCh_len":  len(s.batchInsertCh),
		"batchInsertCh_cap":  cap(s.batchInsertCh),
		"batchInsertBuf_len": batchInsertSize,
		"batchInsertSize":    s.batchInsertSize,
		"eventCache_count":   len(s.eventCache),
		"maxCacheEvents":     s.maxCacheEvents,
	}
}

// GetPerformanceStats 获取性能统计信息
func (s *Service) GetPerformanceStats() map[string]interface{} {
	stats := s.GetQueueStats()

	// 计算队列使用率
	storeJobChUsage := float64(stats["storeJobCh_len"].(int)) / float64(stats["storeJobCh_cap"].(int)) * 100
	batchInsertChUsage := float64(stats["batchInsertCh_len"].(int)) / float64(stats["batchInsertCh_cap"].(int)) * 100

	stats["storeJobCh_usage_percent"] = storeJobChUsage
	stats["batchInsertCh_usage_percent"] = batchInsertChUsage

	// 添加告警级别
	stats["storeJobCh_warning"] = storeJobChUsage > 80
	stats["batchInsertCh_warning"] = batchInsertChUsage > 80

	return stats
}
