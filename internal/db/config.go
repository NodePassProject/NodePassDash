package db

import (
	"NodePassDash/internal/db/dialect"
	log "NodePassDash/internal/log"
	"bufio"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// EnvFileName 是 Web 向导落盘 / godotenv 加载的目标文件,放在项目根目录。
// 与 docker-compose 的惯例一致:容器内的 env 注入与裸跑的文件加载使用同一个 KV schema。
const EnvFileName = ".env"

// DBConfig 是后端数据库配置的真值结构。
// 来源优先级: 命令行 flag > 环境变量 (含 .env 文件提前注入的) > 默认值。
//
// 不存在"独立的配置文件路径"——Web 向导的产物是一份 .env,启动时由 godotenv 注入到 env,
// 然后所有读取统一走环境变量。
type DBConfig struct {
	// Driver 取值: "sqlite" 或 "postgres"。空表示尚未配置(进入 Setup 模式)。
	Driver string

	// --- SQLite 字段 ---
	Database string // SQLite 数据库文件路径
	WALMode  bool   // 启用 WAL 模式

	// --- PostgreSQL 字段 ---
	PostgresHost     string
	PostgresPort     int
	PostgresUser     string
	PostgresPassword string
	PostgresDatabase string
	PostgresSSLMode  string // disable | require | verify-full
	PostgresTimeZone string

	// --- 连接池 (两端共享) ---
	MaxOpenConns int
	MaxIdleConns int
	MaxLifetime  time.Duration
	MaxIdleTime  time.Duration

	// --- 杂项 ---
	LogLevel  string // silent | error | warn | info
	AutoDedup bool   // SQLite 启动时自动去重并尝试建唯一索引
}

// GetDBConfig 获取数据库配置,合并默认值 / 环境变量 / flag。
// 调用前应确保 main.go 已经 godotenv.Load(".env"),否则 .env 的值不会生效。
func GetDBConfig(dbDir string) DBConfig {
	config := defaultConfig(dbDir)

	// 1. 从环境变量读取(.env 已由 main.go 提前 load 到 os.Environ)
	loadFromEnv(&config)

	// 2. 从命令行参数读取(优先级最高)
	loadFromFlags(&config)

	// 3. 根据 driver 应用方言默认池子
	applyDialectDefaults(&config)

	// 4. 验证
	if err := validateConfig(&config); err != nil {
		log.Errorf("数据库配置验证失败: %v", err)
	}

	return config
}

// defaultConfig 返回与历史版本兼容的默认 SQLite 配置。
func defaultConfig(dbDir string) DBConfig {
	return DBConfig{
		Driver:           "", // 空表示未配置,IsValid 会返回 false
		Database:         filepath.Join(dbDir, "database.db"),
		WALMode:          true,
		PostgresHost:     "127.0.0.1",
		PostgresPort:     5432,
		PostgresSSLMode:  "disable",
		PostgresTimeZone: "Local",
		MaxOpenConns:     0, // 0 表示用方言默认值
		MaxIdleConns:     0,
		MaxLifetime:      5 * time.Minute,
		MaxIdleTime:      2 * time.Minute,
		LogLevel:         "silent",
		AutoDedup:        true,
	}
}

// loadFromEnv 从环境变量加载配置。
func loadFromEnv(config *DBConfig) {
	if v := os.Getenv("DB_DRIVER"); v != "" {
		config.Driver = v
	}

	// SQLite 路径
	if v := os.Getenv("DB_PATH"); v != "" {
		config.Database = v
	}

	// PostgreSQL 连接参数
	if v := os.Getenv("PG_HOST"); v != "" {
		config.PostgresHost = v
	}
	if v := os.Getenv("PG_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			config.PostgresPort = n
		}
	}
	if v := os.Getenv("PG_USER"); v != "" {
		config.PostgresUser = v
	}
	if v := os.Getenv("PG_PASSWORD"); v != "" {
		config.PostgresPassword = v
	}
	if v := os.Getenv("PG_DATABASE"); v != "" {
		config.PostgresDatabase = v
	}
	if v := os.Getenv("PG_SSLMODE"); v != "" {
		config.PostgresSSLMode = v
	}
	if v := os.Getenv("PG_TIMEZONE"); v != "" {
		config.PostgresTimeZone = v
	}

	// 池子配置
	if v := os.Getenv("DB_MAX_OPEN_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			config.MaxOpenConns = n
		}
	}
	if v := os.Getenv("DB_MAX_IDLE_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			config.MaxIdleConns = n
		}
	}
	if v := os.Getenv("DB_MAX_LIFETIME"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			config.MaxLifetime = d
		}
	}
	if v := os.Getenv("DB_MAX_IDLE_TIME"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			config.MaxIdleTime = d
		}
	}
	if v := os.Getenv("DB_LOG_LEVEL"); v != "" {
		config.LogLevel = v
	}
	if v := os.Getenv("DB_WAL_MODE"); v != "" {
		config.WALMode = v == "true" || v == "1"
	}
	if v := os.Getenv("DB_AUTO_DEDUP"); v != "" {
		config.AutoDedup = v == "true" || v == "1"
	}
}

// loadFromFlags 从命令行参数加载配置。
func loadFromFlags(config *DBConfig) {
	if !flag.Parsed() {
		return
	}

	if f := flag.Lookup("db-path"); f != nil {
		if v := f.Value.String(); v != "" {
			config.Database = v
		}
	}
	if f := flag.Lookup("db-max-open"); f != nil {
		if n, err := strconv.Atoi(f.Value.String()); err == nil && n > 0 {
			config.MaxOpenConns = n
		}
	}
	if f := flag.Lookup("db-max-idle"); f != nil {
		if n, err := strconv.Atoi(f.Value.String()); err == nil && n > 0 {
			config.MaxIdleConns = n
		}
	}
	if f := flag.Lookup("db-log-level"); f != nil {
		if v := f.Value.String(); v != "" {
			config.LogLevel = v
		}
	}
	if f := flag.Lookup("db-wal-mode"); f != nil {
		config.WALMode = f.Value.String() == "true"
	}
}

// applyDialectDefaults 在用户没显式设置池子参数时,落到方言推荐值。
// 当 Driver 为空(尚未配置),fallback 到 SQLite 默认,保持启动期不崩。
func applyDialectDefaults(config *DBConfig) {
	driver := config.Driver
	if driver == "" {
		driver = dialect.NameSQLite
	}
	d := dialect.For(driver)
	if d == nil {
		return
	}
	pool := d.DefaultPool()
	if config.MaxOpenConns <= 0 {
		config.MaxOpenConns = pool.MaxOpenConns
	}
	if config.MaxIdleConns <= 0 {
		config.MaxIdleConns = pool.MaxIdleConns
	}
}

// validateConfig 验证配置完整性。仅在 Driver 已设置时做强校验。
func validateConfig(config *DBConfig) error {
	if config.Driver == "" {
		// 尚未配置,跳过校验,让 Setup 模式接手。
		return nil
	}
	switch config.Driver {
	case dialect.NameSQLite, "sqlite3":
		if config.Database == "" {
			return fmt.Errorf("SQLite 数据库文件路径不能为空")
		}
	case dialect.NamePostgres, "postgresql", "pg":
		if config.PostgresHost == "" {
			return fmt.Errorf("PostgreSQL host 不能为空")
		}
		if config.PostgresUser == "" {
			return fmt.Errorf("PostgreSQL user 不能为空")
		}
		if config.PostgresDatabase == "" {
			return fmt.Errorf("PostgreSQL database 不能为空")
		}
	default:
		return fmt.Errorf("不支持的 driver: %q", config.Driver)
	}
	if config.MaxOpenConns <= 0 {
		return fmt.Errorf("MaxOpenConns 必须 > 0")
	}
	if config.MaxIdleConns <= 0 {
		return fmt.Errorf("MaxIdleConns 必须 > 0")
	}
	if config.MaxIdleConns > config.MaxOpenConns {
		return fmt.Errorf("MaxIdleConns 不能超过 MaxOpenConns")
	}
	return nil
}

// IsValid 表示当前配置是否足以建立数据库连接。
// 用于 main.go 判断进 Setup 模式还是 Ready 模式。
func (c *DBConfig) IsValid() bool {
	return validateConfig(c) == nil && c.Driver != ""
}

// BuildSQLiteDSN 构建 SQLite 连接字符串(沿用历史 PRAGMA 配置)。
func (c *DBConfig) BuildSQLiteDSN() string {
	dsn := c.Database + "?_pragma=foreign_keys(1)"
	if c.WALMode {
		dsn += "&_pragma=journal_mode(WAL)"
	}
	dsn += "&_pragma=busy_timeout(30000)"
	dsn += "&_pragma=synchronous(NORMAL)"
	dsn += "&_pragma=cache_size(2000)"
	dsn += "&_pragma=temp_store(memory)"
	return dsn
}

// BuildPostgresDSN 构建 PostgreSQL 连接字符串。
// 优先使用 DB_DSN 环境变量整串覆盖,否则用分项字段拼装。
func (c *DBConfig) BuildPostgresDSN() string {
	if dsn := os.Getenv("DB_DSN"); dsn != "" {
		return dsn
	}
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
		c.PostgresHost,
		c.PostgresPort,
		c.PostgresUser,
		c.PostgresPassword,
		c.PostgresDatabase,
		c.PostgresSSLMode,
		c.PostgresTimeZone,
	)
}

// allManagedEnvKeys 列出 setup 向导接管的全部 env key(横跨两种 driver)。
// 写入 .env 时,这里列出的 key 都会被替换;旧 driver 留下的 key 会被空值表示删除(由 SaveToEnvFile 处理)。
// 其他用户自己维护的行(JWT_SECRET 等)始终保持原样。
func allManagedEnvKeys() []string {
	return []string{
		"DB_DRIVER",
		"DB_PATH",
		"DB_WAL_MODE",
		"PG_HOST",
		"PG_PORT",
		"PG_USER",
		"PG_PASSWORD",
		"PG_DATABASE",
		"PG_SSLMODE",
		"PG_TIMEZONE",
	}
}

// envKVForCurrent 返回所有受管理 key 的 KEY→VALUE map。
// 当前 driver 不用的 key 值为空字符串,SaveToEnvFile 据此把对应行从 .env 中删除。
func (c *DBConfig) envKVForCurrent() map[string]string {
	kv := map[string]string{
		"DB_DRIVER":   c.Driver,
		"DB_PATH":     "",
		"DB_WAL_MODE": "",
		"PG_HOST":     "",
		"PG_PORT":     "",
		"PG_USER":     "",
		"PG_PASSWORD": "",
		"PG_DATABASE": "",
		"PG_SSLMODE":  "",
		"PG_TIMEZONE": "",
	}
	switch c.Driver {
	case dialect.NameSQLite, "sqlite3":
		kv["DB_PATH"] = c.Database
		kv["DB_WAL_MODE"] = boolEnv(c.WALMode)
	case dialect.NamePostgres, "postgresql", "pg":
		kv["PG_HOST"] = c.PostgresHost
		kv["PG_PORT"] = strconv.Itoa(c.PostgresPort)
		kv["PG_USER"] = c.PostgresUser
		kv["PG_PASSWORD"] = c.PostgresPassword
		kv["PG_DATABASE"] = c.PostgresDatabase
		kv["PG_SSLMODE"] = c.PostgresSSLMode
		kv["PG_TIMEZONE"] = c.PostgresTimeZone
	}
	return kv
}

func boolEnv(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// SaveToEnvFile 把当前 driver 对应的环境变量合并写入 path 指向的 .env 文件。
//
// 合并规则:
//   - 文件不存在 → 新建,只写入非空的受管理 KEY,文件权限 0600
//   - 文件存在 → 逐行解析:
//   - 用户行(KEY 不在受管理列表)原样保留
//   - 受管理且新值非空 → 替换为新值
//   - 受管理且新值为空 → 整行删除(用于切换 driver 时清理旧 driver 的 KEY)
//   - 注释 / 空行 → 原样保留
//   - 受管理但文件里不存在的 KEY,且新值非空 → 追加到末尾的"# Managed by setup" 段
//
// 这样用户自己的 JWT_SECRET、OAUTH_* 等不会丢,切换 driver 时旧 driver 的残留也会清理。
func (c *DBConfig) SaveToEnvFile(path string) error {
	if dir := filepath.Dir(path); dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("创建 env 目录失败: %v", err)
		}
	}

	managed := allManagedEnvKeys()
	managedSet := make(map[string]struct{}, len(managed))
	for _, k := range managed {
		managedSet[k] = struct{}{}
	}
	kv := c.envKVForCurrent()

	// 1. 读取已有内容(如存在)
	var existingLines []string
	hasFile := false
	if f, err := os.Open(path); err == nil {
		hasFile = true
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			existingLines = append(existingLines, scanner.Text())
		}
		f.Close()
		if err := scanner.Err(); err != nil {
			return fmt.Errorf("读取 %s 失败: %v", path, err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("打开 %s 失败: %v", path, err)
	}

	// 2. 重写每一行:命中受管理 key 且新值非空 → 替换;新值为空 → 删除;其他 → 原样
	seen := make(map[string]bool, len(managed))
	out := make([]string, 0, len(existingLines)+len(managed)+2)
	for _, line := range existingLines {
		key, ok := parseEnvLineKey(line)
		if !ok {
			out = append(out, line)
			continue
		}
		if _, isManaged := managedSet[key]; !isManaged {
			out = append(out, line)
			continue
		}
		seen[key] = true
		newVal := kv[key]
		if newVal == "" {
			// 受管理且新值为空 → 跳过此行(删除)
			continue
		}
		out = append(out, formatEnvLine(key, newVal))
	}

	// 3. 追加未出现的受管理 key(只追加非空)
	missing := make([]string, 0, len(managed))
	for _, k := range managed {
		if !seen[k] && kv[k] != "" {
			missing = append(missing, k)
		}
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		if hasFile && len(out) > 0 && strings.TrimSpace(out[len(out)-1]) != "" {
			out = append(out, "")
		}
		out = append(out, "# Managed by NodePassDash setup wizard")
		for _, k := range missing {
			out = append(out, formatEnvLine(k, kv[k]))
		}
	}

	// 4. 写文件(0600,密码字段)
	content := strings.Join(out, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return fmt.Errorf("写入 %s 失败: %v", path, err)
	}
	return nil
}

// formatEnvLine 把 KV 序列化为一行 .env。
// 值若含空格 / 引号 / # / =,自动用双引号包裹并转义。
func formatEnvLine(key, value string) string {
	if needsQuoting(value) {
		// 转义反斜杠和双引号
		escaped := strings.ReplaceAll(value, `\`, `\\`)
		escaped = strings.ReplaceAll(escaped, `"`, `\"`)
		return fmt.Sprintf(`%s="%s"`, key, escaped)
	}
	return fmt.Sprintf("%s=%s", key, value)
}

func needsQuoting(v string) bool {
	if v == "" {
		return false
	}
	for _, r := range v {
		if r <= ' ' || r == '#' || r == '"' || r == '\'' || r == '\\' {
			return true
		}
	}
	return false
}

// parseEnvLineKey 从一行 .env 中提取 KEY,失败返回 ok=false。
// 跳过注释、空行、不含 = 的行。允许 KEY 前的空白。
func parseEnvLineKey(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return "", false
	}
	idx := strings.IndexByte(trimmed, '=')
	if idx <= 0 {
		return "", false
	}
	key := strings.TrimSpace(trimmed[:idx])
	if key == "" {
		return "", false
	}
	// 允许 export 前缀
	if strings.HasPrefix(key, "export ") {
		key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
	}
	return key, true
}

// PrintConfig 打印关键配置信息(不含密码)。
func (c *DBConfig) PrintConfig() {
	log.Infof("数据库配置:")
	log.Infof("  Driver: %s", c.Driver)
	switch c.Driver {
	case dialect.NameSQLite, "sqlite3":
		log.Infof("  数据库文件: %s", c.Database)
		log.Infof("  WAL 模式: %v", c.WALMode)
	case dialect.NamePostgres, "postgresql", "pg":
		log.Infof("  Host: %s:%d", c.PostgresHost, c.PostgresPort)
		log.Infof("  User: %s", c.PostgresUser)
		log.Infof("  Database: %s", c.PostgresDatabase)
		log.Infof("  SSLMode: %s", c.PostgresSSLMode)
	}
	log.Infof("  最大连接数: %d", c.MaxOpenConns)
	log.Infof("  最大空闲连接数: %d", c.MaxIdleConns)
	log.Infof("  连接生命周期: %v", c.MaxLifetime)
	log.Infof("  空闲超时: %v", c.MaxIdleTime)
	log.Infof("  日志级别: %s", c.LogLevel)
}
