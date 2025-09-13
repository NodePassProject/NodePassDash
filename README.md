<div align="center">
  <img src="docs/nodepassdash-logo.svg" alt="NodePassDash" height="80">
</div>

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![GitHub license](https://img.shields.io/github/license/NodePassProject/NodePassDash)

NodePassDash是一个现代化的 NodePass 管理界面，基于 Go 后端 + React + Vite、HeroUI 和 TypeScript 构建。提供实时隧道监控、流量统计和端点管理功能。

> **⚠️ 重大版本升级通知**
> **version 3.x 是一个重大版本更新！** 核心架构全面重构，从 Next.js 迁移至 Vite，后端升级至 GORM + Gin 架构。
>
> ***此版本不向下兼容，升级前请务必备份/导出主控数据，建议全新创建主控避免旧数据的影响！***

## ✨ 主要特性

- 🚀 **架构全新升级**: 从 Next.js 迁移至 Vite，构建速度显著提升；后端升级至 GORM + Gin 架构
- 🎯 **实时监控升级**: 通过 SSE 实时推送隧道状态、流量数据和日志信息
- 📊 **数据可视化增强**: 支持多时间段切换（24h/12h/6h/1h）和图表放大查看
- 🎨 **个性化配置**: 新增个性化配置按钮，支持隐私设置、新手模式等
- 🎬 **场景化创建**: 参考 iOS 版本设计，提供场景化隧道创建体验
- 🔍 **网络诊断工具**: 内置网络调试和诊断功能，方便问题排查
- 📱 **移动端APP联动**: 增加适配移动端APP的二维码导入显示
- 🐳 **Docker 优化**: 多阶段构建，支持多架构部署

## 📸 界面预览

| | | |
|---|---|---|
| ![截图0](docs/00.png) | ![截图1](docs/01.png) | ![截图2](docs/02.png) |
| ![截图3](docs/03.png) | ![截图4](docs/04.png) | ![截图5](docs/05.png) |

## 📂 目录结构（简化）
```text
├─ web/                 前端应用 (React + Vite + HeroUI)
│  ├─ src/              React 组件和页面
│  ├─ public/           静态资源 (logo, favicon 等)
│  └─ package.json      前端依赖和构建脚本
├─ internal/            Go 业务代码
├─ cmd/server/          Go 应用入口
├─ Dockerfile           多阶段容器构建
├─ build.sh             本地构建脚本
└─ .github/workflows/   CI/CD 自动化构建
```

## ⚡️ 快速开始

<div style="display: flex; align-items: center; gap: 12px;">
  <a href="https://dash.nodepass.eu/">
    <img src="https://img.shields.io/badge/点击体验_Demo-000?style=for-the-badge&logo=heroui&logoColor=white&labelColor=000" alt="Deploy to NodePassDash">
  </a>
  <span><strong>演示账号：</strong> <code>nodepass</code> / <code>Np123456</code></span>
</div>

> ⚠️ **重要提醒：演示环境，请勿更改密码，请勿填写任何敏感信息**

我们提供三种部署方式，请根据你的需求选择：

### 🐳 方式一：Docker 部署（推荐）

> 适合生产环境，开箱即用，自动处理依赖和环境配置。

📚 查看 [Docker 完整部署文档](docs/DOCKER.md) 了解详细配置

### 📦 方式二：二进制部署

> 适合 VPS/服务器环境，性能最优，支持 systemd 服务管理。

📚 查看 [二进制部署文档](docs/BINARY.md) 了解详细配置

### 🛠️ 方式三：开发环境

> 适合开发者本地开发和调试。

📚 查看 [开发环境文档](docs/DEVELOPMENT.md) 了解完整开发流程

## 🔧 命令行工具

NodePassDash v3.0.0 提供了命令行参数来管理和配置应用：

### 基本参数

```bash
# 指定端口启动（默认 3000）
./nodepassdash --port 8080
# 配置证书以启动https访问
./nodepassdash --cert /path/to/cert.pem --key /path/to/cert.key
# 启动时指定日志等级
./nodepassdash --log-level debug
# 显示帮助信息
./nodepassdash --help
# 显示版本信息
./nodepassdash --version
# 禁用用户名密码登录
./nodepassdash --disable-login
```

### 管理工具

```bash
# 重置管理员密码，注：重置后需要重启服务
./nodepassdash --resetpwd
# 系统会提示输入新的用户名和密码
# 数据库维护（检查和修复）
./nodepassdash --db-check
# 清理日志文件（保留最近30天）
./nodepassdash --clean-logs
```

### Docker 环境下使用

```bash
# 在运行中的容器内重置密码，注：重置后需要重启容器
docker exec -it nodepassdash ./nodepassdash --resetpwd

# 使用自定义端口启动容器
docker run -d \
  --name nodepassdash \
  -p 8080:8080 \
  ghcr.io/nodepassproject/nodepassdash:latest \
  ./nodepassdash --port 8080
```

## 📄 许可证

本项目基于 [BSD-3-Clause 许可证](LICENSE) 开源。

## ⚖️ 免责声明

本项目以“现状”提供，开发者不提供任何明示或暗示的保证。用户使用风险自担，需遵守当地法律法规，仅限合法用途。开发者对任何直接、间接、偶然或后果性损害概不负责。进行二次开发须承诺合法使用并自负法律责任。开发者保留随时修改软件功能及本声明的权利。最终解释权归开发者所有。

## 📞 支持

- 🐛 问题报告: [GitHub Issues](https://github.com/NodePassProject/NodePassDash/issues)
- 💬 社区讨论: [Telegram 群组](https://t.me/NodePassGroup)
- 📢 频道: [Telegram 频道](https://t.me/NodePassChannel)

---

⭐ 如果这个项目对你有帮助，请给我们一个 Star！

[![Star History Chart](https://api.star-history.com/svg?repos=NodePassProject/NodePassDash&type=Date)](https://star-history.com/#NodePassProject/NodePassDash&Date)

