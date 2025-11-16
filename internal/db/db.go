package db

import (
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

	_ "github.com/mattn/go-sqlite3"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	gormDB *gorm.DB
	once   sync.Once
	// 用于控制数据库健康检查协程的关闭
	dbHealthCtx    context.Context
	dbHealthCancel context.CancelFunc
)

// GetDB 获取GORM数据库实例
func GetDB() *gorm.DB {
	// 处理 Docker Compose 配置迁移兼容性
	if err := handleDockerComposeMigration(); err != nil {
		log.Printf("[数据库迁移] Docker Compose 配置迁移失败: %v", err)
		// 迁移失败不阻止启动，但会记录错误
	}

	// 确保db目录存在
	dbDir := "db"
	if err := ensureDir(dbDir); err != nil {
		return nil
	}

	once.Do(func() {
		config := GetDBConfig(dbDir)
		var err error

		// 构建SQLite DSN
		dsn := config.BuildDSN()

		// 根据配置设置日志级别
		var logLevel logger.LogLevel
		switch config.LogLevel {
		case "silent":
			logLevel = logger.Silent
		case "error":
			logLevel = logger.Error
		case "warn":
			logLevel = logger.Warn
		case "info":
			logLevel = logger.Info
		default:
			logLevel = logger.Info
		}

		// GORM配置
		gormConfig := &gorm.Config{
			Logger: logger.Default.LogMode(logLevel),
			NowFunc: func() time.Time {
				return time.Now().Local()
			},
		}

		// 连接数据库 - 使用CGO SQLite驱动 (github.com/mattn/go-sqlite3)
		sqlDB, err := sql.Open("sqlite3", dsn)
		if err != nil {
			log.Fatalf("打开SQLite数据库失败: %v", err)
		}

		// 配置连接池（必须在创建GORM之前）
		sqlDB.SetMaxOpenConns(config.MaxOpenConns)
		sqlDB.SetMaxIdleConns(config.MaxIdleConns)
		sqlDB.SetConnMaxLifetime(config.MaxLifetime)
		sqlDB.SetConnMaxIdleTime(config.MaxIdleTime)

		// 测试连接并设置初始PRAGMA
		if err := sqlDB.Ping(); err != nil {
			log.Fatalf("数据库连接测试失败: %v", err)
		}

		gormDB, err = gorm.Open(sqlite.Dialector{
			Conn: sqlDB,
		}, gormConfig)
		if err != nil {
			log.Fatalf("连接SQLite数据库失败: %v", err)
		}

		// 连接池已配置，连接已测试

		// 自动迁移数据库表结构
		if err := AutoMigrate(gormDB); err != nil {
			log.Fatalf("数据库迁移失败: %v", err)
		}

		// 打印配置信息
		config.PrintConfig()
		log.Printf("SQLite数据库连接成功并完成表结构迁移")

		// 启动连接健康检查（可关闭）
		dbHealthCtx, dbHealthCancel = context.WithCancel(context.Background())
		go startConnectionHealthCheck(dbHealthCtx)
	})
	return gormDB
}

// startConnectionHealthCheck 启动连接健康检查（支持优雅关闭）
func startConnectionHealthCheck(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second) // 每30秒检查一次
	defer ticker.Stop()

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
		if stats.OpenConnections > int(float64(stats.MaxOpenConnections)*0.8) {
			log.Printf("警告：连接池使用率较高 %d/%d", stats.OpenConnections, stats.MaxOpenConnections)
		}
	}
}

// AutoMigrate 自动迁移数据库表结构
func AutoMigrate(db *gorm.DB) error {
	// 检查是否是全新数据库（没有任何表）
	var tableCount int64
	db.Raw("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").Scan(&tableCount)

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
		&models.TunnelRecycle{},
		&models.TunnelOperationLog{},
		&models.EndpointSSE{},
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
		&models.TunnelRecycle{},
		&models.TunnelOperationLog{},
		&models.EndpointSSE{},
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

// ExecuteWithRetry 带重试机制的数据库执行（兼容旧接口）
func ExecuteWithRetry(fn func(*gorm.DB) error) error {
	maxRetries := 3
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
func TxWithRetry(fn func(*gorm.DB) error) error {
	maxRetries := 3
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
