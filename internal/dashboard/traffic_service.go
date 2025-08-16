package dashboard

import (
	"fmt"
	"sort"
	"time"

	"NodePassDash/internal/models"

	"gorm.io/gorm"
)

// TrafficService 流量服务
type TrafficService struct {
	db *gorm.DB
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
	// 计算上一小时59分的时间点（获取累计值的时间点）
	targetTime := hourStart.Add(59 * time.Minute)

	// 使用事务来确保数据一致性
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 1. 使用UPSERT语法（INSERT OR REPLACE）来处理更新
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
				WHERE record_time <= ?
				GROUP BY endpoint_id, instance_id
			) latest ON sh.endpoint_id = latest.endpoint_id 
				AND sh.instance_id = latest.instance_id 
				AND sh.record_time = latest.max_record_time
			WHERE sh.record_time <= ?`,
			hourStart, targetTime, targetTime).Error; err != nil {
			return fmt.Errorf("插入汇总数据失败: %v", err)
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
				WHERE hour_time = ? AND instance_id = traffic_hourly_summary.instance_id
			), 0),
			tcp_tx_increment = tcp_tx_total - COALESCE((
				SELECT tcp_tx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? AND instance_id = traffic_hourly_summary.instance_id
			), 0),
			udp_rx_increment = udp_rx_total - COALESCE((
				SELECT udp_rx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? AND instance_id = traffic_hourly_summary.instance_id
			), 0),
			udp_tx_increment = udp_tx_total - COALESCE((
				SELECT udp_tx_total 
				FROM traffic_hourly_summary 
				WHERE hour_time = ? AND instance_id = traffic_hourly_summary.instance_id
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

	for hour := start; hour.Before(now); hour = hour.Add(time.Hour) {
		if err := s.initializeTrafficDataForHour(hour); err != nil {
			return fmt.Errorf("初始化小时数据失败 %s: %v", hour.Format("2006-01-02 15:04"), err)
		}
	}

	return nil
}

// initializeTrafficDataForHour 初始化指定小时的流量数据（支持更新处理）
func (s *TrafficService) initializeTrafficDataForHour(hourStart time.Time) error {
	// 计算上一小时59分的时间点
	targetTime := hourStart.Add(59 * time.Minute)

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 使用UPSERT语法（INSERT OR REPLACE）来处理更新
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
				WHERE record_time <= ?
				GROUP BY endpoint_id, instance_id
			) latest ON sh.endpoint_id = latest.endpoint_id 
				AND sh.instance_id = latest.instance_id 
				AND sh.record_time = latest.max_record_time
			WHERE sh.record_time <= ?`,
			hourStart, targetTime, targetTime).Error; err != nil {
			return fmt.Errorf("初始化汇总数据失败: %v", err)
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
