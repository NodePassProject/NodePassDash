-- 修改service_history表字段命名：将avg_开头的流量字段改为delta_
-- 这样可以更准确地表达这些字段存储的是流量差值而非平均值

-- 重命名流量相关字段
ALTER TABLE service_history RENAME COLUMN avg_tcp_in TO delta_tcp_in;
ALTER TABLE service_history RENAME COLUMN avg_tcp_out TO delta_tcp_out;
ALTER TABLE service_history RENAME COLUMN avg_udp_in TO delta_udp_in;
ALTER TABLE service_history RENAME COLUMN avg_udp_out TO delta_udp_out;

-- 注意：avg_ping 和 avg_pool 保持不变，因为它们确实是平均值
-- 注意：avg_speed_in 和 avg_speed_out 保持不变，因为它们也是平均值
