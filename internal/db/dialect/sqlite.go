package dialect

import "fmt"

// SQLite 实现 Dialect 接口,沿用项目原有的 SQLite 行为。
type SQLite struct{}

func (SQLite) Name() string { return NameSQLite }

func (SQLite) JSONPath(column, key string) string {
	return fmt.Sprintf("%s->>'$.%s'", column, key)
}

func (SQLite) TimeAgo(field, duration string) string {
	return fmt.Sprintf("%s < datetime('now', '%s')", field, duration)
}

func (SQLite) TableExistsSQL(table string) string {
	return fmt.Sprintf(
		"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='%s'",
		table,
	)
}

func (SQLite) IndexExistsSQL(indexName string) string {
	return fmt.Sprintf(
		"SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='%s'",
		indexName,
	)
}

func (SQLite) VersionSQL() string { return "SELECT sqlite_version()" }

func (SQLite) VacuumSQL() string { return "VACUUM" }

func (SQLite) AnalyzeSQL() string { return "ANALYZE" }

func (SQLite) DefaultPool() PoolDefaults {
	// SQLite 单写者模型: 用 1/1 降低 lock 竞争,跟现有 GetDBConfig 默认值对齐。
	return PoolDefaults{MaxOpenConns: 1, MaxIdleConns: 1}
}
