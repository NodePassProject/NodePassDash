-- 修复流量汇总表结构不一致问题
-- 如果存在tunnel_id字段，需要重建表结构

-- 1. 检查并备份现有数据（如果存在）
CREATE TABLE IF NOT EXISTS traffic_hourly_summary_backup AS 
SELECT * FROM traffic_hourly_summary WHERE 1=0;

-- 2. 删除旧的流量汇总表（如果存在且结构不对）
DROP TABLE IF EXISTS traffic_hourly_summary;

-- 3. 重新创建正确的流量汇总表
CREATE TABLE traffic_hourly_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_time DATETIME NOT NULL,              -- 小时时间戳（整点）
    instance_id TEXT NOT NULL,                -- 实例ID（而不是tunnel_id）
    endpoint_id INTEGER NOT NULL,             -- 主控ID
    tcp_rx_total INTEGER DEFAULT 0,           -- TCP接收累计值
    tcp_tx_total INTEGER DEFAULT 0,           -- TCP发送累计值
    udp_rx_total INTEGER DEFAULT 0,           -- UDP接收累计值
    udp_tx_total INTEGER DEFAULT 0,           -- UDP发送累计值
    tcp_rx_increment INTEGER DEFAULT 0,       -- TCP接收增量
    tcp_tx_increment INTEGER DEFAULT 0,       -- TCP发送增量
    udp_rx_increment INTEGER DEFAULT 0,       -- UDP接收增量
    udp_tx_increment INTEGER DEFAULT 0,       -- UDP发送增量
    record_count INTEGER DEFAULT 0,           -- 该小时的记录数量
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
);

-- 4. 重新创建索引
CREATE UNIQUE INDEX uk_traffic_hourly 
ON traffic_hourly_summary (hour_time, instance_id);

CREATE INDEX idx_traffic_hour_time 
ON traffic_hourly_summary (hour_time);

CREATE INDEX idx_traffic_instance_time 
ON traffic_hourly_summary (instance_id, hour_time);

CREATE INDEX idx_traffic_endpoint_time 
ON traffic_hourly_summary (endpoint_id, hour_time);

-- 5. 重新创建触发器
CREATE TRIGGER trig_traffic_hourly_summary_updated_at
AFTER UPDATE ON traffic_hourly_summary
BEGIN
    UPDATE traffic_hourly_summary 
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- 6. 清理备份表（因为我们没有真正使用它）
DROP TABLE IF EXISTS traffic_hourly_summary_backup;
