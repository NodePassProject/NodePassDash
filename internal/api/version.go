package api

import (
	"NodePassDash/internal/sse"
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/mattn/go-ieproxy"
)

// VersionHandler 版本相关处理器
type VersionHandler struct {
	sseService *sse.Service // SSE 服务用于推送更新日志
}

// NewVersionHandler 创建版本处理器
func NewVersionHandler(sseService *sse.Service) *VersionHandler {
	return &VersionHandler{
		sseService: sseService,
	}
}

// VersionInfo 版本信息结构
type VersionInfo struct {
	Current   string `json:"current"`
	GoVersion string `json:"goVersion"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	BuildTime string `json:"buildTime,omitempty"`
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
	Current       VersionInfo    `json:"current"`
	Latest        *GitHubRelease `json:"latest,omitempty"`
	HasUpdate     bool           `json:"hasUpdate"`
	UpdateContent string         `json:"updateContent,omitempty"`
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

// HandleGetCurrentVersion 获取当前版本信息
func (h *VersionHandler) HandleGetCurrentVersion(w http.ResponseWriter, r *http.Request) {
	versionInfo := VersionInfo{
		Current:   Version,
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    versionInfo,
	})
}

// HandleCheckUpdate 检查更新
func (h *VersionHandler) HandleCheckUpdate(w http.ResponseWriter, r *http.Request) {
	current := VersionInfo{
		Current:   Version,
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
	}

	// 获取 GitHub 最新发布信息
	latest, err := h.getLatestRelease()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("获取最新版本失败: %v", err),
		})
		return
	}

	// 检查是否有更新
	hasUpdate := h.compareVersions(Version, latest.TagName)

	updateInfo := UpdateInfo{
		Current:       current,
		Latest:        latest,
		HasUpdate:     hasUpdate,
		UpdateContent: latest.Body,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    updateInfo,
	})
}

// HandleGetDeploymentInfo 获取部署信息
func (h *VersionHandler) HandleGetDeploymentInfo(w http.ResponseWriter, r *http.Request) {
	deployInfo := h.detectDeploymentMethod()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    deployInfo,
	})
}

// HandleAutoUpdate 自动更新
func (h *VersionHandler) HandleAutoUpdate(w http.ResponseWriter, r *http.Request) {
	// 检测部署方式
	deployInfo := h.detectDeploymentMethod()

	if !deployInfo.CanUpdate {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "当前部署方式不支持自动更新",
		})
		return
	}

	// 立即响应请求，避免阻塞
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "更新命令已提交，请通过 SSE 监听更新进度",
	})

	// 异步执行更新，同时推送日志
	go func() {
		h.performUpdateWithLogs(deployInfo)
	}()
}

// performUpdateWithLogs 执行更新并推送日志
func (h *VersionHandler) performUpdateWithLogs(deploymentInfo DeploymentInfo) {
	h.broadcastUpdateLog("info", "开始执行自动更新...")

	var result UpdateResult
	switch deploymentInfo.Method {
	case "docker":
		if deploymentInfo.HasDockerPerm {
			result = h.updateDockerWithPermissionAndLogs()
		} else {
			result = UpdateResult{
				Success: false,
				Message: "Docker 容器内无权限，无法自动更新",
			}
		}
	case "binary":
		result = h.updateBinaryWithLogs()
	default:
		result = UpdateResult{
			Success: false,
			Message: "未知的部署方式，无法自动更新",
		}
	}

	if result.Success {
		h.broadcastUpdateLog("success", result.Message)
		if result.NeedReboot {
			h.broadcastUpdateLog("info", "更新完成，容器将在几秒钟后重启...")
		}
	} else {
		h.broadcastUpdateLog("error", fmt.Sprintf("更新失败: %s", result.Message))
	}

	// 标记更新完成
	h.broadcastUpdateLog("complete", "更新流程结束")
}

// broadcastUpdateLog 广播更新日志
func (h *VersionHandler) broadcastUpdateLog(level, message string) {
	if h.sseService == nil {
		return
	}

	event := sse.Event{
		Type: "update_log",
		Data: map[string]interface{}{
			"level":     level,
			"message":   message,
			"timestamp": time.Now().Format("2006-01-02 15:04:05"),
		},
	}

	h.sseService.BroadcastToAll(event)
}

// updateDockerWithPermissionAndLogs Docker更新（带日志）
func (h *VersionHandler) updateDockerWithPermissionAndLogs() UpdateResult {
	h.broadcastUpdateLog("info", "检测到 Docker 部署环境，开始拉取最新镜像...")

	// 获取最新版本
	latest, err := h.getLatestRelease()
	if err != nil {
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("获取最新版本失败: %v", err),
		}
	}

	h.broadcastUpdateLog("info", fmt.Sprintf("最新版本: %s", latest.TagName))

	// 拉取最新镜像
	h.broadcastUpdateLog("info", "正在拉取最新 Docker 镜像...")
	pullCmd := exec.Command("docker", "pull", "ghcr.io/nodepassproject/nodepassdash:latest")
	pullOutput, err := pullCmd.CombinedOutput()
	if err != nil {
		h.broadcastUpdateLog("error", fmt.Sprintf("拉取镜像失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("拉取镜像失败: %v\n输出: %s", err, string(pullOutput)),
		}
	}

	h.broadcastUpdateLog("success", "镜像拉取成功")
	h.broadcastUpdateLog("info", "准备重启容器...")

	// 获取当前容器名
	containerName, err := h.getCurrentContainerName()
	if err != nil {
		h.broadcastUpdateLog("warning", "无法获取当前容器名，尝试通用方法重启...")

		// 延时重启，让响应先返回
		time.AfterFunc(3*time.Second, func() {
			h.broadcastUpdateLog("info", "正在重启应用...")
			os.Exit(0) // 优雅退出，让容器管理器重启
		})

		return UpdateResult{
			Success:    true,
			Message:    "镜像更新成功，应用即将重启",
			NeedReboot: true,
		}
	}

	h.broadcastUpdateLog("info", fmt.Sprintf("找到容器: %s", containerName))

	// 重启容器
	time.AfterFunc(3*time.Second, func() {
		h.broadcastUpdateLog("info", "正在重启容器...")
		restartCmd := exec.Command("docker", "restart", containerName)
		if err := restartCmd.Run(); err != nil {
			h.broadcastUpdateLog("error", fmt.Sprintf("重启容器失败: %v", err))
			// 如果重启容器失败，尝试直接退出让容器管理器处理
			h.broadcastUpdateLog("info", "尝试优雅退出让容器管理器重启...")
			os.Exit(0)
		}
		h.broadcastUpdateLog("success", "容器重启成功")
	})

	return UpdateResult{
		Success:    true,
		Message:    "镜像更新成功，容器即将重启",
		NeedReboot: true,
	}
}

// updateBinaryWithLogs 二进制更新（带日志）
func (h *VersionHandler) updateBinaryWithLogs() UpdateResult {
	h.broadcastUpdateLog("info", "检测到二进制部署环境，开始下载最新版本...")

	// 获取最新版本
	latest, err := h.getLatestRelease()
	if err != nil {
		h.broadcastUpdateLog("error", fmt.Sprintf("获取最新版本失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("获取最新版本失败: %v", err),
		}
	}

	h.broadcastUpdateLog("info", fmt.Sprintf("最新版本: %s", latest.TagName))

	// 生成下载 URL
	downloadURL := h.getBinaryDownloadURL(latest.TagName)
	if downloadURL == "" {
		h.broadcastUpdateLog("error", "无法生成下载链接，当前系统架构可能不受支持")
		return UpdateResult{
			Success: false,
			Message: "无法找到适合当前系统的二进制文件",
		}
	}
	h.broadcastUpdateLog("info", fmt.Sprintf("下载地址: %s", downloadURL))

	// 获取当前执行文件路径
	currentExe, err := os.Executable()
	if err != nil {
		h.broadcastUpdateLog("error", fmt.Sprintf("获取当前执行文件路径失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("获取当前执行文件路径失败: %v", err),
		}
	}
	h.broadcastUpdateLog("info", fmt.Sprintf("当前程序路径: %s", currentExe))

	// 备份当前文件
	backupPath := currentExe + ".backup"
	h.broadcastUpdateLog("info", "备份当前版本...")
	if err := h.copyFile(currentExe, backupPath); err != nil {
		h.broadcastUpdateLog("error", fmt.Sprintf("备份当前版本失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("备份当前版本失败: %v", err),
		}
	}
	h.broadcastUpdateLog("success", "当前版本备份完成")

	// 下载新版本
	tempPath := currentExe + ".new"
	h.broadcastUpdateLog("info", "正在下载新版本...")
	if err := h.downloadFile(downloadURL, tempPath); err != nil {
		h.broadcastUpdateLog("error", fmt.Sprintf("下载新版本失败: %v", err))
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("下载新版本失败: %v", err),
		}
	}

	h.broadcastUpdateLog("success", "新版本下载完成")

	// 验证下载的文件
	if info, err := os.Stat(tempPath); err != nil {
		h.broadcastUpdateLog("error", "下载的文件验证失败")
		os.Remove(tempPath)
		return UpdateResult{
			Success: false,
			Message: "下载的文件验证失败",
		}
	} else {
		h.broadcastUpdateLog("info", fmt.Sprintf("文件大小: %.2f MB", float64(info.Size())/1024/1024))
	}

	// 替换文件
	h.broadcastUpdateLog("info", "正在替换程序文件...")
	if err := os.Rename(tempPath, currentExe); err != nil {
		// 替换失败，尝试恢复备份
		h.broadcastUpdateLog("error", "替换文件失败，正在恢复备份...")
		if restoreErr := os.Rename(backupPath, currentExe); restoreErr != nil {
			h.broadcastUpdateLog("error", fmt.Sprintf("恢复备份也失败了: %v", restoreErr))
		} else {
			h.broadcastUpdateLog("success", "已恢复到原始版本")
		}
		os.Remove(tempPath)
		return UpdateResult{
			Success: false,
			Message: fmt.Sprintf("替换文件失败: %v", err),
		}
	}

	h.broadcastUpdateLog("success", "程序文件更新成功")
	h.broadcastUpdateLog("info", "准备重启应用...")

	// 删除 dist 目录（如果存在），确保使用新二进制文件中的前端资源
	h.broadcastUpdateLog("info", "检查并清理前端资源目录...")
	distPath := "dist"
	if _, err := os.Stat(distPath); err == nil {
		h.broadcastUpdateLog("info", "发现 dist 目录，正在删除以使用新的内嵌前端资源...")
		if err := os.RemoveAll(distPath); err != nil {
			h.broadcastUpdateLog("warning", fmt.Sprintf("删除 dist 目录失败，但不影响更新: %v", err))
		} else {
			h.broadcastUpdateLog("success", "已删除旧的前端资源目录")
		}
	} else {
		h.broadcastUpdateLog("info", "未发现 dist 目录，将使用内嵌前端资源")
	}

	// 延时重启
	time.AfterFunc(3*time.Second, func() {
		h.broadcastUpdateLog("info", "正在重启应用...")
		time.Sleep(1 * time.Second) // 确保日志发送完成
		os.Exit(0)
	})

	return UpdateResult{
		Success:    true,
		Message:    "二进制文件更新成功，应用即将重启",
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
		hasDockerPerm := h.hasDockerPermission()
		debugDetails := h.getDockerPermissionDetails()
		debugDetails["is_docker_container"] = true
		debugDetails["has_docker_permission"] = hasDockerPerm

		var detailsStr string
		if hasDockerPerm {
			detailsStr = "容器内部有 Docker 权限，可以直接拉取镜像并重启容器"
		} else {
			// 构建详细的错误说明
			if !debugDetails["socket_exists"].(bool) {
				detailsStr = "Docker socket 文件不存在，请检查 volume 映射: -v /var/run/docker.sock:/var/run/docker.sock"
			} else if !debugDetails["connection_test"].(bool) {
				detailsStr = fmt.Sprintf("无法连接 Docker socket，错误：%v", debugDetails["connection_error"])
			} else {
				detailsStr = "需要在宿主机上执行更新命令"
			}
		}

		return DeploymentInfo{
			Method:        "docker",
			CanUpdate:     hasDockerPerm,
			UpdateInfo:    fmt.Sprintf("Docker 容器环境，权限检测：%t", hasDockerPerm),
			HasDockerPerm: hasDockerPerm,
			Environment:   "container",
			Details:       detailsStr,
			DebugInfo:     debugDetails,
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

		return DeploymentInfo{
			Method:        "binary",
			CanUpdate:     true,
			UpdateInfo:    "宿主机二进制部署，支持自动更新",
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

	return DeploymentInfo{
		Method:        "unknown",
		CanUpdate:     false,
		UpdateInfo:    "无法确定部署方式",
		HasDockerPerm: false,
		Environment:   "unknown",
		Details:       "建议查看更新说明进行手动更新",
		DebugInfo:     debugDetails,
	}
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

// hasDockerPermission 检查是否有 Docker 权限
func (h *VersionHandler) hasDockerPermission() bool {
	// 检查 Docker socket 是否存在
	socketPath := "/var/run/docker.sock"
	if _, err := os.Stat(socketPath); err != nil {
		return false
	}

	// 检查是否可以连接到 Docker socket
	if !h.testDockerSocketConnection() {
		return false
	}

	return true
}

// testDockerSocketConnection 测试 Docker socket 连接
func (h *VersionHandler) testDockerSocketConnection() bool {
	// 尝试连接 Docker socket
	conn, err := net.Dial("unix", "/var/run/docker.sock")
	if err != nil {
		return false
	}
	defer conn.Close()

	// 发送简单的 Docker API 请求来测试权限
	request := "GET /version HTTP/1.1\r\nHost: docker\r\n\r\n"
	_, err = conn.Write([]byte(request))
	if err != nil {
		return false
	}

	// 读取响应
	buffer := make([]byte, 1024)
	_, err = conn.Read(buffer)
	if err != nil {
		return false
	}

	// 检查响应是否包含 Docker 版本信息
	response := string(buffer)
	return strings.Contains(response, "HTTP/1.1 200") && strings.Contains(response, "Docker")
}

// getDockerPermissionDetails 获取详细的权限检查信息（用于调试）
func (h *VersionHandler) getDockerPermissionDetails() map[string]interface{} {
	details := make(map[string]interface{})

	// 检查 socket 文件
	socketPath := "/var/run/docker.sock"
	if stat, err := os.Stat(socketPath); err != nil {
		details["socket_exists"] = false
		details["socket_error"] = err.Error()
	} else {
		details["socket_exists"] = true
		details["socket_mode"] = stat.Mode().String()
		details["socket_size"] = stat.Size()
	}

	// 检查当前用户信息
	if user, err := user.Current(); err == nil {
		details["current_user"] = user.Username
		details["current_uid"] = user.Uid
		details["current_gid"] = user.Gid
	}

	// 检查用户组
	if groups, err := os.Getgroups(); err == nil {
		details["user_groups"] = groups
	}

	// 测试连接
	if conn, err := net.Dial("unix", socketPath); err != nil {
		details["connection_test"] = false
		details["connection_error"] = err.Error()
	} else {
		conn.Close()
		details["connection_test"] = true
	}

	// 检查是否安装了 docker 命令
	if _, err := exec.LookPath("docker"); err != nil {
		details["docker_cli_available"] = false
	} else {
		details["docker_cli_available"] = true
	}

	return details
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

// getBinaryDownloadURL 获取二进制文件下载 URL
func (h *VersionHandler) getBinaryDownloadURL(version string) string {
	// 根据操作系统和架构构建下载 URL（基于goreleaser配置）
	var filename string

	// 架构映射（根据goreleaser.yml规则）
	var archName string
	switch runtime.GOARCH {
	case "amd64":
		archName = "x86_64"
	case "386":
		archName = "i386"
	case "arm64":
		archName = "arm64"
	case "arm":
		// 简化处理，实际应该根据GOARM判断
		archName = "armv7hf"
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

	return fmt.Sprintf("https://github.com/NodePassProject/NodePassDash/releases/download/%s/%s", version, filename)
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
		h.broadcastUpdateLog("info", fmt.Sprintf("文件大小: %.2f MB", float64(fileSize)/1024/1024))
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
		h.broadcastUpdateLog("info", "文件大小未知，开始下载...")
		_, err = io.Copy(file, resp.Body)
		return err
	}
}

// downloadWithProgress 带进度的下载
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

			// 计算并报告进度（每10%报告一次，使用success级别来增加进度条）
			percent := int(float64(downloaded) / float64(totalSize) * 100)
			if percent >= lastReportedPercent+10 && percent <= 100 {
				// 使用success级别，这样前端会增加进度条
				h.broadcastUpdateLog("success", fmt.Sprintf("下载进度: %d%% (%.2f MB / %.2f MB)",
					percent,
					float64(downloaded)/1024/1024,
					float64(totalSize)/1024/1024))
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

	h.broadcastUpdateLog("success", fmt.Sprintf("下载完成: %.2f MB", float64(downloaded)/1024/1024))
	return nil
}

// getLatestRelease 从 GitHub API 获取最新发布信息
func (h *VersionHandler) getLatestRelease() (*GitHubRelease, error) {
	url := "https://api.github.com/repos/NodePassProject/NodePassDash/releases/latest"

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(url)
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
func (h *VersionHandler) HandleGetUpdateInfo(w http.ResponseWriter, r *http.Request) {
	h.HandleCheckUpdate(w, r)
}

// HandleGetReleaseHistory 获取版本发布历史
func (h *VersionHandler) HandleGetReleaseHistory(w http.ResponseWriter, r *http.Request) {
	releases, err := h.getReleaseHistory()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("获取版本历史失败: %v", err),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    releases,
	})
}

// getReleaseHistory 从 GitHub API 获取版本发布历史
func (h *VersionHandler) getReleaseHistory() ([]GitHubRelease, error) {
	url := "https://api.github.com/repos/NodePassProject/NodePassDash/releases?per_page=10"

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get(url)
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

// getCurrentContainerName 获取当前容器名
func (h *VersionHandler) getCurrentContainerName() (string, error) {
	// 1. 尝试从环境变量获取容器名
	if containerName := os.Getenv("HOSTNAME"); containerName != "" {
		// 在 Docker 中，容器的 hostname 通常就是容器 ID 的前12位
		return containerName, nil
	}

	// 2. 尝试从 cgroup 信息获取容器 ID
	cgroupFile := "/proc/self/cgroup"
	if content, err := os.ReadFile(cgroupFile); err == nil {
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			if strings.Contains(line, "docker") {
				// 格式通常是：12:pids:/docker/容器ID
				parts := strings.Split(line, "/")
				if len(parts) >= 3 && parts[len(parts)-2] == "docker" {
					containerID := parts[len(parts)-1]
					if len(containerID) >= 12 {
						return containerID[:12], nil // 返回前12位作为容器名
					}
					return containerID, nil
				}
			}
		}
	}

	// 3. 尝试从 Docker 环境变量获取
	if containerID := os.Getenv("CONTAINER_ID"); containerID != "" {
		return containerID, nil
	}

	// 4. 如果都没有找到，返回错误
	return "", fmt.Errorf("无法获取容器名称，请确保运行在 Docker 容器中")
}

// extractBinary 从压缩包文件中提取二进制文件（支持zip和tar.gz）
func (h *VersionHandler) extractBinary(archivePath, targetDir string) (string, error) {
	h.broadcastUpdateLog("info", "正在解压下载的文件...")

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
			h.broadcastUpdateLog("info", fmt.Sprintf("找到可执行文件: %s", file.Name))

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
					h.broadcastUpdateLog("warning", fmt.Sprintf("设置可执行权限失败: %v", err))
				}
			}

			h.broadcastUpdateLog("success", fmt.Sprintf("文件解压完成: %s", targetPath))
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
			h.broadcastUpdateLog("info", fmt.Sprintf("找到可执行文件: %s", header.Name))

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
					h.broadcastUpdateLog("warning", fmt.Sprintf("设置可执行权限失败: %v", err))
				}
			}

			h.broadcastUpdateLog("success", fmt.Sprintf("文件解压完成: %s", targetPath))
			return targetPath, nil
		}
	}

	return "", fmt.Errorf("在tar.gz文件中未找到可执行文件 %s", expectedExeName)
}
