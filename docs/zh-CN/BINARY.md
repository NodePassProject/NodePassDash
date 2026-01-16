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

## 升级

- 脚本安装：按脚本提供的升级方式操作（如有）。
- 手动安装：替换为新版本二进制后重启服务。

## 卸载

脚本安装可直接卸载：

```bash
./install.sh uninstall
```

