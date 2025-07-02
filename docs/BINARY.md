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
- Linux (x86_64, arm64, armv7hf, armv6hf)
- Windows (x86_64, i386)

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

#### 1. 下载并解压二进制文件

```bash
# Linux x86_64
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_Linux_x86_64.tar.gz
tar -xzf NodePassDash_Linux_x86_64.tar.gz
chmod +x nodepassdash

# Linux ARM64
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_Linux_arm64.tar.gz
tar -xzf NodePassDash_Linux_arm64.tar.gz
chmod +x nodepassdash

# Linux ARMv7
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_Linux_armv7hf.tar.gz
tar -xzf NodePassDash_Linux_armv7hf.tar.gz
chmod +x nodepassdash

# Linux ARMv6
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_Linux_armv6hf.tar.gz
tar -xzf NodePassDash_Linux_armv6hf.tar.gz
chmod +x nodepassdash

# Windows x86_64
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_Windows_x86_64.zip
unzip NodePassDash_Windows_x86_64.zip

# Windows i386
wget https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_Windows_i386.zip
unzip NodePassDash_Windows_i386.zip
```

#### 2. 创建目录结构

```bash
# 创建应用目录
sudo mkdir -p /opt/nodepassdash/{bin,data,logs,backups}

# 移动二进制文件
sudo mv nodepassdash /opt/nodepassdash/bin/

# 设置权限
sudo chown -R root:root /opt/nodepassdash/bin
sudo chmod 755 /opt/nodepassdash/bin/nodepassdash

# 清理下载的压缩包
rm -f NodePassDash_*.tar.gz
```

#### 3. 创建专用用户（推荐）

```bash
# 创建系统用户
sudo useradd --system --home /opt/nodepassdash --shell /bin/false nodepass

# 设置目录权限
sudo chown -R nodepass:nodepass /opt/nodepassdash/{data,logs,backups}
# nodepassdash 运行时会创建 dist 和 public 目录，确保有写权限
sudo chown nodepass:nodepass /opt/nodepassdash
```

## ⚙️ 配置管理

### 环境变量

NodePassDash 支持以下环境变量进行配置：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | HTTP 服务端口 |
| `DATA_DIR` | ./data | 数据存储目录 |
| `LOG_DIR` | ./logs | 日志存储目录 |
| `LOG_LEVEL` | info | 日志级别 (debug/info/warn/error) |

### 命令行参数

```bash
# 指定端口启动
/opt/nodepassdash/bin/nodepassdash --port 8080
# 配置证书以启动https访问
/opt/nodepassdash/bin/nodepassdash --cert /path/to/cert.pem --key /path/to/cert.key
# 启动时指定日志等级
/opt/nodepassdash/bin/nodepassdash --log-level debug
# 查看帮助信息
/opt/nodepassdash/bin/nodepassdash --help
# 查看版本信息
/opt/nodepassdash/bin/nodepassdash --version
```

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

# 日志输出
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nodepassdash

# 安全设置
NoNewPrivileges=true
# PrivateTmp=true
# ProtectSystem=strict
# ProtectHome=true
# nodepassdash 需要在工作目录创建 dist 和 public 目录
ReadWritePaths=/opt/nodepassdash

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

### 4. 版本更新说明

⚠️ **重要提醒**: 更新 NodePassDash 时会自动删除 `dist` 目录，这是因为：
- `dist` 目录包含前端静态资源
- 每个版本的前端资源可能不同
- 删除后程序会自动重新释放最新的前端资源

此操作不会影响您的数据，所有配置和数据都存储在 `data` 目录中。

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
        sudo -u nodepass $BINARY_PATH --resetpwd
        sudo systemctl start $SERVICE_NAME
        ;;
    update)
        echo "更新 NodePassDash..."
        sudo systemctl stop $SERVICE_NAME
        
        # 备份当前版本
        sudo cp $BINARY_PATH $BINARY_PATH.backup.$(date +%Y%m%d%H%M%S)
        
        # 删除前端资源目录，强制重新释放
        if [ -d "/opt/nodepassdash/dist" ]; then
            echo "删除旧的前端资源..."
            sudo rm -rf /opt/nodepassdash/dist
        fi
        
        # 检测架构并下载最新版本
        ARCH=$(uname -m)
        case $ARCH in
            x86_64)
                DOWNLOAD_ARCH="Linux_x86_64"
                ;;
            aarch64)
                DOWNLOAD_ARCH="Linux_arm64"
                ;;
            armv7l)
                DOWNLOAD_ARCH="Linux_armv7hf"
                ;;
            armv6l)
                DOWNLOAD_ARCH="Linux_armv6hf"
                ;;
            *)
                echo "不支持的架构: $ARCH"
                exit 1
                ;;
        esac
        
        DOWNLOAD_URL="https://github.com/NodePassProject/NodePassDash/releases/latest/download/NodePassDash_${DOWNLOAD_ARCH}.tar.gz"
        TEMP_DIR="/tmp/nodepassdash-update"
        
        # 创建临时目录并下载
        mkdir -p $TEMP_DIR
        cd $TEMP_DIR
        
        echo "下载最新版本..."
        sudo wget $DOWNLOAD_URL -O nodepassdash.tar.gz
        
        # 解压并安装
        sudo tar -xzf nodepassdash.tar.gz
        sudo cp nodepassdash $BINARY_PATH
        sudo chmod 755 $BINARY_PATH
        sudo chown root:root $BINARY_PATH
        
        # 清理临时文件
        cd /
        sudo rm -rf $TEMP_DIR
        
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

## 📁 目录结构

NodePassDash 安装后的目录结构如下：

```
/opt/nodepassdash/
├── bin/                    # 二进制文件目录 (root权限)
│   └── nodepassdash        # 主程序
├── data/                   # 数据存储目录 (nodepass权限)
├── logs/                   # 日志存储目录 (nodepass权限)
├── backups/               # 备份目录 (nodepass权限)
├── dist/                  # 运行时创建的前端资源 (nodepass权限)
└── public/                # 运行时创建的静态资源 (nodepass权限)
```

**说明：**
- `dist` 和 `public` 目录会在首次运行时自动创建
- 所有数据和日志文件由 `nodepass` 用户拥有
- 二进制文件由 `root` 用户拥有，确保安全性

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

# 修改systemd服务中的端口
sudo systemctl edit nodepassdash
```

#### 3. 权限问题

```bash
# 修复数据目录权限
sudo chown -R nodepass:nodepass /opt/nodepassdash/data /opt/nodepassdash/logs

# 修复工作目录权限
sudo chown nodepass:nodepass /opt/nodepassdash
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