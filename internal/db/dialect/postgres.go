package dialect

import (
	"fmt"
	"strings"
)

// Postgres 实现 Dialect 接口。
type Postgres struct{}

func (Postgres) Name() string { return NamePostgres }

func (Postgres) JSONPath(column, key string) string {
	// peer 列在 GORM 中用 `type:text;serializer:json` 存储,Postgres 端落地为 text。
	// `->>` 仅对 json/jsonb 定义,直接写在 text 列上会报
	// `operator does not exist: text ->> unknown`,所以这里先 ::json 再取键。
	return fmt.Sprintf("(%s::json)->>'%s'", column, key)
}

func (Postgres) TimeAgo(field, duration string) string {
	// SQLite 风格传入: "-30 days" / "-7 days" / "-1 year"
	// 转换为 PG 风格的 INTERVAL,丢掉前导负号(NOW() - INTERVAL 表达式自带减法语义)。
	d := strings.TrimSpace(duration)
	d = strings.TrimPrefix(d, "-")
	d = strings.TrimSpace(d)
	return fmt.Sprintf("%s < (NOW() - INTERVAL '%s')", field, d)
}

func (Postgres) TableExistsSQL(table string) string {
	return fmt.Sprintf(
		"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='%s'",
		table,
	)
}

func (Postgres) IndexExistsSQL(indexName string) string {
	return fmt.Sprintf(
		"SELECT COUNT(*) FROM pg_indexes WHERE schemaname=current_schema() AND indexname='%s'",
		indexName,
	)
}

func (Postgres) VersionSQL() string { return "SELECT version()" }

// VacuumSQL 在 PG 中需要在 autocommit 模式下执行(事务外)。
// 调用方通过 sqlDB.Exec(...) 直接执行,而不是在 GORM 事务里跑。
func (Postgres) VacuumSQL() string { return "VACUUM ANALYZE" }

func (Postgres) AnalyzeSQL() string { return "ANALYZE" }

func (Postgres) DefaultPool() PoolDefaults {
	// PG 多写者模型,默认放大。25/10 是常见服务端推荐起步值。
	return PoolDefaults{MaxOpenConns: 25, MaxIdleConns: 10}
}
