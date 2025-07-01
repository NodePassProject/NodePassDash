package log

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// FileLogger 文件日志管理器
type FileLogger struct {
	baseDir   string              // 日志根目录
	fileCache map[string]*os.File // 文件句柄缓存
	mu        sync.RWMutex        // 保护文件缓存的锁

	// 配置选项
	maxFileSize   int64         // 单个日志文件最大大小（字节）
	retentionDays int           // 日志保留天数
	flushInterval time.Duration // 自动刷新间隔
}

// NewFileLogger 创建文件日志管理器
func NewFileLogger(baseDir string) *FileLogger {
	fl := &FileLogger{
		baseDir:       baseDir,
		fileCache:     make(map[string]*os.File),
		maxFileSize:   100 * 1024 * 1024, // 默认100MB
		retentionDays: 7,                 // 默认保留7天
		flushInterval: 5 * time.Second,   // 默认5秒刷新一次
	}

	// 确保基础目录存在
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		Errorf("创建日志目录失败: %v", err)
	}

	// 启动定期刷新和清理
	go fl.startPeriodicTasks()

	return fl
}

// WriteLog 写入日志到文件
func (fl *FileLogger) WriteLog(endpointID int64, instanceID, logContent string) error {
	if logContent == "" {
		return nil
	}

	// 构造文件路径
	now := time.Now()
	fileName := fmt.Sprintf("%s.log", now.Format("2006-01-02"))
	filePath := filepath.Join(fl.baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID, fileName)

	// 确保目录存在
	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return fmt.Errorf("创建日志目录失败: %v", err)
	}

	// 获取或创建文件句柄
	file, err := fl.getOrCreateFile(filePath)
	if err != nil {
		return fmt.Errorf("获取日志文件失败: %v", err)
	}

	// 写入日志（带时间戳）
	timestamp := now.Format("2006-01-02 15:04:05")
	logLine := fmt.Sprintf("[%s] %s\n", timestamp, logContent)

	fl.mu.Lock()
	_, err = file.WriteString(logLine)
	fl.mu.Unlock()

	if err != nil {
		return fmt.Errorf("写入日志失败: %v", err)
	}

	return nil
}

// getOrCreateFile 获取或创建文件句柄
func (fl *FileLogger) getOrCreateFile(filePath string) (*os.File, error) {
	fl.mu.RLock()
	file, exists := fl.fileCache[filePath]
	fl.mu.RUnlock()

	if exists {
		return file, nil
	}

	fl.mu.Lock()
	defer fl.mu.Unlock()

	// 双重检查
	if file, exists := fl.fileCache[filePath]; exists {
		return file, nil
	}

	// 创建新文件
	file, err := os.OpenFile(filePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}

	fl.fileCache[filePath] = file
	return file, nil
}

// ReadLogs 读取指定端点和实例的日志
func (fl *FileLogger) ReadLogs(endpointID int64, instanceID string, date time.Time, limit int) ([]string, error) {
	fileName := fmt.Sprintf("%s.log", date.Format("2006-01-02"))
	filePath := filepath.Join(fl.baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID, fileName)

	// 检查文件是否存在
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return []string{}, nil
	}

	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("打开日志文件失败: %v", err)
	}
	defer file.Close()

	// 读取文件内容
	content, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("读取日志文件失败: %v", err)
	}

	// 按行分割并限制数量
	lines := []string{}
	for _, line := range []string{string(content)} {
		if line != "" {
			lines = append(lines, line)
			if limit > 0 && len(lines) >= limit {
				break
			}
		}
	}

	return lines, nil
}

// ReadRecentLogs 读取最近几天的日志
func (fl *FileLogger) ReadRecentLogs(endpointID int64, instanceID string, days int, limit int) ([]LogEntry, error) {
	var allEntries []LogEntry

	for i := 0; i < days; i++ {
		date := time.Now().AddDate(0, 0, -i)
		entries, err := fl.readLogsByDate(endpointID, instanceID, date)
		if err != nil {
			continue // 忽略单个文件的错误
		}
		allEntries = append(allEntries, entries...)

		if limit > 0 && len(allEntries) >= limit {
			break
		}
	}

	// 限制返回数量
	if limit > 0 && len(allEntries) > limit {
		allEntries = allEntries[:limit]
	}

	return allEntries, nil
}

// LogEntry 日志条目
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Content   string    `json:"content"`
	FilePath  string    `json:"filePath"`
}

// readLogsByDate 读取指定日期的日志
func (fl *FileLogger) readLogsByDate(endpointID int64, instanceID string, date time.Time) ([]LogEntry, error) {
	fileName := fmt.Sprintf("%s.log", date.Format("2006-01-02"))
	filePath := filepath.Join(fl.baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID, fileName)

	// 检查文件是否存在
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return []LogEntry{}, nil
	}

	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}

	// 解析日志行
	var entries []LogEntry
	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		// 尝试解析时间戳
		if len(line) > 20 && line[0] == '[' {
			timeStr := line[1:20]
			if timestamp, err := time.Parse("2006-01-02 15:04:05", timeStr); err == nil {
				entries = append(entries, LogEntry{
					Timestamp: timestamp,
					Content:   line[22:], // 跳过时间戳和"] "
					FilePath:  filePath,
				})
				continue
			}
		}

		// 如果解析失败，使用文件修改时间
		if stat, err := os.Stat(filePath); err == nil {
			entries = append(entries, LogEntry{
				Timestamp: stat.ModTime(),
				Content:   line,
				FilePath:  filePath,
			})
		}
	}

	return entries, nil
}

// startPeriodicTasks 启动定期任务
func (fl *FileLogger) startPeriodicTasks() {
	flushTicker := time.NewTicker(fl.flushInterval)
	cleanupTicker := time.NewTicker(24 * time.Hour) // 每天清理一次

	for {
		select {
		case <-flushTicker.C:
			fl.flushAll()
		case <-cleanupTicker.C:
			fl.cleanupOldLogs()
		}
	}
}

// flushAll 刷新所有文件缓存
func (fl *FileLogger) flushAll() {
	fl.mu.RLock()
	defer fl.mu.RUnlock()

	for _, file := range fl.fileCache {
		if file != nil {
			file.Sync()
		}
	}
}

// cleanupOldLogs 清理过期日志文件
func (fl *FileLogger) cleanupOldLogs() {
	cutoffDate := time.Now().AddDate(0, 0, -fl.retentionDays)
	deletedCount := 0

	err := filepath.Walk(fl.baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // 忽略错误，继续处理其他文件
		}

		if !info.IsDir() && filepath.Ext(path) == ".log" {
			// 从文件名提取日期
			baseName := filepath.Base(path)
			dateStr := baseName[:len(baseName)-4] // 去掉.log后缀

			if fileDate, err := time.Parse("2006-01-02", dateStr); err == nil {
				if fileDate.Before(cutoffDate) {
					// 关闭文件句柄（如果有的话）
					fl.closeFile(path)

					// 删除文件
					if err := os.Remove(path); err == nil {
						deletedCount++
						Debugf("删除过期日志文件: %s", path)
					} else {
						Warnf("删除日志文件失败: %s, err: %v", path, err)
					}
				}
			}
		}

		return nil
	})

	if err != nil {
		Errorf("清理日志文件时发生错误: %v", err)
	} else if deletedCount > 0 {
		Infof("清理完成，删除了 %d 个过期日志文件", deletedCount)
	}
}

// closeFile 关闭指定路径的文件句柄
func (fl *FileLogger) closeFile(filePath string) {
	fl.mu.Lock()
	defer fl.mu.Unlock()

	if file, exists := fl.fileCache[filePath]; exists {
		file.Close()
		delete(fl.fileCache, filePath)
	}
}

// ClearLogs 清空指定端点和实例的所有日志文件
func (fl *FileLogger) ClearLogs(endpointID int64, instanceID string) error {
	fl.mu.Lock()
	defer fl.mu.Unlock()

	// 构建实例日志目录路径
	instanceDir := filepath.Join(fl.baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID)

	// 检查目录是否存在
	if _, err := os.Stat(instanceDir); os.IsNotExist(err) {
		// 目录不存在，表示没有日志文件，直接返回成功
		return nil
	} else if err != nil {
		return fmt.Errorf("检查日志目录失败: %v", err)
	}

	// 关闭该实例的所有打开的文件句柄
	for path, file := range fl.fileCache {
		if strings.Contains(path, fmt.Sprintf("endpoint_%d", endpointID)) && strings.Contains(path, instanceID) {
			if file != nil {
				file.Close()
			}
			delete(fl.fileCache, path)
		}
	}

	// 删除目录下的所有 .log 文件
	entries, err := os.ReadDir(instanceDir)
	if err != nil {
		return fmt.Errorf("读取日志目录失败: %v", err)
	}

	var deletedCount int
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".log") {
			logPath := filepath.Join(instanceDir, entry.Name())
			if err := os.Remove(logPath); err != nil {
				Warnf("删除日志文件失败: %s, error: %v", logPath, err)
			} else {
				deletedCount++
			}
		}
	}

	Infof("已清空端点 %d 实例 %s 的 %d 个日志文件", endpointID, instanceID, deletedCount)
	return nil
}

// Close 关闭文件日志管理器
func (fl *FileLogger) Close() {
	fl.mu.Lock()
	defer fl.mu.Unlock()

	for path, file := range fl.fileCache {
		if file != nil {
			file.Close()
		}
		delete(fl.fileCache, path)
	}
}

// SetRetentionDays 设置日志保留天数
func (fl *FileLogger) SetRetentionDays(days int) {
	fl.retentionDays = days
	Infof("更新日志保留天数为: %d", days)
}

// TriggerCleanup 手动触发日志文件清理（公开方法）
func (fl *FileLogger) TriggerCleanup() {
	Infof("手动触发文件日志清理")
	fl.cleanupOldLogs()
}

// GetLogStats 获取日志统计信息
func (fl *FileLogger) GetLogStats() map[string]interface{} {
	totalFiles := 0
	totalSize := int64(0)
	oldestDate := time.Now()
	newestDate := time.Time{}

	err := filepath.Walk(fl.baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		if !info.IsDir() && filepath.Ext(path) == ".log" {
			totalFiles++
			totalSize += info.Size()

			// 从文件名提取日期
			baseName := filepath.Base(path)
			dateStr := baseName[:len(baseName)-4]

			if fileDate, err := time.Parse("2006-01-02", dateStr); err == nil {
				if fileDate.Before(oldestDate) {
					oldestDate = fileDate
				}
				if fileDate.After(newestDate) {
					newestDate = fileDate
				}
			}
		}

		return nil
	})

	stats := map[string]interface{}{
		"totalFiles":    totalFiles,
		"totalSize":     totalSize,
		"retentionDays": fl.retentionDays,
	}

	if err == nil && totalFiles > 0 {
		stats["oldestLogAge"] = time.Since(oldestDate).String()
		stats["newestLogAge"] = time.Since(newestDate).String()
	}

	return stats
}
