package dashboard

import (
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// CleanupConfig 数据清理配置
type CleanupConfig struct {
	// 原始SSE数据保留天数（默认30天）
	SSEDataRetentionDays int

	// 汇总数据保留天数（默认365天）
	SummaryDataRetentionDays int

	// 操作日志保留天数（默认90天）
	OperationLogRetentionDays int

	// 每批次清理的记录数（防止一次删除过多数据影响性能）
	BatchSize int

	// 是否启用自动清理
	AutoCleanupEnabled bool
}

// DefaultCleanupConfig 默认清理配置
func DefaultCleanupConfig() *CleanupConfig {
	return &CleanupConfig{
		SSEDataRetentionDays:      30,
		SummaryDataRetentionDays:  365,
		OperationLogRetentionDays: 90,
		BatchSize:                 10000,
		AutoCleanupEnabled:        true,
	}
}

// CleanupService 数据清理服务
type CleanupService struct {
	db     *gorm.DB
	config *CleanupConfig
}

// NewCleanupService 创建数据清理服务
func NewCleanupService(db *gorm.DB, config *CleanupConfig) *CleanupService {
	if config == nil {
		config = DefaultCleanupConfig()
	}

	return &CleanupService{
		db:     db,
		config: config,
	}
}

// CleanupResult 清理结果
type CleanupResult struct {
	TableName    string        `json:"tableName"`
	DeletedCount int64         `json:"deletedCount"`
	Duration     time.Duration `json:"duration"`
	Error        error         `json:"error,omitempty"`
}

// ExecuteFullCleanup 执行完整的数据清理
func (s *CleanupService) ExecuteFullCleanup() ([]CleanupResult, error) {
	log.Println("[数据清理] 开始执行完整数据清理...")

	var results []CleanupResult

	// 1. 清理过期的SSE数据
	sseResult := s.cleanupSSEData()
	if sseResult.Error != nil {
		log.Printf("[数据清理] SSE数据清理失败: %v", sseResult.Error)
	} else {
		log.Printf("[数据清理] SSE数据清理完成: 删除 %d 条记录，耗时 %v", sseResult.DeletedCount, sseResult.Duration)
	}
	results = append(results, sseResult)

	// 2. 清理过期的汇总数据
	summaryResult := s.cleanupSummaryData()
	if summaryResult.Error != nil {
		log.Printf("[数据清理] 汇总数据清理失败: %v", summaryResult.Error)
	} else {
		log.Printf("[数据清理] 汇总数据清理完成: 删除 %d 条记录，耗时 %v", summaryResult.DeletedCount, summaryResult.Duration)
	}
	results = append(results, summaryResult)

	// 3. 清理过期的操作日志
	logResult := s.cleanupOperationLogs()
	if logResult.Error != nil {
		log.Printf("[数据清理] 操作日志清理失败: %v", logResult.Error)
	} else {
		log.Printf("[数据清理] 操作日志清理完成: 删除 %d 条记录，耗时 %v", logResult.DeletedCount, logResult.Duration)
	}
	results = append(results, logResult)

	// 4. 优化数据库表
	optimizeResult := s.optimizeTables()
	if optimizeResult.Error != nil {
		log.Printf("[数据清理] 表优化失败: %v", optimizeResult.Error)
	} else {
		log.Printf("[数据清理] 表优化完成，耗时 %v", optimizeResult.Duration)
	}
	results = append(results, optimizeResult)

	log.Println("[数据清理] 完整数据清理执行完毕")
	return results, nil
}

// cleanupSSEData 清理过期的SSE数据
func (s *CleanupService) cleanupSSEData() CleanupResult {
	start := time.Now()
	result := CleanupResult{
		TableName: "endpoint_sse",
		Duration:  0,
	}

	// 计算保留的截止时间
	cutoffTime := time.Now().AddDate(0, 0, -s.config.SSEDataRetentionDays)

	// 分批删除，避免长时间锁表
	totalDeleted := int64(0)
	batchSize := s.config.BatchSize

	for {
		var deletedCount int64
		// SQLite 不支持 DELETE ... LIMIT，使用子查询方式
		err := s.db.Exec(`
			DELETE FROM endpoint_sse
			WHERE id IN (
				SELECT id FROM endpoint_sse
				WHERE event_time < ?
				LIMIT ?
			)
		`, cutoffTime, batchSize).Error

		if err != nil {
			result.Error = fmt.Errorf("删除SSE数据失败: %v", err)
			break
		}

		// 获取受影响的行数
		deletedCount = s.db.RowsAffected
		totalDeleted += deletedCount

		// 如果删除的行数小于批次大小，说明已经清理完毕
		if deletedCount < int64(batchSize) {
			break
		}

		// 短暂休眠，避免对数据库造成太大压力
		time.Sleep(100 * time.Millisecond)
	}

	result.DeletedCount = totalDeleted
	result.Duration = time.Since(start)

	return result
}

// cleanupSummaryData 清理过期的汇总数据
func (s *CleanupService) cleanupSummaryData() CleanupResult {
	start := time.Now()
	result := CleanupResult{
		TableName: "traffic_hourly_summary",
		Duration:  0,
	}

	// 计算保留的截止时间
	cutoffTime := time.Now().AddDate(0, 0, -s.config.SummaryDataRetentionDays)

	// 分批删除
	totalDeleted := int64(0)
	batchSize := s.config.BatchSize

	for {
		var deletedCount int64
		// SQLite 不支持 DELETE ... LIMIT，使用子查询方式
		err := s.db.Exec(`
			DELETE FROM traffic_hourly_summary
			WHERE id IN (
				SELECT id FROM traffic_hourly_summary
				WHERE hour_time < ?
				LIMIT ?
			)
		`, cutoffTime, batchSize).Error

		if err != nil {
			result.Error = fmt.Errorf("删除汇总数据失败: %v", err)
			break
		}

		deletedCount = s.db.RowsAffected
		totalDeleted += deletedCount

		if deletedCount < int64(batchSize) {
			break
		}

		time.Sleep(100 * time.Millisecond)
	}

	result.DeletedCount = totalDeleted
	result.Duration = time.Since(start)

	return result
}

// cleanupOperationLogs 清理过期的操作日志
func (s *CleanupService) cleanupOperationLogs() CleanupResult {
	start := time.Now()
	result := CleanupResult{
		TableName: "tunnel_operation_logs",
		Duration:  0,
	}

	// 计算保留的截止时间
	cutoffTime := time.Now().AddDate(0, 0, -s.config.OperationLogRetentionDays)

	// 分批删除
	totalDeleted := int64(0)
	batchSize := s.config.BatchSize

	for {
		var deletedCount int64
		// SQLite 不支持 DELETE ... LIMIT，使用子查询方式
		err := s.db.Exec(`
			DELETE FROM tunnel_operation_logs
			WHERE id IN (
				SELECT id FROM tunnel_operation_logs
				WHERE created_at < ?
				LIMIT ?
			)
		`, cutoffTime, batchSize).Error

		if err != nil {
			result.Error = fmt.Errorf("删除操作日志失败: %v", err)
			break
		}

		deletedCount = s.db.RowsAffected
		totalDeleted += deletedCount

		if deletedCount < int64(batchSize) {
			break
		}

		time.Sleep(100 * time.Millisecond)
	}

	result.DeletedCount = totalDeleted
	result.Duration = time.Since(start)

	return result
}

// optimizeTables 优化数据库表
func (s *CleanupService) optimizeTables() CleanupResult {
	start := time.Now()
	result := CleanupResult{
		TableName: "database_optimization",
		Duration:  0,
	}

	// SQLite 使用 VACUUM 命令来优化数据库
	// VACUUM 会重建整个数据库文件，回收未使用的空间
	if err := s.db.Exec("VACUUM").Error; err != nil {
		log.Printf("[数据清理] VACUUM 优化失败: %v", err)
		result.Error = fmt.Errorf("VACUUM 优化失败: %v", err)
	} else {
		log.Println("[数据清理] VACUUM 优化成功")
	}

	result.Duration = time.Since(start)
	return result
}

// GetCleanupStats 获取清理统计信息
func (s *CleanupService) GetCleanupStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	// SSE数据统计
	var sseCount int64
	var sseOldCount int64
	cutoffTime := time.Now().AddDate(0, 0, -s.config.SSEDataRetentionDays)

	s.db.Raw("SELECT COUNT(*) FROM endpoint_sse").Scan(&sseCount)
	s.db.Raw("SELECT COUNT(*) FROM endpoint_sse WHERE event_time < ?", cutoffTime).Scan(&sseOldCount)

	stats["sse_total_count"] = sseCount
	stats["sse_cleanup_count"] = sseOldCount

	// 汇总数据统计
	var summaryCount int64
	var summaryOldCount int64
	summaryCutoffTime := time.Now().AddDate(0, 0, -s.config.SummaryDataRetentionDays)

	s.db.Raw("SELECT COUNT(*) FROM traffic_hourly_summary").Scan(&summaryCount)
	s.db.Raw("SELECT COUNT(*) FROM traffic_hourly_summary WHERE hour_time < ?", summaryCutoffTime).Scan(&summaryOldCount)

	stats["summary_total_count"] = summaryCount
	stats["summary_cleanup_count"] = summaryOldCount

	// 操作日志统计
	var logCount int64
	var logOldCount int64
	logCutoffTime := time.Now().AddDate(0, 0, -s.config.OperationLogRetentionDays)

	s.db.Raw("SELECT COUNT(*) FROM tunnel_operation_logs").Scan(&logCount)
	s.db.Raw("SELECT COUNT(*) FROM tunnel_operation_logs WHERE created_at < ?", logCutoffTime).Scan(&logOldCount)

	stats["log_total_count"] = logCount
	stats["log_cleanup_count"] = logOldCount

	// 配置信息
	stats["config"] = s.config

	return stats, nil
}

// UpdateConfig 更新清理配置
func (s *CleanupService) UpdateConfig(config *CleanupConfig) {
	if config != nil {
		s.config = config
	}
}
