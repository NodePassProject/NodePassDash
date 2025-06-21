# PowerShell 构建脚本
$ErrorActionPreference = "Stop"

Write-Host "🏗️ 开始构建嵌入版本的 NodePass Dashboard..." -ForegroundColor Green

# 检查是否安装了必要的依赖
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: 请先安装 pnpm" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: 请先安装 Go" -ForegroundColor Red
    exit 1
}

# 获取版本信息
try {
    $VERSION = node -p "require('./package.json').version"
} catch {
    $VERSION = "dev"
}
Write-Host "📦 构建版本: $VERSION" -ForegroundColor Cyan

# 清理旧文件
Write-Host "🧹 清理旧文件..." -ForegroundColor Yellow
Remove-Item -Path "dist", "dist.zip", "cmd/server/dist.zip", "NodePassDash-embedded.exe" -Recurse -Force -ErrorAction SilentlyContinue

# 构建前端
Write-Host "📦 安装前端依赖..." -ForegroundColor Cyan
pnpm install --frozen-lockfile

Write-Host "🏗️ 构建前端静态文件..." -ForegroundColor Cyan
pnpm build

Write-Host "📁 验证构建结果:" -ForegroundColor Cyan
Get-ChildItem -Path "dist" | Format-Table Name, Length, LastWriteTime

# 压缩前端文件
Write-Host "📦 压缩前端文件为 dist.zip..." -ForegroundColor Cyan
Compress-Archive -Path "dist\*" -DestinationPath "dist.zip" -Force

# 复制到 Go 项目目录
Write-Host "📋 复制 dist.zip 到 cmd/server/ 目录..." -ForegroundColor Cyan
Copy-Item "dist.zip" "cmd/server/"

# 构建 Go 程序
Write-Host "🏗️ 构建 Go 后端 (嵌入模式)..." -ForegroundColor Cyan
$env:CGO_ENABLED = "1"
go build -trimpath -ldflags "-s -w -X main.Version=$VERSION" -tags "sqlite_omit_load_extension" -o "NodePassDash-embedded.exe" "./cmd/server"

# 验证构建结果
if (Test-Path "NodePassDash-embedded.exe") {
    $size = (Get-Item "NodePassDash-embedded.exe").Length
    $sizeFormatted = "{0:N2} MB" -f ($size / 1MB)
    
    Write-Host "✅ 构建成功!" -ForegroundColor Green
    Write-Host "📁 输出文件: NodePassDash-embedded.exe ($sizeFormatted)" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 运行方式:" -ForegroundColor Yellow
    Write-Host "  .\NodePassDash-embedded.exe --port 3000" -ForegroundColor White
    Write-Host ""
    Write-Host "📝 说明:" -ForegroundColor Yellow
    Write-Host "  - 程序首次运行会自动解压前端文件到当前目录的 dist\ 文件夹" -ForegroundColor White
    Write-Host "  - 如果 dist\ 已存在则跳过解压" -ForegroundColor White
    Write-Host "  - 程序可以在任何目录运行，无需外部依赖" -ForegroundColor White
} else {
    Write-Host "❌ 构建失败!" -ForegroundColor Red
    exit 1
} 