package db

import (
	"database/sql"
	"log"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var (
	db   *sql.DB
	once sync.Once
)

// DB 获取数据库单例
func DB() *sql.DB {
	once.Do(func() {
		var err error
		// 优化的连接字符串，增加更长的超时时间和优化配置
		db, err = sql.Open("sqlite3", "file:public/sqlite.db?_journal_mode=WAL&_busy_timeout=10000&_fk=1&_sync=NORMAL&_cache_size=1000000")
		if err != nil {
			log.Fatal(err)
		}

		// 优化连接池配置
		db.SetMaxOpenConns(8)                  // 增加最大连接数
		db.SetMaxIdleConns(4)                  // 保持一定的空闲连接
		db.SetConnMaxLifetime(0)               // 连接不过期
		db.SetConnMaxIdleTime(5 * time.Minute) // 空闲连接5分钟后关闭

		// 初始化表结构
		if err := initSchema(db); err != nil {
			log.Fatal(err)
		}
	})
	return db
}

// ExecuteWithRetry 带重试机制的数据库执行
func ExecuteWithRetry(fn func(*sql.DB) error) error {
	maxRetries := 3
	baseDelay := 50 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		err := fn(DB())
		if err == nil {
			return nil
		}

		// 检查是否是数据库锁错误
		if isLockError(err) && i < maxRetries-1 {
			delay := time.Duration(i+1) * baseDelay
			time.Sleep(delay)
			continue
		}

		return err
	}
	return nil
}

// TxWithRetry 带重试机制的事务执行
func TxWithRetry(fn func(*sql.Tx) error) error {
	maxRetries := 3
	baseDelay := 50 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		tx, err := DB().Begin()
		if err != nil {
			if isLockError(err) && i < maxRetries-1 {
				delay := time.Duration(i+1) * baseDelay
				time.Sleep(delay)
				continue
			}
			return err
		}

		err = fn(tx)
		if err != nil {
			tx.Rollback()
			if isLockError(err) && i < maxRetries-1 {
				delay := time.Duration(i+1) * baseDelay
				time.Sleep(delay)
				continue
			}
			return err
		}

		err = tx.Commit()
		if err != nil {
			if isLockError(err) && i < maxRetries-1 {
				delay := time.Duration(i+1) * baseDelay
				time.Sleep(delay)
				continue
			}
			return err
		}

		return nil
	}
	return nil
}

// isLockError 检查是否是数据库锁错误
func isLockError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return errStr == "database is locked" ||
		errStr == "database locked" ||
		errStr == "SQLITE_BUSY"
}

// 初始化数据库Schema
func initSchema(db *sql.DB) error {
	// --------  兼容旧版本：为 Tunnel 表添加 min / max 列 --------
	if err := ensureColumn(db, "Tunnel", "min", "INTEGER"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Tunnel", "max", "INTEGER"); err != nil {
		return err
	}

	return nil
}

// ensureColumn 检查列是否存在，不存在则自动 ALTER TABLE 添加
func ensureColumn(db *sql.DB, table, column, typ string) error {
	// 查询表信息
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var exists bool
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dfltValue interface{}
		var pk int
		_ = rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk)
		if name == column {
			exists = true
			break
		}
	}

	if !exists {
		// 注意：SQLite ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，因此需要手动检查
		_, err := db.Exec(`ALTER TABLE "` + table + `" ADD COLUMN ` + column + ` ` + typ)
		return err
	}
	return nil
}
