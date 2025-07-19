package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"regexp"
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

		// 确保public目录存在
		dbDir := "public"
		if err := ensureDir(dbDir); err != nil {
			log.Fatalf("创建数据库目录失败: %v", err)
		}

		// 数据库文件路径
		dbPath := filepath.Join(dbDir, "sqlite.db")

		// 优化的连接字符串，增加更长的超时时间和优化配置
		db, err = sql.Open("sqlite3", "file:"+dbPath+"?_journal_mode=WAL&_busy_timeout=10000&_fk=1&_sync=NORMAL&_cache_size=1000000")
		if err != nil {
			log.Fatalf("打开数据库失败: %v", err)
		}

		// 优化连接池配置
		db.SetMaxOpenConns(8)                  // 增加最大连接数
		db.SetMaxIdleConns(4)                  // 保持一定的空闲连接
		db.SetConnMaxLifetime(0)               // 连接不过期
		db.SetConnMaxIdleTime(5 * time.Minute) // 空闲连接5分钟后关闭

		// 初始化表结构
		if err := initSchema(db); err != nil {
			log.Fatalf("初始化数据库表结构失败: %v", err)
		}

		log.Printf("数据库初始化成功: %s", dbPath)
	})
	return db
}

// ensureDir 确保目录存在，如果不存在则创建
func ensureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		log.Printf("创建目录: %s", dir)
		return os.MkdirAll(dir, 0755)
	}
	return nil
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

	// --------  为 Tunnel 表添加密码字段 --------
	if err := ensureColumn(db, "Tunnel", "password", "TEXT DEFAULT ''"); err != nil {
		return err
	}

	// --------  为 Tunnel 表添加重启字段 --------
	if err := ensureColumn(db, "Tunnel", "restart", "BOOLEAN DEFAULT FALSE"); err != nil {
		return err
	}

	// --------  移除 Tunnel 表 name 字段的唯一约束 --------
	if err := removeTunnelNameUniqueConstraint(db); err != nil {
		return err
	}

	// --------  为 TunnelRecycle 表添加密码字段 --------
	if err := ensureColumn(db, "TunnelRecycle", "password", "TEXT DEFAULT ''"); err != nil {
		return err
	}

	// --------  为 Endpoint 表添加系统信息字段 --------
	if err := ensureColumn(db, "Endpoint", "os", "TEXT DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Endpoint", "arch", "TEXT DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Endpoint", "ver", "TEXT DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Endpoint", "log", "TEXT DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Endpoint", "tls", "TEXT DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Endpoint", "crt", "TEXT DEFAULT ''"); err != nil {
		return err
	}
	if err := ensureColumn(db, "Endpoint", "key_path", "TEXT DEFAULT ''"); err != nil {
		return err
	}

	// --------  为 Endpoint 表添加运行时间字段 --------
	if err := ensureColumn(db, "Endpoint", "uptime", "INTEGER DEFAULT NULL"); err != nil {
		return err
	}

	// --------  创建标签表 --------
	if err := createTagsTable(db); err != nil {
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

// removeTunnelNameUniqueConstraint 移除 Tunnel 表 name 字段的唯一约束
func removeTunnelNameUniqueConstraint(db *sql.DB) error {
	// 检查 Tunnel 表是否存在
	var tableExists bool
	err := db.QueryRow(`SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='Tunnel'`).Scan(&tableExists)
	if err != nil {
		return err
	}

	if !tableExists {
		log.Printf("Tunnel 表不存在，跳过唯一约束移除迁移")
		return nil
	}

	// 检查是否需要执行迁移：查看 name 字段是否有 UNIQUE 约束
	hasUnique, err := hasUniqueConstraintOnNameField(db)
	if err != nil {
		log.Printf("检查 UNIQUE 约束时出错: %v", err)
		return err
	}

	if !hasUnique {
		log.Printf("Tunnel 表 name 字段已经没有 UNIQUE 约束，跳过迁移")
		return nil
	}

	log.Printf("检测到 Tunnel 表 name 字段存在 UNIQUE 约束，开始执行移除迁移...")

	// 开始事务执行迁移
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. 创建新的隧道表（移除name字段的UNIQUE约束）
	log.Printf("步骤 1/5: 创建新的 Tunnel 表结构...")
	_, err = tx.Exec(`
		CREATE TABLE tunnels_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			endpointId INTEGER NOT NULL,
			mode TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'stopped',
			tunnelAddress TEXT NOT NULL,
			tunnelPort TEXT NOT NULL,
			targetAddress TEXT NOT NULL,
			targetPort TEXT NOT NULL,
			tlsMode TEXT NOT NULL,
			certPath TEXT,
			keyPath TEXT,
			logLevel TEXT NOT NULL DEFAULT 'info',
			commandLine TEXT NOT NULL,
			restart BOOLEAN DEFAULT FALSE,
			instanceId TEXT,
			password TEXT DEFAULT '',
			tcpRx INTEGER DEFAULT 0,
			tcpTx INTEGER DEFAULT 0,
			udpRx INTEGER DEFAULT 0,
			udpTx INTEGER DEFAULT 0,
			min INTEGER,
			max INTEGER,
			createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			lastEventTime DATETIME
		)
	`)
	if err != nil {
		log.Printf("创建新表失败: %v", err)
		return err
	}

	// 2. 复制数据（字段名映射：旧表 snake_case -> 新表 camelCase）
	log.Printf("步骤 2/5: 复制现有数据到新表...")
	_, err = tx.Exec(`
		INSERT INTO tunnels_new (
			id, name, endpointId, mode, status, tunnelAddress, tunnelPort,
			targetAddress, targetPort, tlsMode, certPath, keyPath, logLevel,
			commandLine, restart, instanceId, password, tcpRx, tcpTx, udpRx, udpTx,
			min, max, createdAt, updatedAt
		)
		SELECT 
			id, name, endpointId, mode, status, tunnelAddress, tunnelPort,
			targetAddress, targetPort, 
			COALESCE(tlsMode, 'mode0') as tlsMode, 
			certPath, keyPath, 
			COALESCE(logLevel, 'info') as logLevel,
			commandLine,
			COALESCE(restart, 0) as restart,
			instanceId,
			COALESCE(password, '') as password, 
			COALESCE(tcpRx, 0) as tcpRx,
			COALESCE(tcpTx, 0) as tcpTx,
			COALESCE(udpRx, 0) as udpRx,
			COALESCE(udpTx, 0) as udpTx,
			min, max, 
			createdAt, updatedAt
		FROM Tunnel
	`)
	if err != nil {
		log.Printf("数据复制失败: %v", err)
		return err
	}

	// 3. 删除旧表
	log.Printf("步骤 3/5: 删除旧表...")
	_, err = tx.Exec(`DROP TABLE Tunnel`)
	if err != nil {
		log.Printf("删除旧表失败: %v", err)
		return err
	}

	// 4. 重命名新表
	log.Printf("步骤 4/5: 重命名新表为 Tunnel...")
	_, err = tx.Exec(`ALTER TABLE tunnels_new RENAME TO Tunnel`)
	if err != nil {
		log.Printf("重命名表失败: %v", err)
		return err
	}

	// 5. 重新创建索引
	log.Printf("步骤 5/5: 重新创建索引...")
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_tunnels_instance_id ON Tunnel(instanceId)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnels_name ON Tunnel(name)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnels_endpoint_id ON Tunnel(endpointId)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnels_status ON Tunnel(status)`,
		`CREATE INDEX IF NOT EXISTS idx_tunnels_created_at ON Tunnel(createdAt)`,
	}

	for i, indexSQL := range indexes {
		_, err = tx.Exec(indexSQL)
		if err != nil {
			log.Printf("创建索引 %d/%d 失败: %v", i+1, len(indexes), err)
			return err
		}
	}

	// 提交事务
	if err = tx.Commit(); err != nil {
		log.Printf("事务提交失败: %v", err)
		return err
	}

	log.Printf("✅ Tunnel 表 name 字段唯一约束移除迁移完成！现在可以创建同名的隧道实例了")
	return nil
}

// hasUniqueConstraintOnNameField 检查 Tunnel 表的 name 字段是否有 UNIQUE 约束
func hasUniqueConstraintOnNameField(db *sql.DB) (bool, error) {
	// 方法1: 检查索引列表，查找 name 字段的唯一索引
	rows, err := db.Query(`PRAGMA index_list(Tunnel)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int

		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			continue
		}

		// 如果是唯一索引，检查是否是 name 字段的索引
		if unique == 1 {
			isNameIndex, err := isIndexOnNameField(db, name)
			if err != nil {
				continue
			}
			if isNameIndex {
				log.Printf("发现 name 字段的唯一索引: %s", name)
				return true, nil
			}
		}
	}

	// 方法2: 检查表定义中的内联 UNIQUE 约束
	var schema string
	err = db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name='Tunnel'`).Scan(&schema)
	if err != nil {
		return false, err
	}

	// 检查 CREATE TABLE 语句中是否有 name 字段的 UNIQUE 约束
	hasInlineUnique := regexp.MustCompile(`name\s+[^,\)]*\bUNIQUE\b`).MatchString(schema)
	if hasInlineUnique {
		log.Printf("发现 name 字段的内联 UNIQUE 约束")
		return true, nil
	}

	// 检查表级 UNIQUE 约束
	hasTableUnique := regexp.MustCompile(`UNIQUE\s*\(\s*name\s*\)`).MatchString(schema)
	if hasTableUnique {
		log.Printf("发现 name 字段的表级 UNIQUE 约束")
		return true, nil
	}

	return false, nil
}

// isIndexOnNameField 检查指定索引是否只包含 name 字段
func isIndexOnNameField(db *sql.DB, indexName string) (bool, error) {
	rows, err := db.Query(`PRAGMA index_info(` + indexName + `)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var columnCount int
	var hasNameField bool

	for rows.Next() {
		var seqno int
		var cid int
		var name string

		if err := rows.Scan(&seqno, &cid, &name); err != nil {
			continue
		}

		columnCount++
		if name == "name" {
			hasNameField = true
		}
	}

	// 索引只有一个列且是 name 字段
	return columnCount == 1 && hasNameField, nil
}

// createTagsTable 创建标签表
func createTagsTable(db *sql.DB) error {
	// 创建标签表
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS Tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return err
	}

	// 创建索引
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_tags_name ON Tags(name)`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_tags_created_at ON Tags(created_at)`)
	if err != nil {
		return err
	}

	// 创建隧道标签关联表
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS TunnelTags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			tunnel_id INTEGER NOT NULL,
			tag_id INTEGER NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE,
			FOREIGN KEY (tag_id) REFERENCES Tags(id) ON DELETE CASCADE,
			UNIQUE(tunnel_id, tag_id)
		)
	`)
	if err != nil {
		return err
	}

	// 创建索引
	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_tunnel_tags_tunnel_id ON TunnelTags(tunnel_id)`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`CREATE INDEX IF NOT EXISTS idx_tunnel_tags_tag_id ON TunnelTags(tag_id)`)
	if err != nil {
		return err
	}

	return nil
}
