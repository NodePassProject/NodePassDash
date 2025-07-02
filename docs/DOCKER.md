# 🐳 NodePassDash Docker 部署指南

> **⚠️ v2.0.0 重大版本升级通知**  
> **本版本采用全新的 Go 后端架构，带来显著的性能提升！**  
> **升级前请务必备份好你的数据文件和配置。**

NodePassDash v2.0.0 提供了完整的 Docker 化解决方案，基于高性能 Go 后端，支持快速部署和一键启动。


#### 📋 初始化流程

> 首次部署时，系统会自动初始化创建管理员账户。部署完成后，请立即执行以下命令获取登录信息：

```bash
# 使用 Docker Plugin
docker compose logs | grep -A 6 "系统初始化完成"

# 或使用独立安装的 docker-compose
docker-compose logs | grep -A 6 "系统初始化完成"

# 如果使用 Docker 命令
docker logs nodepassdash | grep -A 6 "系统初始化完成"

================================
🚀 NodePass 系统初始化完成！
================================
管理员账户信息：
用户名: xxxxxx
密码: xxxxxxxxxxxx
================================
⚠️  请妥善保存这些信息！
================================
```
#### ⚠️ 重要安全提示

- **密码修改**: 请在首次登录后立即修改管理员密码
- **密码保存**: 初始密码仅显示一次，请务必及时保存
- **密码重置**: 如果忘记密码，可以使用 `--reset-pwd` 命令重置：
  ```bash
  # Docker 容器中重置密码
  docker exec -it nodepassdash ./nodepassdash --reset-pwd
  
  # 或停止容器后手动运行
  docker run --rm -v ./public:/app/public ghcr.io/nodepassproject/nodepassdash:latest ./nodepassdash --reset-pwd
  ```

### 方式一：使用预构建镜像（推荐）

默认情况下，使用ipv4:
```bash
# 1. 下载 Docker Compose 文件并重命名
wget https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/docker-compose.release.yml -O docker-compose.yml

# 2. 创建必要目录
mkdir -p logs public && chmod 777 logs public

# 3. 启动服务
docker compose up -d
```

当发现ipv6不可用时，参考如下：

前提条件：
请先参考Docker文档[Use IPv6 networking](https://docs.docker.com/engine/daemon/ipv6/)进行配置ipv6网络
```json
// 修改/etc/docker/daemon.json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00::/80",
  "experimental": true,
  "ip6tables": true
}
// 重启docker服务
systemctl daemon-reload && systemctl restart docker
```
当配置完docker支持ipv6网络后，把原来compose文件内的`network_mode: "host"`去掉再重新尝试启动

如果仍然发现v6无效，再尝试如下方法：

方式一：先手动创建ipv6网络法
```bash
# 1. 创建ipv6网络 (如果未创建)
docker network create --ipv6 --subnet 2001:db8::/64 ipv6net
# 2. 下载 Docker Compose v6版文件并重命名
wget https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/docker-compose.releasev6.yml -O docker-compose.yml
# 3. 启动服务
docker compose up -d
```
方式二：使用docker-compose启动时自动创建ipv6网络
```bash
# 1. 下载 Docker Compose v6版文件并重命名
wget https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/docker-compose.releasev6-create.yml -O docker-compose.yml
# 2. 启动服务
docker compose up -d
```
### 方式二：使用 Docker 命令启动

#### 基础启动
```bash
# 最简单一条指令
docker run -itd \
  --name nodepassdash \
  -p 3000:3000 \
  ghcr.io/nodepassproject/nodepassdash:latest
```

#### 完整配置启动
```bash
# 1. 拉取最新镜像
docker pull ghcr.io/nodepassproject/nodepassdash:latest

# 2. 创建必要目录
mkdir -p logs public && chmod 777 logs public

# 3. 启动容器（支持自定义端口）
docker run -d \
  --name nodepassdash \
  -p 3000:3000 \
  -v ./logs:/app/logs \
  -v ./public:/app/public \
  ghcr.io/nodepassproject/nodepassdash:latest \
  ./nodepassdash --port 3000

# 4. 自定义端口启动示例
docker run -d \
  --name nodepassdash \
  -p 8080:8080 \
  -v ./logs:/app/logs \
  -v ./public:/app/public \
  ghcr.io/nodepassproject/nodepassdash:latest \
  ./nodepassdash --port 8080
```

#### 管理命令
```bash
# 重置管理员密码
docker exec -it nodepassdash ./nodepassdash --resetpwd

# 查看容器日志
docker logs -f nodepassdash

# 进入容器调试
docker exec -it nodepassdash sh
```

当发现ipv6不可用时，参考如下：

前提条件：
请先参考Docker文档[Use IPv6 networking](https://docs.docker.com/engine/daemon/ipv6/)进行配置ipv6网络
```json
// 修改/etc/docker/daemon.json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00::/80",
  "experimental": true,
  "ip6tables": true
}
// 重启docker服务
systemctl daemon-reload && systemctl restart docker
```
当配置完docker支持ipv6网络后，再按照原来的指令启动仍然发现v6无效，再尝试如下方法：

方式一：尝试启动时将网络模式更换为host
```bash
docker run -d \
  --name nodepassdash \
  --network host \
  -v ./logs:/app/logs \
  -v ./public:/app/public \
  ghcr.io/nodepassproject/nodepassdash:latest
```
方式二：指定ipv6网络
```bash
docker run -d \
  --name nodepassdash \
  --network="bridge" \
  --sysctl net.ipv6.conf.all.disable_ipv6=0 \
  --sysctl net.ipv6.conf.default.disable_ipv6=0 \
  -v ./logs:/app/logs \
  -v ./public:/app/public \
  ghcr.io/nodepassproject/nodepassdash:latest
```
方式三：手动创建ipv6网络
```
# 1. 创建ipv6网络 (如果未创建)
docker network create --ipv6 --subnet 2001:db8::/64 ipv6net
# 2. 启动容器
docker run -d \
  --name nodepassdash \
  --network ipv6net \
  -v ./logs:/app/logs \
  -v ./public:/app/public \
  ghcr.io/nodepassproject/nodepassdash:latest
```
## 🔧 服务配置

### 端口映射

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| Next.js + go后端 | 3000 | 3000 | 整合的Web应用 |

### Docker Compose 配置

- **开发环境**: `docker-compose.yml` - 本地构建和开发
- **生产环境**: `docker-compose.release.yml` - 使用预构建镜像

### 数据持久化

SQLite 数据库文件存储在 `public/sqlite.db`，通过 Docker 卷挂载实现持久化：
```yaml
volumes:
  - ./public:/app/public  # SQLite 数据库文件
  - ./logs:/app/logs      # 应用日志文件
```

### 环境变量配置

支持通过环境变量自定义配置：
```yaml
services:
  nodepassdash:
    image: ghcr.io/nodepassproject/nodepassdash:latest
    environment:
      - PORT=3000                    # 自定义端口
      - LOG-LEVEL=INFO               # 日志等级
      - TLS_CERT=/path/to/cert.pem   # TLS证书
      - TLS_KEY=/path/to/key.pem     # TLS密钥
      - DISABLE_LOGIN=true           # 禁用用户名密码登录
    volumes:
      # TLS证书
      - /path/to/cert.pem:/path/to/cert.pem
      - /path/to/key.pem:/path/to/key.pem
    command: ["./nodepassdash", "--port", "3000"]
```

## 🐛 故障排除

### 常见问题

#### 1. 端口冲突
```bash
# 检查端口占用
netstat -tulpn | grep :3000

# 停止服务
docker-compose down
```

#### 2. 数据库访问错误
```bash
# 检查数据库文件权限
ls -l public/sqlite.db

# 修复权限
chmod 666 public/sqlite.db
```

#### 3. 应用启动失败
```bash
# 查看详细日志
docker-compose logs -f nodepassdash

# 进入容器调试
docker exec -it nodepassdash sh

# 检查 Go 后端状态
docker exec -it nodepassdash ps aux | grep nodepassdash
```

#### 4. 忘记管理员密码
```bash
# 方法一：在运行中的容器内重置
docker exec -it nodepassdash ./nodepassdash --resetpwd

# 方法二：停止容器后重置（推荐）
docker stop nodepassdash
docker run --rm -v ./public:/app/public ghcr.io/nodepassproject/nodepassdash:latest ./nodepassdash --resetpwd
docker start nodepassdash
```

#### 5. 端口冲突解决
```bash
# 检查端口占用
netstat -tulpn | grep :3000

# 使用自定义端口启动
docker run -d \
  --name nodepassdash \
  -p 8080:8080 \
  -v ./public:/app/public \
  ghcr.io/nodepassproject/nodepassdash:latest \
  ./nodepassdash --port 8080
```

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs -f

# 只查看应用日志
docker-compose logs -f nodepassdash
```


## 📈 系统最低要求

- CPU: 1核
- 内存: 512MB
- 磁盘空间: 2GB
- Docker 版本: 20.10.0 或更高

## 🛡️ 安全建议

### 🔒 HTTPS 配置

强烈建议在生产环境中使用 HTTPS。由于 NodePassDash 默认运行在 3000 端口，您可以通过以下方式配置 HTTPS：

#### 1️⃣ 使用 Nginx 反向代理（推荐）

创建配置文件 `/etc/nginx/conf.d/nodepass.conf`：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /path/to/your/fullchain.pem;
    ssl_certificate_key /path/to/your/privkey.pem;
    
    # SSL 优化配置
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS 配置（按需启用）
    # add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

#### 2️⃣ 使用 Caddy（最简单）

Caddy 会自动申请和续期 SSL 证书，创建 `Caddyfile`：

```caddyfile
your-domain.com {
    reverse_proxy localhost:3000
}
```

#### 3️⃣ Docker Compose 集成方案

创建 `docker-compose.yml`：

```yaml
version: '3'

services:
  nodepass:
    image: nodepassdash:latest
    restart: unless-stopped
    networks:
      - nodepass-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro  # SSL证书目录
    depends_on:
      - nodepass
    restart: unless-stopped
    networks:
      - nodepass-network

networks:
  nodepass-network:
    driver: bridge
```

**🔔 注意事项：**

* 部署前请将配置中的 `your-domain.com` 替换为实际域名
* SSL 证书推荐使用 Let's Encrypt 免费申请
* 建议在充分测试后启用 HSTS
* 使用 CDN 时需正确配置 X-Forwarded-* 头部

### 💾 数据备份

> **⚠️ v2.0.0 升级重要提醒**  
> 升级到 v2.0.0 前，**强烈建议**备份你的数据！新版本的数据库结构有所调整。

```bash
# 升级前的完整备份
docker-compose stop nodepassdash  # 停止服务以确保数据一致性

# 备份整个 public 目录（包含数据库和配置文件）
tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz public/

# 仅备份 SQLite 数据库
cp public/sqlite.db public/sqlite.db.backup-$(date +%Y%m%d-%H%M%S)

# 启动新版本
docker-compose start nodepassdash

# 恢复数据库（如果需要回滚）
docker-compose stop nodepassdash
cp public/sqlite.db.backup-YYYYMMDD-HHMMSS public/sqlite.db
docker-compose start nodepassdash
```

## 🔄 更新和维护

### 更新到最新版本

```bash
# 拉取最新镜像
docker compose pull  # 如果使用 Docker Plugin
# 或
docker-compose pull  # 如果使用独立安装的 docker-compose

# 重启服务
docker compose up -d  # 如果使用 Docker Plugin
# 或
docker-compose up -d  # 如果使用独立安装的 docker-compose
```