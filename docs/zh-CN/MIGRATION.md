# 📋 2.x 升级到 3.x 迁移指南

**version 3.x 是一个重大版本更新！** 核心架构全面重构，从 Next.js 打包更换为 Vite 打包，后端重构为 GORM + Gin 架构。

## 升级步骤

### 1. 导出主控数据

- 在 2.x 版本的主控列表中，使用导出功能保存所有主控配置数据

### 2. 更新 Docker 配置

- 从仓库获取最新的 `docker-compose.yml` 配置文件

### 3. 拉取最新镜像

```bash
docker pull ghcr.io/nodepassproject/nodepassdash:latest
```

### 4. 重启容器

```bash
# 在容器所在的compose文件目录运行
docker compose down && docker compose up -d
```

### 5. 重新导入数据

- 访问新版本界面，重新创建主控配置
- 导入之前导出的主控数据
- 验证所有功能正常工作

## ⚠️ 注意事项

***此版本不向下兼容，升级前请务必备份/导出主控数据，建议全新创建主控避免旧数据的影响！***

- **数据库不兼容**: 3.x 版本使用全新的数据库表结构，无法直接迁移 2.x 数据
- **配置格式变更**: 主控配置格式有所调整，建议手动重新配置重要隧道
- **功能变化**: 部分功能界面和操作方式有所变化，建议查看新版本文档

## 常见问题

### Q: 能否直接升级而不丢失数据？

A: 不能。由于数据库结构完全重构，必须通过导出/导入的方式迁移数据。

### Q: 导出的数据包含哪些内容？

A: 导出的数据包含所有主控配置信息，包括主控地址、端口、凭证等设置。

### Q: 升级后能否回退到 2.x 版本？

A: 可以，但需要使用升级前备份的数据。建议在升级前做好完整备份。

## 技术支持

如果在迁移过程中遇到问题，请：

- 查看 [GitHub Issues](https://github.com/NodePassProject/NodePassDash/issues)
- 加入 [Telegram 群组](https://t.me/NodePassGroup) 寻求帮助
- 关注 [Telegram 频道](https://t.me/NodePassChannel) 获取最新信息
