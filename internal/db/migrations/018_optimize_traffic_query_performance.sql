-- 优化流量查询性能的数据库索引和结构
-- 针对首页流量图查询优化

-- 创建流量汇总表
CREATE TABLE IF NOT EXISTS traffic_hourly_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_time DATETIME NOT NULL,              -- 小时时间戳（整点）
    instance_id TEXT NOT NULL,                -- 实例ID
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

-- 创建索引
CREATE UNIQUE INDEX IF NOT EXISTS uk_traffic_hourly 
ON traffic_hourly_summary (hour_time, instance_id);

CREATE INDEX IF NOT EXISTS idx_traffic_hour_time 
ON traffic_hourly_summary (hour_time);

CREATE INDEX IF NOT EXISTS idx_traffic_instance_time 
ON traffic_hourly_summary (instance_id, hour_time);

CREATE INDEX IF NOT EXISTS idx_traffic_endpoint_time 
ON traffic_hourly_summary (endpoint_id, hour_time);

-- 创建触发器自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS trig_traffic_hourly_summary_updated_at
AFTER UPDATE ON traffic_hourly_summary
BEGIN
    UPDATE traffic_hourly_summary 
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;