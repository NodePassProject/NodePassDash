package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"

	log "NodePassDash/internal/log"
	"NodePassDash/internal/nodepass"

	"github.com/gorilla/websocket"
)

// Service WebSocket服务
type Service struct {
	hub                    *Hub
	endpointMonitorWorkers map[int64]context.CancelFunc  // 每个endpoint的监控worker
	instanceMonitorWorkers map[string]context.CancelFunc // 每个instance的监控worker
	tunnelService          TunnelService                 // tunnel服务接口
	mutex                  sync.RWMutex
	ctx                    context.Context
	cancel                 context.CancelFunc
}

// TunnelService tunnel服务接口
type TunnelService interface {
	GetEndpointIDByInstanceID(instanceID string) (int64, error)
}

// NewService 创建新的WebSocket服务
func NewService() *Service {
	ctx, cancel := context.WithCancel(context.Background())
	return &Service{
		hub:                    NewHub(),
		endpointMonitorWorkers: make(map[int64]context.CancelFunc),
		instanceMonitorWorkers: make(map[string]context.CancelFunc),
		ctx:                    ctx,
		cancel:                 cancel,
	}
}

// SetTunnelService 设置tunnel服务
func (s *Service) SetTunnelService(tunnelService TunnelService) {
	s.tunnelService = tunnelService
}

// Start 启动WebSocket服务
func (s *Service) Start() {
	log.Info("启动WebSocket服务")

	// 启动Hub
	go s.hub.Run()

	// 启动监控检查器，定期检查需要启动或停止的监控worker
	go s.runMonitorChecker()
}

// Stop 停止WebSocket服务
func (s *Service) Stop() {
	log.Info("停止WebSocket服务")

	s.cancel()

	// 停止所有监控worker
	s.mutex.Lock()
	for endpointID, cancel := range s.endpointMonitorWorkers {
		log.Infof("停止Endpoint %d的监控worker", endpointID)
		cancel()
	}
	s.endpointMonitorWorkers = make(map[int64]context.CancelFunc)

	for instanceID, cancel := range s.instanceMonitorWorkers {
		log.Infof("停止Instance %s的监控worker", instanceID)
		cancel()
	}
	s.instanceMonitorWorkers = make(map[string]context.CancelFunc)
	s.mutex.Unlock()

	// 停止Hub
	s.hub.Stop()
}

// GetHub 获取Hub实例
func (s *Service) GetHub() *Hub {
	return s.hub
}

// runMonitorChecker 定期检查需要启动或停止监控的endpoint
func (s *Service) runMonitorChecker() {
	ticker := time.NewTicker(5 * time.Second) // 每5秒检查一次
	defer ticker.Stop()

	log.Info("WebSocket监控检查器已启动")

	for {
		select {
		case <-ticker.C:
			s.checkAndUpdateMonitors()
		case <-s.ctx.Done():
			log.Info("WebSocket监控检查器已停止")
			return
		}
	}
}

// checkAndUpdateMonitors 检查并更新监控worker
func (s *Service) checkAndUpdateMonitors() {
	// 检查endpoint监控
	s.checkAndUpdateEndpointMonitors()

	// 检查instance监控
	s.checkAndUpdateInstanceMonitors()
}

// checkAndUpdateEndpointMonitors 检查并更新endpoint监控worker
func (s *Service) checkAndUpdateEndpointMonitors() {
	// 获取当前有WebSocket连接的endpoint列表
	connectedEndpoints := s.hub.GetConnectedEndpoints()
	connectedMap := make(map[int64]bool)
	for _, endpointID := range connectedEndpoints {
		connectedMap[endpointID] = true
	}

	s.mutex.Lock()
	defer s.mutex.Unlock()

	// 启动新的监控worker（有连接但没有worker的endpoint）
	for _, endpointID := range connectedEndpoints {
		if _, exists := s.endpointMonitorWorkers[endpointID]; !exists {
			log.Infof("启动Endpoint %d的监控worker", endpointID)
			s.startEndpointMonitorLocked(endpointID)
		}
	}

	// 停止不需要的监控worker（没有连接但有worker的endpoint）
	for endpointID, cancel := range s.endpointMonitorWorkers {
		if !connectedMap[endpointID] {
			log.Infof("停止Endpoint %d的监控worker", endpointID)
			cancel()
			delete(s.endpointMonitorWorkers, endpointID)
		}
	}
}

// checkAndUpdateInstanceMonitors 检查并更新instance监控worker
func (s *Service) checkAndUpdateInstanceMonitors() {
	// 获取当前有WebSocket连接的instance列表
	connectedInstances := s.hub.GetConnectedInstances()
	connectedMap := make(map[string]bool)
	for _, instanceID := range connectedInstances {
		connectedMap[instanceID] = true
	}

	s.mutex.Lock()
	defer s.mutex.Unlock()

	// 启动新的监控worker（有连接但没有worker的instance）
	for _, instanceID := range connectedInstances {
		if _, exists := s.instanceMonitorWorkers[instanceID]; !exists {
			log.Infof("启动Instance %s的监控worker", instanceID)
			s.startInstanceMonitorLocked(instanceID)
		}
	}

	// 停止不需要的监控worker（没有连接但有worker的instance）
	for instanceID, cancel := range s.instanceMonitorWorkers {
		if !connectedMap[instanceID] {
			log.Infof("停止Instance %s的监控worker", instanceID)
			cancel()
			delete(s.instanceMonitorWorkers, instanceID)
		}
	}
}

// ensureEndpointMonitor 确保指定endpoint有监控worker运行
func (s *Service) ensureEndpointMonitor(endpointID int64) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// 如果已经有监控worker，则不需要启动新的
	if _, exists := s.endpointMonitorWorkers[endpointID]; exists {
		return
	}

	// 启动新的监控worker
	log.Infof("立即启动Endpoint %d的监控worker", endpointID)
	s.startEndpointMonitorLocked(endpointID)
}

// ensureInstanceMonitor 确保指定instance有监控worker运行
func (s *Service) ensureInstanceMonitor(instanceID string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// 如果已经有监控worker，则不需要启动新的
	if _, exists := s.instanceMonitorWorkers[instanceID]; exists {
		return
	}

	// 启动新的监控worker
	log.Infof("立即启动Instance %s的监控worker", instanceID)
	s.startInstanceMonitorLocked(instanceID)
}

// startEndpointMonitor 为指定endpoint启动监控worker
func (s *Service) startEndpointMonitor(endpointID int64) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.startEndpointMonitorLocked(endpointID)
}

// startEndpointMonitorLocked 为指定endpoint启动监控worker（需要在锁保护下调用）
func (s *Service) startEndpointMonitorLocked(endpointID int64) {
	ctx, cancel := context.WithCancel(s.ctx)
	s.endpointMonitorWorkers[endpointID] = cancel

	go s.endpointMonitorWorker(ctx, endpointID)
}

// startInstanceMonitorLocked 为指定instance启动监控worker（需要在锁保护下调用）
func (s *Service) startInstanceMonitorLocked(instanceID string) {
	ctx, cancel := context.WithCancel(s.ctx)
	s.instanceMonitorWorkers[instanceID] = cancel

	go s.instanceMonitorWorker(ctx, instanceID)
}

// endpointMonitorWorker endpoint监控worker，每2秒查询一次info接口
func (s *Service) endpointMonitorWorker(ctx context.Context, endpointID int64) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	log.Infof("Endpoint %d 监控worker已启动，开始每2秒查询info接口", endpointID)

	// 启动后立即执行一次查询
	s.queryAndBroadcastEndpointInfo(endpointID)

	for {
		select {
		case <-ticker.C:
			log.Debugf("Endpoint %d 监控worker定时执行查询", endpointID)
			s.queryAndBroadcastEndpointInfo(endpointID)
		case <-ctx.Done():
			log.Infof("Endpoint %d 监控worker已停止", endpointID)
			return
		}
	}
}

// instanceMonitorWorker instance监控worker，每2秒查询一次instance接口
func (s *Service) instanceMonitorWorker(ctx context.Context, instanceID string) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	log.Infof("Instance %s 监控worker已启动，开始每2秒查询instance接口", instanceID)

	// 启动后立即执行一次查询
	s.queryAndBroadcastInstanceInfo(instanceID)

	for {
		select {
		case <-ticker.C:
			log.Debugf("Instance %s 监控worker定时执行查询", instanceID)
			s.queryAndBroadcastInstanceInfo(instanceID)
		case <-ctx.Done():
			log.Infof("Instance %s 监控worker已停止", instanceID)
			return
		}
	}
}

// queryAndBroadcastEndpointInfo 查询endpoint信息并广播给前端
func (s *Service) queryAndBroadcastEndpointInfo(endpointID int64) {
	log.Debugf("开始查询Endpoint %d的信息", endpointID)

	info := &EndpointSystemInfo{
		EndpointID: endpointID,
		Timestamp:  time.Now().UnixMilli(), // 使用毫秒级Unix时间戳，更精确
		Status:     "online",
	}

	// 调用nodepass client的info接口
	endpointInfo, err := nodepass.GetInfo(endpointID)
	if err != nil {
		log.Warnf("查询Endpoint %d信息失败: %v", endpointID, err)
		info.Status = "error"
		info.Error = err.Error()
	} else {
		info.Info = endpointInfo
		memUsage := float64(endpointInfo.MemTotal-endpointInfo.MemFree) / float64(endpointInfo.MemTotal) * 100
		log.Infof("成功获取Endpoint %d信息: %s %s v%s, CPU:%d核, 内存:%s/%s(%.1f%%), 运行时间:%s",
			endpointID, endpointInfo.OS, endpointInfo.Arch, endpointInfo.Ver,
			endpointInfo.CPU,
			formatBytes(endpointInfo.MemTotal-endpointInfo.MemFree),
			formatBytes(endpointInfo.MemTotal),
			memUsage,
			formatUptime(endpointInfo.Uptime))
	}

	// 广播信息到前端
	log.Debugf("准备广播Endpoint %d信息到前端", endpointID)
	if err := s.hub.BroadcastToEndpoint(endpointID, info); err != nil {
		log.Errorf("广播Endpoint %d信息失败: %v", endpointID, err)
	} else {
		log.Debugf("成功广播Endpoint %d信息到前端", endpointID)
	}
}

// queryAndBroadcastInstanceInfo 查询instance信息并广播给前端
func (s *Service) queryAndBroadcastInstanceInfo(instanceID string) {
	log.Debugf("开始查询Instance %s的信息", instanceID)

	info := &TunnelInstanceInfo{
		InstanceID: instanceID,
		Timestamp:  time.Now().UnixMilli(),
		Status:     "online",
	}

	// 首先获取该instance对应的endpointID
	if s.tunnelService == nil {
		log.Errorf("TunnelService未设置，无法查询Instance %s的信息", instanceID)
		info.Status = "error"
		info.Error = "TunnelService未设置"
	} else {
		endpointID, err := s.tunnelService.GetEndpointIDByInstanceID(instanceID)
		if err != nil {
			log.Warnf("查询Instance %s对应的EndpointID失败: %v", instanceID, err)
			info.Status = "error"
			info.Error = err.Error()
		} else {
			// 调用nodepass client的GetInstance接口
			instanceInfo, err := nodepass.GetInstance(endpointID, instanceID)
			if err != nil {
				log.Warnf("查询Instance %s信息失败: %v", instanceID, err)
				info.Status = "error"
				info.Error = err.Error()
			} else {
				info.Info = instanceInfo
				log.Infof("成功获取Instance %s信息: status=%s, type=%s, TCPRx=%s, TCPTx=%s",
					instanceID, instanceInfo.Status, instanceInfo.Type,
					formatBytes(instanceInfo.TCPRx), formatBytes(instanceInfo.TCPTx))
			}
		}
	}

	// 广播信息到前端
	log.Debugf("准备广播Instance %s信息到前端", instanceID)
	if err := s.hub.BroadcastToInstance(instanceID, info); err != nil {
		log.Errorf("广播Instance %s信息失败: %v", instanceID, err)
	} else {
		log.Debugf("成功广播Instance %s信息到前端", instanceID)
	}
}

// HandleWebSocketConnection 处理WebSocket连接
func (s *Service) HandleWebSocketConnection(conn *websocket.Conn, endpointIDStr string) error {
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid endpoint ID: %s", endpointIDStr)
	}

	// 检查endpoint是否在缓存中存在
	if _, _, exists := nodepass.GetCache().Get(fmt.Sprintf("%d", endpointID)); !exists {
		return fmt.Errorf("endpoint %d not found", endpointID)
	}

	// 创建客户端
	client := NewSystemClient(conn, endpointID, s.hub)

	// 注册客户端
	s.hub.register <- client

	// 立即启动或检查该endpoint的监控worker（启动后会立即发送一次数据）
	s.ensureEndpointMonitor(endpointID)

	// 启动读写协程
	go client.WritePump()
	go client.ReadPump()

	return nil
}

// HandleTunnelWebSocketConnection 处理tunnel WebSocket连接
func (s *Service) HandleTunnelWebSocketConnection(conn *websocket.Conn, instanceID string) error {
	if instanceID == "" {
		return fmt.Errorf("invalid instance ID: empty")
	}

	// 检查instance是否存在（通过tunnelService）
	if s.tunnelService == nil {
		return fmt.Errorf("TunnelService未设置")
	}

	_, err := s.tunnelService.GetEndpointIDByInstanceID(instanceID)
	if err != nil {
		return fmt.Errorf("instance %s not found: %v", instanceID, err)
	}

	// 创建客户端
	client := NewTunnelClient(conn, instanceID, s.hub)

	// 注册客户端
	s.hub.register <- client

	// 立即启动或检查该instance的监控worker（启动后会立即发送一次数据）
	s.ensureInstanceMonitor(instanceID)

	// 启动读写协程
	go client.WritePump()
	go client.ReadPump()

	return nil
}

// 辅助方法：将JSON数据编码为字节数组
func (s *Service) encodeJSON(data interface{}) ([]byte, error) {
	return json.Marshal(data)
}

// 辅助方法：格式化字节数为人类可读的格式
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB",
		float64(bytes)/float64(div), "KMGTPE"[exp])
}

// 辅助方法：格式化时间（秒）为人类可读格式
func formatUptime(seconds int64) string {
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}
	if seconds < 3600 {
		return fmt.Sprintf("%dm%ds", seconds/60, seconds%60)
	}
	if seconds < 86400 {
		hours := seconds / 3600
		minutes := (seconds % 3600) / 60
		return fmt.Sprintf("%dh%dm", hours, minutes)
	}
	days := seconds / 86400
	hours := (seconds % 86400) / 3600
	return fmt.Sprintf("%dd%dh", days, hours)
}
