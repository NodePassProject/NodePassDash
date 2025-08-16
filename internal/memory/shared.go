package memory

import (
	"NodePassDash/internal/models"
	"sync"
	"time"
)

// EndpointShared 端点内存共享数据（类似 Nezha 的 ServerShared）
type EndpointShared struct {
	// 静态信息（不经常变化的数据）
	Host *models.Endpoint `json:"host"`

	// 动态状态（实时更新的数据）
	State *EndpointState `json:"state"`

	// 并发保护（公开字段以便其他包访问）
	Mu sync.RWMutex `json:"-"`
}

// EndpointState 端点实时状态
type EndpointState struct {
	// 基础状态
	Status           models.EndpointStatus `json:"status"`
	LastEventTime    time.Time             `json:"last_event_time"`
	LastUpdateTime   time.Time             `json:"last_update_time"`
	ConnectionStatus bool                  `json:"connection_status"`

	// 隧道状态映射 instanceID -> TunnelState
	Tunnels map[string]*TunnelState `json:"tunnels"`

	// 流量快照（用于差值计算）
	TrafficSnapshot *TrafficSnapshot `json:"traffic_snapshot"`

	// 实时统计
	Stats *EndpointStats `json:"stats"`
}

// TunnelState 隧道实时状态
type TunnelState struct {
	// 基础信息
	InstanceID   string  `json:"instance_id"`
	InstanceType *string `json:"instance_type"`
	Status       *string `json:"status"`
	URL          *string `json:"url"`
	Alias        *string `json:"alias"`
	Restart      *bool   `json:"restart"`

	// 实时流量数据
	TCPRx int64 `json:"tcp_rx"`
	TCPTx int64 `json:"tcp_tx"`
	UDPRx int64 `json:"udp_rx"`
	UDPTx int64 `json:"udp_tx"`

	// 连接信息
	Pool *int64 `json:"pool"`
	Ping *int64 `json:"ping"`

	// 时间戳
	LastUpdateTime time.Time `json:"last_update_time"`
	LastEventTime  time.Time `json:"last_event_time"`
}

// TrafficSnapshot 流量快照（用于差值计算）
type TrafficSnapshot struct {
	// 上次记录的绝对值
	LastTCPRx int64 `json:"last_tcp_rx"`
	LastTCPTx int64 `json:"last_tcp_tx"`
	LastUDPRx int64 `json:"last_udp_rx"`
	LastUDPTx int64 `json:"last_udp_tx"`

	// 累计差值
	DeltaTCPRx int64 `json:"delta_tcp_rx"`
	DeltaTCPTx int64 `json:"delta_tcp_tx"`
	DeltaUDPRx int64 `json:"delta_udp_rx"`
	DeltaUDPTx int64 `json:"delta_udp_tx"`

	// 快照时间
	SnapshotTime time.Time `json:"snapshot_time"`
}

// EndpointStats 端点统计信息
type EndpointStats struct {
	TotalTunnels   int64 `json:"total_tunnels"`
	RunningTunnels int64 `json:"running_tunnels"`
	StoppedTunnels int64 `json:"stopped_tunnels"`
	ErrorTunnels   int64 `json:"error_tunnels"`

	// 总流量统计
	TotalTCPRx int64 `json:"total_tcp_rx"`
	TotalTCPTx int64 `json:"total_tcp_tx"`
	TotalUDPRx int64 `json:"total_udp_rx"`
	TotalUDPTx int64 `json:"total_udp_tx"`
}

// 内存管理器
type Manager struct {
	// 端点内存数据 endpointID -> EndpointShared
	endpoints map[int64]*EndpointShared

	// 全局读写锁
	mu sync.RWMutex

	// 持久化控制
	lastPersistTime time.Time
	persistInterval time.Duration
}

// NewManager 创建内存管理器
func NewManager() *Manager {
	return &Manager{
		endpoints:       make(map[int64]*EndpointShared),
		persistInterval: 2 * time.Second, // 每2秒持久化一次
		lastPersistTime: time.Now(),
	}
}

// GetEndpoint 获取端点内存数据（线程安全）
func (m *Manager) GetEndpoint(endpointID int64) *EndpointShared {
	m.mu.RLock()
	defer m.mu.RUnlock()

	endpoint, exists := m.endpoints[endpointID]
	if !exists {
		return nil
	}

	return endpoint
}

// SetEndpoint 设置端点内存数据（线程安全）
func (m *Manager) SetEndpoint(endpointID int64, endpoint *EndpointShared) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.endpoints[endpointID] = endpoint
}

// InitEndpoint 初始化端点内存数据
func (m *Manager) InitEndpoint(endpoint *models.Endpoint) *EndpointShared {
	shared := &EndpointShared{
		Host: endpoint,
		State: &EndpointState{
			Status:           endpoint.Status,
			LastEventTime:    time.Now(),
			LastUpdateTime:   time.Now(),
			ConnectionStatus: false,
			Tunnels:          make(map[string]*TunnelState),
			TrafficSnapshot: &TrafficSnapshot{
				SnapshotTime: time.Now(),
			},
			Stats: &EndpointStats{},
		},
	}

	m.SetEndpoint(endpoint.ID, shared)
	return shared
}

// UpdateTunnelState 更新隧道状态（线程安全）
func (m *Manager) UpdateTunnelState(endpointID int64, instanceID string, update *TunnelState) {
	endpoint := m.GetEndpoint(endpointID)
	if endpoint == nil {
		return
	}

	endpoint.Mu.Lock()
	defer endpoint.Mu.Unlock()

	// 更新隧道状态
	endpoint.State.Tunnels[instanceID] = update
	endpoint.State.LastUpdateTime = time.Now()

	// 重新计算统计信息
	m.recalculateStats(endpoint)
}

// CalculateTrafficDelta 计算流量差值
func (m *Manager) CalculateTrafficDelta(endpointID int64, instanceID string, current *TunnelState) *TrafficSnapshot {
	endpoint := m.GetEndpoint(endpointID)
	if endpoint == nil {
		return nil
	}

	endpoint.Mu.Lock()
	defer endpoint.Mu.Unlock()

	snapshot := endpoint.State.TrafficSnapshot
	if snapshot == nil {
		// 初始化快照
		snapshot = &TrafficSnapshot{
			LastTCPRx:    current.TCPRx,
			LastTCPTx:    current.TCPTx,
			LastUDPRx:    current.UDPRx,
			LastUDPTx:    current.UDPTx,
			SnapshotTime: time.Now(),
		}
		endpoint.State.TrafficSnapshot = snapshot
		return snapshot
	}

	// 计算差值（处理负值情况，可能是重启导致的计数器重置）
	deltaRx := current.TCPRx - snapshot.LastTCPRx
	deltaTx := current.TCPTx - snapshot.LastTCPTx
	deltaUDPRx := current.UDPRx - snapshot.LastUDPRx
	deltaUDPTx := current.UDPTx - snapshot.LastUDPTx

	// 如果差值为负，说明计数器重置，只记录当前值
	if deltaRx < 0 {
		deltaRx = current.TCPRx
	}
	if deltaTx < 0 {
		deltaTx = current.TCPTx
	}
	if deltaUDPRx < 0 {
		deltaUDPRx = current.UDPRx
	}
	if deltaUDPTx < 0 {
		deltaUDPTx = current.UDPTx
	}

	// 更新快照
	snapshot.DeltaTCPRx += deltaRx
	snapshot.DeltaTCPTx += deltaTx
	snapshot.DeltaUDPRx += deltaUDPRx
	snapshot.DeltaUDPTx += deltaUDPTx

	snapshot.LastTCPRx = current.TCPRx
	snapshot.LastTCPTx = current.TCPTx
	snapshot.LastUDPRx = current.UDPRx
	snapshot.LastUDPTx = current.UDPTx
	snapshot.SnapshotTime = time.Now()

	return snapshot
}

// GetAllEndpoints 获取所有端点的内存数据
func (m *Manager) GetAllEndpoints() map[int64]*EndpointShared {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// 创建副本防止外部修改
	result := make(map[int64]*EndpointShared)
	for id, endpoint := range m.endpoints {
		result[id] = endpoint
	}

	return result
}

// RemoveEndpoint 移除端点内存数据
func (m *Manager) RemoveEndpoint(endpointID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.endpoints, endpointID)
}

// NeedsPersist 检查是否需要持久化
func (m *Manager) NeedsPersist() bool {
	return time.Since(m.lastPersistTime) >= m.persistInterval
}

// MarkPersisted 标记已持久化
func (m *Manager) MarkPersisted() {
	m.lastPersistTime = time.Now()
}

// recalculateStats 重新计算端点统计信息（需要持有锁）
func (m *Manager) recalculateStats(endpoint *EndpointShared) {
	stats := endpoint.State.Stats

	// 重置计数
	stats.TotalTunnels = 0
	stats.RunningTunnels = 0
	stats.StoppedTunnels = 0
	stats.ErrorTunnels = 0
	stats.TotalTCPRx = 0
	stats.TotalTCPTx = 0
	stats.TotalUDPRx = 0
	stats.TotalUDPTx = 0

	// 统计隧道状态
	for _, tunnel := range endpoint.State.Tunnels {
		stats.TotalTunnels++

		if tunnel.Status != nil {
			switch *tunnel.Status {
			case "running":
				stats.RunningTunnels++
			case "stopped":
				stats.StoppedTunnels++
			case "error":
				stats.ErrorTunnels++
			}
		}

		// 累计流量
		stats.TotalTCPRx += tunnel.TCPRx
		stats.TotalTCPTx += tunnel.TCPTx
		stats.TotalUDPRx += tunnel.UDPRx
		stats.TotalUDPTx += tunnel.UDPTx
	}
}

// GetStats 获取内存管理器统计信息
func (m *Manager) GetStats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	totalEndpoints := len(m.endpoints)
	totalTunnels := 0

	for _, endpoint := range m.endpoints {
		endpoint.Mu.RLock()
		totalTunnels += len(endpoint.State.Tunnels)
		endpoint.Mu.RUnlock()
	}

	return map[string]interface{}{
		"total_endpoints":  totalEndpoints,
		"total_tunnels":    totalTunnels,
		"last_persist":     m.lastPersistTime.Format("2006-01-02 15:04:05"),
		"persist_interval": m.persistInterval.String(),
	}
}
