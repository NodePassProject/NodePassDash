-- 创建服务历史监控表（类似Nezha的ServiceHistory表）
-- 用于存储每个实例的聚合监控数据（每分钟一条记录）

CREATE TABLE IF NOT EXISTS service_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL,
    instance_id TEXT NOT NULL,
    
    -- 聚合后的网络流量平均值
    avg_tcp_in REAL DEFAULT 0,    -- 平均TCP入站
    avg_tcp_out REAL DEFAULT 0,   -- 平均TCP出站
    avg_udp_in REAL DEFAULT 0,    -- 平均UDP入站
    avg_udp_out REAL DEFAULT 0,   -- 平均UDP出站
    avg_ping REAL DEFAULT 0,      -- 平均延迟
    avg_pool REAL DEFAULT 0,      -- 平均连接池
    
    -- 统计信息
    record_count INTEGER DEFAULT 0,  -- 参与聚合的数据点数量
    up_count INTEGER DEFAULT 0,      -- 在线次数（用于加权平均）
    record_time DATETIME NOT NULL,   -- 记录时间（每分钟一条记录）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_service_history_endpoint_id ON service_history(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_service_history_instance_id ON service_history(instance_id);
CREATE INDEX IF NOT EXISTS idx_service_history_record_time ON service_history(record_time);
CREATE INDEX IF NOT EXISTS idx_service_history_endpoint_instance ON service_history(endpoint_id, instance_id);
CREATE INDEX IF NOT EXISTS idx_service_history_time_range ON service_history(record_time, endpoint_id, instance_id);
