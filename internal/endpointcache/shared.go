package endpointcache

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"fmt"
	"sort"
	"sync"
	"time"

	"gorm.io/gorm"
)

// EndpointShared 全局Endpoint缓存单例（类似Nezha的ServerShared）
type EndpointShared struct {
	// 核心数据映射 - endpointID -> Endpoint指针
	list map[int64]*models.Endpoint

	// 排序列表（按创建时间倒序）
	sortedList []*models.Endpoint

	// 变更追踪 - 记录哪些Endpoint需要持久化到数据库
	dirtySet map[int64]bool

	// 读写锁保护
	listMu       sync.RWMutex
	sortedListMu sync.RWMutex
	dirtyMu      sync.Mutex

	// 持久化控制
	lastPersistTime time.Time
	persistInterval time.Duration
}

// Shared 全局缓存单例实例
var Shared *EndpointShared
var once sync.Once

// InitShared 初始化全局Endpoint缓存单例
// 应用启动时调用一次
func InitShared(db *gorm.DB) error {
	var initErr error
	once.Do(func() {
		Shared = &EndpointShared{
			list:            make(map[int64]*models.Endpoint),
			sortedList:      make([]*models.Endpoint, 0),
			dirtySet:        make(map[int64]bool),
			persistInterval: 30 * time.Second,
			lastPersistTime: time.Now(),
		}

		// 从数据库加载所有Endpoint
		initErr = Shared.loadFromDB(db)
		if initErr != nil {
			return
		}

		// 初始化排序列表
		Shared.sortList()

		log.Infof("[EndpointCache] 初始化成功，已加载 %d 个端点", len(Shared.list))
	})

	return initErr
}

// loadFromDB 从数据库加载所有Endpoint
func (s *EndpointShared) loadFromDB(db *gorm.DB) error {
	var endpoints []models.Endpoint
	if err := db.Order("created_at DESC").Find(&endpoints).Error; err != nil {
		return fmt.Errorf("从数据库加载Endpoint失败: %w", err)
	}

	s.listMu.Lock()
	defer s.listMu.Unlock()

	// 清空现有缓存
	s.list = make(map[int64]*models.Endpoint)

	// 加载到缓存
	for i := range endpoints {
		endpoint := &endpoints[i]
		s.list[endpoint.ID] = endpoint
	}

	log.Infof("[EndpointCache] 从数据库加载了 %d 个端点", len(endpoints))
	return nil
}

// sortList 重新排序列表（需要先持有listMu.RLock）
func (s *EndpointShared) sortList() {
	s.sortedListMu.Lock()
	defer s.sortedListMu.Unlock()

	s.listMu.RLock()
	defer s.listMu.RUnlock()

	// 清空并重建排序列表
	s.sortedList = make([]*models.Endpoint, 0, len(s.list))
	for _, endpoint := range s.list {
		s.sortedList = append(s.sortedList, endpoint)
	}

	// 排序：创建时间倒序（最新的在前）
	sort.Slice(s.sortedList, func(i, j int) bool {
		return s.sortedList[i].CreatedAt.After(s.sortedList[j].CreatedAt)
	})

	log.Debugf("[EndpointCache] 排序列表已更新，共 %d 个端点", len(s.sortedList))
}

// ========== 读取操作（高频、只读）==========

// Get 根据ID获取Endpoint（线程安全，返回副本）
func (s *EndpointShared) Get(id int64) *models.Endpoint {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	endpoint, exists := s.list[id]
	if !exists {
		return nil
	}

	// 返回副本，避免外部修改影响缓存
	return s.copyEndpoint(endpoint)
}

// GetRef 获取Endpoint引用（仅内部使用，不安全）
func (s *EndpointShared) GetRef(id int64) *models.Endpoint {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	return s.list[id]
}

// GetAll 获取所有Endpoint的副本
func (s *EndpointShared) GetAll() []*models.Endpoint {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Endpoint, 0, len(s.list))
	for _, endpoint := range s.list {
		result = append(result, s.copyEndpoint(endpoint))
	}

	return result
}

// GetSortedList 获取排序后的列表（推荐用于API返回）
func (s *EndpointShared) GetSortedList() []*models.Endpoint {
	s.sortedListMu.RLock()
	defer s.sortedListMu.RUnlock()

	// 返回副本
	result := make([]*models.Endpoint, len(s.sortedList))
	for i, endpoint := range s.sortedList {
		result[i] = s.copyEndpoint(endpoint)
	}

	return result
}

// GetByStatus 根据状态过滤Endpoint
func (s *EndpointShared) GetByStatus(status models.EndpointStatus) []*models.Endpoint {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Endpoint, 0)
	for _, endpoint := range s.list {
		if endpoint.Status == status {
			result = append(result, s.copyEndpoint(endpoint))
		}
	}

	return result
}

// Count 获取Endpoint总数
func (s *EndpointShared) Count() int {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	return len(s.list)
}

// ========== 写入操作（低频、需持久化）==========

// Add 添加新Endpoint（创建时调用）
func (s *EndpointShared) Add(endpoint *models.Endpoint) {
	s.listMu.Lock()
	s.list[endpoint.ID] = endpoint
	s.listMu.Unlock()

	// 重新排序
	s.sortList()

	// 标记为脏数据（新创建的Endpoint已在数据库中，无需立即持久化）
	// s.MarkDirty(endpoint.ID)

	log.Infof("[EndpointCache] 添加端点: ID=%d, Name=%s", endpoint.ID, endpoint.Name)
}

// Delete 删除Endpoint（删除时调用）
func (s *EndpointShared) Delete(id int64) {
	s.listMu.Lock()
	delete(s.list, id)
	s.listMu.Unlock()

	// 重新排序
	s.sortList()

	// 从脏数据集中移除
	s.dirtyMu.Lock()
	delete(s.dirtySet, id)
	s.dirtyMu.Unlock()

	log.Infof("[EndpointCache] 删除端点: ID=%d", id)
}

// UpdateStatus 更新Endpoint状态（SSE事件触发）
func (s *EndpointShared) UpdateStatus(id int64, status models.EndpointStatus) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	endpoint, exists := s.list[id]
	if !exists {
		log.Warnf("[EndpointCache] 更新状态失败，端点不存在: ID=%d", id)
		return
	}

	// 只更新状态字段
	endpoint.Status = status
	endpoint.LastCheck = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[EndpointCache] 更新端点状态: ID=%d, Status=%s", id, status)
}

// UpdateTunnelCount 更新Tunnel数量（SSE事件触发）
func (s *EndpointShared) UpdateTunnelCount(id int64, count int64) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	endpoint, exists := s.list[id]
	if !exists {
		log.Warnf("[EndpointCache] 更新隧道数量失败，端点不存在: ID=%d", id)
		return
	}

	// 只更新隧道数量字段
	endpoint.TunnelCount = count
	endpoint.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[EndpointCache] 更新端点隧道数量: ID=%d, Count=%d", id, count)
}

// UpdateInfo 批量更新Endpoint信息（info接口调用后）
func (s *EndpointShared) UpdateInfo(id int64, info nodepass.EndpointInfoResult) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	endpoint, exists := s.list[id]
	if !exists {
		log.Warnf("[EndpointCache] 更新系统信息失败，端点不存在: ID=%d", id)
		return
	}

	// 更新系统信息字段
	endpoint.OS = &info.OS
	endpoint.Arch = &info.Arch
	endpoint.Ver = &info.Ver
	endpoint.Log = &info.Log
	endpoint.TLS = &info.TLS
	endpoint.Crt = &info.Crt
	endpoint.KeyPath = &info.Key
	endpoint.Uptime = &info.Uptime
	endpoint.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[EndpointCache] 更新端点系统信息: ID=%d, OS=%s, Arch=%s, Ver=%s",
		id, info.OS, info.Arch, info.Ver)
}

// UpdateField 通用字段更新方法
func (s *EndpointShared) UpdateField(id int64, field string, value interface{}) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	endpoint, exists := s.list[id]
	if !exists {
		log.Warnf("[EndpointCache] 更新字段失败，端点不存在: ID=%d, Field=%s", id, field)
		return
	}

	// 根据字段名更新对应字段
	switch field {
	case "name":
		if name, ok := value.(string); ok {
			endpoint.Name = name
		}
	case "url":
		if url, ok := value.(string); ok {
			endpoint.URL = url
		}
	case "hostname":
		if hostname, ok := value.(string); ok {
			endpoint.Hostname = hostname
		}
	case "api_path":
		if apiPath, ok := value.(string); ok {
			endpoint.APIPath = apiPath
		}
	case "api_key":
		if apiKey, ok := value.(string); ok {
			endpoint.APIKey = apiKey
		}
	default:
		log.Warnf("[EndpointCache] 不支持的字段更新: Field=%s", field)
		return
	}

	endpoint.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(id)

	log.Debugf("[EndpointCache] 更新端点字段: ID=%d, Field=%s", id, field)
}

// ========== 持久化操作 ==========

// MarkDirty 标记Endpoint需要持久化
func (s *EndpointShared) MarkDirty(id int64) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()

	s.dirtySet[id] = true
}

// PersistIfNeeded 检查并持久化变更到数据库
func (s *EndpointShared) PersistIfNeeded(db *gorm.DB) error {
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

	log.Infof("[EndpointCache] 开始持久化 %d 个变更的端点", len(dirtyIDs))

	// 批量更新数据库
	startTime := time.Now()
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, id := range dirtyIDs {
			s.listMu.RLock()
			endpoint := s.list[id]
			s.listMu.RUnlock()

			if endpoint == nil {
				continue
			}

			// 只更新变化的字段
			updates := map[string]interface{}{
				"status":       endpoint.Status,
				"tunnel_count": endpoint.TunnelCount,
				"last_check":   endpoint.LastCheck,
				"updated_at":   endpoint.UpdatedAt,
			}

			// 如果有系统信息字段，也更新
			if endpoint.OS != nil {
				updates["os"] = *endpoint.OS
			}
			if endpoint.Arch != nil {
				updates["arch"] = *endpoint.Arch
			}
			if endpoint.Ver != nil {
				updates["ver"] = *endpoint.Ver
			}
			if endpoint.Log != nil {
				updates["log"] = *endpoint.Log
			}
			if endpoint.TLS != nil {
				updates["tls"] = *endpoint.TLS
			}
			if endpoint.Crt != nil {
				updates["crt"] = *endpoint.Crt
			}
			if endpoint.KeyPath != nil {
				updates["key_path"] = *endpoint.KeyPath
			}
			if endpoint.Uptime != nil {
				updates["uptime"] = *endpoint.Uptime
			}

			if err := tx.Model(&models.Endpoint{}).Where("id = ?", id).Updates(updates).Error; err != nil {
				return fmt.Errorf("更新端点 %d 失败: %w", id, err)
			}
		}

		return nil
	})

	if err != nil {
		log.Errorf("[EndpointCache] 持久化失败: %v", err)
		return err
	}

	// 清空脏数据标记
	s.dirtyMu.Lock()
	s.dirtySet = make(map[int64]bool)
	s.dirtyMu.Unlock()

	s.lastPersistTime = time.Now()

	duration := time.Since(startTime)
	log.Infof("[EndpointCache] 持久化完成，耗时: %v, 更新了 %d 个端点",
		duration, len(dirtyIDs))

	return nil
}

// ForcePersist 强制持久化所有变更（应用关闭时调用）
func (s *EndpointShared) ForcePersist(db *gorm.DB) error {
	// 临时设置持久化间隔为0，强制触发持久化
	oldInterval := s.persistInterval
	s.persistInterval = 0

	err := s.PersistIfNeeded(db)

	// 恢复原持久化间隔
	s.persistInterval = oldInterval

	return err
}

// Shutdown 优雅关闭，持久化所有变更
func (s *EndpointShared) Shutdown(db *gorm.DB) error {
	log.Infof("[EndpointCache] 开始关闭，持久化所有变更...")

	if err := s.ForcePersist(db); err != nil {
		return fmt.Errorf("关闭时持久化失败: %w", err)
	}

	log.Infof("[EndpointCache] 关闭完成")
	return nil
}

// ========== 工具方法 ==========

// copyEndpoint 深拷贝Endpoint对象（避免外部修改影响缓存）
func (s *EndpointShared) copyEndpoint(src *models.Endpoint) *models.Endpoint {
	if src == nil {
		return nil
	}

	// 浅拷贝主结构
	dst := *src

	// 深拷贝指针字段
	if src.OS != nil {
		os := *src.OS
		dst.OS = &os
	}
	if src.Arch != nil {
		arch := *src.Arch
		dst.Arch = &arch
	}
	if src.Ver != nil {
		ver := *src.Ver
		dst.Ver = &ver
	}
	if src.Log != nil {
		log := *src.Log
		dst.Log = &log
	}
	if src.TLS != nil {
		tls := *src.TLS
		dst.TLS = &tls
	}
	if src.Crt != nil {
		crt := *src.Crt
		dst.Crt = &crt
	}
	if src.KeyPath != nil {
		keyPath := *src.KeyPath
		dst.KeyPath = &keyPath
	}
	if src.Uptime != nil {
		uptime := *src.Uptime
		dst.Uptime = &uptime
	}

	return &dst
}

// GetStats 获取缓存统计信息
func (s *EndpointShared) GetStats() map[string]interface{} {
	s.listMu.RLock()
	totalEndpoints := len(s.list)
	s.listMu.RUnlock()

	s.dirtyMu.Lock()
	dirtyCount := len(s.dirtySet)
	s.dirtyMu.Unlock()

	return map[string]interface{}{
		"total_endpoints":  totalEndpoints,
		"dirty_count":      dirtyCount,
		"last_persist":     s.lastPersistTime.Format("2006-01-02 15:04:05"),
		"persist_interval": s.persistInterval.String(),
	}
}

// Reload 重新从数据库加载所有Endpoint（手动刷新缓存）
func (s *EndpointShared) Reload(db *gorm.DB) error {
	log.Infof("[EndpointCache] 开始重新加载缓存...")

	if err := s.loadFromDB(db); err != nil {
		return err
	}

	// 重新排序
	s.sortList()

	// 清空脏数据标记
	s.dirtyMu.Lock()
	s.dirtySet = make(map[int64]bool)
	s.dirtyMu.Unlock()

	log.Infof("[EndpointCache] 缓存重新加载完成，共 %d 个端点", len(s.list))
	return nil
}
