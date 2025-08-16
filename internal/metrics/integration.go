package metrics

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/memory"
	"NodePassDash/internal/models"
	"sync"

	"gorm.io/gorm"
)

// MetricsIntegrator Metrics 系统集成器，负责将指标聚合功能集成到现有架构中
type MetricsIntegrator struct {
	db           *gorm.DB
	aggregator   *MetricsAggregator
	sseProcessor *SSEProcessor

	// 与内存服务的集成
	memoryService *memory.Service
	isIntegrated  bool
	mu            sync.RWMutex
}

// NewMetricsIntegrator 创建 Metrics 集成器
func NewMetricsIntegrator(db *gorm.DB) *MetricsIntegrator {
	// 创建聚合器
	aggregator := NewMetricsAggregator(db)

	// 创建 SSE 处理器
	sseProcessor := NewSSEProcessor(aggregator)

	return &MetricsIntegrator{
		db:           db,
		aggregator:   aggregator,
		sseProcessor: sseProcessor,
	}
}

// IntegrateWithMemoryService 与内存服务集成
func (mi *MetricsIntegrator) IntegrateWithMemoryService(memoryService *memory.Service) error {
	mi.mu.Lock()
	defer mi.mu.Unlock()

	if mi.isIntegrated {
		return nil
	}

	mi.memoryService = memoryService

	// 添加 SSE 事件监听器 - 类似状态变化监听器的模式
	listener := &MetricsSSEListener{
		sseProcessor: mi.sseProcessor,
	}

	memoryService.AddSSEEventListener(listener)
	mi.isIntegrated = true

	log.Info("Metrics 系统已与内存服务集成")
	return nil
}

// GetSSEProcessor 获取 SSE 处理器
func (mi *MetricsIntegrator) GetSSEProcessor() *SSEProcessor {
	return mi.sseProcessor
}

// GetAggregator 获取聚合器
func (mi *MetricsIntegrator) GetAggregator() *MetricsAggregator {
	return mi.aggregator
}

// Close 关闭集成器
func (mi *MetricsIntegrator) Close() {
	log.Info("正在关闭 Metrics 集成器")

	if mi.aggregator != nil {
		mi.aggregator.Close()
	}

	// 清理流量快照
	if mi.sseProcessor != nil {
		mi.sseProcessor.CleanupOldSnapshots()
	}

	log.Info("Metrics 集成器已关闭")
}

// MetricsSSEListener SSE 事件监听器，实现 SSEEventListener 接口
type MetricsSSEListener struct {
	sseProcessor *SSEProcessor
}

// OnSSEEvent 处理 SSE 事件
func (l *MetricsSSEListener) OnSSEEvent(endpointID int64, event models.EndpointSSE) {
	if l.sseProcessor != nil {
		// 异步处理 SSE 事件避免阻塞主流程
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Errorf("Metrics SSE 事件处理异常: %v", r)
				}
			}()

			if err := l.sseProcessor.ProcessSSEEvent(endpointID, event); err != nil {
				log.Errorf("Metrics SSE 事件处理失败 [%d]: %v", endpointID, err)
			}
		}()
	}
}

// GetStats 获取集成器统计信息
func (mi *MetricsIntegrator) GetStats() map[string]interface{} {
	stats := make(map[string]interface{})

	// 聚合器统计
	if mi.aggregator != nil {
		// 这里可以添加聚合器的统计信息
		mi.aggregator.statusMutex.RLock()
		stats["active_tasks"] = len(mi.aggregator.taskStatuses)
		mi.aggregator.statusMutex.RUnlock()

		stats["aggregation_window"] = mi.aggregator.aggregationWindow.String()
		stats["max_status_size"] = mi.aggregator.maxCurrentStatusSize
	}

	// SSE 处理器统计
	if mi.sseProcessor != nil {
		processorStats := mi.sseProcessor.GetStats()
		stats["sse_processor"] = processorStats
	}

	// 集成状态
	mi.mu.RLock()
	stats["integrated"] = mi.isIntegrated
	mi.mu.RUnlock()

	return stats
}
