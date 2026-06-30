# Development

## Prerequisites

- Node.js 20+
- pnpm 8+ (via Corepack)
- Go 1.23+ (see `go.mod`)

SQLite ships via the pure-Go `modernc.org/sqlite` driver, so no C toolchain or `sqlite-dev` is required.

```bash
corepack enable && corepack prepare pnpm@latest --activate
```

## Dev Mode

```bash
# Terminal A: backend
pnpm dev:back

# Terminal B: frontend (dev server proxies /api to backend)
pnpm dev:front
```

Open:

- UI: `http://localhost:3000`

## Production Build

```bash
# builds web into cmd/server/dist and builds the Go binary
pnpm build

# if you only want the backend binary
go build -o nodepassdash ./cmd/server
```

