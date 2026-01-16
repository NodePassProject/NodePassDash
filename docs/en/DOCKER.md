# Docker Deployment (NodePassDash)

This guide deploys NodePassDash using Docker. NodePassDash runs as a **single container** (Go API + embedded Web UI) on **one port** (default `3000`).

## Requirements

- Docker Engine + Docker Compose (`docker compose`)
- A directory to persist data (`db/`) and file logs (`logs/`)

## Quick Start (docker compose)

1) Create a working directory and prepare volumes:

```bash
mkdir -p nodepassdash && cd nodepassdash
mkdir -p db logs
```

2) Create `docker-compose.yml` (example):

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

3) Start:

```bash
docker compose up -d
```

## First Login / Initial Credentials

On first start, NodePassDash initializes the database and prints the initial admin credentials in logs.

```bash
docker logs nodepassdash | grep -E \"initialized|username|password|初始化完成|用户名|密码\" -n || docker logs nodepassdash
```

After logging in, change the password in the UI.

## Common Options

You can pass configuration either as CLI flags (recommended) or via environment variables.

### Ports

- Default port: `3000`
- CLI: `./nodepassdash --port 8080`
- Env: `PORT=8080`

### TLS (HTTPS)

Provide both cert and key to enable HTTPS:

```bash
./nodepassdash --cert /path/to/cert.pem --key /path/to/key.pem
```

In Docker, mount the certificate files and pass the flags via `command:`:

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

### Disable Password Login (OAuth2 only)

```bash
./nodepassdash --disable-login
```

If you enable this, make sure OAuth2 is configured in the UI first; otherwise you may lock yourself out.

## Backup / Restore

- Backup: copy the `db/` directory (SQLite) and optionally `logs/`.
- Restore: stop the container, restore directories, then start again.

```bash
docker compose down
# restore ./db (and ./logs)
docker compose up -d
```

## Upgrade

```bash
docker compose pull
docker compose up -d
```

If you pin to a version tag, update the tag in `docker-compose.yml` first.

## Troubleshooting

- Check health: `curl -fsS http://localhost:3000/api/health`
- View logs: `docker logs -f nodepassdash`
- Reset admin password (requires restart after): `docker exec -it nodepassdash ./nodepassdash --resetpwd`
