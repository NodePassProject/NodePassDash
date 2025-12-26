package tunnelcache

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"fmt"
	"sort"
	"sync"
	"time"

	"gorm.io/gorm"
)

// TunnelShared 全局Tunnel缓存单例（类似EndpointShared）
type TunnelShared struct {
	// 核心数据映射 - tunnelID -> Tunnel指针
	list map[int64]*models.Tunnel

	// instanceID -> tunnelID 映射，用于快速通过instanceID查找tunnel
	instanceIDMap map[string]int64

	// 排序列表（按创建时间倒序）
	sortedList []*models.Tunnel

	// 变更追踪 - 记录哪些Tunnel需要持久化到数据库
	dirtySet map[int64]bool

	// 读写锁保护
	listMu          sync.RWMutex
	instanceMapMu   sync.RWMutex
	sortedListMu    sync.RWMutex
	dirtyMu         sync.Mutex

	// 持久化控制
	lastPersistTime time.Time
	persistInterval time.Duration
}

// Shared 全局缓存单例实例
var Shared *TunnelShared
var once sync.Once

// InitShared 初始化全局Tunnel缓存单例
// 应用启动时调用一次
func InitShared(db *gorm.DB) error {
	var initErr error
	once.Do(func() {
		Shared = &TunnelShared{
			list:            make(map[int64]*models.Tunnel),
			instanceIDMap:   make(map[string]int64),
			sortedList:      make([]*models.Tunnel, 0),
			dirtySet:        make(map[int64]bool),
			persistInterval: 30 * time.Second,
			lastPersistTime: time.Now(),
		}

		// 从数据库加载所有Tunnel
		initErr = Shared.loadFromDB(db)
		if initErr != nil {
			return
		}

		// 初始化排序列表
		Shared.sortList()

		log.Infof("[TunnelCache] 初始化成功，已加载 %d 个隧道", len(Shared.list))
	})

	return initErr
}

// loadFromDB 从数据库加载所有Tunnel
func (s *TunnelShared) loadFromDB(db *gorm.DB) error {
	var tunnels []models.Tunnel
	if err := db.Order("created_at DESC").Find(&tunnels).Error; err != nil {
		return fmt.Errorf("从数据库加载Tunnel失败: %w", err)
	}

	s.listMu.Lock()
	defer s.listMu.Unlock()

	s.instanceMapMu.Lock()
	defer s.instanceMapMu.Unlock()

	// 清空现有缓存
	s.list = make(map[int64]*models.Tunnel)
	s.instanceIDMap = make(map[string]int64)

	// 加载到缓存
	for i := range tunnels {
		tunnel := &tunnels[i]
		s.list[tunnel.ID] = tunnel

		// 建立 instanceID -> ID 映射
		if tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
			s.instanceIDMap[*tunnel.InstanceID] = tunnel.ID
		}
	}

	log.Infof("[TunnelCache] 从数据库加载了 %d 个隧道", len(tunnels))
	return nil
}

// sortList 重新排序列表（需要先持有listMu.RLock）
func (s *TunnelShared) sortList() {
	s.sortedListMu.Lock()
	defer s.sortedListMu.Unlock()

	s.listMu.RLock()
	defer s.listMu.RUnlock()

	// 清空并重建排序列表
	s.sortedList = make([]*models.Tunnel, 0, len(s.list))
	for _, tunnel := range s.list {
		s.sortedList = append(s.sortedList, tunnel)
	}

	// 排序：创建时间倒序（最新的在前）
	sort.Slice(s.sortedList, func(i, j int) bool {
		return s.sortedList[i].CreatedAt.After(s.sortedList[j].CreatedAt)
	})

	log.Debugf("[TunnelCache] 排序列表已更新，共 %d 个隧道", len(s.sortedList))
}

// ========== 读取操作（高频、只读）==========

// Get 根据ID获取Tunnel（线程安全，返回副本）
func (s *TunnelShared) Get(id int64) *models.Tunnel {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	tunnel, exists := s.list[id]
	if !exists {
		return nil
	}

	// 返回副本，避免外部修改影响缓存
	return s.copyTunnel(tunnel)
}

// GetRef 获取Tunnel引用（仅内部使用，不安全）
func (s *TunnelShared) GetRef(id int64) *models.Tunnel {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	return s.list[id]
}

// GetByInstanceID 根据InstanceID获取Tunnel（线程安全，返回副本）
func (s *TunnelShared) GetByInstanceID(instanceID string) *models.Tunnel {
	s.instanceMapMu.RLock()
	tunnelID, exists := s.instanceIDMap[instanceID]
	s.instanceMapMu.RUnlock()

	if !exists {
		return nil
	}

	return s.Get(tunnelID)
}

// GetAll 获取所有Tunnel的副本
func (s *TunnelShared) GetAll() []*models.Tunnel {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Tunnel, 0, len(s.list))
	for _, tunnel := range s.list {
		result = append(result, s.copyTunnel(tunnel))
	}

	return result
}

// GetSortedList 获取排序后的列表（推荐用于API返回）
func (s *TunnelShared) GetSortedList() []*models.Tunnel {
	s.sortedListMu.RLock()
	defer s.sortedListMu.RUnlock()

	// 返回副本
	result := make([]*models.Tunnel, len(s.sortedList))
	for i, tunnel := range s.sortedList {
		result[i] = s.copyTunnel(tunnel)
	}

	return result
}

// GetByStatus 根据状态过滤Tunnel
func (s *TunnelShared) GetByStatus(status models.TunnelStatus) []*models.Tunnel {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Tunnel, 0)
	for _, tunnel := range s.list {
		if tunnel.Status == status {
			result = append(result, s.copyTunnel(tunnel))
		}
	}

	return result
}

// GetByEndpointID 根据端点ID获取所有Tunnel
func (s *TunnelShared) GetByEndpointID(endpointID int64) []*models.Tunnel {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Tunnel, 0)
	for _, tunnel := range s.list {
		if tunnel.EndpointID == endpointID {
			result = append(result, s.copyTunnel(tunnel))
		}
	}

	return result
}

// Count 获取Tunnel总数
func (s *TunnelShared) Count() int {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	return len(s.list)
}

// CountByEndpointID 获取指定端点的Tunnel数量
func (s *TunnelShared) CountByEndpointID(endpointID int64) int {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	count := 0
	for _, tunnel := range s.list {
		if tunnel.EndpointID == endpointID {
			count++
		}
	}

	return count
}

// ========== 写入操作（低频、需持久化）==========

// Add 添加新Tunnel（创建时调用）
func (s *TunnelShared) Add(tunnel *models.Tunnel) {
	s.listMu.Lock()
	s.list[tunnel.ID] = tunnel
	s.listMu.Unlock()

	// 建立 instanceID 映射
	if tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
		s.instanceMapMu.Lock()
		s.instanceIDMap[*tunnel.InstanceID] = tunnel.ID
		s.instanceMapMu.Unlock()
	}

	// 重新排序
	s.sortList()

	// 标记为脏数据（新创建的Tunnel已在数据库中，无需立即持久化）
	// s.MarkDirty(tunnel.ID)

	log.Infof("[TunnelCache] 添加隧道: ID=%d, Name=%s, InstanceID=%v",
		tunnel.ID, tunnel.Name, tunnel.InstanceID)
}

// Delete 删除Tunnel（删除时调用）
func (s *TunnelShared) Delete(id int64) {
	s.listMu.Lock()
	tunnel := s.list[id]
	delete(s.list, id)
	s.listMu.Unlock()

	// 从 instanceID 映射中移除
	if tunnel != nil && tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
		s.instanceMapMu.Lock()
		delete(s.instanceIDMap, *tunnel.InstanceID)
		s.instanceMapMu.Unlock()
	}

	// 重新排序
	s.sortList()

	// 从脏数据集中移除
	s.dirtyMu.Lock()
	delete(s.dirtySet, id)
	s.dirtyMu.Unlock()

	log.Infof("[TunnelCache] 删除隧道: ID=%d", id)
}

// DeleteByInstanceID 根据InstanceID删除Tunnel
func (s *TunnelShared) DeleteByInstanceID(instanceID string) {
	s.instanceMapMu.RLock()
	tunnelID, exists := s.instanceIDMap[instanceID]
	s.instanceMapMu.RUnlock()

	if !exists {
		log.Warnf("[TunnelCache] 删除隧道失败，实例不存在: InstanceID=%s", instanceID)
		return
	}

	s.Delete(tunnelID)
}

// UpdateStatus 更新Tunnel状态（SSE事件触发）
func (s *TunnelShared) UpdateStatus(id int64, status models.TunnelStatus) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	tunnel, exists := s.list[id]
	if !exists {
		log.Warnf("[TunnelCache] 更新状态失败，隧道不存在: ID=%d", id)
		return
	}

	// 只更新状态字段
	tunnel.Status = status
	tunnel.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[TunnelCache] 更新隧道状态: ID=%d, Status=%s", id, status)
}

// UpdateStatusByInstanceID 根据InstanceID更新Tunnel状态
func (s *TunnelShared) UpdateStatusByInstanceID(instanceID string, status models.TunnelStatus) {
	s.instanceMapMu.RLock()
	tunnelID, exists := s.instanceIDMap[instanceID]
	s.instanceMapMu.RUnlock()

	if !exists {
		log.Warnf("[TunnelCache] 更新状态失败，实例不存在: InstanceID=%s", instanceID)
		return
	}

	s.UpdateStatus(tunnelID, status)
}

// UpdateTraffic 更新Tunnel流量数据（SSE事件触发）
func (s *TunnelShared) UpdateTraffic(id int64, tcpRx, tcpTx, udpRx, udpTx int64) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	tunnel, exists := s.list[id]
	if !exists {
		log.Warnf("[TunnelCache] 更新流量失败，隧道不存在: ID=%d", id)
		return
	}

	// 更新流量字段
	tunnel.TCPRx = tcpRx
	tunnel.TCPTx = tcpTx
	tunnel.UDPRx = udpRx
	tunnel.UDPTx = udpTx
	tunnel.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[TunnelCache] 更新隧道流量: ID=%d, TCPRx=%d, TCPTx=%d, UDPRx=%d, UDPTx=%d",
		id, tcpRx, tcpTx, udpRx, udpTx)
}

// UpdateTrafficByInstanceID 根据InstanceID更新Tunnel流量数据
func (s *TunnelShared) UpdateTrafficByInstanceID(instanceID string, tcpRx, tcpTx, udpRx, udpTx int64) {
	s.instanceMapMu.RLock()
	tunnelID, exists := s.instanceIDMap[instanceID]
	s.instanceMapMu.RUnlock()

	if !exists {
		log.Warnf("[TunnelCache] 更新流量失败，实例不存在: InstanceID=%s", instanceID)
		return
	}

	s.UpdateTraffic(tunnelID, tcpRx, tcpTx, udpRx, udpTx)
}

// UpdateMetrics 更新Tunnel指标（Pool, Ping, TCPs, UDPs）
func (s *TunnelShared) UpdateMetrics(id int64, pool, ping, tcps, udps *int64) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	tunnel, exists := s.list[id]
	if !exists {
		log.Warnf("[TunnelCache] 更新指标失败，隧道不存在: ID=%d", id)
		return
	}

	// 更新指标字段
	if pool != nil {
		tunnel.Pool = pool
	}
	if ping != nil {
		tunnel.Ping = ping
	}
	if tcps != nil {
		tunnel.TCPs = tcps
	}
	if udps != nil {
		tunnel.UDPs = udps
	}
	tunnel.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[TunnelCache] 更新隧道指标: ID=%d, Pool=%v, Ping=%v, TCPs=%v, UDPs=%v",
		id, pool, ping, tcps, udps)
}

// UpdateMetricsByInstanceID 根据InstanceID更新Tunnel指标
func (s *TunnelShared) UpdateMetricsByInstanceID(instanceID string, pool, ping, tcps, udps *int64) {
	s.instanceMapMu.RLock()
	tunnelID, exists := s.instanceIDMap[instanceID]
	s.instanceMapMu.RUnlock()

	if !exists {
		log.Warnf("[TunnelCache] 更新指标失败，实例不存在: InstanceID=%s", instanceID)
		return
	}

	s.UpdateMetrics(tunnelID, pool, ping, tcps, udps)
}

// UpdateField 通用字段更新方法
func (s *TunnelShared) UpdateField(id int64, field string, value interface{}) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	tunnel, exists := s.list[id]
	if !exists {
		log.Warnf("[TunnelCache] 更新字段失败，隧道不存在: ID=%d, Field=%s", id, field)
		return
	}

	// 根据字段名更新对应字段
	switch field {
	case "name":
		if name, ok := value.(string); ok {
			tunnel.Name = name
		}
	case "status":
		if status, ok := value.(models.TunnelStatus); ok {
			tunnel.Status = status
		}
	case "restart":
		if restart, ok := value.(bool); ok {
			tunnel.Restart = &restart
		}
	case "alias":
		if alias, ok := value.(string); ok {
			// 更新 Peer 中的 Alias
			if tunnel.Peer == nil {
				tunnel.Peer = &models.Peer{}
			}
			tunnel.Peer.Alias = &alias
		}
	case "sorts":
		if sorts, ok := value.(int64); ok {
			tunnel.Sorts = sorts
		}
	default:
		log.Warnf("[TunnelCache] 不支持的字段更新: Field=%s", field)
		return
	}

	tunnel.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[TunnelCache] 更新隧道字段: ID=%d, Field=%s", id, field)
}

// UpdateFullTunnel 完整更新Tunnel（编辑隧道时调用）
func (s *TunnelShared) UpdateFullTunnel(tunnel *models.Tunnel) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	oldTunnel, exists := s.list[tunnel.ID]
	if !exists {
		log.Warnf("[TunnelCache] 完整更新失败，隧道不存在: ID=%d", tunnel.ID)
		return
	}

	// 保存旧的 instanceID
	var oldInstanceID string
	if oldTunnel.InstanceID != nil {
		oldInstanceID = *oldTunnel.InstanceID
	}

	// 更新隧道对象
	tunnel.UpdatedAt = time.Now()
	s.list[tunnel.ID] = tunnel

	// 更新 instanceID 映射
	var newInstanceID string
	if tunnel.InstanceID != nil {
		newInstanceID = *tunnel.InstanceID
	}

	if oldInstanceID != newInstanceID {
		s.instanceMapMu.Lock()
		// 删除旧映射
		if oldInstanceID != "" {
			delete(s.instanceIDMap, oldInstanceID)
		}
		// 添加新映射
		if newInstanceID != "" {
			s.instanceIDMap[newInstanceID] = tunnel.ID
		}
		s.instanceMapMu.Unlock()
	}

	// 标记为脏数据
	s.MarkDirty(tunnel.ID)

	log.Infof("[TunnelCache] 完整更新隧道: ID=%d, Name=%s", tunnel.ID, tunnel.Name)
}

// ========== 持久化操作 ==========

// MarkDirty 标记Tunnel需要持久化
func (s *TunnelShared) MarkDirty(id int64) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()

	s.dirtySet[id] = true
}

// PersistIfNeeded 检查并持久化变更到数据库
func (s *TunnelShared) PersistIfNeeded(db *gorm.DB) error {
	// 检查是否需要持久化
	if time.Since(s.lastPersistTime) < s.persistInterval {
		return nil
	}

	// 获取脏数据列表
	s.dirtyMu.Lock()
	if len(s.dirtySet) == 0 {
		s.dirtyMu.Unlock()
		s.lastPersistTime = time.Now()
		return nil
	}

	dirtyIDs := make([]int64, 0, len(s.dirtySet))
	for id := range s.dirtySet {
		dirtyIDs = append(dirtyIDs, id)
	}
	s.dirtyMu.Unlock()

	log.Infof("[TunnelCache] 开始持久化 %d 个变更的隧道", len(dirtyIDs))

	// 批量更新数据库
	startTime := time.Now()
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, id := range dirtyIDs {
			s.listMu.RLock()
			tunnel := s.list[id]
			s.listMu.RUnlock()

			if tunnel == nil {
				continue
			}

			// 只更新变化的字段
			updates := map[string]interface{}{
				"status":      tunnel.Status,
				"tcp_rx":      tunnel.TCPRx,
				"tcp_tx":      tunnel.TCPTx,
				"udp_rx":      tunnel.UDPRx,
				"udp_tx":      tunnel.UDPTx,
				"updated_at":  tunnel.UpdatedAt,
			}

			// 如果有可选字段，也更新
			if tunnel.Pool != nil {
				updates["pool"] = *tunnel.Pool
			}
			if tunnel.Ping != nil {
				updates["ping"] = *tunnel.Ping
			}
			if tunnel.TCPs != nil {
				updates["tcps"] = *tunnel.TCPs
			}
			if tunnel.UDPs != nil {
				updates["udps"] = *tunnel.UDPs
			}
			if tunnel.Restart != nil {
				updates["restart"] = *tunnel.Restart
			}
			if tunnel.Peer != nil {
				updates["peer"] = tunnel.Peer
			}

			if err := tx.Model(&models.Tunnel{}).Where("id = ?", id).Updates(updates).Error; err != nil {
				return fmt.Errorf("更新隧道 %d 失败: %w", id, err)
			}
		}

		return nil
	})

	if err != nil {
		log.Errorf("[TunnelCache] 持久化失败: %v", err)
		return err
	}

	// 清空脏数据标记
	s.dirtyMu.Lock()
	s.dirtySet = make(map[int64]bool)
	s.dirtyMu.Unlock()

	s.lastPersistTime = time.Now()

	duration := time.Since(startTime)
	log.Infof("[TunnelCache] 持久化完成，耗时: %v, 更新了 %d 个隧道",
		duration, len(dirtyIDs))

	return nil
}

// ForcePersist 强制持久化所有变更（应用关闭时调用）
func (s *TunnelShared) ForcePersist(db *gorm.DB) error {
	// 临时设置持久化间隔为0，强制触发持久化
	oldInterval := s.persistInterval
	s.persistInterval = 0

	err := s.PersistIfNeeded(db)

	// 恢复原持久化间隔
	s.persistInterval = oldInterval

	return err
}

// Shutdown 优雅关闭，持久化所有变更
func (s *TunnelShared) Shutdown(db *gorm.DB) error {
	log.Infof("[TunnelCache] 开始关闭，持久化所有变更...")

	if err := s.ForcePersist(db); err != nil {
		return fmt.Errorf("关闭时持久化失败: %w", err)
	}

	log.Infof("[TunnelCache] 关闭完成")
	return nil
}

// ========== 工具方法 ==========

// copyTunnel 深拷贝Tunnel对象（避免外部修改影响缓存）
func (s *TunnelShared) copyTunnel(src *models.Tunnel) *models.Tunnel {
	if src == nil {
		return nil
	}

	// 浅拷贝主结构
	dst := *src

	// 深拷贝指针字段
	if src.ListenType != nil {
		lt := *src.ListenType
		dst.ListenType = &lt
	}
	if src.ExtendTargetAddress != nil {
		eta := make([]string, len(*src.ExtendTargetAddress))
		copy(eta, *src.ExtendTargetAddress)
		dst.ExtendTargetAddress = &eta
	}
	if src.CertPath != nil {
		cp := *src.CertPath
		dst.CertPath = &cp
	}
	if src.KeyPath != nil {
		kp := *src.KeyPath
		dst.KeyPath = &kp
	}
	if src.Password != nil {
		pwd := *src.Password
		dst.Password = &pwd
	}
	if src.InstanceID != nil {
		iid := *src.InstanceID
		dst.InstanceID = &iid
	}
	if src.Restart != nil {
		r := *src.Restart
		dst.Restart = &r
	}
	if src.Mode != nil {
		m := *src.Mode
		dst.Mode = &m
	}
	if src.Rate != nil {
		rate := *src.Rate
		dst.Rate = &rate
	}
	if src.Read != nil {
		read := *src.Read
		dst.Read = &read
	}
	if src.TCPs != nil {
		tcps := *src.TCPs
		dst.TCPs = &tcps
	}
	if src.UDPs != nil {
		udps := *src.UDPs
		dst.UDPs = &udps
	}
	if src.Pool != nil {
		pool := *src.Pool
		dst.Pool = &pool
	}
	if src.Ping != nil {
		ping := *src.Ping
		dst.Ping = &ping
	}
	if src.Min != nil {
		min := *src.Min
		dst.Min = &min
	}
	if src.Max != nil {
		max := *src.Max
		dst.Max = &max
	}
	if src.Slot != nil {
		slot := *src.Slot
		dst.Slot = &slot
	}
	if src.ProxyProtocol != nil {
		pp := *src.ProxyProtocol
		dst.ProxyProtocol = &pp
	}
	if src.Tags != nil {
		tags := make(map[string]string)
		for k, v := range *src.Tags {
			tags[k] = v
		}
		dst.Tags = &tags
	}
	if src.ConfigLine != nil {
		cl := *src.ConfigLine
		dst.ConfigLine = &cl
	}
	if src.Peer != nil {
		peer := &models.Peer{}
		if src.Peer.SID != nil {
			sid := *src.Peer.SID
			peer.SID = &sid
		}
		if src.Peer.Type != nil {
			pType := *src.Peer.Type
			peer.Type = &pType
		}
		if src.Peer.Alias != nil {
			alias := *src.Peer.Alias
			peer.Alias = &alias
		}
		dst.Peer = peer
	}
	if src.Dial != nil {
		dial := *src.Dial
		dst.Dial = &dial
	}
	if src.Quic != nil {
		quic := *src.Quic
		dst.Quic = &quic
	}
	if src.Dns != nil {
		dns := *src.Dns
		dst.Dns = &dns
	}
	if src.ServiceSID != nil {
		ssid := *src.ServiceSID
		dst.ServiceSID = &ssid
	}

	return &dst
}

// GetStats 获取缓存统计信息
func (s *TunnelShared) GetStats() map[string]interface{} {
	s.listMu.RLock()
	totalTunnels := len(s.list)
	s.listMu.RUnlock()

	s.dirtyMu.Lock()
	dirtyCount := len(s.dirtySet)
	s.dirtyMu.Unlock()

	return map[string]interface{}{
		"total_tunnels":    totalTunnels,
		"dirty_count":      dirtyCount,
		"last_persist":     s.lastPersistTime.Format("2006-01-02 15:04:05"),
		"persist_interval": s.persistInterval.String(),
	}
}

// Reload 重新从数据库加载所有Tunnel（手动刷新缓存）
func (s *TunnelShared) Reload(db *gorm.DB) error {
	log.Infof("[TunnelCache] 开始重新加载缓存...")

	if err := s.loadFromDB(db); err != nil {
		return err
	}

	// 重新排序
	s.sortList()

	// 清空脏数据标记
	s.dirtyMu.Lock()
	s.dirtySet = make(map[int64]bool)
	s.dirtyMu.Unlock()

	log.Infof("[TunnelCache] 缓存重新加载完成，共 %d 个隧道", len(s.list))
	return nil
}
