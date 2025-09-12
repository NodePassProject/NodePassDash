package api

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// SystemInfo 系统环境信息结构体
type SystemInfo struct {
	Platform      string  `json:"platform"`
	Architecture  string  `json:"architecture"`
	InstallType   string  `json:"installType"`
	IPv6Supported bool    `json:"ipv6Supported"`
	GoVersion     string  `json:"goVersion"`
	NodeVersion   *string `json:"nodeVersion,omitempty"`
	DockerVersion *string `json:"dockerVersion,omitempty"`
}

// SSETestRequest SSE测试请求结构体
type SSETestRequest struct {
	URL    string `json:"url" binding:"required"`
	APIKey string `json:"apiKey" binding:"required"`
}

// SSETestResult SSE测试结果结构体
type SSETestResult struct {
	Success      bool   `json:"success"`
	URL          string `json:"url"`
	Connected    bool   `json:"connected"`
	Message      string `json:"message"`
	ResponseTime int64  `json:"responseTime"`
	StatusCode   *int   `json:"statusCode,omitempty"`
	Error        string `json:"error,omitempty"`
}

// TelnetTestRequest Telnet测试请求结构体
type TelnetTestRequest struct {
	Host string `json:"host" binding:"required"`
	Port int    `json:"port" binding:"required,min=1,max=65535"`
}

// TelnetTestResult Telnet测试结果结构体
type TelnetTestResult struct {
	Success      bool   `json:"success"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Connected    bool   `json:"connected"`
	Message      string `json:"message"`
	ResponseTime int64  `json:"responseTime"`
}

// PingTestRequest Ping测试请求结构体
type PingTestRequest struct {
	Host  string `json:"host" binding:"required"`
	Count int    `json:"count" binding:"min=1,max=10"`
}

// PingTestResult Ping测试结果结构体
type PingTestResult struct {
	Success     bool    `json:"success"`
	Host        string  `json:"host"`
	PacketsSent int     `json:"packetsSent"`
	PacketsRecv int     `json:"packetsRecv"`
	PacketLoss  float64 `json:"packetLoss"`
	MinTime     *float64 `json:"minTime,omitempty"`
	MaxTime     *float64 `json:"maxTime,omitempty"`
	AvgTime     *float64 `json:"avgTime,omitempty"`
	Output      string  `json:"output"`
	Error       string  `json:"error,omitempty"`
}

// DebugHandler 调试相关的处理器
type DebugHandler struct{}

// NewDebugHandler 创建调试处理器实例
func NewDebugHandler() *DebugHandler {
	return &DebugHandler{}
}

// SetupDebugRoutes 设置调试相关路由
func SetupDebugRoutes(rg *gin.RouterGroup) {
	debugHandler := NewDebugHandler()
	
	debugGroup := rg.Group("/debug")
	{
		debugGroup.GET("/system-info", debugHandler.HandleSystemInfo)
		debugGroup.POST("/sse-test", debugHandler.HandleSSETest)
		debugGroup.POST("/telnet-test", debugHandler.HandleTelnetTest)
		debugGroup.POST("/ping-test", debugHandler.HandlePingTest)
	}
}

// HandleSystemInfo 获取系统环境信息
func (h *DebugHandler) HandleSystemInfo(c *gin.Context) {
	systemInfo := &SystemInfo{
		Platform:     runtime.GOOS,
		Architecture: runtime.GOARCH,
		InstallType:  h.detectInstallType(),
		GoVersion:    runtime.Version(),
	}

	// 检测IPv6支持
	systemInfo.IPv6Supported = h.detectIPv6Support()

	// 检测Node.js版本（如果可用）
	if nodeVersion := h.detectNodeVersion(); nodeVersion != "" {
		systemInfo.NodeVersion = &nodeVersion
	}

	// 检测Docker版本（如果在Docker环境中）
	if dockerVersion := h.detectDockerVersion(); dockerVersion != "" {
		systemInfo.DockerVersion = &dockerVersion
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    systemInfo,
	})
}

// HandleSSETest SSE连接测试
func (h *DebugHandler) HandleSSETest(c *gin.Context) {
	var req SSETestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求参数无效: " + err.Error(),
		})
		return
	}

	// 确保URL格式正确
	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		req.URL = "https://" + req.URL
	}

	// 构建SSE测试URL
	sseURL := strings.TrimSuffix(req.URL, "/") + "/sse"

	startTime := time.Now()
	
	// 创建HTTP客户端，设置较短的超时时间
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	// 创建请求
	httpReq, err := http.NewRequest("GET", sseURL, nil)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"data": SSETestResult{
				Success:   false,
				URL:       req.URL,
				Connected: false,
				Message:   "创建请求失败",
				Error:     err.Error(),
			},
		})
		return
	}

	// 设置必要的头部
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Cache-Control", "no-cache")

	// 执行请求
	resp, err := client.Do(httpReq)
	responseTime := time.Since(startTime).Milliseconds()

	result := SSETestResult{
		URL:          req.URL,
		ResponseTime: responseTime,
	}

	if err != nil {
		result.Success = false
		result.Connected = false
		result.Message = "连接失败"
		result.Error = err.Error()
	} else {
		defer resp.Body.Close()
		result.StatusCode = &resp.StatusCode
		
		if resp.StatusCode == 200 {
			result.Success = true
			result.Connected = true
			result.Message = "SSE连接测试成功"
		} else if resp.StatusCode == 401 {
			result.Success = false
			result.Connected = false
			result.Message = "认证失败，请检查API密钥"
		} else if resp.StatusCode == 404 {
			result.Success = false
			result.Connected = false
			result.Message = "SSE端点不存在，请检查URL"
		} else {
			result.Success = false
			result.Connected = false
			result.Message = fmt.Sprintf("连接失败，状态码: %d", resp.StatusCode)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// HandleTelnetTest Telnet连接测试
func (h *DebugHandler) HandleTelnetTest(c *gin.Context) {
	var req TelnetTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求参数无效: " + err.Error(),
		})
		return
	}

	startTime := time.Now()
	
	// 尝试连接指定主机和端口
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", req.Host, req.Port), 5*time.Second)
	responseTime := time.Since(startTime).Milliseconds()

	result := TelnetTestResult{
		Host:         req.Host,
		Port:         req.Port,
		ResponseTime: responseTime,
	}

	if err != nil {
		result.Success = true // 测试执行成功
		result.Connected = false
		result.Message = fmt.Sprintf("无法连接到 %s:%d", req.Host, req.Port)
	} else {
		conn.Close()
		result.Success = true
		result.Connected = true
		result.Message = fmt.Sprintf("成功连接到 %s:%d", req.Host, req.Port)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// HandlePingTest Ping网络测试
func (h *DebugHandler) HandlePingTest(c *gin.Context) {
	var req PingTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求参数无效: " + err.Error(),
		})
		return
	}

	// 默认ping 4次
	if req.Count <= 0 {
		req.Count = 4
	}

	result := h.executePing(req.Host, req.Count)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}

// detectInstallType 检测安装类型
func (h *DebugHandler) detectInstallType() string {
	// 检查是否在Docker容器中
	if h.isRunningInDocker() {
		return "docker"
	}
	
	// 检查是否是二进制安装
	if h.isBinaryInstall() {
		return "binary"
	}
	
	return "unknown"
}

// isRunningInDocker 检查是否在Docker容器中运行
func (h *DebugHandler) isRunningInDocker() bool {
	// 检查/.dockerenv文件
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	
	// 检查cgroup信息
	if data, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		return strings.Contains(string(data), "docker") || strings.Contains(string(data), "containerd")
	}
	
	return false
}

// isBinaryInstall 检查是否是二进制安装
func (h *DebugHandler) isBinaryInstall() bool {
	// 简单检查：如果可执行文件存在且不在容器中，认为是二进制安装
	return !h.isRunningInDocker()
}

// detectIPv6Support 检测IPv6支持
func (h *DebugHandler) detectIPv6Support() bool {
	// 尝试创建IPv6套接字
	conn, err := net.Dial("udp6", "[::1]:0")
	if err != nil {
		return false
	}
	defer conn.Close()
	return true
}

// detectNodeVersion 检测Node.js版本
func (h *DebugHandler) detectNodeVersion() string {
	cmd := exec.Command("node", "--version")
	if output, err := cmd.Output(); err == nil {
		return strings.TrimSpace(string(output))
	}
	return ""
}

// detectDockerVersion 检测Docker版本
func (h *DebugHandler) detectDockerVersion() string {
	if !h.isRunningInDocker() {
		return ""
	}
	
	cmd := exec.Command("docker", "--version")
	if output, err := cmd.Output(); err == nil {
		version := strings.TrimSpace(string(output))
		// 提取版本号部分
		if parts := strings.Fields(version); len(parts) >= 3 {
			return strings.TrimSuffix(parts[2], ",")
		}
		return version
	}
	return ""
}

// executePing 执行ping命令
func (h *DebugHandler) executePing(host string, count int) PingTestResult {
	result := PingTestResult{
		Host:        host,
		PacketsSent: count,
	}

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("ping", "-n", fmt.Sprintf("%d", count), host)
	default:
		cmd = exec.Command("ping", "-c", fmt.Sprintf("%d", count), host)
	}

	output, err := cmd.Output()
	result.Output = string(output)

	if err != nil {
		result.Success = false
		result.Error = err.Error()
		result.PacketLoss = 100.0
		return result
	}

	// 解析ping输出
	result.Success = true
	result.PacketsRecv, result.PacketLoss, result.MinTime, result.MaxTime, result.AvgTime = h.parsePingOutput(string(output))

	return result
}

// parsePingOutput 解析ping命令输出
func (h *DebugHandler) parsePingOutput(output string) (packetsRecv int, packetLoss float64, minTime, maxTime, avgTime *float64) {
	lines := strings.Split(output, "\n")
	
	// 默认值
	packetLoss = 100.0
	
	for _, line := range lines {
		line = strings.TrimSpace(line)
		
		// Windows ping统计信息格式
		if strings.Contains(line, "Lost = ") {
			var sent, lost int
			if n, _ := fmt.Sscanf(line, "    Packets: Sent = %d, Received = %d, Lost = %d", &sent, &packetsRecv, &lost); n >= 2 {
				if sent > 0 {
					packetLoss = float64(lost) * 100.0 / float64(sent)
				}
			}
		}
		
		// Unix-like系统ping统计信息格式
		if strings.Contains(line, "packet loss") {
			var sent, recv int
			if n, _ := fmt.Sscanf(line, "%d packets transmitted, %d received", &sent, &recv); n == 2 {
				packetsRecv = recv
				if sent > 0 {
					packetLoss = float64(sent-recv) * 100.0 / float64(sent)
				}
			}
		}
		
		// 延迟统计信息（Unix-like系统）
		if strings.Contains(line, "min/avg/max") {
			var min, avg, max float64
			if n, _ := fmt.Sscanf(line, "rtt min/avg/max/mdev = %f/%f/%f", &min, &avg, &max); n == 3 {
				minTime = &min
				avgTime = &avg
				maxTime = &max
			}
		}
	}
	
	return
}