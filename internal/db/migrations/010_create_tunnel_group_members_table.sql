-- 创建隧道分组成员关联表
CREATE TABLE IF NOT EXISTS tunnel_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    tunnel_id TEXT NOT NULL,
    role TEXT DEFAULT 'member', -- 角色: source(入口端), target(出口端), member(普通成员)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键约束
    FOREIGN KEY (group_id) REFERENCES tunnel_groups(id) ON DELETE CASCADE,
    
    -- 唯一性约束，防止同一个隧道在同一个分组中重复添加
    UNIQUE(group_id, tunnel_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tunnel_group_members_group_id ON tunnel_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_tunnel_group_members_tunnel_id ON tunnel_group_members(tunnel_id);
CREATE INDEX IF NOT EXISTS idx_tunnel_group_members_role ON tunnel_group_members(role); 