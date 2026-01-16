# Docker 部署（NodePassDash）

本指南使用 Docker 部署 NodePassDash。NodePassDash 以 **单容器**方式运行（Go API + 内置 Web UI），默认使用 **单端口**（`3000`）。

## 环境要求

- Docker Engine + Docker Compose（`docker compose`）
- 用于持久化的数据目录（`db/`）与文件日志目录（`logs/`）

## 快速开始（docker compose）

1）准备目录：

```bash
mkdir -p nodepassdash && cd nodepassdash
mkdir -p db logs
```

2）创建 `docker-compose.yml`（示例）：

```yaml
services:
  nodepassdash:
    image: ghcr.io/nodepassproject/nodepassdash:latest
    container_name: nodepassdash
    ports:
      - "3000:3000"
    volumes:
      - ./db:/app/db
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
```

3）启动：

```bash
docker compose up -d
```

## 首次登录 / 初始账号

首次启动会自动初始化数据库，并在日志中输出初始管理员账号信息：

```bash
docker logs nodepassdash | grep -E \"初始化完成|initialized|用户名|password\" -n || docker logs nodepassdash
```

登录后建议立即在界面中修改密码。

## 常用配置

可通过命令行参数（推荐）或环境变量配置。

### 端口

- 默认端口：`3000`
- CLI：`./nodepassdash --port 8080`
- Env：`PORT=8080`

### TLS（HTTPS）

同时提供证书与私钥即可启用 HTTPS：

```bash
./nodepassdash --cert /path/to/cert.pem --key /path/to/key.pem
```

Docker 中可挂载证书并通过 `command:` 传参：

```yaml
services:
  nodepassdash:
    image: ghcr.io/nodepassproject/nodepassdash:latest
    ports: ["443:443"]
    volumes:
      - ./db:/app/db
      - ./logs:/app/logs
      - ./certs/fullchain.pem:/certs/fullchain.pem:ro
      - ./certs/privkey.pem:/certs/privkey.pem:ro
    command: ["./nodepassdash","--port","443","--cert","/certs/fullchain.pem","--key","/certs/privkey.pem"]
```

### 禁用用户名密码登录（仅 OAuth2）

```bash
./nodepassdash --disable-login
```

启用前请先在界面中配置好 OAuth2，否则可能会无法登录。

## 备份与恢复

- 备份：拷贝 `db/`（SQLite 数据库），需要的话也可备份 `logs/`。
- 恢复：停止容器，恢复目录，再启动。

```bash
docker compose down
# restore ./db (and ./logs)
docker compose up -d
```

## 升级

```bash
docker compose pull
docker compose up -d
```

如使用固定版本 tag，请先更新 `docker-compose.yml` 中的镜像 tag。

## 排错

- 健康检查：`curl -fsS http://localhost:3000/api/health`
- 查看日志：`docker logs -f nodepassdash`
- 重置管理员密码（重置后需要重启容器）：`docker exec -it nodepassdash ./nodepassdash --resetpwd`

