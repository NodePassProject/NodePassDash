-- 创建隧道分组表
CREATE TABLE IF NOT EXISTS tunnel_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'custom', -- 分组类型: single, double, custom
    color TEXT DEFAULT '#3B82F6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tunnel_groups_name ON tunnel_groups(name);
CREATE INDEX IF NOT EXISTS idx_tunnel_groups_type ON tunnel_groups(type);
CREATE INDEX IF NOT EXISTS idx_tunnel_groups_created_at ON tunnel_groups(created_at); 