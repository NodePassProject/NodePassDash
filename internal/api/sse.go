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

	"github.com/google/uuid"
	"github.com/gorilla/mux"
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

// HandleTunnelSSE 处理隧道SSE连接
func (h *SSEHandler) HandleTunnelSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Cache-Control")
	w.Header().Set("X-Accel-Buffering", "no") // 禁用nginx缓冲

	vars := mux.Vars(r)
	tunnelID := vars["tunnelId"]
	if tunnelID == "" {
		http.Error(w, "Missing tunnelId", http.StatusBadRequest)
		return
	}

	// 生成客户端ID
	clientID := uuid.New().String()

	// 发送连接成功消息（使用标准SSE格式）
	w.Write([]byte("data: " + `{"type":"connected","message":"连接成功"}` + "\n\n"))
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// log.Infof("前端请求隧道SSE订阅,tunnelID=%s clientID=%s remote=%s", tunnelID, clientID, r.RemoteAddr)

	// 添加客户端并订阅隧道
	h.sseService.AddClient(clientID, w)
	h.sseService.SubscribeToTunnel(clientID, tunnelID)
	defer func() {
		h.sseService.UnsubscribeFromTunnel(clientID, tunnelID)
		h.sseService.RemoveClient(clientID)
	}()

	// 保持连接直到客户端断开
	<-r.Context().Done()

	// log.Infof("隧道SSE连接关闭,tunnelID=%s clientID=%s remote=%s", tunnelID, clientID, r.RemoteAddr)
}

// HandleTestSSEEndpoint 测试端点SSE连接
func (h *SSEHandler) HandleTestSSEEndpoint(w http.ResponseWriter, r *http.Request) {
	// 仅允许 POST
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析请求体
	var req struct {
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"success":false,"error":"无效的JSON"}`, http.StatusBadRequest)
		return
	}

	if req.URL == "" || req.APIPath == "" || req.APIKey == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"success":false,"error":"缺少必要参数"}`))
		return
	}

	// 构造 SSE URL
	sseURL := fmt.Sprintf("%s%s/events", req.URL, req.APIPath)

	// 创建带 8 秒超时的上下文
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
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
		h.loggerError(w, "构建请求失败", err)
		return
	}
	request.Header.Set("X-API-Key", req.APIKey)
	request.Header.Set("Accept", "text/event-stream")

	resp, err := client.Do(request)
	if err != nil {
		h.loggerError(w, "连接失败", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("NodePass SSE返回状态码: %d", resp.StatusCode)
		h.writeError(w, msg)
		return
	}

	// 简单验证 Content-Type
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" && ct != "text/event-stream; charset=utf-8" {
		h.writeError(w, "响应Content-Type不是SSE流")
		return
	}

	// 成功
	res := map[string]interface{}{
		"success": true,
		"message": "连接测试成功",
		"details": map[string]interface{}{
			"url":          req.URL,
			"apiPath":      req.APIPath,
			"isSSLEnabled": strings.HasPrefix(req.URL, "https"),
		},
	}
	json.NewEncoder(w).Encode(res)
}

// writeError 写 JSON 错误响应
func (h *SSEHandler) writeError(w http.ResponseWriter, msg string) {
	w.WriteHeader(http.StatusInternalServerError)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}

// loggerError 同时记录日志并返回错误
func (h *SSEHandler) loggerError(w http.ResponseWriter, prefix string, err error) {
	log.Errorf("[SSE] %v: %v", prefix, err)
	h.writeError(w, fmt.Sprintf("%s: %v", prefix, err))
}

// HandleLogCleanupStats 获取日志清理统计信息
// GET /api/sse/log-cleanup/stats
func (h *SSEHandler) HandleLogCleanupStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stats := h.sseService.GetFileLogger().GetLogCleanupStats()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}

// HandleLogCleanupConfig 管理日志清理配置
// GET /api/sse/log-cleanup/config - 获取配置
// POST /api/sse/log-cleanup/config - 更新配置
func (h *SSEHandler) HandleLogCleanupConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.getLogCleanupConfig(w, r)
	case http.MethodPost:
		h.updateLogCleanupConfig(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// getLogCleanupConfig 获取当前日志清理配置
func (h *SSEHandler) getLogCleanupConfig(w http.ResponseWriter, r *http.Request) {
	stats := h.sseService.GetFileLogger().GetLogCleanupStats()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"retentionDays":    stats["retention_days"],
			"cleanupInterval":  stats["cleanup_interval"],
			"maxRecordsPerDay": stats["max_records_per_day"],
			"cleanupEnabled":   stats["enabled"],
		},
	})
}

// updateLogCleanupConfig 更新日志清理配置
func (h *SSEHandler) updateLogCleanupConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RetentionDays    *int    `json:"retentionDays"`
		CleanupInterval  *string `json:"cleanupInterval"` // 格式: "24h", "12h", "6h"
		MaxRecordsPerDay *int    `json:"maxRecordsPerDay"`
		CleanupEnabled   *bool   `json:"cleanupEnabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
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
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{
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
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "保留天数必须大于0",
		})
		return
	}

	if cleanupInterval < time.Hour {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "清理间隔不能小于1小时",
		})
		return
	}

	if maxRecordsPerDay < 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "每日最大记录数不能为负数",
		})
		return
	}

	// 更新配置
	h.sseService.GetFileLogger().SetLogCleanupConfig(retentionDays, cleanupInterval, maxRecordsPerDay, cleanupEnabled)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "日志清理配置已更新",
		"data": map[string]interface{}{
			"retentionDays":    retentionDays,
			"cleanupInterval":  cleanupInterval.String(),
			"maxRecordsPerDay": maxRecordsPerDay,
			"cleanupEnabled":   cleanupEnabled,
		},
	})
}

// HandleTriggerLogCleanup 手动触发日志清理
// POST /api/sse/log-cleanup/trigger
func (h *SSEHandler) HandleTriggerLogCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 触发日志清理
	h.sseService.GetFileLogger().TriggerManualCleanup()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "日志清理任务已启动，将在后台执行",
	})
}

// HandleNodePassSSEProxy 代理连接到NodePass主控的SSE
// GET /api/sse/nodepass-proxy?endpointId=<base64-encoded-config>
func (h *SSEHandler) HandleNodePassSSEProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 解析端点配置
	endpointIdParam := r.URL.Query().Get("endpointId")
	if endpointIdParam == "" {
		http.Error(w, "Missing endpointId parameter", http.StatusBadRequest)
		return
	}

	// Base64解码端点配置
	configBytes, err := base64.StdEncoding.DecodeString(endpointIdParam)
	if err != nil {
		http.Error(w, "Invalid endpointId parameter", http.StatusBadRequest)
		return
	}

	var config struct {
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}

	if err := json.Unmarshal(configBytes, &config); err != nil {
		http.Error(w, "Invalid endpoint configuration", http.StatusBadRequest)
		return
	}

	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// 发送连接成功消息
	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"NodePass SSE代理连接成功"}`)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// 构造NodePass SSE URL
	sseURL := fmt.Sprintf("%s%s/events", config.URL, config.APIPath)
	log.Infof("[NodePass SSE Proxy] 连接到: %s", sseURL)
	log.Infof("[NodePass SSE Proxy] 配置信息: URL=%s, APIPath=%s, APIKey=%s", config.URL, config.APIPath, config.APIKey)

	// 创建连接上下文
	ctx, cancel := context.WithCancel(r.Context())
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
		fmt.Fprintf(w, "data: %s\n\n", `{"type":"error","message":"创建请求失败"}`)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
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
		fmt.Fprintf(w, "data: %s\n\n", `{"type":"error","message":"连接NodePass失败"}`)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Errorf("[NodePass SSE Proxy] NodePass返回状态码: %d", resp.StatusCode)
		fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf(`{"type":"error","message":"NodePass返回状态码: %d"}`, resp.StatusCode))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		return
	}

	// 验证Content-Type
	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/event-stream") {
		log.Errorf("[NodePass SSE Proxy] 无效的Content-Type: %s", contentType)
		fmt.Fprintf(w, "data: %s\n\n", `{"type":"error","message":"无效的Content-Type"}`)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
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
		if _, err := fmt.Fprintf(w, "%s\n", line); err != nil {
			log.Errorf("[NodePass SSE Proxy] 写入响应失败: %v", err)
			return
		}

		// 立即刷新以确保实时性
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

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
		fmt.Fprintf(w, "data: %s\n\n", `{"type":"error","message":"读取响应失败"}`)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	log.Infof("[NodePass SSE Proxy] 连接结束")
}
