-- 为隧道表添加重启策略字段
ALTER TABLE "Tunnel" ADD COLUMN restart BOOLEAN DEFAULT FALSE;

-- 为隧道回收站表也添加重启策略字段以保持一致性
ALTER TABLE "TunnelRecycle" ADD COLUMN restart BOOLEAN DEFAULT FALSE; 