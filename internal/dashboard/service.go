package dashboard

import (
	"NodePassDash/internal/models"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Service 仪表盘服务
type Service struct {
	db *gorm.DB
}

// NewService 创建仪表盘服务实例
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// DB 返回数据库连接
func (s *Service) DB() *gorm.DB {
	return s.db
}

// GetStats 获取仪表盘统计数据
func (s *Service) GetStats(timeRange TimeRange) (*DashboardStats, error) {
	stats := &DashboardStats{}

	// 获取时间范围
	startTime := time.Now()
	var timeCondition string
	switch timeRange {
	case TimeRangeToday:
		startTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 0, 0, 0, 0, startTime.Location())
		timeCondition = "created_at >= ?"
	case TimeRangeWeek:
		startTime = startTime.AddDate(0, 0, -7)
		timeCondition = "created_at >= ?"
	case TimeRangeMonth:
		startTime = startTime.AddDate(0, -1, 0)
		timeCondition = "created_at >= ?"
	case TimeRangeYear:
		startTime = startTime.AddDate(-1, 0, 0)
		timeCondition = "created_at >= ?"
	case TimeRangeAllTime:
		timeCondition = "1 = 1" // 无时间限制
	}

	// 获取总览数据
	var overviewResult struct {
		TotalEndpoints int64 `json:"total_endpoints"`
		TotalTunnels   int64 `json:"total_tunnels"`
		RunningTunnels int64 `json:"running_tunnels"`
		StoppedTunnels int64 `json:"stopped_tunnels"`
		ErrorTunnels   int64 `json:"error_tunnels"`
		OfflineTunnels int64 `json:"offline_tunnels"`
		TotalTraffic   int64 `json:"total_traffic"`
	}

	query := s.db.Table("endpoints e").
		Select(`
			COUNT(DISTINCT e.id) as total_endpoints,
			COUNT(DISTINCT t.id) as total_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'running' THEN t.id END) as running_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'stopped' THEN t.id END) as stopped_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'error' THEN t.id END) as error_tunnels,
			COUNT(DISTINCT CASE WHEN t.status = 'offline' THEN t.id END) as offline_tunnels,
			COALESCE(SUM(t.tcp_rx + t.tcp_tx + t.udp_rx + t.udp_tx), 0) as total_traffic
		`).
		Joins("LEFT JOIN tunnels t ON e.id = t.endpoint_id")

	if timeRange != TimeRangeAllTime {
		query = query.Where("t."+timeCondition, startTime)
	}

	err := query.Scan(&overviewResult).Error
	if err != nil {
		return nil, fmt.Errorf("获取总览数据失败: %v", err)
	}

	stats.Overview.TotalEndpoints = overviewResult.TotalEndpoints
	stats.Overview.TotalTunnels = overviewResult.TotalTunnels
	stats.Overview.RunningTunnels = overviewResult.RunningTunnels
	stats.Overview.StoppedTunnels = overviewResult.StoppedTunnels
	stats.Overview.ErrorTunnels = overviewResult.ErrorTunnels
	stats.Overview.OfflineTunnels = overviewResult.OfflineTunnels
	stats.Overview.TotalTraffic = overviewResult.TotalTraffic

	// 获取流量统计
	var trafficResult struct {
		TCPRx int64 `json:"tcp_rx"`
		TCPTx int64 `json:"tcp_tx"`
		UDPRx int64 `json:"udp_rx"`
		UDPTx int64 `json:"udp_tx"`
	}

	trafficQuery := s.db.Table("tunnels").
		Select(`
			COALESCE(SUM(tcp_rx), 0) as tcp_rx,
			COALESCE(SUM(tcp_tx), 0) as tcp_tx,
			COALESCE(SUM(udp_rx), 0) as udp_rx,
			COALESCE(SUM(udp_tx), 0) as udp_tx
		`)

	if timeRange != TimeRangeAllTime {
		trafficQuery = trafficQuery.Where(timeCondition, startTime)
	}

	err = trafficQuery.Scan(&trafficResult).Error
	if err != nil {
		return nil, fmt.Errorf("获取流量统计失败: %v", err)
	}

	// 设置流量统计数据
	stats.Traffic.TCP.Rx.Value = trafficResult.TCPRx
	stats.Traffic.TCP.Rx.Formatted = formatTrafficBytes(trafficResult.TCPRx)
	stats.Traffic.TCP.Tx.Value = trafficResult.TCPTx
	stats.Traffic.TCP.Tx.Formatted = formatTrafficBytes(trafficResult.TCPTx)
	stats.Traffic.UDP.Rx.Value = trafficResult.UDPRx
	stats.Traffic.UDP.Rx.Formatted = formatTrafficBytes(trafficResult.UDPRx)
	stats.Traffic.UDP.Tx.Value = trafficResult.UDPTx
	stats.Traffic.UDP.Tx.Formatted = formatTrafficBytes(trafficResult.UDPTx)

	totalTraffic := trafficResult.TCPRx + trafficResult.TCPTx + trafficResult.UDPRx + trafficResult.UDPTx
	stats.Traffic.Total.Value = totalTraffic
	stats.Traffic.Total.Formatted = formatTrafficBytes(totalTraffic)

	// 获取端点状态分布 (基于最后检查时间判断在线状态)
	var endpointStatusResult struct {
		Online  int64 `json:"online"`
		Offline int64 `json:"offline"`
		Total   int64 `json:"total"`
	}

	fiveMinutesAgo := time.Now().Add(-5 * time.Minute)
	endpointQuery := s.db.Table("endpoints").
		Select(`
			COUNT(CASE WHEN last_check >= ? THEN 1 END) as online,
			COUNT(CASE WHEN last_check < ? THEN 1 END) as offline,
			COUNT(*) as total
		`, fiveMinutesAgo, fiveMinutesAgo)

	if timeRange != TimeRangeAllTime {
		endpointQuery = endpointQuery.Where(timeCondition, startTime)
	}

	err = endpointQuery.Scan(&endpointStatusResult).Error
	if err != nil {
		return nil, fmt.Errorf("获取端点状态分布失败: %v", err)
	}

	stats.EndpointStatus.Online = endpointStatusResult.Online
	stats.EndpointStatus.Offline = endpointStatusResult.Offline
	stats.EndpointStatus.Total = endpointStatusResult.Total

	// 获取隧道类型分布
	var tunnelTypesResult struct {
		Server int64 `json:"server"`
		Client int64 `json:"client"`
		Total  int64 `json:"total"`
	}

	tunnelTypesQuery := s.db.Table("tunnels").
		Select(`
			COUNT(CASE WHEN mode = 'server' THEN 1 END) as server,
			COUNT(CASE WHEN mode = 'client' THEN 1 END) as client,
			COUNT(*) as total
		`)

	if timeRange != TimeRangeAllTime {
		tunnelTypesQuery = tunnelTypesQuery.Where(timeCondition, startTime)
	}

	err = tunnelTypesQuery.Scan(&tunnelTypesResult).Error
	if err != nil {
		return nil, fmt.Errorf("获取隧道类型分布失败: %v", err)
	}

	stats.TunnelTypes.Server = tunnelTypesResult.Server
	stats.TunnelTypes.Client = tunnelTypesResult.Client
	stats.TunnelTypes.Total = tunnelTypesResult.Total

	// 获取最近的操作日志
	var operationLogs []models.TunnelOperationLog
	logQuery := s.db.Order("created_at DESC").Limit(10)
	if timeRange != TimeRangeAllTime {
		logQuery = logQuery.Where(timeCondition, startTime)
	}

	err = logQuery.Find(&operationLogs).Error
	if err != nil {
		return nil, fmt.Errorf("获取操作日志失败: %v", err)
	}

	for _, log := range operationLogs {
		stats.RecentLogs = append(stats.RecentLogs, struct {
			ID        int64  `json:"id"`
			TunnelID  int64  `json:"tunnelId"`
			Name      string `json:"name"`
			Action    string `json:"action"`
			Status    string `json:"status"`
			Message   string `json:"message"`
			CreatedAt string `json:"createdAt"`
		}{
			ID:        log.ID,
			TunnelID:  *log.TunnelID,
			Name:      log.TunnelName,
			Action:    string(log.Action),
			Status:    log.Status,
			Message:   *log.Message,
			CreatedAt: log.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	// 获取最活跃的隧道
	var topTunnels []struct {
		ID           int64  `json:"id"`
		Name         string `json:"name"`
		Mode         string `json:"mode"`
		TotalTraffic int64  `json:"total_traffic"`
	}

	topTunnelsQuery := s.db.Table("tunnels").
		Select("id, name, mode, (tcp_rx + tcp_tx + udp_rx + udp_tx) as total_traffic").
		Order("total_traffic DESC").
		Limit(5)

	if timeRange != TimeRangeAllTime {
		topTunnelsQuery = topTunnelsQuery.Where(timeCondition, startTime)
	}

	err = topTunnelsQuery.Find(&topTunnels).Error
	if err != nil {
		return nil, fmt.Errorf("获取最活跃隧道失败: %v", err)
	}

	for _, tunnel := range topTunnels {
		tunnelType := "客户端"
		if tunnel.Mode == "server" {
			tunnelType = "服务端"
		}

		stats.TopTunnels = append(stats.TopTunnels, struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			Traffic   int64  `json:"traffic"`
			Formatted string `json:"formatted"`
		}{
			ID:        tunnel.ID,
			Name:      tunnel.Name,
			Type:      tunnelType,
			Traffic:   tunnel.TotalTraffic,
			Formatted: formatTrafficBytes(tunnel.TotalTraffic),
		})
	}

	return stats, nil
}

// formatTrafficBytes 格式化流量数据
func formatTrafficBytes(bytes int64) string {
	const (
		_          = iota
		KB float64 = 1 << (10 * iota)
		MB
		GB
		TB
	)

	var size float64
	var unit string

	switch {
	case bytes >= int64(TB):
		size = float64(bytes) / TB
		unit = "TB"
	case bytes >= int64(GB):
		size = float64(bytes) / GB
		unit = "GB"
	case bytes >= int64(MB):
		size = float64(bytes) / MB
		unit = "MB"
	case bytes >= int64(KB):
		size = float64(bytes) / KB
		unit = "KB"
	default:
		size = float64(bytes)
		unit = "B"
	}

	return fmt.Sprintf("%.2f %s", size, unit)
}

// TrafficTrendItem 流量趋势条目
type TrafficTrendItem struct {
	HourTime    string `json:"hourTime"`    // 2025-06-15 11:00:00
	HourDisplay string `json:"hourDisplay"` // 11:00
	TCPRx       int64  `json:"tcpRx"`
	TCPTx       int64  `json:"tcpTx"`
	UDPRx       int64  `json:"udpRx"`
	UDPTx       int64  `json:"udpTx"`
	RecordCount int    `json:"recordCount"`
}

// GetTrafficTrend 获取最近 hours 小时内的流量趋势，默认24小时
// 优化版本：优先使用汇总表，降级到原始查询
func (s *Service) GetTrafficTrend(hours int) ([]TrafficTrendItem, error) {
	if hours <= 0 {
		hours = 24
	}

	// 使用优化的流量服务
	trafficService := NewTrafficService(s.db)
	return trafficService.GetTrafficTrendOptimized(hours)
}

// 使用原生SQL实现流量趋势查询
func (s *Service) getTrafficTrendWithSQL(hours int) ([]TrafficTrendItem, error) {
	var records []struct {
		InstanceID string    `json:"instance_id"`
		HourKey    string    `json:"hour_key"`
		EventTime  time.Time `json:"event_time"`
		TCPRx      int64     `json:"tcp_rx"` // 改为int64，与模型一致
		TCPTx      int64     `json:"tcp_tx"`
		UDPRx      int64     `json:"udp_rx"`
		UDPTx      int64     `json:"udp_tx"`
	}

	// 检查MySQL版本，尝试使用窗口函数
	var version string
	s.db.Raw("SELECT VERSION()").Scan(&version)

	// MySQL 8.0+ 支持窗口函数
	if strings.Contains(version, "8.") || strings.Contains(version, "9.") {
		sqlQuery := `
			SELECT instance_id, hour_key, event_time, tcp_rx, tcp_tx, udp_rx, udp_tx
			FROM (
				SELECT 
					instance_id,
					DATE_FORMAT(event_time, '%Y-%m-%d %H:00:00') as hour_key,
					event_time,
					tcp_rx, tcp_tx, udp_rx, udp_tx,
					ROW_NUMBER() OVER (
						PARTITION BY instance_id, DATE_FORMAT(event_time, '%Y-%m-%d %H:00:00') 
						ORDER BY event_time DESC
					) as rn
				FROM endpoint_sse
				WHERE push_type IN ('initial','update')
				AND event_time >= DATE_SUB(NOW(), INTERVAL ? HOUR)
				AND (tcp_rx > 0 OR tcp_tx > 0 OR udp_rx > 0 OR udp_tx > 0)
			) as hourly_latest
			WHERE rn = 1
			ORDER BY instance_id, hour_key ASC
		`

		err := s.db.Raw(sqlQuery, hours+1).Scan(&records).Error
		if err == nil {
			return s.processTrafficRecords(records, hours)
		}
		// 如果窗口函数失败，继续使用备用方案
	}

	// 备用方案：使用GROUP BY + MAX，兼容MySQL 5.7及以下
	sqlQuery := `
		SELECT 
			t1.instance_id,
			DATE_FORMAT(t1.event_time, '%Y-%m-%d %H:00:00') as hour_key,
			t1.event_time,
			t1.tcp_rx, t1.tcp_tx, t1.udp_rx, t1.udp_tx
		FROM endpoint_sse t1
		INNER JOIN (
			SELECT 
				instance_id,
				DATE_FORMAT(event_time, '%Y-%m-%d %H:00:00') as hour_key,
				MAX(event_time) as max_time
			FROM endpoint_sse
			WHERE push_type IN ('initial','update')
			AND event_time >= DATE_SUB(NOW(), INTERVAL ? HOUR)
			AND (tcp_rx > 0 OR tcp_tx > 0 OR udp_rx > 0 OR udp_tx > 0)
			GROUP BY instance_id, DATE_FORMAT(event_time, '%Y-%m-%d %H:00:00')
		) t2 ON t1.instance_id = t2.instance_id 
			AND t1.event_time = t2.max_time
			AND DATE_FORMAT(t1.event_time, '%Y-%m-%d %H:00:00') = t2.hour_key
		WHERE t1.push_type IN ('initial','update')
		ORDER BY t1.instance_id, hour_key ASC
	`

	err := s.db.Raw(sqlQuery, hours+1).Scan(&records).Error
	if err != nil {
		return nil, fmt.Errorf("查询流量数据失败: %v", err)
	}

	return s.processTrafficRecords(records, hours)
}

// 处理流量记录数据
func (s *Service) processTrafficRecords(records []struct {
	InstanceID string    `json:"instance_id"`
	HourKey    string    `json:"hour_key"`
	EventTime  time.Time `json:"event_time"`
	TCPRx      int64     `json:"tcp_rx"`
	TCPTx      int64     `json:"tcp_tx"`
	UDPRx      int64     `json:"udp_rx"`
	UDPTx      int64     `json:"udp_tx"`
}, hours int) ([]TrafficTrendItem, error) {

	// 按实例ID分组数据
	instanceData := make(map[string][]struct {
		InstanceID string    `json:"instance_id"`
		HourKey    string    `json:"hour_key"`
		EventTime  time.Time `json:"event_time"`
		TCPRx      int64     `json:"tcp_rx"`
		TCPTx      int64     `json:"tcp_tx"`
		UDPRx      int64     `json:"udp_rx"`
		UDPTx      int64     `json:"udp_tx"`
	})

	for _, record := range records {
		instanceData[record.InstanceID] = append(instanceData[record.InstanceID], record)
	}

	// 确保每个实例的数据按时间排序
	for instanceID := range instanceData {
		data := instanceData[instanceID]
		sort.Slice(data, func(i, j int) bool {
			return data[i].HourKey < data[j].HourKey
		})
		instanceData[instanceID] = data
	}

	// 计算每个实例每小时的流量增量，然后按小时汇总
	hourlyTraffic := make(map[string]*TrafficTrendItem)

	for _, hourlyRecords := range instanceData {
		// 为每个实例计算小时间的流量差值
		for i := 1; i < len(hourlyRecords); i++ {
			current := hourlyRecords[i]
			previous := hourlyRecords[i-1]

			// 解析小时时间
			hourTime, err := time.Parse("2006-01-02 15:00:00", current.HourKey)
			if err != nil {
				continue
			}

			// 初始化该小时的数据结构
			if _, exists := hourlyTraffic[current.HourKey]; !exists {
				hourlyTraffic[current.HourKey] = &TrafficTrendItem{
					HourTime:    current.HourKey,
					HourDisplay: hourTime.Format("15:04"),
					TCPRx:       0,
					TCPTx:       0,
					UDPRx:       0,
					UDPTx:       0,
					RecordCount: 0,
				}
			}

			item := hourlyTraffic[current.HourKey]

			// 计算该实例在这个小时的流量增量
			// TCP Rx
			diff := current.TCPRx - previous.TCPRx
			if diff >= 0 {
				item.TCPRx += diff
			}

			// TCP Tx
			diff = current.TCPTx - previous.TCPTx
			if diff >= 0 {
				item.TCPTx += diff
			}

			// UDP Rx
			diff = current.UDPRx - previous.UDPRx
			if diff >= 0 {
				item.UDPRx += diff
			}

			// UDP Tx
			diff = current.UDPTx - previous.UDPTx
			if diff >= 0 {
				item.UDPTx += diff
			}

			item.RecordCount++
		}
	}

	// 转换为切片并排序
	var list []TrafficTrendItem
	for _, item := range hourlyTraffic {
		list = append(list, *item)
	}

	// 按时间排序
	sort.Slice(list, func(i, j int) bool {
		return list[i].HourTime < list[j].HourTime
	})

	// 限制返回最近 hours 条记录
	if len(list) > hours {
		list = list[len(list)-hours:]
	}

	// 确保返回空数组而不是nil
	if list == nil {
		list = []TrafficTrendItem{}
	}

	return list, nil
}
