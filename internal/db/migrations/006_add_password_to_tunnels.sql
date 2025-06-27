-- 为隧道表添加密码字段
ALTER TABLE "Tunnel" ADD COLUMN password TEXT DEFAULT '';

-- 为隧道回收站表也添加密码字段以保持一致性
ALTER TABLE "TunnelRecycle" ADD COLUMN password TEXT DEFAULT ''; 