#!/bin/bash

# NodePassDash 一键安装脚本
# 支持 Linux 系统的自动安装和配置

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
BINARY_NAME="nodepassdash"
INSTALL_DIR="/opt/nodepassdash"
USER_NAME="nodepass"
SERVICE_NAME="nodepassdash"
DEFAULT_PORT="3000"

# GitHub 仓库信息
GITHUB_REPO="NodePassProject/NodePassDash"
GITHUB_API="https://api.github.com/repos/${GITHUB_REPO}"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否以 root 权限运行
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本需要 root 权限运行，请使用 sudo"
        exit 1
    fi
}

# 检测系统信息
detect_system() {
    log_info "检测系统信息..."
    
    # 检测操作系统
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    else
        log_error "无法检测操作系统"
        exit 1
    fi
    
    # 检测架构
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64)
            ARCH="arm64"
            ;;
        armv7l)
            ARCH="arm"
            ;;
        *)
            log_error "不支持的架构: $ARCH"
            exit 1
            ;;
    esac
    
    log_success "系统: $OS $VERSION, 架构: $ARCH"
}

# 检查系统依赖
check_dependencies() {
    log_info "检查系统依赖..."
    
    local deps=("curl" "wget" "systemctl")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_warning "缺少依赖: ${missing_deps[*]}"
        log_info "尝试自动安装依赖..."
        
        case $OS in
            ubuntu|debian)
                apt-get update && apt-get install -y "${missing_deps[@]}"
                ;;
            centos|rhel|rocky|almalinux)
                yum install -y "${missing_deps[@]}" || dnf install -y "${missing_deps[@]}"
                ;;
            *)
                log_error "请手动安装以下依赖: ${missing_deps[*]}"
                exit 1
                ;;
        esac
    fi
    
    log_success "依赖检查完成"
}

# 获取最新版本信息
get_latest_version() {
    log_info "获取最新版本信息..."
    
    local api_response
    api_response=$(curl -s "$GITHUB_API/releases/latest")
    
    if [[ $? -ne 0 ]]; then
        log_error "无法获取版本信息，请检查网络连接"
        exit 1
    fi
    
    VERSION=$(echo "$api_response" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    if [[ -z "$VERSION" ]]; then
        log_error "解析版本信息失败"
        exit 1
    fi
    
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${BINARY_NAME}-linux-${ARCH}"
    
    log_success "最新版本: $VERSION"
}

# 下载二进制文件
download_binary() {
    log_info "下载 NodePassDash 二进制文件..."
    
    local temp_file="/tmp/${BINARY_NAME}"
    
    if ! curl -L -o "$temp_file" "$DOWNLOAD_URL"; then
        log_error "下载失败"
        exit 1
    fi
    
    # 验证下载文件
    if [[ ! -f "$temp_file" ]] || [[ ! -s "$temp_file" ]]; then
        log_error "下载的文件无效"
        exit 1
    fi
    
    chmod +x "$temp_file"
    BINARY_PATH="$temp_file"
    
    log_success "下载完成"
}

# 创建用户和目录
setup_user_and_dirs() {
    log_info "创建用户和目录结构..."
    
    # 创建系统用户
    if ! id "$USER_NAME" &>/dev/null; then
        useradd --system --home "$INSTALL_DIR" --shell /bin/false "$USER_NAME"
        log_success "创建用户: $USER_NAME"
    else
        log_info "用户 $USER_NAME 已存在"
    fi
    
    # 创建目录结构
    mkdir -p "$INSTALL_DIR"/{bin,data,logs,backups}
    mkdir -p /etc/nodepassdash
    
    # 设置权限
    chown -R root:root "$INSTALL_DIR/bin" 2>/dev/null || true
    chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"/{data,logs,backups}
    
    log_success "目录结构创建完成"
}

# 安装二进制文件
install_binary() {
    log_info "安装二进制文件..."
    
    # 备份旧版本
    if [[ -f "$INSTALL_DIR/bin/$BINARY_NAME" ]]; then
        cp "$INSTALL_DIR/bin/$BINARY_NAME" "$INSTALL_DIR/bin/${BINARY_NAME}.backup.$(date +%Y%m%d%H%M%S)"
        log_info "已备份旧版本"
    fi
    
    # 安装新版本
    cp "$BINARY_PATH" "$INSTALL_DIR/bin/$BINARY_NAME"
    chmod 755 "$INSTALL_DIR/bin/$BINARY_NAME"
    chown root:root "$INSTALL_DIR/bin/$BINARY_NAME"
    
    # 创建软链接
    ln -sf "$INSTALL_DIR/bin/$BINARY_NAME" "/usr/local/bin/$BINARY_NAME"
    
    log_success "二进制文件安装完成"
}

# 创建配置文件
create_config() {
    log_info "创建配置文件..."
    
    cat > /etc/nodepassdash/config.env << EOF
# NodePassDash 配置文件
PORT=$DEFAULT_PORT
DATA_DIR=$INSTALL_DIR/data
LOG_DIR=$INSTALL_DIR/logs
LOG_LEVEL=info
EOF
    
    chmod 644 /etc/nodepassdash/config.env
    
    log_success "配置文件创建完成"
}

# 创建 systemd 服务
create_systemd_service() {
    log_info "创建 systemd 服务..."
    
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=NodePassDash - NodePass Management Dashboard
Documentation=https://github.com/NodePassProject/NodePassDash
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/bin/$BINARY_NAME --port $DEFAULT_PORT
ExecReload=/bin/kill -HUP \$MAINPID
EnvironmentFile=-/etc/nodepassdash/config.env

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/data $INSTALL_DIR/logs

# 资源限制
LimitNOFILE=65536
LimitNPROC=4096

# 重启策略
Restart=always
RestartSec=5
KillMode=mixed
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
    
    # 重新加载 systemd
    systemctl daemon-reload
    
    log_success "systemd 服务创建完成"
}

# 创建管理脚本
create_management_script() {
    log_info "创建管理脚本..."
    
    cat > /usr/local/bin/nodepassdash-ctl << 'EOF'
#!/bin/bash

# NodePassDash 管理脚本
# 使用方式: nodepassdash-ctl {start|stop|restart|status|logs|reset-password|update}

BINARY_PATH="/opt/nodepassdash/bin/nodepassdash"
SERVICE_NAME="nodepassdash"

case "$1" in
    start)
        echo "启动 NodePassDash..."
        sudo systemctl start $SERVICE_NAME
        ;;
    stop)
        echo "停止 NodePassDash..."
        sudo systemctl stop $SERVICE_NAME
        ;;
    restart)
        echo "重启 NodePassDash..."
        sudo systemctl restart $SERVICE_NAME
        ;;
    status)
        sudo systemctl status $SERVICE_NAME
        ;;
    logs)
        sudo journalctl -u $SERVICE_NAME -f --lines=50
        ;;
    reset-password)
        echo "重置管理员密码..."
        sudo systemctl stop $SERVICE_NAME
        sudo -u nodepass $BINARY_PATH --reset-pwd
        sudo systemctl start $SERVICE_NAME
        ;;
    update)
        echo "更新 NodePassDash..."
        curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | sudo bash
        ;;
    *)
        echo "使用方式: $0 {start|stop|restart|status|logs|reset-password|update}"
        exit 1
        ;;
esac
EOF
    
    chmod +x /usr/local/bin/nodepassdash-ctl
    
    log_success "管理脚本创建完成"
}

# 配置防火墙
configure_firewall() {
    log_info "配置防火墙..."
    
    if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
        ufw allow $DEFAULT_PORT/tcp
        log_success "UFW 防火墙规则已添加"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=$DEFAULT_PORT/tcp
        firewall-cmd --reload
        log_success "firewalld 防火墙规则已添加"
    else
        log_warning "未检测到活跃的防火墙，请手动开放端口 $DEFAULT_PORT"
    fi
}

# 启动服务
start_service() {
    log_info "启动 NodePassDash 服务..."
    
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    # 等待服务启动
    sleep 3
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_success "服务启动成功"
    else
        log_error "服务启动失败，请检查日志: journalctl -u $SERVICE_NAME"
        exit 1
    fi
}

# 显示安装结果
show_result() {
    local ip=$(curl -s http://checkip.amazonaws.com/ 2>/dev/null || echo "YOUR_SERVER_IP")
    
    echo
    echo "=========================================="
    echo -e "${GREEN}🎉 NodePassDash 安装完成！${NC}"
    echo "=========================================="
    echo
    echo "📍 访问地址:"
    echo "   http://$ip:$DEFAULT_PORT"
    echo "   http://localhost:$DEFAULT_PORT (本地)"
    echo
    echo "🔧 管理命令:"
    echo "   nodepassdash-ctl start       # 启动服务"
    echo "   nodepassdash-ctl stop        # 停止服务"
    echo "   nodepassdash-ctl restart     # 重启服务"
    echo "   nodepassdash-ctl status      # 查看状态"
    echo "   nodepassdash-ctl logs        # 查看日志"
    echo "   nodepassdash-ctl reset-password  # 重置密码"
    echo "   nodepassdash-ctl update      # 更新版本"
    echo
    echo "📁 重要路径:"
    echo "   程序目录: $INSTALL_DIR"
    echo "   配置文件: /etc/nodepassdash/config.env"
    echo "   数据目录: $INSTALL_DIR/data"
    echo "   日志目录: $INSTALL_DIR/logs"
    echo
    echo "🔑 初始密码:"
    echo "   系统将在首次运行时自动生成管理员账户"
    echo "   请查看启动日志获取初始密码:"
    echo "   journalctl -u nodepassdash | grep -A 6 '系统初始化完成'"
    echo
    echo "📚 文档链接:"
    echo "   GitHub: https://github.com/NodePassProject/NodePassDash"
    echo "   部署文档: https://github.com/NodePassProject/NodePassDash/blob/main/docs/BINARY.md"
    echo
    echo "❓ 如需帮助，请访问:"
    echo "   Issues: https://github.com/NodePassProject/NodePassDash/issues"
    echo "   Telegram: https://t.me/NodePassGroup"
    echo "=========================================="
}

# 清理临时文件
cleanup() {
    rm -f /tmp/$BINARY_NAME
}

# 主安装流程
main() {
    echo "=========================================="
    echo "🚀 NodePassDash 一键安装脚本"
    echo "=========================================="
    echo
    
    check_root
    detect_system
    check_dependencies
    get_latest_version
    download_binary
    setup_user_and_dirs
    install_binary
    create_config
    create_systemd_service
    create_management_script
    configure_firewall
    start_service
    cleanup
    show_result
}

# 错误处理
trap 'log_error "安装过程中发生错误，请检查上述日志"; cleanup; exit 1' ERR

# 运行主程序
main "$@" 