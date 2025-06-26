package api

import (
	log "NodePassDash/internal/log"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"NodePassDash/internal/sse"

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

// HandleGlobalSSE 处理全局SSE连接
func (h *SSEHandler) HandleGlobalSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// 生成客户端ID
	clientID := uuid.New().String()

	// 发送连接成功消息
	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"连接成功"}`)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// log.Infof("前端建立全局SSE连接,clientID=%s remote=%s", clientID, r.RemoteAddr)

	// 添加客户端
	h.sseService.AddClient(clientID, w)
	defer h.sseService.RemoveClient(clientID)

	// 保持连接直到客户端断开
	<-r.Context().Done()

	// log.Infof("全局SSE连接关闭,clientID=%s remote=%s", clientID, r.RemoteAddr)
}

// HandleTunnelSSE 处理隧道SSE连接
func (h *SSEHandler) HandleTunnelSSE(w http.ResponseWriter, r *http.Request) {
	// 设置SSE响应头
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	vars := mux.Vars(r)
	tunnelID := vars["tunnelId"]
	if tunnelID == "" {
		http.Error(w, "Missing tunnelId", http.StatusBadRequest)
		return
	}

	// 生成客户端ID
	clientID := uuid.New().String()

	// 发送连接成功消息
	fmt.Fprintf(w, "data: %s\n\n", `{"type":"connected","message":"连接成功"}`)
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

// HandleSSEStatus 查看SSE连接状态
func (h *SSEHandler) HandleSSEStatus(w http.ResponseWriter, r *http.Request) {
	// 仅允许 GET
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// 设置响应头
	w.Header().Set("Content-Type", "application/json")

	// 获取连接状态
	connectionStatus := h.sseManager.GetConnectionStatus()

	// 构建响应
	response := map[string]interface{}{
		"success":     true,
		"message":     "SSE连接状态查询成功",
		"connections": connectionStatus,
		"summary": map[string]interface{}{
			"total_connections": len(connectionStatus),
			"connected_count": func() int {
				count := 0
				for _, status := range connectionStatus {
					if connected, ok := status["connected"].(bool); ok && connected {
						count++
					}
				}
				return count
			}(),
			"manually_disconnected_count": func() int {
				count := 0
				for _, status := range connectionStatus {
					if manuallyDisconnected, ok := status["manually_disconnected"].(bool); ok && manuallyDisconnected {
						count++
					}
				}
				return count
			}(),
		},
	}

	// 返回JSON响应
	if err := json.NewEncoder(w).Encode(response); err != nil {
		h.loggerError(w, "序列化响应失败", err)
		return
	}
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
