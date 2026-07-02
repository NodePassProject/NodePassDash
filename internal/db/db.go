package db

import (
	"NodePassDash/internal/db/dialect"
	applog "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	gormsqlite "github.com/glebarez/sqlite"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	gormDB          *gorm.DB
	currentDialect  dialect.Dialect
	once            sync.Once
	// 用于控制数据库健康检查协程的关闭
	dbHealthCtx    context.Context
	dbHealthCancel context.CancelFunc
)

// Dialect 返回当前生效的方言实现。
// 调用前必须确保 GetDB 已被调用过(即不在 Setup 模式下)。
// 若尚未初始化,返回 SQLite{} 作为安全默认值,避免业务层 nil 解引用。
func Dialect() dialect.Dialect {
	if currentDialect == nil {
		return dialect.SQLite{}
	}
	return currentDialect
}

// GetDB 获取GORM数据库实例。
// 仅应在 Ready 模式(配置已完成)下调用;Setup 模式不要走这个入口。
func GetDB() *gorm.DB {
	// 确保db目录存在
	dbDir := "db"
	if err := ensureDir(dbDir); err != nil {
		return nil
	}

	once.Do(func() {
		config := GetDBConfig(dbDir)
		if !config.IsValid() {
			log.Fatalf("数据库配置不完整(driver=%q),请先完成 Setup 向导或设置 DB_DRIVER 等环境变量", config.Driver)
		}

		// SQLite 才需要处理 Docker Compose 软链接兼容
		if config.Driver == dialect.NameSQLite || config.Driver == "sqlite3" {
			if err := handleDockerComposeMigration(); err != nil {
				log.Printf("[数据库迁移] Docker Compose 配置迁移失败: %v", err)
			}
		}

		// 装配方言
		currentDialect = dialect.For(config.Driver)
		if currentDialect == nil {
			log.Fatalf("不支持的数据库 driver: %q", config.Driver)
		}

		gormConfig := &gorm.Config{
			Logger: logger.Default.LogMode(resolveLogLevel(config.LogLevel)),
			NowFunc: func() time.Time {
				return time.Now().Local()
			},
		}

		// 按 driver 分支打开 GORM
		var openErr error
		gormDB, openErr = openGORM(config, gormConfig)
		if openErr != nil {
			log.Fatalf("打开数据库失败: %v", openErr)
		}

		// 配置连接池
		sqlDB, err := gormDB.DB()
		if err != nil {
			log.Fatalf("获取底层 sql.DB 失败: %v", err)
		}
		sqlDB.SetMaxOpenConns(config.MaxOpenConns)
		sqlDB.SetMaxIdleConns(config.MaxIdleConns)
		sqlDB.SetConnMaxLifetime(config.MaxLifetime)
		sqlDB.SetConnMaxIdleTime(config.MaxIdleTime)

		if err := sqlDB.Ping(); err != nil {
			log.Fatalf("数据库连接测试失败: %v", err)
		}

		// 自动迁移数据库表结构
		if err := AutoMigrate(gormDB); err != nil {
			log.Fatalf("数据库迁移失败: %v", err)
		}

		// 创建/校验关键索引；如存在历史重复数据，可按配置自动去重后重试
		ensureOptimizedIndexes(gormDB, config)

		// 打印配置信息
		config.PrintConfig()
		log.Printf("数据库连接成功并完成表结构迁移 (driver=%s)", config.Driver)

		// 启动连接健康检查（可关闭）
		dbHealthCtx, dbHealthCancel = context.WithCancel(context.Background())
		go startConnectionHealthCheck(dbHealthCtx)
	})
	return gormDB
}

// openGORM 根据 driver 打开 GORM 实例。
// SQLite 走 sql.Open + gormsqlite.Dialector{Conn} 以保留对底层 *sql.DB 的控制;
// PG 走 gormpg.Open(dsn) 让 driver 自己管理 pgx 注册。
// 抽出来是为了让 Setup 路由也能复用同一段初始化逻辑。
func openGORM(config DBConfig, gormConfig *gorm.Config) (*gorm.DB, error) {
	switch config.Driver {
	case dialect.NameSQLite, "sqlite3":
		dsn := config.BuildSQLiteDSN()
		sqlDB, err := sql.Open("sqlite", dsn)
		if err != nil {
			return nil, fmt.Errorf("打开 SQLite 失败: %v", err)
		}
		return gorm.Open(gormsqlite.Dialector{Conn: sqlDB}, gormConfig)

	case dialect.NamePostgres, "postgresql", "pg":
		dsn := config.BuildPostgresDSN()
		return OpenAndPingPostgres(dsn, gormConfig)
	}
	return nil, fmt.Errorf("不支持的 driver: %q", config.Driver)
}

// OpenAndPingPostgres 打开一个 PostgreSQL GORM 连接并立刻 ping 一次。
// 若 PG 服务器缺少对应 tzdata(常见于 alpine / distroless 精简镜像)
// 而拒绝 DSN 中的 TimeZone,自动把 TimeZone 剥掉重试一次,避免用户被浏览器
// 默认填充的 IANA 时区(比如 Asia/Shanghai) 在最小化镜像里卡死。
// setup 阶段与 Ready 阶段共用同一入口,保证 .env 落盘的 PG_TIMEZONE 不会导致下次启动崩溃。
func OpenAndPingPostgres(dsn string, gormConfig *gorm.Config) (*gorm.DB, error) {
	attemptDSN := dsn
	for attempt := 0; attempt < 2; attempt++ {
		gormDB, err := gorm.Open(gormpg.Open(attemptDSN), gormConfig)
		if err != nil {
			if attempt == 0 && isUnknownTimeZoneErr(err) {
				attemptDSN = stripTimeZoneFromDSN(dsn)
				applog.Warnf("[DB]PostgreSQL 拒绝 DSN 中的 TimeZone,回退到服务器默认时区: %v", err)
				continue
			}
			return nil, err
		}
		sqlDB, err := gormDB.DB()
		if err != nil {
			return nil, err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		pingErr := sqlDB.PingContext(ctx)
		cancel()
		if pingErr == nil {
			return gormDB, nil
		}
		_ = sqlDB.Close()
		if attempt == 0 && isUnknownTimeZoneErr(pingErr) {
			attemptDSN = stripTimeZoneFromDSN(dsn)
			applog.Warnf("[DB]PostgreSQL 拒绝 DSN 中的 TimeZone,回退到服务器默认时区: %v", pingErr)
			continue
		}
		return nil, pingErr
	}
	return nil, fmt.Errorf("PostgreSQL 连接失败")
}

func isUnknownTimeZoneErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unknown time zone") ||
		strings.Contains(msg, "invalid value for parameter \"timezone\"")
}

// stripTimeZoneFromDSN 去掉 keyword=value 形式 DSN 里的 TimeZone / time_zone 段。
func stripTimeZoneFromDSN(dsn string) string {
	parts := strings.Fields(dsn)
	kept := parts[:0]
	for _, p := range parts {
		if idx := strings.IndexByte(p, '='); idx > 0 {
			key := strings.ToLower(p[:idx])
			if key == "timezone" || key == "time_zone" {
				continue
			}
		}
		kept = append(kept, p)
	}
	return strings.Join(kept, " ")
}

// resolveLogLevel 把字符串日志级别映射到 GORM logger 级别。
func resolveLogLevel(s string) logger.LogLevel {
	switch s {
	case "silent":
		return logger.Silent
	case "error":
		return logger.Error
	case "warn":
		return logger.Warn
	case "info":
		return logger.Info
	default:
		return logger.Info
	}
}

// ensureOptimizedIndexes 创建关键索引以降低聚合扫描成本
// 注意：对于 UNIQUE 索引，如果表内已存在重复数据，创建会失败；这里仅记录日志，不做数据删除。
func ensureOptimizedIndexes(db *gorm.DB, config DBConfig) {
	type indexStmt struct {
		name string
		sql  string
	}

	// 先创建非 UNIQUE 索引（对重复数据不敏感）
	stmts := []indexStmt{
		// service_history: API 查询 + 小时聚合所需
		{
			name: "idx_service_history_instance_time",
			sql:  "CREATE INDEX IF NOT EXISTS idx_service_history_instance_time ON service_history(instance_id, record_time)",
		},
		{
			name: "idx_service_history_endpoint_instance_time",
			sql:  "CREATE INDEX IF NOT EXISTS idx_service_history_endpoint_instance_time ON service_history(endpoint_id, instance_id, record_time)",
		},
		// traffic_hourly_summary: 帮助按小时清理/查询（不影响唯一性）
		{
			name: "idx_traffic_hourly_summary_hour_time",
			sql:  "CREATE INDEX IF NOT EXISTS idx_traffic_hourly_summary_hour_time ON traffic_hourly_summary(hour_time)",
		},
	}

	for _, stmt := range stmts {
		if err := db.Exec(stmt.sql).Error; err != nil {
			applog.Warnf("[DB]创建索引 %s 失败（可能存在重复数据或锁冲突）: %v", stmt.name, err)
		} else {
			applog.Debugf("[DB]索引已就绪: %s", stmt.name)
		}
	}

	// 再尝试创建 UNIQUE 索引：失败时可选择自动去重并重试
	uniqueName := "uniq_traffic_hourly_summary_hour_endpoint_instance"
	uniqueSQL := "CREATE UNIQUE INDEX IF NOT EXISTS uniq_traffic_hourly_summary_hour_endpoint_instance ON traffic_hourly_summary(hour_time, endpoint_id, instance_id)"
	if err := db.Exec(uniqueSQL).Error; err != nil {
		applog.Warnf("[DB]创建索引 %s 失败（可能存在重复数据或锁冲突）: %v", uniqueName, err)
		if config.AutoDedup && stringContains(err.Error(), "UNIQUE constraint failed") {
			applog.Warnf("[DB]检测到 traffic_hourly_summary 存在重复 key，准备自动去重后重试创建唯一索引（可用 DB_AUTO_DEDUP=false 关闭）")
			if dedupErr := dedupTrafficHourlySummary(db); dedupErr != nil {
				applog.Errorf("[DB]自动去重 traffic_hourly_summary 失败: %v", dedupErr)
				return
			}
			if retryErr := db.Exec(uniqueSQL).Error; retryErr != nil {
				applog.Errorf("[DB]去重后仍无法创建索引 %s: %v", uniqueName, retryErr)
				return
			}
			applog.Infof("[DB]去重完成，唯一索引已创建: %s", uniqueName)
		}
	} else {
		applog.Debugf("[DB]索引已就绪: %s", uniqueName)
	}
}

func dedupTrafficHourlySummary(db *gorm.DB) error {
	start := time.Now()

	// 去重：每个 (hour_time, endpoint_id, instance_id) 保留最大 id 的一条
	// 说明：该语句会扫描表一次；在启动期执行可避免要求用户手工执行修复命令。
	res := db.Exec(`
		DELETE FROM traffic_hourly_summary
		WHERE id NOT IN (
			SELECT MAX(id)
			FROM traffic_hourly_summary
			GROUP BY hour_time, endpoint_id, instance_id
		)
	`)
	if res.Error != nil {
		return res.Error
	}

	applog.Infof("[DB]traffic_hourly_summary 自动去重完成，删除 %d 行，耗时 %v", res.RowsAffected, time.Since(start))
	return nil
}

// startConnectionHealthCheck 启动连接健康检查（支持优雅关闭）
func startConnectionHealthCheck(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second) // 每30秒检查一次
	defer ticker.Stop()

	var lastWaitCount int64
	var lastWaitDuration time.Duration

	for {
		select {
		case <-ctx.Done():
			log.Printf("健康检查：收到停止信号，退出健康检查")
			return
		case <-ticker.C:
		}

		if gormDB == nil {
			continue
		}

		sqlDB, err := gormDB.DB()
		if err != nil {
			log.Printf("健康检查：获取sql.DB失败: %v", err)
			continue
		}

		if err := sqlDB.Ping(); err != nil {
			log.Printf("健康检查：数据库连接异常: %v", err)
			// 如果数据库已关闭，自动退出健康检查，避免反复刷日志并阻止进程退出
			if strings.Contains(err.Error(), "database is closed") {
				log.Printf("健康检查：检测到数据库已关闭，停止健康检查协程")
				return
			}
		}

		// 检查连接池状态
		stats := sqlDB.Stats()

		// 对于 SQLite 默认 MaxOpenConnections=1，OpenConnections=1 属于正常现象；
		// 仅在出现等待（WaitCount 增长）时提示可能存在锁竞争或长事务。
		if stats.MaxOpenConnections <= 1 {
			if stats.WaitCount > lastWaitCount || stats.WaitDuration > lastWaitDuration {
				log.Printf("警告：连接池出现等待(可能存在长事务/锁竞争) open=%d in_use=%d idle=%d max=%d wait_count=%d wait_dur=%v",
					stats.OpenConnections, stats.InUse, stats.Idle, stats.MaxOpenConnections, stats.WaitCount, stats.WaitDuration)
			}
		} else if stats.OpenConnections > int(float64(stats.MaxOpenConnections)*0.8) {
			log.Printf("警告：连接池使用率较高 open=%d in_use=%d idle=%d max=%d wait_count=%d wait_dur=%v",
				stats.OpenConnections, stats.InUse, stats.Idle, stats.MaxOpenConnections, stats.WaitCount, stats.WaitDuration)
		}

		lastWaitCount = stats.WaitCount
		lastWaitDuration = stats.WaitDuration
	}
}

// AutoMigrate 自动迁移数据库表结构。
// 用方言安全的方式检测"endpoints"表是否存在,以决定走快速 / 标准迁移。
func AutoMigrate(db *gorm.DB) error {
	// 装配方言。setup 模式下 currentDialect 尚未初始化,此时按 driver 现场推断。
	d := currentDialect
	if d == nil {
		// 优先按 GORM 实际使用的 driver 选择,fallback 到 SQLite。
		switch db.Dialector.Name() {
		case dialect.NamePostgres:
			d = dialect.Postgres{}
		default:
			d = dialect.SQLite{}
		}
	}

	var tableCount int64
	db.Raw(d.TableExistsSQL("endpoints")).Scan(&tableCount)

	if tableCount == 0 {
		// 全新数据库，使用快速初始化
		return QuickInitSchema(db)
	}

	// 现有数据库，使用标准迁移
	return StandardMigrate(db)
}

// QuickInitSchema 快速初始化数据库表结构（适用于全新数据库）
func QuickInitSchema(db *gorm.DB) error {
	log.Println("检测到全新数据库，使用快速初始化模式")

	// 按照依赖关系顺序创建表
	return db.AutoMigrate(
		// 基础表
		&models.Endpoint{},
		&models.SystemConfig{},
		&models.UserSession{},
		&models.Group{},
		&models.OAuthUser{},

		// 依赖表
		&models.Tunnel{},
		&models.TunnelOperationLog{},
		&models.TunnelGroup{},

		// 流量统计表
		&models.TrafficHourlySummary{},
		&models.DashboardTrafficSummary{},
		&models.ServiceHistory{},

		// 服务管理表
		&models.Services{},
	)
}

// StandardMigrate 标准迁移（适用于现有数据库）
func StandardMigrate(db *gorm.DB) error {
	log.Println("检测到现有数据库，使用标准迁移模式")

	// 按照依赖关系顺序迁移表
	return db.AutoMigrate(
		// 基础表
		&models.Endpoint{},
		&models.SystemConfig{},
		&models.UserSession{},
		&models.Group{},
		&models.OAuthUser{},

		// 依赖表
		&models.Tunnel{},
		&models.TunnelOperationLog{},
		&models.TunnelGroup{},

		// 流量统计表
		&models.TrafficHourlySummary{},
		&models.DashboardTrafficSummary{},
		&models.ServiceHistory{},

		// 服务管理表
		&models.Services{},
	)
}

// Close 关闭数据库连接
func Close() error {
	if gormDB != nil {
		// 先停止健康检查协程
		if dbHealthCancel != nil {
			dbHealthCancel()
		}
		sqlDB, err := gormDB.DB()
		if err != nil {
			return err
		}
		return sqlDB.Close()
	}
	return nil
}

// retryCountForDialect 返回当前方言下的重试次数。
// SQLite 单写者模型下需要应对 "database is locked"/busy,保留 3 次指数退避;
// PG 走 MVCC,这些错误根本不会出现,1 次即可(不再重试浪费时间)。
func retryCountForDialect() int {
	if currentDialect != nil && currentDialect.Name() == dialect.NamePostgres {
		return 1
	}
	return 3
}

// ExecuteWithRetry 带重试机制的数据库执行（兼容旧接口）
// 方言敏感:SQLite 走 3 次指数退避,PG 走 1 次(直接返回错误)。
func ExecuteWithRetry(fn func(*gorm.DB) error) error {
	maxRetries := retryCountForDialect()
	baseDelay := 100 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		// 使用健康的数据库连接
		db := GetHealthyDB()
		err := fn(db)
		if err == nil {
			return nil
		}

		// 检查是否是可重试的错误
		if isRetryableError(err) && i < maxRetries-1 {
			// 指数退避策略
			delay := time.Duration(1<<uint(i)) * baseDelay
			log.Printf("数据库操作失败，%v后重试 (第%d次): %v", delay, i+1, err)
			time.Sleep(delay)
			continue
		}

		return err
	}
	return nil
}

// TxWithRetry 带重试机制的事务执行
// 方言敏感:SQLite 走 3 次指数退避,PG 走 1 次。
func TxWithRetry(fn func(*gorm.DB) error) error {
	maxRetries := retryCountForDialect()
	baseDelay := 100 * time.Millisecond

	for i := 0; i < maxRetries; i++ {
		// 使用健康的数据库连接
		db := GetHealthyDB()
		err := db.Transaction(fn)
		if err == nil {
			return nil
		}

		// 检查是否是可重试的错误
		if isRetryableError(err) && i < maxRetries-1 {
			// 指数退避策略
			delay := time.Duration(1<<uint(i)) * baseDelay
			log.Printf("数据库事务失败，%v后重试 (第%d次): %v", delay, i+1, err)
			time.Sleep(delay)
			continue
		}

		return err
	}
	return nil
}

// isRetryableError 检查是否是可重试的错误
func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	// SQLite常见的可重试错误
	return contains(errStr, "database is locked") ||
		contains(errStr, "busy") ||
		contains(errStr, "no such table") ||
		contains(errStr, "disk I/O error") ||
		contains(errStr, "database disk image is malformed") ||
		contains(errStr, "readonly database") ||
		contains(errStr, "out of memory") ||
		contains(errStr, "database or disk is full")
}

// contains 检查字符串是否包含子字符串
func contains(s, substr string) bool {
	return len(s) >= len(substr) &&
		stringContains(s, substr)
}

// stringContains 辅助函数，用于字符串包含检查
func stringContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// PingDB 检查数据库连接是否正常
func PingDB() error {
	db := GetDB()
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}

// GetHealthyDB 获取健康的数据库连接，如果连接有问题会尝试重新初始化
func GetHealthyDB() *gorm.DB {
	db := GetDB()

	// 先尝试ping检查连接
	sqlDB, err := db.DB()
	if err != nil {
		log.Printf("获取sql.DB失败，重新初始化连接: %v", err)
		once = sync.Once{} // 重置once，允许重新初始化
		return GetDB()
	}

	if err := sqlDB.Ping(); err != nil {
		log.Printf("数据库连接异常，重新初始化连接: %v", err)
		once = sync.Once{} // 重置once，允许重新初始化
		return GetDB()
	}

	return db
}

// --- 兼容旧版本的接口 ---

// DB 兼容旧版本的数据库获取接口（返回*gorm.DB而不是*sql.DB）
func DB() interface{} {
	return GetDB()
}

// InitSchema 兼容旧版本的初始化接口（现在由AutoMigrate替代）
func InitSchema() error {
	return AutoMigrate(GetDB())
}

// UpdateEndpointTunnelCount 异步更新端点的隧道计数，使用重试机制避免死锁
// 这是一个全局函数，可以被各个模块调用
func UpdateEndpointTunnelCount(endpointID int64) {
	go func() {
		time.Sleep(50 * time.Millisecond) // 稍作延迟避免并发冲突

		err := ExecuteWithRetry(func(db *gorm.DB) error {
			return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
				Update("tunnel_count", db.Model(&models.Tunnel{}).Where("endpoint_id = ?", endpointID).Count(nil)).Error
		})

		if err != nil {
			applog.Errorf("[DB]更新端点 %d 隧道计数失败: %v", endpointID, err)
		} else {
			applog.Debugf("[DB]端点 %d 隧道计数已更新", endpointID)
		}
	}()
}

// UpdateEndpointTunnelCountSync 同步更新端点的隧道计数，仅在必要时使用
func UpdateEndpointTunnelCountSync(endpointID int64) error {
	return ExecuteWithRetry(func(db *gorm.DB) error {
		return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
			Update("tunnel_count", db.Model(&models.Tunnel{}).Where("endpoint_id = ?", endpointID).Count(nil)).Error
	})
}

// ensureDir 确保目录存在，如果不存在则创建
func ensureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return os.MkdirAll(dir, 0755)
	}
	return nil
}

// handleDockerComposeMigration 处理 Docker Compose 配置迁移兼容性
// 这个函数确保从旧的 ./public:/app/public 映射迁移到新的 ./db:/app/db 映射时数据不丢失
func handleDockerComposeMigration() error {
	const (
		publicDir    = "public"
		dbDir        = "db"
		databaseFile = "database.db"
	)

	publicPath := filepath.Join(publicDir, databaseFile)
	dbPath := filepath.Join(dbDir, databaseFile)

	// 检查 public 文件夹是否存在
	publicDirInfo, err := os.Stat(publicDir)
	if os.IsNotExist(err) {
		// public 文件夹不存在，说明使用的是新配置，无需处理
		log.Printf("[数据库迁移] public 文件夹不存在，跳过迁移兼容性处理")
		return nil
	}

	if err != nil {
		return fmt.Errorf("检查 public 文件夹状态失败: %v", err)
	}

	if !publicDirInfo.IsDir() {
		return fmt.Errorf("public 路径存在但不是文件夹")
	}

	// 检查 public 文件夹中是否已经存在 database.db
	if _, err := os.Stat(publicPath); err == nil {
		// public/database.db 已存在，需要创建软链接到 db 文件夹
		log.Printf("[数据库迁移] 检测到 public/database.db，创建软链接到 db 文件夹")

		// 确保 db 目录存在
		if err := ensureDir(dbDir); err != nil {
			return fmt.Errorf("创建 db 目录失败: %v", err)
		}

		// 如果 db/database.db 已存在，先删除它（避免冲突）
		if _, err := os.Stat(dbPath); err == nil {
			if err := os.Remove(dbPath); err != nil {
				return fmt.Errorf("删除现有 db/database.db 失败: %v", err)
			}
			log.Printf("[数据库迁移] 已删除现有的 db/database.db")
		}

		// 创建软链接从 db/database.db 指向 public/database.db
		absPublicPath, err := filepath.Abs(publicPath)
		if err != nil {
			return fmt.Errorf("获取 public/database.db 绝对路径失败: %v", err)
		}

		if err := os.Symlink(absPublicPath, dbPath); err != nil {
			return fmt.Errorf("创建软链接 %s -> %s 失败: %v", dbPath, absPublicPath, err)
		}

		log.Printf("[数据库迁移] 成功创建软链接: %s -> %s", dbPath, absPublicPath)
		return nil
	}

	// public 文件夹存在但没有 database.db，检查是否为空
	entries, err := os.ReadDir(publicDir)
	if err != nil {
		return fmt.Errorf("读取 public 文件夹内容失败: %v", err)
	}

	// 检查 public 文件夹是否为空（或仅包含隐藏文件）
	isEmpty := true
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".") {
			isEmpty = false
			break
		}
	}

	if isEmpty {
		// public 文件夹为空，检查 db/database.db 是否存在
		if _, err := os.Stat(dbPath); err == nil {
			// db/database.db 存在，需要迁移
			log.Printf("[数据库迁移] 检测到 db/database.db，迁移到 public 文件夹")

			// 复制 db/database.db 到 public/database.db
			if err := copyFile(dbPath, publicPath); err != nil {
				return fmt.Errorf("复制数据库文件失败: %v", err)
			}
			log.Printf("[数据库迁移] 成功复制 %s -> %s", dbPath, publicPath)

			// 删除原来的 db/database.db
			if err := os.Remove(dbPath); err != nil {
				return fmt.Errorf("删除原 db/database.db 失败: %v", err)
			}
			log.Printf("[数据库迁移] 已删除原文件 %s", dbPath)

			// 创建软链接从 db/database.db 指向 public/database.db
			absPublicPath, err := filepath.Abs(publicPath)
			if err != nil {
				return fmt.Errorf("获取 public/database.db 绝对路径失败: %v", err)
			}

			if err := os.Symlink(absPublicPath, dbPath); err != nil {
				return fmt.Errorf("创建软链接 %s -> %s 失败: %v", dbPath, absPublicPath, err)
			}

			log.Printf("[数据库迁移] 成功创建软链接: %s -> %s", dbPath, absPublicPath)

			// 同时复制相关的 WAL 和 SHM 文件（如果存在）
			walPath := dbPath + "-wal"
			shmPath := dbPath + "-shm"
			publicWalPath := publicPath + "-wal"
			publicShmPath := publicPath + "-shm"

			if _, err := os.Stat(walPath); err == nil {
				if err := copyFile(walPath, publicWalPath); err != nil {
					log.Printf("[数据库迁移] 复制 WAL 文件失败: %v", err)
				} else {
					os.Remove(walPath) // 删除原文件
					if absWalPath, err := filepath.Abs(publicWalPath); err == nil {
						os.Symlink(absWalPath, walPath)
					}
					log.Printf("[数据库迁移] 成功迁移 WAL 文件")
				}
			}

			if _, err := os.Stat(shmPath); err == nil {
				if err := copyFile(shmPath, publicShmPath); err != nil {
					log.Printf("[数据库迁移] 复制 SHM 文件失败: %v", err)
				} else {
					os.Remove(shmPath) // 删除原文件
					if absShmPath, err := filepath.Abs(publicShmPath); err == nil {
						os.Symlink(absShmPath, shmPath)
					}
					log.Printf("[数据库迁移] 成功迁移 SHM 文件")
				}
			}

			return nil
		} else {
			// public 为空且 db/database.db 不存在，这是正常情况（全新安装）
			log.Printf("[数据库迁移] public 文件夹为空且无现有数据库，正常启动")
			return nil
		}
	} else {
		// public 文件夹不为空但没有 database.db，可能有其他文件，跳过处理
		log.Printf("[数据库迁移] public 文件夹非空但无 database.db，跳过迁移处理")
		return nil
	}
}

// copyFile 复制文件
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return err
	}

	// 确保数据写入磁盘
	return destFile.Sync()
}
