-- 为端点表添加IP字段
ALTER TABLE "endpoints" ADD COLUMN ip TEXT DEFAULT '';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_endpoints_ip ON endpoints(ip);
