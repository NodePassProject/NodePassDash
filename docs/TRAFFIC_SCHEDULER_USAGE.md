# 流量调度器使用说明

## 概述

流量调度器已经完成重构，现在使用 `service_history` 表作为数据源，并新增了 `dashboard_traffic_summary` 表用于dashboard级别的流量汇总。

## 主要功能

### 1. 数据源变更
- **之前**: 从 `endpoint_sse` 表查询原始SSE事件数据
- **现在**: 从 `service_history` 表查询已聚合的分钟级数据

### 2. 汇总逻辑变更
- **之前**: 计算每小时内的流量差值（MAX - MIN）
- **现在**: 获取上一小时59分的累计值作为该小时的汇总数据，并计算与上一小时的差值

### 3. 新增Dashboard汇总表
- 新增 `dashboard_traffic_summary` 表，用于存储按小时汇总的所有实例流量累计值总和

## 数据库迁移

### 执行迁移
需要执行以下迁移文件来创建新的表结构：

```bash
# 确保数据库迁移已执行
# 迁移文件：internal/db/migrations/023_create_dashboard_traffic_summary.sql
# 迁移文件：internal/db/migrations/024_fix_traffic_hourly_summary_structure.sql
```

### 验证表结构
```sql
-- 检查dashboard_traffic_summary表是否存在
SELECT name FROM sqlite_master WHERE type='table' AND name='dashboard_traffic_summary';

-- 检查traffic_hourly_summary表结构
PRAGMA table_info(traffic_hourly_summary);
```

## 初始化流量数据

### 手动初始化
如果需要手动初始化最近24小时的流量汇总数据，可以使用以下命令：

```bash
# 初始化最近24小时的流量数据
go run cmd/tools/traffic-init.go -hours=24

# 初始化最近48小时的流量数据
go run cmd/tools/traffic-init.go -hours=48
```

### 自动初始化
流量调度器会在启动时自动执行初始化：
1. 初始化最近24小时的流量汇总数据
2. 执行启动时常规数据聚合

## 测试验证

### 运行测试脚本
```bash
# 运行测试脚本验证功能
./scripts/test-new-traffic-scheduler.sh
```

### 手动验证
```sql
-- 检查service_history表数据
SELECT COUNT(*) FROM service_history WHERE record_time >= datetime('now', '-24 hours');

-- 检查traffic_hourly_summary表数据
SELECT COUNT(*) FROM traffic_hourly_summary WHERE hour_time >= datetime('now', '-24 hours');

-- 检查dashboard_traffic_summary表数据
SELECT COUNT(*) FROM dashboard_traffic_summary WHERE hour_time >= datetime('now', '-24 hours');

-- 验证差值计算逻辑
SELECT 
    hour_time,
    instance_id,
    tcp_rx_total,
    tcp_rx_increment,
    CASE 
        WHEN tcp_rx_increment = tcp_rx_total THEN '首次记录'
        WHEN tcp_rx_increment >= 0 THEN '正常差值'
        ELSE '异常差值'
    END as increment_status
FROM traffic_hourly_summary 
WHERE hour_time >= datetime('now', '-24 hours')
ORDER BY hour_time DESC, instance_id
LIMIT 10;
```

## 监控要点

### 1. 数据量监控
- 监控 `service_history` 表的数据量（每分钟一条记录）
- 监控 `traffic_hourly_summary` 表的数据量（每小时每个实例一条记录）
- 监控 `dashboard_traffic_summary` 表的数据量（每小时一条记录）

### 2. 性能监控
- 监控汇总任务的执行时间
- 监控dashboard查询性能
- 监控数据库连接池使用情况

### 3. 数据质量监控
- 检查差值计算是否正确
- 检查数据时间范围是否完整
- 检查实例数量是否一致

## 故障排除

### 常见问题

#### 1. 启动报错：NOT NULL constraint failed
**错误信息**: `NOT NULL constraint failed: traffic_hourly_summary.tunnel_id`

**解决方案**: 
- 执行迁移文件 `024_fix_traffic_hourly_summary_structure.sql`
- 确保表结构正确，没有 `tunnel_id` 字段

#### 2. 数据初始化失败
**错误信息**: `初始化汇总数据失败`

**解决方案**:
- 检查 `service_history` 表是否有数据
- 确保数据库连接正常
- 检查表结构是否正确

#### 3. 差值计算异常
**现象**: `tcp_rx_increment` 为负数或异常值

**解决方案**:
- 检查 `service_history` 表的累计值是否正确
- 验证时间范围是否合理
- 检查是否有数据重置或异常

### 日志查看
```bash
# 查看流量调度器日志
tail -f logs/app.log | grep "流量调度器"

# 查看数据库操作日志
tail -f logs/app.log | grep "数据库"
```

## 配置说明

### 清理策略
- `endpoint_sse`: 30天前
- `service_history`: 7天前
- `traffic_hourly_summary`: 1年前
- `dashboard_traffic_summary`: 1年前

### 汇总频率
- 每小时执行一次数据聚合
- 每天凌晨3点执行数据清理

## 总结

新的流量调度器实现了：

1. ✅ 数据源从 `endpoint_sse` 改为 `service_history`
2. ✅ 汇总逻辑改为获取上一小时59分的累计值
3. ✅ 支持初始化时的更新处理
4. ✅ 新增dashboard汇总表
5. ✅ 优化了查询性能和存储效率
6. ✅ 保持了向后兼容性
7. ✅ 添加了差值计算逻辑

如果遇到问题，请参考故障排除部分或查看相关日志。
