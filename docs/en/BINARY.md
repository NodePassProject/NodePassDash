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

## Upgrade

- If installed via script, re-run the script update command if available in your installation.
- If installed manually, replace the binary with the new release, then restart the service.

## Uninstall

If installed via script, use the uninstall option:

```bash
./install.sh uninstall
```

