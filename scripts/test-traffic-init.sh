#!/bin/bash

# 测试流量数据初始化功能
# 使用方法：./scripts/test-traffic-init.sh

echo "=== 流量汇总数据初始化测试 ==="

# 检查汇总表是否存在
echo "1. 检查汇总表状态..."
echo "SELECT COUNT(*) as total_records FROM traffic_hourly_summary;" | mysql -h localhost -u root -p nodepass_dashboard

# 查看最近24小时的汇总数据
echo -e "\n2. 查看最近24小时汇总数据..."
echo "
SELECT 
    hour_time,
    COUNT(*) as instance_count,
    SUM(tcp_rx_increment + tcp_tx_increment + udp_rx_increment + udp_tx_increment) as total_traffic
FROM traffic_hourly_summary 
WHERE hour_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY hour_time 
ORDER BY hour_time DESC;
" | mysql -h localhost -u root -p nodepass_dashboard

# 执行初始化工具
echo -e "\n3. 执行初始化工具..."
go run cmd/tools/init-traffic-data.go -hours=24

# 再次查看汇总数据
echo -e "\n4. 初始化后的汇总数据..."
echo "
SELECT 
    hour_time,
    COUNT(*) as instance_count,
    SUM(tcp_rx_increment + tcp_tx_increment + udp_rx_increment + udp_tx_increment) as total_traffic,
    created_at
FROM traffic_hourly_summary 
WHERE hour_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY hour_time 
ORDER BY hour_time DESC;
" | mysql -h localhost -u root -p nodepass_dashboard

echo -e "\n=== 测试完成 ==="

