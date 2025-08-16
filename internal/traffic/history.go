package traffic

import (
	log "NodePassDash/internal/log"
	"context"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

// HistoryRecord 流量历史记录
type HistoryRecord struct {
	ID         int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	EndpointID int64  `json:"endpointId" gorm:"not null;index"`
	InstanceID string `json:"instanceId" gorm:"type:text;not null;index"`

	// 时间戳（按小时聚合）
	Timestamp time.Time `json:"timestamp" gorm:"not null;index"`

	// 流量差值（该小时内的增量）
	TCPRxDelta int64 `json:"tcpRxDelta" gorm:"default:0"`
	TCPTxDelta int64 `json:"tcpTxDelta" gorm:"default:0"`
	UDPRxDelta int64 `json:"udpRxDelta" gorm:"default:0"`
	UDPTxDelta int64 `json:"udpTxDelta" gorm:"default:0"`

	// 绝对值（该小时结束时的值）
	TCPRxTotal int64 `json:"tcpRxTotal" gorm:"default:0"`
	TCPTxTotal int64 `json:"tcpTxTotal" gorm:"default:0"`
	UDPRxTotal int64 `json:"udpRxTotal" gorm:"default:0"`
	UDPTxTotal int64 `json:"udpTxTotal" gorm:"default:0"`

	// 统计信息
	SampleCount int `json:"sampleCount" gorm:"default:1"` // 该小时内的样本数量

	CreatedAt time.Time `json:"createdAt" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updatedAt" gorm:"autoUpdateTime"`
}

// TableName 设置表名
func (HistoryRecord) TableName() string {
	return "traffic_history"
}

// HistoryManager 流量历史管理器
type HistoryManager struct {
	db *gorm.DB

	// 批量写入缓冲区
	buffer     []HistoryRecord
	bufferMu   sync.Mutex
	bufferSize int

	// 写入通道
	writeChan chan HistoryRecord

	// 清理配置
	retentionDays int          // 数据保留天数
	cleanupTicker *time.Ticker // 清理定时器

	// 聚合缓存（按小时）
	aggregateCache map[string]*HistoryRecord // key: "endpointID_instanceID_hour"
	aggregateMu    sync.RWMutex

	// 转存统计
	stats      *HistoryStats
	statsMutex sync.RWMutex

	// 控制
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// HistoryStats 历史管理器统计信息
type HistoryStats struct {
	TotalPointsReceived int64     `json:"total_points_received"`
	TotalRecordsWritten int64     `json:"total_records_written"`
	BatchesProcessed    int64     `json:"batches_processed"`
	CacheHits           int64     `json:"cache_hits"`
	CacheMisses         int64     `json:"cache_misses"`
	LastWriteTime       time.Time `json:"last_write_time"`
	WriteErrors         int64     `json:"write_errors"`
	LastErrorMessage    string    `json:"last_error_message"`
	LastErrorTime       time.Time `json:"last_error_time"`
}

// NewHistoryManager 创建流量历史管理器
func NewHistoryManager(db *gorm.DB) *HistoryManager {
	ctx, cancel := context.WithCancel(context.Background())

	hm := &HistoryManager{
		db:             db,
		bufferSize:     100, // 批量写入大小
		writeChan:      make(chan HistoryRecord, 1000),
		retentionDays:  30, // 默认保留30天
		aggregateCache: make(map[string]*HistoryRecord),
		stats:          &HistoryStats{},
		ctx:            ctx,
		cancel:         cancel,
	}

	// 确保表存在
	if err := hm.ensureTable(); err != nil {
		log.Errorf("创建流量历史表失败: %v", err)
	}

	// 启动处理器
	hm.startProcessors()

	return hm
}

// ensureTable 确保流量历史表存在
func (hm *HistoryManager) ensureTable() error {
	return hm.db.AutoMigrate(&HistoryRecord{})
}

// AddTrafficPoint 添加流量数据点
func (hm *HistoryManager) AddTrafficPoint(endpointID int64, instanceID string,
	tcpRx, tcpTx, udpRx, udpTx int64, deltaRx, deltaTx, deltaUDPRx, deltaUDPTx int64) {

	// 更新统计信息
	hm.updateStats(func(stats *HistoryStats) {
		stats.TotalPointsReceived++
	})

	// 按小时聚合
	hourTimestamp := time.Now().Truncate(time.Hour)
	cacheKey := hm.makeCacheKey(endpointID, instanceID, hourTimestamp)

	hm.aggregateMu.Lock()
	defer hm.aggregateMu.Unlock()

	if existing, exists := hm.aggregateCache[cacheKey]; exists {
		// 缓存命中
		hm.updateStats(func(stats *HistoryStats) {
			stats.CacheHits++
		})

		// 累加增量数据
		existing.TCPRxDelta += deltaRx
		existing.TCPTxDelta += deltaTx
		existing.UDPRxDelta += deltaUDPRx
		existing.UDPTxDelta += deltaUDPTx

		// 更新绝对值
		existing.TCPRxTotal = tcpRx
		existing.TCPTxTotal = tcpTx
		existing.UDPRxTotal = udpRx
		existing.UDPTxTotal = udpTx

		existing.SampleCount++
		existing.UpdatedAt = time.Now()
	} else {
		// 缓存未命中
		hm.updateStats(func(stats *HistoryStats) {
			stats.CacheMisses++
		})

		// 创建新记录
		record := HistoryRecord{
			EndpointID:  endpointID,
			InstanceID:  instanceID,
			Timestamp:   hourTimestamp,
			TCPRxDelta:  deltaRx,
			TCPTxDelta:  deltaTx,
			UDPRxDelta:  deltaUDPRx,
			UDPTxDelta:  deltaUDPTx,
			TCPRxTotal:  tcpRx,
			TCPTxTotal:  tcpTx,
			UDPRxTotal:  udpRx,
			UDPTxTotal:  udpTx,
			SampleCount: 1,
		}
		hm.aggregateCache[cacheKey] = &record
	}
}

// FlushAggregateCache 刷新聚合缓存到写入队列
func (hm *HistoryManager) FlushAggregateCache() {
	hm.aggregateMu.Lock()
	defer hm.aggregateMu.Unlock()

	for key, record := range hm.aggregateCache {
		// 发送到写入队列
		select {
		case hm.writeChan <- *record:
			delete(hm.aggregateCache, key)
		default:
			// 写入队列满，保留在缓存中
			log.Warnf("流量历史写入队列已满，保留缓存记录: %s", key)
		}
	}

	log.Debugf("已刷新 %d 条聚合记录到写入队列", len(hm.aggregateCache))
}

// startProcessors 启动处理器
func (hm *HistoryManager) startProcessors() {
	// 启动写入处理器
	hm.wg.Add(1)
	go hm.writeProcessor()

	// 启动定期刷新处理器
	hm.wg.Add(1)
	go hm.flushProcessor()

	// 启动清理处理器
	hm.wg.Add(1)
	go hm.cleanupProcessor()

	log.Info("流量历史处理器已启动")
}

// writeProcessor 批量写入处理器
func (hm *HistoryManager) writeProcessor() {
	defer hm.wg.Done()

	ticker := time.NewTicker(30 * time.Second) // 每30秒批量写入一次
	defer ticker.Stop()

	for {
		select {
		case <-hm.ctx.Done():
			// 处理剩余缓冲区中的数据
			hm.flushBuffer()
			return
		case record := <-hm.writeChan:
			hm.bufferMu.Lock()
			hm.buffer = append(hm.buffer, record)
			shouldFlush := len(hm.buffer) >= hm.bufferSize
			hm.bufferMu.Unlock()

			if shouldFlush {
				hm.flushBuffer()
			}
		case <-ticker.C:
			hm.flushBuffer()
		}
	}
}

// flushBuffer 刷新缓冲区
func (hm *HistoryManager) flushBuffer() {
	hm.bufferMu.Lock()
	if len(hm.buffer) == 0 {
		hm.bufferMu.Unlock()
		return
	}

	toWrite := make([]HistoryRecord, len(hm.buffer))
	copy(toWrite, hm.buffer)
	hm.buffer = hm.buffer[:0] // 清空缓冲区
	hm.bufferMu.Unlock()

	// 批量写入数据库
	if err := hm.batchWrite(toWrite); err != nil {
		log.Errorf("批量写入流量历史失败: %v", err)
		// 可以考虑重试机制
	} else {
		log.Debugf("成功写入 %d 条流量历史记录", len(toWrite))
	}
}

// batchWrite 批量写入数据库
func (hm *HistoryManager) batchWrite(records []HistoryRecord) error {
	// 使用 INSERT ... ON DUPLICATE KEY UPDATE 或类似机制
	err := hm.db.Transaction(func(tx *gorm.DB) error {
		for _, record := range records {
			// 检查是否已存在该小时的记录
			var existing HistoryRecord
			err := tx.Where("endpoint_id = ? AND instance_id = ? AND timestamp = ?",
				record.EndpointID, record.InstanceID, record.Timestamp).First(&existing).Error

			if err == gorm.ErrRecordNotFound {
				// 插入新记录
				if err := tx.Create(&record).Error; err != nil {
					return err
				}
			} else if err == nil {
				// 更新现有记录（累加增量）
				updates := map[string]interface{}{
					"tcp_rx_delta": existing.TCPRxDelta + record.TCPRxDelta,
					"tcp_tx_delta": existing.TCPTxDelta + record.TCPTxDelta,
					"udp_rx_delta": existing.UDPRxDelta + record.UDPRxDelta,
					"udp_tx_delta": existing.UDPTxDelta + record.UDPTxDelta,
					"tcp_rx_total": record.TCPRxTotal, // 使用最新的绝对值
					"tcp_tx_total": record.TCPTxTotal,
					"udp_rx_total": record.UDPRxTotal,
					"udp_tx_total": record.UDPTxTotal,
					"sample_count": existing.SampleCount + record.SampleCount,
					"updated_at":   time.Now(),
				}

				if err := tx.Model(&existing).Updates(updates).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		}
		return nil
	})

	// 更新统计信息
	if err != nil {
		hm.updateStats(func(stats *HistoryStats) {
			stats.WriteErrors++
			stats.LastErrorMessage = err.Error()
			stats.LastErrorTime = time.Now()
		})
	} else {
		hm.updateStats(func(stats *HistoryStats) {
			stats.TotalRecordsWritten += int64(len(records))
			stats.BatchesProcessed++
			stats.LastWriteTime = time.Now()
		})
	}

	return err
}

// flushProcessor 定期刷新聚合缓存
func (hm *HistoryManager) flushProcessor() {
	defer hm.wg.Done()

	ticker := time.NewTicker(5 * time.Minute) // 每5分钟刷新一次聚合缓存
	defer ticker.Stop()

	for {
		select {
		case <-hm.ctx.Done():
			// 最后一次刷新
			hm.FlushAggregateCache()
			return
		case <-ticker.C:
			hm.FlushAggregateCache()
		}
	}
}

// cleanupProcessor 清理过期数据
func (hm *HistoryManager) cleanupProcessor() {
	defer hm.wg.Done()

	// 每天凌晨2点清理一次
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	// 立即执行一次清理
	hm.cleanupOldRecords()

	for {
		select {
		case <-hm.ctx.Done():
			return
		case <-ticker.C:
			hm.cleanupOldRecords()
		}
	}
}

// cleanupOldRecords 清理过期记录
func (hm *HistoryManager) cleanupOldRecords() {
	cutoffTime := time.Now().AddDate(0, 0, -hm.retentionDays)

	result := hm.db.Where("timestamp < ?", cutoffTime).Delete(&HistoryRecord{})
	if result.Error != nil {
		log.Errorf("清理过期流量历史记录失败: %v", result.Error)
	} else if result.RowsAffected > 0 {
		log.Infof("已清理 %d 条过期流量历史记录", result.RowsAffected)
	}
}

// GetTrafficTrend 获取流量趋势数据
func (hm *HistoryManager) GetTrafficTrend(endpointID int64, instanceID string, hours int) ([]HistoryRecord, error) {
	var records []HistoryRecord

	startTime := time.Now().Add(-time.Duration(hours) * time.Hour).Truncate(time.Hour)

	query := hm.db.Where("endpoint_id = ? AND timestamp >= ?", endpointID, startTime).
		Order("timestamp ASC")

	if instanceID != "" {
		query = query.Where("instance_id = ?", instanceID)
	}

	if err := query.Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

// GetEndpointTrafficTrend 获取端点的所有隧道流量趋势（聚合）
func (hm *HistoryManager) GetEndpointTrafficTrend(endpointID int64, hours int) ([]map[string]interface{}, error) {
	startTime := time.Now().Add(-time.Duration(hours) * time.Hour).Truncate(time.Hour)

	// 按小时聚合所有隧道的流量
	var results []map[string]interface{}

	err := hm.db.Raw(`
		SELECT 
			timestamp,
			SUM(tcp_rx_delta) as tcp_rx_delta,
			SUM(tcp_tx_delta) as tcp_tx_delta,
			SUM(udp_rx_delta) as udp_rx_delta,
			SUM(udp_tx_delta) as udp_tx_delta,
			SUM(tcp_rx_total) as tcp_rx_total,
			SUM(tcp_tx_total) as tcp_tx_total,
			SUM(udp_rx_total) as udp_rx_total,
			SUM(udp_tx_total) as udp_tx_total,
			COUNT(*) as tunnel_count
		FROM traffic_history 
		WHERE endpoint_id = ? AND timestamp >= ?
		GROUP BY timestamp
		ORDER BY timestamp ASC
	`, endpointID, startTime).Scan(&results).Error

	return results, err
}

// makeCacheKey 生成缓存键
func (hm *HistoryManager) makeCacheKey(endpointID int64, instanceID string, timestamp time.Time) string {
	return fmt.Sprintf("%d_%s_%d", endpointID, instanceID, timestamp.Unix())
}

// SetRetentionDays 设置数据保留天数
func (hm *HistoryManager) SetRetentionDays(days int) {
	if days > 0 && days <= 365 { // 最多保留一年
		hm.retentionDays = days
		log.Infof("流量历史数据保留期已设置为 %d 天", days)
	}
}

// updateStats 线程安全地更新统计信息
func (hm *HistoryManager) updateStats(updater func(*HistoryStats)) {
	hm.statsMutex.Lock()
	defer hm.statsMutex.Unlock()
	updater(hm.stats)
}

// GetStats 获取统计信息
func (hm *HistoryManager) GetStats() map[string]interface{} {
	hm.aggregateMu.RLock()
	cacheSize := len(hm.aggregateCache)
	hm.aggregateMu.RUnlock()

	hm.bufferMu.Lock()
	bufferSize := len(hm.buffer)
	hm.bufferMu.Unlock()

	// 获取数据库中的记录总数
	var totalRecords int64
	hm.db.Model(&HistoryRecord{}).Count(&totalRecords)

	// 获取最老的记录时间
	var oldestRecord HistoryRecord
	hm.db.Order("timestamp ASC").First(&oldestRecord)

	// 获取统计信息
	hm.statsMutex.RLock()
	statsSnapshot := *hm.stats
	hm.statsMutex.RUnlock()

	return map[string]interface{}{
		"cache_size":            cacheSize,
		"buffer_size":           bufferSize,
		"total_records":         totalRecords,
		"retention_days":        hm.retentionDays,
		"oldest_record":         oldestRecord.Timestamp,
		"write_queue_len":       len(hm.writeChan),
		"write_queue_cap":       cap(hm.writeChan),
		"total_points_received": statsSnapshot.TotalPointsReceived,
		"total_records_written": statsSnapshot.TotalRecordsWritten,
		"batches_processed":     statsSnapshot.BatchesProcessed,
		"cache_hits":            statsSnapshot.CacheHits,
		"cache_misses":          statsSnapshot.CacheMisses,
		"last_write_time":       statsSnapshot.LastWriteTime.Format("2006-01-02 15:04:05"),
		"write_errors":          statsSnapshot.WriteErrors,
		"last_error_message":    statsSnapshot.LastErrorMessage,
		"last_error_time":       statsSnapshot.LastErrorTime.Format("2006-01-02 15:04:05"),
		"cache_hit_rate":        hm.calculateCacheHitRate(statsSnapshot),
	}
}

// calculateCacheHitRate 计算缓存命中率
func (hm *HistoryManager) calculateCacheHitRate(stats HistoryStats) float64 {
	total := stats.CacheHits + stats.CacheMisses
	if total == 0 {
		return 0.0
	}
	return float64(stats.CacheHits) / float64(total) * 100.0
}

// Close 关闭历史管理器
func (hm *HistoryManager) Close() {
	log.Info("正在关闭流量历史管理器")

	// 停止所有处理器
	hm.cancel()
	hm.wg.Wait()

	// 最后一次刷新
	hm.FlushAggregateCache()
	hm.flushBuffer()

	log.Info("流量历史管理器已关闭")
}
