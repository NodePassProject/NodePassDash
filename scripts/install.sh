#!/bin/bash

# NodePassDash 一键安装脚本
# 支持 Linux 系统的自动安装和配置

set -e

# 调试模式
if [[ "${DEBUG:-}" == "1" ]]; then
    set -x
fi

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
    
    # 检测架构并映射到发布文件名
    SYSTEM_ARCH=$(uname -m)
    case $SYSTEM_ARCH in
        x86_64)
            ARCH="x86_64"
            DOWNLOAD_ARCH="Linux_x86_64"
            ;;
        aarch64)
            ARCH="arm64"
            DOWNLOAD_ARCH="Linux_arm64"
            ;;
        armv7l)
            ARCH="armv7hf"
            DOWNLOAD_ARCH="Linux_armv7hf"
            ;;
        armv6l)
            ARCH="armv6hf"
            DOWNLOAD_ARCH="Linux_armv6hf"
            ;;
        *)
            log_error "不支持的架构: $SYSTEM_ARCH"
            log_error "支持的架构: x86_64, aarch64, armv7l, armv6l"
            exit 1
            ;;
    esac
    
    log_success "系统: $OS $VERSION, 架构: $SYSTEM_ARCH -> $DOWNLOAD_ARCH"
}

# 检查系统依赖
check_dependencies() {
    log_info "检查系统依赖..."
    
    local deps=("curl" "wget" "systemctl" "file" "tar")
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
    
    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/NodePassDash_${DOWNLOAD_ARCH}.tar.gz"
    
    log_success "最新版本: $VERSION"
    log_info "下载架构: $DOWNLOAD_ARCH"
}

# 下载并解压二进制文件
download_binary() {
    log_info "下载 NodePassDash 压缩包..."
    log_info "下载地址: $DOWNLOAD_URL"
    
    local temp_archive="/tmp/nodepassdash-${VERSION}.tar.gz"
    local temp_dir="/tmp/nodepassdash-extract"
    local temp_binary="/tmp/${BINARY_NAME}"
    
    # 下载压缩包
    if ! curl -L -o "$temp_archive" "$DOWNLOAD_URL"; then
        log_error "下载失败"
        exit 1
    fi
    
    # 验证下载文件
    if [[ ! -f "$temp_archive" ]] || [[ ! -s "$temp_archive" ]]; then
        log_error "下载的文件无效"
        exit 1
    fi
    
    # 检查文件类型
    local file_type=$(file "$temp_archive")
    log_info "压缩包类型: $file_type"
    
    # 验证是否为有效的 tar.gz 文件
    if ! echo "$file_type" | grep -q "gzip compressed"; then
        log_error "下载的文件不是有效的 gzip 压缩包"
        log_error "文件信息: $file_type"
        exit 1
    fi
    
    # 创建临时解压目录
    mkdir -p "$temp_dir"
    
    # 解压文件
    log_info "解压压缩包..."
    if ! tar -xzf "$temp_archive" -C "$temp_dir"; then
        log_error "解压失败"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    # 查找二进制文件
    local binary_file=$(find "$temp_dir" -name "$BINARY_NAME" -type f | head -1)
    if [[ -z "$binary_file" ]]; then
        log_error "在压缩包中未找到二进制文件: $BINARY_NAME"
        log_info "压缩包内容:"
        ls -la "$temp_dir"
        rm -rf "$temp_dir"
        exit 1
    fi
    
    # 复制二进制文件到临时位置
    cp "$binary_file" "$temp_binary"
    
    # 清理解压目录
    rm -rf "$temp_dir" "$temp_archive"
    
    # 检查二进制文件类型
    local binary_type=$(file "$temp_binary")
    log_info "二进制文件类型: $binary_type"
    
    # 验证是否为 ELF 可执行文件
    if ! echo "$binary_type" | grep -q "ELF.*executable"; then
        log_error "解压的文件不是有效的可执行文件"
        log_error "文件信息: $binary_type"
        exit 1
    fi
    
    # 检查架构是否匹配
    if echo "$binary_type" | grep -q "x86-64" && [[ "$SYSTEM_ARCH" != "x86_64" ]]; then
        log_error "二进制文件架构 (x86-64) 与系统架构 ($SYSTEM_ARCH) 不匹配"
        exit 1
    elif echo "$binary_type" | grep -q "aarch64" && [[ "$SYSTEM_ARCH" != "aarch64" ]]; then
        log_error "二进制文件架构 (aarch64) 与系统架构 ($SYSTEM_ARCH) 不匹配"
        exit 1
    fi
    
    chmod +x "$temp_binary"
    BINARY_PATH="$temp_binary"
    
    # 测试文件是否可以执行
    if "$temp_binary" --version &>/dev/null || "$temp_binary" --help &>/dev/null; then
        log_success "二进制文件测试执行成功"
    else
        log_warning "二进制文件可能无法正常执行，但仍将继续安装"
    fi
    
    log_success "下载并解压完成，文件验证通过"
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
    
    # 设置权限
    chown -R root:root "$INSTALL_DIR/bin" 2>/dev/null || true
    chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"/{data,logs,backups}
    # nodepassdash 运行时会创建 dist 和 public 目录，确保有写权限
    chown "$USER_NAME:$USER_NAME" "$INSTALL_DIR"
    
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
    log_info "跳过配置文件创建（不需要）..."
    log_success "配置文件创建完成"
}

# 创建 systemd 服务
create_systemd_service() {
    log_info "创建 systemd 服务..."
    
    # 验证二进制文件路径
    if [[ ! -f "$INSTALL_DIR/bin/$BINARY_NAME" ]]; then
        log_error "二进制文件不存在: $INSTALL_DIR/bin/$BINARY_NAME"
        exit 1
    fi
    
    # 验证二进制文件可执行权限
    if [[ ! -x "$INSTALL_DIR/bin/$BINARY_NAME" ]]; then
        log_error "二进制文件没有可执行权限: $INSTALL_DIR/bin/$BINARY_NAME"
        exit 1
    fi
    
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

# 日志输出
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nodepassdash

# 安全设置（先注释掉一些严格的限制，避免权限问题）
NoNewPrivileges=true
# PrivateTmp=true
# ProtectSystem=strict
# ProtectHome=true
# nodepassdash 需要在工作目录创建 dist 和 public 目录
ReadWritePaths=$INSTALL_DIR

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
    log_info "检查防火墙状态..."
    
    local firewall_configured=false
    
    # 检查 UFW
    if command -v ufw &> /dev/null; then
        local ufw_status=$(ufw status 2>/dev/null || echo "inactive")
        if echo "$ufw_status" | grep -q "Status: active"; then
            log_info "检测到 UFW 防火墙已启用，添加端口规则..."
            if ufw allow $DEFAULT_PORT/tcp &>/dev/null; then
                log_success "UFW 防火墙规则已添加 (端口 $DEFAULT_PORT)"
                firewall_configured=true
            else
                log_warning "UFW 防火墙规则添加失败"
            fi
        else
            log_info "UFW 已安装但未启用"
        fi
    fi
    
    # 检查 firewalld
    if command -v firewall-cmd &> /dev/null && ! $firewall_configured; then
        if systemctl is-active --quiet firewalld 2>/dev/null; then
            log_info "检测到 firewalld 防火墙已启用，添加端口规则..."
            if firewall-cmd --permanent --add-port=$DEFAULT_PORT/tcp &>/dev/null && \
               firewall-cmd --reload &>/dev/null; then
                log_success "firewalld 防火墙规则已添加 (端口 $DEFAULT_PORT)"
                firewall_configured=true
            else
                log_warning "firewalld 防火墙规则添加失败"
            fi
        else
            log_info "firewalld 已安装但未启用"
        fi
    fi
    
    # 检查 iptables (作为最后的检查)
    if command -v iptables &> /dev/null && ! $firewall_configured; then
        # 简单检查是否有 iptables 规则（不是空的 ACCEPT 策略）
        local iptables_rules=$(iptables -L INPUT 2>/dev/null | wc -l)
        if [[ $iptables_rules -gt 3 ]]; then
            log_warning "检测到 iptables 规则，但无法自动配置"
            log_warning "请手动添加规则：iptables -A INPUT -p tcp --dport $DEFAULT_PORT -j ACCEPT"
        else
            log_info "iptables 存在但无活动规则"
        fi
    fi
    
    if ! $firewall_configured; then
        log_info "未检测到启用的防火墙服务"
        log_info "如果您的系统启用了防火墙，请手动开放端口 $DEFAULT_PORT"
    fi
}

# 启动服务
start_service() {
    log_info "启动 NodePassDash 服务..."
    
    # 再次验证二进制文件
    log_info "验证二进制文件..."
    log_info "文件路径: $INSTALL_DIR/bin/$BINARY_NAME"
    log_info "文件权限: $(ls -la $INSTALL_DIR/bin/$BINARY_NAME)"
    log_info "文件类型: $(file $INSTALL_DIR/bin/$BINARY_NAME)"
    
    # 测试二进制文件能否执行
    log_info "测试二进制文件执行..."
    if sudo -u $USER_NAME $INSTALL_DIR/bin/$BINARY_NAME --version 2>/dev/null; then
        log_success "二进制文件可以正常执行"
    else
        log_warning "二进制文件测试执行失败，但将继续尝试启动服务"
    fi
    
    systemctl enable $SERVICE_NAME
    systemctl start $SERVICE_NAME
    
    # 等待服务启动
    sleep 5
    
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_success "服务启动成功"
    else
        log_error "服务启动失败，以下是详细日志:"
        echo "----------------------------------------"
        journalctl -u $SERVICE_NAME --no-pager -l
        echo "----------------------------------------"
        log_error "请检查上述日志信息，或手动运行: journalctl -u $SERVICE_NAME"
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
    echo "   数据目录: $INSTALL_DIR/data"
    echo "   日志目录: $INSTALL_DIR/logs"
    echo "   运行时目录: $INSTALL_DIR (dist, public 等)"
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
    rm -f /tmp/nodepassdash-*.tar.gz
    rm -rf /tmp/nodepassdash-extract
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