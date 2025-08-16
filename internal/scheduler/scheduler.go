package scheduler

import (
	"NodePassDash/internal/cleanup"
	"NodePassDash/internal/config"
	log "NodePassDash/internal/log"
	"context"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
)

// Scheduler 任务调度器
type Scheduler struct {
	db     *gorm.DB
	config *config.CleanupConfig

	// 清理管理器
	cleanupManager *cleanup.Manager

	// 转存管理器
	archiveManager *ArchiveManager

	// 任务管理
	tasks      map[string]*ScheduledTask
	tasksMutex sync.RWMutex

	// 上下文控制
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// 统计信息
	stats *SchedulerStats
}

// SchedulerStats 调度器统计信息
type SchedulerStats struct {
	mu sync.RWMutex

	TotalTaskRuns    int64     `json:"total_task_runs"`
	SuccessfulRuns   int64     `json:"successful_runs"`
	FailedRuns       int64     `json:"failed_runs"`
	LastRunTime      time.Time `json:"last_run_time"`
	NextScheduledRun time.Time `json:"next_scheduled_run"`

	// 任务执行统计
	CleanupRuns     int64 `json:"cleanup_runs"`
	ArchiveRuns     int64 `json:"archive_runs"`
	DeepCleanupRuns int64 `json:"deep_cleanup_runs"`

	// 错误统计
	LastErrorMessage string    `json:"last_error_message"`
	LastErrorTime    time.Time `json:"last_error_time"`
}

// ScheduledTask 调度任务
type ScheduledTask struct {
	Name       string
	CronExpr   string
	TaskFunc   func(context.Context) error
	LastRun    time.Time
	NextRun    time.Time
	RunCount   int64
	ErrorCount int64
	LastError  string
	IsRunning  bool
	mu         sync.RWMutex
}

// TaskType 任务类型
type TaskType string

const (
	TaskTypeCleanup     TaskType = "cleanup"
	TaskTypeArchive     TaskType = "archive"
	TaskTypeDeepCleanup TaskType = "deep_cleanup"
)

// NewScheduler 创建新的调度器
func NewScheduler(db *gorm.DB, config *config.CleanupConfig) *Scheduler {
	ctx, cancel := context.WithCancel(context.Background())

	s := &Scheduler{
		db:     db,
		config: config,
		ctx:    ctx,
		cancel: cancel,
		tasks:  make(map[string]*ScheduledTask),
		stats:  &SchedulerStats{},
	}

	// 初始化清理管理器
	s.cleanupManager = cleanup.NewManager(db, config)

	// 初始化转存管理器
	s.archiveManager = NewArchiveManager(db, config)

	return s
}

// Start 启动调度器
func (s *Scheduler) Start() error {
	if !s.config.Enabled {
		log.Info("数据清理和转存功能已禁用，跳过调度器启动")
		return nil
	}

	log.Info("=== 启动任务调度器 ===")

	// 注册默认任务
	s.registerDefaultTasks()

	// 启动任务调度循环
	s.wg.Add(1)
	go s.scheduleLoop()

	log.Infof("任务调度器已启动，注册了 %d 个任务", len(s.tasks))

	return nil
}

// registerDefaultTasks 注册默认的调度任务
func (s *Scheduler) registerDefaultTasks() {
	// 日常清理任务
	s.RegisterTask(&ScheduledTask{
		Name:     "DailyCleanup",
		CronExpr: s.config.ScheduleConfig.DailyCleanupCron,
		TaskFunc: s.executeDailyCleanup,
	})

	// 小时级转存任务
	s.RegisterTask(&ScheduledTask{
		Name:     "HourlyArchive",
		CronExpr: s.config.ScheduleConfig.HourlyArchiveCron,
		TaskFunc: s.executeHourlyArchive,
	})

	// 深度清理任务
	s.RegisterTask(&ScheduledTask{
		Name:     "DeepCleanup",
		CronExpr: s.config.ScheduleConfig.DeepCleanupCron,
		TaskFunc: s.executeDeepCleanup,
	})

	log.Info("已注册所有默认调度任务")
}

// RegisterTask 注册任务
func (s *Scheduler) RegisterTask(task *ScheduledTask) {
	s.tasksMutex.Lock()
	defer s.tasksMutex.Unlock()

	// 计算下次执行时间
	task.NextRun = s.calculateNextRun(task.CronExpr)
	s.tasks[task.Name] = task

	log.Infof("注册任务: %s, Cron: %s, 下次执行: %s",
		task.Name, task.CronExpr, task.NextRun.Format("2006-01-02 15:04:05"))
}

// scheduleLoop 调度循环
func (s *Scheduler) scheduleLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(1 * time.Minute) // 每分钟检查一次
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			log.Info("调度器收到停止信号")
			return
		case <-ticker.C:
			s.checkAndExecuteTasks()
		}
	}
}

// checkAndExecuteTasks 检查并执行到期的任务
func (s *Scheduler) checkAndExecuteTasks() {
	now := time.Now()

	s.tasksMutex.RLock()
	var tasksToRun []*ScheduledTask

	for _, task := range s.tasks {
		if now.After(task.NextRun) && !task.IsRunning {
			tasksToRun = append(tasksToRun, task)
		}
	}
	s.tasksMutex.RUnlock()

	// 执行到期的任务
	for _, task := range tasksToRun {
		s.executeTask(task)
	}
}

// executeTask 执行单个任务
func (s *Scheduler) executeTask(task *ScheduledTask) {
	task.mu.Lock()
	if task.IsRunning {
		task.mu.Unlock()
		return
	}
	task.IsRunning = true
	task.mu.Unlock()

	go func() {
		defer func() {
			task.mu.Lock()
			task.IsRunning = false
			task.LastRun = time.Now()
			task.NextRun = s.calculateNextRun(task.CronExpr)
			task.RunCount++
			task.mu.Unlock()
		}()

		log.Infof("开始执行任务: %s", task.Name)
		startTime := time.Now()

		// 设置任务超时
		taskCtx, cancel := context.WithTimeout(s.ctx, 30*time.Minute)
		defer cancel()

		// 执行任务
		err := task.TaskFunc(taskCtx)

		duration := time.Since(startTime)

		// 更新统计信息
		s.updateStats(func(stats *SchedulerStats) {
			stats.TotalTaskRuns++
			stats.LastRunTime = time.Now()

			if err != nil {
				stats.FailedRuns++
				stats.LastErrorMessage = err.Error()
				stats.LastErrorTime = time.Now()

				task.mu.Lock()
				task.ErrorCount++
				task.LastError = err.Error()
				task.mu.Unlock()

				log.Errorf("任务 %s 执行失败: %v, 耗时: %v", task.Name, err, duration)
			} else {
				stats.SuccessfulRuns++
				log.Infof("任务 %s 执行成功, 耗时: %v", task.Name, duration)
			}
		})
	}()
}

// 任务执行函数

// executeDailyCleanup 执行日常清理任务
func (s *Scheduler) executeDailyCleanup(ctx context.Context) error {
	log.Info("执行日常清理任务")

	s.updateStats(func(stats *SchedulerStats) {
		stats.CleanupRuns++
	})

	return s.cleanupManager.ExecuteScheduledCleanup()
}

// executeHourlyArchive 执行小时级转存任务
func (s *Scheduler) executeHourlyArchive(ctx context.Context) error {
	log.Info("执行小时级转存任务")

	s.updateStats(func(stats *SchedulerStats) {
		stats.ArchiveRuns++
	})

	return s.archiveManager.ExecuteHourlyArchive(ctx)
}

// executeDeepCleanup 执行深度清理任务
func (s *Scheduler) executeDeepCleanup(ctx context.Context) error {
	log.Info("执行深度清理任务")

	s.updateStats(func(stats *SchedulerStats) {
		stats.DeepCleanupRuns++
	})

	return s.cleanupManager.ExecuteDeepCleanup()
}

// calculateNextRun 计算下次执行时间（简化版 cron 解析）
func (s *Scheduler) calculateNextRun(cronExpr string) time.Time {
	now := time.Now()

	// 简化的 cron 解析，实际应用中应使用专门的 cron 库
	// 这里提供几个常见模式的支持
	switch cronExpr {
	case "0 30 3 * * *": // 每天 3:30
		next := time.Date(now.Year(), now.Month(), now.Day(), 3, 30, 0, 0, now.Location())
		if now.After(next) {
			next = next.AddDate(0, 0, 1)
		}
		return next

	case "0 0 * * * *": // 每小时整点
		next := time.Date(now.Year(), now.Month(), now.Day(), now.Hour()+1, 0, 0, 0, now.Location())
		return next

	case "0 0 2 * * 0": // 每周日 2:00
		next := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, now.Location())
		// 找到下一个周日
		for next.Weekday() != time.Sunday || now.After(next) {
			next = next.AddDate(0, 0, 1)
		}
		return next

	default:
		// 默认1小时后执行
		return now.Add(1 * time.Hour)
	}
}

// ExecuteStartupCleanup 执行启动清理
func (s *Scheduler) ExecuteStartupCleanup() error {
	if !s.config.Enabled {
		return nil
	}

	log.Info("执行启动清理")
	return s.cleanupManager.ExecuteStartupCleanup()
}

// GetStats 获取调度器统计信息
func (s *Scheduler) GetStats() map[string]interface{} {
	s.stats.mu.RLock()
	defer s.stats.mu.RUnlock()

	// 获取任务信息
	s.tasksMutex.RLock()
	taskStats := make([]map[string]interface{}, 0, len(s.tasks))
	for _, task := range s.tasks {
		task.mu.RLock()
		taskStats = append(taskStats, map[string]interface{}{
			"name":        task.Name,
			"cron_expr":   task.CronExpr,
			"last_run":    task.LastRun.Format("2006-01-02 15:04:05"),
			"next_run":    task.NextRun.Format("2006-01-02 15:04:05"),
			"run_count":   task.RunCount,
			"error_count": task.ErrorCount,
			"last_error":  task.LastError,
			"is_running":  task.IsRunning,
		})
		task.mu.RUnlock()
	}
	s.tasksMutex.RUnlock()

	return map[string]interface{}{
		"scheduler": map[string]interface{}{
			"total_task_runs":    s.stats.TotalTaskRuns,
			"successful_runs":    s.stats.SuccessfulRuns,
			"failed_runs":        s.stats.FailedRuns,
			"last_run_time":      s.stats.LastRunTime.Format("2006-01-02 15:04:05"),
			"next_scheduled_run": s.stats.NextScheduledRun.Format("2006-01-02 15:04:05"),
			"cleanup_runs":       s.stats.CleanupRuns,
			"archive_runs":       s.stats.ArchiveRuns,
			"deep_cleanup_runs":  s.stats.DeepCleanupRuns,
			"last_error_message": s.stats.LastErrorMessage,
			"last_error_time":    s.stats.LastErrorTime.Format("2006-01-02 15:04:05"),
		},
		"tasks":           taskStats,
		"cleanup_manager": s.cleanupManager.GetStats(),
		"archive_manager": s.archiveManager.GetStats(),
	}
}

// updateStats 线程安全地更新统计信息
func (s *Scheduler) updateStats(updater func(*SchedulerStats)) {
	s.stats.mu.Lock()
	defer s.stats.mu.Unlock()
	updater(s.stats)
}

// Close 关闭调度器
func (s *Scheduler) Close() {
	log.Info("正在关闭任务调度器")

	// 停止调度循环
	s.cancel()
	s.wg.Wait()

	// 关闭清理管理器
	if s.cleanupManager != nil {
		s.cleanupManager.Close()
	}

	// 关闭转存管理器
	if s.archiveManager != nil {
		s.archiveManager.Close()
	}

	log.Info("任务调度器已关闭")
}

// ForceExecuteTask 强制执行指定任务（用于测试和手动触发）
func (s *Scheduler) ForceExecuteTask(taskName string) error {
	s.tasksMutex.RLock()
	task, exists := s.tasks[taskName]
	s.tasksMutex.RUnlock()

	if !exists {
		return fmt.Errorf("任务 %s 不存在", taskName)
	}

	log.Infof("强制执行任务: %s", taskName)
	s.executeTask(task)

	return nil
}

// GetArchiveManager 获取转存管理器
func (s *Scheduler) GetArchiveManager() *ArchiveManager {
	return s.archiveManager
}
