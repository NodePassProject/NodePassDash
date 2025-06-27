-- 创建隧道表
CREATE TABLE IF NOT EXISTS tunnels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    endpoint_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('server', 'client')),
    tunnel_address TEXT NOT NULL,
    tunnel_port INTEGER NOT NULL,
    target_address TEXT NOT NULL,
    target_port INTEGER NOT NULL,
    tls_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (tls_mode IN ('inherit', 'mode0', 'mode1', 'mode2')),
    cert_path TEXT,
    key_path TEXT,
    log_level TEXT NOT NULL DEFAULT 'inherit' CHECK (log_level IN ('inherit', 'debug', 'info', 'warn', 'error')),
    command_line TEXT NOT NULL,
    restart BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'error')),
    tcp_rx INTEGER NOT NULL DEFAULT 0,
    tcp_tx INTEGER NOT NULL DEFAULT 0,
    udp_rx INTEGER NOT NULL DEFAULT 0,
    udp_tx INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tunnels_instance_id ON tunnels(instance_id);
CREATE INDEX IF NOT EXISTS idx_tunnels_name ON tunnels(name);
CREATE INDEX IF NOT EXISTS idx_tunnels_endpoint_id ON tunnels(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_tunnels_status ON tunnels(status);
CREATE INDEX IF NOT EXISTS idx_tunnels_created_at ON tunnels(created_at);

-- 创建隧道操作日志表
CREATE TABLE IF NOT EXISTS tunnel_operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tunnel_id INTEGER NOT NULL,
    tunnel_name TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tunnel_logs_tunnel_id ON tunnel_operation_logs(tunnel_id);
CREATE INDEX IF NOT EXISTS idx_tunnel_logs_action ON tunnel_operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_tunnel_logs_created_at ON tunnel_operation_logs(created_at); 