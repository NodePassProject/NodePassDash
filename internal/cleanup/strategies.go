package cleanup

import (
	"NodePassDash/internal/config"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// RealtimeDataCleanupStrategy 实时数据清理策略
type RealtimeDataCleanupStrategy struct{}

func NewRealtimeDataCleanupStrategy() *RealtimeDataCleanupStrategy {
	return &RealtimeDataCleanupStrategy{}
}

func (s *RealtimeDataCleanupStrategy) Name() string {
	return "RealtimeDataCleanup"
}

func (s *RealtimeDataCleanupStrategy) Priority() int {
	return 1
}

func (s *RealtimeDataCleanupStrategy) Execute(ctx context.Context, db *gorm.DB, config *config.CleanupConfig) (*CleanupResult, error) {
	startTime := time.Now()
	result := &CleanupResult{
		StrategyName:   s.Name(),
		TablesAffected: []string{"endpoint_sse_events", "tunnel_status_history"},
	}

	cutoff := config.GetRealtimeDataCutoff()
	log.Debugf("清理 %s 之前的实时数据", cutoff.Format("2006-01-02 15:04:05"))

	var totalDeleted int64

	// 清理过期的 SSE 事件记录（如果有这样的表）
	// 注意：根据实际表结构调整
	if db.Migrator().HasTable("endpoint_sse_events") {
		var deleted int64
		err := db.Unscoped().Where("created_at < ?", cutoff).Delete(&models.EndpointSSE{}).Error
		if err != nil {
			return nil, fmt.Errorf("清理SSE事件记录失败: %v", err)
		}
		if deleted > 0 {
			totalDeleted += deleted
			log.Infof("清理了 %d 条过期SSE事件记录", deleted)
		}
	}

	// 清理过期的隧道状态历史（如果启用了状态历史记录）
	// 这里假设有一个隧道状态历史表，根据实际情况调整
	if db.Migrator().HasTable("tunnel_status_history") {
		var count int64
		err := db.Table("tunnel_status_history").Where("created_at < ?", cutoff).Count(&count).Error
		if err == nil && count > 0 {
			batchSize := config.BatchConfig.BatchDeleteSize
			for count > 0 {
				err = db.Exec("DELETE FROM tunnel_status_history WHERE id IN (SELECT id FROM tunnel_status_history WHERE created_at < ? LIMIT ?)",
					cutoff, batchSize).Error
				if err != nil {
					return nil, fmt.Errorf("批量删除隧道状态历史失败: %v", err)
				}

				// 重新计算剩余数量
				db.Table("tunnel_status_history").Where("created_at < ?", cutoff).Count(&count)
				totalDeleted += int64(batchSize)
			}
		}
	}

	result.RecordsDeleted = totalDeleted
	result.Duration = time.Since(startTime)

	return result, nil
}

// OrphanDataCleanupStrategy 孤立数据清理策略
type OrphanDataCleanupStrategy struct{}

func NewOrphanDataCleanupStrategy() *OrphanDataCleanupStrategy {
	return &OrphanDataCleanupStrategy{}
}

func (s *OrphanDataCleanupStrategy) Name() string {
	return "OrphanDataCleanup"
}

func (s *OrphanDataCleanupStrategy) Priority() int {
	return 2
}

func (s *OrphanDataCleanupStrategy) Execute(ctx context.Context, db *gorm.DB, config *config.CleanupConfig) (*CleanupResult, error) {
	startTime := time.Now()
	result := &CleanupResult{
		StrategyName:   s.Name(),
		TablesAffected: []string{"tunnels", "traffic_history"},
	}

	var totalDeleted int64

	// 清理没有对应端点的孤立隧道
	var orphanTunnelCount int64
	err := db.Model(&models.Tunnel{}).
		Where("endpoint_id NOT IN (SELECT id FROM endpoints)").
		Count(&orphanTunnelCount).Error

	if err != nil {
		return nil, fmt.Errorf("统计孤立隧道失败: %v", err)
	}

	if orphanTunnelCount > 0 {
		log.Infof("发现 %d 条孤立隧道，开始清理", orphanTunnelCount)

		// 分批删除孤立隧道
		batchSize := config.BatchConfig.BatchDeleteSize
		for orphanTunnelCount > 0 {
			err = db.Exec(`DELETE FROM tunnels WHERE id IN (
				SELECT id FROM tunnels 
				WHERE endpoint_id NOT IN (SELECT id FROM endpoints) 
				LIMIT ?
			)`, batchSize).Error

			if err != nil {
				return nil, fmt.Errorf("删除孤立隧道失败: %v", err)
			}

			// 重新统计
			db.Model(&models.Tunnel{}).
				Where("endpoint_id NOT IN (SELECT id FROM endpoints)").
				Count(&orphanTunnelCount)

			totalDeleted += int64(batchSize)
		}
	}

	// 清理孤立的流量历史记录（如果有独立的流量历史表）
	if db.Migrator().HasTable("traffic_history") {
		var orphanTrafficCount int64
		err := db.Table("traffic_history").
			Where("tunnel_id NOT IN (SELECT instance_id FROM tunnels)").
			Count(&orphanTrafficCount).Error

		if err == nil && orphanTrafficCount > 0 {
			log.Infof("发现 %d 条孤立流量记录，开始清理", orphanTrafficCount)

			batchSize := config.BatchConfig.BatchDeleteSize
			for orphanTrafficCount > 0 {
				err = db.Exec(`DELETE FROM traffic_history WHERE id IN (
					SELECT id FROM traffic_history 
					WHERE tunnel_id NOT IN (SELECT instance_id FROM tunnels) 
					LIMIT ?
				)`, batchSize).Error

				if err != nil {
					return nil, fmt.Errorf("删除孤立流量记录失败: %v", err)
				}

				db.Table("traffic_history").
					Where("tunnel_id NOT IN (SELECT instance_id FROM tunnels)").
					Count(&orphanTrafficCount)

				totalDeleted += int64(batchSize)
			}
		}
	}

	result.RecordsDeleted = totalDeleted
	result.Duration = time.Since(startTime)

	return result, nil
}

// TrafficStatsCleanupStrategy 流量统计清理策略
type TrafficStatsCleanupStrategy struct{}

func NewTrafficStatsCleanupStrategy() *TrafficStatsCleanupStrategy {
	return &TrafficStatsCleanupStrategy{}
}

func (s *TrafficStatsCleanupStrategy) Name() string {
	return "TrafficStatsCleanup"
}

func (s *TrafficStatsCleanupStrategy) Priority() int {
	return 3
}

func (s *TrafficStatsCleanupStrategy) Execute(ctx context.Context, db *gorm.DB, config *config.CleanupConfig) (*CleanupResult, error) {
	startTime := time.Now()
	result := &CleanupResult{
		StrategyName:   s.Name(),
		TablesAffected: []string{"traffic_history"},
	}

	cutoff := config.GetTrafficStatsCutoff()
	log.Debugf("清理 %s 之前的流量统计数据", cutoff.Format("2006-01-02 15:04:05"))

	var totalDeleted int64

	// 清理过期的流量历史记录
	if db.Migrator().HasTable("traffic_history") {
		var count int64
		err := db.Table("traffic_history").Where("recorded_at < ?", cutoff).Count(&count).Error
		if err != nil {
			return nil, fmt.Errorf("统计过期流量记录失败: %v", err)
		}

		if count > 0 {
			log.Infof("发现 %d 条过期流量记录，开始清理", count)

			// 分批删除
			batchSize := config.BatchConfig.BatchDeleteSize
			for count > 0 {
				err = db.Exec("DELETE FROM traffic_history WHERE id IN (SELECT id FROM traffic_history WHERE recorded_at < ? LIMIT ?)",
					cutoff, batchSize).Error
				if err != nil {
					return nil, fmt.Errorf("批量删除流量历史失败: %v", err)
				}

				// 重新计算剩余数量
				db.Table("traffic_history").Where("recorded_at < ?", cutoff).Count(&count)
				totalDeleted += int64(batchSize)

				// 检查上下文是否取消
				select {
				case <-ctx.Done():
					log.Warn("流量统计清理被中断")
					return result, ctx.Err()
				default:
				}
			}
		}
	}

	result.RecordsDeleted = totalDeleted
	result.Duration = time.Since(startTime)

	return result, nil
}

// MonitoringRecordsCleanupStrategy 监控记录清理策略
type MonitoringRecordsCleanupStrategy struct{}

func NewMonitoringRecordsCleanupStrategy() *MonitoringRecordsCleanupStrategy {
	return &MonitoringRecordsCleanupStrategy{}
}

func (s *MonitoringRecordsCleanupStrategy) Name() string {
	return "MonitoringRecordsCleanup"
}

func (s *MonitoringRecordsCleanupStrategy) Priority() int {
	return 4
}

func (s *MonitoringRecordsCleanupStrategy) Execute(ctx context.Context, db *gorm.DB, config *config.CleanupConfig) (*CleanupResult, error) {
	startTime := time.Now()
	result := &CleanupResult{
		StrategyName:   s.Name(),
		TablesAffected: []string{"monitoring_records", "ping_records"},
	}

	cutoff := config.GetMonitoringRecordsCutoff()
	log.Debugf("清理 %s 之前的监控记录", cutoff.Format("2006-01-02 15:04:05"))

	var totalDeleted int64

	// 清理过期的 ping 记录（如果有这样的表）
	if db.Migrator().HasTable("ping_records") {
		var count int64
		err := db.Table("ping_records").Where("created_at < ?", cutoff).Count(&count).Error
		if err == nil && count > 0 {
			batchSize := config.BatchConfig.BatchDeleteSize
			for count > 0 {
				err = db.Exec("DELETE FROM ping_records WHERE id IN (SELECT id FROM ping_records WHERE created_at < ? LIMIT ?)",
					cutoff, batchSize).Error
				if err != nil {
					return nil, fmt.Errorf("删除ping记录失败: %v", err)
				}

				db.Table("ping_records").Where("created_at < ?", cutoff).Count(&count)
				totalDeleted += int64(batchSize)
			}
		}
	}

	// 清理过期的监控记录（如果有这样的表）
	if db.Migrator().HasTable("monitoring_records") {
		var count int64
		err := db.Table("monitoring_records").Where("created_at < ?", cutoff).Count(&count).Error
		if err == nil && count > 0 {
			batchSize := config.BatchConfig.BatchDeleteSize
			for count > 0 {
				err = db.Exec("DELETE FROM monitoring_records WHERE id IN (SELECT id FROM monitoring_records WHERE created_at < ? LIMIT ?)",
					cutoff, batchSize).Error
				if err != nil {
					return nil, fmt.Errorf("删除监控记录失败: %v", err)
				}

				db.Table("monitoring_records").Where("created_at < ?", cutoff).Count(&count)
				totalDeleted += int64(batchSize)
			}
		}
	}

	result.RecordsDeleted = totalDeleted
	result.Duration = time.Since(startTime)

	return result, nil
}

// ServiceLogsCleanupStrategy 服务日志清理策略
type ServiceLogsCleanupStrategy struct{}

func NewServiceLogsCleanupStrategy() *ServiceLogsCleanupStrategy {
	return &ServiceLogsCleanupStrategy{}
}

func (s *ServiceLogsCleanupStrategy) Name() string {
	return "ServiceLogsCleanup"
}

func (s *ServiceLogsCleanupStrategy) Priority() int {
	return 5
}

func (s *ServiceLogsCleanupStrategy) Execute(ctx context.Context, db *gorm.DB, config *config.CleanupConfig) (*CleanupResult, error) {
	startTime := time.Now()
	result := &CleanupResult{
		StrategyName:   s.Name(),
		TablesAffected: []string{"service_logs", "error_logs"},
	}

	cutoff := config.GetServiceLogsCutoff()
	var totalDeleted int64

	// 清理过期的服务日志
	if db.Migrator().HasTable("service_logs") {
		var count int64
		err := db.Table("service_logs").Where("created_at < ?", cutoff).Count(&count).Error
		if err == nil && count > 0 {
			batchSize := config.BatchConfig.BatchDeleteSize
			for count > 0 {
				err = db.Exec("DELETE FROM service_logs WHERE id IN (SELECT id FROM service_logs WHERE created_at < ? LIMIT ?)",
					cutoff, batchSize).Error
				if err != nil {
					return nil, fmt.Errorf("删除服务日志失败: %v", err)
				}

				db.Table("service_logs").Where("created_at < ?", cutoff).Count(&count)
				totalDeleted += int64(batchSize)
			}
		}
	}

	result.RecordsDeleted = totalDeleted
	result.Duration = time.Since(startTime)

	return result, nil
}

// DeletedEndpointsCleanupStrategy 已删除端点清理策略
type DeletedEndpointsCleanupStrategy struct{}

func NewDeletedEndpointsCleanupStrategy() *DeletedEndpointsCleanupStrategy {
	return &DeletedEndpointsCleanupStrategy{}
}

func (s *DeletedEndpointsCleanupStrategy) Name() string {
	return "DeletedEndpointsCleanup"
}

func (s *DeletedEndpointsCleanupStrategy) Priority() int {
	return 6
}

func (s *DeletedEndpointsCleanupStrategy) Execute(ctx context.Context, db *gorm.DB, config *config.CleanupConfig) (*CleanupResult, error) {
	startTime := time.Now()
	result := &CleanupResult{
		StrategyName:   s.Name(),
		TablesAffected: []string{"endpoints", "tunnels"},
	}

	cutoff := config.GetDeletedEndpointCutoff()
	var totalDeleted int64

	// 清理软删除的端点记录（GORM软删除）
	var deletedEndpoints []models.Endpoint
	err := db.Unscoped().Where("deleted_at IS NOT NULL AND deleted_at < ?", cutoff).Find(&deletedEndpoints).Error
	if err != nil {
		return nil, fmt.Errorf("查询已删除端点失败: %v", err)
	}

	if len(deletedEndpoints) > 0 {
		log.Infof("发现 %d 个已删除端点需要永久清理", len(deletedEndpoints))

		for _, endpoint := range deletedEndpoints {
			// 首先删除该端点的所有隧道
			err = db.Unscoped().Where("endpoint_id = ?", endpoint.ID).Delete(&models.Tunnel{}).Error
			if err != nil {
				log.Errorf("删除端点 %d 的隧道失败: %v", endpoint.ID, err)
				continue
			}

			// 然后删除端点本身
			err = db.Unscoped().Delete(&endpoint).Error
			if err != nil {
				log.Errorf("永久删除端点 %d 失败: %v", endpoint.ID, err)
				continue
			}

			totalDeleted++
			log.Debugf("永久删除端点 %d 及其相关数据", endpoint.ID)
		}
	}

	result.RecordsDeleted = totalDeleted
	result.Duration = time.Since(startTime)

	return result, nil
}
