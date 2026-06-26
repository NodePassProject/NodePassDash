// Package dialect 抽象不同数据库方言之间的 SQL 差异。
//
// 业务层在需要写 raw SQL 时,通过 db.Dialect() 拿到当前 dialect 实现,
// 调用 helper 拼装方言安全的 SQL 片段,避免在业务代码里散布 driver 判断。
package dialect

const (
	NameSQLite   = "sqlite"
	NamePostgres = "postgres"
)

// Dialect 描述一种数据库方言。只列必要的方法,业务里没用到的差异不暴露。
type Dialect interface {
	// Name 返回方言名称,值为 NameSQLite 或 NamePostgres。
	Name() string

	// JSONPath 生成提取 JSON 字段为文本的 SQL 表达式。
	// 例如 column=peer, key=sid:
	//   SQLite   -> peer->>'$.sid'
	//   Postgres -> peer->>'sid'
	JSONPath(column, key string) string

	// TimeAgo 生成一个 "<field> < (当前时间 - duration)" 的 SQL 片段。
	// duration 用 SQLite 修饰符语法 ("-30 days" / "-7 days" / "-1 year"),
	// 内部按方言翻译。返回值已包含 < 比较符。
	//   SQLite   -> field < datetime('now', '-30 days')
	//   Postgres -> field < (NOW() - INTERVAL '30 days')
	TimeAgo(field, duration string) string

	// TableExistsSQL 返回一条查询,该查询返回 1 表示给定表存在,返回 0 表示不存在。
	// 调用方应使用 .Raw(...).Scan(&count) 之类方式读结果。
	TableExistsSQL(table string) string

	// IndexExistsSQL 与 TableExistsSQL 同理,但针对索引。
	IndexExistsSQL(indexName string) string

	// VersionSQL 返回查询数据库版本字符串的 SQL。
	//   SQLite   -> SELECT sqlite_version()
	//   Postgres -> SELECT version()
	VersionSQL() string

	// VacuumSQL 返回该方言下的整理/回收语句。
	//   SQLite   -> VACUUM
	//   Postgres -> VACUUM ANALYZE
	VacuumSQL() string

	// AnalyzeSQL 返回更新统计信息的 SQL。
	//   SQLite   -> ANALYZE
	//   Postgres -> ANALYZE
	AnalyzeSQL() string

	// DefaultPool 返回该方言推荐的连接池默认参数。
	// 用户没显式配置 MaxOpenConns / MaxIdleConns 时落到这里。
	DefaultPool() PoolDefaults
}

// PoolDefaults 是 Dialect.DefaultPool 的返回。
// SQLite 是单写者模型,推荐 1/1;PG 是多写者,推荐 25/10。
type PoolDefaults struct {
	MaxOpenConns int
	MaxIdleConns int
}

// For 按 driver 名称返回对应实现。未知 driver 返回 nil,调用方应处理。
func For(driver string) Dialect {
	switch driver {
	case NameSQLite, "sqlite3":
		return SQLite{}
	case NamePostgres, "postgresql", "pg":
		return Postgres{}
	default:
		return nil
	}
}
