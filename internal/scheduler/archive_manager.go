package scheduler

import (
	"NodePassDash/internal/config"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"context"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

// ArchiveManager 数据转存管理器
type ArchiveManager struct {
	db     *gorm.DB
	config *config.CleanupConfig

	// 转存队列和批处理
	archiveQueue chan *ArchiveRecord
	batchBuffer  []*ArchiveRecord
	bufferMutex  sync.Mutex

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// 统计信息
	stats *ArchiveStats
}

// ArchiveStats 转存统计信息
type ArchiveStats struct {
	mu sync.RWMutex

	TotalArchived   int64     `json:"total_archived"`
	TrafficRecords  int64     `json:"traffic_records"`
	StatusChanges   int64     `json:"status_changes"`
	LastArchiveTime time.Time `json:"last_archive_time"`
	QueueSize       int       `json:"queue_size"`
	BufferSize      int       `json:"buffer_size"`

	// 性能统计
	BatchesProcessed  int64 `json:"batches_processed"`
	AverageBatchSize  int64 `json:"average_batch_size"`
	LastBatchDuration int64 `json:"last_batch_duration_ms"`

	// 错误统计
	ArchiveErrors    int64     `json:"archive_errors"`
	LastErrorMessage string    `json:"last_error_message"`
	LastErrorTime    time.Time `json:"last_error_time"`
}

// ArchiveRecord 转存记录
type ArchiveRecord struct {
	Type       ArchiveType            `json:"type"`
	EndpointID int64                  `json:"endpoint_id"`
	TunnelID   string                 `json:"tunnel_id,omitempty"`
	Data       map[string]interface{} `json:"data"`
	Timestamp  time.Time              `json:"timestamp"`
	MetaData   map[string]string      `json:"metadata,omitempty"`
}

// ArchiveType 转存类型
type ArchiveType string

const (
	ArchiveTypeTrafficDelta ArchiveType = "traffic_delta"
	ArchiveTypeStatusChange ArchiveType = "status_change"
	ArchiveTypePerformance  ArchiveType = "performance"
	ArchiveTypeAlert        ArchiveType = "alert"
)

// TrafficArchiveRecord 流量转存记录
type TrafficArchiveRecord struct {
	ID               int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	EndpointID       int64     `gorm:"not null;index" json:"endpoint_id"`
	TunnelID         string    `gorm:"not null;index" json:"tunnel_id"`
	RecordedAt       time.Time `gorm:"not null;index" json:"recorded_at"`
	AggregationLevel string    `gorm:"not null;size:20" json:"aggregation_level"` // hourly, daily, weekly

	// 当前流量总量
	TotalTCPRx int64 `json:"total_tcp_rx"`
	TotalTCPTx int64 `json:"total_tcp_tx"`
	TotalUDPRx int64 `json:"total_udp_rx"`
	TotalUDPTx int64 `json:"total_udp_tx"`

	// 增量流量（这个周期内的增量）
	DeltaTCPRx int64 `json:"delta_tcp_rx"`
	DeltaTCPTx int64 `json:"delta_tcp_tx"`
	DeltaUDPRx int64 `json:"delta_udp_rx"`
	DeltaUDPTx int64 `json:"delta_udp_tx"`

	// 聚合统计
	AvgThroughputRx  int64 `json:"avg_throughput_rx"`  // 平均接收速率 (bytes/s)
	AvgThroughputTx  int64 `json:"avg_throughput_tx"`  // 平均发送速率 (bytes/s)
	PeakThroughputRx int64 `json:"peak_throughput_rx"` // 峰值接收速率
	PeakThroughputTx int64 `json:"peak_throughput_tx"` // 峰值发送速率

	CreatedAt time.Time `json:"created_at"`
}

// StatusChangeRecord 状态变化记录
type StatusChangeRecord struct {
	ID         int64     `gorm:"primaryKey;autoIncrement" json:"id"`
	EndpointID int64     `gorm:"not null;index" json:"endpoint_id"`
	TunnelID   string    `gorm:"index" json:"tunnel_id,omitempty"`
	EventType  string    `gorm:"not null;size:50" json:"event_type"`
	FromStatus string    `gorm:"size:50" json:"from_status"`
	ToStatus   string    `gorm:"not null;size:50" json:"to_status"`
	Reason     string    `gorm:"size:200" json:"reason,omitempty"`
	Duration   int64     `json:"duration_ms"` // 状态持续时长(毫秒)
	EventTime  time.Time `gorm:"not null;index" json:"event_time"`
	CreatedAt  time.Time `json:"created_at"`
}

// NewArchiveManager 创建转存管理器
func NewArchiveManager(db *gorm.DB, config *config.CleanupConfig) *ArchiveManager {
	ctx, cancel := context.WithCancel(context.Background())

	am := &ArchiveManager{
		db:           db,
		config:       config,
		archiveQueue: make(chan *ArchiveRecord, config.BatchConfig.WriteQueueBufferSize),
		batchBuffer:  make([]*ArchiveRecord, 0, config.BatchConfig.BatchSize),
		ctx:          ctx,
		cancel:       cancel,
		stats:        &ArchiveStats{},
	}

	// 创建转存表
	am.createArchiveTables()

	// 启动批处理 worker
	am.startBatchWorkers()

	return am
}

// createArchiveTables 创建转存相关的表
func (am *ArchiveManager) createArchiveTables() {
	// 自动创建流量转存表
	if err := am.db.AutoMigrate(&TrafficArchiveRecord{}); err != nil {
		log.Errorf("创建流量转存表失败: %v", err)
	}

	// 自动创建状态变化记录表
	if err := am.db.AutoMigrate(&StatusChangeRecord{}); err != nil {
		log.Errorf("创建状态变化记录表失败: %v", err)
	}

	// 创建索引
	am.createIndexes()

	log.Info("转存表初始化完成")
}

// createIndexes 创建优化索引
func (am *ArchiveManager) createIndexes() {
	// 流量转存表索引
	am.db.Exec("CREATE INDEX IF NOT EXISTS idx_traffic_archive_endpoint_time ON traffic_archive_records(endpoint_id, recorded_at)")
	am.db.Exec("CREATE INDEX IF NOT EXISTS idx_traffic_archive_tunnel_time ON traffic_archive_records(tunnel_id, recorded_at)")
	am.db.Exec("CREATE INDEX IF NOT EXISTS idx_traffic_archive_aggregation ON traffic_archive_records(aggregation_level, recorded_at)")

	// 状态变化记录表索引
	am.db.Exec("CREATE INDEX IF NOT EXISTS idx_status_change_endpoint_time ON status_change_records(endpoint_id, event_time)")
	am.db.Exec("CREATE INDEX IF NOT EXISTS idx_status_change_tunnel_time ON status_change_records(tunnel_id, event_time)")
	am.db.Exec("CREATE INDEX IF NOT EXISTS idx_status_change_event_type ON status_change_records(event_type, event_time)")
}

// startBatchWorkers 启动批处理 worker
func (am *ArchiveManager) startBatchWorkers() {
	workerCount := am.config.BatchConfig.WorkerCount
	if workerCount == 0 {
		workerCount = 2
	}

	for i := 0; i < workerCount; i++ {
		am.wg.Add(1)
		go am.batchWorkerLoop(i)
	}

	// 启动定时刷新器
	am.wg.Add(1)
	go am.batchFlushLoop()

	log.Infof("转存批处理启动了 %d 个 worker", workerCount)
}

// batchWorkerLoop 批处理 worker 循环
func (am *ArchiveManager) batchWorkerLoop(workerID int) {
	defer am.wg.Done()

	log.Debugf("转存 worker %d 已启动", workerID)

	for {
		select {
		case <-am.ctx.Done():
			log.Debugf("转存 worker %d 收到停止信号", workerID)
			return

		case record := <-am.archiveQueue:
			am.addToBatch(record)

			// 如果批次达到预设大小，立即处理
			if am.shouldFlushBatch() {
				am.flushBatch()
			}
		}
	}
}

// batchFlushLoop 定时刷新批次
func (am *ArchiveManager) batchFlushLoop() {
	defer am.wg.Done()

	ticker := time.NewTicker(30 * time.Second) // 30秒强制刷新一次
	defer ticker.Stop()

	for {
		select {
		case <-am.ctx.Done():
			// 最后一次刷新
			am.flushBatch()
			return

		case <-ticker.C:
			am.flushBatch()
		}
	}
}

// addToBatch 添加记录到批次缓冲区
func (am *ArchiveManager) addToBatch(record *ArchiveRecord) {
	am.bufferMutex.Lock()
	defer am.bufferMutex.Unlock()

	am.batchBuffer = append(am.batchBuffer, record)

	am.updateStats(func(stats *ArchiveStats) {
		stats.BufferSize = len(am.batchBuffer)
	})
}

// shouldFlushBatch 检查是否应该刷新批次
func (am *ArchiveManager) shouldFlushBatch() bool {
	am.bufferMutex.Lock()
	defer am.bufferMutex.Unlock()

	return len(am.batchBuffer) >= am.config.BatchConfig.BatchSize
}

// flushBatch 刷新批次到数据库
func (am *ArchiveManager) flushBatch() {
	am.bufferMutex.Lock()
	if len(am.batchBuffer) == 0 {
		am.bufferMutex.Unlock()
		return
	}

	// 复制批次数据
	batch := make([]*ArchiveRecord, len(am.batchBuffer))
	copy(batch, am.batchBuffer)
	am.batchBuffer = am.batchBuffer[:0] // 清空缓冲区
	am.bufferMutex.Unlock()

	startTime := time.Now()

	// 批量处理记录
	err := am.processBatch(batch)
	duration := time.Since(startTime)

	// 更新统计信息
	am.updateStats(func(stats *ArchiveStats) {
		stats.BatchesProcessed++
		stats.LastBatchDuration = duration.Milliseconds()
		stats.BufferSize = 0

		if len(batch) > 0 {
			stats.AverageBatchSize = (stats.AverageBatchSize + int64(len(batch))) / 2
		}

		if err != nil {
			stats.ArchiveErrors++
			stats.LastErrorMessage = err.Error()
			stats.LastErrorTime = time.Now()
		}
	})

	if err != nil {
		log.Errorf("批量转存失败: %v, 批次大小: %d, 耗时: %v", err, len(batch), duration)
	} else {
		log.Debugf("批量转存成功: %d 条记录, 耗时: %v", len(batch), duration)
	}
}

// processBatch 处理一个批次的记录
func (am *ArchiveManager) processBatch(batch []*ArchiveRecord) error {
	// 按类型分组处理
	trafficRecords := make([]*TrafficArchiveRecord, 0)
	statusRecords := make([]*StatusChangeRecord, 0)

	for _, record := range batch {
		switch record.Type {
		case ArchiveTypeTrafficDelta:
			if tr := am.convertToTrafficRecord(record); tr != nil {
				trafficRecords = append(trafficRecords, tr)
			}

		case ArchiveTypeStatusChange:
			if sr := am.convertToStatusRecord(record); sr != nil {
				statusRecords = append(statusRecords, sr)
			}
		}
	}

	// 在事务中批量插入
	err := am.db.Transaction(func(tx *gorm.DB) error {
		// 批量插入流量记录
		if len(trafficRecords) > 0 {
			if err := tx.CreateInBatches(trafficRecords, am.config.BatchConfig.BatchSize).Error; err != nil {
				return fmt.Errorf("插入流量记录失败: %v", err)
			}
		}

		// 批量插入状态记录
		if len(statusRecords) > 0 {
			if err := tx.CreateInBatches(statusRecords, am.config.BatchConfig.BatchSize).Error; err != nil {
				return fmt.Errorf("插入状态记录失败: %v", err)
			}
		}

		return nil
	})

	if err == nil {
		am.updateStats(func(stats *ArchiveStats) {
			stats.TotalArchived += int64(len(batch))
			stats.TrafficRecords += int64(len(trafficRecords))
			stats.StatusChanges += int64(len(statusRecords))
			stats.LastArchiveTime = time.Now()
		})
	}

	return err
}

// convertToTrafficRecord 转换为流量记录
func (am *ArchiveManager) convertToTrafficRecord(record *ArchiveRecord) *TrafficArchiveRecord {
	data := record.Data

	// 提取必要字段
	totalTCPRx, _ := data["total_tcp_rx"].(int64)
	totalTCPTx, _ := data["total_tcp_tx"].(int64)
	totalUDPRx, _ := data["total_udp_rx"].(int64)
	totalUDPTx, _ := data["total_udp_tx"].(int64)

	deltaTCPRx, _ := data["delta_tcp_rx"].(int64)
	deltaTCPTx, _ := data["delta_tcp_tx"].(int64)
	deltaUDPRx, _ := data["delta_udp_rx"].(int64)
	deltaUDPTx, _ := data["delta_udp_tx"].(int64)

	return &TrafficArchiveRecord{
		EndpointID:       record.EndpointID,
		TunnelID:         record.TunnelID,
		RecordedAt:       record.Timestamp,
		AggregationLevel: am.config.ArchiveConfig.TrafficAggregationLevel,
		TotalTCPRx:       totalTCPRx,
		TotalTCPTx:       totalTCPTx,
		TotalUDPRx:       totalUDPRx,
		TotalUDPTx:       totalUDPTx,
		DeltaTCPRx:       deltaTCPRx,
		DeltaTCPTx:       deltaTCPTx,
		DeltaUDPRx:       deltaUDPRx,
		DeltaUDPTx:       deltaUDPTx,
		CreatedAt:        time.Now(),
	}
}

// convertToStatusRecord 转换为状态记录
func (am *ArchiveManager) convertToStatusRecord(record *ArchiveRecord) *StatusChangeRecord {
	data := record.Data

	eventType, _ := data["event_type"].(string)
	fromStatus, _ := data["from_status"].(string)
	toStatus, _ := data["to_status"].(string)
	reason, _ := data["reason"].(string)
	duration, _ := data["duration"].(int64)

	return &StatusChangeRecord{
		EndpointID: record.EndpointID,
		TunnelID:   record.TunnelID,
		EventType:  eventType,
		FromStatus: fromStatus,
		ToStatus:   toStatus,
		Reason:     reason,
		Duration:   duration,
		EventTime:  record.Timestamp,
		CreatedAt:  time.Now(),
	}
}

// ExecuteHourlyArchive 执行小时级转存
func (am *ArchiveManager) ExecuteHourlyArchive(ctx context.Context) error {
	log.Info("开始执行小时级转存任务")

	// 从内存服务获取当前流量快照并转存
	// 这里需要与内存服务集成，暂时使用模拟数据

	// 获取所有活跃的端点和隧道
	var endpoints []models.Endpoint
	if err := am.db.Where("status = ?", models.EndpointStatusOnline).Find(&endpoints).Error; err != nil {
		return fmt.Errorf("查询活跃端点失败: %v", err)
	}

	now := time.Now()
	hourStart := time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), 0, 0, 0, now.Location())

	for _, endpoint := range endpoints {
		// 查询该端点的所有隧道
		var tunnels []models.Tunnel
		if err := am.db.Where("endpoint_id = ?", endpoint.ID).Find(&tunnels).Error; err != nil {
			log.Errorf("查询端点 %d 的隧道失败: %v", endpoint.ID, err)
			continue
		}

		// 为每个隧道创建转存记录
		for _, tunnel := range tunnels {
			if tunnel.InstanceID == nil {
				continue
			}

			// 这里应该从内存中获取实际的流量数据
			// 暂时使用模拟数据示例
			archiveRecord := &ArchiveRecord{
				Type:       ArchiveTypeTrafficDelta,
				EndpointID: endpoint.ID,
				TunnelID:   *tunnel.InstanceID,
				Timestamp:  hourStart,
				Data: map[string]interface{}{
					"total_tcp_rx": tunnel.TCPRx,
					"total_tcp_tx": tunnel.TCPTx,
					"total_udp_rx": tunnel.UDPRx,
					"total_udp_tx": tunnel.UDPTx,
					"delta_tcp_rx": int64(0), // 应该从内存快照计算
					"delta_tcp_tx": int64(0),
					"delta_udp_rx": int64(0),
					"delta_udp_tx": int64(0),
				},
			}

			// 将记录发送到转存队列
			select {
			case am.archiveQueue <- archiveRecord:
				// 成功入队
			default:
				log.Warnf("转存队列已满，跳过端点 %d 隧道 %s 的记录", endpoint.ID, *tunnel.InstanceID)
			}
		}
	}

	log.Infof("小时级转存任务完成，处理了 %d 个端点", len(endpoints))
	return nil
}

// ArchiveStatusChange 转存状态变化
func (am *ArchiveManager) ArchiveStatusChange(endpointID int64, tunnelID string, eventType, fromStatus, toStatus, reason string, duration int64) {
	record := &ArchiveRecord{
		Type:       ArchiveTypeStatusChange,
		EndpointID: endpointID,
		TunnelID:   tunnelID,
		Timestamp:  time.Now(),
		Data: map[string]interface{}{
			"event_type":  eventType,
			"from_status": fromStatus,
			"to_status":   toStatus,
			"reason":      reason,
			"duration":    duration,
		},
	}

	// 非阻塞发送
	select {
	case am.archiveQueue <- record:
		// 成功入队
	default:
		log.Warnf("转存队列已满，状态变化记录被丢弃: endpoint=%d, tunnel=%s", endpointID, tunnelID)
	}
}

// GetStats 获取转存统计信息
func (am *ArchiveManager) GetStats() map[string]interface{} {
	am.stats.mu.RLock()
	defer am.stats.mu.RUnlock()

	return map[string]interface{}{
		"total_archived":      am.stats.TotalArchived,
		"traffic_records":     am.stats.TrafficRecords,
		"status_changes":      am.stats.StatusChanges,
		"last_archive_time":   am.stats.LastArchiveTime.Format("2006-01-02 15:04:05"),
		"queue_size":          len(am.archiveQueue),
		"buffer_size":         am.stats.BufferSize,
		"batches_processed":   am.stats.BatchesProcessed,
		"average_batch_size":  am.stats.AverageBatchSize,
		"last_batch_duration": am.stats.LastBatchDuration,
		"archive_errors":      am.stats.ArchiveErrors,
		"last_error_message":  am.stats.LastErrorMessage,
		"last_error_time":     am.stats.LastErrorTime.Format("2006-01-02 15:04:05"),
	}
}

// updateStats 线程安全地更新统计信息
func (am *ArchiveManager) updateStats(updater func(*ArchiveStats)) {
	am.stats.mu.Lock()
	defer am.stats.mu.Unlock()
	updater(am.stats)
}

// Close 关闭转存管理器
func (am *ArchiveManager) Close() {
	log.Info("正在关闭转存管理器")

	// 停止所有 worker
	am.cancel()
	am.wg.Wait()

	// 最后一次刷新批次
	am.flushBatch()

	log.Info("转存管理器已关闭")
}
