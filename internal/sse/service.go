package sse

import (
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/memory"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/traffic"
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

	// 内存管理服务（暂时注释掉）
	// memoryService *memory.Service

	// 流量历史管理器
	trafficHistory *traffic.HistoryManager

	// 历史数据处理Worker（类似Nezha的ServiceHistory）
	historyWorker *HistoryWorker

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

	// ========================
	// 优化的存储机制（替代原来的实时存储）
	// ========================
	optimizedStorage struct {
		mu                sync.RWMutex
		buffer            []models.EndpointSSE // 缓冲区
		maxBufferSize     int                  // 最大缓冲大小（1000）
		lastFlushTime     time.Time            // 上次刷盘时间
		hourlyFlushTicker *time.Ticker         // 整点刷盘定时器
	}

	// 性能统计
	stats *ServiceStats

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
}

// ServiceStats 服务统计信息
type ServiceStats struct {
	mu sync.RWMutex

	ProcessedEvents    int64     `json:"processed_events"`
	MemoryHits         int64     `json:"memory_hits"`
	DatabaseWrites     int64     `json:"database_writes"`
	LastProcessedTime  time.Time `json:"last_processed_time"`
	AverageProcessTime int64     `json:"average_process_time_ms"`

	// 错误统计
	MemoryErrors   int64 `json:"memory_errors"`
	DatabaseErrors int64 `json:"database_errors"`
}

// NewService 创建SSE服务实例
func NewService(db *gorm.DB, endpointService *endpoint.Service) *Service {
	ctx, cancel := context.WithCancel(context.Background())

	// 创建日志目录路径
	logDir := filepath.Join("logs")

	s := &Service{
		clients:         make(map[string]*Client),
		tunnelSubs:      make(map[string]map[string]*Client),
		db:              db,
		endpointService: endpointService,
		// memoryService:       memory.NewService(db),
		trafficHistory:      traffic.NewHistoryManager(db),
		historyWorker:       NewHistoryWorker(db),
		storeJobCh:          make(chan models.EndpointSSE, 20000), // 增加缓冲大小到20000
		batchUpdateCh:       make(chan models.EndpointSSE, 500),   // 批量更新通道
		pendingUpdates:      make(map[string]models.EndpointSSE),
		batchInsertCh:       make(chan models.EndpointSSE, 5000), // 批量插入通道
		batchInsertBuf:      make([]models.EndpointSSE, 0, 200),  // 批量插入缓冲区
		batchInsertSize:     200,                                 // 批量插入大小
		eventCache:          make(map[int64][]models.EndpointSSE),
		maxCacheEvents:      1000, // 每个端点最多缓存1000个事件
		healthCheckInterval: 30 * time.Second,
		lastEventTime:       make(map[int64]time.Time),
		logRetentionDays:    7,              // 默认保留7天
		logCleanupInterval:  24 * time.Hour, // 每24小时清理一次
		maxLogRecordsPerDay: 10000,          // 每天最多保留10000条日志
		enableLogCleanup:    true,           // 默认启用日志清理
		fileLogger:          log.NewFileLogger(logDir),
		stats: &ServiceStats{
			LastProcessedTime: time.Now(),
		},
		ctx:    ctx,
		cancel: cancel,
	}

	// 初始化优化存储机制
	s.initOptimizedStorage()

	// 启动批处理定时器
	s.batchTimer = time.AfterFunc(2*time.Second, s.flushBatch)

	// 启动批量插入处理器
	s.startBatchInsertProcessor()

	// 启动定时刷盘处理器（每5秒检查一次）
	s.startPeriodicFlushProcessor()

	// 启动日志清理守护进程
	if s.enableLogCleanup {
		s.startLogCleanupDaemon()
	}

	return s
}

// Initialize 初始化服务
func (s *Service) Initialize() error {
	log.Info("正在初始化SSE服务")

	// 从数据库加载端点数据到内存（暂时注释掉）
	// if err := s.memoryService.LoadEndpointsFromDB(); err != nil {
	// 	return fmt.Errorf("加载端点数据到内存失败: %v", err)
	// }

	// 启动存储worker - 增加worker数量到8个
	s.StartStoreWorkers(8)

	// 启动批处理器
	s.startBatchProcessor()

	log.Info("SSE服务初始化完成")
	return nil
}

// ProcessEvent 处理SSE事件（回滚到原来的直接更新逻辑）
func (s *Service) ProcessEvent(endpointID int64, event models.EndpointSSE) error {
	startTime := time.Now()
	// 异步处理事件，避免阻塞SSE接收
	select {
	case s.storeJobCh <- event:
		// 成功投递到存储队列
	default:
		log.Warnf("[Master-%d]事件存储队列已满，丢弃事件", endpointID)
		return fmt.Errorf("存储队列已满")
	}
	// 更新统计
	s.updateStats(func(stats *ServiceStats) {
		stats.ProcessedEvents++
		stats.LastProcessedTime = time.Now()
	})

	// 回滚到原来的直接处理逻辑（暂时注释掉内存优先逻辑）
	// 首先更新内存状态（这是关键的改进）
	// if err := s.memoryService.ProcessSSEEvent(endpointID, event); err != nil {
	// 	log.Errorf("内存处理SSE事件失败: %v", err)
	// 	s.updateStats(func(stats *ServiceStats) {
	// 		stats.MemoryErrors++
	// 	})
	//
	// 	// 内存处理失败，回退到原有逻辑
	// 	return s.ProcessEventImmediate(endpointID, event)
	// }
	//
	// s.updateStats(func(stats *ServiceStats) {
	// 	stats.MemoryHits++
	// })

	// 处理特殊事件类型的数据库操作
	if event.EventType == models.SSEEventTypeCreate ||
		event.EventType == models.SSEEventTypeDelete ||
		event.EventType == models.SSEEventTypeShutdown ||
		event.EventType == models.SSEEventTypeInitial {
		if err := s.ProcessEventImmediate(endpointID, event); err != nil {
			log.Errorf("立即写入数据库失败: %v", err)
			s.updateStats(func(stats *ServiceStats) {
				stats.DatabaseErrors++
			})
		} else {
			s.updateStats(func(stats *ServiceStats) {
				stats.DatabaseWrites++
			})
		}
	}

	// 对于update事件，使用原来的逻辑 + 保留History Worker
	if event.EventType == models.SSEEventTypeUpdate {
		// ========================
		// 恢复原来的实时数据库写入逻辑
		// ========================
		// select {
		// case s.storeJobCh <- event:
		// 	// 成功投递到存储队列
		// default:
		// 	log.Warnf("[Master-%d]事件存储队列已满，丢弃事件", endpointID)
		// }

		// 保留优化存储策略（用于批量写入）
		s.addToOptimizedStorage(event)

		// 保留History Worker逻辑（参照Nezha的逻辑）
		if s.historyWorker != nil {
			s.historyWorker.Dispatch(event)
		}
	}

	// 更新平均处理时间
	processingTime := time.Since(startTime).Milliseconds()
	s.updateStats(func(stats *ServiceStats) {
		if stats.AverageProcessTime == 0 {
			stats.AverageProcessTime = processingTime
		} else {
			stats.AverageProcessTime = (stats.AverageProcessTime + processingTime) / 2
		}
	})

	return nil
}

// updateStats 更新统计信息
func (s *Service) updateStats(fn func(*ServiceStats)) {
	s.stats.mu.Lock()
	fn(s.stats)
	s.stats.mu.Unlock()
}

// GetStats 获取服务统计信息
func (s *Service) GetStats() map[string]interface{} {
	s.stats.mu.RLock()
	defer s.stats.mu.RUnlock()

	// memoryStats := s.memoryService.GetMemoryStats()
	trafficStats := s.trafficHistory.GetStats()
	// historyStats := s.historyWorker.GetStats() // GetStats 方法已删除
	optimizedStorageStats := s.getOptimizedStorageStats()

	return map[string]interface{}{
		// 服务层统计
		"service": map[string]interface{}{
			"processed_events":     s.stats.ProcessedEvents,
			"memory_hits":          s.stats.MemoryHits,
			"database_writes":      s.stats.DatabaseWrites,
			"last_processed_time":  s.stats.LastProcessedTime.Format("2006-01-02 15:04:05"),
			"average_process_time": s.stats.AverageProcessTime,
			"memory_errors":        s.stats.MemoryErrors,
			"database_errors":      s.stats.DatabaseErrors,
		},
		// 内存层统计（暂时注释掉）
		// "memory": memoryStats,
		// 流量历史统计
		"traffic": trafficStats,
		// 历史数据Worker统计（已删除）
		// "history": historyStats,
		// 优化存储统计
		"optimized_storage": optimizedStorageStats,
		// 命中率统计
		"performance": map[string]interface{}{
			"memory_hit_rate": func() float64 {
				if s.stats.ProcessedEvents == 0 {
					return 0
				}
				return float64(s.stats.MemoryHits) / float64(s.stats.ProcessedEvents) * 100
			}(),
			"error_rate": func() float64 {
				if s.stats.ProcessedEvents == 0 {
					return 0
				}
				totalErrors := s.stats.MemoryErrors + s.stats.DatabaseErrors
				return float64(totalErrors) / float64(s.stats.ProcessedEvents) * 100
			}(),
		},
	}
}

// GetEndpointRealTimeData 获取端点实时数据（从内存）
func (s *Service) GetEndpointRealTimeData(endpointID int64) *memory.EndpointShared {
	s.updateStats(func(stats *ServiceStats) {
		stats.MemoryHits++
	})

	// return s.memoryService.GetEndpointState(endpointID)
	return nil // 暂时返回 nil
}

// GetAllEndpointRealTimeData 获取所有端点实时数据（从内存）
func (s *Service) GetAllEndpointRealTimeData() map[int64]*memory.EndpointShared {
	s.updateStats(func(stats *ServiceStats) {
		stats.MemoryHits++
	})

	// return s.memoryService.GetAllEndpointStates()
	return make(map[int64]*memory.EndpointShared) // 暂时返回空 map
}

// GetTunnelRealTimeData 获取隧道实时数据（从内存）
func (s *Service) GetTunnelRealTimeData(endpointID int64, instanceID string) *memory.TunnelState {
	s.updateStats(func(stats *ServiceStats) {
		stats.MemoryHits++
	})

	// return s.memoryService.GetTunnelState(endpointID, instanceID)
	return nil // 暂时返回 nil
}

// GetDashboardData 获取仪表板数据（从内存聚合）
func (s *Service) GetDashboardData() map[string]interface{} {
	// endpoints := s.memoryService.GetAllEndpointStates()
	endpoints := make(map[int64]*memory.EndpointShared) // 暂时使用空 map

	var totalEndpoints int64 = int64(len(endpoints))
	var onlineEndpoints, offlineEndpoints int64
	var totalTunnels, runningTunnels, stoppedTunnels, errorTunnels int64
	var totalTCPRx, totalTCPTx, totalUDPRx, totalUDPTx int64

	for _, endpoint := range endpoints {
		endpoint.Mu.RLock()

		// 统计端点状态
		if endpoint.State.Status == models.EndpointStatusOnline {
			onlineEndpoints++
		} else {
			offlineEndpoints++
		}

		// 统计隧道状态和流量
		stats := endpoint.State.Stats
		totalTunnels += stats.TotalTunnels
		runningTunnels += stats.RunningTunnels
		stoppedTunnels += stats.StoppedTunnels
		errorTunnels += stats.ErrorTunnels
		totalTCPRx += stats.TotalTCPRx
		totalTCPTx += stats.TotalTCPTx
		totalUDPRx += stats.TotalUDPRx
		totalUDPTx += stats.TotalUDPTx

		endpoint.Mu.RUnlock()
	}

	s.updateStats(func(stats *ServiceStats) {
		stats.MemoryHits++
	})

	return map[string]interface{}{
		"overview": map[string]interface{}{
			"totalEndpoints": totalEndpoints,
			"totalTunnels":   totalTunnels,
			"runningTunnels": runningTunnels,
			"stoppedTunnels": stoppedTunnels,
			"errorTunnels":   errorTunnels,
			"totalTraffic":   totalTCPRx + totalTCPTx + totalUDPRx + totalUDPTx,
		},
		"endpointStatus": map[string]interface{}{
			"online":  onlineEndpoints,
			"offline": offlineEndpoints,
			"total":   totalEndpoints,
		},
		"traffic": map[string]interface{}{
			"tcp": map[string]interface{}{
				"rx": totalTCPRx,
				"tx": totalTCPTx,
			},
			"udp": map[string]interface{}{
				"rx": totalUDPRx,
				"tx": totalUDPTx,
			},
			"total": totalTCPRx + totalTCPTx + totalUDPRx + totalUDPTx,
		},
	}
}

// GetTrafficTrendData 获取流量趋势数据（从内存快照）
func (s *Service) GetTrafficTrendData(endpointID int64, hours int) []map[string]interface{} {
	// endpoint := s.memoryService.GetEndpointState(endpointID)
	// endpoint := s.memoryService.GetEndpointState(endpointID)
	// if endpoint == nil {
	// 	return []map[string]interface{}{}
	// }
	return []map[string]interface{}{} // 暂时返回空数据

	// 注释掉内存相关的逻辑
	// endpoint.Mu.RLock()
	// snapshot := endpoint.State.TrafficSnapshot
	// tunnels := make(map[string]*memory.TunnelState)
	//
	// // 复制隧道数据
	// for id, tunnel := range endpoint.State.Tunnels {
	// 	tunnels[id] = tunnel
	// }
	// endpoint.Mu.RUnlock()
	//
	// // 构造当前时刻的流量数据点
	// currentData := map[string]interface{}{
	// 	"timestamp": time.Now().Unix(),
	// 	"tcp_rx":    int64(0),
	// 	"tcp_tx":    int64(0),
	// 	"udp_rx":    int64(0),
	// 	"udp_tx":    int64(0),
	// }
	//
	// // 聚合所有隧道的流量
	// for _, tunnel := range tunnels {
	// 	currentData["tcp_rx"] = currentData["tcp_rx"].(int64) + tunnel.TCPRx
	// 	currentData["tcp_tx"] = currentData["tcp_tx"].(int64) + tunnel.TCPTx
	// 	currentData["udp_rx"] = currentData["udp_rx"].(int64) + tunnel.UDPRx
	// 	currentData["udp_tx"] = currentData["udp_tx"].(int64) + tunnel.UDPTx
	// }
	//
	// // 如果有差值数据，也包含进去
	// if snapshot != nil {
	// 	currentData["delta_tcp_rx"] = snapshot.DeltaTCPRx
	// 	currentData["delta_tcp_tx"] = snapshot.DeltaTCPTx
	// 	currentData["delta_udp_rx"] = snapshot.DeltaUDPRx
	// 	currentData["delta_udp_tx"] = snapshot.DeltaUDPTx
	// }
	//
	// s.updateStats(func(stats *ServiceStats) {
	// 	stats.MemoryHits++
	// })
	//
	// // 返回当前数据点（实际应用中这里会从历史数据表查询多个时间点）
	// return []map[string]interface{}{currentData}
}

// SetManager 设置Manager引用
func (s *Service) SetManager(manager *Manager) {
	s.manager = manager
}

// AddClient 添加客户端
func (s *Service) AddClient(clientID string, w http.ResponseWriter) {
	s.mu.Lock()
	defer s.mu.Unlock()

	client := &Client{
		ID:     clientID,
		Writer: w,
		Events: make(chan Event, 100),
	}

	s.clients[clientID] = client
	log.Infof("客户端 %s 已连接", clientID)
}

// RemoveClient 移除客户端
func (s *Service) RemoveClient(clientID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if client, exists := s.clients[clientID]; exists {
		delete(s.clients, clientID)
		log.Infof("客户端 %s 已断开连接", clientID)
		client.Close()
	}

	// 从隧道订阅中移除
	for tunnelID, subscribers := range s.tunnelSubs {
		if _, exists := subscribers[clientID]; exists {
			delete(subscribers, clientID)
			if len(subscribers) == 0 {
				delete(s.tunnelSubs, tunnelID)
			}
		}
	}
}

// SubscribeToTunnel 订阅隧道事件
func (s *Service) SubscribeToTunnel(clientID, tunnelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.tunnelSubs[tunnelID] == nil {
		s.tunnelSubs[tunnelID] = make(map[string]*Client)
	}
	s.tunnelSubs[tunnelID][clientID] = s.clients[clientID]
	log.Infof("客户端 %s 订阅隧道 %s", clientID, tunnelID)
}

// UnsubscribeFromTunnel 取消订阅隧道事件
func (s *Service) UnsubscribeFromTunnel(clientID, tunnelID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if subscribers, exists := s.tunnelSubs[tunnelID]; exists {
		delete(subscribers, clientID)
		if len(subscribers) == 0 {
			delete(s.tunnelSubs, tunnelID)
		}
		log.Infof("客户端 %s 取消订阅隧道 %s", clientID, tunnelID)
	}
}

// ProcessEventImmediate 立即处理事件（同步处理）
func (s *Service) ProcessEventImmediate(endpointID int64, event models.EndpointSSE) error {
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
	}

	// 更新最后事件时间
	s.updateLastEventTime(endpointID)

	// 推流转发给前端订阅
	if event.EventType != models.SSEEventTypeInitial {
		if event.EventType == models.SSEEventTypeShutdown {
			// shutdown 事件发送全局更新，通知所有客户端端点即将离线
			s.sendGlobalUpdate(map[string]interface{}{
				"type":        "endpoint_shutdown",
				"endpoint_id": endpointID,
				"message":     "端点即将关闭",
				"timestamp":   time.Now().Unix(),
			})
		} else if event.InstanceID != "" {
			s.sendTunnelUpdateByInstanceId(event.InstanceID, event)
		}
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

// storeWorkerLoop 存储worker循环
func (s *Service) storeWorkerLoop() {
	for event := range s.storeJobCh {
		if err := s.storeEvent(event); err != nil {
			log.Errorf("存储事件失败: %v", err)
		}
	}
}

// storeEvent 存储事件到数据库
func (s *Service) storeEvent(event models.EndpointSSE) error {
	// 对于日志事件，使用批量插入
	if event.EventType == models.SSEEventTypeLog {
		select {
		case s.batchInsertCh <- event:
			return nil
		default:
			log.Warnf("批量插入队列已满，直接插入事件")
		}
	}

	// 对于update事件，优先使用批量插入以提高性能
	if event.EventType == models.SSEEventTypeUpdate {
		select {
		case s.batchInsertCh <- event:
			return nil
		default:
			// 如果批量插入队列满了，回退到直接插入
			log.Debugf("批量插入队列已满，回退到直接插入事件")
		}
	}

	// 其他事件直接插入
	return s.singleInsertEvent(event)
}

// singleInsertEvent 单个插入事件
func (s *Service) singleInsertEvent(event models.EndpointSSE) error {
	return s.db.Create(&event).Error
}

// updateEventCache 更新事件缓存
func (s *Service) updateEventCache(event models.EndpointSSE) {
	s.eventCacheMu.Lock()
	defer s.eventCacheMu.Unlock()

	endpointEvents := s.eventCache[event.EndpointID]
	if len(endpointEvents) >= s.maxCacheEvents {
		// 移除最旧的事件
		endpointEvents = endpointEvents[1:]
	}
	endpointEvents = append(endpointEvents, event)
	s.eventCache[event.EndpointID] = endpointEvents
}

// broadcastEvent 广播事件给所有客户端
func (s *Service) broadcastEvent(event models.EndpointSSE) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := json.Marshal(event)
	if err != nil {
		log.Errorf("序列化事件失败: %v", err)
		return
	}

	for clientID, client := range s.clients {
		if err := client.Send(data); err != nil {
			log.Errorf("发送事件给客户端 %s 失败: %v", clientID, err)
			// 标记客户端为断开
			client.SetDisconnected(true)
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

// Close 关闭服务
func (s *Service) Close() {
	log.Info("正在关闭SSE服务")

	// 停止上下文
	s.cancel()

	// ========================
	// 清理优化存储资源
	// ========================
	log.Info("正在清理优化存储资源...")

	// 停止整点刷盘定时器
	if s.optimizedStorage.hourlyFlushTicker != nil {
		s.optimizedStorage.hourlyFlushTicker.Stop()
	}

	// 刷盘剩余的缓冲数据（保护：避免在DB已关闭后刷盘）
	defer func() {
		if r := recover(); r != nil {
			log.Warnf("优化存储刷盘在关闭时发生异常: %v", r)
		}
	}()
	s.flushOptimizedStorage("服务关闭")
	log.Info("优化存储资源清理完成")

	// 关闭内存服务（暂时注释掉）
	// if s.memoryService != nil {
	// 	s.memoryService.Close()
	// }

	// 关闭流量历史管理器
	if s.trafficHistory != nil {
		s.trafficHistory.Close()
	}

	// 关闭历史数据Worker
	if s.historyWorker != nil {
		s.historyWorker.Close()
	}

	// 关闭所有客户端
	s.mu.Lock()
	for clientID, client := range s.clients {
		client.Close()
		delete(s.clients, clientID)
	}
	s.mu.Unlock()

	// 关闭文件日志管理器
	if s.fileLogger != nil {
		s.fileLogger.Close()
	}

	log.Info("SSE服务已关闭")
}

// 工具函数
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func valueOrEmpty[T any](p *T, def T) T {
	if p == nil {
		return def
	}
	return *p
}

// sendTunnelUpdateByInstanceId 根据实例ID发送隧道更新
func (s *Service) sendTunnelUpdateByInstanceId(instanceID string, data interface{}) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	subscribers, exists := s.tunnelSubs[instanceID]
	if !exists {
		return
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Errorf("序列化隧道数据失败: %v", err)
		return
	}

	for clientID, client := range subscribers {
		if err := client.Send(jsonData); err != nil {
			log.Errorf("发送隧道更新给客户端 %s 失败: %v", clientID, err)
			client.SetDisconnected(true)
		}
	}
}

// sendGlobalUpdate 发送全局更新
func (s *Service) sendGlobalUpdate(data interface{}) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Errorf("序列化全局数据失败: %v", err)
		return
	}

	for clientID, client := range s.clients {
		if err := client.Send(jsonData); err != nil {
			log.Errorf("发送全局更新给客户端 %s 失败: %v", clientID, err)
			client.SetDisconnected(true)
		}
	}
}

// updateTunnelData 更新隧道数据
func (s *Service) updateTunnelData(event models.EndpointSSE) {
	// 这里实现隧道数据更新逻辑
	// 由于已经集成到内存服务中，这里可以简化或移除
}

// ======================== 事件处理器 ============================

// 事件处理方法
func (s *Service) handleInitialEvent(e models.EndpointSSE) {
	// SSE initial 事件表示端点重新连接时报告现有隧道状态
	// 此时隧道记录应该已经存在，我们只需要更新运行时信息
	log.Debugf("[Master-%d]处理初始化事件: 隧道 %s", e.EndpointID, e.InstanceID)
	if e.InstanceType == nil || *e.InstanceType == "" {
		// 当InstanceType为空时，尝试获取端点系统信息
		go s.fetchAndUpdateEndpointInfo(e.EndpointID)
		return
	}
	// 检查隧道是否已存在
	var existingTunnel models.Tunnel
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&existingTunnel).Error

	if err == nil {
		// 隧道已存在（正常情况），更新运行时信息
		log.Debugf("[Master-%d]隧道 %s 已存在，更新运行时信息", e.EndpointID, e.InstanceID)
		s.updateTunnelRuntimeInfo(e)
		return
	}

	if err != gorm.ErrRecordNotFound {
		log.Errorf("[Master-%d]查询隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
		return
	}

	// 隧道不存在（异常情况），可能是数据丢失或首次启动
	// 使用 URL 解析创建隧道记录
	log.Warnf("[Master-%d]隧道 %s 不存在，从 URL 解析创建记录（可能是数据丢失或首次启动）", e.EndpointID, e.InstanceID)

	tunnel := createTunnelFromSSEEvent(e)

	err = s.db.Create(&tunnel).Error
	if err != nil {
		log.Errorf("[Master-%d]初始化隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
	} else {
		log.Infof("[Master-%d]最小化隧道记录 %s 初始化成功，等待 API 补全信息", e.EndpointID, e.InstanceID)
	}
}

func (s *Service) handleCreateEvent(e models.EndpointSSE) {
	// SSE create 事件表示 NodePass 客户端报告隧道创建成功
	// 此时隧道记录应该已经由 API 创建，我们只需要更新状态和流量信息
	log.Debugf("[Master-%d]处理创建事件: 隧道 %s", e.EndpointID, e.InstanceID)

	// 检查隧道是否已存在
	var existingTunnel models.Tunnel
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&existingTunnel).Error

	if err == nil {
		// 隧道已存在（正常情况），更新运行时信息
		log.Debugf("[Master-%d]隧道 %s 已存在，更新状态和流量信息", e.EndpointID, e.InstanceID)
		s.updateTunnelRuntimeInfo(e)
		return
	}

	if err != gorm.ErrRecordNotFound {
		log.Errorf("[Master-%d]查询隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
		return
	}

	// 隧道不存在（异常情况），可能是 SSE 事件比 API 创建先到达
	// 使用 URL 解析创建隧道记录
	log.Warnf("[Master-%d]隧道 %s 不存在，从 URL 解析创建记录（可能是 SSE 事件先于 API 到达）", e.EndpointID, e.InstanceID)

	tunnel := createTunnelFromSSEEvent(e)

	err = s.db.Create(&tunnel).Error
	if err != nil {
		log.Errorf("[Master-%d]创建最小化隧道记录 %s 失败: %v", e.EndpointID, e.InstanceID, err)
	} else {
		log.Infof("[Master-%d]最小化隧道记录 %s 创建成功，等待 API 补全信息", e.EndpointID, e.InstanceID)
	}
}

func (s *Service) handleUpdateEvent(e models.EndpointSSE) {
	// SSE update 事件用于更新隧道的运行时信息
	log.Debugf("[Master-%d]处理更新事件: 隧道 %s", e.EndpointID, e.InstanceID)

	// 先检查隧道是否存在
	var existingTunnel models.Tunnel
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&existingTunnel).Error

	if err == gorm.ErrRecordNotFound {
		// 隧道不存在，可能是时序问题（SSE 事件比 API 创建先到达）
		log.Warnf("[Master-%d]收到更新事件但隧道 %s 不存在，可能是时序问题，跳过处理", e.EndpointID, e.InstanceID)
		return
	}

	if err != nil {
		log.Errorf("[Master-%d]查询隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
		return
	}

	// 更新运行时信息
	s.updateTunnelRuntimeInfo(e)
}

// updateTunnelRuntimeInfo 更新隧道运行时信息（流量、状态、ping等）
func (s *Service) updateTunnelRuntimeInfo(e models.EndpointSSE) {
	// 准备更新字段
	updates := map[string]interface{}{
		"tcp_rx":          e.TCPRx,
		"tcp_tx":          e.TCPTx,
		"udp_rx":          e.UDPRx,
		"udp_tx":          e.UDPTx,
		"updated_at":      time.Now(),
		"last_event_time": &e.EventTime,
	}

	// 可选字段
	if e.Pool != nil {
		updates["pool"] = e.Pool
	}
	if e.Ping != nil {
		updates["ping"] = e.Ping
	}
	if e.Status != nil {
		updates["status"] = models.TunnelStatus(*e.Status)
	}

	// 更新 tunnel 表
	result := s.db.Model(&models.Tunnel{}).
		Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).
		Updates(updates)

	if result.Error != nil {
		log.Errorf("[Master-%d]更新隧道 %s 运行时信息失败: %v", e.EndpointID, e.InstanceID, result.Error)
		return
	}

	if result.RowsAffected == 0 {
		log.Warnf("[Master-%d]隧道 %s 运行时信息更新未影响任何行，可能隧道不存在", e.EndpointID, e.InstanceID)
		return
	}

	log.Debugf("[Master-%d]隧道 %s 运行时信息已更新: tcp_rx=%d, tcp_tx=%d, udp_rx=%d, udp_tx=%d, status=%v",
		e.EndpointID, e.InstanceID, e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, e.Status)

	// 调用 trafficHistory 功能，记录流量历史数据
	if s.trafficHistory != nil {
		// 计算流量差值（这里简化处理，实际应该基于上次记录的值计算差值）
		// 由于我们没有保存上次的值，这里暂时使用当前值作为差值
		// 在实际应用中，应该从内存或数据库中获取上次的流量值来计算差值
		s.trafficHistory.AddTrafficPoint(
			e.EndpointID, e.InstanceID,
			e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx,
			e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, // 暂时使用当前值作为差值
		)
		log.Debugf("[Master-%d]隧道 %s 流量历史已记录", e.EndpointID, e.InstanceID)
	} else {
		log.Warnf("[Master-%d]流量历史管理器未初始化，无法记录流量历史", e.EndpointID)
	}
}

func (s *Service) handleDeleteEvent(e models.EndpointSSE) {
	// 删除隧道记录
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).Delete(&models.Tunnel{}).Error

	if err != nil {
		log.Errorf("[Master-%d]删除隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
	} else {
		log.Infof("[Master-%d]隧道 %s 删除成功", e.EndpointID, e.InstanceID)
	}
}

// handleLogEvent 处理日志事件
func (s *Service) handleLogEvent(e models.EndpointSSE) {
	// 日志事件需要写入文件日志系统
	log.Debugf("[Master-%d]处理日志事件: 隧道 %s", e.EndpointID, e.InstanceID)

	// 检查是否有日志内容
	if e.Logs == nil || *e.Logs == "" {
		log.Debugf("[Master-%d]隧道 %s 日志事件内容为空，跳过文件写入", e.EndpointID, e.InstanceID)
		return
	}

	// 使用文件日志管理器写入日志文件
	if s.fileLogger != nil {
		err := s.fileLogger.WriteLog(e.EndpointID, e.InstanceID, *e.Logs)
		if err != nil {
			log.Errorf("[Master-%d]写入隧道 %s 日志到文件失败: %v", e.EndpointID, e.InstanceID, err)
		} else {
			log.Debugf("[Master-%d]隧道 %s 日志已写入文件", e.EndpointID, e.InstanceID)
		}
	} else {
		log.Warnf("[Master-%d]文件日志管理器未初始化，无法写入日志", e.EndpointID)
	}
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

// 批处理方法
func (s *Service) startBatchProcessor() {
	go func() {
		for event := range s.batchUpdateCh {
			s.addToBatch(event)
		}
	}()
}

func (s *Service) addToBatch(event models.EndpointSSE) {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()

	key := fmt.Sprintf("%d_%s", event.EndpointID, event.InstanceID)
	s.pendingUpdates[key] = event

	// 重置定时器
	if s.batchTimer != nil {
		s.batchTimer.Stop()
	}
	s.batchTimer = time.AfterFunc(2*time.Second, s.flushBatch)
}

func (s *Service) flushBatch() {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()

	if len(s.pendingUpdates) == 0 {
		return
	}

	events := make([]models.EndpointSSE, 0, len(s.pendingUpdates))
	for _, event := range s.pendingUpdates {
		events = append(events, event)
	}
	s.pendingUpdates = make(map[string]models.EndpointSSE)

	// 批量处理事件
	if err := s.processBatchEvents(events); err != nil {
		log.Errorf("批量处理事件失败: %v", err)
	}
}

func (s *Service) processBatchEvents(events []models.EndpointSSE) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		for _, event := range events {
			if err := s.processSingleEventInTx(tx, event); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Service) processSingleEventInTx(tx *gorm.DB, event models.EndpointSSE) error {
	// 在事务中处理单个事件
	return nil
}

// 批量插入方法
func (s *Service) startBatchInsertProcessor() {
	go func() {
		for event := range s.batchInsertCh {
			s.addToBatchInsert(event)
		}
	}()
}

func (s *Service) addToBatchInsert(event models.EndpointSSE) {
	s.batchInsertMu.Lock()
	defer s.batchInsertMu.Unlock()

	s.batchInsertBuf = append(s.batchInsertBuf, event)

	if len(s.batchInsertBuf) >= s.batchInsertSize {
		s.flushBatchInsert()
	}
}

func (s *Service) flushBatchInsert() {
	if len(s.batchInsertBuf) == 0 {
		return
	}

	events := make([]models.EndpointSSE, len(s.batchInsertBuf))
	copy(events, s.batchInsertBuf)
	s.batchInsertBuf = s.batchInsertBuf[:0]

	// 异步批量插入
	go func() {
		startTime := time.Now()
		if err := s.batchInsertEvents(events); err != nil {
			log.Errorf("批量插入事件失败: %v", err)
		} else {
			duration := time.Since(startTime)
			log.Debugf("批量插入 %d 个事件成功，耗时: %v", len(events), duration)
		}
	}()
}

func (s *Service) batchInsertEvents(events []models.EndpointSSE) error {
	// 使用更大的批次大小以提高性能
	return s.db.CreateInBatches(events, 500).Error
}

// startPeriodicFlushProcessor 启动定时刷盘处理器
func (s *Service) startPeriodicFlushProcessor() {
	go func() {
		ticker := time.NewTicker(5 * time.Second) // 每5秒检查一次
		defer ticker.Stop()

		for {
			select {
			case <-s.ctx.Done():
				log.Info("定时刷盘处理器已停止")
				return
			case <-ticker.C:
				// 检查批量插入缓冲区，如果有数据就刷盘
				s.batchInsertMu.Lock()
				if len(s.batchInsertBuf) > 0 {
					log.Debugf("定时刷盘触发，缓冲区有 %d 个事件", len(s.batchInsertBuf))
					s.flushBatchInsert()
				}
				s.batchInsertMu.Unlock()
			}
		}
	}()
}

// 日志清理方法
func (s *Service) startLogCleanupDaemon() {
	go func() {
		ticker := time.NewTicker(s.logCleanupInterval)
		defer ticker.Stop()

		for {
			select {
			case <-s.ctx.Done():
				return
			case <-ticker.C:
				s.cleanupOldLogs()
			}
		}
	}()
}

func (s *Service) cleanupOldLogs() {
	// 实现日志清理逻辑
}

// GetLogCleanupStats 获取日志清理统计信息
func (s *Service) GetLogCleanupStats() map[string]interface{} {
	// 获取文件日志统计信息
	var logFileCount int = 0
	var logFileSize int64 = 0

	if s.fileLogger != nil {
		stats := s.fileLogger.GetLogStats()
		if count, ok := stats["total_files"].(int); ok {
			logFileCount = count
		}
		if size, ok := stats["total_size"].(int64); ok {
			logFileSize = size
		}
	}

	return map[string]interface{}{
		"enabled":             s.enableLogCleanup,
		"retention_days":      s.logRetentionDays,
		"cleanup_interval":    s.logCleanupInterval.String(),
		"max_records_per_day": s.maxLogRecordsPerDay,
		"last_cleanup_time":   time.Now().Format("2006-01-02 15:04:05"),
		"log_file_count":      logFileCount,
		"log_file_size":       logFileSize,
	}
}

// SetLogCleanupConfig 设置日志清理配置
func (s *Service) SetLogCleanupConfig(retentionDays int, cleanupInterval time.Duration, maxRecordsPerDay int, enabled bool) {
	s.logRetentionDays = retentionDays
	s.logCleanupInterval = cleanupInterval
	s.maxLogRecordsPerDay = maxRecordsPerDay
	s.enableLogCleanup = enabled

	log.Infof("日志清理配置已更新: 保留天数=%d, 清理间隔=%v, 每天最大记录数=%d, 启用=%v",
		retentionDays, cleanupInterval, maxRecordsPerDay, enabled)
}

// TriggerLogCleanup 手动触发日志清理
func (s *Service) TriggerLogCleanup() {
	log.Info("手动触发日志清理")
	s.cleanupOldLogs()
}

// 获取统计信息
func (s *Service) GetQueueStats() map[string]interface{} {
	return map[string]interface{}{
		"store_queue_size":    len(s.storeJobCh),
		"batch_update_size":   len(s.batchUpdateCh),
		"batch_insert_size":   len(s.batchInsertCh),
		"pending_updates":     len(s.pendingUpdates),
		"batch_insert_buffer": len(s.batchInsertBuf),
	}
}

func (s *Service) GetPerformanceStats() map[string]interface{} {
	// 获取队列状态
	storeJobChLen := len(s.storeJobCh)
	storeJobChCap := cap(s.storeJobCh)
	batchInsertChLen := len(s.batchInsertCh)
	batchInsertChCap := cap(s.batchInsertCh)
	batchInsertBufLen := len(s.batchInsertBuf)

	return map[string]interface{}{
		"clients_count":      len(s.clients),
		"tunnel_subscribers": len(s.tunnelSubs),
		"cached_events":      len(s.eventCache),
		"last_event_times":   len(s.lastEventTime),
		// 队列状态监控
		"store_job_queue": map[string]interface{}{
			"current":   storeJobChLen,
			"capacity":  storeJobChCap,
			"usage_pct": float64(storeJobChLen) / float64(storeJobChCap) * 100,
		},
		"batch_insert_queue": map[string]interface{}{
			"current":   batchInsertChLen,
			"capacity":  batchInsertChCap,
			"usage_pct": float64(batchInsertChLen) / float64(batchInsertChCap) * 100,
		},
		"batch_insert_buffer": map[string]interface{}{
			"current":   batchInsertBufLen,
			"capacity":  s.batchInsertSize,
			"usage_pct": float64(batchInsertBufLen) / float64(s.batchInsertSize) * 100,
		},
	}
}

// GetMemoryService 获取内存服务（暂时注释掉）
func (s *Service) GetMemoryService() *memory.Service {
	// return s.memoryService
	return nil
}

// ========================
// 优化存储机制实现
// ========================

// initOptimizedStorage 初始化优化存储机制
func (s *Service) initOptimizedStorage() {
	s.optimizedStorage.buffer = make([]models.EndpointSSE, 0, 1000)
	s.optimizedStorage.maxBufferSize = 1000
	s.optimizedStorage.lastFlushTime = time.Now()

	// 启动整点刷盘定时器
	s.startHourlyFlushTimer()

	log.Info("优化存储机制已初始化：批量阈值=1000，整点刷盘已启用")
}

// startHourlyFlushTimer 启动整点刷盘定时器
func (s *Service) startHourlyFlushTimer() {
	// 计算下一个整点时间
	now := time.Now()
	nextHour := now.Truncate(time.Hour).Add(time.Hour)

	// 等待到下一个整点，然后每小时执行一次
	time.AfterFunc(time.Until(nextHour), func() {
		s.optimizedStorage.hourlyFlushTicker = time.NewTicker(time.Hour)

		// 立即执行一次整点刷盘
		s.flushOptimizedStorage("整点定时")

		// 启动定时刷盘循环
		go func() {
			for {
				select {
				case <-s.ctx.Done():
					if s.optimizedStorage.hourlyFlushTicker != nil {
						s.optimizedStorage.hourlyFlushTicker.Stop()
					}
					return
				case <-s.optimizedStorage.hourlyFlushTicker.C:
					s.flushOptimizedStorage("整点定时")
				}
			}
		}()
	})
}

// addToOptimizedStorage 添加事件到优化存储缓冲区
func (s *Service) addToOptimizedStorage(event models.EndpointSSE) {
	s.optimizedStorage.mu.Lock()
	defer s.optimizedStorage.mu.Unlock()

	// 添加事件到缓冲区
	s.optimizedStorage.buffer = append(s.optimizedStorage.buffer, event)

	// 检查是否达到批量阈值
	if len(s.optimizedStorage.buffer) >= s.optimizedStorage.maxBufferSize {
		log.Infof("优化存储达到批量阈值 %d，触发刷盘", s.optimizedStorage.maxBufferSize)

		// 异步刷盘，避免阻塞主流程
		go s.flushOptimizedStorage("批量阈值")
	}
}

// flushOptimizedStorage 刷盘优化存储缓冲区
func (s *Service) flushOptimizedStorage(trigger string) {
	s.optimizedStorage.mu.Lock()

	// 如果缓冲区为空，直接返回
	if len(s.optimizedStorage.buffer) == 0 {
		s.optimizedStorage.mu.Unlock()
		return
	}

	// 复制缓冲区数据
	eventsToFlush := make([]models.EndpointSSE, len(s.optimizedStorage.buffer))
	copy(eventsToFlush, s.optimizedStorage.buffer)

	// 清空缓冲区
	s.optimizedStorage.buffer = s.optimizedStorage.buffer[:0]
	s.optimizedStorage.lastFlushTime = time.Now()

	s.optimizedStorage.mu.Unlock()

	// 批量写入数据库
	startTime := time.Now()
	err := s.batchInsertSSEEvents(eventsToFlush)
	duration := time.Since(startTime)

	if err != nil {
		log.Errorf("优化存储刷盘失败 (%s触发, %d条记录, 耗时%v): %v",
			trigger, len(eventsToFlush), duration, err)
	} else {
		log.Infof("优化存储刷盘成功 (%s触发, %d条记录, 耗时%v)",
			trigger, len(eventsToFlush), duration)
	}
}

// batchInsertSSEEvents 批量插入SSE事件到数据库
func (s *Service) batchInsertSSEEvents(events []models.EndpointSSE) error {
	if len(events) == 0 {
		return nil
	}

	// 使用事务进行批量插入，分批处理避免单次插入过多
	return s.db.Transaction(func(tx *gorm.DB) error {
		batchSize := 100 // 每批100条
		for i := 0; i < len(events); i += batchSize {
			end := i + batchSize
			if end > len(events) {
				end = len(events)
			}

			if err := tx.CreateInBatches(events[i:end], batchSize).Error; err != nil {
				return fmt.Errorf("批量插入SSE事件失败 (批次 %d-%d): %v", i, end-1, err)
			}
		}
		return nil
	})
}

// getOptimizedStorageStats 获取优化存储统计信息
func (s *Service) getOptimizedStorageStats() map[string]interface{} {
	s.optimizedStorage.mu.RLock()
	defer s.optimizedStorage.mu.RUnlock()

	return map[string]interface{}{
		"buffer_size":      len(s.optimizedStorage.buffer),
		"max_buffer_size":  s.optimizedStorage.maxBufferSize,
		"last_flush_time":  s.optimizedStorage.lastFlushTime.Format("2006-01-02 15:04:05"),
		"buffer_usage_pct": float64(len(s.optimizedStorage.buffer)) / float64(s.optimizedStorage.maxBufferSize) * 100,
	}
}

// ========================
// URL 解析相关函数
// ========================

// parsedURL 解析后的 URL 结构体
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
	Mode          string
	Read          string
	Rate          string
}

// parseInstanceURL 解析隧道实例 URL（从 tunnel 服务复制）
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

	// 去除协议部分 protocol://
	if idx := strings.Index(raw, "://"); idx != -1 {
		raw = raw[idx+3:]
	}

	// 分离用户认证信息 (password@)
	var userInfo string
	if atIdx := strings.Index(raw, "@"); atIdx != -1 {
		userInfo = raw[:atIdx]
		raw = raw[atIdx+1:]
		res.Password = userInfo
	}

	// 分离查询参数
	var queryPart string
	if qIdx := strings.Index(raw, "?"); qIdx != -1 {
		queryPart = raw[qIdx+1:]
		raw = raw[:qIdx]
	}

	// 分离路径
	var hostPart, pathPart string
	if pIdx := strings.Index(raw, "/"); pIdx != -1 {
		hostPart = raw[:pIdx]
		pathPart = raw[pIdx+1:]
	} else {
		hostPart = raw
	}

	// 内部工具函数: 解析 "addr:port" 片段 (兼容 IPv6 字面量，如 [::1]:8080)
	parsePart := func(part string) (addr, port string) {
		part = strings.TrimSpace(part)
		if part == "" {
			return "", ""
		}

		// 特殊处理 ":port" 格式（只有端口号，没有地址）
		if strings.HasPrefix(part, ":") {
			port = strings.TrimPrefix(part, ":")
			addr = "" // 空地址表示使用默认地址
			return
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

	// 解析 hostPart -> tunnelAddress:tunnelPort (兼容 IPv6)
	if hostPart != "" {
		addr, port := parsePart(hostPart)
		res.TunnelAddress = addr
		res.TunnelPort = port
	}

	// 解析 pathPart -> targetAddress:targetPort (兼容 IPv6)
	if pathPart != "" {
		addr, port := parsePart(pathPart)
		res.TargetAddress = addr
		res.TargetPort = port
	}

	// 解析查询参数
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
						res.TLSMode = "0"
					case "1":
						res.TLSMode = "1"
					case "2":
						res.TLSMode = "2"
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
			case "mode":
				res.Mode = val
			case "read":
				res.Read = val
			case "rate":
				res.Rate = val
			}
		}
	}

	return res
}

// createTunnelFromSSEEvent 根据 SSE 事件创建隧道记录，使用 URL 解析获取配置信息
func createTunnelFromSSEEvent(e models.EndpointSSE) models.Tunnel {
	// 解析 URL 获取隧道配置信息
	var parsed parsedURL
	var mode string = "client" // 默认模式

	if e.URL != nil && *e.URL != "" {
		// 尝试从 URL 中推断模式
		if strings.Contains(*e.URL, "://") {
			protocolEnd := strings.Index(*e.URL, "://")
			protocol := (*e.URL)[:protocolEnd]
			// 根据协议推断模式（这是一个简化的推断，实际可能需要更复杂的逻辑）
			if strings.Contains(protocol, "server") {
				mode = "server"
			}
		}

		parsed = parseInstanceURL(*e.URL, mode)
		log.Debugf("[Master-%d]解析隧道 %s URL: %s -> tunnel=%s:%s, target=%s:%s, mode=%s",
			e.EndpointID, e.InstanceID, *e.URL, parsed.TunnelAddress, parsed.TunnelPort,
			parsed.TargetAddress, parsed.TargetPort, mode)
	} else {
		log.Warnf("[Master-%d]隧道 %s 没有 URL 信息，使用默认值", e.EndpointID, e.InstanceID)
		parsed = parsedURL{
			TLSMode:  "inherit",
			LogLevel: "inherit",
		}
	}

	// 创建隧道记录
	tunnel := models.Tunnel{
		EndpointID: e.EndpointID,
		InstanceID: &e.InstanceID,
		Name:       valueOrEmpty(e.Alias, "未命名隧道"),
		Status:     models.TunnelStatus(valueOrEmpty(e.Status, "running")),

		// 从 URL 解析获取的配置信息
		Type:          models.TunnelType(mode),
		TunnelAddress: parsed.TunnelAddress, // 保持原始解析结果，空地址就是空字符串
		TunnelPort:    parsed.TunnelPort,
		TargetAddress: parsed.TargetAddress, // 保持原始解析结果，空地址就是空字符串
		TargetPort:    parsed.TargetPort,
		TLSMode:       models.TLSMode(parsed.TLSMode),
		LogLevel:      models.LogLevel(parsed.LogLevel),
		CommandLine:   valueOrEmpty(e.URL, "unknown"),

		// 流量信息
		TCPRx:         e.TCPRx,
		TCPTx:         e.TCPTx,
		UDPRx:         e.UDPRx,
		UDPTx:         e.UDPTx,
		Pool:          e.Pool,
		Ping:          e.Ping,
		LastEventTime: &e.EventTime,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// 处理可选字段
	if parsed.CertPath != "" {
		tunnel.CertPath = &parsed.CertPath
	}
	if parsed.KeyPath != "" {
		tunnel.KeyPath = &parsed.KeyPath
	}
	if parsed.Password != "" {
		tunnel.Password = &parsed.Password
	}
	if parsed.Min != "" {
		if minVal, err := strconv.ParseInt(parsed.Min, 10, 64); err == nil {
			tunnel.Min = &minVal
		}
	}
	if parsed.Max != "" {
		if maxVal, err := strconv.ParseInt(parsed.Max, 10, 64); err == nil {
			tunnel.Max = &maxVal
		}
	}

	// 处理新字段
	if parsed.Mode != "" {
		switch parsed.Mode {
		case "0":
			mode := models.Mode0
			tunnel.Mode = &mode
		case "1":
			mode := models.Mode1
			tunnel.Mode = &mode
		case "2":
			mode := models.Mode2
			tunnel.Mode = &mode
		}
	}
	if parsed.Read != "" {
		tunnel.Read = &parsed.Read
	}
	if parsed.Rate != "" {
		tunnel.Rate = &parsed.Rate
	}

	// 设置默认值
	tunnel.EnableSSEStore = true
	tunnel.EnableLogStore = true

	return tunnel
}

// =============== 隧道 CRUD ===============

func (s *Service) tunnelExists(endpointID int64, instanceID string) (bool, error) {
	var count int64
	err := s.db.Model(&models.Tunnel{}).
		Where("endpoint_id = ? AND instance_id = ?", endpointID, instanceID).
		Count(&count).Error
	return count > 0, err
}

func (s *Service) tunnelCreate(e models.EndpointSSE, cfg parsedURL) error {
	exists, err := s.tunnelExists(e.EndpointID, e.InstanceID)
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

	// 创建隧道记录
	tunnel := models.Tunnel{
		InstanceID:    &e.InstanceID,
		EndpointID:    e.EndpointID,
		Name:          name,
		Type:          models.TunnelType(ptrStringDefault(e.InstanceType, "")),
		Status:        models.TunnelStatus(ptrStringDefault(e.Status, "stopped")),
		TunnelAddress: cfg.TunnelAddress,
		TunnelPort:    cfg.TunnelPort,
		TargetAddress: cfg.TargetAddress,
		TargetPort:    cfg.TargetPort,
		TLSMode:       models.TLSMode(cfg.TLSMode),
		LogLevel:      models.LogLevel(cfg.LogLevel),
		CommandLine:   valueOrEmpty(e.URL, "unknown"),
		Password: func() *string {
			if cfg.Password != "" {
				return &cfg.Password
			}
			return nil
		}(),
		TCPRx:         e.TCPRx,
		TCPTx:         e.TCPTx,
		UDPRx:         e.UDPRx,
		UDPTx:         e.UDPTx,
		Pool:          e.Pool,
		Ping:          e.Ping,
		Restart:       &restart,
		LastEventTime: &e.EventTime,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// 处理可选字段
	if cfg.CertPath != "" {
		tunnel.CertPath = &cfg.CertPath
	}
	if cfg.KeyPath != "" {
		tunnel.KeyPath = &cfg.KeyPath
	}
	if cfg.Min != "" {
		if minVal, err := strconv.ParseInt(cfg.Min, 10, 64); err == nil {
			tunnel.Min = &minVal
		}
	}
	if cfg.Max != "" {
		if maxVal, err := strconv.ParseInt(cfg.Max, 10, 64); err == nil {
			tunnel.Max = &maxVal
		}
	}

	// 处理新字段
	if cfg.Mode != "" {
		switch cfg.Mode {
		case "0":
			mode := models.Mode0
			tunnel.Mode = &mode
		case "1":
			mode := models.Mode1
			tunnel.Mode = &mode
		case "2":
			mode := models.Mode2
			tunnel.Mode = &mode
		}
	}
	if cfg.Read != "" {
		tunnel.Read = &cfg.Read
	}
	if cfg.Rate != "" {
		tunnel.Rate = &cfg.Rate
	}

	// 设置默认值
	tunnel.EnableSSEStore = true
	tunnel.EnableLogStore = true

	err = s.db.Create(&tunnel).Error
	if err != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s创建隧道失败,err=%v", e.EndpointID, e.InstanceID, err)
		return err
	}
	log.Infof("[Master-%d#SSE]Inst.%s创建隧道成功", e.EndpointID, e.InstanceID)

	// 更新端点隧道计数
	err = s.updateEndpointTunnelCount(e.EndpointID)
	if err != nil {
		log.Errorf("[Master-%d#SSE]更新端点隧道计数失败: %v", e.EndpointID, err)
	}
	return err
}

func (s *Service) tunnelUpdate(e models.EndpointSSE, cfg parsedURL) error {
	// 查询现有隧道记录
	var existingTunnel models.Tunnel
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&existingTunnel).Error
	if err == gorm.ErrRecordNotFound {
		log.Infof("[Master-%d#SSE]Inst.%s不存在，跳过更新", e.EndpointID, e.InstanceID)
		return nil // 尚未创建对应记录，等待后续 create/initial
	}
	if err != nil {
		return err // 查询错误
	}

	// 若事件时间早于已记录时间，跳过更新
	if existingTunnel.LastEventTime != nil && !e.EventTime.After(*existingTunnel.LastEventTime) {
		log.Infof("[Master-%d#SSE]Inst.%s旧事件时间，跳过更新", e.EndpointID, e.InstanceID)
		return nil
	}

	// 准备更新字段
	updates := map[string]interface{}{
		"tcp_rx":         e.TCPRx,
		"tcp_tx":         e.TCPTx,
		"udp_rx":         e.UDPRx,
		"udp_tx":         e.UDPTx,
		"pool":           e.Pool,
		"ping":           e.Ping,
		"tunnel_address": cfg.TunnelAddress,
		"tunnel_port":    cfg.TunnelPort,
		"target_address": cfg.TargetAddress,
		"target_port":    cfg.TargetPort,
		"tls_mode":       cfg.TLSMode,
		"log_level":      cfg.LogLevel,
		"command_line":   valueOrEmpty(e.URL, "unknown"),
		"password": func() *string {
			if cfg.Password != "" {
				return &cfg.Password
			}
			return nil
		}(),
		"last_event_time": e.EventTime,
		"updated_at":      time.Now(),
	}

	// 处理可选字段
	if e.Status != nil {
		updates["status"] = models.TunnelStatus(*e.Status)
	}
	if e.Alias != nil && *e.Alias != "" {
		updates["name"] = *e.Alias
		log.Infof("[Master-%d#SSE]Inst.%s别名变化: %s -> %s", e.EndpointID, e.InstanceID, existingTunnel.Name, *e.Alias)
	}
	if e.InstanceType != nil {
		updates["mode"] = models.TunnelType(*e.InstanceType)
	}
	if e.Restart != nil {
		updates["restart"] = *e.Restart
		log.Infof("[Master-%d#SSE]Inst.%s重启策略变化: %t -> %t", e.EndpointID, e.InstanceID, existingTunnel.Restart, *e.Restart)
	}
	if cfg.CertPath != "" {
		updates["cert_path"] = cfg.CertPath
	}
	if cfg.KeyPath != "" {
		updates["key_path"] = cfg.KeyPath
	}
	if cfg.Min != "" {
		if minVal, err := strconv.ParseInt(cfg.Min, 10, 64); err == nil {
			updates["min"] = minVal
		}
	}
	if cfg.Max != "" {
		if maxVal, err := strconv.ParseInt(cfg.Max, 10, 64); err == nil {
			updates["max"] = maxVal
		}
	}

	// 处理新字段
	if cfg.Mode != "" {
		switch cfg.Mode {
		case "0":
			updates["mode"] = models.Mode0
		case "1":
			updates["mode"] = models.Mode1
		case "2":
			updates["mode"] = models.Mode2
		}
	}
	if cfg.Read != "" {
		updates["read"] = cfg.Read
	}
	if cfg.Rate != "" {
		updates["rate"] = cfg.Rate
	}

	// 执行更新
	result := s.db.Model(&models.Tunnel{}).
		Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).
		Updates(updates)

	if result.Error != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s更新隧道失败,err=%v", e.EndpointID, e.InstanceID, result.Error)
		return result.Error
	}
	log.Infof("[Master-%d#SSE]Inst.%s更新隧道成功", e.EndpointID, e.InstanceID)
	return nil
}

func (s *Service) tunnelDelete(endpointID int64, instanceID string) error {
	exists, err := s.tunnelExists(endpointID, instanceID)
	if err != nil {
		return err
	}
	if !exists {
		log.Debugf("[Master-%d#SSE]Inst.%s不存在，跳过删除", endpointID, instanceID)
		return nil // 无需删除
	}

	result := s.db.Where("endpoint_id = ? AND instance_id = ?", endpointID, instanceID).Delete(&models.Tunnel{})
	if result.Error != nil {
		log.Errorf("[Master-%d#SSE]Inst.%s删除隧道失败,err=%v", endpointID, instanceID, result.Error)
		return result.Error
	}
	log.Infof("[Master-%d#SSE]Inst.%s删除隧道成功", endpointID, instanceID)

	// 更新端点隧道计数
	err = s.updateEndpointTunnelCount(endpointID)
	if err != nil {
		log.Errorf("[Master-%d#SSE]更新端点隧道计数失败: %v", endpointID, err)
	}
	return err
}

// tunnelCreateOrUpdate 根据隧道是否存在来决定创建或更新
func (s *Service) tunnelCreateOrUpdate(e models.EndpointSSE, cfg parsedURL) error {
	exists, err := s.tunnelExists(e.EndpointID, e.InstanceID)
	if err != nil {
		return err
	}

	if exists {
		log.Infof("[Master-%d#SSE]Inst.%s已存在，执行更新操作", e.EndpointID, e.InstanceID)
		return s.tunnelUpdate(e, cfg)
	} else {
		log.Infof("[Master-%d#SSE]Inst.%s不存在，执行创建操作", e.EndpointID, e.InstanceID)
		return s.tunnelCreate(e, cfg)
	}
}

// updateEndpointTunnelCount 更新端点的隧道计数
func (s *Service) updateEndpointTunnelCount(endpointID int64) error {
	var count int64
	err := s.db.Model(&models.Tunnel{}).Where("endpoint_id = ?", endpointID).Count(&count).Error
	if err != nil {
		return err
	}

	err = s.db.Model(&models.Endpoint{}).Where("id = ?", endpointID).Update("tunnel_count", count).Error
	if err != nil {
		return err
	}

	log.Infof("[Master-%d#SSE]更新端点隧道计数为: %d", endpointID, count)
	return nil
}

func ptrStringDefault(s *string, def string) string {
	if s == nil || *s == "" {
		return def
	}
	return *s
}
