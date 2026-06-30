# 开发环境

## 环境准备

- Node.js 20+
- pnpm 8+（建议使用 Corepack）
- Go 1.23+（以 `go.mod` 为准）

SQLite 走纯 Go 实现的 `modernc.org/sqlite` 驱动,无需安装 C 工具链或 `sqlite-dev`。

```bash
corepack enable && corepack prepare pnpm@latest --activate
```

## 开发模式

```bash
# 终端 A：后端
pnpm dev:back

# 终端 B：前端（dev server 会将 /api 代理到后端）
pnpm dev:front
```

访问：

- 前端界面：`http://localhost:3000`

## 生产构建

```bash
# 构建前端到 cmd/server/dist，并构建 Go 可执行文件
pnpm build

# 仅构建后端二进制
go build -o nodepassdash ./cmd/server
```

