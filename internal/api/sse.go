package api

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/sse"
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/mattn/go-ieproxy"
)

// SSEHandler SSE处理器
type SSEHandler struct {
	sseService *sse.Service
	sseManager *sse.Manager
}

// NewSSEHandler 创建SSE处理器实例
func NewSSEHandler(sseService *sse.Service, sseManager *sse.Manager) *SSEHandler {
	return &SSEHandler{
		sseService: sseService,
		sseManager: sseManager,
	}
}

// setupSSERoutes 设置SSE相关路由
func SetupSSERoutes(rg *gin.RouterGroup, sseService *sse.Service, sseManager *sse.Manager) {
	// 创建SSEHandler实例
	sseHandler := NewSSEHandler(sseService, sseManager)

	// SSE 相关路由
	rg.GET("/sse/tunnel/:tunnelId", sseHandler.HandleTunnelSSE)      // 实例详情页用
	rg.GET("/sse/nodepass-proxy", sseHandler.HandleNodePassSSEProxy) // 主控详情页代理用
	rg.POST("/sse/test", sseHandler.HandleTestSSEEndpoint)           // 添加主控的时候 测试sse是否通用

	// 日志清理相关路由
	rg.GET("/sse/log-cleanup/stats", sseHandler.HandleLogCleanupStats)
	rg.GET("/sse/log-cleanup/config", sseHandler.HandleLogCleanupConfig)
	rg.POST("/sse/log-cleanup/config", sseHandler.HandleLogCleanupConfig)
	rg.POST("/sse/log-cleanup/trigger", sseHandler.HandleTriggerLogCleanup)
}

// HandleTunnelSSE 处理隧道SSE连接
func (h *SSEHandler) HandleTunnelSSE(c *gin.Context) {
	// 设置SSE响应头
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Headers", "Cache-Control")
	c.Header("X-Accel-Buffering", "no") // 禁用nginx缓冲

	tunnelID := c.Param("tunnelId")
	if tunnelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing tunnelId"})
		return
	}

	// 生成客户端ID
	clientID := uuid.New().String()

	// 发送连接成功消息（使用标准SSE格式）
	c.Writer.Write([]byte("data: " + `{"type":"connected","message":"连接成功"}` + "\n\n"))
	c.Writer.Flush()

	// log.Infof("前端请求隧道SSE订阅,tunnelID=%s clientID=%s remote=%s", tunnelID, clientID, c.ClientIP())

	// 添加客户端并订阅隧道
	h.sseService.AddClient(clientID, c.Writer)
	h.sseService.SubscribeToTunnel(clientID, tunnelID)
	defer func() {
		h.sseService.UnsubscribeFromTunnel(clientID, tunnelID)
		h.sseService.RemoveClient(clientID)
	}()

	// 保持连接直到客户端断开
	<-c.Request.Context().Done()

	// log.Infof("隧道SSE连接关闭,tunnelID=%s clientID=%s remote=%s", tunnelID, clientID, c.ClientIP())
}

// HandleTestSSEEndpoint 测试端点SSE连接
func (h *SSEHandler) HandleTestSSEEndpoint(c *gin.Context) {
	// 解析请求体
	var req struct {
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "无效的JSON"})
		return
	}

	if req.URL == "" || req.APIPath == "" || req.APIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "缺少必要参数"})
		return
	}

	// 构造 SSE URL
	sseURL := fmt.Sprintf("%s%s/events", req.URL, req.APIPath)

	// 创建带 8 秒超时的上下文
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	client := &http.Client{
		Transport: &http.Transport{
			// 启用系统/环境代理检测：先读 env，再回退到系统代理
			Proxy:           ieproxy.GetProxyFunc(),
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sseURL, nil)
	if err != nil {
		h.loggerErrorGin(c, "构建请求失败", err)
		return
	}
	request.Header.Set("X-API-Key", req.APIKey)
	request.Header.Set("Accept", "text/event-stream")

	resp, err := client.Do(request)
	if err != nil {
		h.loggerErrorGin(c, "连接失败", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("NodePass SSE返回状态码: %d", resp.StatusCode)
		h.writeErrorGin(c, msg)
		return
	}

	// 简单验证 Content-Type
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" && ct != "text/event-stream; charset=utf-8" {
		h.writeErrorGin(c, "响应Content-Type不是SSE流")
		return
	}

	// 成功
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "连接测试成功",
		"details": gin.H{
			"url":          req.URL,
			"apiPath":      req.APIPath,
			"isSSLEnabled": strings.HasPrefix(req.URL, "https"),
		},
	})
}

// writeErrorGin 写 JSON 错误响应 (使用gin)
func (h *SSEHandler) writeErrorGin(c *gin.Context, msg string) {
	c.JSON(http.StatusInternalServerError, gin.H{
		"success": false,
		"error":   msg,
	})
}

// loggerErrorGin 同时记录日志并返回错误 (使用gin)
func (h *SSEHandler) loggerErrorGin(c *gin.Context, prefix string, err error) {
	log.Errorf("[SSE] %v: %v", prefix, err)
	h.writeErrorGin(c, fmt.Sprintf("%s: %v", prefix, err))
}

// HandleLogCleanupStats 获取日志清理统计信息
// GET /api/sse/log-cleanup/stats
func (h *SSEHandler) HandleLogCleanupStats(c *gin.Context) {
	stats := h.sseService.GetFileLogger().GetLogCleanupStats()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
	})
}

// HandleLogCleanupConfig 管理日志清理配置
// GET /api/sse/log-cleanup/config - 获取配置
// POST /api/sse/log-cleanup/config - 更新配置
func (h *SSEHandler) HandleLogCleanupConfig(c *gin.Context) {
	switch c.Request.Method {
	case http.MethodGet:
		h.getLogCleanupConfig(c)
	case http.MethodPost:
		h.updateLogCleanupConfig(c)
	default:
		c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "Method not allowed"})
	}
}

// getLogCleanupConfig 获取当前日志清理配置
func (h *SSEHandler) getLogCleanupConfig(c *gin.Context) {
	stats := h.sseService.GetFileLogger().GetLogCleanupStats()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"retentionDays":    stats["retention_days"],
			"cleanupInterval":  stats["cleanup_interval"],
			"maxRecordsPerDay": stats["max_records_per_day"],
			"cleanupEnabled":   stats["enabled"],
		},
	})
}

// updateLogCleanupConfig 更新日志清理配置
func (h *SSEHandler) updateLogCleanupConfig(c *gin.Context) {
	var req struct {
		RetentionDays    *int    `json:"retentionDays"`
		CleanupInterval  *string `json:"cleanupInterval"` // 格式: "24h", "12h", "6h"
		MaxRecordsPerDay *int    `json:"maxRecordsPerDay"`
		CleanupEnabled   *bool   `json:"cleanupEnabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "请求格式错误: " + err.Error(),
		})
		return
	}

	// 获取当前配置
	currentStats := h.sseService.GetFileLogger().GetLogCleanupStats()

	// 设置默认值（如果没有提供则使用当前值）
	retentionDays := 7 // 默认值
	if val, ok := currentStats["retention_days"]; ok && val != nil {
		if days, ok := val.(int); ok {
			retentionDays = days
		}
	}
	if req.RetentionDays != nil {
		retentionDays = *req.RetentionDays
	}

	cleanupInterval := 24 * time.Hour
	if req.CleanupInterval != nil {
		if interval, err := time.ParseDuration(*req.CleanupInterval); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "清理间隔格式错误: " + err.Error(),
			})
			return
		} else {
			cleanupInterval = interval
		}
	} else {
		if val, ok := currentStats["cleanup_interval"]; ok && val != nil {
			if intervalStr, ok := val.(string); ok {
				if currentInterval, err := time.ParseDuration(intervalStr); err == nil {
					cleanupInterval = currentInterval
				}
			}
		}
	}

	maxRecordsPerDay := 10000 // 默认值
	if val, ok := currentStats["max_records_per_day"]; ok && val != nil {
		if records, ok := val.(int); ok {
			maxRecordsPerDay = records
		}
	}
	if req.MaxRecordsPerDay != nil {
		maxRecordsPerDay = *req.MaxRecordsPerDay
	}

	cleanupEnabled := true // 默认值
	if val, ok := currentStats["enabled"]; ok && val != nil {
		if enabled, ok := val.(bool); ok {
			cleanupEnabled = enabled
		}
	}
	if req.CleanupEnabled != nil {
		cleanupEnabled = *req.CleanupEnabled
	}

	// 验证参数
	if retentionDays < 1 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "保留天数必须大于0",
		})
		return
	}

	if cleanupInterval < time.Hour {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "清理间隔不能小于1小时",
		})
		return
	}

	if maxRecordsPerDay < 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "每日最大记录数不能为负数",
		})
		return
	}

	// 更新配置
	h.sseService.GetFileLogger().SetLogCleanupConfig(retentionDays, cleanupInterval, maxRecordsPerDay, cleanupEnabled)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "日志清理配置已更新",
		"data": gin.H{
			"retentionDays":    retentionDays,
			"cleanupInterval":  cleanupInterval.String(),
			"maxRecordsPerDay": maxRecordsPerDay,
			"cleanupEnabled":   cleanupEnabled,
		},
	})
}

// HandleTriggerLogCleanup 手动触发日志清理
// POST /api/sse/log-cleanup/trigger
func (h *SSEHandler) HandleTriggerLogCleanup(c *gin.Context) {
	// 触发日志清理
	h.sseService.GetFileLogger().TriggerManualCleanup()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "日志清理任务已启动，将在后台执行",
	})
}

// HandleNodePassSSEProxy 代理连接到NodePass主控的SSE
// GET /api/sse/nodepass-proxy?endpointId=<base64-encoded-config>
func (h *SSEHandler) HandleNodePassSSEProxy(c *gin.Context) {
	// 解析端点配置
	endpointIdParam := c.Query("endpointId")
	if endpointIdParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing endpointId parameter"})
		return
	}

	// Base64解码端点配置
	configBytes, err := base64.StdEncoding.DecodeString(endpointIdParam)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid endpointId parameter"})
		return
	}

	var config struct {
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}

	if err := json.Unmarshal(configBytes, &config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid endpoint configuration"})
		return
	}

	// 设置SSE响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	// 发送连接成功消息
	fmt.Fprintf(c.Writer, "data: %s\n\n", `{"type":"connected","message":"NodePass SSE代理连接成功"}`)
	c.Writer.Flush()

	// 构造NodePass SSE URL
	sseURL := fmt.Sprintf("%s%s/events", config.URL, config.APIPath)
	log.Infof("[NodePass SSE Proxy] 连接到: %s", sseURL)
	log.Infof("[NodePass SSE Proxy] 配置信息: URL=%s, APIPath=%s, APIKey=%s", config.URL, config.APIPath, config.APIKey)

	// 创建连接上下文
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	// 创建HTTP客户端
	client := &http.Client{
		Transport: &http.Transport{
			Proxy:           ieproxy.GetProxyFunc(),
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	// 创建请求
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sseURL, nil)
	if err != nil {
		log.Errorf("[NodePass SSE Proxy] 创建请求失败: %v", err)
		fmt.Fprintf(c.Writer, "data: %s\n\n", `{"type":"error","message":"创建请求失败"}`)
		c.Writer.Flush()
		return
	}

	// 设置必要的请求头
	request.Header.Set("X-API-Key", config.APIKey)
	request.Header.Set("Accept", "text/event-stream")
	request.Header.Set("Cache-Control", "no-cache")

	// 发起请求
	resp, err := client.Do(request)
	if err != nil {
		log.Errorf("[NodePass SSE Proxy] 连接失败: %v", err)
		fmt.Fprintf(c.Writer, "data: %s\n\n", `{"type":"error","message":"连接NodePass失败"}`)
		c.Writer.Flush()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Errorf("[NodePass SSE Proxy] NodePass返回状态码: %d", resp.StatusCode)
		fmt.Fprintf(c.Writer, "data: %s\n\n", fmt.Sprintf(`{"type":"error","message":"NodePass返回状态码: %d"}`, resp.StatusCode))
		c.Writer.Flush()
		return
	}

	// 验证Content-Type
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/event-stream") {
		log.Errorf("[NodePass SSE Proxy] 无效的Content-Type: %s", contentType)
		fmt.Fprintf(c.Writer, "data: %s\n\n", `{"type":"error","message":"无效的Content-Type"}`)
		c.Writer.Flush()
		return
	}

	log.Infof("[NodePass SSE Proxy] 连接成功，开始转发事件")

	// 读取并转发SSE事件
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		// 检查上下文是否已取消
		select {
		case <-ctx.Done():
			log.Infof("[NodePass SSE Proxy] 连接已关闭")
			return
		default:
		}

		// 转发SSE数据行
		if _, err := fmt.Fprintf(c.Writer, "%s\n", line); err != nil {
			log.Errorf("[NodePass SSE Proxy] 写入响应失败: %v", err)
			return
		}

		// 立即刷新以确保实时性
		c.Writer.Flush()

		// 记录所有接收到的行
		if line == "" {
			log.Debugf("[NodePass SSE Proxy] 收到空行（事件分隔符）")
		} else if strings.HasPrefix(line, "data: ") {
			log.Infof("[NodePass SSE Proxy] 收到并转发数据: %s", line[6:]) // 去掉"data: "前缀显示
		} else {
			log.Debugf("[NodePass SSE Proxy] 收到其他行: %s", line)
		}
	}

	if err := scanner.Err(); err != nil {
		log.Errorf("[NodePass SSE Proxy] 读取响应失败: %v", err)
		fmt.Fprintf(c.Writer, "data: %s\n\n", `{"type":"error","message":"读取响应失败"}`)
		c.Writer.Flush()
	}

	log.Infof("[NodePass SSE Proxy] 连接结束")
}
