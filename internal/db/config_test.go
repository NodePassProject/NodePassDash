package db

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestGetDBConfig_DefaultEmpty 验证默认 driver 为空(进 Setup 模式的前提)。
func TestGetDBConfig_DefaultEmpty(t *testing.T) {
	for _, k := range []string{"DB_DRIVER", "DB_PATH", "PG_HOST", "PG_USER", "PG_DATABASE"} {
		t.Setenv(k, "")
	}
	tmp := t.TempDir()
	cfg := GetDBConfig(tmp)
	if cfg.Driver != "" {
		t.Errorf("default driver = %q, want empty", cfg.Driver)
	}
	if cfg.IsValid() {
		t.Errorf("default config should not be valid (driver empty)")
	}
}

func TestGetDBConfig_EnvDriver_SQLite(t *testing.T) {
	t.Setenv("DB_DRIVER", "sqlite")
	t.Setenv("DB_PATH", "/tmp/test.db")
	tmp := t.TempDir()
	cfg := GetDBConfig(tmp)
	if cfg.Driver != "sqlite" {
		t.Errorf("driver = %q, want sqlite", cfg.Driver)
	}
	if !cfg.IsValid() {
		t.Errorf("env-provided SQLite config should be valid")
	}
}

func TestGetDBConfig_EnvDriver_Postgres(t *testing.T) {
	t.Setenv("DB_DRIVER", "postgres")
	t.Setenv("PG_HOST", "127.0.0.1")
	t.Setenv("PG_USER", "u")
	t.Setenv("PG_DATABASE", "d")
	t.Setenv("DB_PATH", "")
	tmp := t.TempDir()
	cfg := GetDBConfig(tmp)
	if cfg.Driver != "postgres" {
		t.Errorf("driver = %q, want postgres", cfg.Driver)
	}
	if !cfg.IsValid() {
		t.Errorf("env-provided Postgres config should be valid")
	}
}

// TestBuildPostgresDSN 检查 DSN 拼装格式。
func TestBuildPostgresDSN(t *testing.T) {
	t.Setenv("DB_DSN", "")
	cfg := DBConfig{
		PostgresHost:     "h",
		PostgresPort:     1234,
		PostgresUser:     "u",
		PostgresPassword: "p",
		PostgresDatabase: "d",
		PostgresSSLMode:  "disable",
		PostgresTimeZone: "Local",
	}
	dsn := cfg.BuildPostgresDSN()
	for _, want := range []string{"host=h", "port=1234", "user=u", "password=p", "dbname=d", "sslmode=disable", "TimeZone=Local"} {
		if !strings.Contains(dsn, want) {
			t.Errorf("DSN missing %q: %s", want, dsn)
		}
	}
}

func TestBuildPostgresDSN_FromEnv(t *testing.T) {
	t.Setenv("DB_DSN", "postgres://x@y/z")
	cfg := DBConfig{PostgresHost: "ignored"}
	dsn := cfg.BuildPostgresDSN()
	if dsn != "postgres://x@y/z" {
		t.Errorf("DSN = %q, want env value", dsn)
	}
}

// TestSaveToEnvFile_FreshSQLite 验证在不存在的 .env 上首次写入。
func TestSaveToEnvFile_FreshSQLite(t *testing.T) {
	tmp := t.TempDir()
	envPath := filepath.Join(tmp, ".env")
	cfg := DBConfig{
		Driver:   "sqlite",
		Database: "db/database.db",
		WALMode:  true,
	}
	if err := cfg.SaveToEnvFile(envPath); err != nil {
		t.Fatalf("SaveToEnvFile: %v", err)
	}
	data, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	got := string(data)
	for _, want := range []string{"DB_DRIVER=sqlite", "DB_PATH=db/database.db", "DB_WAL_MODE=true"} {
		if !strings.Contains(got, want) {
			t.Errorf(".env missing %q: %s", want, got)
		}
	}
	// 不应该含有 Postgres 的 key
	if strings.Contains(got, "PG_HOST") {
		t.Errorf("SQLite write leaked PG_HOST: %s", got)
	}
}

// TestSaveToEnvFile_PreservesUserLines 验证已有用户行不会被覆盖,只替换受管理的 key。
func TestSaveToEnvFile_PreservesUserLines(t *testing.T) {
	tmp := t.TempDir()
	envPath := filepath.Join(tmp, ".env")

	// 用户预先维护的 .env
	pre := strings.Join([]string{
		"# user maintained block",
		"JWT_SECRET=user-secret-xyz",
		"OAUTH_CLIENT_ID=client-id-123",
		"",
		"DB_DRIVER=sqlite",
		"DB_PATH=/old/path.db",
	}, "\n") + "\n"
	if err := os.WriteFile(envPath, []byte(pre), 0o644); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Setup 向导提交 Postgres 配置
	cfg := DBConfig{
		Driver:           "postgres",
		PostgresHost:     "newhost",
		PostgresPort:     6543,
		PostgresUser:     "newuser",
		PostgresPassword: "secret with spaces",
		PostgresDatabase: "newdb",
		PostgresSSLMode:  "require",
		PostgresTimeZone: "UTC",
	}
	if err := cfg.SaveToEnvFile(envPath); err != nil {
		t.Fatalf("SaveToEnvFile: %v", err)
	}

	data, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	got := string(data)

	// 用户行必须保留
	if !strings.Contains(got, "JWT_SECRET=user-secret-xyz") {
		t.Errorf("lost JWT_SECRET line: %s", got)
	}
	if !strings.Contains(got, "OAUTH_CLIENT_ID=client-id-123") {
		t.Errorf("lost OAUTH_CLIENT_ID line: %s", got)
	}
	if !strings.Contains(got, "# user maintained block") {
		t.Errorf("lost user comment: %s", got)
	}

	// 受管理的 key 必须被替换/追加
	if !strings.Contains(got, "DB_DRIVER=postgres") {
		t.Errorf("DB_DRIVER not switched to postgres: %s", got)
	}
	if strings.Contains(got, "DB_DRIVER=sqlite") {
		t.Errorf("old DB_DRIVER=sqlite still present: %s", got)
	}
	if strings.Contains(got, "DB_PATH=/old/path.db") {
		t.Errorf("stale DB_PATH still present: %s", got)
	}
	if !strings.Contains(got, "PG_HOST=newhost") {
		t.Errorf("PG_HOST missing: %s", got)
	}
	if !strings.Contains(got, "PG_DATABASE=newdb") {
		t.Errorf("PG_DATABASE missing: %s", got)
	}
	// 含空格的密码被引号包裹
	if !strings.Contains(got, `PG_PASSWORD="secret with spaces"`) {
		t.Errorf("PG_PASSWORD not quoted: %s", got)
	}
}

// TestSaveToEnvFile_DriverSwitchCleansOldKeys 切换 driver 时,
// 旧 driver 的受管理 key 必须被清理(从 .env 删除),避免老用户切换后看到一堆 stale 的 PG_xxx。
func TestSaveToEnvFile_DriverSwitchCleansOldKeys(t *testing.T) {
	tmp := t.TempDir()
	envPath := filepath.Join(tmp, ".env")
	pre := "DB_DRIVER=postgres\nPG_HOST=oldpg\nPG_USER=u\nPG_DATABASE=d\nJWT_SECRET=keep-me\n"
	if err := os.WriteFile(envPath, []byte(pre), 0o644); err != nil {
		t.Fatalf("seed: %v", err)
	}
	cfg := DBConfig{Driver: "sqlite", Database: "db/foo.db", WALMode: true}
	if err := cfg.SaveToEnvFile(envPath); err != nil {
		t.Fatalf("SaveToEnvFile: %v", err)
	}
	data, _ := os.ReadFile(envPath)
	got := string(data)
	if !strings.Contains(got, "DB_DRIVER=sqlite") {
		t.Errorf("DB_DRIVER not flipped: %s", got)
	}
	for _, stale := range []string{"PG_HOST=", "PG_USER=", "PG_DATABASE="} {
		if strings.Contains(got, stale) {
			t.Errorf("stale %q remains: %s", stale, got)
		}
	}
	// 但用户行必须保留
	if !strings.Contains(got, "JWT_SECRET=keep-me") {
		t.Errorf("JWT_SECRET lost: %s", got)
	}
}
