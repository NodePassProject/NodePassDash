<div align="center">
  <img src="../nodepassdash-logo.svg" alt="NodePassDash" height="80">
</div>

**语言：** 简体中文 | [English](../../README.md)

![Version](https://img.shields.io/badge/version-3.4.0--beta1-blue.svg)
![GitHub license](https://img.shields.io/github/license/NodePassProject/NodePassDash)

NodePassDash 是一个现代化的 **NodePass** 管理面板，用于集中管理端点（Endpoints）、隧道（Tunnels）与服务（Services）。项目采用 **Go（Gin + GORM + SQLite）** 后端并内置 **React（Vite + TypeScript + HeroUI）** 前端，通过 **SSE / WebSocket** 提供实时监控与交互。

## Demo 演示

- 在线演示：https://dash.nodepass.eu/
- 演示账号：`nodepass` / `Np123456.`

> ⚠️ 重要提醒：演示环境，请勿更改密码，请勿填写任何敏感信息。

## 功能亮点

- **好看且现代的面板**：React + Vite + TypeScript + HeroUI，适配桌面与移动端。
- **实时监控**：通过 SSE/WebSocket 推送隧道状态、流量与日志。
- **多维度图表**：小时/日/周等趋势统计，并支持更细粒度的详情查看。
- **强大的 NodePass 管理能力**：端点、隧道、服务一站式管理（批量操作、排序等）。
- **场景化创建/模板向导**：用向导化流程快速生成与创建常见配置，降低出错率。
- **支持 OAuth2 登录**：可配置（如 GitHub / Cloudflare），并可选择禁用密码登录。
- **i18n 国际化**：内置多语言支持。
- **个性化设置**：隐私模式、主题/语言新手引导等体验配置。
- **运维工具集**：文件日志查看、网络调试能力、端点系统状态图表等，便于定位问题。
- **移动端协同**：支持生成二维码，便于移动端 App 导入使用。
- **规模化管理更省心**：搜索/筛选/排序、分组/标签、批量操作，覆盖高频日常维护。
- **版本更新可感知**：内置版本信息与更新提醒，帮助你及时跟进发布。
- **轻量易集成**：内嵌前端 + 单服务运行形态，可用容器部署，也可直接挂 systemd。

## 截图

| 登录 | 仪表盘 | 隧道列表 |
|---|---|---|
| ![登录](../screenshots/00-login.gif) | ![仪表盘](../screenshots/01-dashboard.gif) | ![隧道列表](../screenshots/02-tunnels.gif) |
| ![隧道详情](../screenshots/03-tunnel-details.gif) | ![端点管理](../screenshots/04-endpoints.gif) | ![端点详情](../screenshots/05-endpoint-details.gif) |
| ![服务管理](../screenshots/06-services.gif) | ![服务详情](../screenshots/07-service-details.gif) |![设置](../screenshots/09-setting.gif)|
 

## 文档

- 迁移指南：[MIGRATION.md](MIGRATION.md)
- Docker 部署：[DOCKER.md](DOCKER.md)
- 二进制部署：[BINARY.md](BINARY.md)
- 开发环境：[DEVELOPMENT.md](DEVELOPMENT.md)

## 命令行参数

```bash
./nodepassdash --help
./nodepassdash --version
./nodepassdash --port 8080
./nodepassdash --log-level INFO
./nodepassdash --cert /path/to/cert.pem --key /path/to/key.pem
./nodepassdash --disable-login
./nodepassdash --sse-debug-log
./nodepassdash --resetpwd
```

## 许可证

BSD-3-Clause，见 `LICENSE`。

## ⚖️ 免责声明

本项目以“现状”提供，开发者不提供任何明示或暗示的保证。用户使用风险自担，需遵守当地法律法规，仅限合法用途。开发者对任何直接、间接、偶然或后果性损害概不负责。进行二次开发须承诺合法使用并自负法律责任。开发者保留随时修改软件功能及本声明的权利。最终解释权归开发者所有。

## 📞 支持

- 🐛 问题报告: https://github.com/NodePassProject/NodePassDash/issues
- 💬 社区讨论: https://t.me/NodePassGroup
- 📢 频道: https://t.me/NodePassChannel

## 🤝 Sponsors

<table>
  <tr>
    <td width="240" align="center">
      <a href="https://vps.town"><img src="https://camo.githubusercontent.com/9ec623bd5609749c17a6d806b09d9d67d4e0b436d4893b369f7bc0d9f5158081/68747470733a2f2f6e6f6465706173732e65752f6173736574732f767073746f776e2e706e67"></a>
    </td>
  </tr>
</table>

## ⭐ Stargazers

[![Star History Chart](https://api.star-history.com/svg?repos=NodePassProject/NodePassDash&type=Date)](https://star-history.com/#NodePassProject/NodePassDash&Date)
