-- 为端点表添加运行时间字段
ALTER TABLE "Endpoint" ADD COLUMN uptime INTEGER DEFAULT NULL;

-- 为uptime字段添加索引
CREATE INDEX IF NOT EXISTS idx_endpoints_uptime ON "Endpoint"(uptime); 