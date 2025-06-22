# 🛠️ NodePassDash 开发环境 

## 环境准备

```bash
# Node 20+ / pnpm 8+ / Go 1.21+
corepack enable && corepack prepare pnpm@latest --activate
```

## 开发模式

```bash
# ① 终端 A – 后端
pnpm dev:back
# ② 终端 B – 前端 (3000 → 8080 代理到后端)
pnpm dev:front
```
## 生产构建

```bash
# 生成 dist/ 静态文件 + Go 可执行文件
pnpm build
# 需 gcc, sqlite-dev
CGO_ENABLED=1 go build -o server ./cmd/server  
```

访问：
- 前端界面: http://localhost:3000