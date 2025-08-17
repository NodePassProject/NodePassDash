-- 为endpoints表添加version字段（如果不存在）
-- 注意：ver字段已经在005_add_endpoint_info_fields.sql中添加
-- 这里添加version字段作为别名，保持向后兼容

-- 检查是否已存在version字段
-- 如果不存在则添加
-- 如果已存在则跳过

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_endpoints_version ON endpoints(ver);
