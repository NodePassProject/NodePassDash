package api

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"NodePassDash/internal/db"
	"NodePassDash/internal/db/dialect"

	"github.com/gin-gonic/gin"
	"github.com/mattn/go-ieproxy"
)

// ProgressEvent 更新进度事件，推送给 SSE 订阅者
type ProgressEvent struct {
	Level   string `json:"level"`   // info / success / warning / error / complete
	Message string `json:"message"` // 人类可读消息
	Percent int    `json:"percent"` // -1 表示无进度，0-100 表示下载百分比
}

// VersionHandler 版本相关处理器
type VersionHandler struct {
	mu             sync.Mutex
	restartPending bool   // 二进制已替换完成,等待用户触发重启
	pendingVersion string // 已替换待生效的版本号

	subsMu sync.RWMutex
	subs   map[string]chan ProgressEvent // SSE 订阅者
}

// NewVersionHandler 创建版本处理器
func NewVersionHandler() *VersionHandler {
	return &VersionHandler{
		subs: make(map[string]chan ProgressEvent),
	}
}

// subscribe 注册一个 SSE 订阅者，返回 id 与只读 channel
func (h *VersionHandler) subscribe() (string, <-chan ProgressEvent) {
	id := fmt.Sprintf("%d", time.Now().UnixNano())
	ch := make(chan ProgressEvent, 128)
	h.subsMu.Lock()
	h.subs[id] = ch
	h.subsMu.Unlock()
	return id, ch
}

// unsubscribe 注销订阅者
func (h *VersionHandler) unsubscribe(id string) {
	h.subsMu.Lock()
	if ch, ok := h.subs[id]; ok {
		close(ch)
		delete(h.subs, id)
	}
	h.subsMu.Unlock()
}

// broadcast 向所有 SSE 订阅者推送事件（不阻塞）
func (h *VersionHandler) broadcast(evt ProgressEvent) {
	h.subsMu.RLock()
	defer h.subsMu.RUnlock()
	for _, ch := range h.subs {
		select {
		case ch <- evt:
		default: // 缓冲满则丢弃，不阻塞更新流程
		}
	}
}

// markRestartPending 在更新成功后调用
func (h *VersionHandler) markRestartPending(version string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.restartPending = true
	h.pendingVersion = version
}

// getRestartPending 当前是否有待重启的版本
func (h *VersionHandler) getRestartPending() (bool, string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.restartPending, h.pendingVersion
}

// VersionInfo 版本信息结构
type VersionInfo struct {
	Current        string `json:"current"`
	GoVersion      string `json:"goVersion"`
	OS             string `json:"os"`
	Arch           string `json:"arch"`
	BuildTime      string `json:"buildTime,omitempty"`
	RestartPending bool   `json:"restartPending,omitempty"`
	PendingVersion string `json:"pendingVersion,omitempty"`
}

// GitHubRelease GitHub 发布信息结构
type GitHubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
	HtmlUrl     string    `json:"html_url"`
	Prerelease  bool      `json:"prerelease"`
	Draft       bool      `json:"draft"`
}

// UpdateInfo 更新信息结构
type UpdateInfo struct {
	Current         VersionInfo    `json:"current"`
	Stable          *GitHubRelease `json:"stable,omitempty"`
	Beta            *GitHubRelease `json:"beta,omitempty"`
	HasStableUpdate bool           `json:"hasStableUpdate"`
	HasBetaUpdate   bool           `json:"hasBetaUpdate"`
}

// UpdateResult 更新结果结构
type UpdateResult struct {
	Success    bool   `json:"success"`
	Message    string `json:"message"`
	NeedReboot bool   `json:"needReboot"`
}

// DeploymentInfo 部署信息结构
type DeploymentInfo struct {
	Method        string                 `json:"method"`        // "docker", "binary", "unknown"
	CanUpdate     bool                   `json:"canUpdate"`     // 是否支持自动更新
	UpdateInfo    string                 `json:"updateInfo"`    // 更新说明
	ManualUpdate  string                 `json:"manualUpdate"`  // 手动更新说明
	HasDockerPerm bool                   `json:"hasDockerPerm"` // 是否有Docker权限（仅Docker环境）
	Environment   string                 `json:"environment"`   // "container", "host", "unknown"
	Details       string                 `json:"details"`       // 详细说明
	DebugInfo     map[string]interface{} `json:"debugInfo"`     // 调试信息
}

// Version 会从 main 包传入的版本号（构建时注入）
var Version = "dev"

// 设置版本号（由 main 包调用）
func SetVersion(version string) {
	Version = version
}

// setupVersionRoutes 设置版本相关路由
func SetupVersionRoutes(rg *gin.RouterGroup, version string) {
	// 设置版本号
	SetVersion(version)

	// 创建VersionHandler实例
	versionHandler := NewVersionHandler()

	// 版本相关路由
	rg.GET("/version/current", versionHandler.HandleGetCurrentVersion)
	rg.GET("/version/check-update", versionHandler.HandleCheckUpdate)
	rg.GET("/version/update-info", versionHandler.HandleGetUpdateInfo)
	rg.GET("/version/history", versionHandler.HandleGetReleaseHistory)
	rg.GET("/version/deployment-info", versionHandler.HandleGetDeploymentInfo)
	rg.GET("/version/db-info", versionHandler.HandleGetDBInfo)
	rg.POST("/version/auto-update", versionHandler.HandleAutoUpdate)
	rg.POST("/version/restart", versionHandler.HandleRestart)

	// SSE 实时进度推送（路径匹配 /api/sse/* 以支持 query param token 认证）
	rg.GET("/sse/version-progress", versionHandler.HandleUpdateProgress)
}

// HandleUpdateProgress 以 SSE 方式实时推送更新进度
func (h *VersionHandler) HandleUpdateProgress(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // 禁止 nginx 缓冲

	id, ch := h.subscribe()
	defer h.unsubscribe(id)

	c.Status(http.StatusOK)

	for {
		select {
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(evt)
			if err != nil {
				continue
			}
			fmt.Fprintf(c.Writer, "data: %s\n\n", data)
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}

// DBInfo 数据库信息结构
type DBInfo struct {
	Driver   string `json:"driver"`             // "sqlite" | "postgres"
	Version  string `json:"version"`            // 数据库服务端版本字符串
	Database string `json:"database"`           // SQLite 文件路径或 PG 库名
	Size     int64  `json:"size"`               // 字节数，仅 SQLite 有效
	SizeText string `json:"sizeText"`           // 人类可读大小
	Host     string `json:"host,omitempty"`     // PG host:port
	WALMode  *bool  `json:"walMode,omitempty"`  // SQLite WAL 模式
	Tables   int64  `json:"tables"`             // 表数量
}

// HandleGetDBInfo 返回当前数据库的简单信息
func (h *VersionHandler) HandleGetDBInfo(c *gin.Context) {
	info := DBInfo{
		Driver: db.Dialect().Name(),
	}

	gdb := db.GetDB()
	if gdb != nil {
		var version string
		if err := gdb.Raw(db.Dialect().VersionSQL()).Scan(&version).Error; err == nil {
			info.Version = strings.TrimSpace(version)
		}
		var tables int64
		switch info.Driver {
		case dialect.NameSQLite:
			gdb.Raw("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").Scan(&tables)
		case dialect.NamePostgres:
			gdb.Raw("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'").Scan(&tables)
		}
		info.Tables = tables
	}

	cfg := db.GetDBConfig("db")
	switch info.Driver {
	case dialect.NameSQLite:
		info.Database = cfg.Database
		wal := cfg.WALMode
		info.WALMode = &wal
		if st, err := os.Stat(cfg.Database); err == nil {
			info.Size = st.Size()
			// 同时算上 WAL / SHM 文件
			for _, suffix := range []string{"-wal", "-shm"} {
				if st2, err := os.Stat(cfg.Database + suffix); err == nil {
					info.Size += st2.Size()
				}
			}
			info.SizeText = humanSize(info.Size)
		}
	case dialect.NamePostgres:
		info.Database = cfg.PostgresDatabase
		info.Host = fmt.Sprintf("%s:%d", cfg.PostgresHost, cfg.PostgresPort)
		if gdb != nil {
			var sz int64
			if err := gdb.Raw("SELECT pg_database_size(current_database())").Scan(&sz).Error; err == nil {
				info.Size = sz
				info.SizeText = humanSize(sz)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    info,
	})
}

func humanSize(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	units := []string{"KB", "MB", "GB", "TB"}
	if exp >= len(units) {
		exp = len(units) - 1
	}
	return fmt.Sprintf("%.2f %s", float64(b)/float64(div), units[exp])
}

// HandleGetCurrentVersion 获取当前版本信息
func (h *VersionHandler) HandleGetCurrentVersion(c *gin.Context) {
	pending, pendingVer := h.getRestartPending()
	versionInfo := VersionInfo{
		Current:        Version,
		GoVersion:      runtime.Version(),
		OS:             runtime.GOOS,
		Arch:           runtime.GOARCH,
		RestartPending: pending,
		PendingVersion: pendingVer,
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    versionInfo,
	})
}

// HandleCheckUpdate 检查更新
func (h *VersionHandler) HandleCheckUpdate(c *gin.Context) {
	current := VersionInfo{
		Current:   Version,
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
	}

	// 获取所有发布信息（check-update 端点不走更新流程，直接用空 proxy 让请求走系统代理或直连）
	releases, err := h.getReleaseHistory("")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("获取版本信息失败: %v", err),
		})
		return
	}

	var stableRelease, betaRelease *GitHubRelease

	// 分离稳定版和测试版
	for _, release := range releases {
		if release.Draft {
			continue // 跳过草稿版本
		}
		
		if release.Prerelease {
			// 这是测试版
			if betaRelease == nil {
				betaRelease = &release
			}
		} else {
			// 这是稳定版
			if stableRelease == nil {
				stableRelease = &release
			}
		}
		
		// 如果都找到了，可以提前结束
		if stableRelease != nil && betaRelease != nil {
			break
		}
	}

	// 检查是否有更新
	hasStableUpdate := false
	hasBetaUpdate := false

	if stableRelease != nil {
		hasStableUpdate = h.compareVersions(Version, stableRelease.TagName)
	}

	if betaRelease != nil {
		hasBetaUpdate = h.compareVersions(Version, betaRelease.TagName)
	}

	updateInfo := UpdateInfo{
		Current:         current,
		Stable:          stableRelease,
		Beta:            betaRelease,
		HasStableUpdate: hasStableUpdate,
		HasBetaUpdate:   hasBetaUpdate,
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    updateInfo,
	})
}

// HandleGetDeploymentInfo 获取部署信息
func (h *VersionHandler) HandleGetDeploymentInfo(c *gin.Context) {
	deployInfo := h.detectDeploymentMethod()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    deployInfo,
	})
}

// HandleAutoUpdate 自动更新
func (h *VersionHandler) HandleAutoUpdate(c *gin.Context) {
	// 检测部署方式
	deployInfo := h.detectDeploymentMethod()

	if !deployInfo.CanUpdate {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "当前部署方式不支持自动更新",
		})
		return
	}

	// 解析请求体获取更新通道（stable / beta）
	var req struct {
		Type string `json:"type"`
	}
	_ = c.ShouldBindJSON(&req)
	releaseType := strings.ToLower(strings.TrimSpace(req.Type))
	if releaseType != "beta" {
		releaseType = "stable"
	}

	// 立即响应请求，避免阻塞
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新命令已提交，请查看服务器日志了解更新进度",
	})

	// 异步执行更新，输出日志到控制台
	go func() {
		h.performUpdateWithLogs(deployInfo, releaseType)
	}()
}

// performUpdateWithLogs 执行更新并推送日志
func (h *VersionHandler) performUpdateWithLogs(deploymentInfo DeploymentInfo, releaseType string) {
	h.logUpdateProgress("info", fmt.Sprintf("开始执行自动更新 (channel: %s)...", releaseType))

	// 探测可用下载代理（先于 API 请求，以便 API 也可走代理）
	proxy := h.selectProxy()

	// 选择目标版本
	latest, err := h.selectReleaseByType(releaseType, proxy)
	if err != nil {
		h.logUpdateProgress("error", fmt.Sprintf("获取目标版本失败: %v", err))
		h.logUpdateProgress("complete", "更新流程结束")
		return
	}
	h.logUpdateProgress("info", fmt.Sprintf("目标版本: %s", latest.TagName))

	var result UpdateResult
	switch deploymentInfo.Method {
	case "docker", "binary":
		result = h.performBinaryReplace(latest, deploymentInfo.Method == "docker", proxy)
	default:
		result = UpdateResult{Success: false, Message: "不支持的部署方式"}
	}

	if result.Success {
		h.logUpdateProgress("success", result.Message)
	} else {
		h.logUpdateProgress("error", fmt.Sprintf("更新失败: %s", result.Message))
	}

	h.logUpdateProgress("complete", "更新流程结束")
}

// HandleRestart 触发进程退出,由 supervisor / Docker restart 策略加载新版本
func (h *VersionHandler) HandleRestart(c *gin.Context) {
	pending, _ := h.getRestartPending()
	if !pending {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "没有待重启的更新,请先执行自动更新",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "重启指令已接受,进程即将退出",
	})

	// 300ms 足够让 HTTP 响应写入 TCP 缓冲区后再退出
	go func() {
		time.Sleep(300 * time.Millisecond)
		h.logUpdateProgress("info", "用户触发重启,进程即将退出以加载新版本...")
		os.Exit(0)
	}()
}

// selectReleaseByType 根据通道(stable/beta)选择对应的 release
func (h *VersionHandler) selectReleaseByType(releaseType, proxy string) (*GitHubRelease, error) {
	if releaseType == "beta" {
		releases, err := h.getReleaseHistory(proxy)
		if err != nil {
			return nil, err
		}
		for i := range releases {
			r := releases[i]
			if r.Draft {
				continue
			}
			if r.Prerelease {
				return &r, nil
			}
		}
		return nil, fmt.Errorf("未找到可用的测试版")
	}
	return h.getLatestRelease(proxy)
}

// logUpdateProgress 输出更新进度日志并推送给 SSE 订阅者
// percent 可选，-1 表示无进度值，0-100 表示下载百分比
func (h *VersionHandler) logUpdateProgress(level, message string, percent ...int) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	log.Printf("[%s] [%s] %s", timestamp, strings.ToUpper(level), message)

	pct := -1
	if len(percent) > 0 {
		pct = percent[0]
	}
	h.broadcast(ProgressEvent{Level: level, Message: message, Percent: pct})
}

// applyGitHubProxy 将 GitHub 代理前缀应用到原始 URL
// proxy 形如 "https://ghproxy.com"，空字符串表示不使用代理
func applyGitHubProxy(proxy, rawURL string) string {
	if proxy == "" {
		return rawURL
	}
	return strings.TrimRight(proxy, "/") + "/" + rawURL
}

// selectProxy 选择可用的下载代理
// 优先读取 GITHUB_PROXY 环境变量；若未设置则依次探测官方及常见代理并返回首个可用的
func (h *VersionHandler) selectProxy() string {
	if proxy := strings.TrimSpace(os.Getenv("GITHUB_PROXY")); proxy != "" {
		h.logUpdateProgress("info", fmt.Sprintf("使用环境变量代理: %s", proxy))
		return proxy
	}

	probeTarget := "https://github.com/NodePassProject/NodePassDash/releases/latest"

	type candidate struct {
		name  string
		proxy string
	}
	candidates := []candidate{
		{"GitHub 直连", ""},
		{"ghproxy.com", "https://ghproxy.com"},
		{"mirror.ghproxy.com", "https://mirror.ghproxy.com"},
		{"gh-proxy.com", "https://gh-proxy.com"},
		{"ghproxy.net", "https://ghproxy.net"},
	}

	h.logUpdateProgress("info", "正在探测可用下载源...")

	client := &http.Client{
		Timeout: 5 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse // 不跟随重定向，只看能不能通
		},
	}

	for _, c := range candidates {
		testURL := applyGitHubProxy(c.proxy, probeTarget)
		resp, err := client.Head(testURL)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				if c.proxy == "" {
					h.logUpdateProgress("info", "✓ GitHub 直连可用，将直接下载")
				} else {
					h.logUpdateProgress("info", fmt.Sprintf("✓ %s 可用，将通过此代理下载", c.name))
				}
				return c.proxy
			}
		}
		h.logUpdateProgress("info", fmt.Sprintf("✗ %s 不可用，尝试下一个...", c.name))
	}

	h.logUpdateProgress("warning", "所有下载源均不可用，回退到直连（可能失败）")
	return ""
}

// performBinaryReplace 下载新版本二进制并替换当前进程文件，最终退出由调用方/Docker restart 策略负责拉起
func (h *VersionHandler) performBinaryReplace(latest *GitHubRelease, isDocker bool, proxy string) UpdateResult {
	envLabel := "二进制部署"
	if isDocker {
		envLabel = "Docker 部署"
	}
	h.logUpdateProgress("info", fmt.Sprintf("环境: %s，开始下载新版本二进制...", envLabel))
	h.logUpdateProgress("info", fmt.Sprintf("系统架构: %s/%s", runtime.GOOS, runtime.GOARCH))

	// 生成下载 URL（含代理前缀）
	downloadURL := h.getBinaryDownloadURL(latest.TagName, proxy)
	if downloadURL == "" {
		h.logUpdateProgress("error", "无法生成下载链接，当前系统架构可能不受支持")
		return UpdateResult{
			Success: false,
			Message: "无法找到适合当前系统的二进制文件",
		}
	}
	h.logUpdateProgress("info", fmt.Sprintf("下载地址: %s", downloadURL))

	// 获取当前执行文件路径
	currentExe, err := os.Executable()
	if err != nil {
		h.logUpdateProgress("error", fmt.Sprintf("获取当前执行文件路径失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("获取当前执行文件路径失败: %v", err),
		}
	}
	h.logUpdateProgress("info", fmt.Sprintf("当前程序路径: %s", currentExe))

	// 备份当前文件：使用 os.Rename 而非复制
	// Rename 仅修改目录项，不打开文件内容，因此在 Linux 上不会触发 ETXTBSY，
	// 同时内核在进程关闭前会继续持有旧 inode，不影响当前运行。
	backupPath := currentExe + ".backup"
	h.logUpdateProgress("info", fmt.Sprintf("备份路径: %s", backupPath))
	h.logUpdateProgress("info", "正在备份当前版本（rename）...")
	_ = os.Remove(backupPath) // 清除可能存在的旧备份
	if err := os.Rename(currentExe, backupPath); err != nil {
		h.logUpdateProgress("error", fmt.Sprintf("备份当前版本失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("备份当前版本失败: %v", err),
		}
	}

	if backupInfo, err := os.Stat(backupPath); err == nil {
		h.logUpdateProgress("success", fmt.Sprintf("备份完成 (%.2f MB)", float64(backupInfo.Size())/1024/1024))
	} else {
		h.logUpdateProgress("success", "备份完成")
	}

	// 下载新版本：保留下载文件的实际扩展名（.tar.gz / .zip），以便后续判断是否需要解压
	archiveExt := ""
	switch {
	case strings.HasSuffix(downloadURL, ".tar.gz"):
		archiveExt = ".tar.gz"
	case strings.HasSuffix(downloadURL, ".zip"):
		archiveExt = ".zip"
	}
	tempPath := currentExe + ".download" + archiveExt
	h.logUpdateProgress("info", fmt.Sprintf("临时下载路径: %s", tempPath))
	h.logUpdateProgress("info", "正在下载新版本...")
	if err := h.downloadFile(downloadURL, tempPath); err != nil {
		h.logUpdateProgress("error", fmt.Sprintf("下载新版本失败: %v", err))
		os.Remove(tempPath)
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("下载新版本失败: %v", err),
		}
	}

	h.logUpdateProgress("success", "新版本下载完成")

	if info, err := os.Stat(tempPath); err != nil {
		h.logUpdateProgress("error", "下载的文件验证失败")
		os.Remove(tempPath)
		return UpdateResult{
			Success: false,
			Message: "下载的文件验证失败",
		}
	} else {
		h.logUpdateProgress("info", fmt.Sprintf("下载文件大小: %.2f MB", float64(info.Size())/1024/1024))
	}

	// 解压（如为压缩包）
	var extractedBinaryPath string
	var extractDir string
	if archiveExt == ".tar.gz" || archiveExt == ".zip" {
		h.logUpdateProgress("info", "检测到压缩包格式，开始解压...")
		extractDir = filepath.Join(filepath.Dir(tempPath), "extract_temp")
		if err := os.MkdirAll(extractDir, 0755); err != nil {
			h.logUpdateProgress("error", fmt.Sprintf("创建解压目录失败: %v", err))
			os.Remove(tempPath)
			return UpdateResult{
				Success: false,
				Message: fmt.Sprintf("创建解压目录失败: %v", err),
			}
		}

		extractedPath, err := h.extractBinary(tempPath, extractDir)
		if err != nil {
			h.logUpdateProgress("error", fmt.Sprintf("解压文件失败: %v", err))
			os.Remove(tempPath)
			os.RemoveAll(extractDir)
			return UpdateResult{
				Success: false,
				Message: fmt.Sprintf("解压文件失败: %v", err),
			}
		}

		h.logUpdateProgress("success", fmt.Sprintf("解压完成，二进制文件路径: %s", extractedPath))
		extractedBinaryPath = extractedPath
		os.Remove(tempPath) // 清理压缩包
	} else {
		h.logUpdateProgress("info", "下载的是二进制文件，无需解压")
		extractedBinaryPath = tempPath
	}

	if finalInfo, err := os.Stat(extractedBinaryPath); err == nil {
		h.logUpdateProgress("info", fmt.Sprintf("待替换文件大小: %.2f MB", float64(finalInfo.Size())/1024/1024))
	} else {
		h.logUpdateProgress("error", "最终文件验证失败")
		os.Remove(extractedBinaryPath)
		return UpdateResult{
			Success: false,
			Message: "最终文件验证失败",
		}
	}

	// 替换当前程序：优先 rename（同一文件系统时 atomic 且无 ETXTBSY），
	// 跨文件系统时降级为 copyFile。
	h.logUpdateProgress("info", fmt.Sprintf("正在替换程序文件: %s -> %s", extractedBinaryPath, currentExe))
	replaceErr := os.Rename(extractedBinaryPath, currentExe)
	if replaceErr != nil {
		h.logUpdateProgress("info", "跨文件系统，改用复制方式写入新版本...")
		replaceErr = h.copyFile(extractedBinaryPath, currentExe)
		os.Remove(extractedBinaryPath)
	}
	if replaceErr != nil {
		h.logUpdateProgress("error", "替换文件失败，正在恢复备份...")
		// 备份已通过 rename 移到 backupPath，直接 rename 回来即可
		if restoreErr := os.Rename(backupPath, currentExe); restoreErr != nil {
			// rename 失败时尝试 copy
			if restoreErr2 := h.copyFile(backupPath, currentExe); restoreErr2 != nil {
				h.logUpdateProgress("error", fmt.Sprintf("恢复备份失败: %v", restoreErr2))
			} else {
				h.logUpdateProgress("success", "已恢复到原始版本")
			}
		} else {
			h.logUpdateProgress("success", "已恢复到原始版本")
		}
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("替换文件失败: %v", replaceErr),
		}
	}

	// 确保新二进制具备执行权限
	if runtime.GOOS != "windows" {
		if err := os.Chmod(currentExe, 0755); err != nil {
			h.logUpdateProgress("warning", fmt.Sprintf("设置可执行权限失败: %v", err))
		}
	}

	h.logUpdateProgress("success", "程序文件更新成功")
	if newInfo, err := os.Stat(currentExe); err == nil {
		h.logUpdateProgress("info", fmt.Sprintf("新程序文件大小: %.2f MB", float64(newInfo.Size())/1024/1024))
	}

	// 清理可能残留的旧前端资源目录（embed 模式下 dist 目录会优先级更高，需删除）
	distPath := filepath.Join(filepath.Dir(currentExe), "dist")
	if distInfo, err := os.Stat(distPath); err == nil && distInfo.IsDir() {
		h.logUpdateProgress("info", "发现旧 dist 目录，正在删除以使用新版内嵌前端资源...")
		if err := os.RemoveAll(distPath); err != nil {
			h.logUpdateProgress("warning", fmt.Sprintf("删除 dist 目录失败，但不影响更新: %v", err))
		}
	}

	// 清理解压临时目录
	if extractDir != "" {
		os.Remove(extractedBinaryPath)
		_ = os.RemoveAll(extractDir)
	}

	h.logUpdateProgress("success", fmt.Sprintf("更新完成！版本: %s -> %s", Version, latest.TagName))
	h.logUpdateProgress("info", fmt.Sprintf("备份文件保留在: %s", backupPath))
	h.logUpdateProgress("info", "等待用户触发重启以加载新版本 (POST /api/version/restart)")

	// 标记为等待重启状态;真正的 os.Exit 由用户主动触发 /version/restart 完成
	h.markRestartPending(latest.TagName)

	return UpdateResult{
		Success:    true,
		Message:    "二进制替换成功，请点击重启按钮以加载新版本",
		NeedReboot: true,
	}
}

// copyFile 复制文件
func (h *VersionHandler) copyFile(src, dst string) error {
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
	return err
}

// detectDeploymentMethod 检测部署方式
func (h *VersionHandler) detectDeploymentMethod() DeploymentInfo {
	// 检查是否在 Docker 容器中运行
	if h.isRunningInDocker() {
		manualUpdateInfo := "请在宿主机执行以下命令拉取新镜像：\n\n" +
			"docker pull ghcr.io/nodepassproject/nodepassdash:latest\n" +
			"docker restart <容器名称>\n\n" +
			"或使用 docker-compose：\n" +
			"docker-compose pull && docker-compose up -d"

		// Alpine/musl 环境：GitHub Release 二进制使用 glibc 编译，
		// musl 缺少 fcntl64 等符号，无法直接替换运行，禁止二进制自动更新
		if isMuslLibc() {
			return DeploymentInfo{
				Method:       "docker",
				CanUpdate:    false,
				UpdateInfo:   "当前容器基于 Alpine(musl libc)，GitHub Release 二进制使用 glibc 编译，存在符号不兼容(fcntl64 等)，无法在容器内直接替换。",
				ManualUpdate: manualUpdateInfo,
				Environment:  "container",
				Details:      "请通过 docker pull 拉取新镜像更新",
				DebugInfo:    map[string]interface{}{"is_docker_container": true, "is_musl": true},
			}
		}

		// 非 musl 环境（如基于 Debian/Ubuntu 的镜像）：glibc 兼容，支持二进制替换
		return DeploymentInfo{
			Method:        "docker",
			CanUpdate:     true,
			UpdateInfo:    "Docker 环境支持自动更新：下载新二进制并替换后退出，依赖容器 restart 策略自动重启",
			ManualUpdate:  manualUpdateInfo,
			HasDockerPerm: false,
			Environment:   "container",
			Details:       "请确保容器已配置 restart: unless-stopped 或 restart: always",
			DebugInfo:     map[string]interface{}{"is_docker_container": true, "is_musl": false},
		}
	}

	// 检查是否是宿主机二进制部署
	if h.isHostEnvironment() && h.isBinaryDeployment() {
		debugDetails := map[string]interface{}{
			"is_docker_container":   false,
			"has_docker_permission": false,
			"is_host_environment":   true,
			"is_binary_deployment":  true,
		}

		manualUpdateInfo := "手动更新方式：\n\n" +
			"1. 从 GitHub 下载最新版本：\n" +
			"   https://github.com/NodePassProject/NodePassDash/releases/latest\n\n" +
			"2. 停止当前程序\n\n" +
			"3. 替换二进制文件\n\n" +
			"4. 重新启动程序"

		return DeploymentInfo{
			Method:        "binary",
			CanUpdate:     true,
			UpdateInfo:    "宿主机二进制部署，支持自动更新",
			ManualUpdate:  manualUpdateInfo,
			HasDockerPerm: false,
			Environment:   "host",
			Details:       "将下载最新二进制文件并自动替换",
			DebugInfo:     debugDetails,
		}
	}

	// 未知部署方式
	debugDetails := map[string]interface{}{
		"is_docker_container":   h.isRunningInDocker(),
		"has_docker_permission": false,
		"is_host_environment":   h.isHostEnvironment(),
		"is_binary_deployment":  h.isBinaryDeployment(),
		"detection_failed":      true,
	}

	manualUpdateInfo := "手动更新方式：\n\n" +
		"1. Docker 部署：\n" +
		"   docker pull ghcr.io/nodepassproject/nodepassdash:latest\n" +
		"   docker restart <容器名称>\n\n" +
		"2. 二进制部署：\n" +
		"   从 GitHub 下载最新版本并替换文件\n" +
		"   https://github.com/NodePassProject/NodePassDash/releases/latest"

	return DeploymentInfo{
		Method:        "unknown",
		CanUpdate:     false,
		UpdateInfo:    "无法确定部署方式",
		ManualUpdate:  manualUpdateInfo,
		HasDockerPerm: false,
		Environment:   "unknown",
		Details:       "建议查看更新说明进行手动更新",
		DebugInfo:     debugDetails,
	}
}

// isMuslLibc 检测当前系统是否使用 musl libc（如 Alpine Linux）
// GitHub Releases 二进制使用 glibc 编译，musl 环境下缺少 fcntl64 等符号无法运行
func isMuslLibc() bool {
	patterns := []string{
		"/lib/ld-musl-x86_64.so.1",
		"/lib/ld-musl-aarch64.so.1",
		"/lib/ld-musl-armhf.so.1",
		"/lib/ld-musl-arm.so.1",
	}
	for _, p := range patterns {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}

// isRunningInDocker 检查是否在 Docker 容器中运行
func (h *VersionHandler) isRunningInDocker() bool {
	// 检查 /.dockerenv 文件
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}

	// 检查 /proc/1/cgroup
	if data, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		if strings.Contains(string(data), "docker") || strings.Contains(string(data), "containerd") {
			return true
		}
	}

	// 检查环境变量
	if os.Getenv("DOCKER_CONTAINER") == "true" {
		return true
	}

	return false
}

// isHostEnvironment 检查是否是宿主机环境
func (h *VersionHandler) isHostEnvironment() bool {
	// 如果不在Docker容器中，就是宿主机环境
	return !h.isRunningInDocker()
}

// isBinaryDeployment 检查是否是二进制部署
func (h *VersionHandler) isBinaryDeployment() bool {
	// 检查当前可执行文件是否可写
	executable, err := os.Executable()
	if err != nil {
		return false
	}

	// 检查文件权限
	info, err := os.Stat(executable)
	if err != nil {
		return false
	}

	// 检查是否有写权限（简单检查）
	return info.Mode().Perm()&0200 != 0
}

// getBinaryDownloadURL 获取二进制文件下载 URL（含代理前缀）
func (h *VersionHandler) getBinaryDownloadURL(version, proxy string) string {
	// 根据操作系统和架构构建下载 URL（基于goreleaser配置）
	var filename string

	// 架构映射（与 .goreleaser.yml 的 name_template 保持一致）
	var archName string
	switch runtime.GOARCH {
	case "amd64":
		archName = "x86_64"
	case "386":
		archName = "i386"
	case "arm64":
		archName = "arm64"
	case "arm":
		// 从 build info 读取 GOARM（编译时注入），对应 goreleaser 模板 armv{{ .Arm }}hf
		goarm := "7" // 默认 armv7
		if info, ok := debug.ReadBuildInfo(); ok {
			for _, s := range info.Settings {
				if s.Key == "GOARM" {
					goarm = s.Value
					break
				}
			}
		}
		archName = fmt.Sprintf("armv%shf", goarm)
	default:
		archName = runtime.GOARCH
	}

	switch runtime.GOOS {
	case "linux":
		switch runtime.GOARCH {
		case "amd64", "arm64", "arm":
			filename = fmt.Sprintf("NodePassDash_Linux_%s.tar.gz", archName)
		default:
			return ""
		}
	case "windows":
		switch runtime.GOARCH {
		case "amd64", "386":
			filename = fmt.Sprintf("NodePassDash_Windows_%s.zip", archName)
		default:
			return ""
		}
	default:
		return ""
	}

	rawURL := fmt.Sprintf("https://github.com/NodePassProject/NodePassDash/releases/download/%s/%s", version, filename)
	return applyGitHubProxy(proxy, rawURL)
}

// downloadFile 下载文件（带进度）
func (h *VersionHandler) downloadFile(url, filepath string) error {
	// 创建支持代理的HTTP客户端
	client := &http.Client{
		Timeout: 30 * time.Minute, // 增加超时时间以支持大文件下载
		Transport: &http.Transport{
			// 启用系统/环境代理检测：先读 env，再回退到系统代理
			Proxy: ieproxy.GetProxyFunc(),
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			ForceAttemptHTTP2:     true,
			MaxIdleConns:          100,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}

	// 创建请求
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("发起下载请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("下载失败，状态码: %d", resp.StatusCode)
	}

	// 获取文件大小
	fileSize := resp.ContentLength
	if fileSize > 0 {
		h.logUpdateProgress("info", fmt.Sprintf("文件大小: %.2f MB", float64(fileSize)/1024/1024))
	}

	// 创建文件
	file, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("创建文件失败: %v", err)
	}
	defer file.Close()

	// 如果文件大小已知，使用进度跟踪
	if fileSize > 0 {
		return h.downloadWithProgress(resp.Body, file, fileSize)
	} else {
		// 文件大小未知，直接复制
		h.logUpdateProgress("info", "文件大小未知，开始下载...")
		_, err = io.Copy(file, resp.Body)
		return err
	}
}

// downloadWithProgress 带进度的下载，每 5% 推送一次带 percent 字段的进度事件
func (h *VersionHandler) downloadWithProgress(src io.Reader, dst io.Writer, totalSize int64) error {
	const bufferSize = 32 * 1024 // 32KB buffer
	buffer := make([]byte, bufferSize)

	var downloaded int64
	lastReportedPercent := -1

	for {
		n, err := src.Read(buffer)
		if n > 0 {
			if _, writeErr := dst.Write(buffer[:n]); writeErr != nil {
				return writeErr
			}
			downloaded += int64(n)

			percent := int(float64(downloaded) / float64(totalSize) * 100)
			if percent >= lastReportedPercent+5 && percent <= 100 {
				h.logUpdateProgress("info",
					fmt.Sprintf("下载中 %d%% (%.1f / %.1f MB)",
						percent,
						float64(downloaded)/1024/1024,
						float64(totalSize)/1024/1024),
					percent,
				)
				lastReportedPercent = percent
			}
		}

		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}

	h.logUpdateProgress("success", fmt.Sprintf("下载完成 (%.1f MB)", float64(downloaded)/1024/1024), 100)
	return nil
}

// getLatestRelease 从 GitHub API 获取最新发布信息
func (h *VersionHandler) getLatestRelease(proxy string) (*GitHubRelease, error) {
	apiURL := applyGitHubProxy(proxy, "https://api.github.com/repos/NodePassProject/NodePassDash/releases/latest")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("请求 GitHub API 失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API 返回错误 %d: %s", resp.StatusCode, string(body))
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("解析 GitHub 响应失败: %v", err)
	}

	return &release, nil
}

// compareVersions 比较版本号，如果远程版本更新则返回 true
func (h *VersionHandler) compareVersions(current, latest string) bool {
	// 简单版本比较逻辑
	// 移除 v 前缀
	current = strings.TrimPrefix(current, "v")
	latest = strings.TrimPrefix(latest, "v")

	// 如果当前版本是 dev，则始终有更新
	if current == "dev" {
		return true
	}

	// 简单字符串比较（更复杂的版本比较需要专门的库）
	return current != latest
}

// HandleGetUpdateInfo 获取更新信息（合并接口）
func (h *VersionHandler) HandleGetUpdateInfo(c *gin.Context) {
	h.HandleCheckUpdate(c)
}

// HandleGetReleaseHistory 获取版本发布历史
func (h *VersionHandler) HandleGetReleaseHistory(c *gin.Context) {
	releases, err := h.getReleaseHistory("")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   fmt.Sprintf("获取版本历史失败: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    releases,
	})
}

// getReleaseHistory 从 GitHub API 获取版本发布历史
func (h *VersionHandler) getReleaseHistory(proxy string) ([]GitHubRelease, error) {
	apiURL := applyGitHubProxy(proxy, "https://api.github.com/repos/NodePassProject/NodePassDash/releases?per_page=10")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("请求 GitHub API 失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitHub API 返回错误 %d: %s", resp.StatusCode, string(body))
	}

	var releases []GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, fmt.Errorf("解析 GitHub 响应失败: %v", err)
	}

	return releases, nil
}

// extractBinary 从压缩包文件中提取二进制文件（支持zip和tar.gz）
func (h *VersionHandler) extractBinary(archivePath, targetDir string) (string, error) {
	h.logUpdateProgress("info", "正在解压下载的文件...")

	expectedExeName := "nodepassdash"
	if runtime.GOOS == "windows" {
		expectedExeName = "nodepassdash.exe"
	}

	// 根据文件扩展名判断压缩格式
	if strings.HasSuffix(archivePath, ".zip") {
		return h.extractFromZip(archivePath, targetDir, expectedExeName)
	} else if strings.HasSuffix(archivePath, ".tar.gz") {
		return h.extractFromTarGz(archivePath, targetDir, expectedExeName)
	} else {
		return "", fmt.Errorf("不支持的压缩格式: %s", filepath.Ext(archivePath))
	}
}

// extractFromZip 从zip文件中提取二进制文件
func (h *VersionHandler) extractFromZip(zipPath, targetDir, expectedExeName string) (string, error) {
	// 打开zip文件
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", fmt.Errorf("打开zip文件失败: %v", err)
	}
	defer reader.Close()

	// 遍历zip文件中的内容
	for _, file := range reader.File {
		fileName := filepath.Base(file.Name)

		// 查找可执行文件
		if fileName == expectedExeName || strings.HasSuffix(fileName, expectedExeName) {
			h.logUpdateProgress("info", fmt.Sprintf("找到可执行文件: %s", file.Name))

			// 创建目标文件路径
			targetPath := filepath.Join(targetDir, expectedExeName)

			// 打开zip中的文件
			rc, err := file.Open()
			if err != nil {
				return "", fmt.Errorf("打开zip中的文件失败: %v", err)
			}

			// 创建目标文件
			outFile, err := os.Create(targetPath)
			if err != nil {
				rc.Close()
				return "", fmt.Errorf("创建目标文件失败: %v", err)
			}

			// 复制文件内容
			_, err = io.Copy(outFile, rc)
			rc.Close()
			outFile.Close()

			if err != nil {
				return "", fmt.Errorf("解压文件失败: %v", err)
			}

			// 设置可执行权限（Unix系统）
			if runtime.GOOS != "windows" {
				if err := os.Chmod(targetPath, 0755); err != nil {
					h.logUpdateProgress("warning", fmt.Sprintf("设置可执行权限失败: %v", err))
				}
			}

			h.logUpdateProgress("success", fmt.Sprintf("文件解压完成: %s", targetPath))
			return targetPath, nil
		}
	}

	return "", fmt.Errorf("在zip文件中未找到可执行文件 %s", expectedExeName)
}

// extractFromTarGz 从tar.gz文件中提取二进制文件
func (h *VersionHandler) extractFromTarGz(tarGzPath, targetDir, expectedExeName string) (string, error) {
	// 打开tar.gz文件
	file, err := os.Open(tarGzPath)
	if err != nil {
		return "", fmt.Errorf("打开tar.gz文件失败: %v", err)
	}
	defer file.Close()

	// 创建gzip reader
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return "", fmt.Errorf("创建gzip reader失败: %v", err)
	}
	defer gzipReader.Close()

	// 创建tar reader
	tarReader := tar.NewReader(gzipReader)

	// 遍历tar文件中的内容
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("读取tar文件失败: %v", err)
		}

		// 只处理普通文件
		if header.Typeflag != tar.TypeReg {
			continue
		}

		fileName := filepath.Base(header.Name)

		// 查找可执行文件
		if fileName == expectedExeName || strings.HasSuffix(fileName, expectedExeName) {
			h.logUpdateProgress("info", fmt.Sprintf("找到可执行文件: %s", header.Name))

			// 创建目标文件路径
			targetPath := filepath.Join(targetDir, expectedExeName)

			// 创建目标文件
			outFile, err := os.Create(targetPath)
			if err != nil {
				return "", fmt.Errorf("创建目标文件失败: %v", err)
			}

			// 复制文件内容
			_, err = io.Copy(outFile, tarReader)
			outFile.Close()

			if err != nil {
				return "", fmt.Errorf("解压文件失败: %v", err)
			}

			// 设置可执行权限（Unix系统）
			if runtime.GOOS != "windows" {
				if err := os.Chmod(targetPath, 0755); err != nil {
					h.logUpdateProgress("warning", fmt.Sprintf("设置可执行权限失败: %v", err))
				}
			}

			h.logUpdateProgress("success", fmt.Sprintf("文件解压完成: %s", targetPath))
			return targetPath, nil
		}
	}

	return "", fmt.Errorf("在tar.gz文件中未找到可执行文件 %s", expectedExeName)
}
