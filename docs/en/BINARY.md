# Binary Deployment (NodePassDash)

This guide deploys NodePassDash as a native binary on a server (recommended for VPS / systemd environments).

## Requirements

- Linux x86_64 / arm64 (other platforms may be available in Releases)
- A working directory to persist `db/` and `logs/`

## Option A: Install Script (Recommended)

NodePassDash provides an installation script in this repo: `scripts/install.sh`.

```bash
curl -fsSL https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh | bash
```

If you prefer to inspect it first:

```bash
wget https://raw.githubusercontent.com/NodePassProject/NodePassDash/main/scripts/install.sh
chmod +x install.sh
./install.sh
```

## Option B: Manual Install (Releases)

1) Download the archive from GitHub Releases and extract it.
2) Put the `nodepassdash` binary in a directory, for example: `/opt/nodepassdash/bin/nodepassdash`.
3) Run from the working directory so `db/` and `logs/` are created next to it:

```bash
cd /opt/nodepassdash
./bin/nodepassdash --port 3000
```

## Systemd Example

Create `/etc/systemd/system/nodepassdash.service`:

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

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nodepassdash
sudo systemctl status nodepassdash --no-pager
```

## First Login / Reset Password

- First start prints initial admin credentials in logs (`journalctl -u nodepassdash -n 200`).
- Reset admin password:

```bash
/opt/nodepassdash/bin/nodepassdash --resetpwd
sudo systemctl restart nodepassdash
```

## HTTPS (TLS)

Provide cert and key:

```bash
/opt/nodepassdash/bin/nodepassdash --port 443 --cert /path/to/cert.pem --key /path/to/key.pem
```

In production, you can also keep NodePassDash on an internal port and place it behind Nginx/Caddy.

## CLI Flags

NodePassDash supports various command-line flags to configure service behavior:

### Basic Options

- `--port <number>`: Specify HTTP service port (default: 3000)
- `--log-level <level>`: Set log level (DEBUG, INFO, WARN, ERROR)
- `--version` or `-v`: Display version information

### TLS/HTTPS

- `--cert <path>`: Path to TLS certificate file
- `--key <path>`: Path to TLS private key file

### Authentication

- `--disable-login`: Disable username/password login, only allow OAuth2 login
- `--resetpwd`: Reset admin password

### Debugging & Logging

- `--sse-debug-log`: Enable SSE message debug logging
- `--disable-sse-log`: Disable SSE log recording to files (recommended when disk space is limited)

### Environment Variable Support

The following parameters can also be configured via environment variables (command-line flags take precedence):

- `PORT`: Service port
- `LOG_LEVEL`: Log level
- `TLS_CERT`: TLS certificate path
- `TLS_KEY`: TLS private key path
- `DISABLE_LOGIN`: Disable password login (set to `true` or `1` to enable)
- `SSE_DEBUG_LOG`: SSE debug logging (set to `true` or `1` to enable)
- `DISABLE_SSE_LOG`: Disable SSE log files (set to `true` or `1` to enable)

Examples:

```bash
# Using command-line flags
./bin/nodepassdash --port 3000 --disable-sse-log

# Using environment variables
export PORT=3000
export DISABLE_SSE_LOG=true
./bin/nodepassdash
```

### About SSE Log Recording

By default, NodePassDash records tunnel SSE event logs to files in the `logs/` directory for later viewing and debugging. If your server has limited disk space or you don't need to keep these logs long-term, you can use the `--disable-sse-log` flag to disable file recording.

**Note:** When disabled, SSE logs will still be pushed to the frontend in real-time, but won't be saved to files.

## Upgrade

- If installed via script, re-run the script update command if available in your installation.
- If installed manually, replace the binary with the new release, then restart the service.

## Uninstall

If installed via script, use the uninstall option:

```bash
./install.sh uninstall
```

