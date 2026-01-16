<div align="center">
  <img src="docs/nodepassdash-logo.svg" alt="NodePassDash" height="80">
</div>

**Language:** English | [简体中文](docs/zh-CN/README.md)

![Version](https://img.shields.io/badge/version-3.4.0--beta1-blue.svg)
![GitHub license](https://img.shields.io/github/license/NodePassProject/NodePassDash)

NodePassDash is a modern web dashboard for managing **NodePass** endpoints, tunnels, and services. It ships as a single Go binary (Gin + GORM + SQLite) with an embedded React (Vite + TypeScript + HeroUI) frontend, and provides real-time telemetry via SSE/WebSocket.

## Demo

- Live demo: https://dash.nodepass.eu/
- Demo account: `nodepass` / `Np123456.`

> Important: demo environment — do not change the password and do not submit any sensitive information.

## Highlights

- **Modern, clean dashboard**: responsive UI built with React + Vite + TypeScript + HeroUI.
- **Real-time monitoring**: SSE/WebSocket updates for tunnel status, traffic, and logs.
- **Multi-dimensional charts**: traffic trends (hour/day/week) with detailed drill-down views.
- **Powerful NodePass management**: endpoints, tunnels, and services in one place (including batch actions & sorting).
- **Scenario-based creation**: guided wizards/templates to create common setups faster and safer.
- **OAuth2 login support**: configure providers (e.g. GitHub / Cloudflare) and optionally disable password login.
- **i18n**: built-in multilingual UI support.
- **Personalization**: privacy mode, theme/language onboarding, and configurable experience.
- **Operational tooling**: file-log viewer, network debugging utilities, and endpoint system stats charts.
- **Mobile-friendly workflows**: QR code output for importing into the mobile app.
- **Safer at scale**: search/filter/sort, grouping, tagging, and batch operations for day-to-day maintenance.
- **Release awareness**: built-in version visibility and update notifications to help you stay current.
- **Portable architecture**: embedded frontend + single-service runtime, easy to run as a container or a systemd service.

## Screenshots

|                                                           |                                                             |                                                               |
|-----------------------------------------------------------|-------------------------------------------------------------|---------------------------------------------------------------|
| ![Login](docs/screenshots/00-login.gif)                   | ![Dashboard](docs/screenshots/01-dashboard.gif)             | ![Tunnels](docs/screenshots/02-tunnels.gif)                   |
| ![Tunnel Details](docs/screenshots/03-tunnel-details.gif) | ![Endpoints](docs/screenshots/04-endpoints.gif)             | ![Endpoint Details](docs/screenshots/05-endpoint-details.gif) |
| ![Services](docs/screenshots/06-services.gif)             | ![Service Details](docs/screenshots/07-service-details.gif) | ![Settings](docs/screenshots/09-setting.gif)         |


## Quick Start

- **Docker (recommended):** `docs/en/DOCKER.md`
- **Binary + systemd:** `docs/en/BINARY.md`
- **Development:** `docs/en/DEVELOPMENT.md`

## Documentation

- **Migration Guide:** [docs/en/MIGRATION.md](docs/en/MIGRATION.md)
- **Docker Guide:** [docs/en/DOCKER.md](docs/en/DOCKER.md)
- **Binary Guide:** [docs/en/BINARY.md](docs/en/BINARY.md)
- **Development Guide:** [docs/en/DEVELOPMENT.md](docs/en/DEVELOPMENT.md)

## CLI Flags

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

## License

BSD-3-Clause. See `LICENSE`.

## Disclaimer

This project is provided “as is”, without any express or implied warranties. You are responsible for complying with local laws and regulations and using it only for lawful purposes. The authors are not liable for any direct, indirect, incidental, or consequential damages. The authors reserve the right to modify features and this statement at any time.

## Support

- Issues: https://github.com/NodePassProject/NodePassDash/issues
- Telegram: https://t.me/NodePassGroup
- Telegram Channel: https://t.me/NodePassChannel

## Sponsors

<table>
  <tr>
    <td width="240" align="center">
      <a href="https://vps.town"><img src="https://camo.githubusercontent.com/9ec623bd5609749c17a6d806b09d9d67d4e0b436d4893b369f7bc0d9f5158081/68747470733a2f2f6e6f6465706173732e65752f6173736574732f767073746f776e2e706e67"></a>
    </td>
  </tr>
</table>

## Stargazers

[![Star History Chart](https://api.star-history.com/svg?repos=NodePassProject/NodePassDash&type=Date)](https://star-history.com/#NodePassProject/NodePassDash&Date)
