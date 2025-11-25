package servicecache

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"fmt"
	"sort"
	"sync"
	"time"

	"gorm.io/gorm"
)

// ServiceShared 全局Service缓存单例（类似Endpoint的缓存结构）
type ServiceShared struct {
	// 核心数据映射 - sid -> Service指针
	list map[string]*models.Services

	// 排序列表（按sorts倒序）
	sortedList []*models.Services

	// 变更追踪 - 记录哪些Service需要持久化到数据库
	dirtySet map[string]bool

	// 读写锁保护
	listMu       sync.RWMutex
	sortedListMu sync.RWMutex
	dirtyMu      sync.Mutex

	// 持久化控制
	lastPersistTime time.Time
	persistInterval time.Duration
}

// Shared 全局缓存单例实例
var Shared *ServiceShared
var once sync.Once

// InitShared 初始化全局Service缓存单例
// 应用启动时调用一次
func InitShared(db *gorm.DB) error {
	var initErr error
	once.Do(func() {
		Shared = &ServiceShared{
			list:            make(map[string]*models.Services),
			sortedList:      make([]*models.Services, 0),
			dirtySet:        make(map[string]bool),
			persistInterval: 30 * time.Second,
			lastPersistTime: time.Now(),
		}

		// 从数据库加载所有Service
		initErr = Shared.loadFromDB(db)
		if initErr != nil {
			return
		}

		// 初始化排序列表
		Shared.sortList()

		log.Infof("[ServiceCache] 初始化成功，已加载 %d 个服务", len(Shared.list))
	})

	return initErr
}

// loadFromDB 从数据库加载所有Service
func (s *ServiceShared) loadFromDB(db *gorm.DB) error {
	var services []models.Services
	if err := db.Order("sorts DESC").Find(&services).Error; err != nil {
		return fmt.Errorf("从数据库加载Service失败: %w", err)
	}

	s.listMu.Lock()
	defer s.listMu.Unlock()

	// 清空现有缓存
	s.list = make(map[string]*models.Services)

	// 加载到缓存
	for i := range services {
		service := &services[i]
		s.list[service.Sid] = service
	}

	log.Infof("[ServiceCache] 从数据库加载了 %d 个服务", len(services))
	return nil
}

// sortList 重新排序列表（需要先持有listMu.RLock）
func (s *ServiceShared) sortList() {
	s.sortedListMu.Lock()
	defer s.sortedListMu.Unlock()

	s.listMu.RLock()
	defer s.listMu.RUnlock()

	// 清空并重建排序列表
	s.sortedList = make([]*models.Services, 0, len(s.list))
	for _, service := range s.list {
		s.sortedList = append(s.sortedList, service)
	}

	// 排序：sorts倒序（更大的值在前）
	sort.Slice(s.sortedList, func(i, j int) bool {
		return s.sortedList[i].Sorts > s.sortedList[j].Sorts
	})

	log.Debugf("[ServiceCache] 排序列表已更新，共 %d 个服务", len(s.sortedList))
}

// ========== 读取操作（高频、只读）==========

// Get 根据SID获取Service（线程安全，返回副本）
func (s *ServiceShared) Get(sid string) *models.Services {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	service, exists := s.list[sid]
	if !exists {
		return nil
	}

	// 返回副本，避免外部修改影响缓存
	return s.copyService(service)
}

// GetRef 获取Service引用（仅内部使用，不安全）
func (s *ServiceShared) GetRef(sid string) *models.Services {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	return s.list[sid]
}

// GetAll 获取所有Service的副本
func (s *ServiceShared) GetAll() []*models.Services {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Services, 0, len(s.list))
	for _, service := range s.list {
		result = append(result, s.copyService(service))
	}

	return result
}

// GetSortedList 获取排序后的列表（推荐用于API返回）
func (s *ServiceShared) GetSortedList() []*models.Services {
	s.sortedListMu.RLock()
	defer s.sortedListMu.RUnlock()

	// 返回副本
	result := make([]*models.Services, len(s.sortedList))
	for i, service := range s.sortedList {
		result[i] = s.copyService(service)
	}

	return result
}

// GetByType 根据类型过滤Service
func (s *ServiceShared) GetByType(serviceType string) []*models.Services {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	result := make([]*models.Services, 0)
	for _, service := range s.list {
		if service.Type == serviceType {
			result = append(result, s.copyService(service))
		}
	}

	return result
}

// Count 获取Service总数
func (s *ServiceShared) Count() int {
	s.listMu.RLock()
	defer s.listMu.RUnlock()

	return len(s.list)
}

// ========== 写入操作（低频、需持久化）==========

// Add 添加新Service（创建时调用）
func (s *ServiceShared) Add(service *models.Services) {
	s.listMu.Lock()
	s.list[service.Sid] = service
	s.listMu.Unlock()

	// 重新排序
	s.sortList()

	// 标记为脏数据（新创建的Service已在数据库中，无需立即持久化）
	// s.MarkDirty(service.Sid)

	log.Infof("[ServiceCache] 添加服务: SID=%s, Type=%s, Alias=%v", service.Sid, service.Type, service.Alias)
}

// Delete 删除Service（删除时调用）
func (s *ServiceShared) Delete(sid string) {
	s.listMu.Lock()
	delete(s.list, sid)
	s.listMu.Unlock()

	// 重新排序
	s.sortList()

	// 从脏数据集中移除
	s.dirtyMu.Lock()
	delete(s.dirtySet, sid)
	s.dirtyMu.Unlock()

	log.Infof("[ServiceCache] 删除服务: SID=%s", sid)
}

// UpdateTraffic 更新Service流量统计
func (s *ServiceShared) UpdateTraffic(sid string, totalRx, totalTx int64) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	service, exists := s.list[sid]
	if !exists {
		log.Warnf("[ServiceCache] 更新流量失败，服务不存在: SID=%s", sid)
		return
	}

	// 更新流量字段
	service.TotalRx = totalRx
	service.TotalTx = totalTx
	service.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(sid)

	log.Debugf("[ServiceCache] 更新服务流量: SID=%s, TotalRx=%d, TotalTx=%d", sid, totalRx, totalTx)
}

// UpdateField 通用字段更新方法
func (s *ServiceShared) UpdateField(sid string, field string, value interface{}) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	service, exists := s.list[sid]
	if !exists {
		log.Warnf("[ServiceCache] 更新字段失败，服务不存在: SID=%s, Field=%s", sid, field)
		return
	}

	// 根据字段名更新对应字段
	switch field {
	case "alias":
		if alias, ok := value.(*string); ok {
			service.Alias = alias
		}
	case "sorts":
		if sorts, ok := value.(int64); ok {
			service.Sorts = sorts
		}
	case "server_instance_id":
		if serverInstanceId, ok := value.(*string); ok {
			service.ServerInstanceId = serverInstanceId
		}
	case "client_instance_id":
		if clientInstanceId, ok := value.(*string); ok {
			service.ClientInstanceId = clientInstanceId
		}
	case "server_endpoint_id":
		if serverEndpointId, ok := value.(*int64); ok {
			service.ServerEndpointId = serverEndpointId
		}
	case "client_endpoint_id":
		if clientEndpointId, ok := value.(*int64); ok {
			service.ClientEndpointId = clientEndpointId
		}
	case "tunnel_port":
		if tunnelPort, ok := value.(*string); ok {
			service.TunnelPort = tunnelPort
		}
	case "tunnel_endpoint_name":
		if tunnelEndpointName, ok := value.(*string); ok {
			service.TunnelEndpointName = tunnelEndpointName
		}
	case "entrance_port":
		if entrancePort, ok := value.(*string); ok {
			service.EntrancePort = entrancePort
		}
	case "entrance_host":
		if entranceHost, ok := value.(*string); ok {
			service.EntranceHost = entranceHost
		}
	case "exit_port":
		if exitPort, ok := value.(*string); ok {
			service.ExitPort = exitPort
		}
	case "exit_host":
		if exitHost, ok := value.(*string); ok {
			service.ExitHost = exitHost
		}
	case "total_rx":
		if totalRx, ok := value.(int64); ok {
			service.TotalRx = totalRx
		}
	case "total_tx":
		if totalTx, ok := value.(int64); ok {
			service.TotalTx = totalTx
		}
	default:
		log.Warnf("[ServiceCache] 不支持的字段更新: Field=%s", field)
		return
	}

	service.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(sid)

	log.Debugf("[ServiceCache] 更新服务字段: SID=%s, Field=%s", sid, field)
}

// UpdateService 批量更新Service字段
func (s *ServiceShared) UpdateService(sid string, updates map[string]interface{}) {
	s.listMu.Lock()
	defer s.listMu.Unlock()

	service, exists := s.list[sid]
	if !exists {
		log.Warnf("[ServiceCache] 更新服务失败，服务不存在: SID=%s", sid)
		return
	}

	// 批量更新字段
	for field, value := range updates {
		switch field {
		case "alias":
			if alias, ok := value.(*string); ok {
				service.Alias = alias
			}
		case "sorts":
			if sorts, ok := value.(int64); ok {
				service.Sorts = sorts
			}
		case "server_instance_id":
			if serverInstanceId, ok := value.(*string); ok {
				service.ServerInstanceId = serverInstanceId
			}
		case "client_instance_id":
			if clientInstanceId, ok := value.(*string); ok {
				service.ClientInstanceId = clientInstanceId
			}
		case "server_endpoint_id":
			if serverEndpointId, ok := value.(*int64); ok {
				service.ServerEndpointId = serverEndpointId
			}
		case "client_endpoint_id":
			if clientEndpointId, ok := value.(*int64); ok {
				service.ClientEndpointId = clientEndpointId
			}
		case "tunnel_port":
			if tunnelPort, ok := value.(*string); ok {
				service.TunnelPort = tunnelPort
			}
		case "tunnel_endpoint_name":
			if tunnelEndpointName, ok := value.(*string); ok {
				service.TunnelEndpointName = tunnelEndpointName
			}
		case "entrance_port":
			if entrancePort, ok := value.(*string); ok {
				service.EntrancePort = entrancePort
			}
		case "entrance_host":
			if entranceHost, ok := value.(*string); ok {
				service.EntranceHost = entranceHost
			}
		case "exit_port":
			if exitPort, ok := value.(*string); ok {
				service.ExitPort = exitPort
			}
		case "exit_host":
			if exitHost, ok := value.(*string); ok {
				service.ExitHost = exitHost
			}
		case "total_rx":
			if totalRx, ok := value.(int64); ok {
				service.TotalRx = totalRx
			}
		case "total_tx":
			if totalTx, ok := value.(int64); ok {
				service.TotalTx = totalTx
			}
		}
	}

	service.UpdatedAt = time.Now()

	// 标记为脏数据
	s.MarkDirty(sid)

	log.Debugf("[ServiceCache] 批量更新服务: SID=%s, fields=%v", sid, updates)
}

// ========== 持久化操作 ==========

// MarkDirty 标记Service需要持久化
func (s *ServiceShared) MarkDirty(sid string) {
	s.dirtyMu.Lock()
	defer s.dirtyMu.Unlock()

	s.dirtySet[sid] = true
}

// PersistIfNeeded 检查并持久化变更到数据库
func (s *ServiceShared) PersistIfNeeded(db *gorm.DB) error {
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

	dirtySIDs := make([]string, 0, len(s.dirtySet))
	for sid := range s.dirtySet {
		dirtySIDs = append(dirtySIDs, sid)
	}
	s.dirtyMu.Unlock()

	log.Infof("[ServiceCache] 开始持久化 %d 个变更的服务", len(dirtySIDs))

	// 批量更新数据库
	startTime := time.Now()
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, sid := range dirtySIDs {
			s.listMu.RLock()
			service := s.list[sid]
			s.listMu.RUnlock()

			if service == nil {
				continue
			}

			// 更新所有字段
			updates := map[string]interface{}{
				"total_rx":   service.TotalRx,
				"total_tx":   service.TotalTx,
				"sorts":      service.Sorts,
				"updated_at": service.UpdatedAt,
			}

			// 更新可选字段
			if service.Alias != nil {
				updates["alias"] = *service.Alias
			}
			if service.ServerInstanceId != nil {
				updates["server_instance_id"] = *service.ServerInstanceId
			}
			if service.ClientInstanceId != nil {
				updates["client_instance_id"] = *service.ClientInstanceId
			}
			if service.ServerEndpointId != nil {
				updates["server_endpoint_id"] = *service.ServerEndpointId
			}
			if service.ClientEndpointId != nil {
				updates["client_endpoint_id"] = *service.ClientEndpointId
			}
			if service.TunnelPort != nil {
				updates["tunnel_port"] = *service.TunnelPort
			}
			if service.TunnelEndpointName != nil {
				updates["tunnel_endpoint_name"] = *service.TunnelEndpointName
			}
			if service.EntrancePort != nil {
				updates["entrance_port"] = *service.EntrancePort
			}
			if service.EntranceHost != nil {
				updates["entrance_host"] = *service.EntranceHost
			}
			if service.ExitPort != nil {
				updates["exit_port"] = *service.ExitPort
			}
			if service.ExitHost != nil {
				updates["exit_host"] = *service.ExitHost
			}

			if err := tx.Model(&models.Services{}).Where("sid = ?", sid).Updates(updates).Error; err != nil {
				return fmt.Errorf("更新服务 %s 失败: %w", sid, err)
			}
		}

		return nil
	})

	if err != nil {
		log.Errorf("[ServiceCache] 持久化失败: %v", err)
		return err
	}

	// 清空脏数据标记
	s.dirtyMu.Lock()
	s.dirtySet = make(map[string]bool)
	s.dirtyMu.Unlock()

	s.lastPersistTime = time.Now()

	duration := time.Since(startTime)
	log.Infof("[ServiceCache] 持久化完成，耗时: %v, 更新了 %d 个服务",
		duration, len(dirtySIDs))

	return nil
}

// ForcePersist 强制持久化所有变更（应用关闭时调用）
func (s *ServiceShared) ForcePersist(db *gorm.DB) error {
	// 临时设置持久化间隔为0，强制触发持久化
	oldInterval := s.persistInterval
	s.persistInterval = 0

	err := s.PersistIfNeeded(db)

	// 恢复原持久化间隔
	s.persistInterval = oldInterval

	return err
}

// Shutdown 优雅关闭，持久化所有变更
func (s *ServiceShared) Shutdown(db *gorm.DB) error {
	log.Infof("[ServiceCache] 开始关闭，持久化所有变更...")

	if err := s.ForcePersist(db); err != nil {
		return fmt.Errorf("关闭时持久化失败: %w", err)
	}

	log.Infof("[ServiceCache] 关闭完成")
	return nil
}

// ========== 工具方法 ==========

// copyService 深拷贝Service对象（避免外部修改影响缓存）
func (s *ServiceShared) copyService(src *models.Services) *models.Services {
	if src == nil {
		return nil
	}

	// 浅拷贝主结构
	dst := *src

	// 深拷贝指针字段
	if src.Alias != nil {
		alias := *src.Alias
		dst.Alias = &alias
	}
	if src.ServerInstanceId != nil {
		serverInstanceId := *src.ServerInstanceId
		dst.ServerInstanceId = &serverInstanceId
	}
	if src.ClientInstanceId != nil {
		clientInstanceId := *src.ClientInstanceId
		dst.ClientInstanceId = &clientInstanceId
	}
	if src.ServerEndpointId != nil {
		serverEndpointId := *src.ServerEndpointId
		dst.ServerEndpointId = &serverEndpointId
	}
	if src.ClientEndpointId != nil {
		clientEndpointId := *src.ClientEndpointId
		dst.ClientEndpointId = &clientEndpointId
	}
	if src.TunnelPort != nil {
		tunnelPort := *src.TunnelPort
		dst.TunnelPort = &tunnelPort
	}
	if src.TunnelEndpointName != nil {
		tunnelEndpointName := *src.TunnelEndpointName
		dst.TunnelEndpointName = &tunnelEndpointName
	}
	if src.EntrancePort != nil {
		entrancePort := *src.EntrancePort
		dst.EntrancePort = &entrancePort
	}
	if src.EntranceHost != nil {
		entranceHost := *src.EntranceHost
		dst.EntranceHost = &entranceHost
	}
	if src.ExitPort != nil {
		exitPort := *src.ExitPort
		dst.ExitPort = &exitPort
	}
	if src.ExitHost != nil {
		exitHost := *src.ExitHost
		dst.ExitHost = &exitHost
	}

	return &dst
}

// GetStats 获取缓存统计信息
func (s *ServiceShared) GetStats() map[string]interface{} {
	s.listMu.RLock()
	totalServices := len(s.list)
	s.listMu.RUnlock()

	s.dirtyMu.Lock()
	dirtyCount := len(s.dirtySet)
	s.dirtyMu.Unlock()

	return map[string]interface{}{
		"total_services":   totalServices,
		"dirty_count":      dirtyCount,
		"last_persist":     s.lastPersistTime.Format("2006-01-02 15:04:05"),
		"persist_interval": s.persistInterval.String(),
	}
}

// Reload 重新从数据库加载所有Service（手动刷新缓存）
func (s *ServiceShared) Reload(db *gorm.DB) error {
	log.Infof("[ServiceCache] 开始重新加载缓存...")

	if err := s.loadFromDB(db); err != nil {
		return err
	}

	// 重新排序
	s.sortList()

	// 清空脏数据标记
	s.dirtyMu.Lock()
	s.dirtySet = make(map[string]bool)
	s.dirtyMu.Unlock()

	log.Infof("[ServiceCache] 缓存重新加载完成，共 %d 个服务", len(s.list))
	return nil
}
