# 二进制部署（NodePassDash）

本指南适用于在 VPS / 服务器上以原生二进制方式部署 NodePassDash（systemd 场景推荐）。

## 环境要求

- Linux x86_64 / arm64（其他平台以 Releases 为准）
- 用于持久化的工作目录（会生成 `db/` 与 `logs/`）

## 方式一：一键安装脚本（推荐）

仓库提供安装脚本：`scripts/install.sh`。

```bash
curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | bash
```

建议先下载检查再运行：

```bash
wget https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh
chmod +x install.sh
./install.sh
```

## 方式二：手动安装（Releases）

1）从 GitHub Releases 下载对应平台压缩包并解压  
2）将 `nodepassdash` 放到例如 `/opt/nodepassdash/bin/nodepassdash`  
3）在工作目录中启动（便于 `db/`、`logs/` 落在同级目录）：

```bash
cd /opt/nodepassdash
./bin/nodepassdash --port 3000
```

## systemd 示例

创建 `/etc/systemd/system/nodepassdash.service`：

```ini
[Unit]
Description=NodePassDash
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/nodepassdash
ExecStart=/opt/nodepassdash/bin/nodepassdash --port 3000
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nodepassdash
sudo systemctl status nodepassdash --no-pager
```

## 首次登录 / 重置密码

- 首次启动会在日志中输出初始管理员账号信息：`journalctl -u nodepassdash -n 200`
- 重置管理员密码（重置后需要重启服务）：

```bash
/opt/nodepassdash/bin/nodepassdash --resetpwd
sudo systemctl restart nodepassdash
```

## HTTPS（TLS）

同时指定证书与私钥即可启用 HTTPS：

```bash
/opt/nodepassdash/bin/nodepassdash --port 443 --cert /path/to/cert.pem --key /path/to/key.pem
```

生产环境也可以让 NodePassDash 监听内网端口，再由 Nginx/Caddy 等反代并签发证书。

## 启动参数说明

NodePassDash 支持多种启动参数来配置服务行为：

### 基础参数

- `--port <端口号>`：指定 HTTP 服务端口（默认：3000）
- `--log-level <级别>`：设置日志级别（DEBUG, INFO, WARN, ERROR）
- `--version` 或 `-v`：显示版本信息

### TLS/HTTPS

- `--cert <证书路径>`：TLS 证书文件路径
- `--key <私钥路径>`：TLS 私钥文件路径

### 认证配置

- `--disable-login`：禁用用户名密码登录，仅允许 OAuth2 登录
- `--resetpwd`：重置管理员密码

### 调试与日志

- `--sse-debug-log`：启用 SSE 消息调试日志
- `--disable-sse-log`：禁用 SSE 日志记录到文件（推荐在磁盘空间有限时使用）

### 环境变量支持

以下参数也可以通过环境变量配置（命令行参数优先级更高）：

- `PORT`：服务端口
- `LOG_LEVEL`：日志级别
- `TLS_CERT`：TLS 证书路径
- `TLS_KEY`：TLS 私钥路径
- `DISABLE_LOGIN`：禁用密码登录（值为 `true` 或 `1` 时启用）
- `SSE_DEBUG_LOG`：SSE 调试日志（值为 `true` 或 `1` 时启用）
- `DISABLE_SSE_LOG`：禁用 SSE 日志文件（值为 `true` 或 `1` 时启用）

示例：

```bash
# 使用命令行参数
./bin/nodepassdash --port 3000 --disable-sse-log

# 使用环境变量
export PORT=3000
export DISABLE_SSE_LOG=true
./bin/nodepassdash
```

### 关于 SSE 日志记录

默认情况下，NodePassDash 会将隧道的 SSE 事件日志记录到 `logs/` 目录下的文件中，便于后续查看和调试。如果你的服务器磁盘空间有限，或者不需要长期保存这些日志，可以使用 `--disable-sse-log` 参数禁用文件记录。

**注意：** 禁用后，SSE 日志仍会实时推送到前端界面，但不会保存到文件中。

## 升级

- 脚本安装：按脚本提供的升级方式操作（如有）。
- 手动安装：替换为新版本二进制后重启服务。

## 卸载

脚本安装可直接卸载：

```bash
./install.sh uninstall
```

