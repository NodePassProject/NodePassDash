# 📦 NodePassDash 二进制部署指南

> 适合 VPS/服务器环境的高性能部署方案，支持 systemd 服务管理。

## ✨ 优势特点

- 🚀 **性能最优**: 原生二进制，无运行时开销
- 💾 **资源占用低**: 内存占用比 Docker 方案低 40%
- 🔧 **系统集成**: 支持 systemd 服务管理
- 🛡️ **安全性高**: 可配置专用用户运行
- 📊 **监控友好**: 易于集成系统监控

## 📋 系统要求

### 支持的操作系统
- Linux (x86_64, arm64)
- Windows (x86_64)
- macOS (x86_64, arm64)

### 最低硬件要求
- CPU: 1 核心
- 内存: 256MB
- 磁盘: 100MB 可用空间

## 🚀 快速安装

### 方式一：一键安装脚本

```bash
# 下载并运行安装脚本
curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | bash

# 或者先下载查看再运行
wget https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh
chmod +x install.sh
./install.sh
```

### 方式二：手动安装

#### 1. 下载二进制文件

```bash
# Linux x86_64
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/nodepassdash-linux-amd64 -O nodepassdash
chmod +x nodepassdash

# Linux ARM64
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/nodepassdash-linux-arm64 -O nodepassdash
chmod +x nodepassdash

# macOS x86_64
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/nodepassdash-darwin-amd64 -O nodepassdash
chmod +x nodepassdash

# macOS ARM64 (M1/M2)
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/nodepassdash-darwin-arm64 -O nodepassdash
chmod +x nodepassdash
```

#### 2. 创建目录结构

```bash
# 创建应用目录
sudo mkdir -p /opt/nodepassdash/{bin,data,logs}

# 移动二进制文件
sudo mv nodepassdash /opt/nodepassdash/bin/

# 设置权限
sudo chown -R root:root /opt/nodepassdash/bin
sudo chmod 755 /opt/nodepassdash/bin/nodepassdash
```

#### 3. 创建专用用户（推荐）

```bash
# 创建系统用户
sudo useradd --system --home /opt/nodepassdash --shell /bin/false nodepass

# 设置数据目录权限
sudo chown -R nodepass:nodepass /opt/nodepassdash/data /opt/nodepassdash/logs
```

## ⚙️ 配置管理

### 基本配置

```bash
# 创建配置目录
sudo mkdir -p /etc/nodepassdash

# 创建配置文件
sudo tee /etc/nodepassdash/config.env > /dev/null << 'EOF'
# NodePassDash 配置文件
PORT=3000
DATA_DIR=/opt/nodepassdash/data
LOG_DIR=/opt/nodepassdash/logs
LOG_LEVEL=info
EOF
```

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | HTTP 服务端口 |
| `DATA_DIR` | ./public | 数据存储目录 |
| `LOG_DIR` | ./logs | 日志存储目录 |
| `LOG_LEVEL` | info | 日志级别 (debug/info/warn/error) |

## 🔧 SystemD 服务配置

### 1. 创建服务文件

```bash
sudo tee /etc/systemd/system/nodepassdash.service > /dev/null << 'EOF'
[Unit]
Description=NodePassDash - NodePass Management Dashboard
Documentation=https://github.com/NodePassProject/NodePassDash
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=nodepass
Group=nodepass
WorkingDirectory=/opt/nodepassdash
ExecStart=/opt/nodepassdash/bin/nodepassdash --port 3000
ExecReload=/bin/kill -HUP $MAINPID
EnvironmentFile=-/etc/nodepassdash/config.env

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/nodepassdash/data /opt/nodepassdash/logs

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
```

### 2. 启用和启动服务

```bash
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 启用服务（开机自启）
sudo systemctl enable nodepassdash

# 启动服务
sudo systemctl start nodepassdash

# 检查服务状态
sudo systemctl status nodepassdash
```

### 3. 服务管理命令

```bash
# 启动服务
sudo systemctl start nodepassdash

# 停止服务
sudo systemctl stop nodepassdash

# 重启服务
sudo systemctl restart nodepassdash

# 重新加载配置
sudo systemctl reload nodepassdash

# 查看服务状态
sudo systemctl status nodepassdash

# 查看服务日志
sudo journalctl -u nodepassdash -f

# 禁用服务
sudo systemctl disable nodepassdash
```

## 🛠️ 管理脚本

### 创建管理脚本

```bash
sudo tee /usr/local/bin/nodepassdash-ctl > /dev/null << 'EOF'
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
        sudo systemctl stop $SERVICE_NAME
        
        # 备份当前版本
        sudo cp $BINARY_PATH $BINARY_PATH.backup
        
        # 下载最新版本
        ARCH=$(uname -m)
        if [ "$ARCH" = "x86_64" ]; then
            DOWNLOAD_URL="https://github.com/NodePassProject/NodePassDash/releases/latest/download/nodepassdash-linux-amd64"
        elif [ "$ARCH" = "aarch64" ]; then
            DOWNLOAD_URL="https://github.com/NodePassProject/NodePassDash/releases/latest/download/nodepassdash-linux-arm64"
        else
            echo "不支持的架构: $ARCH"
            exit 1
        fi
        
        sudo wget $DOWNLOAD_URL -O $BINARY_PATH
        sudo chmod 755 $BINARY_PATH
        sudo chown root:root $BINARY_PATH
        
        sudo systemctl start $SERVICE_NAME
        echo "更新完成"
        ;;
    *)
        echo "使用方式: $0 {start|stop|restart|status|logs|reset-password|update}"
        exit 1
        ;;
esac
EOF

# 设置执行权限
sudo chmod +x /usr/local/bin/nodepassdash-ctl
```

### 使用管理脚本

```bash
# 启动服务
nodepassdash-ctl start

# 停止服务
nodepassdash-ctl stop

# 重启服务
nodepassdash-ctl restart

# 查看状态
nodepassdash-ctl status

# 查看实时日志
nodepassdash-ctl logs

# 重置密码
nodepassdash-ctl reset-password

# 更新到最新版本
nodepassdash-ctl update
```

## 🔒 安全配置

### 1. 防火墙配置

```bash
# 使用 ufw (Ubuntu/Debian)
sudo ufw allow 3000/tcp
sudo ufw reload

# 使用 firewalld (CentOS/RHEL)
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 使用 iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save
```

### 2. Nginx 反向代理（推荐）

```nginx
# /etc/nginx/sites-available/nodepassdash
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. SSL/TLS 配置

```bash
# 使用 Certbot 申请 Let's Encrypt 证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📊 监控和日志

### 系统日志

```bash
# 查看服务日志
sudo journalctl -u nodepassdash -f

# 查看启动日志
sudo journalctl -u nodepassdash --since "1 hour ago"

# 查看错误日志
sudo journalctl -u nodepassdash -p err
```

### 应用日志

```bash
# 查看应用日志文件
tail -f /opt/nodepassdash/logs/app.log

# 日志轮转配置
sudo tee /etc/logrotate.d/nodepassdash > /dev/null << 'EOF'
/opt/nodepassdash/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su nodepass nodepass
}
EOF
```

### 性能监控

```bash
# 查看进程状态
ps aux | grep nodepassdash

# 查看资源使用
top -p $(pgrep nodepassdash)

# 查看网络连接
ss -tulpn | grep :3000
```
## 🐛 故障排除

### 常见问题

#### 1. 服务无法启动

```bash
# 检查服务状态
sudo systemctl status nodepassdash

# 查看详细错误日志
sudo journalctl -u nodepassdash -l

# 检查二进制文件权限
ls -l /opt/nodepassdash/bin/nodepassdash

# 手动测试启动
sudo -u nodepass /opt/nodepassdash/bin/nodepassdash --port 3000
```

#### 2. 端口占用

```bash
# 检查端口占用
sudo ss -tulpn | grep :3000

# 查找占用进程
sudo lsof -i :3000

# 修改配置文件中的端口
sudo nano /etc/nodepassdash/config.env
```

#### 3. 权限问题

```bash
# 修复数据目录权限
sudo chown -R nodepass:nodepass /opt/nodepassdash/data /opt/nodepassdash/logs

# 修复配置文件权限
sudo chmod 644 /etc/nodepassdash/config.env
```

#### 4. 内存不足

```bash
# 检查内存使用
free -h

# 检查进程内存使用
ps aux --sort=-%mem | head

# 优化服务配置
sudo systemctl edit nodepassdash
```

如遇到问题，请先查看日志文件，并参考故障排除章节。如问题依然存在，欢迎在 GitHub 提交 Issue。 