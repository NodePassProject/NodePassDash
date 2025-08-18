package cleanup

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"context"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

// Manager 数据清理管理器
type Manager struct {
	db     *gorm.DB
	config *CleanupConfig

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// 统计信息
	stats *CleanupStats

	// 清理策略
	strategies []CleanupStrategy
}

// CleanupStats 清理统计信息
type CleanupStats struct {
	mu sync.RWMutex

	LastCleanupTime     time.Time `json:"last_cleanup_time"`
	TotalCleanupRuns    int64     `json:"total_cleanup_runs"`
	TotalRecordsDeleted int64     `json:"total_records_deleted"`
	LastCleanupDuration int64     `json:"last_cleanup_duration_ms"`
	AverageCleanupTime  int64     `json:"average_cleanup_time_ms"`

	// 分类统计
	RealtimeDataDeleted  int64 `json:"realtime_data_deleted"`
	TrafficStatsDeleted  int64 `json:"traffic_stats_deleted"`
	MonitoringDeleted    int64 `json:"monitoring_deleted"`
	OrphanRecordsDeleted int64 `json:"orphan_records_deleted"`

	// 错误统计
	CleanupErrors    int64     `json:"cleanup_errors"`
	LastErrorMessage string    `json:"last_error_message"`
	LastErrorTime    time.Time `json:"last_error_time"`
}

// CleanupStrategy 清理策略接口
type CleanupStrategy interface {
	Name() string
	Execute(ctx context.Context, db *gorm.DB, config *CleanupConfig) (*CleanupResult, error)
	Priority() int // 执行优先级，数字越小优先级越高
}

// CleanupResult 清理结果
type CleanupResult struct {
	StrategyName   string        `json:"strategy_name"`
	RecordsDeleted int64         `json:"records_deleted"`
	Duration       time.Duration `json:"duration"`
	TablesAffected []string      `json:"tables_affected"`
	ErrorMessage   string        `json:"error_message,omitempty"`
}

// NewManager 创建清理管理器
func NewManager(db *gorm.DB, config *CleanupConfig) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	m := &Manager{
		db:     db,
		config: config,
		ctx:    ctx,
		cancel: cancel,
		stats:  &CleanupStats{},
	}

	// 初始化清理策略
	m.initStrategies()

	return m
}

// initStrategies 初始化所有清理策略
func (m *Manager) initStrategies() {
	m.strategies = []CleanupStrategy{
		NewRealtimeDataCleanupStrategy(),      // 优先级1：实时数据清理
		NewOrphanDataCleanupStrategy(),        // 优先级2：孤立数据清理
		NewTrafficStatsCleanupStrategy(),      // 优先级3：流量统计清理
		NewMonitoringRecordsCleanupStrategy(), // 优先级4：监控记录清理
		NewServiceLogsCleanupStrategy(),       // 优先级5：服务日志清理
		NewDeletedEndpointsCleanupStrategy(),  // 优先级6：已删除端点清理
	}
}

// ExecuteStartupCleanup 执行启动时清理
func (m *Manager) ExecuteStartupCleanup() error {
	if !m.config.Enabled {
		log.Info("数据清理功能已禁用，跳过启动清理")
		return nil
	}

	log.Info("=== 开始执行启动清理 ===")
	startTime := time.Now()

	// 设置超时上下文
	timeoutDuration := time.Duration(m.config.ScheduleConfig.StartupCleanupTimeoutSeconds) * time.Second
	ctx, cancel := context.WithTimeout(m.ctx, timeoutDuration)
	defer cancel()

	// 统计总清理数量
	var totalDeleted int64
	var errors []error

	// 按优先级执行清理策略
	for _, strategy := range m.strategies {
		select {
		case <-ctx.Done():
			log.Warnf("启动清理因超时而中断，已执行的策略：%s", strategy.Name())
			return ctx.Err()
		default:
		}

		log.Infof("执行启动清理策略: %s", strategy.Name())
		result, err := strategy.Execute(ctx, m.db, m.config)

		if err != nil {
			errors = append(errors, fmt.Errorf("策略 %s 执行失败: %v", strategy.Name(), err))
			log.Errorf("启动清理策略 %s 失败: %v", strategy.Name(), err)
			continue
		}

		if result != nil {
			totalDeleted += result.RecordsDeleted
			log.Infof("启动清理策略 %s 完成: 删除 %d 条记录，耗时 %v",
				strategy.Name(), result.RecordsDeleted, result.Duration)
		}
	}

	// 更新统计信息
	duration := time.Since(startTime)
	m.updateStats(func(stats *CleanupStats) {
		stats.LastCleanupTime = time.Now()
		stats.TotalCleanupRuns++
		stats.TotalRecordsDeleted += totalDeleted
		stats.LastCleanupDuration = duration.Milliseconds()

		// 计算平均清理时间
		if stats.TotalCleanupRuns > 1 {
			stats.AverageCleanupTime = (stats.AverageCleanupTime + duration.Milliseconds()) / 2
		} else {
			stats.AverageCleanupTime = duration.Milliseconds()
		}

		if len(errors) > 0 {
			stats.CleanupErrors += int64(len(errors))
			stats.LastErrorMessage = errors[0].Error()
			stats.LastErrorTime = time.Now()
		}
	})

	log.Infof("=== 启动清理完成 ===")
	log.Infof("总删除记录数: %d", totalDeleted)
	log.Infof("总耗时: %v", duration)

	if len(errors) > 0 {
		log.Warnf("启动清理出现 %d 个错误", len(errors))
		return fmt.Errorf("启动清理部分失败，错误数量: %d", len(errors))
	}

	return nil
}

// ExecuteScheduledCleanup 执行定时清理
func (m *Manager) ExecuteScheduledCleanup() error {
	if !m.config.Enabled {
		log.Debug("数据清理功能已禁用，跳过定时清理")
		return nil
	}

	log.Info("=== 开始执行定时清理 ===")
	startTime := time.Now()

	// 设置超时上下文
	timeoutDuration := time.Duration(m.config.BatchConfig.BatchOperationTimeoutSeconds) * time.Second
	ctx, cancel := context.WithTimeout(m.ctx, timeoutDuration)
	defer cancel()

	var totalDeleted int64
	var errors []error

	// 执行所有清理策略
	for _, strategy := range m.strategies {
		result, err := strategy.Execute(ctx, m.db, m.config)

		if err != nil {
			errors = append(errors, fmt.Errorf("策略 %s 执行失败: %v", strategy.Name(), err))
			log.Errorf("定时清理策略 %s 失败: %v", strategy.Name(), err)
			continue
		}

		if result != nil {
			totalDeleted += result.RecordsDeleted
			log.Infof("定时清理策略 %s 完成: 删除 %d 条记录", strategy.Name(), result.RecordsDeleted)
		}
	}

	// 更新统计信息
	duration := time.Since(startTime)
	m.updateStats(func(stats *CleanupStats) {
		stats.LastCleanupTime = time.Now()
		stats.TotalCleanupRuns++
		stats.TotalRecordsDeleted += totalDeleted
		stats.LastCleanupDuration = duration.Milliseconds()

		if len(errors) > 0 {
			stats.CleanupErrors += int64(len(errors))
			stats.LastErrorMessage = errors[0].Error()
			stats.LastErrorTime = time.Now()
		}
	})

	log.Infof("=== 定时清理完成 ===")
	log.Infof("总删除记录数: %d", totalDeleted)
	log.Infof("总耗时: %v", duration)

	return nil
}

// ExecuteDeepCleanup 执行深度清理（通常在低峰期）
func (m *Manager) ExecuteDeepCleanup() error {
	if !m.config.Enabled {
		return nil
	}

	log.Info("=== 开始执行深度清理 ===")

	// 深度清理包括：
	// 1. 数据库表优化
	// 2. 索引重建
	// 3. 统计信息更新
	// 4. 碎片整理

	startTime := time.Now()

	// 1. 执行 VACUUM 操作（SQLite）
	if err := m.db.Exec("VACUUM").Error; err != nil {
		log.Errorf("执行 VACUUM 失败: %v", err)
	} else {
		log.Info("✓ 数据库 VACUUM 完成")
	}

	// 2. 重新分析统计信息（SQLite）
	if err := m.db.Exec("ANALYZE").Error; err != nil {
		log.Errorf("执行 ANALYZE 失败: %v", err)
	} else {
		log.Info("✓ 数据库 ANALYZE 完成")
	}

	// 3. 检查数据一致性
	if err := m.validateDataIntegrity(); err != nil {
		log.Errorf("数据一致性检查失败: %v", err)
	} else {
		log.Info("✓ 数据一致性检查通过")
	}

	duration := time.Since(startTime)
	log.Infof("=== 深度清理完成，耗时: %v ===", duration)

	return nil
}

// validateDataIntegrity 验证数据一致性
func (m *Manager) validateDataIntegrity() error {
	// 检查孤立的隧道记录（没有对应端点的隧道）
	var orphanTunnels int64
	if err := m.db.Model(&models.Tunnel{}).
		Where("endpoint_id NOT IN (SELECT id FROM endpoints)").
		Count(&orphanTunnels).Error; err != nil {
		return fmt.Errorf("检查孤立隧道失败: %v", err)
	}

	if orphanTunnels > 0 {
		log.Warnf("发现 %d 条孤立隧道记录", orphanTunnels)
	}

	// 检查时间戳异常的记录
	now := time.Now()
	futureTime := now.Add(24 * time.Hour) // 未来24小时

	var futureTunnels int64
	if err := m.db.Model(&models.Tunnel{}).
		Where("created_at > ? OR updated_at > ?", futureTime, futureTime).
		Count(&futureTunnels).Error; err != nil {
		return fmt.Errorf("检查时间戳异常失败: %v", err)
	}

	if futureTunnels > 0 {
		log.Warnf("发现 %d 条时间戳异常记录", futureTunnels)
	}

	return nil
}

// GetStats 获取清理统计信息
func (m *Manager) GetStats() map[string]interface{} {
	m.stats.mu.RLock()
	defer m.stats.mu.RUnlock()

	return map[string]interface{}{
		"cleanup_enabled":        m.config.Enabled,
		"last_cleanup_time":      m.stats.LastCleanupTime.Format("2006-01-02 15:04:05"),
		"total_cleanup_runs":     m.stats.TotalCleanupRuns,
		"total_records_deleted":  m.stats.TotalRecordsDeleted,
		"last_cleanup_duration":  m.stats.LastCleanupDuration,
		"average_cleanup_time":   m.stats.AverageCleanupTime,
		"realtime_data_deleted":  m.stats.RealtimeDataDeleted,
		"traffic_stats_deleted":  m.stats.TrafficStatsDeleted,
		"monitoring_deleted":     m.stats.MonitoringDeleted,
		"orphan_records_deleted": m.stats.OrphanRecordsDeleted,
		"cleanup_errors":         m.stats.CleanupErrors,
		"last_error_message":     m.stats.LastErrorMessage,
		"last_error_time":        m.stats.LastErrorTime.Format("2006-01-02 15:04:05"),

		// 配置信息
		"config": map[string]interface{}{
			"retention_policy": m.config.RetentionPolicy,
			"batch_config":     m.config.BatchConfig,
		},
	}
}

// updateStats 线程安全地更新统计信息
func (m *Manager) updateStats(updater func(*CleanupStats)) {
	m.stats.mu.Lock()
	defer m.stats.mu.Unlock()
	updater(m.stats)
}

// Close 关闭清理管理器
func (m *Manager) Close() {
	log.Info("正在关闭数据清理管理器")

	// 停止所有后台任务
	m.cancel()
	m.wg.Wait()

	log.Info("数据清理管理器已关闭")
}
