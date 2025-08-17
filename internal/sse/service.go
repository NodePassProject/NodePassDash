package sse

import (
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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

	// 历史数据处理Worker（类似Nezha的ServiceHistory）
	historyWorker *HistoryWorker

	// 异步持久化队列
	storeJobCh chan models.EndpointSSE // 事件持久化任务队列

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
		clients:         make(map[string]*Client),
		tunnelSubs:      make(map[string]map[string]*Client),
		db:              db,
		endpointService: endpointService,
		historyWorker:   NewHistoryWorker(db),
		storeJobCh:      make(chan models.EndpointSSE, 20000), // 增加缓冲大小到20000
		fileLogger:      log.NewFileLogger(logDir),
		ctx:             ctx,
		cancel:          cancel,
	}

	s.StartStoreWorkers(8)

	return s
}

// SetManager 设置Manager引用
func (s *Service) SetManager(manager *Manager) {
	s.manager = manager
}

// Close 关闭服务
func (s *Service) Close() {
	log.Info("正在关闭SSE服务")

	// 停止上下文
	s.cancel()

	// 关闭历史数据Worker
	if s.historyWorker != nil {
		s.historyWorker.Close()
	}

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

// ======================== 前端SSE处理器 ============================

// AddClient 添加客户端
func (s *Service) AddClient(clientID string, w http.ResponseWriter) {
	s.mu.Lock()
	defer s.mu.Unlock()

	client := &Client{
		ID:     clientID,
		Writer: w,
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

// ======================== Worker ============================

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
		if event.EventType == models.SSEEventTypeLog {
			// 写入文件日志
			logContent := ""
			if event.Logs != nil {
				logContent = *event.Logs
			}

			if err := s.fileLogger.WriteLog(event.EndpointID, event.InstanceID, logContent); err != nil {
				log.Warnf("[Master-%d]写入文件日志失败: %v", event.EndpointID, err)
			}

			// 推流转发给前端订阅
			// log.Debugf("[Master-%d#SSE]准备推送事件给前端，eventType=%s instanceID=%s", endpointID, event.EventType, event.InstanceID)
			s.sendTunnelUpdateByInstanceId(event.InstanceID, event)
		}
	}
}

// ======================== 事件处理器 ============================

// ProcessEvent 处理SSE事件（回滚到原来的直接更新逻辑）
func (s *Service) ProcessEvent(endpointID int64, event models.EndpointSSE) error {
	// 异步处理事件，避免阻塞SSE接收
	// select {
	// case s.storeJobCh <- event:
	// 	// 成功投递到存储队列
	// default:
	// 	log.Warnf("[Master-%d]事件存储队列已满，丢弃事件", endpointID)
	// 	return fmt.Errorf("存储队列已满")
	// }

	switch event.EventType {
	case models.SSEEventTypeShutdown:
		s.handleShutdownEvent(event)
	case models.SSEEventTypeInitial:
		s.handleInitialEvent(event)
	case models.SSEEventTypeCreate:
		s.handleCreateEvent(event)
	case models.SSEEventTypeUpdate:
		// 保留History Worker逻辑（参照Nezha的逻辑）
		if s.historyWorker != nil {
			s.historyWorker.Dispatch(event)
		}
		s.handleUpdateEvent(event)
	case models.SSEEventTypeDelete:
		s.handleDeleteEvent(event)
	case models.SSEEventTypeLog:
		s.handleLogEvent(event)
	}
	return nil
}

// 事件处理方法
func (s *Service) handleInitialEvent(e models.EndpointSSE) {
	// SSE initial 事件表示端点重新连接时报告现有隧道状态
	log.Debugf("[Master-%d]处理初始化事件: 隧道 %s", e.EndpointID, e.InstanceID)
	if e.InstanceType == nil || *e.InstanceType == "" {
		// 当InstanceType为空时，尝试获取端点系统信息
		go s.fetchAndUpdateEndpointInfo(e.EndpointID)
		return
	}

	// 检查隧道是否已存在
	if err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&models.Tunnel{}).Error; err == nil {
		// 隧道已存在（正常情况），更新运行时信息
		log.Debugf("[Master-%d]隧道 %s 已存在，更新运行时信息", e.EndpointID, e.InstanceID)
		s.updateTunnelRuntimeInfo(e)
		return
	} else if err != gorm.ErrRecordNotFound {
		log.Errorf("[Master-%d]查询隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
		return
	} else {
		// 创建最小化隧道记录，包含从EndpointSSE获取的流量等信息
		tunnel := nodepass.ParseTunnelURL(*e.URL)
		// 补充从EndpointSSE获取的信息
		tunnel.EndpointID = e.EndpointID
		tunnel.InstanceID = &e.InstanceID
		tunnel.TCPRx = e.TCPRx
		tunnel.TCPTx = e.TCPTx
		tunnel.UDPRx = e.UDPRx
		tunnel.UDPTx = e.UDPTx
		tunnel.Pool = e.Pool
		tunnel.Ping = e.Ping
		tunnel.LastEventTime = &e.EventTime
		tunnel.EnableLogStore = true

		// 设置可选字段
		if e.Status != nil {
			tunnel.Status = models.TunnelStatus(*e.Status)
		}
		if e.Alias != nil && *e.Alias != "" {
			tunnel.Name = *e.Alias
		}
		if e.InstanceType != nil {
			tunnel.Type = models.TunnelType(*e.InstanceType)
		}
		if e.Restart != nil {
			tunnel.Restart = e.Restart
		}

		if err = s.db.Create(&tunnel).Error; err != nil {
			log.Errorf("[Master-%d]初始化隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
		} else {
			log.Infof("[Master-%d]最小化隧道记录 %s 初始化成功，包含流量信息", e.EndpointID, e.InstanceID)
			s.updateEndpointTunnelCount(e.EndpointID)
		}
	}
}

func (s *Service) handleCreateEvent(e models.EndpointSSE) {
	// SSE create 事件表示 NodePass 客户端报告隧道创建成功
	// 此时隧道记录应该已经由 API 创建，我们只需要更新状态和流量信息
	log.Debugf("[Master-%d]处理创建事件: 隧道 %s", e.EndpointID, e.InstanceID)
	// 先解析 URL 获取隧道配置信息
	var tunnel *models.Tunnel = nodepass.ParseTunnelURL(*e.URL)
	// 设置默认值
	tunnel.EnableLogStore = true

	// 补充从EndpointSSE获取的信息
	tunnel.EndpointID = e.EndpointID
	tunnel.InstanceID = &e.InstanceID
	tunnel.TCPRx = e.TCPRx
	tunnel.TCPTx = e.TCPTx
	tunnel.UDPRx = e.UDPRx
	tunnel.UDPTx = e.UDPTx
	tunnel.Pool = e.Pool
	tunnel.Ping = e.Ping
	tunnel.LastEventTime = &e.EventTime

	// 设置可选字段
	if e.Status != nil {
		tunnel.Status = models.TunnelStatus(*e.Status)
	}
	if e.Alias != nil && *e.Alias != "" {
		tunnel.Name = *e.Alias
	}
	if e.InstanceType != nil {
		tunnel.Type = models.TunnelType(*e.InstanceType)
	}
	if e.Restart != nil {
		tunnel.Restart = e.Restart
	}

	// 使用 OnConflict 子句处理冲突情况
	// 如果 endpoint_id + instance_id 已存在，则更新相关字段
	if err := s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "endpoint_id"},
			{Name: "instance_id"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"tcp_rx", "tcp_tx", "udp_rx", "udp_tx", "pool", "ping",
			"tunnel_address", "tunnel_port", "target_address", "target_port",
			"tls_mode", "log_level", "command_line", "password", "cert_path", "key_path",
			"min", "max", "mode", "read", "rate", "restart", "last_event_time", "updated_at",
		}),
	}).Create(&tunnel).Error; err != nil {
		log.Errorf("[Master-%d]创建/更新隧道记录 %s 失败: %v", e.EndpointID, e.InstanceID, err)
	} else {
		log.Infof("[Master-%d]隧道记录 %s 处理成功（创建或更新）", e.EndpointID, e.InstanceID)
		s.updateEndpointTunnelCount(e.EndpointID)
	}
}

func (s *Service) handleUpdateEvent(e models.EndpointSSE) {
	// SSE update 事件用于更新隧道的运行时信息
	log.Debugf("[Master-%d]处理更新事件: 隧道 %s", e.EndpointID, e.InstanceID)

	// 先检查隧道是否存在
	if err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).First(&models.Tunnel{}).Error; err != nil {
		log.Errorf("[Master-%d]查询隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
		return
	} else if err == gorm.ErrRecordNotFound {
		// 隧道不存在，可能是时序问题（SSE 事件比 API 创建先到达）
		log.Warnf("[Master-%d]收到更新事件但隧道 %s 不存在，可能是时序问题，跳过处理", e.EndpointID, e.InstanceID)
		return
	}

	// 更新运行时信息
	s.updateTunnelRuntimeInfo(e)
}

func (s *Service) handleDeleteEvent(e models.EndpointSSE) {
	// 删除隧道记录
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).Delete(&models.Tunnel{}).Error

	if err != nil {
		log.Errorf("[Master-%d]删除隧道 %s 失败: %v", e.EndpointID, e.InstanceID, err)
	} else {
		log.Infof("[Master-%d]隧道 %s 删除成功", e.EndpointID, e.InstanceID)
		// 更新端点隧道计数
		s.updateEndpointTunnelCount(e.EndpointID)
	}
}

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
	// 推流转发给前端订阅
	// log.Debugf("[Master-%d#SSE]准备推送事件给前端，eventType=%s instanceID=%s", endpointID, event.EventType, event.InstanceID)
	s.sendTunnelUpdateByInstanceId(e.InstanceID, e)
}

func (s *Service) handleShutdownEvent(event models.EndpointSSE) {
	// 使用GORM更新端点状态
	if err := s.db.Model(&models.Endpoint{}).
		Where("id = ?", event.EndpointID).
		Updates(map[string]interface{}{
			"status":     models.EndpointStatusOffline,
			"last_check": time.Now(),
			"updated_at": time.Now(),
		}).Error; err != nil {
		log.Errorf("[Master-%d#SSE]更新端点状态失败: %v", event.EndpointID, err)
		return
	}

	log.Infof("[Master-%d]端点状态已更新为: %s", event.EndpointID, models.EndpointStatusOffline)

	// 如果端点状态变为离线，设置所有相关隧道为离线状态
	if err := s.setTunnelsOfflineForEndpoint(event.EndpointID); err != nil {
		log.Errorf("[Master-%d]设置隧道离线状态失败: %v", event.EndpointID, err)
	}

	// 通知Manager状态变化
	s.manager.NotifyEndpointStatusChanged(event.EndpointID, string(models.EndpointStatusOffline))
}

// updateTunnelRuntimeInfo 更新隧道运行时信息（流量、状态、ping等）
func (s *Service) updateTunnelRuntimeInfo(e models.EndpointSSE) {
	// 准备更新字段
	cfg := nodepass.ParseTunnelURL(*e.URL)
	updates := map[string]interface{}{
		"tcp_rx":          e.TCPRx,
		"tcp_tx":          e.TCPTx,
		"udp_rx":          e.UDPRx,
		"udp_tx":          e.UDPTx,
		"pool":            e.Pool,
		"ping":            e.Ping,
		"tunnel_address":  cfg.TunnelAddress,
		"tunnel_port":     cfg.TunnelPort,
		"target_address":  cfg.TargetAddress,
		"target_port":     cfg.TargetPort,
		"tls_mode":        cfg.TLSMode,
		"log_level":       cfg.LogLevel,
		"command_line":    e.URL,
		"password":        cfg.Password, // 直接使用指针类型
		"restart":         e.Restart,    // 添加restart字段更新
		"last_event_time": e.EventTime,
		"updated_at":      time.Now(),
	}

	// 处理可选字段
	if e.Status != nil {
		updates["status"] = models.TunnelStatus(*e.Status)
	}
	if e.Alias != nil && *e.Alias != "" {
		updates["name"] = *e.Alias
	}
	if e.InstanceType != nil {
		updates["mode"] = models.TunnelType(*e.InstanceType)
	}
	if cfg.CertPath != nil {
		updates["cert_path"] = cfg.CertPath
	}
	if cfg.KeyPath != nil {
		updates["key_path"] = cfg.KeyPath
	}
	if cfg.Min != nil {
		updates["min"] = cfg.Min
	}
	if cfg.Max != nil {
		updates["max"] = cfg.Max
	}

	// 处理新字段
	if cfg.Mode != nil {
		updates["mode"] = cfg.Mode
	}
	if cfg.Read != nil {
		updates["read"] = cfg.Read
	}
	if cfg.Rate != nil {
		updates["rate"] = cfg.Rate
	}

	// 更新 tunnel 表
	result := s.db.Model(&models.Tunnel{}).
		Where("endpoint_id = ? AND instance_id = ?", e.EndpointID, e.InstanceID).
		Updates(updates)

	if result.Error != nil {
		log.Errorf("[Master-%d]更新隧道 %s 运行时信息失败: %v", e.EndpointID, e.InstanceID, result.Error)
		return
	}

	log.Debugf("[Master-%d]隧道 %s 运行时信息已更新: tcp_rx=%d, tcp_tx=%d, udp_rx=%d, udp_tx=%d, restart=%v, status=%v",
		e.EndpointID, e.InstanceID, e.TCPRx, e.TCPTx, e.UDPRx, e.UDPTx, e.Restart, e.Status)
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

// updateEndpointTunnelCount 更新端点的隧道计数
func (s *Service) updateEndpointTunnelCount(endpointID int64) {
	var count int64
	if err := s.db.Exec(`
		UPDATE endpoints 
		SET tunnel_count = (
			SELECT COUNT(*) 
			FROM tunnels 
			WHERE tunnels.endpoint_id = endpoints.id
		)
		WHERE id = ?
	`, endpointID).Error; err != nil {
		log.Errorf("[Master-%d] 更新端点隧道计数失败: %v", endpointID, err)
	}

	log.Infof("[Master-%d#SSE]更新端点隧道计数为: %d", endpointID, count)
}

// sendTunnelUpdateByInstanceId 根据实例ID发送隧道更新
func (s *Service) sendTunnelUpdateByInstanceId(instanceID string, data interface{}) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	subscribers, exists := s.tunnelSubs[instanceID]
	if !exists {
		log.Warnf("[SSE]隧道 %s 没有订阅者", instanceID)
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
		log.Infof("[SSE]隧道 %s 的订阅者 %s 推送成功", instanceID, clientID)
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

// =============== 文件日志 ===============
// GetFileLogger 获取文件日志管理器
func (s *Service) GetFileLogger() *log.FileLogger {
	return s.fileLogger
}
