-- 为服务历史监控表添加速度字段
-- 用于存储平均入站和出站速度（bytes/s）

-- 添加平均速度字段
ALTER TABLE service_history ADD COLUMN avg_speed_in REAL DEFAULT 0;   -- 平均入站速度 (bytes/s)
ALTER TABLE service_history ADD COLUMN avg_speed_out REAL DEFAULT 0;  -- 平均出站速度 (bytes/s)

-- 添加注释说明
-- avg_speed_in: 平均入站速度，单位为 bytes/s
-- 计算公式：基于相邻数据点的实际时间差计算瞬时速度，然后求平均
-- 瞬时速度 = (TCP入站差值 + UDP入站差值) / 实际时间差(秒)
-- 
-- avg_speed_out: 平均出站速度，单位为 bytes/s  
-- 计算公式：基于相邻数据点的实际时间差计算瞬时速度，然后求平均
-- 瞬时速度 = (TCP出站差值 + UDP出站差值) / 实际时间差(秒)
-- 
-- 时间差范围：0.1秒 - 60秒（异常值会被过滤）
