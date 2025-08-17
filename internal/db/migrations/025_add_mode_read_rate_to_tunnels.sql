-- 为tunnels表添加mode、read、rate字段
-- mode字段用于存储隧道模式（0、1、2）
-- read字段用于存储读取配置
-- rate字段用于存储速率限制配置

-- 添加mode字段（注意：这里需要重命名现有的mode字段，因为它与type字段功能重复）
-- 首先将现有的mode字段重命名为tunnel_type
ALTER TABLE tunnels RENAME COLUMN mode TO tunnel_type;

-- 添加新的mode字段
ALTER TABLE tunnels ADD COLUMN mode TEXT CHECK (mode IN ('0', '1', '2'));

-- 添加read字段
ALTER TABLE tunnels ADD COLUMN read TEXT;

-- 添加rate字段
ALTER TABLE tunnels ADD COLUMN rate TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tunnels_mode ON tunnels(mode);
CREATE INDEX IF NOT EXISTS idx_tunnels_read ON tunnels(read);
CREATE INDEX IF NOT EXISTS idx_tunnels_rate ON tunnels(rate);
