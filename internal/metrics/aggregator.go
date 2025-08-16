package metrics

import (
	log "NodePassDash/internal/log"
	"context"
	"fmt"
	"math"
	"sync"
	"time"

	"gorm.io/gorm"
)

// MetricsAggregator 类似 Nezha 的 servicesentinel，负责实时延迟计算和批量聚合
type MetricsAggregator struct {
	db *gorm.DB

	// 实时状态数据 - 类似 serviceTaskStatus
	taskStatuses map[string]*TaskStatus // key: "endpointID_instanceID"
	statusMutex  sync.RWMutex

	// 批量聚合配置
	maxCurrentStatusSize int           // 类似 _CurrentStatusSize
	aggregationWindow    time.Duration // 时间窗口
	avgPingCount         int           // Ping 聚合数量

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// TaskStatus 类似 Nezha 的 serviceTaskStatus，存储当前累积状态
type TaskStatus struct {
	EndpointID int64  `json:"endpoint_id"`
	InstanceID string `json:"instance_id"`

	// Ping 延迟统计 - 参考 servicesentinel.go:205-206
	PingResults  []PingResult `json:"ping_results"`
	SuccessCount int          `json:"success_count"`
	FailureCount int          `json:"failure_count"`
	AvgPing      float64      `json:"avg_ping"` // 当前累积平均延迟

	// 连接池统计
	PoolResults []PoolResult `json:"pool_results"`
	AvgPool     float64      `json:"avg_pool"` // 当前累积平均连接数

	// 流量统计 (累积值，用于计算速率)
	TrafficResults []TrafficResult `json:"traffic_results"`

	// 时间戳
	FirstDataTime time.Time `json:"first_data_time"`
	LastDataTime  time.Time `json:"last_data_time"`

	// 互斥锁保护
	mu sync.RWMutex `json:"-"`
}

// PingResult 单次 Ping 结果
type PingResult struct {
	Latency   float64   `json:"latency"`   // 延迟时间 (ms)
	Success   bool      `json:"success"`   // 是否成功
	Timestamp time.Time `json:"timestamp"` // 记录时间
}

// PoolResult 单次连接池结果
type PoolResult struct {
	Count     int       `json:"count"`     // 连接数
	Timestamp time.Time `json:"timestamp"` // 记录时间
}

// TrafficResult 单次流量结果
type TrafficResult struct {
	TCPRx     int64     `json:"tcp_rx"`
	TCPTx     int64     `json:"tcp_tx"`
	UDPRx     int64     `json:"udp_rx"`
	UDPTx     int64     `json:"udp_tx"`
	Timestamp time.Time `json:"timestamp"`
}

// MinuteMetrics 分钟级聚合指标表 - 类似 service_history
type MinuteMetrics struct {
	ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	EndpointID int64     `gorm:"not null;index:idx_endpoint_time" json:"endpoint_id"`
	InstanceID string    `gorm:"not null;size:64;index:idx_instance_time" json:"instance_id"`
	MetricTime time.Time `gorm:"not null;index:idx_endpoint_time,priority:2;index:idx_instance_time,priority:2;index:idx_time" json:"metric_time"`

	// Ping 延迟指标 - 类似 AvgDelay
	AvgPing     float64 `gorm:"default:0" json:"avg_ping"`     // 平均延迟 (ms)
	MinPing     float64 `gorm:"default:0" json:"min_ping"`     // 最小延迟 (ms)
	MaxPing     float64 `gorm:"default:0" json:"max_ping"`     // 最大延迟 (ms)
	PingCount   int     `gorm:"default:0" json:"ping_count"`   // Ping 次数
	SuccessRate float64 `gorm:"default:0" json:"success_rate"` // 成功率 (%)

	// 连接池指标
	AvgPool   float64 `gorm:"default:0" json:"avg_pool"`   // 平均连接数
	MinPool   float64 `gorm:"default:0" json:"min_pool"`   // 最小连接数
	MaxPool   float64 `gorm:"default:0" json:"max_pool"`   // 最大连接数
	PoolCount int     `gorm:"default:0" json:"pool_count"` // 连接池记录次数

	// 流量速率指标 (bytes/min)
	AvgTCPRxRate float64 `gorm:"default:0" json:"avg_tcp_rx_rate"` // TCP接收速率
	AvgTCPTxRate float64 `gorm:"default:0" json:"avg_tcp_tx_rate"` // TCP发送速率
	AvgUDPRxRate float64 `gorm:"default:0" json:"avg_udp_rx_rate"` // UDP接收速率
	AvgUDPTxRate float64 `gorm:"default:0" json:"avg_udp_tx_rate"` // UDP发送速率
	TrafficCount int     `gorm:"default:0" json:"traffic_count"`   // 流量记录次数

	CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updated_at"`
}

// TableName 设置表名
func (MinuteMetrics) TableName() string {
	return "minute_metrics"
}

// NewMetricsAggregator 创建指标聚合器
func NewMetricsAggregator(db *gorm.DB) *MetricsAggregator {
	ctx, cancel := context.WithCancel(context.Background())

	a := &MetricsAggregator{
		db:                   db,
		taskStatuses:         make(map[string]*TaskStatus),
		maxCurrentStatusSize: 50,               // 参考 _CurrentStatusSize
		aggregationWindow:    30 * time.Second, // 30秒时间窗口
		avgPingCount:         10,               // 参考 AvgPingCount
		ctx:                  ctx,
		cancel:               cancel,
	}

	// 确保表存在
	if err := a.ensureTables(); err != nil {
		log.Errorf("创建指标聚合表失败: %v", err)
	}

	// 启动聚合处理器
	a.startAggregationWorker()

	return a
}

// ensureTables 确保指标聚合表存在
func (a *MetricsAggregator) ensureTables() error {
	if err := a.db.AutoMigrate(&MinuteMetrics{}); err != nil {
		return err
	}

	// 创建优化索引
	a.createOptimizedIndexes()

	log.Info("指标聚合表初始化完成")
	return nil
}

// createOptimizedIndexes 创建优化索引
func (a *MetricsAggregator) createOptimizedIndexes() {
	// 复合索引用于快速查询
	a.db.Exec("CREATE INDEX IF NOT EXISTS idx_minute_metrics_endpoint_time ON minute_metrics(endpoint_id, metric_time DESC)")
	a.db.Exec("CREATE INDEX IF NOT EXISTS idx_minute_metrics_instance_time ON minute_metrics(instance_id, metric_time DESC)")
	a.db.Exec("CREATE INDEX IF NOT EXISTS idx_minute_metrics_time_only ON minute_metrics(metric_time DESC)")
}

// AddPingResult 添加 Ping 结果 - 参考 servicesentinel.go:438-441
func (a *MetricsAggregator) AddPingResult(endpointID int64, instanceID string, latency float64, success bool) {
	key := a.getTaskKey(endpointID, instanceID)

	a.statusMutex.RLock()
	status, exists := a.taskStatuses[key]
	a.statusMutex.RUnlock()

	if !exists {
		status = a.initTaskStatus(endpointID, instanceID)
	}

	status.mu.Lock()
	defer status.mu.Unlock()

	now := time.Now()

	// 添加新的 Ping 结果
	result := PingResult{
		Latency:   latency,
		Success:   success,
		Timestamp: now,
	}

	status.PingResults = append(status.PingResults, result)
	status.LastDataTime = now

	if status.FirstDataTime.IsZero() {
		status.FirstDataTime = now
	}

	// 更新成功/失败计数
	if success {
		status.SuccessCount++

		// 计算累积平均延迟 - 使用 Nezha 的加权平均算法
		// 公式: (旧平均值*成功次数 + 新延迟) / (成功次数+1)
		if status.SuccessCount == 1 {
			status.AvgPing = latency
		} else {
			status.AvgPing = (status.AvgPing*float64(status.SuccessCount-1) + latency) / float64(status.SuccessCount)
		}
	} else {
		status.FailureCount++
	}

	// 限制结果数组大小 - 避免内存溢出
	if len(status.PingResults) > a.maxCurrentStatusSize {
		status.PingResults = status.PingResults[len(status.PingResults)-a.maxCurrentStatusSize:]
	}

	// 检查是否需要触发聚合存储
	if a.shouldTriggerAggregation(status) {
		go a.triggerAggregation(key, status)
	}
}

// AddPoolResult 添加连接池结果
func (a *MetricsAggregator) AddPoolResult(endpointID int64, instanceID string, poolCount int) {
	key := a.getTaskKey(endpointID, instanceID)

	a.statusMutex.RLock()
	status, exists := a.taskStatuses[key]
	a.statusMutex.RUnlock()

	if !exists {
		status = a.initTaskStatus(endpointID, instanceID)
	}

	status.mu.Lock()
	defer status.mu.Unlock()

	now := time.Now()

	// 添加新的连接池结果
	result := PoolResult{
		Count:     poolCount,
		Timestamp: now,
	}

	status.PoolResults = append(status.PoolResults, result)
	status.LastDataTime = now

	if status.FirstDataTime.IsZero() {
		status.FirstDataTime = now
	}

	// 计算累积平均连接数
	if len(status.PoolResults) == 1 {
		status.AvgPool = float64(poolCount)
	} else {
		// 重新计算所有连接池记录的平均值
		totalPool := 0
		for _, r := range status.PoolResults {
			totalPool += r.Count
		}
		status.AvgPool = float64(totalPool) / float64(len(status.PoolResults))
	}

	// 限制结果数组大小
	if len(status.PoolResults) > a.maxCurrentStatusSize {
		status.PoolResults = status.PoolResults[len(status.PoolResults)-a.maxCurrentStatusSize:]
	}

	// 检查是否需要触发聚合存储
	if a.shouldTriggerAggregation(status) {
		go a.triggerAggregation(key, status)
	}
}

// AddTrafficResult 添加流量结果
func (a *MetricsAggregator) AddTrafficResult(endpointID int64, instanceID string, tcpRx, tcpTx, udpRx, udpTx int64) {
	key := a.getTaskKey(endpointID, instanceID)

	a.statusMutex.RLock()
	status, exists := a.taskStatuses[key]
	a.statusMutex.RUnlock()

	if !exists {
		status = a.initTaskStatus(endpointID, instanceID)
	}

	status.mu.Lock()
	defer status.mu.Unlock()

	now := time.Now()

	// 添加新的流量结果
	result := TrafficResult{
		TCPRx:     tcpRx,
		TCPTx:     tcpTx,
		UDPRx:     udpRx,
		UDPTx:     udpTx,
		Timestamp: now,
	}

	status.TrafficResults = append(status.TrafficResults, result)
	status.LastDataTime = now

	if status.FirstDataTime.IsZero() {
		status.FirstDataTime = now
	}

	// 限制结果数组大小
	if len(status.TrafficResults) > a.maxCurrentStatusSize {
		status.TrafficResults = status.TrafficResults[len(status.TrafficResults)-a.maxCurrentStatusSize:]
	}

	// 检查是否需要触发聚合存储
	if a.shouldTriggerAggregation(status) {
		go a.triggerAggregation(key, status)
	}
}

// shouldTriggerAggregation 检查是否应该触发聚合 - 参考 servicesentinel.go:486-487
func (a *MetricsAggregator) shouldTriggerAggregation(status *TaskStatus) bool {
	// 数据点数量触发
	totalResults := len(status.PingResults) + len(status.PoolResults) + len(status.TrafficResults)
	if totalResults >= a.maxCurrentStatusSize {
		return true
	}

	// 时间窗口触发 - 参考 servicesentinel.go:452-454
	if !status.FirstDataTime.IsZero() && time.Since(status.FirstDataTime) >= a.aggregationWindow {
		return true
	}

	return false
}

// triggerAggregation 触发聚合存储 - 参考 servicesentinel.go:489-497
func (a *MetricsAggregator) triggerAggregation(key string, status *TaskStatus) {
	defer func() {
		if r := recover(); r != nil {
			log.Errorf("聚合存储异常: %v", r)
		}
	}()

	status.mu.Lock()

	// 复制数据避免长时间持锁
	endpointID := status.EndpointID
	instanceID := status.InstanceID
	pingResults := make([]PingResult, len(status.PingResults))
	copy(pingResults, status.PingResults)
	poolResults := make([]PoolResult, len(status.PoolResults))
	copy(poolResults, status.PoolResults)
	trafficResults := make([]TrafficResult, len(status.TrafficResults))
	copy(trafficResults, status.TrafficResults)

	// 重置状态数据 - 类似 servicesentinel.go:501
	status.PingResults = status.PingResults[:0]
	status.PoolResults = status.PoolResults[:0]
	status.TrafficResults = status.TrafficResults[:0]
	status.SuccessCount = 0
	status.FailureCount = 0
	status.AvgPing = 0
	status.AvgPool = 0
	status.FirstDataTime = time.Time{}

	status.mu.Unlock()

	// 计算分钟级聚合指标并存储
	if err := a.calculateAndStoreMetrics(endpointID, instanceID, pingResults, poolResults, trafficResults); err != nil {
		log.Errorf("聚合指标计算失败 [%d_%s]: %v", endpointID, instanceID, err)
	}
}

// calculateAndStoreMetrics 计算并存储分钟级指标
func (a *MetricsAggregator) calculateAndStoreMetrics(endpointID int64, instanceID string,
	pingResults []PingResult, poolResults []PoolResult, trafficResults []TrafficResult) error {

	now := time.Now()
	minuteTime := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), now.Minute(), 0, 0, now.Location())

	metrics := &MinuteMetrics{
		EndpointID: endpointID,
		InstanceID: instanceID,
		MetricTime: minuteTime,
	}

	// 计算 Ping 指标
	if len(pingResults) > 0 {
		metrics.PingCount = len(pingResults)

		var totalLatency, minPing, maxPing float64 = 0, math.MaxFloat64, 0
		var successCount int

		for _, result := range pingResults {
			if result.Success {
				successCount++
				totalLatency += result.Latency
				if result.Latency < minPing {
					minPing = result.Latency
				}
				if result.Latency > maxPing {
					maxPing = result.Latency
				}
			}
		}

		if successCount > 0 {
			metrics.AvgPing = totalLatency / float64(successCount)
			metrics.MinPing = minPing
			metrics.MaxPing = maxPing
			metrics.SuccessRate = float64(successCount) / float64(len(pingResults)) * 100
		}
	}

	// 计算连接池指标
	if len(poolResults) > 0 {
		metrics.PoolCount = len(poolResults)

		var totalPool int
		var minPool, maxPool float64 = math.MaxFloat64, 0

		for _, result := range poolResults {
			totalPool += result.Count
			poolFloat := float64(result.Count)
			if poolFloat < minPool {
				minPool = poolFloat
			}
			if poolFloat > maxPool {
				maxPool = poolFloat
			}
		}

		metrics.AvgPool = float64(totalPool) / float64(len(poolResults))
		metrics.MinPool = minPool
		metrics.MaxPool = maxPool
	}

	// 计算流量速率指标 (bytes/minute)
	if len(trafficResults) > 0 {
		metrics.TrafficCount = len(trafficResults)

		// 计算时间范围内的平均速率
		if len(trafficResults) > 1 {
			first := trafficResults[0]
			last := trafficResults[len(trafficResults)-1]

			timeDiff := last.Timestamp.Sub(first.Timestamp).Minutes()
			if timeDiff > 0 {
				metrics.AvgTCPRxRate = float64(last.TCPRx-first.TCPRx) / timeDiff
				metrics.AvgTCPTxRate = float64(last.TCPTx-first.TCPTx) / timeDiff
				metrics.AvgUDPRxRate = float64(last.UDPRx-first.UDPRx) / timeDiff
				metrics.AvgUDPTxRate = float64(last.UDPTx-first.UDPTx) / timeDiff
			}
		}
	}

	// 使用 UPSERT 存储到数据库 - 类似 service.go:100-104
	err := a.db.Where("endpoint_id = ? AND instance_id = ? AND metric_time = ?",
		endpointID, instanceID, minuteTime).
		Assign(metrics).
		FirstOrCreate(metrics).Error

	if err != nil {
		return err
	}

	log.Debugf("聚合指标已存储 [%d_%s]: Ping平均=%.2fms, 连接池平均=%.1f",
		endpointID, instanceID, metrics.AvgPing, metrics.AvgPool)

	return nil
}

// GetTrendData 获取趋势数据 - 参考 service.go:121-122
func (a *MetricsAggregator) GetTrendData(endpointID int64, instanceID string, metricType string, hours int) ([]map[string]interface{}, error) {
	startTime := time.Now().Add(-time.Duration(hours) * time.Hour)

	var metrics []MinuteMetrics
	query := a.db.Where("endpoint_id = ? AND instance_id = ? AND metric_time >= ?",
		endpointID, instanceID, startTime).
		Order("metric_time ASC")

	if err := query.Find(&metrics).Error; err != nil {
		return nil, err
	}

	result := make([]map[string]interface{}, len(metrics))

	for i, metric := range metrics {
		data := map[string]interface{}{
			"eventTime": metric.MetricTime.Format("2006-01-02 15:04"),
		}

		switch metricType {
		case "ping":
			data["ping"] = metric.AvgPing
			data["minPing"] = metric.MinPing
			data["maxPing"] = metric.MaxPing
			data["successRate"] = metric.SuccessRate

		case "pool":
			data["pool"] = metric.AvgPool
			data["minPool"] = metric.MinPool
			data["maxPool"] = metric.MaxPool

		case "traffic":
			data["tcpRxRate"] = metric.AvgTCPRxRate
			data["tcpTxRate"] = metric.AvgTCPTxRate
			data["udpRxRate"] = metric.AvgUDPRxRate
			data["udpTxRate"] = metric.AvgUDPTxRate
		}

		result[i] = data
	}

	return result, nil
}

// 辅助方法
func (a *MetricsAggregator) getTaskKey(endpointID int64, instanceID string) string {
	return fmt.Sprintf("%d_%s", endpointID, instanceID)
}

func (a *MetricsAggregator) initTaskStatus(endpointID int64, instanceID string) *TaskStatus {
	key := a.getTaskKey(endpointID, instanceID)

	status := &TaskStatus{
		EndpointID:     endpointID,
		InstanceID:     instanceID,
		PingResults:    make([]PingResult, 0, a.maxCurrentStatusSize),
		PoolResults:    make([]PoolResult, 0, a.maxCurrentStatusSize),
		TrafficResults: make([]TrafficResult, 0, a.maxCurrentStatusSize),
	}

	a.statusMutex.Lock()
	a.taskStatuses[key] = status
	a.statusMutex.Unlock()

	return status
}

// startAggregationWorker 启动聚合工作器
func (a *MetricsAggregator) startAggregationWorker() {
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()

		ticker := time.NewTicker(a.aggregationWindow)
		defer ticker.Stop()

		for {
			select {
			case <-a.ctx.Done():
				return
			case <-ticker.C:
				a.periodicAggregation()
			}
		}
	}()

	log.Info("指标聚合工作器已启动")
}

// periodicAggregation 定期聚合处理
func (a *MetricsAggregator) periodicAggregation() {
	a.statusMutex.RLock()
	keys := make([]string, 0, len(a.taskStatuses))
	for key := range a.taskStatuses {
		keys = append(keys, key)
	}
	a.statusMutex.RUnlock()

	for _, key := range keys {
		a.statusMutex.RLock()
		status := a.taskStatuses[key]
		a.statusMutex.RUnlock()

		if status != nil && a.shouldTriggerAggregation(status) {
			go a.triggerAggregation(key, status)
		}
	}
}

// DB 获取数据库连接
func (a *MetricsAggregator) DB() *gorm.DB {
	return a.db
}

// Close 关闭聚合器
func (a *MetricsAggregator) Close() {
	log.Info("正在关闭指标聚合器")

	// 最后一次强制聚合
	a.periodicAggregation()

	a.cancel()
	a.wg.Wait()

	log.Info("指标聚合器已关闭")
}
