# 优化后的SSE服务架构

## 概述

本次优化将原有的增强服务功能集成到原有的SSE服务中，实现了内存优先的异步批量处理机制，提高了系统性能和响应速度。

## 主要改进

### 1. 内存优先架构

- **集成内存管理服务**: 直接在原有SSE服务中集成`memory.Service`
- **流量历史管理器**: 集成`traffic.HistoryManager`用于流量数据的历史记录
- **实时数据访问**: 所有实时数据查询优先从内存获取，大幅提升响应速度

### 2. 异步批量处理

#### 2.1 SSE日志异步批量插入
```go
// 对于日志事件，使用批量插入
if event.EventType == models.SSEEventTypeLog {
    select {
    case s.batchInsertCh <- event:
        return nil
    default:
        log.Warnf("批量插入队列已满，直接插入事件")
    }
}
```

#### 2.2 Update事件内存优先处理
```go
// 首先更新内存状态
if err := s.memoryService.ProcessSSEEvent(endpointID, event); err != nil {
    // 内存处理失败，回退到原有逻辑
    return s.ProcessEventImmediate(endpointID, event)
}

// 对于update事件，异步批量持久化
if event.EventType == models.SSEEventTypeUpdate {
    select {
    case s.storeJobCh <- event:
        // 成功投递到存储队列
    default:
        log.Warnf("事件存储队列已满，丢弃事件")
    }
}
```

### 3. 流量快照差值机制

#### 3.1 内存中的流量快照
```go
// TrafficSnapshot 流量快照（用于差值计算）
type TrafficSnapshot struct {
    // 上次记录的绝对值
    LastTCPRx int64 `json:"last_tcp_rx"`
    LastTCPTx int64 `json:"last_tcp_tx"`
    LastUDPRx int64 `json:"last_udp_rx"`
    LastUDPTx int64 `json:"last_udp_tx"`

    // 累计差值
    DeltaTCPRx int64 `json:"delta_tcp_rx"`
    DeltaTCPTx int64 `json:"delta_tcp_tx"`
    DeltaUDPRx int64 `json:"delta_udp_rx"`
    DeltaUDPTx int64 `json:"delta_udp_tx"`

    // 快照时间
    SnapshotTime time.Time `json:"snapshot_time"`
}
```

#### 3.2 每小时定时持久化
- 使用`traffic.HistoryManager`进行流量历史数据管理
- 每小时自动计算流量差值并存储到数据库
- 支持安全计算，避免溢出

### 4. 静态配置与动态数据分离

#### 4.1 静态配置（立即持久化）
- 实例的配置信息（URL、类型、别名等）
- 创建、删除、初始化事件
- 状态变更事件

#### 4.2 动态数据（内存优先）
- 流量信息（TCP/UDP收发数据）
- Ping值
- Pool连接数
- 实时状态信息

### 5. 性能统计与监控

#### 5.1 服务统计信息
```go
type ServiceStats struct {
    ProcessedEvents    int64     `json:"processed_events"`
    MemoryHits         int64     `json:"memory_hits"`
    DatabaseWrites     int64     `json:"database_writes"`
    LastProcessedTime  time.Time `json:"last_processed_time"`
    AverageProcessTime int64     `json:"average_process_time_ms"`
    MemoryErrors       int64     `json:"memory_errors"`
    DatabaseErrors     int64     `json:"database_errors"`
}
```

#### 5.2 命中率统计
- 内存命中率：`memory_hits / processed_events * 100`
- 错误率：`(memory_errors + database_errors) / processed_events * 100`

### 6. 实时数据API

#### 6.1 端点实时数据
```go
func (s *Service) GetEndpointRealTimeData(endpointID int64) *memory.EndpointShared
```

#### 6.2 隧道实时数据
```go
func (s *Service) GetTunnelRealTimeData(endpointID int64, instanceID string) *memory.TunnelState
```

#### 6.3 仪表板数据聚合
```go
func (s *Service) GetDashboardData() map[string]interface{}
```

#### 6.4 流量趋势数据
```go
func (s *Service) GetTrafficTrendData(endpointID int64, hours int) []map[string]interface{}
```

## 架构优势

### 1. 性能提升
- **内存优先**: 实时数据查询从内存获取，响应时间从毫秒级降低到微秒级
- **批量处理**: 减少数据库写入次数，提高吞吐量
- **异步处理**: 避免阻塞SSE事件接收

### 2. 资源优化
- **内存缓存**: 减少数据库查询压力
- **批量写入**: 减少数据库连接开销
- **智能持久化**: 只对必要数据进行立即持久化

### 3. 可扩展性
- **模块化设计**: 内存服务、流量历史管理器独立模块
- **配置灵活**: 支持调整批量大小、处理间隔等参数
- **监控完善**: 提供详细的性能统计信息

### 4. 数据一致性
- **事务支持**: 批量操作使用数据库事务
- **错误回退**: 内存处理失败时回退到原有逻辑
- **状态同步**: 内存状态与数据库状态保持同步

## 使用方式

### 1. 服务初始化
```go
service := sse.NewService(db, endpointService)
if err := service.Initialize(); err != nil {
    log.Fatalf("初始化SSE服务失败: %v", err)
}
```

### 2. 事件处理
```go
// 自动使用内存优先的处理逻辑
err := service.ProcessEvent(endpointID, event)
```

### 3. 实时数据查询
```go
// 从内存获取实时数据
endpointData := service.GetEndpointRealTimeData(endpointID)
tunnelData := service.GetTunnelRealTimeData(endpointID, instanceID)
dashboardData := service.GetDashboardData()
```

### 4. 性能监控
```go
// 获取服务统计信息
stats := service.GetStats()
queueStats := service.GetQueueStats()
performanceStats := service.GetPerformanceStats()
```

## 配置参数

### 1. 批量处理配置
- `batchInsertSize`: 批量插入大小（默认100）
- `batchTimer`: 批处理定时器间隔（默认2秒）
- `storeJobCh`: 存储队列大小（默认5000）

### 2. 内存管理配置
- `maxCacheEvents`: 每个端点最大缓存事件数（默认1000）
- `logRetentionDays`: 日志保留天数（默认7天）
- `maxLogRecordsPerDay`: 每天最大日志记录数（默认10000）

### 3. 流量历史配置
- `retentionDays`: 流量历史保留天数（默认30天）
- `bufferSize`: 批量写入缓冲区大小（默认100）

## 总结

优化后的SSE服务通过内存优先的架构设计，实现了：

1. **高性能**: 内存优先的实时数据访问
2. **高吞吐**: 异步批量处理机制
3. **高可靠**: 完善的错误处理和回退机制
4. **易监控**: 详细的性能统计和监控指标
5. **易扩展**: 模块化的设计架构

这种架构特别适合需要处理大量实时数据的场景，能够显著提升系统的响应速度和整体性能。
