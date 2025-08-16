package metrics

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"strconv"
	"sync"
	"time"
)

// SSEProcessor SSE 事件处理器，将原始 SSE 数据转换为聚合器输入
type SSEProcessor struct {
	aggregator *MetricsAggregator
	mu         sync.RWMutex

	// 流量快照存储 - 用于计算速率
	trafficSnapshots map[string]*TrafficSnapshot // key: "endpointID_instanceID"
}

// TrafficSnapshot 流量快照，用于计算差值速率
type TrafficSnapshot struct {
	EndpointID int64     `json:"endpoint_id"`
	InstanceID string    `json:"instance_id"`
	TCPRx      int64     `json:"tcp_rx"`
	TCPTx      int64     `json:"tcp_tx"`
	UDPRx      int64     `json:"udp_rx"`
	UDPTx      int64     `json:"udp_tx"`
	LastUpdate time.Time `json:"last_update"`
}

// NewSSEProcessor 创建 SSE 处理器
func NewSSEProcessor(aggregator *MetricsAggregator) *SSEProcessor {
	return &SSEProcessor{
		aggregator:       aggregator,
		trafficSnapshots: make(map[string]*TrafficSnapshot),
	}
}

// ProcessSSEEvent 处理 SSE 事件 - 仿照 Nezha 的事件处理逻辑
func (p *SSEProcessor) ProcessSSEEvent(endpointID int64, event models.EndpointSSE) error {
	// 只处理 update 和 initial 类型的事件
	if event.EventType != "update" && event.EventType != "initial" {
		return nil
	}

	instanceID := event.InstanceID
	if instanceID == "" {
		return nil
	}

	// 处理 Ping 延迟
	if event.Ping != nil && *event.Ping > 0 {
		latency := float64(*event.Ping)
		success := true

		// Ping 值为 0 或负数视为失败
		if *event.Ping <= 0 {
			success = false
			latency = 0
		}

		p.aggregator.AddPingResult(endpointID, instanceID, latency, success)
		log.Debugf("添加Ping结果 [%d_%s]: 延迟=%.2fms, 成功=%v", endpointID, instanceID, latency, success)
	}

	// 处理连接池数量
	if event.Pool != nil && *event.Pool >= 0 {
		poolCount := int(*event.Pool)
		p.aggregator.AddPoolResult(endpointID, instanceID, poolCount)
		log.Debugf("添加连接池结果 [%d_%s]: 连接数=%d", endpointID, instanceID, poolCount)
	}

	// 处理流量数据
	p.processTrafficData(endpointID, instanceID, event)

	return nil
}

// processTrafficData 处理流量数据，计算速率并添加到聚合器
func (p *SSEProcessor) processTrafficData(endpointID int64, instanceID string, event models.EndpointSSE) {
	// 获取当前流量值 - EndpointSSE 中的流量字段是 int64 类型，不是指针
	tcpRx := event.TCPRx
	tcpTx := event.TCPTx
	udpRx := event.UDPRx
	udpTx := event.UDPTx

	// 检查是否有任何流量数据
	if tcpRx == 0 && tcpTx == 0 && udpRx == 0 && udpTx == 0 {
		return
	}

	key := p.getSnapshotKey(endpointID, instanceID)
	now := time.Now()

	p.mu.Lock()
	defer p.mu.Unlock()

	// 获取或创建流量快照
	snapshot, exists := p.trafficSnapshots[key]
	if !exists {
		// 首次记录，创建快照但不计算速率
		p.trafficSnapshots[key] = &TrafficSnapshot{
			EndpointID: endpointID,
			InstanceID: instanceID,
			TCPRx:      tcpRx,
			TCPTx:      tcpTx,
			UDPRx:      udpRx,
			UDPTx:      udpTx,
			LastUpdate: now,
		}
		return
	}

	// 计算时间间隔
	timeDiff := now.Sub(snapshot.LastUpdate)
	if timeDiff.Seconds() < 1 { // 避免过于频繁的更新
		return
	}

	// 检查数据是否有变化且合理（累积值不应该减少）
	if tcpRx >= snapshot.TCPRx && tcpTx >= snapshot.TCPTx &&
		udpRx >= snapshot.UDPRx && udpTx >= snapshot.UDPTx {

		// 添加流量结果到聚合器 - 使用当前累积值
		p.aggregator.AddTrafficResult(endpointID, instanceID, tcpRx, tcpTx, udpRx, udpTx)

		log.Debugf("添加流量结果 [%d_%s]: TCP(Rx:%d,Tx:%d) UDP(Rx:%d,Tx:%d)",
			endpointID, instanceID, tcpRx, tcpTx, udpRx, udpTx)
	} else {
		// 数据异常，可能是重启或计数器重置，更新快照但不记录速率
		log.Warnf("检测到流量数据重置 [%d_%s]: 旧值TCP(%d,%d) UDP(%d,%d) -> 新值TCP(%d,%d) UDP(%d,%d)",
			endpointID, instanceID,
			snapshot.TCPRx, snapshot.TCPTx, snapshot.UDPRx, snapshot.UDPTx,
			tcpRx, tcpTx, udpRx, udpTx)
	}

	// 更新快照
	snapshot.TCPRx = tcpRx
	snapshot.TCPTx = tcpTx
	snapshot.UDPRx = udpRx
	snapshot.UDPTx = udpTx
	snapshot.LastUpdate = now
}

// getSnapshotKey 生成快照键
func (p *SSEProcessor) getSnapshotKey(endpointID int64, instanceID string) string {
	return strconv.FormatInt(endpointID, 10) + "_" + instanceID
}

// GetTrafficTrend 获取流量趋势数据 - 替换原有接口实现
func (p *SSEProcessor) GetTrafficTrend(endpointID int64, instanceID string, hours int) ([]map[string]interface{}, error) {
	return p.aggregator.GetTrendData(endpointID, instanceID, "traffic", hours)
}

// GetPingTrend 获取延迟趋势数据 - 替换原有接口实现
func (p *SSEProcessor) GetPingTrend(endpointID int64, instanceID string, hours int) ([]map[string]interface{}, error) {
	return p.aggregator.GetTrendData(endpointID, instanceID, "ping", hours)
}

// GetPoolTrend 获取连接池趋势数据 - 替换原有接口实现
func (p *SSEProcessor) GetPoolTrend(endpointID int64, instanceID string, hours int) ([]map[string]interface{}, error) {
	return p.aggregator.GetTrendData(endpointID, instanceID, "pool", hours)
}

// CleanupOldSnapshots 清理过期的流量快照
func (p *SSEProcessor) CleanupOldSnapshots() {
	p.mu.Lock()
	defer p.mu.Unlock()

	cutoff := time.Now().Add(-1 * time.Hour) // 清理1小时前的快照

	for key, snapshot := range p.trafficSnapshots {
		if snapshot.LastUpdate.Before(cutoff) {
			delete(p.trafficSnapshots, key)
		}
	}
}

// GetAggregator 获取 Metrics 聚合器
func (p *SSEProcessor) GetAggregator() *MetricsAggregator {
	return p.aggregator
}

// GetStats 获取处理器统计信息
func (p *SSEProcessor) GetStats() map[string]interface{} {
	p.mu.RLock()
	defer p.mu.RUnlock()

	return map[string]interface{}{
		"traffic_snapshots_count": len(p.trafficSnapshots),
		"processor_name":          "SSEProcessor",
		"processor_version":       "1.0.0",
	}
}
