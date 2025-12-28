package dashboard

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"NodePassDash/internal/models"

	"gorm.io/gorm"
)

// TrafficService 流量服务
type TrafficService struct {
	db *gorm.DB
}

func trafficHourlySummaryHasUniqueIndex(tx *gorm.DB) bool {
	var count int64
	if err := tx.Raw(`
		SELECT COUNT(*)
		FROM sqlite_master
		WHERE type = 'index'
			AND name = 'uniq_traffic_hourly_summary_hour_endpoint_instance'
	`).Scan(&count).Error; err != nil {
		return false
	}
	return count > 0
}

func isSQLiteLocked(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "database is locked") || strings.Contains(msg, "busy")
}

// NewTrafficService 创建流量服务实例
func NewTrafficService(db *gorm.DB) *TrafficService {
	return &TrafficService{db: db}
}

// AggregateTrafficData 聚合当前小时的流量数据
func (s *TrafficService) AggregateTrafficData() error {
	// 获取上一个整点时间
	now := time.Now()
	lastHour := time.Date(now.Year(), now.Month(), now.Day(), now.Hour()-1, 0, 0, 0, now.Location())
	return s.AggregateTrafficDataForHour(lastHour)
}

// AggregateTrafficDataForHour 为指定小时聚合流量数据
// 从service_history表获取上一小时59分的累计值，并计算与上一小时的差值
func (s *TrafficService) AggregateTrafficDataForHour(hourStart time.Time) error {
	// 小时窗口结束时间
	hourEnd := hourStart.Add(1 * time.Hour)

	// 使用事务来确保数据一致性
	return s.db.Transaction(func(tx *gorm.DB) error {
		hasUnique := trafficHourlySummaryHasUniqueIndex(tx)
		if hasUnique {
			// 1. 优先使用 UPSERT（ON CONFLICT DO UPDATE），避免 OR REPLACE 触发 delete+insert
			// 仅扫描该小时窗口内的记录，避免对 service_history 做“<=targetTime”的全表/大范围扫描。
			if err := tx.Exec(`
				INSERT INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT 
					?,
					sh.instance_id,
					sh.endpoint_id,
					sh.delta_tcp_in as tcp_rx_total,
					sh.delta_tcp_out as tcp_tx_total,
					sh.delta_udp_in as udp_rx_total,
					sh.delta_udp_out as udp_tx_total,
					sh.delta_tcp_in as tcp_rx_increment,
					sh.delta_tcp_out as tcp_tx_increment,
					sh.delta_udp_in as udp_rx_increment,
					sh.delta_udp_out as udp_tx_increment,
					1 as record_count,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
			FROM service_history sh
			INNER JOIN (
				SELECT 
					endpoint_id,
					instance_id,
					MAX(record_time) as max_record_time
				FROM service_history
				WHERE record_time >= ? AND record_time < ?
				GROUP BY endpoint_id, instance_id
			) latest ON sh.endpoint_id = latest.endpoint_id 
				AND sh.instance_id = latest.instance_id 
				AND sh.record_time = latest.max_record_time
			WHERE sh.record_time >= ? AND sh.record_time < ?
			ON CONFLICT(hour_time, endpoint_id, instance_id) DO UPDATE SET
				tcp_rx_total = excluded.tcp_rx_total,
				tcp_tx_total = excluded.tcp_tx_total,
				udp_rx_total = excluded.udp_rx_total,
					udp_tx_total = excluded.udp_tx_total,
					tcp_rx_increment = excluded.tcp_rx_increment,
					tcp_tx_increment = excluded.tcp_tx_increment,
					udp_rx_increment = excluded.udp_rx_increment,
				udp_tx_increment = excluded.udp_tx_increment,
				record_count = excluded.record_count,
				updated_at = CURRENT_TIMESTAMP`,
				hourStart, hourStart, hourEnd, hourStart, hourEnd).Error; err != nil {
				return fmt.Errorf("插入汇总数据失败: %v", err)
			}
		} else {
			// 没有唯一索引时，OR REPLACE 不会触发替换（会持续堆积重复行）。
			// 先删除该小时已有记录，保证每次聚合后该小时只保留一份数据集。
			if err := tx.Exec(`DELETE FROM traffic_hourly_summary WHERE hour_time = ?`, hourStart).Error; err != nil {
				return fmt.Errorf("清理当小时旧汇总数据失败: %v", err)
			}

			// 兼容旧库：没有唯一索引时，使用 OR REPLACE（不会失败，但需要尽快完成索引修复）
			if err := tx.Exec(`
				INSERT OR REPLACE INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT 
					?,
					sh.instance_id,
					sh.endpoint_id,
					sh.delta_tcp_in as tcp_rx_total,
					sh.delta_tcp_out as tcp_tx_total,
					sh.delta_udp_in as udp_rx_total,
					sh.delta_udp_out as udp_tx_total,
					sh.delta_tcp_in as tcp_rx_increment,
					sh.delta_tcp_out as tcp_tx_increment,
					sh.delta_udp_in as udp_rx_increment,
					sh.delta_udp_out as udp_tx_increment,
					1 as record_count,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM service_history sh
				INNER JOIN (
				SELECT 
					endpoint_id,
					instance_id,
					MAX(record_time) as max_record_time
				FROM service_history
				WHERE record_time >= ? AND record_time < ?
				GROUP BY endpoint_id, instance_id
			) latest ON sh.endpoint_id = latest.endpoint_id 
				AND sh.instance_id = latest.instance_id 
				AND sh.record_time = latest.max_record_time
			WHERE sh.record_time >= ? AND sh.record_time < ?`,
				hourStart, hourStart, hourEnd, hourStart, hourEnd).Error; err != nil {
				return fmt.Errorf("插入汇总数据失败: %v", err)
			}
		}

		// 1.1 对于该小时窗口内没有任何 service_history 记录的实例：从上一小时 carry forward，
		// 这样可以避免“某小时缺行导致曲线断点/实例数抖动”，同时 increment 会在下一步自动算为 0。
		previousHour := hourStart.Add(-1 * time.Hour)
		if hasUnique {
			if err := tx.Exec(`
				INSERT INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT
					?,
					prev.instance_id,
					prev.endpoint_id,
					prev.tcp_rx_total,
					prev.tcp_tx_total,
					prev.udp_rx_total,
					prev.udp_tx_total,
					0,
					0,
					0,
					0,
					0,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM traffic_hourly_summary prev
				WHERE prev.hour_time = ?
					AND NOT EXISTS (
						SELECT 1 FROM traffic_hourly_summary cur
						WHERE cur.hour_time = ?
							AND cur.endpoint_id = prev.endpoint_id
							AND cur.instance_id = prev.instance_id
					)
				ON CONFLICT(hour_time, endpoint_id, instance_id) DO UPDATE SET
					tcp_rx_total = excluded.tcp_rx_total,
					tcp_tx_total = excluded.tcp_tx_total,
					udp_rx_total = excluded.udp_rx_total,
					udp_tx_total = excluded.udp_tx_total,
					tcp_rx_increment = excluded.tcp_rx_increment,
					tcp_tx_increment = excluded.tcp_tx_increment,
					udp_rx_increment = excluded.udp_rx_increment,
					udp_tx_increment = excluded.udp_tx_increment,
					record_count = excluded.record_count,
					updated_at = CURRENT_TIMESTAMP
			`, hourStart, previousHour, hourStart).Error; err != nil {
				return fmt.Errorf("carry-forward 数据失败: %v", err)
			}
		} else {
			if err := tx.Exec(`
				INSERT OR REPLACE INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT
					?,
					prev.instance_id,
					prev.endpoint_id,
					prev.tcp_rx_total,
					prev.tcp_tx_total,
					prev.udp_rx_total,
					prev.udp_tx_total,
					0,
					0,
					0,
					0,
					0,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM traffic_hourly_summary prev
				WHERE prev.hour_time = ?
					AND NOT EXISTS (
						SELECT 1 FROM traffic_hourly_summary cur
						WHERE cur.hour_time = ?
							AND cur.endpoint_id = prev.endpoint_id
							AND cur.instance_id = prev.instance_id
					)
			`, hourStart, previousHour, hourStart).Error; err != nil {
				return fmt.Errorf("carry-forward 数据失败: %v", err)
			}
		}

		// 2. 计算与上一小时的差值（increment字段）
		if err := s.calculateIncrements(tx, hourStart); err != nil {
			return fmt.Errorf("计算增量失败: %v", err)
		}

		// 3. 执行dashboard汇总
		if err := s.aggregateDashboardTraffic(tx, hourStart); err != nil {
			return fmt.Errorf("dashboard汇总失败: %v", err)
		}

		return nil
	})
}

// calculateIncrements 计算与上一小时的差值
func (s *TrafficService) calculateIncrements(tx *gorm.DB, hourStart time.Time) error {
	// 获取上一小时的时间
	previousHour := hourStart.Add(-1 * time.Hour)

	// 更新increment字段，计算与上一小时的差值
	if err := tx.Exec(`
		UPDATE traffic_hourly_summary 
		SET 
			tcp_rx_increment = tcp_rx_total - COALESCE((
				SELECT tcp_rx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? 
					AND instance_id = traffic_hourly_summary.instance_id
					AND endpoint_id = traffic_hourly_summary.endpoint_id
			), 0),
			tcp_tx_increment = tcp_tx_total - COALESCE((
				SELECT tcp_tx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? 
					AND instance_id = traffic_hourly_summary.instance_id
					AND endpoint_id = traffic_hourly_summary.endpoint_id
			), 0),
			udp_rx_increment = udp_rx_total - COALESCE((
				SELECT udp_rx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? 
					AND instance_id = traffic_hourly_summary.instance_id
					AND endpoint_id = traffic_hourly_summary.endpoint_id
			), 0),
			udp_tx_increment = udp_tx_total - COALESCE((
				SELECT udp_tx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? 
					AND instance_id = traffic_hourly_summary.instance_id
					AND endpoint_id = traffic_hourly_summary.endpoint_id
			), 0)
		WHERE hour_time = ?
	`, previousHour, previousHour, previousHour, previousHour, hourStart).Error; err != nil {
		return fmt.Errorf("更新增量数据失败: %v", err)
	}

	return nil
}

// aggregateDashboardTraffic 聚合dashboard流量数据
func (s *TrafficService) aggregateDashboardTraffic(tx *gorm.DB, hourStart time.Time) error {
	// 使用UPSERT语法来处理更新
	if err := tx.Exec(`
		INSERT OR REPLACE INTO dashboard_traffic_summary (
			hour_time,
			tcp_rx_total,
			tcp_tx_total,
			udp_rx_total,
			udp_tx_total,
			instance_count,
			created_at,
			updated_at
		)
		SELECT 
			?,
			CAST(SUM(tcp_rx_total) AS INTEGER) as tcp_rx_total,
			CAST(SUM(tcp_tx_total) AS INTEGER) as tcp_tx_total,
			CAST(SUM(udp_rx_total) AS INTEGER) as udp_rx_total,
			CAST(SUM(udp_tx_total) AS INTEGER) as udp_tx_total,
			COUNT(*) as instance_count,
			CURRENT_TIMESTAMP,
			CURRENT_TIMESTAMP
		FROM traffic_hourly_summary
		WHERE hour_time = ?`,
		hourStart, hourStart).Error; err != nil {
		return fmt.Errorf("插入dashboard汇总数据失败: %v", err)
	}

	return nil
}

// InitializeRecentTrafficData 初始化最近24小时的流量汇总数据
// 支持更新处理：如果数据已存在则进行更新
func (s *TrafficService) InitializeRecentTrafficData() error {
	now := time.Now()
	start := now.Add(-24 * time.Hour).Truncate(time.Hour)

	var firstErr error
	for hour := start; hour.Before(now); hour = hour.Add(time.Hour) {
		// 分小时重试，避免单个小时 locked 导致整体初始化失败
		var err error
		for attempt := 1; attempt <= 3; attempt++ {
			err = s.initializeTrafficDataForHour(hour)
			if err == nil {
				break
			}
			if !isSQLiteLocked(err) {
				break
			}
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}

		if err != nil {
			// 继续初始化其它小时，最后返回首个错误，避免启动期“全失败”
			if firstErr == nil {
				firstErr = fmt.Errorf("初始化小时数据失败 %s: %v", hour.Format("2006-01-02 15:04"), err)
			}
		}

		// 轻微让出 CPU/锁，降低单核机器抖动
		time.Sleep(50 * time.Millisecond)
	}

	return firstErr
}

// initializeTrafficDataForHour 初始化指定小时的流量数据（支持更新处理）
func (s *TrafficService) initializeTrafficDataForHour(hourStart time.Time) error {
	// 小时窗口结束时间
	hourEnd := hourStart.Add(1 * time.Hour)

	return s.db.Transaction(func(tx *gorm.DB) error {
		hasUnique := trafficHourlySummaryHasUniqueIndex(tx)
		if hasUnique {
			if err := tx.Exec(`
				INSERT INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT 
					?,
					sh.instance_id,
					sh.endpoint_id,
					sh.delta_tcp_in as tcp_rx_total,
					sh.delta_tcp_out as tcp_tx_total,
					sh.delta_udp_in as udp_rx_total,
					sh.delta_udp_out as udp_tx_total,
					sh.delta_tcp_in as tcp_rx_increment,
					sh.delta_tcp_out as tcp_tx_increment,
					sh.delta_udp_in as udp_rx_increment,
					sh.delta_udp_out as udp_tx_increment,
					1 as record_count,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM service_history sh
				INNER JOIN (
					SELECT 
						endpoint_id,
						instance_id,
						MAX(record_time) as max_record_time
					FROM service_history
					WHERE record_time >= ? AND record_time < ?
					GROUP BY endpoint_id, instance_id
				) latest ON sh.endpoint_id = latest.endpoint_id 
					AND sh.instance_id = latest.instance_id 
					AND sh.record_time = latest.max_record_time
				WHERE sh.record_time >= ? AND sh.record_time < ?
				ON CONFLICT(hour_time, endpoint_id, instance_id) DO UPDATE SET
					tcp_rx_total = excluded.tcp_rx_total,
					tcp_tx_total = excluded.tcp_tx_total,
					udp_rx_total = excluded.udp_rx_total,
					udp_tx_total = excluded.udp_tx_total,
					tcp_rx_increment = excluded.tcp_rx_increment,
					tcp_tx_increment = excluded.tcp_tx_increment,
					udp_rx_increment = excluded.udp_rx_increment,
					udp_tx_increment = excluded.udp_tx_increment,
					record_count = excluded.record_count,
					updated_at = CURRENT_TIMESTAMP`,
				hourStart, hourStart, hourEnd, hourStart, hourEnd).Error; err != nil {
				return fmt.Errorf("初始化汇总数据失败: %v", err)
			}
		} else {
			// 没有唯一索引时，先清理该小时旧数据，避免重复堆积
			if err := tx.Exec(`DELETE FROM traffic_hourly_summary WHERE hour_time = ?`, hourStart).Error; err != nil {
				return fmt.Errorf("清理当小时旧汇总数据失败: %v", err)
			}

			if err := tx.Exec(`
				INSERT OR REPLACE INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT 
					?,
					sh.instance_id,
					sh.endpoint_id,
					sh.delta_tcp_in as tcp_rx_total,
					sh.delta_tcp_out as tcp_tx_total,
					sh.delta_udp_in as udp_rx_total,
					sh.delta_udp_out as udp_tx_total,
					sh.delta_tcp_in as tcp_rx_increment,
					sh.delta_tcp_out as tcp_tx_increment,
					sh.delta_udp_in as udp_rx_increment,
					sh.delta_udp_out as udp_tx_increment,
					1 as record_count,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM service_history sh
				INNER JOIN (
					SELECT 
						endpoint_id,
						instance_id,
						MAX(record_time) as max_record_time
					FROM service_history
					WHERE record_time >= ? AND record_time < ?
					GROUP BY endpoint_id, instance_id
				) latest ON sh.endpoint_id = latest.endpoint_id 
					AND sh.instance_id = latest.instance_id 
					AND sh.record_time = latest.max_record_time
				WHERE sh.record_time >= ? AND sh.record_time < ?`,
				hourStart, hourStart, hourEnd, hourStart, hourEnd).Error; err != nil {
				return fmt.Errorf("初始化汇总数据失败: %v", err)
			}
		}

		// 对于缺失小时数据的实例：carry forward
		previousHour := hourStart.Add(-1 * time.Hour)
		if hasUnique {
			if err := tx.Exec(`
				INSERT INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT
					?,
					prev.instance_id,
					prev.endpoint_id,
					prev.tcp_rx_total,
					prev.tcp_tx_total,
					prev.udp_rx_total,
					prev.udp_tx_total,
					0,
					0,
					0,
					0,
					0,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM traffic_hourly_summary prev
				WHERE prev.hour_time = ?
					AND NOT EXISTS (
						SELECT 1 FROM traffic_hourly_summary cur
						WHERE cur.hour_time = ?
							AND cur.endpoint_id = prev.endpoint_id
							AND cur.instance_id = prev.instance_id
					)
				ON CONFLICT(hour_time, endpoint_id, instance_id) DO UPDATE SET
					tcp_rx_total = excluded.tcp_rx_total,
					tcp_tx_total = excluded.tcp_tx_total,
					udp_rx_total = excluded.udp_rx_total,
					udp_tx_total = excluded.udp_tx_total,
					tcp_rx_increment = excluded.tcp_rx_increment,
					tcp_tx_increment = excluded.tcp_tx_increment,
					udp_rx_increment = excluded.udp_rx_increment,
					udp_tx_increment = excluded.udp_tx_increment,
					record_count = excluded.record_count,
					updated_at = CURRENT_TIMESTAMP
			`, hourStart, previousHour, hourStart).Error; err != nil {
				return fmt.Errorf("carry-forward 数据失败: %v", err)
			}
		} else {
			if err := tx.Exec(`
				INSERT OR REPLACE INTO traffic_hourly_summary (
					hour_time,
					instance_id,
					endpoint_id,
					tcp_rx_total,
					tcp_tx_total,
					udp_rx_total,
					udp_tx_total,
					tcp_rx_increment,
					tcp_tx_increment,
					udp_rx_increment,
					udp_tx_increment,
					record_count,
					created_at,
					updated_at
				)
				SELECT
					?,
					prev.instance_id,
					prev.endpoint_id,
					prev.tcp_rx_total,
					prev.tcp_tx_total,
					prev.udp_rx_total,
					prev.udp_tx_total,
					0,
					0,
					0,
					0,
					0,
					CURRENT_TIMESTAMP,
					CURRENT_TIMESTAMP
				FROM traffic_hourly_summary prev
				WHERE prev.hour_time = ?
					AND NOT EXISTS (
						SELECT 1 FROM traffic_hourly_summary cur
						WHERE cur.hour_time = ?
							AND cur.endpoint_id = prev.endpoint_id
							AND cur.instance_id = prev.instance_id
					)
			`, hourStart, previousHour, hourStart).Error; err != nil {
				return fmt.Errorf("carry-forward 数据失败: %v", err)
			}
		}

		// 计算与上一小时的差值（increment字段）
		if err := s.calculateIncrements(tx, hourStart); err != nil {
			return fmt.Errorf("计算增量失败: %v", err)
		}

		// 执行dashboard汇总（也使用UPSERT）
		if err := s.initializeDashboardTraffic(tx, hourStart); err != nil {
			return fmt.Errorf("初始化dashboard汇总失败: %v", err)
		}

		return nil
	})
}

// initializeDashboardTraffic 初始化dashboard流量数据（支持更新处理）
func (s *TrafficService) initializeDashboardTraffic(tx *gorm.DB, hourStart time.Time) error {
	// 使用UPSERT语法来处理更新
	if err := tx.Exec(`
		INSERT OR REPLACE INTO dashboard_traffic_summary (
			hour_time,
			tcp_rx_total,
			tcp_tx_total,
			udp_rx_total,
			udp_tx_total,
			instance_count,
			created_at,
			updated_at
		)
		SELECT 
			?,
			CAST(SUM(tcp_rx_total) AS INTEGER) as tcp_rx_total,
			CAST(SUM(tcp_tx_total) AS INTEGER) as tcp_tx_total,
			CAST(SUM(udp_rx_total) AS INTEGER) as udp_rx_total,
			CAST(SUM(udp_tx_total) AS INTEGER) as udp_tx_total,
			COUNT(*) as instance_count,
			CURRENT_TIMESTAMP,
			CURRENT_TIMESTAMP
		FROM traffic_hourly_summary
		WHERE hour_time = ?`,
		hourStart, hourStart).Error; err != nil {
		return fmt.Errorf("初始化dashboard汇总数据失败: %v", err)
	}

	return nil
}

// CleanOldTrafficData 清理老旧的流量数据
func (s *TrafficService) CleanOldTrafficData() error {
	// 使用事务来确保数据一致性
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 清理30天前的原始数据
		if err := tx.Exec(`
			DELETE FROM endpoint_sse 
			WHERE event_time < datetime('now', '-30 days')
			AND push_type IN ('initial', 'update')
		`).Error; err != nil {
			return fmt.Errorf("清理原始流量数据失败: %v", err)
		}

		// 清理7天前的service_history数据
		if err := tx.Exec(`
			DELETE FROM service_history 
			WHERE record_time < datetime('now', '-7 days')
		`).Error; err != nil {
			return fmt.Errorf("清理service_history数据失败: %v", err)
		}

		// 清理1年前的汇总数据
		if err := tx.Exec(`
			DELETE FROM traffic_hourly_summary 
			WHERE hour_time < datetime('now', '-1 year')
		`).Error; err != nil {
			return fmt.Errorf("清理汇总流量数据失败: %v", err)
		}

		// 清理1年前的dashboard汇总数据
		if err := tx.Exec(`
			DELETE FROM dashboard_traffic_summary 
			WHERE hour_time < datetime('now', '-1 year')
		`).Error; err != nil {
			return fmt.Errorf("清理dashboard汇总数据失败: %v", err)
		}

		return nil
	})
}

// GetTrafficData 获取指定时间范围的流量数据（根据隧道实例ID）
func (s *TrafficService) GetTrafficData(instanceID string, start, end time.Time) ([]models.TrafficHourlySummary, error) {
	var data []models.TrafficHourlySummary

	err := s.db.Where("instance_id = ? AND hour_time >= ? AND hour_time < ?",
		instanceID, start, end).
		Order("hour_time ASC").
		Find(&data).Error

	if err != nil {
		return nil, fmt.Errorf("获取流量数据失败: %v", err)
	}

	return data, nil
}

// GetDashboardTrafficData 获取指定时间范围的dashboard流量数据
func (s *TrafficService) GetDashboardTrafficData(start, end time.Time) ([]models.DashboardTrafficSummary, error) {
	var data []models.DashboardTrafficSummary

	err := s.db.Where("hour_time >= ? AND hour_time < ?", start, end).
		Order("hour_time ASC").
		Find(&data).Error

	if err != nil {
		return nil, fmt.Errorf("获取dashboard流量数据失败: %v", err)
	}

	return data, nil
}

// GetTrafficTrendOptimized 获取优化后的流量趋势数据
func (s *TrafficService) GetTrafficTrendOptimized(hours int) ([]TrafficTrendItem, error) {
	end := time.Now()
	start := end.Add(-time.Duration(hours) * time.Hour)

	// 获取所有隧道的汇总数据
	var summaries []models.TrafficHourlySummary
	err := s.db.Where("hour_time >= ? AND hour_time < ?", start, end).
		Order("hour_time ASC").
		Find(&summaries).Error
	if err != nil {
		return nil, fmt.Errorf("获取流量趋势数据失败: %v", err)
	}

	// 按小时汇总所有隧道的流量
	hourlyTraffic := make(map[string]*TrafficTrendItem)
	for _, summary := range summaries {
		hourKey := summary.HourTime.Format("2006-01-02 15:00:00")
		if _, exists := hourlyTraffic[hourKey]; !exists {
			hourlyTraffic[hourKey] = &TrafficTrendItem{
				HourTime:    summary.HourTime.Unix(),
				HourDisplay: summary.HourTime.Format("15:04"),
				TCPRx:       0,
				TCPTx:       0,
				UDPRx:       0,
				UDPTx:       0,
				RecordCount: 0,
			}
		}

		item := hourlyTraffic[hourKey]
		item.TCPRx += summary.TCPRxIncrement
		item.TCPTx += summary.TCPTxIncrement
		item.UDPRx += summary.UDPRxIncrement
		item.UDPTx += summary.UDPTxIncrement
		item.RecordCount++
	}

	// 转换为切片并排序
	var result []TrafficTrendItem
	for _, item := range hourlyTraffic {
		result = append(result, *item)
	}

	// 按时间排序
	sort.Slice(result, func(i, j int) bool {
		return result[i].HourTime < result[j].HourTime
	})

	// 确保返回空数组而不是nil
	if result == nil {
		result = []TrafficTrendItem{}
	}

	return result, nil
}

// GetLatestTrafficData 获取最新的流量数据（根据隧道实例ID）
func (s *TrafficService) GetLatestTrafficData(instanceID string) (*models.TrafficHourlySummary, error) {
	var data models.TrafficHourlySummary

	err := s.db.Where("instance_id = ?", instanceID).
		Order("hour_time DESC").
		First(&data).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("获取最新流量数据失败: %v", err)
	}

	return &data, nil
}

// GetLatestDashboardTrafficData 获取最新的dashboard流量数据
func (s *TrafficService) GetLatestDashboardTrafficData() (*models.DashboardTrafficSummary, error) {
	var data models.DashboardTrafficSummary

	err := s.db.Order("hour_time DESC").
		First(&data).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("获取最新dashboard流量数据失败: %v", err)
	}

	return &data, nil
}
