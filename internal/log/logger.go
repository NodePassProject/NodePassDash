package log

import (
	"strings"

	log "github.com/sirupsen/logrus"
)

// 统一的日志封装，底层使用 logrus。
//
// 提供 Info / Debug / Warn / Error 四个常用级别，
// 参数以 "key", value, ... 键值对形式传递，类似 slog。
// 例：
//     log.Info("启动服务", "port", 8080)
//     log.Error("数据库查询失败", "err", err)

// SetLogLevel 设置日志级别
func SetLogLevel(level string) error {
	level = strings.ToUpper(level)
	switch level {
	case "DEBUG":
		log.SetLevel(log.DebugLevel)
	case "INFO":
		log.SetLevel(log.InfoLevel)
	case "WARN", "WARNING":
		log.SetLevel(log.WarnLevel)
	case "ERROR":
		log.SetLevel(log.ErrorLevel)
	case "FATAL":
		log.SetLevel(log.FatalLevel)
	case "PANIC":
		log.SetLevel(log.PanicLevel)
	default:
		log.SetLevel(log.InfoLevel) // 默认为 INFO 级别
	}
	return nil
}

// parseFields 将可变参数转换为 logrus.Fields。
func parseFields(args []interface{}) log.Fields {
	fields := log.Fields{}
	for i := 0; i+1 < len(args); i += 2 {
		if k, ok := args[i].(string); ok {
			fields[k] = args[i+1]
		}
	}
	return fields
}

// Info 信息级别日志
func Info(msg string, args ...interface{}) {
	log.WithFields(parseFields(args)).Info(msg)
}

// Debug 调试级别日志
func Debug(msg string, args ...interface{}) {
	log.WithFields(parseFields(args)).Debug(msg)
}

// Warn 警告级别日志
func Warn(msg string, args ...interface{}) {
	log.WithFields(parseFields(args)).Warn(msg)
}

// Error 错误级别日志
func Error(msg string, args ...interface{}) {
	log.WithFields(parseFields(args)).Error(msg)
}

// Infof 使用 fmt 占位符格式化后输出，无额外字段
func Infof(format string, args ...interface{}) {
	log.Infof(format, args...)
}

// Debugf 使用 fmt 占位符格式化
func Debugf(format string, args ...interface{}) {
	log.Debugf(format, args...)
}

// Warnf 使用 fmt 占位符格式化
func Warnf(format string, args ...interface{}) {
	log.Warnf(format, args...)
}

// Errorf 使用 fmt 占位符格式化
func Errorf(format string, args ...interface{}) {
	log.Errorf(format, args...)
}

func init() {
	// 设置文本格式，带彩色和自定义时间格式
	log.SetFormatter(&log.TextFormatter{
		FullTimestamp:   true,
		TimestampFormat: "2006-01-02 15:04:05",
		ForceColors:     true,
	})
	log.SetLevel(log.DebugLevel)
}
