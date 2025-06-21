#!/bin/bash
set -e

echo "🏗️ 开始构建嵌入版本的 NodePass Dashboard..."

# 检查是否安装了必要的依赖
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 请先安装 pnpm"
    exit 1
fi

if ! command -v go &> /dev/null; then
    echo "❌ 错误: 请先安装 Go"
    exit 1
fi

# 获取版本信息
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "dev")
echo "📦 构建版本: $VERSION"

# 清理旧文件
echo "🧹 清理旧文件..."
rm -rf dist/ dist.zip cmd/server/dist.zip 2>/dev/null || true

# 构建前端
echo "📦 安装前端依赖..."
pnpm install --frozen-lockfile

echo "🏗️ 构建前端静态文件..."
pnpm build

echo "📁 验证构建结果:"
ls -la dist/

# 压缩前端文件
echo "📦 压缩前端文件为 dist.zip..."
cd dist && zip -r ../dist.zip . && cd ..

# 复制到 Go 项目目录
echo "📋 复制 dist.zip 到 cmd/server/ 目录..."
cp dist.zip cmd/server/

# 构建 Go 程序
echo "🏗️ 构建 Go 后端 (嵌入模式)..."
CGO_ENABLED=1 go build -trimpath -ldflags "-s -w -X main.Version=$VERSION" -tags "sqlite_omit_load_extension" -o NodePassDash-embedded ./cmd/server

# 验证构建结果
if [ -f "NodePassDash-embedded" ] || [ -f "NodePassDash-embedded.exe" ]; then
    BINARY_NAME="NodePassDash-embedded"
    if [ -f "NodePassDash-embedded.exe" ]; then
        BINARY_NAME="NodePassDash-embedded.exe"
    fi
    
    SIZE=$(ls -lh "$BINARY_NAME" | awk '{print $5}')
    echo "✅ 构建成功!"
    echo "📁 输出文件: $BINARY_NAME ($SIZE)"
    echo ""
    echo "🚀 运行方式:"
    echo "  ./$BINARY_NAME --port 3000"
    echo ""
    echo "📝 说明:"
    echo "  - 程序首次运行会自动解压前端文件到当前目录的 dist/ 文件夹"
    echo "  - 如果 dist/ 已存在则跳过解压"
    echo "  - 程序可以在任何目录运行，无需外部依赖"
else
    echo "❌ 构建失败!"
    exit 1
fi 