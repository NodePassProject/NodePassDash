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

# 用户配置变量
USER_PORT="$DEFAULT_PORT"
ENABLE_HTTPS="false"
CERT_PATH=""
KEY_PATH=""
VERSION_TYPE="stable"  # stable 或 beta

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

# 显示使用帮助
show_help() {
    echo "NodePassDash 一键安装/卸载脚本"
    echo
    echo "使用方式:"
    echo "  $0 [install|uninstall|switch] [选项]"
    echo
    echo "命令:"
    echo "  install    安装 NodePassDash (默认)"
    echo "  uninstall  卸载 NodePassDash"
    echo "  switch     切换版本 (stable <-> beta)"
    echo
    echo "安装选项:"
    echo "  --port PORT           指定端口 (默认: 3000)"
    echo "  --https               启用 HTTPS"
    echo "  --cert PATH           HTTPS 证书文件路径"
    echo "  --key PATH            HTTPS 私钥文件路径"
    echo "  --beta                安装 Beta 版本"
    echo "  --non-interactive     非交互式安装"
    echo "  --help                显示此帮助信息"
    echo
    echo "示例:"
    echo "  $0 install                                    # 默认安装正式版"
    echo "  $0 install --beta                             # 安装 Beta 版"
    echo "  $0 install --port 8080                        # 指定端口"
    echo "  $0 install --https --cert /path/cert.pem --key /path/key.pem  # HTTPS"
    echo "  $0 switch                                     # 切换版本"
    echo "  $0 uninstall                                  # 卸载"
}

# 解析命令行参数
parse_args() {
    local command="install"
    local non_interactive=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            install)
                command="install"
                shift
                ;;
            uninstall)
                command="uninstall"
                shift
                ;;
            switch)
                command="switch"
                shift
                ;;
            --port)
                USER_PORT="$2"
                shift 2
                ;;
            --https)
                ENABLE_HTTPS="true"
                shift
                ;;
            --cert)
                CERT_PATH="$2"
                shift 2
                ;;
            --key)
                KEY_PATH="$2"
                shift 2
                ;;
            --beta)
                VERSION_TYPE="beta"
                shift
                ;;
            --non-interactive)
                non_interactive=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done

    case $command in
        install)
            if ! $non_interactive; then
                interactive_config
            fi
            validate_config
            main_install
            ;;
        uninstall)
            main_uninstall
            ;;
        switch)
            main_switch_version
            ;;
        *)
            log_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 交互式配置
interactive_config() {
    echo
    echo "=========================================="
    echo "🔧 NodePassDash 配置"
    echo "=========================================="
    echo

    # 版本类型配置
    echo -n "选择版本类型 [1.正式版 2.Beta版] (默认: 1): "
    read version_choice
    if [[ "$version_choice" == "2" ]]; then
        VERSION_TYPE="beta"
    fi

    # 端口配置
    echo -n "请输入监听端口 [默认: $DEFAULT_PORT]: "
    read input_port
    if [[ -n "$input_port" ]]; then
        USER_PORT="$input_port"
    fi

    # HTTPS 配置
    echo -n "是否启用 HTTPS? [y/N]: "
    read enable_https
    if [[ "$enable_https" =~ ^[Yy]$ ]]; then
        ENABLE_HTTPS="true"

        echo -n "请输入证书文件路径 (.crt/.pem): "
        read cert_path
        CERT_PATH="$cert_path"

        echo -n "请输入私钥文件路径 (.key): "
        read key_path
        KEY_PATH="$key_path"
    fi

    echo
    echo "配置总结:"
    echo "  版本类型: $VERSION_TYPE"
    echo "  端口: $USER_PORT"
    echo "  HTTPS: $ENABLE_HTTPS"
    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        echo "  证书: $CERT_PATH"
        echo "  私钥: $KEY_PATH"
    fi
    echo
    echo -n "确认配置并继续安装? [Y/n]: "
    read confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        log_info "安装已取消"
        exit 0
    fi
}

# 验证配置
validate_config() {
    # 验证端口
    if ! [[ "$USER_PORT" =~ ^[0-9]+$ ]] || [[ "$USER_PORT" -lt 1 ]] || [[ "$USER_PORT" -gt 65535 ]]; then
        log_error "无效的端口号: $USER_PORT"
        exit 1
    fi
    
    # 验证 HTTPS 配置
    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        if [[ -z "$CERT_PATH" ]] || [[ -z "$KEY_PATH" ]]; then
            log_error "启用 HTTPS 时必须指定证书和私钥路径"
            exit 1
        fi
        
        if [[ ! -f "$CERT_PATH" ]]; then
            log_error "证书文件不存在: $CERT_PATH"
            exit 1
        fi
        
        if [[ ! -f "$KEY_PATH" ]]; then
            log_error "私钥文件不存在: $KEY_PATH"
            exit 1
        fi
        
        # 检查文件权限
        if [[ ! -r "$CERT_PATH" ]]; then
            log_error "无法读取证书文件: $CERT_PATH"
            exit 1
        fi
        
        if [[ ! -r "$KEY_PATH" ]]; then
            log_error "无法读取私钥文件: $KEY_PATH"
            exit 1
        fi
    fi
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
    log_info "获取最新${VERSION_TYPE}版本信息..."

    local api_response

    if [[ "$VERSION_TYPE" == "beta" ]]; then
        # 获取所有 releases（包括 prerelease）
        api_response=$(curl -s "$GITHUB_API/releases")

        if [[ $? -ne 0 ]]; then
            log_error "无法获取版本信息，请检查网络连接"
            exit 1
        fi

        # 提取第一个 prerelease 版本
        VERSION=$(echo "$api_response" | grep -B 1 '"prerelease": true' | grep '"tag_name"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    else
        # 获取最新正式版
        api_response=$(curl -s "$GITHUB_API/releases/latest")

        if [[ $? -ne 0 ]]; then
            log_error "无法获取版本信息，请检查网络连接"
            exit 1
        fi

        VERSION=$(echo "$api_response" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    fi

    if [[ -z "$VERSION" ]]; then
        log_error "解析版本信息失败"
        exit 1
    fi

    DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/NodePassDash_${DOWNLOAD_ARCH}.tar.gz"

    log_success "最新${VERSION_TYPE}版本: $VERSION"
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
    mkdir -p "$INSTALL_DIR"/{bin,db,logs,backups}

    # 设置权限
    chown -R root:root "$INSTALL_DIR/bin" 2>/dev/null || true
    chown -R "$USER_NAME:$USER_NAME" "$INSTALL_DIR"/{db,logs,backups}
    # nodepassdash 需要在工作目录创建数据库文件，确保有写权限
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
    log_info "创建配置文件..."
    
    local config_file="$INSTALL_DIR/config.env"
    
    cat > "$config_file" << EOF
# NodePassDash 配置文件
# 此文件由安装脚本自动生成

# 版本信息
VERSION=$VERSION
VERSION_TYPE=$VERSION_TYPE

# 服务端口
PORT=$USER_PORT

# 数据库配置
DB_PATH=$INSTALL_DIR/db/database.db

# HTTPS 配置
ENABLE_HTTPS=$ENABLE_HTTPS
EOF

    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        # 复制证书文件到安装目录
        local cert_dir="$INSTALL_DIR/certs"
        mkdir -p "$cert_dir"
        
        cp "$CERT_PATH" "$cert_dir/server.crt"
        cp "$KEY_PATH" "$cert_dir/server.key"
        
        # 设置证书文件权限
        chown -R "$USER_NAME:$USER_NAME" "$cert_dir"
        chmod 600 "$cert_dir/server.key"
        chmod 644 "$cert_dir/server.crt"
        
        cat >> "$config_file" << EOF
CERT_PATH=$cert_dir/server.crt
KEY_PATH=$cert_dir/server.key
EOF
        
        log_success "证书文件已复制到 $cert_dir"
    fi
    
    chown "$USER_NAME:$USER_NAME" "$config_file"
    chmod 640 "$config_file"
    
    log_success "配置文件创建完成: $config_file"
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
    
    # 构建启动命令
    local exec_start="$INSTALL_DIR/bin/$BINARY_NAME --port $USER_PORT"
    
    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        exec_start="$exec_start --cert $INSTALL_DIR/certs/server.crt --key $INSTALL_DIR/certs/server.key"
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
ExecStart=$exec_start
ExecReload=/bin/kill -HUP \$MAINPID

# 环境变量
EnvironmentFile=-$INSTALL_DIR/config.env

# 日志输出
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nodepassdash

# 安全设置
NoNewPrivileges=true
# PrivateTmp=true
# ProtectSystem=strict
# ProtectHome=true
# 程序需要在工作目录创建和访问数据库文件
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
# 使用方式: nodepassdash-ctl {start|stop|restart|status|logs|reset-password|update|config|uninstall}

BINARY_PATH="/opt/nodepassdash/bin/nodepassdash"
SERVICE_NAME="nodepassdash"
INSTALL_DIR="/opt/nodepassdash"
CONFIG_FILE="$INSTALL_DIR/config.env"

show_config() {
    echo "当前配置:"
    if [[ -f "$CONFIG_FILE" ]]; then
        cat "$CONFIG_FILE"
    else
        echo "配置文件不存在"
    fi
}

uninstall_nodepassdash() {
    echo "开始卸载 NodePassDash..."

    # 停止并禁用服务
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo "停止服务..."
        sudo systemctl stop $SERVICE_NAME
    fi

    if systemctl is-enabled --quiet $SERVICE_NAME 2>/dev/null; then
        echo "禁用服务..."
        sudo systemctl disable $SERVICE_NAME
    fi

    # 删除服务文件
    if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
        echo "删除服务文件..."
        sudo rm -f "/etc/systemd/system/$SERVICE_NAME.service"
        sudo systemctl daemon-reload
    fi

    # 删除安装目录
    if [[ -d "$INSTALL_DIR" ]]; then
        echo "删除安装目录..."
        sudo rm -rf "$INSTALL_DIR"
    fi

    # 删除用户
    if id nodepass &>/dev/null; then
        echo "删除用户..."
        sudo userdel nodepass 2>/dev/null || true
    fi

    # 删除软链接
    if [[ -L "/usr/local/bin/nodepassdash" ]]; then
        echo "删除软链接..."
        sudo rm -f "/usr/local/bin/nodepassdash"
    fi

    # 删除管理脚本本身
    echo "删除管理脚本..."
    sudo rm -f "/usr/local/bin/nodepassdash-ctl"

    echo "NodePassDash 卸载完成！"
}

switch_version() {
    echo "切换版本..."

    # 读取当前版本类型
    local current_type="stable"
    if [[ -f "$CONFIG_FILE" ]]; then
        current_type=$(grep "^VERSION_TYPE=" "$CONFIG_FILE" | cut -d'=' -f2)
    fi

    # 确定目标版本类型
    local target_type="beta"
    if [[ "$current_type" == "beta" ]]; then
        target_type="stable"
    fi

    echo "当前版本类型: $current_type"
    echo "目标版本类型: $target_type"
    echo
    echo "确认要切换到 $target_type 版本吗？[y/N]"
    read -r confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "取消切换"
        exit 0
    fi

    # 使用安装脚本进行切换
    echo "开始切换版本..."
    if [[ "$target_type" == "beta" ]]; then
        curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | sudo bash -s -- install --beta --non-interactive
    else
        curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | sudo bash -s -- install --non-interactive
    fi
}

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
        sudo -u nodepass $BINARY_PATH --resetpwd
        sudo systemctl start $SERVICE_NAME
        ;;
    update)
        echo "更新 NodePassDash..."
        curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | sudo bash
        ;;
    config)
        show_config
        ;;
    uninstall)
        echo "确认要卸载 NodePassDash 吗？[y/N]"
        read -r confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            uninstall_nodepassdash
        else
            echo "取消卸载"
        fi
        ;;
    switch-version)
        switch_version
        ;;
    *)
        echo "使用方式: $0 {start|stop|restart|status|logs|reset-password|update|config|switch-version|uninstall}"
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
            if ufw allow $USER_PORT/tcp &>/dev/null; then
                log_success "UFW 防火墙规则已添加 (端口 $USER_PORT)"
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
            if firewall-cmd --permanent --add-port=$USER_PORT/tcp &>/dev/null && \
               firewall-cmd --reload &>/dev/null; then
                log_success "firewalld 防火墙规则已添加 (端口 $USER_PORT)"
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
            log_warning "请手动添加规则：iptables -A INPUT -p tcp --dport $USER_PORT -j ACCEPT"
        else
            log_info "iptables 存在但无活动规则"
        fi
    fi
    
    if ! $firewall_configured; then
        log_info "未检测到启用的防火墙服务"
        log_info "如果您的系统启用了防火墙，请手动开放端口 $USER_PORT"
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
    local protocol="http"
    
    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        protocol="https"
    fi
    
    echo
    echo "=========================================="
    echo -e "${GREEN}🎉 NodePassDash 安装完成！${NC}"
    echo "=========================================="
    echo
    echo "📍 访问地址:"
    echo "   $protocol://$ip:$USER_PORT"
    echo "   $protocol://localhost:$USER_PORT (本地)"
    echo
    echo "🔧 管理命令:"
    echo "   nodepassdash-ctl start       # 启动服务"
    echo "   nodepassdash-ctl stop        # 停止服务"
    echo "   nodepassdash-ctl restart     # 重启服务"
    echo "   nodepassdash-ctl status      # 查看状态"
    echo "   nodepassdash-ctl logs        # 查看日志"
    echo "   nodepassdash-ctl reset-password  # 重置密码"
    echo "   nodepassdash-ctl update      # 更新版本"
    echo "   nodepassdash-ctl switch-version  # 切换版本 (stable/beta)"
    echo "   nodepassdash-ctl config      # 查看配置"
    echo "   nodepassdash-ctl uninstall   # 卸载系统"
    echo
    echo "📁 重要路径:"
    echo "   程序目录: $INSTALL_DIR"
    echo "   数据目录: $INSTALL_DIR/db"
    echo "   日志目录: $INSTALL_DIR/logs"
    echo "   配置文件: $INSTALL_DIR/config.env"
    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        echo "   证书目录: $INSTALL_DIR/certs"
    fi
    echo
    echo "🔧 当前配置:"
    echo "   版本: $VERSION ($VERSION_TYPE)"
    echo "   端口: $USER_PORT"
    echo "   HTTPS: $ENABLE_HTTPS"
    if [[ "$ENABLE_HTTPS" == "true" ]]; then
        echo "   证书: $INSTALL_DIR/certs/server.crt"
        echo "   私钥: $INSTALL_DIR/certs/server.key"
    fi
    echo
    echo "🔑 初始密码:"
    echo "   系统将在首次运行时自动生成管理员账户"
    echo "   请查看启动日志获取初始密码:"
    echo "   journalctl -u nodepassdash | grep -A 6 '系统初始化完成'"
    echo
    echo "📚 文档链接:"
    echo "   GitHub: https://github.com/NodePassProject/NodePassDash"
    echo "   二进制部署文档(EN): https://github.com/NodePassProject/NodePassDash/blob/main/docs/en/BINARY.md"
    echo "   二进制部署文档(中文): https://github.com/NodePassProject/NodePassDash/blob/main/docs/zh-CN/BINARY.md"
    echo
    echo "❓ 如需帮助，请访问:"
    echo "   Issues: https://github.com/NodePassProject/NodePassDash/issues"
    echo "   Telegram: https://t.me/NodePassGroup"
    echo "=========================================="
}

# 卸载功能
main_uninstall() {
    echo "=========================================="
    echo "🗑️  NodePassDash 卸载程序"
    echo "=========================================="
    echo
    
    check_root
    
    log_warning "即将卸载 NodePassDash 及其所有数据"
    echo -n "确认要继续吗？[y/N]: "
    read confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "卸载已取消"
        exit 0
    fi
    
    # 停止并禁用服务
    if systemctl is-active --quiet $SERVICE_NAME 2>/dev/null; then
        log_info "停止服务..."
        systemctl stop $SERVICE_NAME
    fi
    
    if systemctl is-enabled --quiet $SERVICE_NAME 2>/dev/null; then
        log_info "禁用服务..."
        systemctl disable $SERVICE_NAME
    fi
    
    # 删除服务文件
    if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
        log_info "删除服务文件..."
        rm -f "/etc/systemd/system/$SERVICE_NAME.service"
        systemctl daemon-reload
    fi
    
    # 备份数据（可选）
    if [[ -d "$INSTALL_DIR/db" ]] && [[ -n "$(ls -A $INSTALL_DIR/db 2>/dev/null)" ]]; then
        echo -n "是否备份数据到 /tmp/nodepassdash-backup-$(date +%Y%m%d%H%M%S).tar.gz？[Y/n]: "
        read backup_confirm
        if [[ ! "$backup_confirm" =~ ^[Nn]$ ]]; then
            local backup_file="/tmp/nodepassdash-backup-$(date +%Y%m%d%H%M%S).tar.gz"
            log_info "备份数据到 $backup_file..."
            tar -czf "$backup_file" -C "$INSTALL_DIR" db logs config.env 2>/dev/null || true
            log_success "数据已备份到 $backup_file"
        fi
    fi
    
    # 删除安装目录
    if [[ -d "$INSTALL_DIR" ]]; then
        log_info "删除安装目录..."
        rm -rf "$INSTALL_DIR"
    fi
    
    # 删除用户
    if id "$USER_NAME" &>/dev/null; then
        log_info "删除用户..."
        userdel "$USER_NAME" 2>/dev/null || true
    fi
    
    # 删除软链接
    if [[ -L "/usr/local/bin/$BINARY_NAME" ]]; then
        log_info "删除软链接..."
        rm -f "/usr/local/bin/$BINARY_NAME"
    fi
    
    # 删除管理脚本
    if [[ -f "/usr/local/bin/nodepassdash-ctl" ]]; then
        log_info "删除管理脚本..."
        rm -f "/usr/local/bin/nodepassdash-ctl"
    fi
    
    # 删除防火墙规则（可选）
    echo -n "是否删除防火墙规则？[y/N]: "
    read firewall_confirm
    if [[ "$firewall_confirm" =~ ^[Yy]$ ]]; then
        # 尝试删除 UFW 规则
        if command -v ufw &> /dev/null; then
            ufw delete allow $DEFAULT_PORT/tcp 2>/dev/null || true
            # 如果用户修改了端口，也尝试删除自定义端口
            if [[ -f "$INSTALL_DIR/config.env" ]]; then
                local custom_port=$(grep "^PORT=" "$INSTALL_DIR/config.env" 2>/dev/null | cut -d'=' -f2)
                if [[ -n "$custom_port" ]] && [[ "$custom_port" != "$DEFAULT_PORT" ]]; then
                    ufw delete allow $custom_port/tcp 2>/dev/null || true
                fi
            fi
        fi
        
        # 尝试删除 firewalld 规则
        if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
            firewall-cmd --permanent --remove-port=$DEFAULT_PORT/tcp 2>/dev/null || true
            firewall-cmd --reload 2>/dev/null || true
        fi
        
        log_info "防火墙规则清理完成"
    fi
    
    echo
    echo "=========================================="
    echo -e "${GREEN}✅ NodePassDash 卸载完成！${NC}"
    echo "=========================================="
    echo
    log_success "NodePassDash 已完全从系统中移除"
    echo
}

# 版本切换功能
main_switch_version() {
    echo "=========================================="
    echo "🔄 NodePassDash 版本切换"
    echo "=========================================="
    echo

    check_root

    # 检查是否已安装
    if [[ ! -f "$INSTALL_DIR/bin/$BINARY_NAME" ]]; then
        log_error "NodePassDash 未安装，请先安装"
        exit 1
    fi

    # 读取当前配置
    local current_version=""
    local current_type="stable"
    if [[ -f "$INSTALL_DIR/config.env" ]]; then
        current_version=$(grep "^VERSION=" "$INSTALL_DIR/config.env" | cut -d'=' -f2)
        current_type=$(grep "^VERSION_TYPE=" "$INSTALL_DIR/config.env" | cut -d'=' -f2)
    fi

    # 确定目标版本类型
    local target_type="beta"
    if [[ "$current_type" == "beta" ]]; then
        target_type="stable"
    fi

    echo "当前版本: $current_version ($current_type)"
    echo "目标版本类型: $target_type"
    echo
    echo -n "确认要切换到 $target_type 版本吗？[y/N]: "
    read confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        log_info "版本切换已取消"
        exit 0
    fi

    # 设置版本类型并执行安装流程
    VERSION_TYPE="$target_type"

    # 读取现有配置
    if [[ -f "$INSTALL_DIR/config.env" ]]; then
        USER_PORT=$(grep "^PORT=" "$INSTALL_DIR/config.env" | cut -d'=' -f2)
        ENABLE_HTTPS=$(grep "^ENABLE_HTTPS=" "$INSTALL_DIR/config.env" | cut -d'=' -f2)
        if [[ "$ENABLE_HTTPS" == "true" ]]; then
            CERT_PATH="$INSTALL_DIR/certs/server.crt"
            KEY_PATH="$INSTALL_DIR/certs/server.key"
        fi
    fi

    log_info "开始切换到 $target_type 版本..."

    detect_system
    check_dependencies
    get_latest_version
    download_binary

    # 停止服务
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_info "停止服务..."
        systemctl stop $SERVICE_NAME
    fi

    install_binary
    create_config

    # 重启服务
    log_info "重启服务..."
    systemctl start $SERVICE_NAME

    cleanup

    echo
    echo "=========================================="
    echo -e "${GREEN}✅ 版本切换完成！${NC}"
    echo "=========================================="
    echo
    echo "新版本: $VERSION ($target_type)"
    echo
    echo "使用 'nodepassdash-ctl status' 查看服务状态"
    echo "使用 'nodepassdash-ctl logs' 查看运行日志"
    echo "=========================================="
}

# 主安装流程
main_install() {
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

# 清理临时文件
cleanup() {
    rm -f /tmp/$BINARY_NAME
    rm -f /tmp/nodepassdash-*.tar.gz
    rm -rf /tmp/nodepassdash-extract
}

# 错误处理
trap 'log_error "安装过程中发生错误，请检查上述日志"; cleanup; exit 1' ERR

# 运行主程序 - 如果没有参数，默认安装
if [[ $# -eq 0 ]]; then
    interactive_config
    validate_config
    main_install
else
    parse_args "$@"
fi 
