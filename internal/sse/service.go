package sse

import (
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/endpointcache"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/servicecache"
	"NodePassDash/internal/tunnelcache"
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
		fileLogger:      log.NewFileLogger(logDir),
		ctx:             ctx,
		cancel:          cancel,
	}

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

// ======================== 事件处理器 ============================

// ProcessEvent 处理SSE事件
func (s *Service) ProcessEvent(payload SSEResp) {
	switch payload.Type {
	case "shutdown":
		s.handleShutdownEvent(payload)
	case "initial":
		s.handleInitialEvent(payload)
	case "create":
		s.handleCreateEvent(payload)
	case "update":
		if s.historyWorker != nil {
			s.historyWorker.Dispatch(payload)
		}
		s.handleUpdateEvent(payload)
	case "delete":
		s.handleDeleteEvent(payload)
	case "log":
		s.handleLogEvent(payload)
	}
}

// 事件处理方法
func (s *Service) handleInitialEvent(payload SSEResp) {
	// SSE initial 事件表示端点重新连接时报告现有隧道状态
	log.Debugf("[Master-%d]处理初始化事件: 隧道 %s", payload.EndpointID, payload.Instance.ID)
	if payload.Instance.Type == "" {
		// 当InstanceType为空时，尝试获取端点系统信息
		go s.fetchAndUpdateEndpointInfo(payload.EndpointID)
		return
	}

	// 从缓存检查隧道是否已存在
	existingTunnel := tunnelcache.Shared.GetByInstanceID(payload.Instance.ID)
	if existingTunnel != nil {
		// 隧道已存在（正常情况），更新运行时信息
		// log.Debugf("[Master-%d]隧道 %s 已存在，更新运行时信息", payload.EndpointID, payload.Instance.ID)
		s.updateTunnelRuntimeInfo(payload)
		return
	}

	// 隧道不存在，创建最小化隧道记录，包含从EndpointSSE获取的流量等信息
	tunnel := buildTunnel(payload)

	if err := s.db.Create(&tunnel).Error; err != nil {
		log.Errorf("[Master-%d]初始化隧道 %s 失败: %v", payload.EndpointID, payload.Instance.ID, err)
		return
	}

	log.Infof("[Master-%d]最小化隧道记录 %s 初始化成功", payload.EndpointID, payload.Instance.ID)

	// 添加到缓存
	tunnelcache.Shared.Add(tunnel)

	// 更新端点隧道计数（从缓存获取）
	count := tunnelcache.Shared.CountByEndpointID(payload.EndpointID)
	endpointcache.Shared.UpdateTunnelCount(payload.EndpointID, int64(count))
	log.Debugf("[Master-%d#SSE] 更新端点隧道计数为: %d (已缓存)", payload.EndpointID, count)

	// 处理服务记录
	s.upsertService(payload.Instance.ID, tunnel)
}

func buildTunnel(payload SSEResp) *models.Tunnel {
	tunnel := nodepass.ParseTunnelURL(payload.Instance.URL)
	// 补充从EndpointSSE获取的信息
	tunnel.EndpointID = payload.EndpointID
	tunnel.InstanceID = &payload.Instance.ID
	tunnel.TCPRx = payload.Instance.TCPRx
	tunnel.TCPTx = payload.Instance.TCPTx
	tunnel.UDPRx = payload.Instance.UDPRx
	tunnel.UDPTx = payload.Instance.UDPTx
	tunnel.TCPs = payload.Instance.TCPs
	tunnel.UDPs = payload.Instance.UDPs
	tunnel.Pool = payload.Instance.Pool
	tunnel.Ping = payload.Instance.Ping
	tunnel.LastEventTime = models.NullTime{Time: payload.TimeStamp, Valid: true}
	tunnel.EnableLogStore = true
	tunnel.Restart = payload.Instance.Restart
	// 安全地设置 Alias（处理 nil 指针）
	if payload.Instance.Alias != nil {
		tunnel.Name = *payload.Instance.Alias
	}
	tunnel.Status = models.TunnelStatus(payload.Instance.Status)
	tunnel.ProxyProtocol = payload.Instance.ProxyProtocol
	// 安全地访问 Meta 字段（处理 nil 指针）
	if payload.Instance.Meta != nil {
		tunnel.Tags = payload.Instance.Meta.Tags
		tunnel.Peer = payload.Instance.Meta.Peer
	}

	// 同步设置 service_sid 字段
	if tunnel.Peer != nil && tunnel.Peer.SID != nil && *tunnel.Peer.SID != "" {
		tunnel.ServiceSID = tunnel.Peer.SID
	}

	if tunnel.Mode == nil {
		tunnel.Mode = (*models.TunnelMode)(payload.Instance.Mode)
	}

	// 复制Config字段到configLine
	if payload.Instance.Config != nil {
		tunnel.ConfigLine = payload.Instance.Config
	}

	return tunnel
}

func (s *Service) handleCreateEvent(payload SSEResp) {
	// SSE create 事件表示 NodePass 客户端报告隧道创建成功
	// 此时隧道记录应该已经由 API 创建，我们只需要更新状态和流量信息
	log.Debugf("[Master-%d]处理创建事件: 隧道 %s", payload.EndpointID, payload.Instance.ID)

	// 先检查缓存中是否已存在
	existingTunnel := tunnelcache.Shared.GetByInstanceID(payload.Instance.ID)

	// 先解析 URL 获取隧道配置信息
	tunnel := buildTunnel(payload)

	// 使用 OnConflict 子句处理冲突情况
	// 如果 endpoint_id + instance_id 已存在，则更新相关字段
	if err := s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "endpoint_id"},
			{Name: "instance_id"},
		},
		DoUpdates: clause.AssignmentColumns([]string{
			"tcp_rx", "tcp_tx", "udp_rx", "udp_tx", "tcps", "udps", "pool", "ping",
			"tunnel_address", "tunnel_port", "target_address", "target_port",
			"tls_mode", "log_level", "command_line", "password", "cert_path", "key_path",
			"min", "max", "mode", "read", "rate", "restart", "last_event_time", "updated_at",
			"peer", "service_sid", // 添加 peer 和 service_sid 字段同步
		}),
	}).Create(&tunnel).Error; err != nil {
		log.Errorf("[Master-%d]创建/更新隧道记录 %s 失败: %v", payload.EndpointID, payload.Instance.ID, err)
		return
	}

	log.Debugf("[Master-%d]隧道记录 %s 处理成功（创建或更新）", payload.EndpointID, payload.Instance.ID)

	// 更新或添加到缓存
	if existingTunnel != nil {
		// 已存在，更新缓存
		tunnelcache.Shared.UpdateFullTunnel(tunnel)
	} else {
		// 新隧道，添加到缓存
		tunnelcache.Shared.Add(tunnel)
	}

	// 更新端点隧道计数（从缓存获取）
	count := tunnelcache.Shared.CountByEndpointID(payload.EndpointID)
	endpointcache.Shared.UpdateTunnelCount(payload.EndpointID, int64(count))
	log.Debugf("[Master-%d#SSE] 更新端点隧道计数为: %d (已缓存)", payload.EndpointID, count)

	// 处理服务记录
	s.upsertService(payload.Instance.ID, tunnel)
}

func (s *Service) handleUpdateEvent(payload SSEResp) {
	// SSE update 事件用于更新隧道的运行时信息
	log.Debugf("[Master-%d]处理更新事件: 隧道 %s", payload.EndpointID, payload.Instance.ID)

	// 从缓存检查隧道是否存在
	existingTunnel := tunnelcache.Shared.GetByInstanceID(payload.Instance.ID)
	if existingTunnel == nil {
		// 隧道不存在，可能是时序问题（SSE 事件比 API 创建先到达）
		log.Warnf("[Master-%d]收到更新事件但隧道 %s 不存在，可能是时序问题，跳过处理", payload.EndpointID, payload.Instance.ID)
		return
	}

	// 更新运行时信息
	s.updateTunnelRuntimeInfo(payload)
}

func (s *Service) handleDeleteEvent(payload SSEResp) {
	// 从缓存获取隧道信息
	tunnel := tunnelcache.Shared.GetByInstanceID(payload.Instance.ID)
	if tunnel == nil {
		log.Warnf("[Master-%d]删除隧道失败，缓存中找不到隧道: %s", payload.EndpointID, payload.Instance.ID)
		return
	}

	// 先删除相关的操作日志记录，避免外键约束错误
	if err := s.db.Where("tunnel_id = ?", tunnel.ID).Delete(&models.TunnelOperationLog{}).Error; err != nil {
		log.Warnf("[Master-%d]删除隧道 %s 操作日志失败: %v", payload.EndpointID, payload.Instance.ID, err)
	}

	// 删除数据库中的隧道记录
	err := s.db.Where("endpoint_id = ? AND instance_id = ?", payload.EndpointID, payload.Instance.ID).Delete(&models.Tunnel{}).Error

	if err != nil {
		log.Errorf("[Master-%d]删除隧道 %s 失败: %v", payload.EndpointID, payload.Instance.ID, err)
		return
	}

	log.Infof("[Master-%d]隧道 %s 删除成功", payload.EndpointID, payload.Instance.ID)

	// 从缓存中删除
	tunnelcache.Shared.DeleteByInstanceID(payload.Instance.ID)

	// 更新端点隧道计数（从缓存获取）
	count := tunnelcache.Shared.CountByEndpointID(payload.EndpointID)
	endpointcache.Shared.UpdateTunnelCount(payload.EndpointID, int64(count))
	log.Debugf("[Master-%d#SSE] 更新端点隧道计数为: %d (已缓存)", payload.EndpointID, count)
}

func (s *Service) handleLogEvent(payload SSEResp) {
	// 日志事件需要写入文件日志系统
	log.Debugf("[Master-%d]处理日志事件: 隧道 %s", payload.EndpointID, payload.Instance.ID)

	// 检查是否有日志内容
	if *payload.Logs == "" {
		log.Debugf("[Master-%d]隧道 %s 日志事件内容为空，跳过文件写入", payload.EndpointID, payload.Instance.ID)
		return
	}

	// 使用文件日志管理器写入日志文件
	if s.fileLogger != nil {
		err := s.fileLogger.WriteLog(payload.EndpointID, payload.Instance.ID, *payload.Logs)
		if err != nil {
			log.Errorf("[Master-%d]写入隧道 %s 日志到文件失败: %v", payload.EndpointID, payload.Instance.ID, err)
		} else {
			log.Debugf("[Master-%d]隧道 %s 日志已写入文件", payload.EndpointID, payload.Instance.ID)
		}
	} else {
		log.Warnf("[Master-%d]文件日志管理器未初始化，无法写入日志", payload.EndpointID)
	}
	// 推流转发给前端订阅
	// log.Debugf("[Master-%d#SSE]准备推送事件给前端，eventType=%s instanceID=%s", endpointID, event.EventType, event.InstanceID)
	s.sendTunnelUpdateByInstanceId(payload.Instance.ID, payload)
}

func (s *Service) handleShutdownEvent(payload SSEResp) {
	// 使用GORM更新端点状态
	if err := s.db.Model(&models.Endpoint{}).
		Where("id = ?", payload.EndpointID).
		Updates(map[string]interface{}{
			"status":     models.EndpointStatusOffline,
			"last_check": time.Now(),
			"updated_at": time.Now(),
		}).Error; err != nil {
		log.Errorf("[Master-%d#SSE]更新端点状态失败: %v", payload.EndpointID, err)
		return
	}

	log.Infof("[Master-%d]端点状态已更新为: %s", payload.EndpointID, models.EndpointStatusOffline)

	// 如果端点状态变为离线，设置所有相关隧道为离线状态
	if err := s.setTunnelsOfflineForEndpoint(payload.EndpointID); err != nil {
		log.Errorf("[Master-%d]设置隧道离线状态失败: %v", payload.EndpointID, err)
	}

	// 通知Manager状态变化
	s.manager.NotifyEndpointStatusChanged(payload.EndpointID, string(models.EndpointStatusOffline))
}

// updateTunnelRuntimeInfo 更新隧道运行时信息（流量、状态、ping等）
func (s *Service) updateTunnelRuntimeInfo(payload SSEResp) {
	// 从缓存获取隧道确认存在
	existingTunnel := tunnelcache.Shared.GetByInstanceID(payload.Instance.ID)
	if existingTunnel == nil {
		log.Warnf("[Master-%d]更新运行时信息失败，隧道 %s 不存在", payload.EndpointID, payload.Instance.ID)
		return
	}

	// 构建隧道数据
	tunnel := buildTunnel(payload)

	// 使用缓存专用的更新方法，批量更新运行时信息
	// 更新状态
	tunnelcache.Shared.UpdateStatusByInstanceID(payload.Instance.ID, models.TunnelStatus(payload.Instance.Status))

	// 更新流量数据
	tunnelcache.Shared.UpdateTrafficByInstanceID(
		payload.Instance.ID,
		payload.Instance.TCPRx,
		payload.Instance.TCPTx,
		payload.Instance.UDPRx,
		payload.Instance.UDPTx,
	)

	// 更新指标（Pool, Ping, TCPs, UDPs）
	tunnelcache.Shared.UpdateMetricsByInstanceID(
		payload.Instance.ID,
		payload.Instance.Pool,
		payload.Instance.Ping,
		payload.Instance.TCPs,
		payload.Instance.UDPs,
	)

	// 更新其他字段（如 Restart, Peer 等）
	if payload.Instance.Restart != nil {
		tunnelcache.Shared.UpdateField(existingTunnel.ID, "restart", *payload.Instance.Restart)
	}
	if payload.Instance.Meta.Peer != nil && payload.Instance.Meta.Peer.Alias != nil {
		tunnelcache.Shared.UpdateField(existingTunnel.ID, "alias", *payload.Instance.Meta.Peer.Alias)
	}

	log.Debugf("[Master-%d]隧道 %s 运行时信息已更新（缓存）", payload.EndpointID, payload.Instance.ID)

	// 处理服务记录
	s.upsertService(payload.Instance.ID, tunnel)
}

// fetchAndUpdateEndpointInfo 获取并更新端点系统信息
func (s *Service) fetchAndUpdateEndpointInfo(endpointID int64) {

	// 尝试获取系统信息 (处理低版本API不存在的情况)
	var info *nodepass.EndpointInfoResult
	if r := recover(); r != nil {
		log.Warnf("[Master-%d] 获取系统信息失败(可能为低版本): %v", endpointID, r)
	}

	info, err := nodepass.GetInfo(endpointID)
	if err != nil {
		log.Warnf("[Master-%d] 获取系统信息失败: %v", endpointID, err)
		// 不返回错误，继续处理
	}

	// 如果成功获取到信息，更新数据库
	if info != nil && err == nil {
		if updateErr := s.endpointService.UpdateEndpointInfo(endpointID, *info); updateErr != nil {
			log.Errorf("[Master-%d] 更新系统信息失败: %v", endpointID, updateErr)
		} else {
			// 在日志中显示uptime信息
			uptimeMsg := fmt.Sprintf("%d秒", info.Uptime)
			log.Infof("[Master-%d] 系统信息已更新: OS=%s, Arch=%s, Ver=%s, Uptime=%s", endpointID, info.OS, info.Arch, info.Ver, uptimeMsg)
		}
	}
}

// sendTunnelUpdateByInstanceId 根据实例ID发送隧道更新
func (s *Service) sendTunnelUpdateByInstanceId(instanceID string, data SSEResp) {
	s.mu.RLock()
	subscribers, exists := s.tunnelSubs[instanceID]
	if !exists {
		s.mu.RUnlock()
		// log.Debug("[SSE]隧道 %s 没有订阅者", instanceID)
		return
	}

	// 创建订阅者副本，避免在遍历时修改map
	clientList := make([]*Client, 0, len(subscribers))
	clientIDs := make([]string, 0, len(subscribers))
	for clientID, client := range subscribers {
		clientList = append(clientList, client)
		clientIDs = append(clientIDs, clientID)
	}
	s.mu.RUnlock()

	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Errorf("序列化隧道数据失败: %v", err)
		return
	}

	// 记录需要删除的客户端
	disconnectedClients := make([]string, 0)

	for i, client := range clientList {
		clientID := clientIDs[i]
		if err := client.Send(jsonData); err != nil {
			// 检查是否是连接断开错误，使用更合适的日志级别
			if client.IsDisconnected() {
				log.Warnf("[SSE]客户端 %s 连接已断开，标记移除订阅", clientID)
				disconnectedClients = append(disconnectedClients, clientID)
			} else {
				log.Errorf("发送隧道更新给客户端 %s 失败: %v", clientID, err)
			}
		} else {
			log.Debugf("[SSE]隧道 %s 的订阅者 %s 推送成功", instanceID, clientID)
		}
	}

	// 如果有断开的客户端，获取写锁并移除它们
	if len(disconnectedClients) > 0 {
		s.mu.Lock()
		if subscribers, exists := s.tunnelSubs[instanceID]; exists {
			for _, clientID := range disconnectedClients {
				delete(subscribers, clientID)
				log.Infof("[SSE]已移除断开连接的客户端 %s from tunnel %s", clientID, instanceID)
			}
			// 如果订阅者列表为空，删除整个条目
			if len(subscribers) == 0 {
				delete(s.tunnelSubs, instanceID)
				log.Debugf("[SSE]隧道 %s 无订阅者，清理订阅列表", instanceID)
			}
		}
		s.mu.Unlock()
	}
}

// setTunnelsOfflineForEndpoint 将端点的所有隧道设置为离线状态
func (s *Service) setTunnelsOfflineForEndpoint(endpointID int64) error {
	// 从缓存获取该端点的所有隧道
	tunnels := tunnelcache.Shared.GetByEndpointID(endpointID)

	// 批量更新隧道状态为离线
	count := 0
	for _, tunnel := range tunnels {
		tunnelcache.Shared.UpdateStatus(tunnel.ID, models.TunnelStatusOffline)
		count++
	}

	log.Infof("[Master-%d]已将%d个隧道设置为离线状态（缓存）", endpointID, count)
	return nil
}

// =============== 文件日志 ===============
// GetFileLogger 获取文件日志管理器
func (s *Service) GetFileLogger() *log.FileLogger {
	return s.fileLogger
}

// =============== 服务管理 ===============
// upsertService 插入或更新服务记录
func (s *Service) upsertService(instanceID string, tunnel *models.Tunnel) {
	// 检查 peer 是否为 nil 或 SID 为空
	if tunnel.Peer == nil || tunnel.Peer.SID == nil || *tunnel.Peer.SID == "" {
		return
	}

	peer := tunnel.Peer

	// 检查 Type 是否为空
	if peer.Type == nil || *peer.Type == "" {
		log.Warnf("服务 SID=%s 的 Type 为空，跳过处理", *peer.SID)
		return
	}

	// 构建 service 对象
	service := models.Services{
		Sid:   *peer.SID,
		Type:  *peer.Type,
		Alias: peer.Alias,
	}

	// 根据 tunnel 类型设置对应的 InstanceId 和要更新的字段列表
	var updateColumns []string

	switch *peer.Type {
	case "0", "5":
		if tunnel.Type == models.TunnelModeServer {
			// 抛错
			log.Errorf("服务 SID=%s 的 Type 为 0，但 tunnel 类型为 %s，跳过处理", *peer.SID, tunnel.Type)
			return
		}
		service.ClientInstanceId = &instanceID
		service.ClientEndpointId = &tunnel.EndpointID
		service.ExitHost = &tunnel.TargetAddress
		service.ExitPort = &tunnel.TargetPort
		service.EntranceHost = &tunnel.TunnelAddress
		service.EntrancePort = &tunnel.TunnelPort
		if service.EntranceHost == nil || *service.EntranceHost == "" {
			var endpoint models.Endpoint
			if err := s.db.First(&endpoint, tunnel.EndpointID).Error; err == nil {
				service.TunnelEndpointName = &endpoint.Name
				if service.EntranceHost == nil || *service.EntranceHost == "" {
					service.EntranceHost = &endpoint.Hostname
				}
			}
		}

		// type=0: 直接 TCP+UDP 相加（单端转发，只有 client 端）
		service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
		service.TotalTx = tunnel.TCPTx + tunnel.UDPTx

		updateColumns = []string{"alias", "client_instance_id", "client_endpoint_id", "exit_host", "exit_port", "entrance_host", "entrance_port", "total_rx", "total_tx"}
	case "1", "3", "6":
		if tunnel.Type == models.TunnelModeServer {
			service.ServerInstanceId = &instanceID
			service.ServerEndpointId = &tunnel.EndpointID
			service.EntranceHost = &tunnel.TargetAddress
			service.EntrancePort = &tunnel.TargetPort
			service.TunnelPort = &tunnel.TunnelPort
			// 查询并填充 tunnelEndpointName
			var endpoint models.Endpoint
			if err := s.db.First(&endpoint, tunnel.EndpointID).Error; err == nil {
				service.TunnelEndpointName = &endpoint.Name
				if service.EntranceHost == nil || *service.EntranceHost == "" {
					service.EntranceHost = &endpoint.Hostname
				}
			}

			// type=1 server端: 查询 client 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 client 端流量
			var clientTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", *peer.SID, *peer.Type, models.TunnelModeClient).First(&clientTunnel).Error; err == nil {
				service.TotalRx += clientTunnel.TCPRx + clientTunnel.UDPRx
				service.TotalTx += clientTunnel.TCPTx + clientTunnel.UDPTx
			}

			updateColumns = []string{"alias", "server_instance_id", "server_endpoint_id", "tunnel_port", "tunnel_endpoint_name", "entrance_host", "entrance_port", "total_rx", "total_tx"}

		} else {
			service.ClientInstanceId = &instanceID
			service.ClientEndpointId = &tunnel.EndpointID
			service.ExitHost = &tunnel.TargetAddress
			service.ExitPort = &tunnel.TargetPort

			// type=1 client端: 查询 server 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 server 端流量
			var serverTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", *peer.SID, *peer.Type, models.TunnelModeServer).First(&serverTunnel).Error; err == nil {
				service.TotalRx += serverTunnel.TCPRx + serverTunnel.UDPRx
				service.TotalTx += serverTunnel.TCPTx + serverTunnel.UDPTx
			}

			updateColumns = []string{"alias", "client_instance_id", "client_endpoint_id", "exit_host", "exit_port", "total_rx", "total_tx"}
		}
	case "2", "4", "7":
		if tunnel.Type == models.TunnelModeServer {
			service.ServerInstanceId = &instanceID
			service.ServerEndpointId = &tunnel.EndpointID

			service.ExitHost = &tunnel.TargetAddress
			service.ExitPort = &tunnel.TargetPort

			service.TunnelPort = &tunnel.TunnelPort

			// type=2 server端: 查询 client 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 client 端流量
			var clientTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", *peer.SID, *peer.Type, models.TunnelModeClient).First(&clientTunnel).Error; err == nil {
				service.TotalRx += clientTunnel.TCPRx + clientTunnel.UDPRx
				service.TotalTx += clientTunnel.TCPTx + clientTunnel.UDPTx
			}

			updateColumns = []string{"alias", "server_instance_id", "server_endpoint_id", "tunnel_port", "exit_host", "exit_port", "total_rx", "total_tx"}
		} else {
			service.ClientInstanceId = &instanceID
			service.ClientEndpointId = &tunnel.EndpointID

			service.EntranceHost = &tunnel.TargetAddress
			service.EntrancePort = &tunnel.TargetPort

			// 查询并填充 tunnelEndpointName
			var endpoint models.Endpoint
			if err := s.db.First(&endpoint, tunnel.EndpointID).Error; err == nil {
				service.TunnelEndpointName = &endpoint.Name
				if service.EntranceHost == nil || *service.EntranceHost == "" {
					service.EntranceHost = &endpoint.Hostname
				}
			}
			// type=2 client端: 查询 server 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 server 端流量
			var serverTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", *peer.SID, *peer.Type, models.TunnelModeServer).First(&serverTunnel).Error; err == nil {
				service.TotalRx += serverTunnel.TCPRx + serverTunnel.UDPRx
				service.TotalTx += serverTunnel.TCPTx + serverTunnel.UDPTx
			}

			updateColumns = []string{"alias", "client_instance_id", "client_endpoint_id", "tunnel_endpoint_name", "entrance_host", "entrance_port", "total_rx", "total_tx"}
		}
	}
	// 优先从缓存检查服务是否已存在
	var isNewService bool
	if servicecache.Shared != nil {
		existingInCache := servicecache.Shared.Get(*peer.SID)
		isNewService = (existingInCache == nil)
	} else {
		// 缓存未初始化，从数据库检查（降级方案）
		var existingService models.Services
		isNewService = s.db.Where("sid = ? AND type = ?", *peer.SID, *peer.Type).First(&existingService).Error != nil
	}

	if isNewService {
		// 新服务：查询当前最大 sorts 值并 +1
		// 优先从缓存获取，否则从数据库查询
		var maxSorts int64
		if servicecache.Shared != nil {
			services := servicecache.Shared.GetAll()
			maxSorts = -1
			for _, s := range services {
				if s.Sorts > maxSorts {
					maxSorts = s.Sorts
				}
			}
		} else {
			s.db.Model(&models.Services{}).Select("COALESCE(MAX(sorts), -1)").Scan(&maxSorts)
		}
		service.Sorts = maxSorts + 1
		service.CreatedAt = time.Now()
		log.Infof("[ServiceCache] 新服务 SID=%s, Type=%s, 自动设置 sorts=%d", *peer.SID, *peer.Type, service.Sorts)
	}

	service.UpdatedAt = time.Now()

	// 只更新缓存，不写数据库（由后台定期持久化）
	if servicecache.Shared != nil {
		if isNewService {
			// 新服务：添加到缓存
			servicecache.Shared.Add(&service)
			log.Debugf("[ServiceCache] 添加新服务到缓存: SID=%s, Type=%s", *peer.SID, *peer.Type)
		} else {
			// 已存在服务：更新缓存
			updates := make(map[string]interface{})
			for _, col := range updateColumns {
				switch col {
				case "alias":
					updates["alias"] = service.Alias
				case "client_instance_id":
					updates["client_instance_id"] = service.ClientInstanceId
				case "client_endpoint_id":
					updates["client_endpoint_id"] = service.ClientEndpointId
				case "server_instance_id":
					updates["server_instance_id"] = service.ServerInstanceId
				case "server_endpoint_id":
					updates["server_endpoint_id"] = service.ServerEndpointId
				case "exit_host":
					updates["exit_host"] = service.ExitHost
				case "exit_port":
					updates["exit_port"] = service.ExitPort
				case "entrance_host":
					updates["entrance_host"] = service.EntranceHost
				case "entrance_port":
					updates["entrance_port"] = service.EntrancePort
				case "tunnel_port":
					updates["tunnel_port"] = service.TunnelPort
				case "tunnel_endpoint_name":
					updates["tunnel_endpoint_name"] = service.TunnelEndpointName
				case "total_rx":
					updates["total_rx"] = service.TotalRx
				case "total_tx":
					updates["total_tx"] = service.TotalTx
				}
			}
			servicecache.Shared.UpdateService(*peer.SID, updates)
			log.Debugf("[ServiceCache] 更新缓存中的服务: SID=%s, fields=%d", *peer.SID, len(updates))
		}
	} else {
		// 缓存未初始化，降级为直接写数据库（兼容性处理）
		log.Warnf("[ServiceCache] 缓存未初始化，降级为直接写数据库: SID=%s", *peer.SID)
		if err := s.db.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "sid"},
				{Name: "type"},
			},
			DoUpdates: clause.AssignmentColumns(updateColumns),
		}).Create(&service).Error; err != nil {
			log.Errorf("处理服务记录失败 (SID=%s, Type=%s): %v", *peer.SID, *peer.Type, err)
		}
	}
}
