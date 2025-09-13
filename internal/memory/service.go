package memory

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/traffic"
	"context"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

// StatusChangeListener 状态变化监听器接口
type StatusChangeListener interface {
	OnStatusChange(endpointID int64, tunnelID string, eventType, fromStatus, toStatus, reason string, duration int64)
}

// SSEEventListener SSE 事件监听器接口
type SSEEventListener interface {
	OnSSEEvent(endpointID int64, event models.EndpointSSE)
}

// Service 内存管理服务
type Service struct {
	manager *Manager
	db      *gorm.DB

	// 流量历史管理器
	trafficHistory *traffic.HistoryManager

	// 持久化控制
	persistChan chan PersistRequest

	// 状态变化监听器
	statusChangeListeners []StatusChangeListener
	listenersMutex        sync.RWMutex

	// SSE 事件监听器
	sseEventListeners []SSEEventListener
	sseListenersMutex sync.RWMutex

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// PersistRequest 持久化请求
type PersistRequest struct {
	EndpointID int64
	Type       PersistType
	Data       interface{}
}

// PersistType 持久化类型
type PersistType int

const (
	PersistTypeTrafficDelta  PersistType = iota // 流量差值持久化
	PersistTypeTunnelState                      // 隧道状态持久化
	PersistTypeEndpointState                    // 端点状态持久化
)

// NewService 创建内存管理服务
func NewService(db *gorm.DB) *Service {
	ctx, cancel := context.WithCancel(context.Background())

	s := &Service{
		manager:        NewManager(),
		db:             db,
		trafficHistory: traffic.NewHistoryManager(db),
		persistChan:    make(chan PersistRequest, 1000), // 持久化请求队列
		ctx:            ctx,
		cancel:         cancel,
	}

	// 启动持久化 worker
	s.startPersistWorkers(2)

	// 启动定时持久化
	s.startPeriodicPersist()

	return s
}

// AddStatusChangeListener 添加状态变化监听器
func (s *Service) AddStatusChangeListener(listener StatusChangeListener) {
	s.listenersMutex.Lock()
	defer s.listenersMutex.Unlock()
	s.statusChangeListeners = append(s.statusChangeListeners, listener)
}

// RemoveStatusChangeListener 移除状态变化监听器
func (s *Service) RemoveStatusChangeListener(listener StatusChangeListener) {
	s.listenersMutex.Lock()
	defer s.listenersMutex.Unlock()

	for i, l := range s.statusChangeListeners {
		if l == listener {
			s.statusChangeListeners = append(s.statusChangeListeners[:i], s.statusChangeListeners[i+1:]...)
			break
		}
	}
}

// notifyStatusChange 通知状态变化
func (s *Service) notifyStatusChange(endpointID int64, tunnelID string, eventType, fromStatus, toStatus, reason string, duration int64) {
	s.listenersMutex.RLock()
	listeners := make([]StatusChangeListener, len(s.statusChangeListeners))
	copy(listeners, s.statusChangeListeners)
	s.listenersMutex.RUnlock()

	// 异步通知所有监听器
	for _, listener := range listeners {
		go func(l StatusChangeListener) {
			defer func() {
				if r := recover(); r != nil {
					log.Errorf("状态变化监听器异常: %v", r)
				}
			}()
			l.OnStatusChange(endpointID, tunnelID, eventType, fromStatus, toStatus, reason, duration)
		}(listener)
	}
}

// AddSSEEventListener 添加 SSE 事件监听器
func (s *Service) AddSSEEventListener(listener SSEEventListener) {
	s.sseListenersMutex.Lock()
	defer s.sseListenersMutex.Unlock()
	s.sseEventListeners = append(s.sseEventListeners, listener)
}

// RemoveSSEEventListener 移除 SSE 事件监听器
func (s *Service) RemoveSSEEventListener(listener SSEEventListener) {
	s.sseListenersMutex.Lock()
	defer s.sseListenersMutex.Unlock()

	for i, l := range s.sseEventListeners {
		if l == listener {
			s.sseEventListeners = append(s.sseEventListeners[:i], s.sseEventListeners[i+1:]...)
			break
		}
	}
}

// notifySSEEvent 通知 SSE 事件
func (s *Service) notifySSEEvent(endpointID int64, event models.EndpointSSE) {
	s.sseListenersMutex.RLock()
	listeners := make([]SSEEventListener, len(s.sseEventListeners))
	copy(listeners, s.sseEventListeners)
	s.sseListenersMutex.RUnlock()

	// 异步通知所有监听器
	for _, listener := range listeners {
		go func(l SSEEventListener) {
			defer func() {
				if r := recover(); r != nil {
					log.Errorf("SSE 事件监听器异常: %v", r)
				}
			}()
			l.OnSSEEvent(endpointID, event)
		}(listener)
	}
}

// LoadEndpointsFromDB 从数据库加载端点数据到内存
func (s *Service) LoadEndpointsFromDB() error {
	var endpoints []models.Endpoint
	if err := s.db.Find(&endpoints).Error; err != nil {
		return fmt.Errorf("加载端点数据失败: %v", err)
	}

	log.Infof("从数据库加载 %d 个端点到内存", len(endpoints))

	for _, endpoint := range endpoints {
		shared := s.manager.InitEndpoint(&endpoint)

		// 加载该端点的隧道数据
		var tunnels []models.Tunnel
		if err := s.db.Where("endpoint_id = ?", endpoint.ID).Find(&tunnels).Error; err != nil {
			log.Errorf("加载端点 %d 的隧道数据失败: %v", endpoint.ID, err)
			continue
		}

		// 初始化隧道状态到内存
		for _, tunnel := range tunnels {
			if tunnel.InstanceID == nil {
				continue
			}

			tunnelState := &TunnelState{
				InstanceID:     *tunnel.InstanceID,
				InstanceType:   stringPtr(string(tunnel.Type)),
				Status:         stringPtr(string(tunnel.Status)),
				TCPRx:          tunnel.TCPRx,
				TCPTx:          tunnel.TCPTx,
				UDPRx:          tunnel.UDPRx,
				UDPTx:          tunnel.UDPTx,
				Pool:           tunnel.Pool,
				Ping:           tunnel.Ping,
				LastUpdateTime: tunnel.UpdatedAt,
			}

			if tunnel.LastEventTime.Valid {
				tunnelState.LastEventTime = tunnel.LastEventTime.Time
			}

			shared.State.Tunnels[*tunnel.InstanceID] = tunnelState
		}

		// 初始化流量快照
		s.initTrafficSnapshot(shared)

		log.Debugf("端点 %d 加载完成，包含 %d 个隧道", endpoint.ID, len(shared.State.Tunnels))
	}

	return nil
}

// ProcessSSEEvent 处理 SSE 事件（内存优先）
func (s *Service) ProcessSSEEvent(endpointID int64, event models.EndpointSSE) error {
	// 首先更新内存状态
	if err := s.updateMemoryState(endpointID, event); err != nil {
		log.Errorf("更新内存状态失败: %v", err)
		return err
	}

	// 通知 SSE 事件监听器（例如 Metrics 系统）
	s.notifySSEEvent(endpointID, event)

	// 异步持久化（根据事件类型决定是否立即持久化）
	switch event.EventType {
	case models.SSEEventTypeCreate, models.SSEEventTypeDelete:
		// 关键事件立即持久化
		s.asyncPersist(PersistRequest{
			EndpointID: endpointID,
			Type:       PersistTypeTunnelState,
			Data:       event,
		})
	case models.SSEEventTypeUpdate:
		// 更新事件批量持久化
		s.asyncPersist(PersistRequest{
			EndpointID: endpointID,
			Type:       PersistTypeTrafficDelta,
			Data:       event,
		})
	case models.SSEEventTypeShutdown:
		// 端点关闭事件
		s.asyncPersist(PersistRequest{
			EndpointID: endpointID,
			Type:       PersistTypeEndpointState,
			Data:       event,
		})
	}

	return nil
}

// GetEndpointState 获取端点实时状态（从内存）
func (s *Service) GetEndpointState(endpointID int64) *EndpointShared {
	return s.manager.GetEndpoint(endpointID)
}

// GetAllEndpointStates 获取所有端点实时状态（从内存）
func (s *Service) GetAllEndpointStates() map[int64]*EndpointShared {
	return s.manager.GetAllEndpoints()
}

// GetTunnelState 获取隧道实时状态（从内存）
func (s *Service) GetTunnelState(endpointID int64, instanceID string) *TunnelState {
	endpoint := s.manager.GetEndpoint(endpointID)
	if endpoint == nil {
		return nil
	}

	endpoint.Mu.RLock()
	defer endpoint.Mu.RUnlock()

	return endpoint.State.Tunnels[instanceID]
}

// updateMemoryState 更新内存状态
func (s *Service) updateMemoryState(endpointID int64, event models.EndpointSSE) error {
	endpoint := s.manager.GetEndpoint(endpointID)
	if endpoint == nil {
		// 端点不存在，尝试从数据库加载
		var ep models.Endpoint
		if err := s.db.First(&ep, endpointID).Error; err != nil {
			return fmt.Errorf("端点 %d 不存在: %v", endpointID, err)
		}
		endpoint = s.manager.InitEndpoint(&ep)
	}

	// 根据事件类型更新状态
	switch event.EventType {
	case models.SSEEventTypeShutdown:
		return s.handleShutdownEvent(endpoint, event)
	case models.SSEEventTypeInitial:
		return s.handleInitialEvent(endpoint, event)
	case models.SSEEventTypeCreate:
		return s.handleCreateEvent(endpoint, event)
	case models.SSEEventTypeUpdate:
		return s.handleUpdateEvent(endpoint, event)
	case models.SSEEventTypeDelete:
		return s.handleDeleteEvent(endpoint, event)
	case models.SSEEventTypeLog:
		// 日志事件不更新内存状态，只记录时间
		endpoint.Mu.Lock()
		endpoint.State.LastEventTime = event.EventTime
		endpoint.Mu.Unlock()
	}

	return nil
}

// handleShutdownEvent 处理关闭事件
func (s *Service) handleShutdownEvent(endpoint *EndpointShared, event models.EndpointSSE) error {
	endpoint.Mu.Lock()

	// 记录原始状态用于通知
	previousStatus := endpoint.State.Status

	endpoint.State.Status = models.EndpointStatusOffline
	endpoint.State.ConnectionStatus = false
	endpoint.State.LastEventTime = event.EventTime
	endpoint.State.LastUpdateTime = time.Now()

	// 将所有隧道设为离线状态
	for instanceID, tunnel := range endpoint.State.Tunnels {
		oldStatus := ""
		if tunnel.Status != nil {
			oldStatus = *tunnel.Status
		}

		tunnel.Status = stringPtr("stopped")
		tunnel.LastUpdateTime = time.Now()
		tunnel.LastEventTime = event.EventTime

		log.Debugf("端点 %d 关闭，隧道 %s 状态设为停止", event.EndpointID, instanceID)

		// 通知隧道状态变化
		s.notifyStatusChange(event.EndpointID, instanceID, "shutdown", oldStatus, "stopped", "endpoint_shutdown", 0)
	}

	endpoint.Mu.Unlock()

	// 通知端点状态变化
	statusStr := string(previousStatus)
	s.notifyStatusChange(event.EndpointID, "", "endpoint_shutdown", statusStr, string(models.EndpointStatusOffline), "system_shutdown", 0)

	return nil
}

// handleInitialEvent 处理初始化事件
func (s *Service) handleInitialEvent(endpoint *EndpointShared, event models.EndpointSSE) error {
	return s.handleCreateOrUpdateEvent(endpoint, event, true)
}

// handleCreateEvent 处理创建事件
func (s *Service) handleCreateEvent(endpoint *EndpointShared, event models.EndpointSSE) error {
	return s.handleCreateOrUpdateEvent(endpoint, event, false)
}

// handleUpdateEvent 处理更新事件
func (s *Service) handleUpdateEvent(endpoint *EndpointShared, event models.EndpointSSE) error {
	return s.handleCreateOrUpdateEvent(endpoint, event, false)
}

// handleCreateOrUpdateEvent 处理创建或更新事件
func (s *Service) handleCreateOrUpdateEvent(endpoint *EndpointShared, event models.EndpointSSE, isInitial bool) error {
	endpoint.Mu.Lock()
	defer endpoint.Mu.Unlock()

	// 更新端点连接状态
	endpoint.State.ConnectionStatus = true
	endpoint.State.LastEventTime = event.EventTime
	endpoint.State.LastUpdateTime = time.Now()

	if endpoint.State.Status == models.EndpointStatusOffline {
		endpoint.State.Status = models.EndpointStatusOnline
	}

	// 创建或更新隧道状态
	tunnelState := &TunnelState{
		InstanceID:     event.InstanceID,
		InstanceType:   event.InstanceType,
		Status:         event.Status,
		URL:            event.URL,
		Alias:          event.Alias,
		Restart:        event.Restart,
		TCPRx:          event.TCPRx,
		TCPTx:          event.TCPTx,
		UDPRx:          event.UDPRx,
		UDPTx:          event.UDPTx,
		Pool:           event.Pool,
		Ping:           event.Ping,
		LastUpdateTime: time.Now(),
		LastEventTime:  event.EventTime,
	}

	// 计算流量差值
	s.manager.CalculateTrafficDelta(event.EndpointID, event.InstanceID, tunnelState)

	// 更新隧道状态
	endpoint.State.Tunnels[event.InstanceID] = tunnelState

	// 重新计算统计信息
	s.manager.recalculateStats(endpoint)

	log.Debugf("端点 %d 隧道 %s 状态已更新: status=%v", event.EndpointID, event.InstanceID,
		stringDefault(event.Status, "unknown"))

	return nil
}

// handleDeleteEvent 处理删除事件
func (s *Service) handleDeleteEvent(endpoint *EndpointShared, event models.EndpointSSE) error {
	endpoint.Mu.Lock()
	defer endpoint.Mu.Unlock()

	// 从内存中删除隧道
	delete(endpoint.State.Tunnels, event.InstanceID)
	endpoint.State.LastEventTime = event.EventTime
	endpoint.State.LastUpdateTime = time.Now()

	// 重新计算统计信息
	s.manager.recalculateStats(endpoint)

	log.Debugf("端点 %d 隧道 %s 已从内存中删除", event.EndpointID, event.InstanceID)

	return nil
}

// startPersistWorkers 启动持久化 workers
func (s *Service) startPersistWorkers(count int) {
	for i := 0; i < count; i++ {
		s.wg.Add(1)
		go s.persistWorker(i)
	}

	log.Infof("启动了 %d 个内存持久化 worker", count)
}

// persistWorker 持久化 worker
func (s *Service) persistWorker(id int) {
	defer s.wg.Done()

	log.Debugf("持久化 worker %d 已启动", id)

	for {
		select {
		case <-s.ctx.Done():
			log.Debugf("持久化 worker %d 停止", id)
			return
		case req := <-s.persistChan:
			if err := s.processPersistRequest(req); err != nil {
				log.Errorf("持久化请求处理失败: %v", err)
			}
		}
	}
}

// processPersistRequest 处理持久化请求
func (s *Service) processPersistRequest(req PersistRequest) error {
	switch req.Type {
	case PersistTypeTrafficDelta:
		return s.persistTrafficDelta(req.EndpointID, req.Data.(models.EndpointSSE))
	case PersistTypeTunnelState:
		return s.persistTunnelState(req.EndpointID, req.Data.(models.EndpointSSE))
	case PersistTypeEndpointState:
		return s.persistEndpointState(req.EndpointID, req.Data.(models.EndpointSSE))
	default:
		return fmt.Errorf("未知的持久化类型: %v", req.Type)
	}
}

// persistTrafficDelta 持久化流量差值
func (s *Service) persistTrafficDelta(endpointID int64, event models.EndpointSSE) error {
	// 更新隧道的流量数据
	updates := map[string]interface{}{
		"tcp_rx":          event.TCPRx,
		"tcp_tx":          event.TCPTx,
		"udp_rx":          event.UDPRx,
		"udp_tx":          event.UDPTx,
		"updated_at":      time.Now(),
		"last_event_time": event.EventTime,
	}

	// 可选字段
	if event.Pool != nil {
		updates["pool"] = event.Pool
	}
	if event.Ping != nil {
		updates["ping"] = event.Ping
	}
	if event.Status != nil {
		updates["status"] = models.TunnelStatus(*event.Status)
	}

	err := s.db.Model(&models.Tunnel{}).
		Where("endpoint_id = ? AND instance_id = ?", endpointID, event.InstanceID).
		Updates(updates).Error

	if err != nil {
		return fmt.Errorf("更新隧道流量数据失败: %v", err)
	}

	return nil
}

// persistTunnelState 持久化隧道状态
func (s *Service) persistTunnelState(endpointID int64, event models.EndpointSSE) error {
	// 这里处理隧道的创建和删除
	switch event.EventType {
	case models.SSEEventTypeCreate, models.SSEEventTypeInitial:
		// 创建逻辑在原有的 SSE Service 中处理，这里只做补充
		return nil
	case models.SSEEventTypeDelete:
		// 先获取隧道ID，用于删除相关的操作日志
		var tunnel models.Tunnel
		if err := s.db.Where("endpoint_id = ? AND instance_id = ?", endpointID, event.InstanceID).First(&tunnel).Error; err == nil {
			// 先删除相关的操作日志记录，避免外键约束错误
			if err := s.db.Where("tunnel_id = ?", tunnel.ID).Delete(&models.TunnelOperationLog{}).Error; err != nil {
				log.Warnf("删除隧道 %d 操作日志失败: %v", tunnel.ID, err)
			}
		}
		
		err := s.db.Where("endpoint_id = ? AND instance_id = ?", endpointID, event.InstanceID).
			Delete(&models.Tunnel{}).Error
		if err != nil {
			return fmt.Errorf("删除隧道失败: %v", err)
		}
	}
	return nil
}

// persistEndpointState 持久化端点状态
func (s *Service) persistEndpointState(endpointID int64, event models.EndpointSSE) error {
	endpoint := s.manager.GetEndpoint(endpointID)
	if endpoint == nil {
		return fmt.Errorf("端点 %d 不存在于内存中", endpointID)
	}

	endpoint.Mu.RLock()
	status := endpoint.State.Status
	lastCheck := endpoint.State.LastUpdateTime
	endpoint.Mu.RUnlock()

	err := s.db.Model(&models.Endpoint{}).
		Where("id = ?", endpointID).
		Updates(map[string]interface{}{
			"status":     status,
			"last_check": lastCheck,
			"updated_at": time.Now(),
		}).Error

	if err != nil {
		return fmt.Errorf("更新端点状态失败: %v", err)
	}

	return nil
}

// startPeriodicPersist 启动定时持久化
func (s *Service) startPeriodicPersist() {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()

		ticker := time.NewTicker(5 * time.Second) // 每5秒检查一次
		defer ticker.Stop()

		for {
			select {
			case <-s.ctx.Done():
				return
			case <-ticker.C:
				if s.manager.NeedsPersist() {
					s.batchPersistTrafficData()
					s.manager.MarkPersisted()
				}
			}
		}
	}()
}

// batchPersistTrafficData 批量持久化流量数据
func (s *Service) batchPersistTrafficData() {
	endpoints := s.manager.GetAllEndpoints()

	for endpointID, endpoint := range endpoints {
		endpoint.Mu.RLock()
		snapshot := endpoint.State.TrafficSnapshot
		tunnels := make(map[string]*TunnelState)

		// 复制隧道数据
		for id, tunnel := range endpoint.State.Tunnels {
			tunnels[id] = tunnel
		}
		endpoint.Mu.RUnlock()

		if snapshot != nil && (snapshot.DeltaTCPRx > 0 || snapshot.DeltaTCPTx > 0 ||
			snapshot.DeltaUDPRx > 0 || snapshot.DeltaUDPTx > 0) {

			// 将差值数据写入流量历史管理器
			for instanceID, tunnel := range tunnels {
				s.trafficHistory.AddTrafficPoint(
					endpointID, instanceID,
					tunnel.TCPRx, tunnel.TCPTx, tunnel.UDPRx, tunnel.UDPTx,
					snapshot.DeltaTCPRx, snapshot.DeltaTCPTx,
					snapshot.DeltaUDPRx, snapshot.DeltaUDPTx,
				)
			}

			log.Debugf("端点 %d 流量差值已记录: TCP(Rx:%d,Tx:%d) UDP(Rx:%d,Tx:%d)",
				endpointID, snapshot.DeltaTCPRx, snapshot.DeltaTCPTx,
				snapshot.DeltaUDPRx, snapshot.DeltaUDPTx)

			// 重置差值
			endpoint.Mu.Lock()
			snapshot.DeltaTCPRx = 0
			snapshot.DeltaTCPTx = 0
			snapshot.DeltaUDPRx = 0
			snapshot.DeltaUDPTx = 0
			endpoint.Mu.Unlock()
		}

		// 批量更新隧道的流量数据
		for instanceID, tunnel := range tunnels {
			updates := map[string]interface{}{
				"tcp_rx":          tunnel.TCPRx,
				"tcp_tx":          tunnel.TCPTx,
				"udp_rx":          tunnel.UDPRx,
				"udp_tx":          tunnel.UDPTx,
				"updated_at":      tunnel.LastUpdateTime,
				"last_event_time": tunnel.LastEventTime,
			}

			if tunnel.Pool != nil {
				updates["pool"] = tunnel.Pool
			}
			if tunnel.Ping != nil {
				updates["ping"] = tunnel.Ping
			}
			if tunnel.Status != nil {
				updates["status"] = models.TunnelStatus(*tunnel.Status)
			}

			err := s.db.Model(&models.Tunnel{}).
				Where("endpoint_id = ? AND instance_id = ?", endpointID, instanceID).
				Updates(updates).Error

			if err != nil {
				log.Errorf("批量更新隧道 %s 流量数据失败: %v", instanceID, err)
			}
		}
	}
}

// asyncPersist 异步持久化
func (s *Service) asyncPersist(req PersistRequest) {
	select {
	case s.persistChan <- req:
		// 成功投递到持久化队列
	default:
		// 队列满，丢弃请求
		log.Warnf("持久化队列已满，丢弃请求: endpointID=%d type=%v", req.EndpointID, req.Type)
	}
}

// initTrafficSnapshot 初始化流量快照
func (s *Service) initTrafficSnapshot(endpoint *EndpointShared) {
	endpoint.Mu.Lock()
	defer endpoint.Mu.Unlock()

	var totalTCPRx, totalTCPTx, totalUDPRx, totalUDPTx int64

	for _, tunnel := range endpoint.State.Tunnels {
		totalTCPRx += tunnel.TCPRx
		totalTCPTx += tunnel.TCPTx
		totalUDPRx += tunnel.UDPRx
		totalUDPTx += tunnel.UDPTx
	}

	endpoint.State.TrafficSnapshot = &TrafficSnapshot{
		LastTCPRx:    totalTCPRx,
		LastTCPTx:    totalTCPTx,
		LastUDPRx:    totalUDPRx,
		LastUDPTx:    totalUDPTx,
		SnapshotTime: time.Now(),
	}
}

// GetMemoryStats 获取内存管理统计信息
func (s *Service) GetMemoryStats() map[string]interface{} {
	stats := s.manager.GetStats()

	// 添加持久化队列统计
	stats["persist_queue_len"] = len(s.persistChan)
	stats["persist_queue_cap"] = cap(s.persistChan)

	// 添加流量历史统计
	if s.trafficHistory != nil {
		stats["traffic_history"] = s.trafficHistory.GetStats()
	}

	return stats
}

// GetTrafficTrend 获取流量趋势数据
func (s *Service) GetTrafficTrend(endpointID int64, instanceID string, hours int) ([]interface{}, error) {
	if s.trafficHistory == nil {
		return nil, fmt.Errorf("流量历史管理器未初始化")
	}

	if instanceID != "" {
		// 获取特定隧道的流量趋势
		records, err := s.trafficHistory.GetTrafficTrend(endpointID, instanceID, hours)
		if err != nil {
			return nil, err
		}

		// 转换为前端需要的格式
		result := make([]interface{}, len(records))
		for i, record := range records {
			result[i] = map[string]interface{}{
				"timestamp":   record.Timestamp.Unix(),
				"tcp_rx":      record.TCPRxTotal,
				"tcp_tx":      record.TCPTxTotal,
				"udp_rx":      record.UDPRxTotal,
				"udp_tx":      record.UDPTxTotal,
				"tcp_rx_rate": record.TCPRxDelta,
				"tcp_tx_rate": record.TCPTxDelta,
				"udp_rx_rate": record.UDPRxDelta,
				"udp_tx_rate": record.UDPTxDelta,
			}
		}
		return result, nil
	} else {
		// 获取端点的所有隧道流量趋势（聚合）
		records, err := s.trafficHistory.GetEndpointTrafficTrend(endpointID, hours)
		if err != nil {
			return nil, err
		}

		// 转换为接口切片
		result := make([]interface{}, len(records))
		for i, record := range records {
			result[i] = record
		}
		return result, nil
	}
}

// Close 关闭服务
func (s *Service) Close() {
	log.Info("正在关闭内存管理服务")

	// 最后一次持久化
	s.batchPersistTrafficData()

	// 关闭流量历史管理器
	if s.trafficHistory != nil {
		s.trafficHistory.Close()
	}

	// 停止所有 workers
	s.cancel()
	s.wg.Wait()

	log.Info("内存管理服务已关闭")
}

// 工具函数
func stringPtr(s string) *string {
	return &s
}

func stringDefault(s *string, def string) string {
	if s == nil {
		return def
	}
	return *s
}
