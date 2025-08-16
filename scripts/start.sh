#!/bin/bash

# NodePassDash MySQL + GORM 启动脚本
# 演示多种数据库连接配置方式

set -e

echo "🚀 NodePassDash MySQL + GORM 启动脚本"
echo "======================================"

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# 检查Go环境
if ! command -v go &> /dev/null; then
    echo "❌ Go 未安装或未添加到 PATH"
    exit 1
fi

echo "✅ Go 版本: $(go version)"

# 构建应用
echo "🔨 构建应用..."
go build -o nodepass-dashboard ./cmd/server

# 配置方式选择
echo ""
echo "选择数据库配置方式:"
echo "1. 使用环境变量 (.env 文件)"
echo "2. 使用命令行参数"
echo "3. 使用默认配置"
echo "4. 交互式配置"

read -p "请选择 (1-4): " choice

case $choice in
    1)
        echo "📝 使用环境变量配置..."
        if [ ! -f ".env" ]; then
            echo "⚠️  .env 文件不存在，从示例文件创建..."
            cp config.env.sample .env
            echo "✅ 已创建 .env 文件，请编辑数据库配置后重新运行"
            exit 0
        fi
        
        # 导出环境变量
        export $(grep -v '^#' .env | xargs)
        echo "✅ 已加载环境变量配置"
        ;;
        
    2)
        echo "⌨️  使用命令行参数配置..."
        read -p "MySQL 主机 [localhost]: " db_host
        read -p "MySQL 端口 [3306]: " db_port
        read -p "MySQL 用户名 [nodepass]: " db_user
        read -s -p "MySQL 密码: " db_password
        echo
        read -p "数据库名 [nodepass_dashboard]: " db_name
        
        # 设置默认值
        db_host=${db_host:-localhost}
        db_port=${db_port:-3306}
        db_user=${db_user:-nodepass}
        db_name=${db_name:-nodepass_dashboard}
        
        # 构建命令行参数
        DB_ARGS=(
            --db-host="$db_host"
            --db-port="$db_port"
            --db-user="$db_user"
            --db-password="$db_password"
            --db-name="$db_name"
        )
        echo "✅ 已设置命令行参数"
        ;;
        
    3)
        echo "🔧 使用默认配置..."
        echo "  主机: localhost:3306"
        echo "  用户: nodepass"
        echo "  数据库: nodepass_dashboard"
        echo "⚠️  请确保 MySQL 服务运行且配置正确"
        DB_ARGS=()
        ;;
        
    4)
        echo "💬 交互式配置..."
        
        # 数据库连接配置
        read -p "MySQL 主机 [localhost]: " db_host
        read -p "MySQL 端口 [3306]: " db_port
        read -p "MySQL 用户名 [nodepass]: " db_user
        read -s -p "MySQL 密码: " db_password
        echo
        read -p "数据库名 [nodepass_dashboard]: " db_name
        read -p "字符集 [utf8mb4]: " db_charset
        
        # 连接池配置
        read -p "最大连接数 [100]: " db_max_open
        read -p "最大空闲连接数 [10]: " db_max_idle
        read -p "日志级别 (silent/error/warn/info) [info]: " db_log_level
        
        # 设置默认值
        db_host=${db_host:-localhost}
        db_port=${db_port:-3306}
        db_user=${db_user:-nodepass}
        db_name=${db_name:-nodepass_dashboard}
        db_charset=${db_charset:-utf8mb4}
        db_max_open=${db_max_open:-100}
        db_max_idle=${db_max_idle:-10}
        db_log_level=${db_log_level:-info}
        
        # 导出环境变量
        export DB_HOST="$db_host"
        export DB_PORT="$db_port"
        export DB_USERNAME="$db_user"
        export DB_PASSWORD="$db_password"
        export DB_DATABASE="$db_name"
        export DB_CHARSET="$db_charset"
        export DB_MAX_OPEN_CONNS="$db_max_open"
        export DB_MAX_IDLE_CONNS="$db_max_idle"
        export DB_LOG_LEVEL="$db_log_level"
        
        DB_ARGS=()
        echo "✅ 已设置交互式配置"
        ;;
        
    *)
        echo "❌ 无效选择，使用默认配置"
        DB_ARGS=()
        ;;
esac

# 检查MySQL连接
echo ""
echo "🔍 检查MySQL连接..."

# 创建临时的连接测试脚本
cat > /tmp/test_mysql.sql << EOF
SELECT 1 as test;
EOF

# 根据配置方式测试连接
if [ "$choice" == "1" ] && [ -f ".env" ]; then
    # 从.env文件读取配置
    DB_HOST=$(grep '^DB_HOST=' .env | cut -d'=' -f2)
    DB_PORT=$(grep '^DB_PORT=' .env | cut -d'=' -f2)
    DB_USERNAME=$(grep '^DB_USERNAME=' .env | cut -d'=' -f2)
    DB_PASSWORD=$(grep '^DB_PASSWORD=' .env | cut -d'=' -f2)
    
    if command -v mysql &> /dev/null; then
        if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USERNAME" -p"$DB_PASSWORD" -e "SELECT 1;" &> /dev/null; then
            echo "✅ MySQL 连接测试成功"
        else
            echo "⚠️  MySQL 连接测试失败，但程序仍将尝试连接"
        fi
    else
        echo "⚠️  mysql 客户端未安装，跳过连接测试"
    fi
else
    echo "⚠️  跳过MySQL连接测试"
fi

# 清理临时文件
rm -f /tmp/test_mysql.sql

# 启动应用
echo ""
echo "🚀 启动 NodePassDash..."
echo "Ctrl+C 停止应用"
echo ""

# 根据配置方式启动
if [ ${#DB_ARGS[@]} -eq 0 ]; then
    ./nodepass-dashboard
else
    ./nodepass-dashboard "${DB_ARGS[@]}"
fi 