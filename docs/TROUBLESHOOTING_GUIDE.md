# NodePassDash 问题排查指南

本文档提供了常见问题的解决方案，帮助你快速排除系统运行中遇到的问题。

## 🚨 常见错误及解决方案

### 1. SSE Chunk 解析错误

**错误信息：**
```
Failed to proxy http://localhost:3000/api/sse/tunnel/bd7a6b07 [Error: Parse Error: Invalid character in chunk size]
{
  bytesParsed: 676,
  code: 'HPE_INVALID_CHUNK_SIZE',
  reason: 'Invalid character in chunk size',
  rawPacket: <Buffer ...>
}
```

**问题原因：**
- HTTP chunk 编码格式问题
- SSE 响应头设置不标准
- 代理服务器（如 nginx）缓冲问题

**解决方案：**

1. **更新 SSE 响应头**（已修复）：
   ```go
   // 标准的 SSE 响应头设置
   w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
   w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
   w.Header().Set("Pragma", "no-cache")
   w.Header().Set("Expires", "0")
   w.Header().Set("Connection", "keep-alive")
   w.Header().Set("X-Accel-Buffering", "no") // 禁用nginx缓冲
   ```

2. **如果使用代理服务器**，添加以下配置：
   ```nginx
   # nginx 配置
   location /api/sse/ {
       proxy_pass http://backend;
       proxy_buffering off;
       proxy_cache off;
       proxy_set_header Connection '';
       proxy_http_version 1.1;
       chunked_transfer_encoding off;
   }
   ```

3. **重启服务**：
   ```bash
   # 重启后端服务
   go run cmd/enhanced-with-metrics/main.go
   
   # 如果使用代理，同时重启代理服务
   sudo nginx -s reload
   ```

### 2. 数据库表结构错误

**错误信息：**
```
NOT NULL constraint failed: traffic_hourly_summary.tunnel_id
[流量调度器] 初始化24小时汇总数据失败: 初始化小时数据失败 2025-08-09 14:00: 插入汇总数据失败: NOT NULL constraint failed: traffic_hourly_summary.tunnel_id
```

**问题原因：**
- 数据库中的表结构与代码定义不一致
- 存在已废弃的 `tunnel_id` 字段，但代码使用 `instance_id`

**解决方案：**

#### 方案 1：自动修复工具（推荐）

1. **运行诊断工具**：
   ```bash
   go run cmd/tools/fix-database-schema.go --db=public/database.db --dry-run
   ```

2. **查看检查结果**，确认需要修复的问题。

3. **执行修复**（⚠️ 会重建表结构，现有数据会备份但无法自动迁移）：
   ```bash
   go run cmd/tools/fix-database-schema.go --db=public/database.db --force
   ```

#### 方案 2：手动数据库修复

1. **备份数据库**：
   ```bash
   cp public/database.db public/database.db.backup
   ```

2. **连接到数据库**：
   ```bash
   sqlite3 public/database.db
   ```

3. **检查表结构**：
   ```sql
   .schema traffic_hourly_summary
   PRAGMA table_info(traffic_hourly_summary);
   ```

4. **如果存在 tunnel_id 字段**，重建表：
   ```sql
   -- 删除问题表
   DROP TABLE IF EXISTS traffic_hourly_summary;
   
   -- 重新创建正确的表结构
   CREATE TABLE traffic_hourly_summary (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       hour_time DATETIME NOT NULL,
       instance_id TEXT NOT NULL,        -- 关键：使用 instance_id 而不是 tunnel_id
       endpoint_id INTEGER NOT NULL,
       tcp_rx_total INTEGER DEFAULT 0,
       tcp_tx_total INTEGER DEFAULT 0,
       udp_rx_total INTEGER DEFAULT 0,
       udp_tx_total INTEGER DEFAULT 0,
       tcp_rx_increment INTEGER DEFAULT 0,
       tcp_tx_increment INTEGER DEFAULT 0,
       udp_rx_increment INTEGER DEFAULT 0,
       udp_tx_increment INTEGER DEFAULT 0,
       record_count INTEGER DEFAULT 0,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
   );
   
   -- 创建索引
   CREATE UNIQUE INDEX uk_traffic_hourly ON traffic_hourly_summary (hour_time, instance_id);
   CREATE INDEX idx_traffic_hour_time ON traffic_hourly_summary (hour_time);
   CREATE INDEX idx_traffic_instance_time ON traffic_hourly_summary (instance_id, hour_time);
   CREATE INDEX idx_traffic_endpoint_time ON traffic_hourly_summary (endpoint_id, hour_time);
   ```

5. **退出并重启服务**：
   ```sql
   .quit
   ```

#### 方案 3：删除数据库重新初始化

如果不需要保留历史数据：

```bash
# 停止服务
pkill -f "NodePassDash"

# 删除数据库文件
rm public/database.db

# 重新启动，系统会自动创建新的数据库
go run cmd/enhanced-with-metrics/main.go
```

## 🔍 验证修复结果

### 检查 SSE 连接

1. **打开浏览器开发者工具**
2. **访问隧道详情页面**
3. **检查网络标签页**，确认 SSE 连接正常（状态为 200，类型为 `text/event-stream`）

### 检查数据库表结构

```bash
# 检查表结构
sqlite3 public/database.db "PRAGMA table_info(traffic_hourly_summary);"

# 应该看到类似输出：
# 0|id|INTEGER|0||1
# 1|hour_time|DATETIME|1||0  
# 2|instance_id|TEXT|1||0     ← 关键：应该是 instance_id
# 3|endpoint_id|INTEGER|1||0
# ...
```

### 检查流量调度器

查看日志输出，确认没有错误：

```bash
# 启动服务并观察日志
go run cmd/enhanced-with-metrics/main.go

# 应该看到类似输出：
# [流量调度器] 启动定时任务...
# [流量调度器] 开始初始化最近24小时流量汇总数据...
# [流量调度器] 初始化24小时汇总数据完成，耗时: xxx
```

## 🛡️ 预防措施

### 1. 定期备份数据库

```bash
# 创建备份脚本
#!/bin/bash
DATE=$(date +"%Y%m%d_%H%M%S")
cp public/database.db "backups/database_${DATE}.db"
echo "数据库已备份至: backups/database_${DATE}.db"
```

### 2. 使用版本控制跟踪数据库结构变化

```bash
# 导出数据库结构
sqlite3 public/database.db .schema > schema_dump.sql
```

### 3. 监控系统日志

```bash
# 使用 systemd 或其他日志管理工具监控错误
journalctl -u nodepass-dashboard -f
```

## 🆘 获取帮助

如果按照上述方案仍无法解决问题，请：

1. **收集日志信息**：
   ```bash
   # 启动服务并记录详细日志
   go run cmd/enhanced-with-metrics/main.go > debug.log 2>&1
   ```

2. **检查数据库状态**：
   ```bash
   sqlite3 public/database.db "
   SELECT name FROM sqlite_master WHERE type='table';
   PRAGMA table_info(traffic_hourly_summary);
   SELECT COUNT(*) FROM traffic_hourly_summary;
   "
   ```

3. **提供环境信息**：
   - 操作系统版本
   - Go 版本
   - 数据库文件大小
   - 错误日志完整输出

## 📋 问题检查清单

在报告问题前，请确认已经检查：

- [ ] 数据库文件权限正确
- [ ] 没有其他进程占用数据库文件
- [ ] 磁盘空间充足
- [ ] 端口没有被其他服务占用
- [ ] 防火墙或代理配置正确
- [ ] 使用了正确的命令行参数
- [ ] 查看了完整的错误日志

---

**最后更新：** 2025-08-09  
**版本：** Enhanced with Metrics v1.0.0
