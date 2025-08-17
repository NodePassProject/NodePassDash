-- 创建dashboard流量汇总表
-- 用于存储按小时汇总的所有实例流量累计值总和
-- 每小时有且只有一条数据，记录该小时所有实例的最后累计值总和

CREATE TABLE IF NOT EXISTS dashboard_traffic_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_time DATETIME NOT NULL UNIQUE,           -- 小时时间戳（整点）
    tcp_rx_total INTEGER DEFAULT 0,               -- 所有实例TCP接收累计值总和
    tcp_tx_total INTEGER DEFAULT 0,               -- 所有实例TCP发送累计值总和
    udp_rx_total INTEGER DEFAULT 0,               -- 所有实例UDP接收累计值总和
    udp_tx_total INTEGER DEFAULT 0,               -- 所有实例UDP发送累计值总和
    instance_count INTEGER DEFAULT 0,             -- 参与汇总的实例数量
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_dashboard_traffic_hour_time ON dashboard_traffic_summary(hour_time);

-- 创建触发器自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS trig_dashboard_traffic_summary_updated_at
AFTER UPDATE ON dashboard_traffic_summary
BEGIN
    UPDATE dashboard_traffic_summary 
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
