package sse

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

// 常量定义（参照Nezha）
const (
	// _CurrentStatusSize 累积数据点数量阈值（30个数据点 = 150秒 = 2.5分钟）
	// 重要：这个阈值是针对每个实例（endpoint + instance）单独统计的
	// 即：每个实例都有独立的30个数据点累积数组
	_CurrentStatusSize   = 12
	_DataIntervalSeconds = 5.0
)

// MonitoringData 监控数据点结构
type MonitoringData struct {
	EndpointID int64
	InstanceID string
	TCPIn      int64  // 累计值
	TCPOut     int64  // 累计值
	UDPIn      int64  // 累计值
	UDPOut     int64  // 累计值
	Ping       *int64 // 延迟（瞬时值）
	Pool       *int64 // 连接池（瞬时值）
	TCPs       *int64 // TCP连接数（瞬时值）
	UDPs       *int64 // UDP连接数（瞬时值）
	Timestamp  time.Time
}

// TransferData 流量差值数据结构（参照Nezha的Transfer表设计）
type TransferData struct {
	TCPInDelta  int64 // TCP入站差值
	TCPOutDelta int64 // TCP出站差值
	UDPInDelta  int64 // UDP入站差值
	UDPOutDelta int64 // UDP出站差值
}

// ServiceCurrentStatus 单个实例的当前状态数据
// 重要：每个实例（endpoint + instance）都有独立的状态容器
type ServiceCurrentStatus struct {
	Result []MonitoringData // 该实例独立的累积数据点数组（最大_CurrentStatusSize个）
	mu     sync.RWMutex     // 读写锁保护该实例的状态数据
}

// HistoryWorker 历史数据处理Worker（参照Nezha设计）
// 核心特性：按实例独立统计 - 每个实例(endpoint + instance)都有独立的数据累积和计算
type HistoryWorker struct {
	db *gorm.DB
	// 按实例独立的状态缓存：key格式为 "endpointID_instanceID"
	// 每个key对应一个独立的ServiceCurrentStatus，包含该实例的_CurrentStatusSize个数据点累积数组
	serviceCurrentStatusData map[string]*ServiceCurrentStatus // key: endpointID_instanceID
	mu                       sync.RWMutex                     // 保护整个数据映射

	// 数据接收通道（参照Nezha的设计）
	dataInputChan chan MonitoringData // SSE数据输入通道
	stopChan      chan struct{}       // 停止信号通道
	wg            sync.WaitGroup      // 等待组
	closed        bool                // 关闭标志
	closeMu       sync.Mutex          // 保护关闭状态
}

// NewHistoryWorker 创建历史数据处理Worker（参照Nezha设计）
func NewHistoryWorker(db *gorm.DB) *HistoryWorker {
	worker := &HistoryWorker{
		db:                       db,
		serviceCurrentStatusData: make(map[string]*ServiceCurrentStatus),
		dataInputChan:            make(chan MonitoringData, 15000), // SSE数据输入通道
		stopChan:                 make(chan struct{}),
	}

	// 启动主数据处理协程（参照Nezha的worker设计）
	worker.wg.Add(1)
	go worker.dataProcessWorker()

	// 移除批量写入协程（改为立即写入）
	// worker.wg.Add(1)
	// go worker.batchWriteWorker()

	log.Info("历史数据处理Worker已启动")
	return worker
}

// Dispatch 将SSE update事件推送到数据处理通道（参照Nezha的设计）
func (hw *HistoryWorker) Dispatch(payload SSEResp) {
	// 检查是否已关闭
	hw.closeMu.Lock()
	if hw.closed {
		hw.closeMu.Unlock()
		log.Debug("HistoryWorker 已关闭，跳过数据分发")
		return
	}
	hw.closeMu.Unlock()

	// 构建监控数据点
	data := MonitoringData{
		EndpointID: payload.EndpointID,
		InstanceID: payload.Instance.ID,
		TCPIn:      payload.Instance.TCPRx,
		TCPOut:     payload.Instance.TCPTx,
		UDPIn:      payload.Instance.UDPRx,
		UDPOut:     payload.Instance.UDPTx,
		Ping:       payload.Instance.Ping,
		Pool:       payload.Instance.Pool,
		TCPs:       payload.Instance.TCPs,
		UDPs:       payload.Instance.UDPs,
		Timestamp:  payload.TimeStamp,
	}

	// 推送到数据处理通道（非阻塞）
	select {
	case hw.dataInputChan <- data:
		// 成功推送到处理队列
	default:
		log.Warnf("[HistoryWorker]数据处理队列已满，丢弃数据: 端点:%d 实例:%s", data.EndpointID, data.InstanceID)
	}
}

// dataProcessWorker 主数据处理Worker（参照Nezha设计）
// 这是一个持续运行的goroutine，负责：
// 1. 从通道接收SSE数据
// 2. 数据验证和累积
// 3. 聚合计算（加权平均延迟，普通平均流量）
// 4. 触发批量写入
func (hw *HistoryWorker) dataProcessWorker() {
	defer hw.wg.Done()
	log.Info("[HistoryWorker]主数据处理协程已启动")

	for {
		select {
		case <-hw.stopChan:
			log.Info("[HistoryWorker]主数据处理协程收到停止信号")
			return
		case data := <-hw.dataInputChan:
			hw.processMonitoringData(data)
		}
	}
}

// processMonitoringData 处理单个监控数据点
// 重要：每个实例独立处理，互不影响
// 每个实例维护自己的数据点累积数组和流量差值计算状态
func (hw *HistoryWorker) processMonitoringData(data MonitoringData) {
	// 构建实例唯一键：endpointID_instanceID
	key := hw.buildDataKey(data.EndpointID, data.InstanceID)

	// 获取或创建服务状态数据
	hw.mu.RLock()
	currentStatus, exists := hw.serviceCurrentStatusData[key]
	hw.mu.RUnlock()

	if !exists {
		// 为该实例创建独立的状态数据容器，每个实例都有自己的数据点累积数组
		currentStatus = &ServiceCurrentStatus{
			Result: make([]MonitoringData, 0, _CurrentStatusSize), // 独立的数据点数组
		}

		hw.mu.Lock()
		hw.serviceCurrentStatusData[key] = currentStatus
		hw.mu.Unlock()

		log.Debugf("[HistoryWorker]为实例 %s 创建独立的状态数据容器", key)
	}

	// 直接添加数据点，记录累计值
	currentStatus.mu.Lock()

	// 创建包含累计值的数据点
	monitoringData := MonitoringData{
		EndpointID: data.EndpointID,
		InstanceID: data.InstanceID,
		TCPIn:      data.TCPIn,  // 直接使用累计值
		TCPOut:     data.TCPOut, // 直接使用累计值
		UDPIn:      data.UDPIn,  // 直接使用累计值
		UDPOut:     data.UDPOut, // 直接使用累计值
		Ping:       data.Ping,   // 延迟使用瞬时值
		Pool:       data.Pool,   // 连接池使用瞬时值
		TCPs:       data.TCPs,   // TCP连接数使用瞬时值
		UDPs:       data.UDPs,   // UDP连接数使用瞬时值
		Timestamp:  data.Timestamp,
	}

	currentStatus.Result = append(currentStatus.Result, monitoringData)
	resultLength := len(currentStatus.Result)
	currentStatus.mu.Unlock()

	log.Debugf("[HistoryWorker]实例 %s 累积数据点: %d/%d", key, resultLength, _CurrentStatusSize)

	// 检查该实例是否独立达到累积阈值
	// 重要：每个实例独立计算，不同实例之间互不影响
	if resultLength >= _CurrentStatusSize {
		hw.triggerBatchWrite(key, currentStatus)
	}
}

// triggerBatchWrite 触发单个实例的批量写入（参照Nezha的逻辑）
// 重要：这是针对单个实例的独立操作，不影响其他实例
func (hw *HistoryWorker) triggerBatchWrite(key string, currentStatus *ServiceCurrentStatus) {
	currentStatus.mu.Lock()

	// 检查该实例的数据长度（双重检查，避免并发问题）
	if len(currentStatus.Result) < _CurrentStatusSize {
		currentStatus.mu.Unlock()
		return
	}

	// 复制该实例的数据点以进行聚合计算
	dataPoints := make([]MonitoringData, len(currentStatus.Result))
	copy(dataPoints, currentStatus.Result)

	// 清空该实例的累积数组，重新开始累积下一批30个数据点
	currentStatus.Result = currentStatus.Result[:0]
	currentStatus.mu.Unlock()

	log.Debugf("[HistoryWorker]实例 %s 达到累积阈值，开始聚合计算 %d 个数据点", key, len(dataPoints))

	// 异步进行数据聚合和批量写入
	go hw.aggregateAndWrite(dataPoints)
}

// aggregateAndWrite 聚合数据并写入数据库
// 修改后的版本：流量记录差值，Pool记录最后值，速度用总差值/总时间计算
func (hw *HistoryWorker) aggregateAndWrite(dataPoints []MonitoringData) {
	if len(dataPoints) == 0 {
		return
	}

	// 使用第一个和最后一个数据点
	firstPoint := dataPoints[0]
	lastPoint := dataPoints[len(dataPoints)-1]

	// 初始化聚合结果
	historyModel := &models.ServiceHistory{
		EndpointID:  firstPoint.EndpointID,
		InstanceID:  firstPoint.InstanceID,
		RecordTime:  time.Now().Truncate(time.Minute), // 按分钟取整
		RecordCount: len(dataPoints),
		UpCount:     len(dataPoints), // 所有数据点都算在线
	}

	// 1. 存储最后一个数据点的累计值（保持原始int64类型）
	historyModel.DeltaTCPIn = lastPoint.TCPIn
	historyModel.DeltaTCPOut = lastPoint.TCPOut
	historyModel.DeltaUDPIn = lastPoint.UDPIn
	historyModel.DeltaUDPOut = lastPoint.UDPOut
	// 2. 计算时间跨度
	totalTime := lastPoint.Timestamp.Sub(firstPoint.Timestamp).Seconds()

	// 3. 计算平均速度（bytes/s）- 基于时间段内的流量变化
	if totalTime > 0 {
		// 计算时间段内的流量变化量
		tcpInDelta := float64(lastPoint.TCPIn - firstPoint.TCPIn)
		tcpOutDelta := float64(lastPoint.TCPOut - firstPoint.TCPOut)
		udpInDelta := float64(lastPoint.UDPIn - firstPoint.UDPIn)
		udpOutDelta := float64(lastPoint.UDPOut - firstPoint.UDPOut)

		// 处理累计值重置情况
		if tcpInDelta < 0 {
			log.Warnf("[HistoryWorker]检测到TCPIn重置，使用last值计算速度")
			tcpInDelta = float64(lastPoint.TCPIn)
		}
		if tcpOutDelta < 0 {
			log.Warnf("[HistoryWorker]检测到TCPOut重置，使用last值计算速度")
			tcpOutDelta = float64(lastPoint.TCPOut)
		}
		if udpInDelta < 0 {
			log.Warnf("[HistoryWorker]检测到UDPIn重置，使用last值计算速度")
			udpInDelta = float64(lastPoint.UDPIn)
		}
		if udpOutDelta < 0 {
			log.Warnf("[HistoryWorker]检测到UDPOut重置，使用last值计算速度")
			udpOutDelta = float64(lastPoint.UDPOut)
		}

		historyModel.AvgSpeedIn = (tcpInDelta + udpInDelta) / totalTime
		historyModel.AvgSpeedOut = (tcpOutDelta + udpOutDelta) / totalTime
	} else {
		// 异常情况：时间差为0，使用理论时间间隔
		log.Warnf("[HistoryWorker]时间差为0，使用理论时间间隔计算速度")
		theoreticalTime := float64(_CurrentStatusSize-1) * _DataIntervalSeconds // (数据点数-1) * 5秒
		if theoreticalTime > 0 {
			tcpInDelta := float64(lastPoint.TCPIn - firstPoint.TCPIn)
			tcpOutDelta := float64(lastPoint.TCPOut - firstPoint.TCPOut)
			udpInDelta := float64(lastPoint.UDPIn - firstPoint.UDPIn)
			udpOutDelta := float64(lastPoint.UDPOut - firstPoint.UDPOut)

			historyModel.AvgSpeedIn = (tcpInDelta + udpInDelta) / theoreticalTime
			historyModel.AvgSpeedOut = (tcpOutDelta + udpOutDelta) / theoreticalTime
		} else {
			historyModel.AvgSpeedIn = 0
			historyModel.AvgSpeedOut = 0
		}
	}

	// 4. Ping延迟计算：使用加权平均算法
	var pingSum float64
	var pingCount int

	for _, point := range dataPoints {
		if point.Ping != nil {
			pingSum += float64(*point.Ping)
			pingCount++
		}
	}

	if pingCount > 0 {
		historyModel.AvgPing = pingSum / float64(pingCount)
	} else {
		historyModel.AvgPing = 0
	}

	// 5. Pool连接池：直接使用最后一个值（反映最新状态）
	if lastPoint.Pool != nil {
		historyModel.AvgPool = *lastPoint.Pool
	} else {
		historyModel.AvgPool = 0
	}

	// 6. TCPs和UDPs连接数：直接使用最后一个值（反映最新状态）
	if lastPoint.TCPs != nil {
		historyModel.AvgTCPs = *lastPoint.TCPs
	} else {
		historyModel.AvgTCPs = 0
	}

	if lastPoint.UDPs != nil {
		historyModel.AvgUDPs = *lastPoint.UDPs
	} else {
		historyModel.AvgUDPs = 0
	}

	// 7. 立即写入数据库
	startTime := time.Now()
	err := hw.db.Create(historyModel).Error
	duration := time.Since(startTime)

	if err != nil {
		log.Errorf("[HistoryWorker]立即写入失败 (端点:%d 实例:%s, 耗时%v): %v",
			historyModel.EndpointID, historyModel.InstanceID, duration, err)
	}

	log.Debugf("[HistoryWorker]聚合完成 - 端点:%d 实例:%s 数据点:%d 时间跨度:%.1fs TCP入累计:%d TCP出累计:%d UDP入累计:%d UDP出累计:%d 延迟平均:%.2fms 连接池最新:%d TCP连接数:%d UDP连接数:%d 入站速度:%.2f bytes/s 出站速度:%.2f bytes/s",
		historyModel.EndpointID, historyModel.InstanceID, historyModel.RecordCount, totalTime,
		historyModel.DeltaTCPIn, historyModel.DeltaTCPOut, historyModel.DeltaUDPIn, historyModel.DeltaUDPOut,
		historyModel.AvgPing, int64(historyModel.AvgPool), historyModel.AvgTCPs, historyModel.AvgUDPs, historyModel.AvgSpeedIn, historyModel.AvgSpeedOut)
}

// 移除批量写入相关方法（改为立即写入）
// batchWriteWorker 和 writeBatch 方法已删除

// buildDataKey 构建数据键
func (hw *HistoryWorker) buildDataKey(endpointID int64, instanceID string) string {
	return fmt.Sprintf("%d_%s", endpointID, instanceID)
}

// calculateDelta 计算流量差值（参照Nezha Transfer表设计）
// 处理累计值重置和异常情况
func (hw *HistoryWorker) calculateDelta(current, last int64) int64 {
	// 如果当前值小于上次值，可能发生了重置或异常
	if current < last {
		// 日志记录异常情况
		log.Debugf("[HistoryWorker]检测到流量累计值重置: current=%d, last=%d", current, last)

		// 如果差值过大，认为是重置，使用当前值作为差值
		if last-current > current {
			return current
		}

		// 否则返回0，避免负数
		return 0
	}

	// 正常情况：返回差值
	delta := current - last

	// 防止异常巨大的差值（可能是数据错误）
	maxReasonableDelta := int64(10 * 1024 * 1024 * 1024) // 10GB，合理的最大差值
	if delta > maxReasonableDelta {
		log.Warnf("[HistoryWorker]检测到异常巨大的流量差值: %d bytes, 使用上限值", delta)
		return maxReasonableDelta
	}

	return delta
}

// GetStats 方法已删除（不需要监控功能）

// Close 关闭Worker
func (hw *HistoryWorker) Close() {
	hw.closeMu.Lock()
	defer hw.closeMu.Unlock()

	// 检查是否已经关闭
	if hw.closed {
		log.Debug("HistoryWorker 已经关闭，跳过重复关闭")
		return
	}

	log.Info("正在关闭历史数据处理Worker")

	// 标记为已关闭
	hw.closed = true

	// 安全关闭停止通道
	select {
	case <-hw.stopChan:
		// 通道已经关闭
	default:
		close(hw.stopChan)
	}

	// 等待所有协程完成
	hw.wg.Wait()

	// 安全关闭数据通道
	select {
	case <-hw.dataInputChan:
		// 通道已经关闭或为空
	default:
		close(hw.dataInputChan)
	}

	log.Info("历史数据处理Worker已关闭")
}
