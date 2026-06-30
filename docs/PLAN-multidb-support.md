# PLAN: 支持 PostgreSQL + Web 端首启数据库初始化

> **关于本文件位置**: Plan mode 限制我只能写到 `C:\Users\YMingPro\.claude\plans\dynamic-snuggling-stonebraker.md`。
> **实施第一步建议**: 把本文件复制到项目目录 `docs/PLAN-multidb-support.md`,作为正式设计文档纳入仓库。

---

## Context (为什么做这件事)

目前 NodePassDash 后端只支持 SQLite,且数据库类型、路径、连接池参数全部通过 env / flag 注入。这带来三个问题:

1. **生产部署受限**: 多副本部署、跨主机访问、备份与高可用方案在 SQLite 下都很难做。多 SSE 端点并发写入时,SSE 团队已经用"内存通道 + 单写者批量写"缓解了 `service_history` 的锁竞争(`internal/sse/history_worker.go`),但 `internal/sse/service.go` 里 per-event 直接落库的 tunnel 实时字段更新仍需要 `MaxOpenConns=1` 串行化兜底——换 PG 后这些防御代码可以反向简化。
2. **裸跑/桌面场景上手门槛高**: 用户希望在浏览器里完成首次配置(选择数据库类型 / 填连接参数 / 一键初始化),而不是先 SSH 上去改 .env。
3. **方言代码散落**: 全仓 63 处 SQLite-only 语法(JSON 操作符 9 处、UPSERT 15 处、datetime 4 处、`sqlite_master` 2 处、`.DB().Raw()` 29 处、VACUUM/ANALYZE 4 处),没有统一收口。

**预期成果**:
- 后端通过新增的 `db/config.json` 决定走 SQLite 还是 PostgreSQL,env 仍可覆盖。
- 首次启动若无有效数据库配置,进入 **Setup 模式**:只挂 `/api/setup/*` 和静态资源,前端展示数据库初始化向导。
- 用户在向导填完参数 → 后端验证连接 → 写 `db/config.json` → 提示用户重启服务(用户决策:"保存配置后让用户重启")。
- 重启后正常进入 **Ready 模式**,跑完整 GORM AutoMigrate / SSE / WebSocket / scheduler。
- 方言差异通过 `internal/db/dialect/` 一次到位抽象,业务层不再写 driver-specific SQL。
- 暂不支持 SQLite → PG 数据迁移(用户决策:v1 "全新部署",老用户继续用 SQLite)。
- **Setup 向导"一条龙"**(用户决策):数据库连接 + 管理员账号在同一个向导内完成,提交一次后重启即跳登录页,不再看日志里的默认账号。

---

## 顶层架构

### 启动流程改造

```
main() 
  ├─ parseFlags()                          # 不变
  ├─ resolveDBConfig()                     # 新增: env > config.json > 默认值合并
  │     ├─ 若 driver == "" 且无有效 config → SetupMode = true
  │     └─ 否则 SetupMode = false
  │
  ├─ if SetupMode:
  │     ├─ buildSetupRouter()              # 新增: 只挂 /api/setup/* + 静态
  │     ├─ startHTTPServer(setupRouter)    # 复用现有
  │     └─ waitForSetupOrShutdown()        # 新增: setup 完成时退出(让外部重启)
  │                                        #       或收到 SIGTERM 退出
  │
  └─ else (Ready 模式):
        ├─ dbPkg.GetDB() (用新的 dialect)   # 改造
        ├─ initializeServices()             # 不变
        ├─ router.SetupRouter()             # 不变,但 setup 路由仍保留(只读状态)
        ├─ startHTTPServer()                # 不变
        ├─ startBackgroundServices()        # 不变
        └─ gracefulShutdown()               # 不变
```

### 关键设计点

- **Setup 模式与 Ready 模式互斥,通过重启切换**(用户决策)。代码上 main 函数顶部分叉,不需要在运行时做"热切换",大幅降低复杂度。
- **`db/config.json` 是真值来源**,env 覆盖语义和现有 `loadFromEnv` 保持一致——env > 配置文件 > 默认值。docker 用户可以全用 env 跳过 setup 向导。
- **Dialect 抽象一次到位**: 新建 `internal/db/dialect/` 包定义接口 + 两份实现,业务层通过 `db.Dialect()` 拿到对应实现。
- **暂不做数据迁移工具**: 文档明示"切换数据库需要全新部署"。

---

## 详细方案

### A. 配置层

#### A.1 新增 `db/config.json` schema

```json
{
  "driver": "postgres",          // "sqlite" | "postgres"
  "initialized": true,           // 含义: 数据库已配置 AND 管理员账号已创建

  "sqlite": {
    "path": "db/database.db",
    "wal_mode": true
  },

  "postgres": {
    "host": "127.0.0.1",
    "port": 5432,
    "user": "nodepass",
    "password": "***",           // 写文件前 chmod 0600
    "database": "nodepassdash",
    "ssl_mode": "disable",       // disable | require | verify-full
    "timezone": "Asia/Shanghai"
  },

  "pool": {
    "max_open_conns": 25,        // SQLite 默认仍是 1,PG 默认 25
    "max_idle_conns": 10,
    "max_lifetime_minutes": 60,
    "max_idle_time_minutes": 10
  },

  "log_level": "silent"          // silent | error | warn | info
}
```

存储位置: `db/config.json`(与 `db/database.db` 同级,docker volume 已经挂这层)。
文件权限: 写入时 `os.OpenFile(..., 0600)`(密码字段)。

#### A.2 改造 `internal/db/config.go`

**保留现有** `DBConfig` 结构定义(向后兼容),改造 `GetDBConfig` 入口:

```
GetDBConfig(dbDir string) DBConfig
  1. config := DefaultConfig()                  // 跟现在一致的默认值
  2. loadFromFile(&config, dbDir + "/config.json")  // 新增: 读 JSON
  3. loadFromEnv(&config)                       // 现有,补充 DB_DRIVER/DB_DSN/PG_*
  4. loadFromFlags(&config)                     // 现有
  5. validateConfig(&config)
```

新增字段:
- `Driver string`(`"sqlite"` | `"postgres"`)
- `PostgresHost/Port/User/Password/Database/SSLMode/TimeZone string`
- `Initialized bool`

**新增方法**:
- `(c *DBConfig) IsValid() bool` —— 用于 main 判断是否进 setup 模式
- `(c *DBConfig) BuildSQLiteDSN() string` —— 原 BuildDSN 改名
- `(c *DBConfig) BuildPostgresDSN() string` —— `host=... port=... user=... password=... dbname=... sslmode=... TimeZone=...`
- `(c *DBConfig) SaveToFile(path string) error` —— Setup 向导提交后调用

#### A.3 新增 env 变量

| 现有 env | 新增 env | 说明 |
|---------|---------|------|
| `DB_PATH` | — | 仍指 SQLite 文件路径 |
| — | `DB_DRIVER` | `sqlite` 或 `postgres`,缺省 `sqlite` |
| — | `DB_DSN` | 完整 PG DSN,设了就忽略下面几个 |
| — | `PG_HOST` / `PG_PORT` / `PG_USER` / `PG_PASSWORD` / `PG_DATABASE` / `PG_SSLMODE` | 分项配置 |
| `DB_MAX_OPEN_CONNS` 等 | 不变 | 池配置共享 |

文档明确: docker compose 推荐 `DB_DRIVER=postgres` + `DB_DSN=...` 直接跳过 Web setup。

---

### B. Dialect 抽象

#### B.1 新建 `internal/db/dialect/dialect.go`

```go
package dialect

type Dialect interface {
    Name() string                              // "sqlite" | "postgres"

    // JSON 路径(peer 字段 JSON 查询)
    JSONPath(column, key string) string        // sqlite: column->>'$.key'    pg: column->>'key'

    // 时间表达式(用于 raw cleanup SQL)
    TimeAgo(field string, dur string) string   // sqlite: field < datetime('now','-30 days')
                                                // pg:     field < NOW() - INTERVAL '30 days'

    // 系统目录
    TableExistsSQL(table string) string        // 用 information_schema 还是 sqlite_master
    IndexExistsSQL(idx string) string

    // 数据库系统版本(dashboard/service.go:362 的 VERSION())
    VersionSQL() string                        // sqlite: SELECT sqlite_version()  pg: SELECT version()

    // 维护
    VacuumSQL() string                         // sqlite: VACUUM   pg: VACUUM ANALYZE
    AnalyzeSQL() string

    // 池子默认值(SQLite 单写者 vs PG 多写者)
    DefaultPool() PoolDefaults
}

type PoolDefaults struct {
    MaxOpenConns int
    MaxIdleConns int
}
```

#### B.2 两份实现

- `internal/db/dialect/sqlite.go` —— 现有行为
- `internal/db/dialect/postgres.go` —— PG 等价实现

#### B.3 注册与访问

在 `internal/db/db.go` 中维护包级 `var currentDialect dialect.Dialect`,初始化时根据 `DBConfig.Driver` 装配。新增导出函数 `db.Dialect() dialect.Dialect`,业务层用它。

---

### C. main.go 启动分叉

#### C.1 改造 `cmd/server/main.go`

```go
func main() {
    // 1. 解析 flags(不变)
    cfg := dbPkg.GetDBConfig("db")

    // 2. 判断模式
    if !cfg.IsValid() || !cfg.Initialized {
        runSetupMode(port, certFile, keyFile)   // 新增分支
        return
    }

    // 3. 走原有 Ready 模式流程(不变)
    runReadyMode(...)
}
```

#### C.2 新增 `cmd/server/setup.go`

包含:
- `runSetupMode(...)` — 启动一个**简化版 gin 路由**,只挂:
  - `GET /api/setup/status` — 返回 `{"initialized": false, "version": "..."}`
  - `POST /api/setup/test-connection` — 接收 driver + 连接参数,实测开一次连接 Ping,**不持久化任何东西**,不建表
  - `POST /api/setup/initialize` — **一条龙**,接收完整 payload(数据库参数 + 管理员账号),后端串行做:
    1. 用提供的 DB 参数 `gorm.Open(...)` + Ping
    2. 写 `db/config.json`(此刻 `initialized=false`,作为"DB 配置已就位"哨兵)
    3. 用同一个连接跑 GORM `AutoMigrate(models...)` 建所有表
    4. 调用 `authService.InitializeSystemWithCredentials(username, password)` 写第一个管理员(新增方法,见 D.7)
    5. 把 `db/config.json` 的 `initialized` 改为 `true`
    6. 关闭这个连接,返回 `{"requires_restart": true}`
  - 任意一步失败 → 回滚:删除已写的 `db/config.json`,返回 4xx + 错误原因
  - 所有静态资源 (复用 `setupStaticFiles`)
  - `GET /api/setup/*` 之外的 `/api/**` 全部返回 503 + `{"error":"setup_required"}`
- `awaitShutdown(...)` — 收到 SIGTERM 或 setup 完成后退出。

setup 模式下**不挂** SSE / WebSocket / scheduler 任何业务路由。`router.SetupRouter` 完全不调用。
但 setup 模式下**会一次性地**打开数据库连接执行 AutoMigrate 和写管理员 —— 这是用户主动触发的隔离操作,不破坏"setup 模式 vs ready 模式"的解耦原则。

#### C.3 前端调整(Setup 向导:Stepper 三步)

新增 `web/src/pages/setup.tsx`(参考现有登录页风格,用 HeroUI Card + 自定义 Stepper):

- 启动时 `GET /api/setup/status` 探测,若 `initialized:false` 强制 redirect 到 `/setup`(在 React Router 顶层 guard)。
- 反过来,如果 `initialized:true` 时用户手动访问 `/setup`,redirect 到登录页(防误操作)。

**Step 1 — 选数据库类型**

两张大卡片(类似 GitHub onboarding 的 OS 选择):
- 「SQLite — 单机推荐 / 零依赖」
- 「PostgreSQL — 生产推荐 / 多副本 / 高并发」

选完点「下一步」进 Step 2。

**Step 2 — 填连接参数**

- SQLite 分支:只有一个「数据库文件路径」字段,默认 `db/database.db`,且有一行提示「保留默认即可」。
- PostgreSQL 分支:host / port (5432) / database / user / password / sslmode (Select: disable/require/verify-full) / timezone (默认从浏览器 `Intl.DateTimeFormat().resolvedOptions().timeZone` 拿)。
- 底部「测试连接」按钮 → POST `/api/setup/test-connection`,实时反馈:
  - 成功 → 绿色对勾 + 「可以继续下一步」,启用「下一步」按钮
  - 失败 → 红色错误 + 后端返回的 error message(例如 "connection refused"、"FATAL: password authentication failed")
- 必须先测试通过才能进 Step 3。

**Step 3 — 创建管理员账号**

- 用户名(默认 `admin`,可改,3~20 字符,只允许字母数字下划线)
- 密码(强制 ≥ 8 字符,前端做 strength meter)
- 确认密码(必须一致)
- 一个 Checkbox: 「我已经妥善保存上述凭据」(必勾才能提交)
- 「完成初始化」按钮 → POST `/api/setup/initialize`,**传 Step 2 和 Step 3 的所有数据**,后端一次性完成所有事(见 C.2 的 6 步)。

**完成页(Step 3 提交成功后)**

- 大对勾 + 「初始化完成!请重启服务以应用配置」
- 文案区分场景:
  - docker: 「执行 `docker compose restart` 或 `docker restart <container>`」
  - 裸跑: 「停止当前进程并重新运行 nodepassdash」
  - systemd: 「执行 `systemctl restart nodepassdash`」
- 「检测重启状态…」灰色文字 + spinner,每 3 秒 `GET /api/setup/status`,**当请求成功且 `initialized:true` 时跳转登录页**(说明用户已经重启完毕,且 Ready 模式起来了)。
- 不在前端做自动倒数关闭,也不强制刷新——用户重启需要的时间不可预测。
- 备用按钮「我已重启,手动跳转」直接 `window.location = '/login'`。

**i18n**

setup 页所有文案接入现有 i18n 资源(`web/src/i18n/`),至少中英文。

---

### D. 方言代码点改造清单

按方言抽象后,业务层修改路径:

#### D.1 JSON 路径 (9 处)
- `internal/services/service.go` 行 54, 573, 592, 623, 650
- `internal/sse/service.go` 行 643, 661, 683, 709

改造方式: 用 `db.Dialect().JSONPath("peer", "sid")` 生成 WHERE 子句字符串,继续用 `db.Where(...)` 传入。

#### D.2 UPSERT (15 处, 全在 `internal/dashboard/traffic_service.go`)

**好消息**: 这文件作者已经写了双分支(检测 `uniq_traffic_hourly_summary_hour_endpoint_instance` 是否存在 → 有则 `ON CONFLICT`,无则 `INSERT OR REPLACE`)。

改造方式: 因为 SQLite 3.24+ (mattn/go-sqlite3 默认捆绑的版本)和 PG 都支持 `ON CONFLICT ... DO UPDATE`,**直接删除 `INSERT OR REPLACE` 分支**,统一走 `ON CONFLICT`。同时把行 21-30 的 `sqlite_master` 索引检测改为 `db.Dialect().IndexExistsSQL(...)`,或者干脆删掉那段检测(`ensureOptimizedIndexes` 会保证索引存在)。

#### D.3 datetime (4 处, `internal/dashboard/traffic_service.go` 行 691/700/708/716)
改造方式: 用 `db.Dialect().TimeAgo("event_time", "-30 days")` 拼 WHERE。

#### D.4 sqlite_master (2 处)
- `internal/db/db.go:256` (AutoMigrate 检测全新库) → `db.Dialect().TableExistsSQL("endpoints")` 或类似 sentinel
- `internal/dashboard/traffic_service.go:21-30` → 同 D.2 一起处理

#### D.5 `.DB().Raw()` 29 处
大多数是普通 SELECT/COUNT/SUM,**本身就是可移植 SQL**。这一轮只做轻审计:
- `internal/dashboard/service.go:362` 的 `VERSION()` → 改为 `db.Dialect().VersionSQL()`
- 其余 28 处只要验证没有 SQLite-only 函数(`IFNULL`/`datetime`)即可,可以保留 `.Raw()`。
- 建议附带把容易移植的几处改为 GORM 表达(`db.Model(...).Count()`),减少长期负债。

#### D.6 VACUUM / ANALYZE (4 处)
- `internal/cleanup/manager.go:250-257`
- `internal/dashboard/cleanup_service.go:269`
- `internal/metrics/aggregator.go:158-160` (CREATE INDEX, 实际可移植)

改造方式: PG 的 `VACUUM` 是事务外操作,与 SQLite 语义不同。封装为 `db.Dialect().VacuumSQL()`,SQLite 返回 `"VACUUM"`,PG 返回 `"VACUUM ANALYZE"`(放后台任务)。

#### D.7 管理员账号创建(复用 + 派生)

在 `internal/auth/service.go` 现有 `InitializeSystem()`(行 299)基础上,**派生一个新方法**:

```go
// InitializeSystemWithCredentials 使用用户提供的用户名/密码初始化系统
// 用于 Setup 向导一条龙流程。失败时调用方负责回滚 db/config.json。
func (s *Service) InitializeSystemWithCredentials(username, password string) error {
    if s.IsSystemInitialized() {
        return errors.New("system is already initialized")
    }
    if err := validateAdminCredentials(username, password); err != nil {
        return err
    }
    passwordHash, err := s.HashPassword(password)
    if err != nil { return err }
    return s.setAdminConfigs(username, passwordHash)
}
```

注意:
- 不打日志输出明文密码(向导已经在前端展示,且 Checkbox 确认过)。
- 抽出共用 `setAdminConfigs(username, passwordHash) error` helper 供新旧方法复用(写 `ConfigKeyAdminUsername` / `ConfigKeyAdminPassword` / `ConfigKeyIsInitialized` 三个 config),避免代码重复。
- 现有 `InitializeSystem()` 保留,继续覆盖**老的 SQLite 部署路径**(向后兼容:用户不走 Web setup,直接启动也能用默认账号)。
- 新增 `validateAdminCredentials(u, p) error`:用户名 3~20 字符 / 字母数字下划线;密码 ≥ 8 字符。前端校验同步规则。

Setup 流程下,`InitializeSystemWithCredentials` 在 `/api/setup/initialize` 处理器中按 C.2 第 4 步调用。

---

### E. 防御代码简化(可选,建议同 PR)

PG 用 MVCC,以下 SQLite-only 防御机制对 PG 无意义:
- `internal/db/db.go:340-391` 的 `ExecuteWithRetry` / `TxWithRetry` 指数退避 → PG driver 下 `maxRetries=1` 即可,因为 PG 不会出 `database is locked`。
- `internal/db/config.go:29` 的 `MaxOpenConns=1` → PG 默认应放大到 25(通过 `DefaultPool()` 返回不同默认)。

不动现有重试包装函数签名,只是内部按 dialect 跳过重试。

---

### F. 测试与验证

#### F.1 单元测试(新增)
- `internal/db/dialect/sqlite_test.go` / `postgres_test.go`:断言每个方法返回的 SQL 字符串
- `internal/db/config_test.go`: 测试 `env > file > default` 合并优先级、`IsValid` 边界
- `cmd/server/setup_test.go`: 测 setup 路由屏蔽业务 API(返回 503)
- `internal/auth/service_test.go`: 测 `InitializeSystemWithCredentials` 成功 / 重复初始化报错 / 用户名密码非法报错;`setAdminConfigs` 与现有 `InitializeSystem` 行为等价(写入相同 3 个 SystemConfig key)

#### F.2 集成测试(手工)
分两条主线:

**SQLite 主线(新装,走 Web 向导)**:
1. 删除 `db/`,`go run ./cmd/server` → 应进 Setup 模式,前端打开 `/setup` 向导
2. Step 1 选 SQLite → Step 2 默认路径,点「测试连接」→ 通过 → Step 3 填 admin/Pa$$w0rd1234 → 勾确认 → 提交
3. 验证 `db/config.json` 落盘 `initialized:true`,验证 `db/database.db` 已建好所有表,验证 `system_configs` 表里有 admin 凭据 hash
4. 前端显示「请重启」+ 轮询 spinner
5. `Ctrl-C` 后再 `go run` → 进 Ready 模式,**前端轮询命中**自动跳登录页,用 admin/Pa$$w0rd1234 登录成功
6. 多端点 SSE 压测 30 分钟,观察 `database is locked` 日志数量,应与改造前持平或更少

**SQLite 主线(向后兼容,跳过向导)**:
1. 删除 `db/config.json`,但保留旧的 `db/database.db`(老用户场景)
2. `go run` → 应直接进 Ready 模式(因为可以 fallback 到 `DB_PATH` 默认值或老 config)。登录使用默认账号(`InitializeSystem` 已跑过)

**PostgreSQL 主线(新增)**:
1. 起一个本地 PG: `docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres:16`
2. 删除 `db/`,`go run ./cmd/server` → 进 Setup
3. Step 1 选 PostgreSQL → Step 2 填 host=localhost / port=5432 / db=postgres / user=postgres / pwd=pass / sslmode=disable
4. 点「测试连接」→ 应该 200 OK,绿色对勾,启用「下一步」
5. Step 3 填 admin/Pa$$w0rd1234 → 提交
6. 验证 PG 里所有表已创建,`system_configs` 里有 admin 凭据
7. `Ctrl-C` 后重启 → Ready 模式,前端跳登录页,登录成功
8. 添加 endpoint → SSE 连接 → tunnel 数据落 PG → 检查 `service_history` 批量写入工作
9. 同样跑 30 分钟压测,断言无方言相关错误,且无 `MaxOpenConns=1` 串行化

**异常场景**:
- Step 2 输错 PG 密码 → 「测试连接」返回 401-ish + 后端 error message,「下一步」禁用
- Step 3 提交时 PG 突然断 → `/api/setup/initialize` 应回滚已写的 `db/config.json` 并返回 5xx
- Setup 期间杀掉进程后再启动 → 因为 `initialized:false`,仍进 Setup 模式,允许重试

**env 跳过 setup 验证**:
1. 删 `db/`,设 `DB_DRIVER=postgres DB_DSN=...`,启动 → 应直接进 Ready 模式,不走 setup
2. 首次登录用 `InitializeSystem` 默认账号(保持现有行为)

#### F.3 验收检查表
- [ ] `go vet ./...` 通过
- [ ] `go build -o /tmp/np ./cmd/server` 跨平台通过(linux/amd64/arm64/darwin/windows)
- [ ] Docker 镜像构建通过
- [ ] 现有 SQLite 部署原地启动不退化(向后兼容)
- [ ] 新增的 PG 主线全流程通过
- [ ] CI/release goreleaser 配置不需要改(只是新增依赖)

---

## 改造影响范围(文件清单)

### 新增
- `internal/db/dialect/dialect.go`
- `internal/db/dialect/sqlite.go`
- `internal/db/dialect/postgres.go`
- `internal/db/dialect/*_test.go`
- `cmd/server/setup.go`
- `web/src/pages/setup.tsx`
- `web/src/api/setup.ts`(或并入现有 api 模块)
- `docs/PLAN-multidb-support.md`(本文档复制版)

### 修改
- `internal/db/db.go` — Dialect 装配 + AutoMigrate 检测
- `internal/db/config.go` — 新增字段、SaveToFile、env/file 优先级
- `internal/auth/service.go` — 新增 `InitializeSystemWithCredentials` / `setAdminConfigs` helper / `validateAdminCredentials`
- `internal/dashboard/traffic_service.go` — UPSERT/datetime/sqlite_master 改方言
- `internal/dashboard/cleanup_service.go` — VACUUM 走方言
- `internal/dashboard/service.go` — VERSION() 走方言
- `internal/cleanup/manager.go` — VACUUM/ANALYZE 走方言
- `internal/services/service.go` — JSON 路径走方言(5 处)
- `internal/sse/service.go` — JSON 路径走方言(4 处)
- `cmd/server/main.go` — 启动分叉
- `go.mod` / `go.sum` — 加 `gorm.io/driver/postgres`
- `web/src/App.tsx`(或路由入口) — `/setup` guard
- 前端的 i18n 资源 — setup 页文案

### 删除
- `internal/db/db.go` 中 Docker Compose 软链接迁移代码可选地保留(只在 SQLite 分支生效)

---

## 工作量估算

| 阶段 | 内容 | 估时 |
|------|------|------|
| 1 | Dialect 包 + SQLite/PG 实现 + 单测 | 1 天 |
| 2 | 配置层改造 + setup 路由(含 admin 一条龙后端) | 1.5 天 |
| 3 | 方言代码点替换(traffic/services/sse/cleanup/dashboard) | 2 天 |
| 4 | 前端 setup 向导页(Stepper 3 步 + i18n + 完成页轮询) | 1.5 天 |
| 5 | main.go 启动分叉 + 集成调试 | 0.5 天 |
| 6 | PG 集成测试 + 回归 SQLite + 文档 | 1.5 天 |
| **合计** | | **~8 天** |

---

## 风险与未决问题

1. **GORM AutoMigrate 在 PG 上的差异**: `serializer:json` 在 PG 上落 `text` 还是 `jsonb`,需要验证。如果落 text 则 JSON 操作符仍能用(text 上 `->>` 不工作,需要 cast)。如果要 jsonb,需要在模型上加 `gorm:"type:jsonb"` 并通过 dialect 包装。**实施时第一天必须先把 model 落库形态确认下来**,以免影响 D.1 的方案选择。
2. **PG 时区**: `models.NullTime` 在 PG 上需要 `timestamptz`。GORM tag `type:datetime` 在 PG 上会被映射成 `timestamp without time zone`,可能导致 `time.Local` 计算误差。建议在 dialect 装配时给 GORM 配置 `NowFunc` 强制 UTC,或者 model tag 统一改为 `type:timestamptz`。
3. **密码持久化**: `db/config.json` 明文存 PG 密码不太理想,但与现有 env 注入方案对等。生产场景仍推荐用 env(`PG_PASSWORD`),Web 向导提示用户"如果是生产环境建议用环境变量"。
4. **没做 SQLite→PG 数据迁移**: 用户决策。文档需要明示"切换数据库等于全新部署"。

---

## ExitPlanMode 后给用户的建议

实施时第一步: `cp "C:\Users\YMingPro\.claude\plans\dynamic-snuggling-stonebraker.md" docs/PLAN-multidb-support.md`,然后按上述阶段 1→6 推进。
