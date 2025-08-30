# NodePass WebUI - 整合SSE服务的Docker镜像
# Next.js应用内置SSE服务，单端口运行

# ========= 前端构建阶段 =========
FROM node:20-alpine AS frontend-builder

# 安装必要工具（包括 zip）
RUN apk add --no-cache zip

# 使用 corepack 预装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 缓存依赖层
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# 复制前端源代码
COPY . .

# 运行构建脚本，生成静态文件到 dist/
RUN pnpm build

# 📦 压缩前端文件为 dist.zip（Go embed 需要）
RUN cd dist && zip -r ../dist.zip . && cd ..

# 📋 复制 dist.zip 到 cmd/server/ 目录（Go embed 需要）
RUN cp dist.zip cmd/server/

# 清理 dev 依赖，减少后续镜像体积
RUN pnpm prune --prod

# ========= Go 构建阶段 =========
FROM golang:1.23-alpine AS backend-builder
ARG VERSION=dev
WORKDIR /app

# 安装编译依赖
RUN apk add --no-cache git gcc g++ make musl-dev sqlite-dev

# 将 go.mod 和 go.sum 拷贝并拉取依赖
COPY go.mod go.sum ./

# 设置 Go module proxy 和超时
ENV GOPROXY=https://proxy.golang.org,direct
ENV GOSUMDB=sum.golang.org
ENV GOTIMEOUT=600s

# 增加网络重试和下载超时
RUN go mod download -x

# 复制剩余代码（包括先前前端生成的 dist）
COPY --from=frontend-builder /app .

# 启用 CGO 和设置编译标记以支持 musl
ENV CGO_ENABLED=1
ENV CGO_CFLAGS="-D_LARGEFILE64_SOURCE"

# 编译 Backend 可执行文件，注入版本号
RUN go build -ldflags "-s -w -X main.Version=${VERSION}" -o nodepassdash ./cmd/server

# ========= 运行阶段 =========
FROM alpine:latest
ARG VERSION=dev
LABEL org.opencontainers.image.version=$VERSION
ENV APP_VERSION=$VERSION
WORKDIR /app

# 拷贝可执行文件、静态资源、public 目录
COPY --from=backend-builder /app/nodepassdash ./
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/public ./public

# 默认端口
EXPOSE 3000

# 启动命令
CMD ["/app/nodepassdash"]

# --- 至此，镜像构建完成 --- 