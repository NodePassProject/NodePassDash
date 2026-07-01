package dashboard

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"NodePassDash/internal/db"
	"NodePassDash/internal/models"

	"gorm.io/gorm"
)

// TrafficService 流量服务
type TrafficService struct {
	db *gorm.DB
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
		// 1. UPSERT 当前小时窗口的聚合记录。
		// SQLite 3.24+ 与 PostgreSQL 都支持 ON CONFLICT DO UPDATE,
		// 唯一索引由 ensureOptimizedIndexes 保证存在。
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

		// 1.1 对于该小时窗口内没有任何 service_history 记录的实例:从上一小时 carry forward,
		// 避免"某小时缺行导致曲线断点/实例数抖动",同时 increment 在下一步自动算为 0。
		previousHour := hourStart.Add(-1 * time.Hour)
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

		// 2. 计算与上一小时的差值(increment 字段)
		if err := s.calculateIncrements(tx, hourStart); err != nil {
			return fmt.Errorf("计算增量失败: %v", err)
		}

		// 3. 执行 dashboard 汇总
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

	// 更新 increment 字段,计算与上一小时的差值。
	// 注意:必须给外层目标表起别名 cur,否则相关子查询里的
	// `instance_id = traffic_hourly_summary.instance_id` 在 Postgres 下会被
	// 解析为子查询自身那张同名表,变成 `instance_id = instance_id` 永真,
	// 子查询返回多行 → SQLSTATE 21000 "more than one row returned by a subquery"。
	// SQLite 对这种作用域更宽松所以原写法在 SQLite 下能跑。
	// SQLite 3.39+ 起也支持 UPDATE ... AS alias,modernc.org/sqlite (内嵌 3.45+) 满足要求。
	if err := tx.Exec(`
		UPDATE traffic_hourly_summary AS cur
		SET
			tcp_rx_increment = cur.tcp_rx_total - COALESCE((
				SELECT tcp_rx_total
				FROM traffic_hourly_summary
				WHERE hour_time = ?
					AND instance_id = cur.instance_id
					AND endpoint_id = cur.endpoint_id
			), 0),
			tcp_tx_increment = cur.tcp_tx_total - COALESCE((
				SELECT tcp_tx_total
				FROM traffic_hourly_summary
				WHERE hour_time = ?
					AND instance_id = cur.instance_id
					AND endpoint_id = cur.endpoint_id
			), 0),
			udp_rx_increment = cur.udp_rx_total - COALESCE((
				SELECT udp_rx_total
				FROM traffic_hourly_summary
				WHERE hour_time = ?
					AND instance_id = cur.instance_id
					AND endpoint_id = cur.endpoint_id
			), 0),
			udp_tx_increment = cur.udp_tx_total - COALESCE((
				SELECT udp_tx_total
				FROM traffic_hourly_summary
				WHERE hour_time = ?
					AND instance_id = cur.instance_id
					AND endpoint_id = cur.endpoint_id
			), 0)
		WHERE cur.hour_time = ?
	`, previousHour, previousHour, previousHour, previousHour, hourStart).Error; err != nil {
		return fmt.Errorf("更新增量数据失败: %v", err)
	}

	return nil
}

// aggregateDashboardTraffic 聚合 dashboard 流量数据。
// 使用 ON CONFLICT(hour_time) DO UPDATE,兼容 SQLite 3.24+ 与 PostgreSQL。
func (s *TrafficService) aggregateDashboardTraffic(tx *gorm.DB, hourStart time.Time) error {
	if err := tx.Exec(`
		INSERT INTO dashboard_traffic_summary (
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
		WHERE hour_time = ?
		ON CONFLICT(hour_time) DO UPDATE SET
			tcp_rx_total = excluded.tcp_rx_total,
			tcp_tx_total = excluded.tcp_tx_total,
			udp_rx_total = excluded.udp_rx_total,
			udp_tx_total = excluded.udp_tx_total,
			instance_count = excluded.instance_count,
			updated_at = CURRENT_TIMESTAMP`,
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
		// UPSERT 当前小时聚合(与 AggregateTrafficDataForHour 相同 SQL,统一走 ON CONFLICT)
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

		// 对缺失小时数据的实例:carry-forward 上一小时
		previousHour := hourStart.Add(-1 * time.Hour)
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

// initializeDashboardTraffic 初始化 dashboard 流量数据(支持更新)。
// 与 aggregateDashboardTraffic 共用相同的 ON CONFLICT 语义。
func (s *TrafficService) initializeDashboardTraffic(tx *gorm.DB, hourStart time.Time) error {
	if err := tx.Exec(`
		INSERT INTO dashboard_traffic_summary (
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
		WHERE hour_time = ?
		ON CONFLICT(hour_time) DO UPDATE SET
			tcp_rx_total = excluded.tcp_rx_total,
			tcp_tx_total = excluded.tcp_tx_total,
			udp_rx_total = excluded.udp_rx_total,
			udp_tx_total = excluded.udp_tx_total,
			instance_count = excluded.instance_count,
			updated_at = CURRENT_TIMESTAMP`,
		hourStart, hourStart).Error; err != nil {
		return fmt.Errorf("初始化dashboard汇总数据失败: %v", err)
	}

	return nil
}

// CleanOldTrafficData 清理老旧的流量数据。
// 时间比较表达式通过方言 helper 生成,SQLite 与 PG 各取其惯用语法。
func (s *TrafficService) CleanOldTrafficData() error {
	d := db.Dialect()
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 清理30天前的原始数据
		if err := tx.Exec(fmt.Sprintf(`
			DELETE FROM endpoint_sse
			WHERE %s
			AND push_type IN ('initial', 'update')
		`, d.TimeAgo("event_time", "-30 days"))).Error; err != nil {
			return fmt.Errorf("清理原始流量数据失败: %v", err)
		}

		// 清理7天前的service_history数据
		if err := tx.Exec(fmt.Sprintf(`
			DELETE FROM service_history
			WHERE %s
		`, d.TimeAgo("record_time", "-7 days"))).Error; err != nil {
			return fmt.Errorf("清理service_history数据失败: %v", err)
		}

		// 清理1年前的汇总数据
		if err := tx.Exec(fmt.Sprintf(`
			DELETE FROM traffic_hourly_summary
			WHERE %s
		`, d.TimeAgo("hour_time", "-1 year"))).Error; err != nil {
			return fmt.Errorf("清理汇总流量数据失败: %v", err)
		}

		// 清理1年前的dashboard汇总数据
		if err := tx.Exec(fmt.Sprintf(`
			DELETE FROM dashboard_traffic_summary
			WHERE %s
		`, d.TimeAgo("hour_time", "-1 year"))).Error; err != nil {
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

// TodayTrafficIncrement 今日流量增量(所有实例合计)
type TodayTrafficIncrement struct {
	TCPRx int64 `json:"tcpIn" gorm:"column:tcp_rx"`
	TCPTx int64 `json:"tcpOut" gorm:"column:tcp_tx"`
	UDPRx int64 `json:"udpIn" gorm:"column:udp_rx"`
	UDPTx int64 `json:"udpOut" gorm:"column:udp_tx"`
}

// Total 今日 TCP+UDP 双向合计
func (t TodayTrafficIncrement) Total() int64 {
	return t.TCPRx + t.TCPTx + t.UDPRx + t.UDPTx
}

// GetTodayTrafficIncrement 汇总当日(本地零点起)所有实例的每小时增量。
// hour_time 在 AggregateTrafficDataForHour 中使用 now.Location() 存入,
// 因此这里同样用 now.Location() 构造零点边界,SQLite 与 PostgreSQL 走
// 同一段 gorm 参数化查询,无方言差异。
func (s *TrafficService) GetTodayTrafficIncrement() (TodayTrafficIncrement, error) {
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	var result TodayTrafficIncrement
	err := s.db.Model(&models.TrafficHourlySummary{}).
		Select(`COALESCE(SUM(tcp_rx_increment), 0) AS tcp_rx,
			COALESCE(SUM(tcp_tx_increment), 0) AS tcp_tx,
			COALESCE(SUM(udp_rx_increment), 0) AS udp_rx,
			COALESCE(SUM(udp_tx_increment), 0) AS udp_tx`).
		Where("hour_time >= ?", todayStart).
		Scan(&result).Error
	if err != nil {
		return TodayTrafficIncrement{}, fmt.Errorf("获取今日流量增量失败: %v", err)
	}
	return result, nil
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
