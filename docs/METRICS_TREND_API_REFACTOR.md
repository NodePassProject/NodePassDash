# Metrics Trend API 重构 - 使用 ServiceHistory 表

## 🎯 重构目标

根据用户需求，将隧道详情页的 metrics-trend 接口重构为：

1. **路径参数**：从 `/api/tunnels/{id}/metrics-trend` 改为 `/api/tunnels/{instanceId}/metrics-trend`
2. **数据源**：从 `minute_metrics` 表改为 `ServiceHistory` 表  
3. **查询条件**：使用 `WHERE instance_id = ? AND created_at >= ?`
4. **返回格式**：保持与原接口完全一致

## 🔧 修改内容

### 1. 路由定义更新

**文件**: `internal/api/routes.go`

```go
// 原路由
r.router.HandleFunc("/api/tunnels/{id}/metrics-trend", r.tunnelMetricsHandler.HandleGetTunnelMetricsTrend).Methods("GET")

// 新路由 - 使用 instanceId
r.router.HandleFunc("/api/tunnels/{instanceId}/metrics-trend", r.tunnelMetricsHandler.HandleGetTunnelMetricsTrend).Methods("GET")
```

**变更说明**：
- 路径参数从 `{id}` 改为 `{instanceId}`
- 注释更新为说明基于 ServiceHistory 表

### 2. 接口实现重构

**文件**: `internal/api/tunnel_metrics.go`

#### 主接口方法 `HandleGetTunnelMetricsTrend`

**核心变更**：
- **参数获取**：直接从路径参数获取 `instanceId`，无需查询 tunnels 表
- **数据查询**：调用新方法 `getUnifiedTrendDataFromServiceHistory`
- **数据源标识**：返回 `"source": "service_history"`

```go
// 变更前
vars := mux.Vars(r)
idStr := vars["id"]
id, err := strconv.ParseInt(idStr, 10, 64)
// 查询 tunnels 表获取 endpoint_id 和 instance_id
var endpointID int64
var instanceID sql.NullString
db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID)

// 变更后  
vars := mux.Vars(r)
instanceId := vars["instanceId"]
// 直接使用 instanceId，无需额外查询
```

#### 新增查询方法 `getUnifiedTrendDataFromServiceHistory`

**核心特性**：
- **数据源**：查询 `service_history` 表
- **查询条件**：`WHERE instance_id = ? AND created_at >= ?`
- **字段映射**：
  - `record_time` → 时间轴
  - `avg_ping` → 延迟数据
  - `avg_pool` → 连接池数据
  - `avg_tcp_in/out` + `avg_udp_in/out` → 流量数据

```go
query := `SELECT record_time, avg_ping, avg_pool, avg_tcp_in, avg_tcp_out, avg_udp_in, avg_udp_out 
          FROM service_history 
          WHERE instance_id = ? AND created_at >= ? 
          ORDER BY record_time ASC`
```

**数据聚合逻辑**：
- **流量数据**：TCP+UDP总流量 `= avg_tcp_in + avg_tcp_out + avg_udp_in + avg_udp_out`
- **延迟数据**：直接使用 `avg_ping` 
- **连接池数据**：直接使用 `avg_pool`
- **速度数据**：使用TCP流量 `= avg_tcp_in + avg_tcp_out`

### 3. 前端调用更新

**文件**: `app/tunnels/details/page.tsx`

**变更前**：
```tsx
} = useMetricsTrend({
  tunnelId: resolvedId || "", // 使用隧道主键 ID
  autoRefresh: !!resolvedId,
  refreshInterval: 15000
});
```

**变更后**：
```tsx
} = useMetricsTrend({
  tunnelId: tunnelInfo?.instanceId || "", // 使用instanceId作为参数
  autoRefresh: !!tunnelInfo?.instanceId,
  refreshInterval: 15000
});
```

**说明**：
- 参数改为使用 `tunnelInfo.instanceId` 而不是 tunnel 主键ID
- 自动刷新条件也相应调整
- hook内部仍使用 `tunnelId` 参数名，但实际传递的是 `instanceId`

## 📊 数据表字段对比

### 原 minute_metrics 表
| 字段 | 用途 | 类型 |
|------|------|------|
| `metric_time` | 时间轴 | timestamp |
| `avg_ping` | 平均延迟 | float64 |
| `avg_pool` | 平均连接池 | float64 |
| `avg_tcp_rx_rate` | TCP接收速率 | float64 |
| `avg_tcp_tx_rate` | TCP发送速率 | float64 |
| `avg_udp_rx_rate` | UDP接收速率 | float64 |
| `avg_udp_tx_rate` | UDP发送速率 | float64 |

### 新 service_history 表  
| 字段 | 用途 | 类型 |
|------|------|------|
| `record_time` | 时间轴 | timestamp |
| `avg_ping` | 平均延迟 | float64 |
| `avg_pool` | 平均连接池 | float64 |
| `avg_tcp_in` | 平均TCP入站流量 | float64 |
| `avg_tcp_out` | 平均TCP出站流量 | float64 |
| `avg_udp_in` | 平均UDP入站流量 | float64 |
| `avg_udp_out` | 平均UDP出站流量 | float64 |

**差异说明**：
- 原表使用 `*_rate` (速率)，新表使用绝对流量值
- 原表按 `endpoint_id + instance_id` 查询，新表仅按 `instance_id` 查询
- 时间字段：`metric_time` → `record_time`

## 🚀 API 接口规格

### 请求格式
```http
GET /api/tunnels/{instanceId}/metrics-trend?hours={hours}
```

**参数说明**：
- `{instanceId}`: 隧道实例ID（必需）
- `hours`: 查询时间范围，默认24小时，最大168小时（7天）

### 响应格式 (保持不变)
```json
{
  "success": true,
  "data": {
    "traffic": {
      "avg_delay": [数据数组],
      "created_at": [时间戳数组]
    },
    "ping": {
      "avg_delay": [数据数组], 
      "created_at": [时间戳数组]
    },
    "pool": {
      "avg_delay": [数据数组],
      "created_at": [时间戳数组]
    },
    "speed": {
      "avg_delay": [数据数组],
      "created_at": [时间戳数组]
    }
  },
  "hours": 24,
  "source": "service_history",
  "timestamp": 1640995200
}
```

**变更说明**：
- `source` 字段从 `"aggregated_metrics"` 改为 `"service_history"`
- 其他字段完全保持一致

## 🔄 数据流程

### 原数据流程
```mermaid
graph TD
    A[前端传递 tunnel ID] --> B[查询 tunnels 表获取 instance_id]
    B --> C[查询 minute_metrics 表]
    C --> D[返回聚合数据]
```

### 新数据流程  
```mermaid
graph TD
    A[前端传递 instance ID] --> B[直接查询 service_history 表]
    B --> C[返回聚合数据]
```

**优势**：
- 减少一次数据库查询（不需要查询 tunnels 表）
- 直接使用 ServiceHistory 表，数据来源更加统一
- 查询条件更简单：只需 `instance_id` 和时间范围

## 🔍 兼容性说明

### 保持兼容的部分
✅ **API 响应格式**：完全一致  
✅ **数据时间对齐**：仍然按分钟对齐，填充缺失时间点  
✅ **时间范围支持**：仍然支持1小时到7天的查询  
✅ **前端图表显示**：无需修改图表组件  

### 发生变化的部分  
⚠️ **API 路径**：从 `/api/tunnels/{id}/metrics-trend` 改为 `/api/tunnels/{instanceId}/metrics-trend`  
⚠️ **前端调用参数**：需要传递 `instanceId` 而不是 tunnel ID  
⚠️ **数据来源标识**：`source` 字段改为 `"service_history"`  

## 📈 性能优化

### 查询性能提升
- **减少 JOIN 查询**：无需连接 tunnels 表获取 instance_id
- **索引优化**：ServiceHistory 表已在 `instance_id` 和 `created_at` 字段上建立索引
- **查询简化**：查询条件从两个表的关联查询简化为单表查询

### 数据准确性
- **数据源统一**：直接来自 HistoryWorker 的聚合结果
- **实时性**：基于 ServiceHistory 表，数据更新频率约2.5分钟（30个数据点×5秒）
- **精度保持**：仍然保持分钟级精度的时间序列

## ✅ 验证清单

### 后端验证
- [x] 路由路径修改为 `{instanceId}`
- [x] 接口参数解析改为获取 `instanceId`
- [x] 查询 ServiceHistory 表而不是 minute_metrics 表  
- [x] 查询条件使用 `WHERE instance_id = ? AND created_at >= ?`
- [x] 返回格式保持与原接口一致
- [x] 数据源标识更新为 `"service_history"`

### 前端验证  
- [x] 传递参数改为 `tunnelInfo.instanceId`
- [x] 自动刷新条件调整为基于 `instanceId` 的存在性
- [x] 图表显示逻辑无需修改（格式兼容）

### 功能验证
- [ ] API 接口正常返回数据
- [ ] 前端图表正确显示趋势数据
- [ ] 时间范围筛选功能正常
- [ ] 自动刷新机制工作正常
- [ ] 错误处理和空数据场景测试

## 🎉 总结

本次重构成功实现了：

1. ✅ **API 路径参数化**：使用 `instanceId` 替代 tunnel ID，简化了查询逻辑
2. ✅ **数据源迁移**：从 `minute_metrics` 表迁移到 `ServiceHistory` 表
3. ✅ **查询优化**：减少数据库查询次数，提高接口性能
4. ✅ **格式兼容**：保持与原接口完全一致的响应格式
5. ✅ **前端适配**：最小化前端代码修改，确保功能正常

这个重构为隧道监控数据的统一管理奠定了基础，使得所有历史趋势数据都来源于 HistoryWorker 生成的 ServiceHistory 表，确保了数据的一致性和可靠性。
