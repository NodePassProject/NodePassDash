package db

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"time"

	log "NodePassDash/internal/log"
)

// DBConfig SQLite数据库配置结构
type DBConfig struct {
	Database     string        // SQLite数据库文件路径
	MaxOpenConns int           // 最大打开连接数
	MaxIdleConns int           // 最大空闲连接数
	MaxLifetime  time.Duration // 连接最大生命周期
	MaxIdleTime  time.Duration // 空闲连接最大生命周期
	LogLevel     string        // 日志级别
	WALMode      bool          // 是否启用WAL模式
}

// GetDBConfig 获取数据库配置，支持多种来源
func GetDBConfig() DBConfig {
	config := DBConfig{
		// 默认值 - SQLite配置
		Database:     "public/database.db", // 默认数据库文件路径
		MaxOpenConns: 10,                   // SQLite推荐的连接数较小
		MaxIdleConns: 5,
		MaxLifetime:  5 * time.Minute,
		MaxIdleTime:  2 * time.Minute,
		LogLevel:     "silent",
		WALMode:      true, // 启用WAL模式以提高并发性能
	}

	// 1. 从命令行参数读取
	loadFromFlags(&config)

	// 2. 从环境变量读取（优先级更高）
	loadFromEnv(&config)

	// 3. 从配置文件读取（如果存在）
	loadFromFile(&config)

	// 验证配置
	if err := validateConfig(&config); err != nil {
		log.Errorf("数据库配置验证失败: %v", err)
		// 使用默认配置
	}

	log.Infof("数据库配置: %s", config.Database)
	return config
}

// loadFromFlags 从命令行参数加载配置
func loadFromFlags(config *DBConfig) {
	// 只有在flag已经解析后才读取值
	if !flag.Parsed() {
		return
	}

	// 读取已经解析的flag值
	if dbPath := flag.Lookup("db-path"); dbPath != nil {
		config.Database = dbPath.Value.String()
	}
	if dbMaxOpen := flag.Lookup("db-max-open"); dbMaxOpen != nil {
		if val, err := strconv.Atoi(dbMaxOpen.Value.String()); err == nil {
			config.MaxOpenConns = val
		}
	}
	if dbMaxIdle := flag.Lookup("db-max-idle"); dbMaxIdle != nil {
		if val, err := strconv.Atoi(dbMaxIdle.Value.String()); err == nil {
			config.MaxIdleConns = val
		}
	}
	if dbLogLevel := flag.Lookup("db-log-level"); dbLogLevel != nil {
		config.LogLevel = dbLogLevel.Value.String()
	}
	if dbWalMode := flag.Lookup("db-wal-mode"); dbWalMode != nil {
		config.WALMode = dbWalMode.Value.String() == "true"
	}
}

// loadFromEnv 从环境变量加载配置
func loadFromEnv(config *DBConfig) {
	if value := os.Getenv("DB_PATH"); value != "" {
		config.Database = value
	}

	// 数字类型的环境变量
	if value := os.Getenv("DB_MAX_OPEN_CONNS"); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			config.MaxOpenConns = intVal
		}
	}
	if value := os.Getenv("DB_MAX_IDLE_CONNS"); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			config.MaxIdleConns = intVal
		}
	}
	if value := os.Getenv("DB_MAX_LIFETIME"); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			config.MaxLifetime = duration
		}
	}
	if value := os.Getenv("DB_MAX_IDLE_TIME"); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			config.MaxIdleTime = duration
		}
	}
	if value := os.Getenv("DB_LOG_LEVEL"); value != "" {
		config.LogLevel = value
	}
	if value := os.Getenv("DB_WAL_MODE"); value != "" {
		config.WALMode = value == "true"
	}
}

// loadFromFile 从配置文件加载配置（简化实现）
func loadFromFile(config *DBConfig) {
	// 可以在这里实现从 .env 文件或其他配置文件读取
	// 为了简化，这里只是一个占位符

	// 示例：读取 .env 文件
	if _, err := os.Stat(".env"); err == nil {
		log.Info("检测到 .env 文件，建议使用环境变量替代")
	}
}

// validateConfig 验证配置的有效性
func validateConfig(config *DBConfig) error {
	if config.Database == "" {
		return fmt.Errorf("数据库文件路径不能为空")
	}
	if config.MaxOpenConns <= 0 {
		return fmt.Errorf("最大连接数必须大于0")
	}
	if config.MaxIdleConns <= 0 {
		return fmt.Errorf("最大空闲连接数必须大于0")
	}
	if config.MaxIdleConns > config.MaxOpenConns {
		return fmt.Errorf("最大空闲连接数不能超过最大连接数")
	}
	return nil
}

// BuildDSN 构建SQLite连接字符串
func (c *DBConfig) BuildDSN() string {
	// 构建基本DSN
	dsn := c.Database + "?_foreign_keys=on&_journal_mode=WAL"

	// 添加其他配置
	if !c.WALMode {
		dsn = c.Database + "?_foreign_keys=on"
	}

	return dsn
}

// PrintConfig 打印配置信息
func (c *DBConfig) PrintConfig() {
	log.Infof("SQLite数据库配置:")
	log.Infof("  数据库文件: %s", c.Database)
	log.Infof("  最大连接数: %d", c.MaxOpenConns)
	log.Infof("  最大空闲连接数: %d", c.MaxIdleConns)
	log.Infof("  连接生命周期: %v", c.MaxLifetime)
	log.Infof("  空闲超时: %v", c.MaxIdleTime)
	log.Infof("  日志级别: %s", c.LogLevel)
	log.Infof("  WAL模式: %v", c.WALMode)
}
