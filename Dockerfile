# NodePass WebUI - 整合SSE服务的Docker镜像
# Next.js应用内置SSE服务，单端口运行

# ========= 前端构建阶段 =========
FROM node:20-alpine AS frontend-builder

# 使用 corepack 预装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 设置 pnpm 环境变量，避免交互式提示
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

WORKDIR /app

# 复制前端源代码
COPY web/ ./web/

# 进入 web 目录，清理并安装依赖，然后构建
RUN cd web && \
    rm -rf node_modules && \
    pnpm install --frozen-lockfile --prod=false --ignore-scripts && \
    pnpm build && \
    pnpm prune --prod

# ========= Go 构建阶段 =========
FROM golang:1.23-alpine AS backend-builder
ARG VERSION=dev
WORKDIR /app

# 安装编译依赖
RUN apk add --no-cache git gcc g++ make musl-dev sqlite-dev

# 将 go.mod 和 go.sum 拷贝并拉取依赖
COPY go.mod go.sum ./

# 设置 Go module proxy（使用多个镜像源提高成功率）
ENV GOPROXY=https://goproxy.cn,https://goproxy.io,https://proxy.golang.org,direct
ENV GOSUMDB=sum.golang.org
ENV GOTIMEOUT=600s

# 下载依赖（添加重试逻辑）
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download || \
    (sleep 5 && go mod download) || \
    (sleep 10 && go mod download)

# 复制 Go 后端代码
COPY cmd/ ./cmd/
COPY internal/ ./internal/

# 复制前端构建产物到 cmd/server/dist 目录
COPY --from=frontend-builder /app/cmd/server/dist ./cmd/server/dist

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

# 只需要拷贝可执行文件（静态资源已通过 embed 嵌入）
COPY --from=backend-builder /app/nodepassdash ./

# 默认端口
EXPOSE 3000

# 启动命令
CMD ["/app/nodepassdash"]

# --- 至此，镜像构建完成 --- 