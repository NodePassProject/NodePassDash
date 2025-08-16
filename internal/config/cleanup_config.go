package config

import (
	"fmt"
	"time"
)

// CleanupConfig 数据清理配置
type CleanupConfig struct {
	// 数据保留策略
	RetentionPolicy RetentionPolicyConfig `json:"retention_policy"`

	// 定时清理配置
	ScheduleConfig ScheduleConfig `json:"schedule_config"`

	// 批量操作配置
	BatchConfig BatchConfig `json:"batch_config"`

	// 流量转存配置
	ArchiveConfig ArchiveConfig `json:"archive_config"`

	// 启用状态
	Enabled bool `json:"enabled"`
}

// RetentionPolicyConfig 数据保留策略配置
type RetentionPolicyConfig struct {
	// 实时状态数据保留时长（小时）
	RealtimeDataRetentionHours int `json:"realtime_data_retention_hours"`

	// 流量统计数据保留天数
	TrafficStatsRetentionDays int `json:"traffic_stats_retention_days"`

	// 监控记录保留天数
	MonitoringRecordsRetentionDays int `json:"monitoring_records_retention_days"`

	// 已删除端点数据保留天数（用于恢复）
	DeletedEndpointRetentionDays int `json:"deleted_endpoint_retention_days"`

	// 服务日志保留天数
	ServiceLogsRetentionDays int `json:"service_logs_retention_days"`

	// 告警历史保留天数
	AlertHistoryRetentionDays int `json:"alert_history_retention_days"`
}

// ScheduleConfig 定时任务配置
type ScheduleConfig struct {
	// 日常清理时间 (cron表达式)
	DailyCleanupCron string `json:"daily_cleanup_cron"`

	// 流量转存时间 (cron表达式)
	HourlyArchiveCron string `json:"hourly_archive_cron"`

	// 深度清理时间 (cron表达式，通常为周末)
	DeepCleanupCron string `json:"deep_cleanup_cron"`

	// 启动时清理超时时间（秒）
	StartupCleanupTimeoutSeconds int `json:"startup_cleanup_timeout_seconds"`
}

// BatchConfig 批量操作配置
type BatchConfig struct {
	// 批量写入大小
	BatchSize int `json:"batch_size"`

	// 批量删除大小
	BatchDeleteSize int `json:"batch_delete_size"`

	// 写入队列缓冲区大小
	WriteQueueBufferSize int `json:"write_queue_buffer_size"`

	// 批量操作超时时间（秒）
	BatchOperationTimeoutSeconds int `json:"batch_operation_timeout_seconds"`

	// 并发 worker 数量
	WorkerCount int `json:"worker_count"`
}

// ArchiveConfig 数据转存配置
type ArchiveConfig struct {
	// 流量数据聚合级别 (hourly, daily, weekly)
	TrafficAggregationLevel string `json:"traffic_aggregation_level"`

	// 转存触发阈值（待转存记录数量）
	ArchiveTriggerThreshold int `json:"archive_trigger_threshold"`

	// 压缩历史数据
	CompressArchivedData bool `json:"compress_archived_data"`

	// 归档到单独的表
	ArchiveToSeparateTable bool `json:"archive_to_separate_table"`

	// 快照计算间隔（秒）
	SnapshotCalculationIntervalSeconds int `json:"snapshot_calculation_interval_seconds"`
}

// DefaultCleanupConfig 返回默认的清理配置
func DefaultCleanupConfig() *CleanupConfig {
	return &CleanupConfig{
		Enabled: true,
		RetentionPolicy: RetentionPolicyConfig{
			RealtimeDataRetentionHours:     24,  // 实时数据保留1天
			TrafficStatsRetentionDays:      90,  // 流量统计保留3个月
			MonitoringRecordsRetentionDays: 30,  // 监控记录保留30天
			DeletedEndpointRetentionDays:   7,   // 已删除端点保留7天
			ServiceLogsRetentionDays:       15,  // 服务日志保留15天
			AlertHistoryRetentionDays:      180, // 告警历史保留6个月
		},
		ScheduleConfig: ScheduleConfig{
			DailyCleanupCron:             "0 30 3 * * *", // 每天凌晨3:30
			HourlyArchiveCron:            "0 0 * * * *",  // 每小时整点
			DeepCleanupCron:              "0 0 2 * * 0",  // 每周日凌晨2:00
			StartupCleanupTimeoutSeconds: 300,            // 启动清理5分钟超时
		},
		BatchConfig: BatchConfig{
			BatchSize:                    200,  // 每批200条记录
			BatchDeleteSize:              500,  // 每批删除500条记录
			WriteQueueBufferSize:         1000, // 写入队列1000条缓冲
			BatchOperationTimeoutSeconds: 60,   // 批量操作1分钟超时
			WorkerCount:                  3,    // 3个并发worker
		},
		ArchiveConfig: ArchiveConfig{
			TrafficAggregationLevel:            "hourly", // 按小时聚合
			ArchiveTriggerThreshold:            1000,     // 1000条记录触发转存
			CompressArchivedData:               true,     // 压缩历史数据
			ArchiveToSeparateTable:             true,     // 归档到单独表
			SnapshotCalculationIntervalSeconds: 60,       // 每分钟计算快照
		},
	}
}

// Validate 验证配置的有效性
func (c *CleanupConfig) Validate() error {
	// 验证保留策略
	if c.RetentionPolicy.RealtimeDataRetentionHours < 1 {
		return fmt.Errorf("实时数据保留时间不能少于1小时")
	}

	if c.RetentionPolicy.TrafficStatsRetentionDays < 1 {
		return fmt.Errorf("流量统计保留天数不能少于1天")
	}

	if c.RetentionPolicy.MonitoringRecordsRetentionDays < 1 {
		return fmt.Errorf("监控记录保留天数不能少于1天")
	}

	// 验证批量配置
	if c.BatchConfig.BatchSize < 1 || c.BatchConfig.BatchSize > 10000 {
		return fmt.Errorf("批量大小必须在1-10000之间")
	}

	if c.BatchConfig.WorkerCount < 1 || c.BatchConfig.WorkerCount > 20 {
		return fmt.Errorf("Worker数量必须在1-20之间")
	}

	// 验证转存配置
	validAggregationLevels := map[string]bool{
		"hourly": true,
		"daily":  true,
		"weekly": true,
	}

	if !validAggregationLevels[c.ArchiveConfig.TrafficAggregationLevel] {
		return fmt.Errorf("无效的聚合级别: %s", c.ArchiveConfig.TrafficAggregationLevel)
	}

	return nil
}

// GetRealtimeDataCutoff 获取实时数据截止时间
func (c *CleanupConfig) GetRealtimeDataCutoff() time.Time {
	return time.Now().Add(-time.Duration(c.RetentionPolicy.RealtimeDataRetentionHours) * time.Hour)
}

// GetTrafficStatsCutoff 获取流量统计截止时间
func (c *CleanupConfig) GetTrafficStatsCutoff() time.Time {
	return time.Now().AddDate(0, 0, -c.RetentionPolicy.TrafficStatsRetentionDays)
}

// GetMonitoringRecordsCutoff 获取监控记录截止时间
func (c *CleanupConfig) GetMonitoringRecordsCutoff() time.Time {
	return time.Now().AddDate(0, 0, -c.RetentionPolicy.MonitoringRecordsRetentionDays)
}

// GetDeletedEndpointCutoff 获取已删除端点截止时间
func (c *CleanupConfig) GetDeletedEndpointCutoff() time.Time {
	return time.Now().AddDate(0, 0, -c.RetentionPolicy.DeletedEndpointRetentionDays)
}

// GetServiceLogsCutoff 获取服务日志截止时间
func (c *CleanupConfig) GetServiceLogsCutoff() time.Time {
	return time.Now().AddDate(0, 0, -c.RetentionPolicy.ServiceLogsRetentionDays)
}

// GetAlertHistoryCutoff 获取告警历史截止时间
func (c *CleanupConfig) GetAlertHistoryCutoff() time.Time {
	return time.Now().AddDate(0, 0, -c.RetentionPolicy.AlertHistoryRetentionDays)
}

// ShouldArchiveTrafficData 检查是否应该转存流量数据
func (c *ArchiveConfig) ShouldArchiveTrafficData(recordCount int) bool {
	return recordCount >= c.ArchiveTriggerThreshold
}

// GetSnapshotCalculationInterval 获取快照计算间隔
func (c *ArchiveConfig) GetSnapshotCalculationInterval() time.Duration {
	return time.Duration(c.SnapshotCalculationIntervalSeconds) * time.Second
}
