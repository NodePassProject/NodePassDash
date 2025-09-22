package dashboard

// DashboardStats 仪表盘统计数据
type DashboardStats struct {
	// 总览数据
	Overview struct {
		TotalEndpoints int64 `json:"totalEndpoints"` // 端点总数
		TotalTunnels   int64 `json:"totalTunnels"`   // 隧道总数
		RunningTunnels int64 `json:"runningTunnels"` // 运行中的隧道数
		StoppedTunnels int64 `json:"stoppedTunnels"` // 已停止的隧道数
		ErrorTunnels   int64 `json:"errorTunnels"`   // 错误状态的隧道数
		OfflineTunnels int64 `json:"offlineTunnels"` // 离线状态的隧道数
		TotalTraffic   int64 `json:"totalTraffic"`   // 总流量
	} `json:"overview"`

	// 流量统计
	Traffic struct {
		Total struct {
			Value     int64  `json:"value"`     // 总流量值
			Formatted string `json:"formatted"` // 格式化后的总流量
		} `json:"total"`
		TCP struct {
			Rx struct {
				Value     int64  `json:"value"`
				Formatted string `json:"formatted"`
			} `json:"rx"`
			Tx struct {
				Value     int64  `json:"value"`
				Formatted string `json:"formatted"`
			} `json:"tx"`
		} `json:"tcp"`
		UDP struct {
			Rx struct {
				Value     int64  `json:"value"`
				Formatted string `json:"formatted"`
			} `json:"rx"`
			Tx struct {
				Value     int64  `json:"value"`
				Formatted string `json:"formatted"`
			} `json:"tx"`
		} `json:"udp"`
	} `json:"traffic"`

	// 端点状态分布
	EndpointStatus struct {
		Online  int64 `json:"online"`  // 在线端点数
		Offline int64 `json:"offline"` // 离线端点数
		Total   int64 `json:"total"`   // 端点总数
	} `json:"endpointStatus"`

	// 隧道类型分布
	TunnelTypes struct {
		Server int64 `json:"server"` // 服务端隧道数
		Client int64 `json:"client"` // 客户端隧道数
		Total  int64 `json:"total"`  // 隧道总数
	} `json:"tunnelTypes"`

	// 最近的操作日志
	RecentLogs []struct {
		ID        int64  `json:"id"`
		TunnelID  int64  `json:"tunnelId"`
		Name      string `json:"name"`
		Action    string `json:"action"`
		Status    string `json:"status"`
		Message   string `json:"message"`
		CreatedAt string `json:"createdAt"`
	} `json:"recentLogs"`

	// 最活跃的隧道（按流量排序）
	TopTunnels []struct {
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		Type      string `json:"type"`
		Traffic   int64  `json:"traffic"`
		Formatted string `json:"formatted"`
	} `json:"topTunnels"`
}

// TimeRange 时间范围
type TimeRange string

const (
	TimeRangeToday   TimeRange = "today"
	TimeRangeWeek    TimeRange = "week"
	TimeRangeMonth   TimeRange = "month"
	TimeRangeYear    TimeRange = "year"
	TimeRangeAllTime TimeRange = "all"
)

// WeeklyStatsItem 每周流量统计条目
type WeeklyStatsItem struct {
	Weekday    string `json:"weekday"`    // Mon, Tue, Wed, etc.
	WeekdayZh  string `json:"weekday_zh"` // 周一, 周二, etc.
	Date       string `json:"date"`       // 2024-01-01
	TCPIn      int64  `json:"tcp_in"`     // TCP 入站流量
	TCPOut     int64  `json:"tcp_out"`    // TCP 出站流量
	UDPIn      int64  `json:"udp_in"`     // UDP 入站流量
	UDPOut     int64  `json:"udp_out"`    // UDP 出站流量
	TotalBytes int64  `json:"total_bytes"` // 总流量
}
