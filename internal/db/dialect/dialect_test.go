package dialect

import (
	"strings"
	"testing"
)

func TestFor(t *testing.T) {
	cases := map[string]string{
		"sqlite":     NameSQLite,
		"sqlite3":    NameSQLite,
		"postgres":   NamePostgres,
		"postgresql": NamePostgres,
		"pg":         NamePostgres,
	}
	for input, wantName := range cases {
		d := For(input)
		if d == nil {
			t.Errorf("For(%q) returned nil, expected dialect %q", input, wantName)
			continue
		}
		if d.Name() != wantName {
			t.Errorf("For(%q).Name() = %q, want %q", input, d.Name(), wantName)
		}
	}
	if d := For("mysql"); d != nil {
		t.Errorf("For(\"mysql\") returned %v, want nil", d)
	}
	if d := For(""); d != nil {
		t.Errorf("For(\"\") returned %v, want nil", d)
	}
}

func TestSQLite_JSONPath(t *testing.T) {
	var d Dialect = SQLite{}
	got := d.JSONPath("peer", "sid")
	want := `peer->>'$.sid'`
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestPostgres_JSONPath(t *testing.T) {
	var d Dialect = Postgres{}
	got := d.JSONPath("peer", "sid")
	want := `(peer::json)->>'sid'`
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestSQLite_TimeAgo(t *testing.T) {
	var d Dialect = SQLite{}
	got := d.TimeAgo("event_time", "-30 days")
	want := `event_time < datetime('now', '-30 days')`
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestPostgres_TimeAgo(t *testing.T) {
	var d Dialect = Postgres{}
	cases := map[string]string{
		"-30 days": `event_time < (NOW() - INTERVAL '30 days')`,
		"-7 days":  `event_time < (NOW() - INTERVAL '7 days')`,
		"-1 year":  `event_time < (NOW() - INTERVAL '1 year')`,
		// 允许调用方误传不带负号的 duration,实现应能容错。
		"30 days": `event_time < (NOW() - INTERVAL '30 days')`,
	}
	for dur, want := range cases {
		got := d.TimeAgo("event_time", dur)
		if got != want {
			t.Errorf("TimeAgo(%q) = %q, want %q", dur, got, want)
		}
	}
}

func TestSQLite_TableExistsSQL(t *testing.T) {
	var d Dialect = SQLite{}
	got := d.TableExistsSQL("endpoints")
	if !strings.Contains(got, "sqlite_master") || !strings.Contains(got, "endpoints") {
		t.Errorf("unexpected SQL: %s", got)
	}
}

func TestPostgres_TableExistsSQL(t *testing.T) {
	var d Dialect = Postgres{}
	got := d.TableExistsSQL("endpoints")
	if !strings.Contains(got, "information_schema.tables") || !strings.Contains(got, "endpoints") {
		t.Errorf("unexpected SQL: %s", got)
	}
}

func TestSQLite_IndexExistsSQL(t *testing.T) {
	var d Dialect = SQLite{}
	got := d.IndexExistsSQL("idx_foo")
	if !strings.Contains(got, "sqlite_master") || !strings.Contains(got, "idx_foo") {
		t.Errorf("unexpected SQL: %s", got)
	}
}

func TestPostgres_IndexExistsSQL(t *testing.T) {
	var d Dialect = Postgres{}
	got := d.IndexExistsSQL("idx_foo")
	if !strings.Contains(got, "pg_indexes") || !strings.Contains(got, "idx_foo") {
		t.Errorf("unexpected SQL: %s", got)
	}
}

func TestVersionSQL(t *testing.T) {
	var s Dialect = SQLite{}
	var p Dialect = Postgres{}
	if s.VersionSQL() != "SELECT sqlite_version()" {
		t.Errorf("SQLite VersionSQL mismatch: %s", s.VersionSQL())
	}
	if p.VersionSQL() != "SELECT version()" {
		t.Errorf("Postgres VersionSQL mismatch: %s", p.VersionSQL())
	}
}

func TestVacuumSQL(t *testing.T) {
	var s Dialect = SQLite{}
	var p Dialect = Postgres{}
	if s.VacuumSQL() != "VACUUM" {
		t.Errorf("SQLite VacuumSQL mismatch: %s", s.VacuumSQL())
	}
	if p.VacuumSQL() != "VACUUM ANALYZE" {
		t.Errorf("Postgres VacuumSQL mismatch: %s", p.VacuumSQL())
	}
}

func TestDefaultPool(t *testing.T) {
	var sd Dialect = SQLite{}
	var pd Dialect = Postgres{}
	s := sd.DefaultPool()
	if s.MaxOpenConns != 1 || s.MaxIdleConns != 1 {
		t.Errorf("SQLite DefaultPool got %+v, want {1,1}", s)
	}
	p := pd.DefaultPool()
	if p.MaxOpenConns <= 1 || p.MaxIdleConns <= 1 {
		t.Errorf("Postgres DefaultPool got %+v, expected multi-writer values", p)
	}
}
