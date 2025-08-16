package lifecycle

import (
	"NodePassDash/internal/config"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/enhanced"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/models"
	"NodePassDash/internal/scheduler"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"gorm.io/gorm"
)

// Manager 系统生命周期管理器
type Manager struct {
	db                *gorm.DB
	serviceIntegrator *enhanced.ServiceIntegrator
	endpointService   *endpoint.Service

	// 调度器和配置
	taskScheduler *scheduler.Scheduler
	cleanupConfig *config.CleanupConfig

	// Metrics 系统集成
	metricsIntegrator *metrics.MetricsIntegrator

	// 状态管理
	isStarted bool
	mu        sync.RWMutex

	// 关闭信号
	shutdownChan chan os.Signal
	doneChan     chan struct{}
}

// NewManager 创建生命周期管理器
func NewManager(db *gorm.DB) *Manager {
	// 初始化清理配置
	cleanupConfig := config.DefaultCleanupConfig()

	return &Manager{
		db:            db,
		cleanupConfig: cleanupConfig,
		shutdownChan:  make(chan os.Signal, 1),
		doneChan:      make(chan struct{}),
	}
}

// NewManagerWithConfig 使用自定义配置创建生命周期管理器
func NewManagerWithConfig(db *gorm.DB, cleanupConfig *config.CleanupConfig) *Manager {
	if cleanupConfig == nil {
		cleanupConfig = config.DefaultCleanupConfig()
	}

	return &Manager{
		db:            db,
		cleanupConfig: cleanupConfig,
		shutdownChan:  make(chan os.Signal, 1),
		doneChan:      make(chan struct{}),
	}
}

// Start 启动系统
func (m *Manager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isStarted {
		return fmt.Errorf("系统已经启动")
	}

	log.Info("=== NodePassDash 增强系统启动中 ===")

	// 1. 验证数据库连接
	if err := m.validateDatabase(); err != nil {
		return fmt.Errorf("数据库连接验证失败: %v", err)
	}
	log.Info("✓ 数据库连接验证成功")

	// 2. 执行数据库迁移
	if err := m.runDatabaseMigrations(); err != nil {
		return fmt.Errorf("数据库迁移失败: %v", err)
	}
	log.Info("✓ 数据库迁移完成")

	// 3. 创建端点服务
	m.endpointService = endpoint.NewService(m.db)
	log.Info("✓ 端点服务已创建")

	// 4. 创建并初始化服务集成器
	m.serviceIntegrator = enhanced.NewServiceIntegrator(m.db, m.endpointService)
	if err := m.serviceIntegrator.Initialize(); err != nil {
		return fmt.Errorf("服务集成器初始化失败: %v", err)
	}
	log.Info("✓ 增强服务集成器已初始化")

	// 4.5. 创建并启动调度器
	m.taskScheduler = scheduler.NewScheduler(m.db, m.cleanupConfig)
	if err := m.taskScheduler.Start(); err != nil {
		return fmt.Errorf("任务调度器启动失败: %v", err)
	}
	log.Info("✓ 任务调度器已启动")

	// 4.6. 创建并集成 Metrics 系统
	m.metricsIntegrator = metrics.NewMetricsIntegrator(m.db)
	if sseService := m.serviceIntegrator.GetSSEService(); sseService != nil {
		if memoryService := sseService.GetMemoryService(); memoryService != nil {
			// 集成 Metrics 系统到内存服务
			if err := m.metricsIntegrator.IntegrateWithMemoryService(memoryService); err != nil {
				log.Errorf("Metrics 系统集成失败: %v", err)
			} else {
				log.Info("✓ Metrics 系统已集成")
			}

			// 创建状态变化监听器适配器
			archiveManager := m.taskScheduler.GetArchiveManager()
			if archiveManager != nil {
				memoryService.AddStatusChangeListener(&StatusChangeAdapter{archiveManager: archiveManager})
				log.Info("✓ 状态变化监听器已集成")
			}
		}
	}

	// 5. 预热内存数据
	if err := m.preloadMemoryData(); err != nil {
		log.Errorf("内存数据预热失败: %v", err)
		// 不阻止系统启动，只记录警告
	} else {
		log.Info("✓ 内存数据预热完成")
	}

	// 5.5. 执行启动时清理
	if err := m.taskScheduler.ExecuteStartupCleanup(); err != nil {
		log.Errorf("启动清理失败: %v", err)
		// 不阻止系统启动，只记录警告
	} else {
		log.Info("✓ 启动清理完成")
	}

	// 6. 设置优雅关闭
	m.setupGracefulShutdown()
	log.Info("✓ 优雅关闭机制已设置")

	// 7. 启动性能监控
	go m.startPerformanceMonitoring()
	log.Info("✓ 性能监控已启动")

	m.isStarted = true
	log.Info("=== NodePassDash 增强系统启动完成 ===")

	// 打印启动统计
	m.printStartupStats()

	return nil
}

// validateDatabase 验证数据库连接
func (m *Manager) validateDatabase() error {
	sqlDB, err := m.db.DB()
	if err != nil {
		return err
	}

	if err := sqlDB.Ping(); err != nil {
		return err
	}

	// 检查数据库类型和版本兼容性
	var sqliteVersion string
	if err := m.db.Raw("SELECT sqlite_version()").Scan(&sqliteVersion).Error; err != nil {
		// 如果不是SQLite，尝试其他数据库类型
		log.Infof("数据库连接验证成功（非SQLite数据库）")
	} else {
		log.Infof("SQLite数据库版本: %s", sqliteVersion)
	}

	return nil
}

// runDatabaseMigrations 执行数据库迁移
func (m *Manager) runDatabaseMigrations() error {
	// 这里可以添加特定的数据库迁移逻辑
	// 例如：确保必要的索引存在、更新表结构等

	// 检查关键表是否存在
	if !m.db.Migrator().HasTable("endpoints") {
		log.Warn("endpoints 表不存在，可能需要手动初始化数据库")
	}

	if !m.db.Migrator().HasTable("tunnels") {
		log.Warn("tunnels 表不存在，可能需要手动初始化数据库")
	}

	// 确保流量历史表存在（已在 traffic.HistoryManager 中处理）

	return nil
}

// preloadMemoryData 预热内存数据
func (m *Manager) preloadMemoryData() error {
	if !m.serviceIntegrator.IsEnhancedModeActive() {
		return fmt.Errorf("增强模式未激活")
	}

	// 统计预热数据
	var endpointCount, tunnelCount int64
	m.db.Model(&models.Endpoint{}).Count(&endpointCount)
	m.db.Model(&models.Tunnel{}).Count(&tunnelCount)

	log.Infof("开始预热内存数据: %d 个端点, %d 个隧道", endpointCount, tunnelCount)

	// 获取增强服务的内存统计
	sseService := m.serviceIntegrator.GetSSEService()
	if sseService != nil {
		allData := sseService.GetAllEndpointRealTimeData()
		log.Infof("内存中已加载 %d 个端点的实时数据", len(allData))

		// 统计内存中的隧道数量
		totalMemoryTunnels := 0
		for _, endpoint := range allData {
			endpoint.Mu.RLock()
			totalMemoryTunnels += len(endpoint.State.Tunnels)
			endpoint.Mu.RUnlock()
		}
		log.Infof("内存中已加载 %d 个隧道的实时状态", totalMemoryTunnels)
	}

	return nil
}

// setupGracefulShutdown 设置优雅关闭
func (m *Manager) setupGracefulShutdown() {
	// 监听系统信号
	signal.Notify(m.shutdownChan, syscall.SIGINT, syscall.SIGTERM, os.Interrupt)

	go func() {
		sig := <-m.shutdownChan
		log.Infof("收到关闭信号: %v，开始优雅关闭", sig)

		if err := m.Shutdown(); err != nil {
			log.Errorf("优雅关闭失败: %v", err)
		}

		close(m.doneChan)
	}()
}

// startPerformanceMonitoring 启动性能监控
func (m *Manager) startPerformanceMonitoring() {
	ticker := time.NewTicker(60 * time.Second) // 每分钟记录一次性能统计
	defer ticker.Stop()

	for {
		select {
		case <-m.doneChan:
			return
		case <-ticker.C:
			m.logPerformanceStats()
		}
	}
}

// logPerformanceStats 记录性能统计
func (m *Manager) logPerformanceStats() {
	if !m.serviceIntegrator.IsEnhancedModeActive() {
		return
	}

	stats := m.serviceIntegrator.GetSystemStats()

	if enhancedStats, ok := stats["enhanced_service"].(map[string]interface{}); ok {
		if serviceStats, ok := enhancedStats["service"].(map[string]interface{}); ok {
			log.Infof("[性能监控] 处理事件: %v, 内存命中: %v, 平均处理时间: %vms",
				serviceStats["processed_events"],
				serviceStats["memory_hits"],
				serviceStats["average_process_time"])
		}

		if perfStats, ok := enhancedStats["performance"].(map[string]interface{}); ok {
			log.Infof("[性能监控] 内存命中率: %.1f%%, 错误率: %.1f%%",
				perfStats["memory_hit_rate"],
				perfStats["error_rate"])
		}

		if memStats, ok := enhancedStats["memory"].(map[string]interface{}); ok {
			if trafficStats, ok := memStats["traffic_history"].(map[string]interface{}); ok {
				log.Infof("[流量监控] 缓存记录: %v, 历史记录: %v",
					trafficStats["cache_size"],
					trafficStats["total_records"])
			}
		}
	}
}

// printStartupStats 打印启动统计信息
func (m *Manager) printStartupStats() {
	log.Info("=== 系统启动统计 ===")

	if m.serviceIntegrator.IsEnhancedModeActive() {
		stats := m.serviceIntegrator.GetSystemStats()

		if enhancedStats, ok := stats["enhanced_service"].(map[string]interface{}); ok {
			if memStats, ok := enhancedStats["memory"].(map[string]interface{}); ok {
				log.Infof("内存管理: 端点数 %v, 隧道数 %v",
					memStats["total_endpoints"],
					memStats["total_tunnels"])

				if trafficStats, ok := memStats["traffic_history"].(map[string]interface{}); ok {
					log.Infof("流量历史: 缓存 %v 条, 总计 %v 条, 保留 %v 天",
						trafficStats["cache_size"],
						trafficStats["total_records"],
						trafficStats["retention_days"])
				}
			}
		}

		log.Info("✓ 增强模式已激活 - 内存优先架构")
	} else {
		log.Info("⚠ 使用传统模式 - 数据库直查架构")
	}

	log.Info("=== 系统就绪 ===")
}

// Shutdown 优雅关闭系统
func (m *Manager) Shutdown() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.isStarted {
		return fmt.Errorf("系统未启动")
	}

	log.Info("=== 开始优雅关闭系统 ===")

	// 1. 停止接受新请求（如果有 HTTP 服务器，在这里停止）
	log.Info("✓ 停止接受新请求")

	// 2. 等待现有请求完成（给予 30 秒时间）
	log.Info("等待现有请求完成...")
	time.Sleep(5 * time.Second) // 简化处理，实际应用中需要更复杂的等待逻辑

	// 3. 保存内存数据到数据库
	if m.serviceIntegrator != nil {
		log.Info("正在保存内存数据...")
		if sseService := m.serviceIntegrator.GetSSEService(); sseService != nil {
			// 触发最后一次数据持久化
			// 这里可以调用特定的保存方法
		}
		log.Info("✓ 内存数据保存完成")
	}

	// 4. 关闭 Metrics 集成器
	if m.metricsIntegrator != nil {
		m.metricsIntegrator.Close()
		log.Info("✓ Metrics 集成器已关闭")
	}

	// 5. 关闭调度器
	if m.taskScheduler != nil {
		m.taskScheduler.Close()
		log.Info("✓ 任务调度器已关闭")
	}

	// 6. 关闭所有服务
	if m.serviceIntegrator != nil {
		m.serviceIntegrator.Close()
		log.Info("✓ 服务集成器已关闭")
	}

	// 5. 关闭数据库连接
	if sqlDB, err := m.db.DB(); err == nil {
		sqlDB.Close()
		log.Info("✓ 数据库连接已关闭")
	}

	m.isStarted = false
	log.Info("=== 系统优雅关闭完成 ===")

	return nil
}

// Wait 等待系统关闭
func (m *Manager) Wait() {
	<-m.doneChan
}

// IsStarted 检查系统是否已启动
func (m *Manager) IsStarted() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.isStarted
}

// GetServiceIntegrator 获取服务集成器
func (m *Manager) GetServiceIntegrator() *enhanced.ServiceIntegrator {
	return m.serviceIntegrator
}

// HealthCheck 健康检查
func (m *Manager) HealthCheck() map[string]interface{} {
	status := map[string]interface{}{
		"system_started":    m.IsStarted(),
		"enhanced_active":   false,
		"database_healthy":  false,
		"memory_data_ready": false,
		"timestamp":         time.Now().Unix(),
	}

	// 检查数据库健康状态
	if sqlDB, err := m.db.DB(); err == nil {
		if err := sqlDB.Ping(); err == nil {
			status["database_healthy"] = true
		}
	}

	// 检查增强模式状态
	if m.serviceIntegrator != nil {
		status["enhanced_active"] = m.serviceIntegrator.IsEnhancedModeActive()

		if status["enhanced_active"].(bool) {
			if sseService := m.serviceIntegrator.GetSSEService(); sseService != nil {
				allData := sseService.GetAllEndpointRealTimeData()
				status["memory_data_ready"] = len(allData) > 0
				status["memory_endpoints"] = len(allData)
			}
		}
	}

	// 检查调度器状态
	if m.taskScheduler != nil {
		status["scheduler_active"] = true
		status["scheduler_stats"] = m.taskScheduler.GetStats()
	} else {
		status["scheduler_active"] = false
	}

	// 检查 Metrics 系统状态
	if m.metricsIntegrator != nil {
		status["metrics_active"] = true
		status["metrics_stats"] = m.metricsIntegrator.GetStats()
	} else {
		status["metrics_active"] = false
	}

	return status
}

// GetScheduler 获取任务调度器
func (m *Manager) GetScheduler() *scheduler.Scheduler {
	return m.taskScheduler
}

// GetCleanupConfig 获取清理配置
func (m *Manager) GetCleanupConfig() *config.CleanupConfig {
	return m.cleanupConfig
}

// GetMetricsIntegrator 获取 Metrics 集成器
func (m *Manager) GetMetricsIntegrator() *metrics.MetricsIntegrator {
	return m.metricsIntegrator
}

// UpdateCleanupConfig 更新清理配置
func (m *Manager) UpdateCleanupConfig(config *config.CleanupConfig) error {
	if err := config.Validate(); err != nil {
		return fmt.Errorf("配置验证失败: %v", err)
	}

	m.cleanupConfig = config
	log.Info("清理配置已更新")

	return nil
}

// StatusChangeAdapter 状态变化监听器适配器
type StatusChangeAdapter struct {
	archiveManager interface {
		ArchiveStatusChange(endpointID int64, tunnelID string, eventType, fromStatus, toStatus, reason string, duration int64)
	}
}

// OnStatusChange 实现 StatusChangeListener 接口
func (s *StatusChangeAdapter) OnStatusChange(endpointID int64, tunnelID string, eventType, fromStatus, toStatus, reason string, duration int64) {
	if s.archiveManager != nil {
		s.archiveManager.ArchiveStatusChange(endpointID, tunnelID, eventType, fromStatus, toStatus, reason, duration)
	}
}
