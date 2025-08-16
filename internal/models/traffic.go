package models

import "time"

// TrafficHourlySummary 流量小时汇总表
type TrafficHourlySummary struct {
	ID             int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	HourTime       time.Time `json:"hourTime" gorm:"index:idx_traffic_hour_time;column:hour_time"`
	InstanceID     string    `json:"instanceId" gorm:"type:text;column:instance_id"`
	EndpointID     int64     `json:"endpointId" gorm:"column:endpoint_id"`
	TCPRxTotal     int64     `json:"tcpRxTotal" gorm:"default:0;column:tcp_rx_total"`
	TCPTxTotal     int64     `json:"tcpTxTotal" gorm:"default:0;column:tcp_tx_total"`
	UDPRxTotal     int64     `json:"udpRxTotal" gorm:"default:0;column:udp_rx_total"`
	UDPTxTotal     int64     `json:"udpTxTotal" gorm:"default:0;column:udp_tx_total"`
	TCPRxIncrement int64     `json:"tcpRxIncrement" gorm:"default:0;column:tcp_rx_increment"`
	TCPTxIncrement int64     `json:"tcpTxIncrement" gorm:"default:0;column:tcp_tx_increment"`
	UDPRxIncrement int64     `json:"udpRxIncrement" gorm:"default:0;column:udp_rx_increment"`
	UDPTxIncrement int64     `json:"udpTxIncrement" gorm:"default:0;column:udp_tx_increment"`
	RecordCount    int       `json:"recordCount" gorm:"default:0;column:record_count"`
	CreatedAt      time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt      time.Time `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`
}

// TableName 设置表名
func (TrafficHourlySummary) TableName() string {
	return "traffic_hourly_summary"
}

// GetTotalTraffic 获取总流量
func (t *TrafficHourlySummary) GetTotalTraffic() int64 {
	return t.TCPRxTotal + t.TCPTxTotal + t.UDPRxTotal + t.UDPTxTotal
}

// GetTotalIncrement 获取总增量
func (t *TrafficHourlySummary) GetTotalIncrement() int64 {
	return t.TCPRxIncrement + t.TCPTxIncrement + t.UDPRxIncrement + t.UDPTxIncrement
}

// GetTCPTotal 获取TCP总流量
func (t *TrafficHourlySummary) GetTCPTotal() int64 {
	return t.TCPRxTotal + t.TCPTxTotal
}

// GetUDPTotal 获取UDP总流量
func (t *TrafficHourlySummary) GetUDPTotal() int64 {
	return t.UDPRxTotal + t.UDPTxTotal
}

// GetTCPIncrement 获取TCP总增量
func (t *TrafficHourlySummary) GetTCPIncrement() int64 {
	return t.TCPRxIncrement + t.TCPTxIncrement
}

// GetUDPIncrement 获取UDP总增量
func (t *TrafficHourlySummary) GetUDPIncrement() int64 {
	return t.UDPRxIncrement + t.UDPTxIncrement
}

// DashboardTrafficSummary Dashboard流量汇总表
// 用于存储按小时汇总的所有实例流量累计值总和
type DashboardTrafficSummary struct {
	ID            int64     `json:"id" gorm:"primaryKey;autoIncrement;column:id"`
	HourTime      time.Time `json:"hourTime" gorm:"not null;unique;index:idx_dashboard_traffic_hour_time;column:hour_time"`
	TCPRxTotal    int64     `json:"tcpRxTotal" gorm:"default:0;column:tcp_rx_total"`      // 所有实例TCP接收累计值总和
	TCPTxTotal    int64     `json:"tcpTxTotal" gorm:"default:0;column:tcp_tx_total"`      // 所有实例TCP发送累计值总和
	UDPRxTotal    int64     `json:"udpRxTotal" gorm:"default:0;column:udp_rx_total"`      // 所有实例UDP接收累计值总和
	UDPTxTotal    int64     `json:"udpTxTotal" gorm:"default:0;column:udp_tx_total"`      // 所有实例UDP发送累计值总和
	InstanceCount int       `json:"instanceCount" gorm:"default:0;column:instance_count"` // 参与汇总的实例数量
	CreatedAt     time.Time `json:"createdAt" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt     time.Time `json:"updatedAt" gorm:"autoUpdateTime;column:updated_at"`
}

// TableName 设置表名
func (DashboardTrafficSummary) TableName() string {
	return "dashboard_traffic_summary"
}

// GetTotalTraffic 获取总流量
func (d *DashboardTrafficSummary) GetTotalTraffic() int64 {
	return d.TCPRxTotal + d.TCPTxTotal + d.UDPRxTotal + d.UDPTxTotal
}

// GetTCPTotal 获取TCP总流量
func (d *DashboardTrafficSummary) GetTCPTotal() int64 {
	return d.TCPRxTotal + d.TCPTxTotal
}

// GetUDPTotal 获取UDP总流量
func (d *DashboardTrafficSummary) GetUDPTotal() int64 {
	return d.UDPRxTotal + d.UDPTxTotal
}
