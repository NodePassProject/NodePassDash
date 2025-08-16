#!/bin/bash

# 测试MySQL兼容性和流量数据初始化
# 使用方法：./scripts/test-mysql-compatibility.sh

echo "=== MySQL兼容性测试 ==="

# 检查MySQL版本
echo "1. 检查MySQL版本..."
mysql --version

# 检查数据库连接
echo -e "\n2. 检查数据库连接..."
mysql -e "SELECT VERSION() as mysql_version, NOW() as current_time;" 2>/dev/null && echo "数据库连接正常" || echo "数据库连接失败"

# 检查汇总表是否存在
echo -e "\n3. 检查汇总表结构..."
mysql -e "DESCRIBE traffic_hourly_summary;" 2>/dev/null && echo "汇总表存在" || echo "汇总表不存在，需要运行迁移"

# 检查原始数据
echo -e "\n4. 检查原始数据量..."
mysql -e "
SELECT 
    DATE(event_time) as date,
    COUNT(*) as record_count,
    COUNT(DISTINCT instance_id) as unique_instances
FROM endpoint_sse 
WHERE push_type IN ('initial', 'update') 
  AND event_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY DATE(event_time) 
ORDER BY date DESC;
" 2>/dev/null || echo "查询原始数据失败"

echo -e "\n=== 开始测试流量数据初始化 ==="

# 重新启动服务来触发初始化
echo "5. 测试流量数据初始化..."
echo "请重启NodePassDash服务以触发自动初始化"
echo "或者运行: go run cmd/tools/init-traffic-data.go -hours=24"

echo -e "\n=== 测试完成 ==="

