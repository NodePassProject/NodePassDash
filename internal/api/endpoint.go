package api

import (
	"NodePassDash/internal/db"
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/sse"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/mattn/go-ieproxy"
	"gorm.io/gorm"
)

// EndpointHandler 端点相关的处理器
type EndpointHandler struct {
	endpointService *endpoint.Service
	sseManager      *sse.Manager
}

// NewEndpointHandler 创建端点处理器实例
func NewEndpointHandler(endpointService *endpoint.Service, mgr *sse.Manager) *EndpointHandler {
	return &EndpointHandler{
		endpointService: endpointService,
		sseManager:      mgr,
	}
}

// SetupEndpointRoutes 设置端点相关路由
func SetupEndpointRoutes(rg *gin.RouterGroup, endpointService *endpoint.Service, sseManager *sse.Manager) {
	// 创建EndpointHandler实例
	endpointHandler := NewEndpointHandler(endpointService, sseManager)

	// 端点相关路由
	rg.GET("/endpoints", endpointHandler.HandleGetEndpoints)
	rg.POST("/endpoints", endpointHandler.HandleCreateEndpoint)
	rg.PUT("/endpoints/:id", endpointHandler.HandleUpdateEndpoint)
	rg.DELETE("/endpoints/:id", endpointHandler.HandleDeleteEndpoint)
	rg.PATCH("/endpoints/:id", endpointHandler.HandlePatchEndpoint)
	rg.PATCH("/endpoints", endpointHandler.HandlePatchEndpoint)
	rg.POST("/endpoints/:id/reset-key", endpointHandler.HandleResetApiKey)
	rg.GET("/endpoints/simple", endpointHandler.HandleGetSimpleEndpoints)
	rg.POST("/endpoints/test", endpointHandler.HandleTestEndpoint)
	rg.GET("/endpoints/status", endpointHandler.HandleEndpointStatus)
	rg.GET("/endpoints/:id/detail", endpointHandler.HandleGetEndpointDetail)
	rg.GET("/endpoints/:id/info", endpointHandler.HandleGetEndpointInfo)
	rg.GET("/endpoints/:id/file-logs", endpointHandler.HandleEndpointFileLogs)
	rg.DELETE("/endpoints/:id/file-logs/clear", endpointHandler.HandleClearEndpointFileLogs)
	rg.GET("/endpoints/:id/file-logs/dates", endpointHandler.HandleGetAvailableLogDates)
	rg.GET("/endpoints/:id/stats", endpointHandler.HandleEndpointStats)
	rg.POST("/endpoints/:id/tcping", endpointHandler.HandleTCPing)
	rg.POST("/endpoints/:id/network-debug", endpointHandler.HandleNetworkDebug)
	rg.POST("/endpoints/:id/test-connection", endpointHandler.HandleTestConnection)

	// 全局回收站
	rg.GET("/recycle", endpointHandler.HandleRecycleListAll)
	rg.DELETE("/recycle", endpointHandler.HandleRecycleClearAll)
}

// HandleGetEndpoints 获取端点列表
func (h *EndpointHandler) HandleGetEndpoints(c *gin.Context) {
	endpoints, err := h.endpointService.GetEndpoints()
	if err != nil {
		c.JSON(http.StatusInternalServerError, endpoint.EndpointResponse{
			Success: false,
			Error:   "获取端点列表失败: " + err.Error(),
		})
		return
	}

	if endpoints == nil {
		endpoints = []endpoint.EndpointWithStats{}
	}
	c.JSON(http.StatusOK, endpoints)
}

// HandleCreateEndpoint 创建新端点
func (h *EndpointHandler) HandleCreateEndpoint(c *gin.Context) {
	var req endpoint.CreateEndpointRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 对请求数据进行清理和trim处理
	req.Name = strings.TrimSpace(req.Name)
	req.URL = strings.TrimSpace(req.URL)
	req.APIPath = strings.TrimSpace(req.APIPath)
	req.APIKey = strings.TrimSpace(req.APIKey)

	// 验证请求数据
	if req.Name == "" || req.URL == "" || req.APIPath == "" || req.APIKey == "" {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "缺少必填字段",
		})
		return
	}

	newEndpoint, err := h.endpointService.CreateEndpoint(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 创建成功后，异步启动 SSE 监听
	if h.sseManager != nil && newEndpoint != nil {
		go func(ep *endpoint.Endpoint) {
			log.Infof("[Master-%v] 创建成功，准备启动 SSE 监听", ep.ID)
			if err := h.sseManager.ConnectEndpoint(ep.ID, ep.URL, ep.APIPath, ep.APIKey); err != nil {
				log.Errorf("[Master-%v] 启动 SSE 监听失败: %v", ep.ID, err)
			}
		}(newEndpoint)
	}

	c.JSON(http.StatusOK, endpoint.EndpointResponse{
		Success:  true,
		Message:  "端点创建成功",
		Endpoint: newEndpoint,
	})
}

// HandleUpdateEndpoint 更新端点信息 (PUT /api/endpoints/{id})
func (h *EndpointHandler) HandleUpdateEndpoint(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	var body struct {
		Name    string `json:"name"`
		URL     string `json:"url"`
		APIPath string `json:"apiPath"`
		APIKey  string `json:"apiKey"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 对请求数据进行清理和trim处理
	body.Name = strings.TrimSpace(body.Name)
	body.URL = strings.TrimSpace(body.URL)
	body.APIPath = strings.TrimSpace(body.APIPath)
	body.APIKey = strings.TrimSpace(body.APIKey)

	req := endpoint.UpdateEndpointRequest{
		ID:      id,
		Action:  "update",
		Name:    body.Name,
		URL:     body.URL,
		APIPath: body.APIPath,
		APIKey:  body.APIKey,
	}

	updatedEndpoint, err := h.endpointService.UpdateEndpoint(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, endpoint.EndpointResponse{
		Success:  true,
		Message:  "端点更新成功",
		Endpoint: updatedEndpoint,
	})
}

// HandleDeleteEndpoint 删除端点 (DELETE /api/endpoints/{id})
func (h *EndpointHandler) HandleDeleteEndpoint(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 先获取端点下所有实例ID用于清理文件日志
	var instanceIDs []string
	db := h.endpointService.DB()

	// 从Tunnel表获取实例ID
	var tunnels []models.Tunnel
	if err := db.Select("DISTINCT instance_id").Where("endpoint_id = ? AND instance_id IS NOT NULL AND instance_id != ''", id).Find(&tunnels).Error; err == nil {
		for _, tunnel := range tunnels {
			if tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
				instanceIDs = append(instanceIDs, *tunnel.InstanceID)
			}
		}
	}

	// 从TunnelRecycle表也获取实例ID
	var recycledTunnels []models.TunnelRecycle
	if err := db.Select("DISTINCT instance_id").Where("endpoint_id = ? AND instance_id IS NOT NULL AND instance_id != ''", id).Find(&recycledTunnels).Error; err == nil {
		for _, tunnel := range recycledTunnels {
			if tunnel.InstanceID != nil && *tunnel.InstanceID != "" {
				instanceIDs = append(instanceIDs, *tunnel.InstanceID)
			}
		}
	}

	// 如果存在 SSE 监听，先断开
	if h.sseManager != nil {
		log.Infof("[Master-%v] 删除端点前，先断开 SSE 监听", id)
		h.sseManager.DisconnectEndpoint(id)
		log.Infof("[Master-%v] 已断开 SSE 监听", id)
	}

	log.Infof("[Master-%v] 开始删除端点数据", id)
	if err := h.endpointService.DeleteEndpoint(id); err != nil {
		log.Errorf("[Master-%v] 删除端点失败: %v", id, err)
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 清理所有相关的文件日志
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		for _, instanceID := range instanceIDs {
			if err := h.sseManager.GetFileLogger().ClearLogs(id, instanceID); err != nil {
				log.Warnf("[API] 端点删除-清理文件日志失败: endpointID=%d, instanceID=%s, err=%v", id, instanceID, err)
			} else {
				log.Infof("[API] 端点删除-已清理文件日志: endpointID=%d, instanceID=%s", id, instanceID)
			}
		}
	}

	log.Infof("[Master-%v] 端点及其隧道已删除", id)

	c.JSON(http.StatusOK, endpoint.EndpointResponse{
		Success: true,
		Message: "端点删除成功",
	})
}

// HandlePatchEndpoint PATCH /api/endpoints/{id}
func (h *EndpointHandler) HandlePatchEndpoint(c *gin.Context) {
	idStr := c.Param("id")

	// 先解析 body，可能包含 id
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	var id int64
	if idStr != "" {
		parsed, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
				Success: false,
				Error:   "无效的端点ID",
			})
			return
		}
		id = parsed
	} else {
		// 从 body 提取 id 字段（JSON 编码后数字为 float64）
		if idVal, ok := body["id"].(float64); ok {
			id = int64(idVal)
		} else {
			c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
				Success: false,
				Error:   "缺少端点ID",
			})
			return
		}
	}

	action, _ := body["action"].(string)
	switch action {
	case "rename":
		name, _ := body["name"].(string)
		name = strings.TrimSpace(name) // 清理和trim处理
		req := endpoint.UpdateEndpointRequest{
			ID:     id,
			Action: "rename",
			Name:   name,
		}
		if _, err := h.endpointService.UpdateEndpoint(req); err != nil {
			c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{Success: false, Error: err.Error()})
			return
		}
		c.JSON(http.StatusOK, endpoint.EndpointResponse{
			Success: true,
			Message: "端点名称已更新",
			Endpoint: map[string]interface{}{
				"id":   id,
				"name": name,
			},
		})
	case "reconnect":
		if h.sseManager != nil {
			ep, err := h.endpointService.GetEndpointByID(id)
			if err != nil {
				c.JSON(http.StatusInternalServerError, endpoint.EndpointResponse{Success: false, Error: "获取端点信息失败: " + err.Error()})
				return
			}

			// 先测试端点连接
			if err := h.testEndpointConnection(ep.URL, ep.APIPath, ep.APIKey, 5000); err != nil {
				log.Warnf("[Master-%v] 端点连接测试失败: %v", id, err)
				c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{Success: false, Error: "主控离线或无法连接: " + err.Error()})
				return
			}

			go func(eid int64) {
				log.Infof("[Master-%v] 手动重连端点，启动 SSE", eid)
				if err := h.sseManager.ConnectEndpoint(eid, ep.URL, ep.APIPath, ep.APIKey); err != nil {
					log.Errorf("[Master-%v] 手动重连端点失败: %v", eid, err)
				}
			}(id)
		}
		c.JSON(http.StatusOK, endpoint.EndpointResponse{Success: true, Message: "端点已重连"})
	case "disconnect":
		if h.sseManager != nil {
			go func(eid int64) {
				log.Infof("[Master-%v] 手动断开端点 SSE", eid)
				h.sseManager.DisconnectEndpoint(eid)

				// 更新端点状态为 OFFLINE
				// if err := h.endpointService.UpdateEndpointStatus(eid, endpoint.StatusOffline); err != nil {
				// 	log.Errorf("[Master-%v] 更新端点状态为 OFFLINE 失败: %v", eid, err)
				// } else {
				// 	log.Infof("[Master-%v] 端点状态已更新为 OFFLINE", eid)
				// }
			}(id)
		}
		c.JSON(http.StatusOK, endpoint.EndpointResponse{Success: true, Message: "端点已断开"})
	case "refresTunnel":
		if err := h.refreshTunnels(id); err != nil {
			c.JSON(http.StatusInternalServerError, endpoint.EndpointResponse{Success: false, Error: err.Error()})
			return
		}
		c.JSON(http.StatusOK, endpoint.EndpointResponse{Success: true, Message: "实例同步完成"})
	case "updateConfig":
		// 修改配置：直接更新配置和缓存，SSE会自动使用新的缓存配置
		var req endpoint.UpdateEndpointRequest
		req.ID = id
		req.Action = "updateConfig"

		// 从body中获取参数
		if name, ok := body["name"].(string); ok {
			req.Name = strings.TrimSpace(name)
		}
		if url, ok := body["url"].(string); ok {
			req.URL = strings.TrimSpace(url)
			// 从完整URL中分离baseURL和apiPath
			if parsedURL := h.parseFullURL(req.URL); parsedURL != nil {
				req.URL = parsedURL.BaseURL
				req.APIPath = parsedURL.APIPath
			}
		}
		if apiKey, ok := body["apiKey"].(string); ok {
			req.APIKey = strings.TrimSpace(apiKey)
		}

		// 更新数据库配置（UpdateEndpoint内部会自动更新缓存）
		updatedEndpoint, err := h.endpointService.UpdateEndpoint(req)
		if err != nil {
			c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{Success: false, Error: err.Error()})
			return
		}

		log.Infof("[Master-%v] 配置更新成功，缓存已更新: URL=%s, APIPath=%s", id, updatedEndpoint.URL, updatedEndpoint.APIPath)
		c.JSON(http.StatusOK, endpoint.EndpointResponse{Success: true, Message: "配置更新成功"})
	default:
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{Success: false, Error: "不支持的操作类型"})
	}
}

// HandleGetSimpleEndpoints GET /api/endpoints/simple
func (h *EndpointHandler) HandleGetSimpleEndpoints(c *gin.Context) {
	excludeFailed := c.Query("excludeFailed") == "true"
	endpoints, err := h.endpointService.GetSimpleEndpoints(excludeFailed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, endpoint.EndpointResponse{Success: false, Error: err.Error()})
		return
	}

	if endpoints == nil {
		endpoints = []endpoint.SimpleEndpoint{}
	}
	c.JSON(http.StatusOK, endpoints)
}

// TestConnectionRequest 测试端点连接请求
type TestConnectionRequest struct {
	URL     string `json:"url"`
	APIPath string `json:"apiPath"`
	APIKey  string `json:"apiKey"`
	Timeout int    `json:"timeout"`
}

// HandleTestEndpoint POST /api/endpoints/test
func (h *EndpointHandler) HandleTestEndpoint(c *gin.Context) {
	var req TestConnectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"success": false, "error": "无效请求体"})
		return
	}

	// 对请求数据进行清理和trim处理
	req.URL = strings.TrimSpace(req.URL)
	req.APIPath = strings.TrimSpace(req.APIPath)
	req.APIKey = strings.TrimSpace(req.APIKey)

	if req.Timeout <= 0 {
		req.Timeout = 10000
	}

	testURL := req.URL + req.APIPath + "/events"

	client := &http.Client{
		Timeout: time.Duration(req.Timeout) * time.Millisecond,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	httpReq, err := http.NewRequest("GET", testURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	httpReq.Header.Set("X-API-Key", req.APIKey)
	httpReq.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		c.JSON(http.StatusOK, map[string]interface{}{"success": false, "error": "HTTP错误", "status": resp.StatusCode, "details": string(bodyBytes)})
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{"success": true, "message": "端点连接测试成功", "status": resp.StatusCode})
}

// HandleEndpointStatus GET /api/endpoints/status (SSE)
func (h *EndpointHandler) HandleEndpointStatus(c *gin.Context) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming unsupported"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	send := func() {
		endpoints, err := h.endpointService.GetEndpoints()
		if err != nil {
			return
		}
		data, _ := json.Marshal(endpoints)
		fmt.Fprintf(c.Writer, "data: %s\n\n", data)
		flusher.Flush()
	}

	send()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	notify := c.Request.Context().Done()
	for {
		select {
		case <-notify:
			return
		case <-ticker.C:
			send()
		}
	}
}

// HandleEndpointLogs 根据 endpointId 查询最近 limit 条日志(从文件读取)
func (h *EndpointHandler) HandleEndpointLogs(c *gin.Context) {
	// Method validation removed - handled by Gin router

	idStr := c.Param("id")
	if idStr == "" {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "缺少端点ID"})
		return
	}

	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	// 解析 limit 参数，默认 1000
	limit := 1000
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
		}
	}

	// 解析 instanceId 参数
	instanceID := c.Query("instanceId")
	if instanceID == "" {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "缺少实例ID"})
		return
	}

	// 解析 days 参数，默认查询最近3天
	days := 3
	if d := c.Query("days"); d != "" {
		if v, err := strconv.Atoi(d); err == nil && v > 0 && v <= 30 {
			days = v
		}
	}

	// TODO: 这里需要获取文件日志管理器的引用
	// 暂时返回模拟数据，实际实现需要从SSE服务获取fileLogger
	logs := []map[string]interface{}{
		{
			"id":        1,
			"message":   fmt.Sprintf("端点%d实例%s的文件日志示例", endpointID, instanceID),
			"isHtml":    true,
			"traffic":   map[string]int64{"tcpRx": 0, "tcpTx": 0, "udpRx": 0, "udpTx": 0},
			"timestamp": time.Now(),
		},
	}

	// 返回数据，兼容旧前端结构
	c.JSON(http.StatusOK, map[string]interface{}{
		"logs":        logs,
		"success":     true,
		"storageMode": "file", // 标识为文件存储模式
		"info":        fmt.Sprintf("从文件读取端点%d最近%d天的日志，限制%d条", endpointID, days, limit),
	})
}

// HandleSearchEndpointLogs GET /api/endpoints/{id}/logs/search
// 支持查询条件: level, instanceId, start, end, page, size
func (h *EndpointHandler) HandleSearchEndpointLogs(c *gin.Context) {
	// Method validation removed - handled by Gin router

	idStr := c.Param("id")
	if idStr == "" {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "缺少端点ID"})
		return
	}
	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	level := strings.ToLower(c.Query("level"))
	instanceID := c.Query("instanceId")
	start := c.Query("start")
	end := c.Query("end")
	page, _ := strconv.Atoi(c.Query("page"))
	if page <= 0 {
		page = 1
	}
	size, _ := strconv.Atoi(c.Query("size"))
	if size <= 0 {
		size = 20
	}

	// 如果仅提供日期(yyyy-mm-dd)，转换为起止时间字符串
	constDateLayout := "2006-01-02"
	constDateTimeLayout := "2006-01-02 15:04:05"

	if len(start) == 10 {
		if t, err := time.Parse(constDateLayout, start); err == nil {
			start = t.Format(constDateTimeLayout) // 默认 00:00:00 已包含
		}
	}
	if len(end) == 10 {
		if t, err := time.Parse(constDateLayout, end); err == nil {
			// 设置为当天 23:59:59 末尾
			end = t.Add(24*time.Hour - time.Second).Format(constDateTimeLayout)
		}
	}

	db := h.endpointService.DB()

	// 构造GORM查询
	query := db.Model(&models.EndpointSSE{}).Where("endpoint_id = ? AND event_type = 'log'", endpointID)

	if instanceID != "" {
		query = query.Where("instance_id = ?", instanceID)
	}

	if start != "" {
		query = query.Where("created_at >= ?", start)
	}
	if end != "" {
		query = query.Where("created_at <= ?", end)
	}

	if level != "" && level != "all" {
		query = query.Where("LOWER(logs) LIKE ?", "%"+level+"%")
	}

	// 查询总数
	var total int64
	if err := query.Count(&total).Error; err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	// 查询分页数据
	offset := (page - 1) * size
	var endpointSSEList []models.EndpointSSE
	if err := query.Select("id, created_at, logs, instance_id").Order("created_at DESC").Limit(size).Offset(offset).Find(&endpointSSEList).Error; err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	logs := make([]map[string]interface{}, 0)
	for _, sse := range endpointSSEList {
		logsStr := ""
		if sse.Logs != nil {
			logsStr = *sse.Logs
		}
		instanceIDStr := ""
		if sse.InstanceID != "" {
			instanceIDStr = sse.InstanceID
		}

		logs = append(logs, map[string]interface{}{
			"id":         sse.ID,
			"createAt":   sse.CreatedAt.Format("2006-01-02 15:04:05"),
			"message":    logsStr,
			"instanceId": instanceIDStr,
			"level": func() string { // 简单解析日志行级别
				upper := strings.ToUpper(logsStr)
				switch {
				case strings.Contains(upper, "ERROR"):
					return "ERROR"
				case strings.Contains(upper, "WARN"):
					return "WARN"
				case strings.Contains(upper, "DEBUG"):
					return "DEBUG"
				case strings.Contains(upper, "EVENTS"):
					return "EVENTS"
				default:
					return "INFO"
				}
			}(),
		})
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"total":   total,
		"page":    page,
		"size":    size,
		"totalPages": func() int {
			if size == 0 {
				return 0
			}
			totalInt := int(total)
			if totalInt%size == 0 {
				return totalInt / size
			} else {
				return totalInt/size + 1
			}
		}(),
		"logs": logs,
	})
}

// HandleRecycleList 获取指定端点回收站隧道 (GET /api/endpoints/{id}/recycle)
func (h *EndpointHandler) HandleRecycleList(c *gin.Context) {
	// Method validation removed - handled by Gin router
	idStr := c.Param("id")
	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	db := h.endpointService.DB()

	// 查询 TunnelRecycle 表所有字段
	var recycledTunnels []models.TunnelRecycle
	if err := db.Where("endpoint_id = ?", endpointID).Order("id DESC").Find(&recycledTunnels).Error; err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	type recycleItem struct {
		ID            int64          `json:"id"`
		Name          string         `json:"name"`
		Mode          string         `json:"mode"`
		TunnelAddress string         `json:"tunnelAddress"`
		TunnelPort    string         `json:"tunnelPort"`
		TargetAddress string         `json:"targetAddress"`
		TargetPort    string         `json:"targetPort"`
		TLSMode       string         `json:"tlsMode"`
		CertPath      sql.NullString `json:"certPath"`
		KeyPath       sql.NullString `json:"keyPath"`
		LogLevel      string         `json:"logLevel"`
		CommandLine   string         `json:"commandLine"`
		InstanceID    sql.NullString `json:"instanceId"`
		Password      string         `json:"password"`
		TCPRx         int64          `json:"tcpRx"`
		TCPTx         int64          `json:"tcpTx"`
		UDPRx         int64          `json:"udpRx"`
		UDPTx         int64          `json:"udpTx"`
		Min           sql.NullInt64  `json:"min"`
		Max           sql.NullInt64  `json:"max"`
	}

	list := make([]recycleItem, 0)
	for _, tunnel := range recycledTunnels {
		item := recycleItem{
			ID:            tunnel.ID,
			Name:          tunnel.Name,
			Mode:          string(tunnel.Mode),
			TunnelAddress: tunnel.TunnelAddress,
			TunnelPort:    tunnel.TunnelPort,
			TargetAddress: tunnel.TargetAddress,
			TargetPort:    tunnel.TargetPort,
			TLSMode:       string(tunnel.TLSMode),
			LogLevel:      string(tunnel.LogLevel),
			CommandLine:   tunnel.CommandLine,
			Password:      "", // 密码字段不返回
			TCPRx:         tunnel.TCPRx,
			TCPTx:         tunnel.TCPTx,
			UDPRx:         tunnel.UDPRx,
			UDPTx:         tunnel.UDPTx,
		}

		// 处理可选字段
		if tunnel.CertPath != nil {
			item.CertPath = sql.NullString{String: *tunnel.CertPath, Valid: true}
		}
		if tunnel.KeyPath != nil {
			item.KeyPath = sql.NullString{String: *tunnel.KeyPath, Valid: true}
		}
		if tunnel.InstanceID != nil {
			item.InstanceID = sql.NullString{String: *tunnel.InstanceID, Valid: true}
		}
		if tunnel.Min != nil {
			item.Min = sql.NullInt64{Int64: *tunnel.Min, Valid: true}
		}
		if tunnel.Max != nil {
			item.Max = sql.NullInt64{Int64: *tunnel.Max, Valid: true}
		}

		list = append(list, item)
	}

	c.JSON(http.StatusOK, list)
}

// HandleRecycleCount 获取回收站数量 (GET /api/endpoints/{id}/recycle/count)
func (h *EndpointHandler) HandleRecycleCount(c *gin.Context) {
	// Method validation removed - handled by Gin router
	idStr := c.Param("id")
	endpointID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "无效的端点ID"})
		return
	}

	db := h.endpointService.DB()
	var count int64
	err = db.Model(&models.TunnelRecycle{}).Where("endpoint_id = ?", endpointID).Count(&count).Error
	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, map[string]interface{}{"count": count})
}

// HandleRecycleDelete 删除回收站记录并清空相关 SSE (DELETE /api/endpoints/{endpointId}/recycle/{recycleId})
func (h *EndpointHandler) HandleRecycleDelete(c *gin.Context) {
	// Method validation removed - handled by Gin router

	epStr := c.Param("endpointId")
	recStr := c.Param("recycleId")

	endpointID, err1 := strconv.ParseInt(epStr, 10, 64)
	recycleID, err2 := strconv.ParseInt(recStr, 10, 64)
	if err1 != nil || err2 != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": "无效的ID"})
		return
	}

	db := h.endpointService.DB()

	// 获取 instanceId
	var tunnelRecycle models.TunnelRecycle
	err := db.Select("instance_id").Where("id = ? AND endpoint_id = ?", recycleID, endpointID).First(&tunnelRecycle).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// Status handled by c.JSON
			c.JSON(http.StatusOK, map[string]interface{}{"error": "记录不存在"})
			return
		}
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		// 删除 TunnelRecycle 记录
		if err := tx.Delete(&models.TunnelRecycle{}, recycleID).Error; err != nil {
			return err
		}

		// 删除 EndpointSSE 记录
		if tunnelRecycle.InstanceID != nil && *tunnelRecycle.InstanceID != "" {
			if err := tx.Delete(&models.EndpointSSE{}, "endpoint_id = ? AND instance_id = ?", endpointID, *tunnelRecycle.InstanceID).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	// 清理文件日志（如果有有效的实例ID）
	if tunnelRecycle.InstanceID != nil && *tunnelRecycle.InstanceID != "" && h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		if err := h.sseManager.GetFileLogger().ClearLogs(endpointID, *tunnelRecycle.InstanceID); err != nil {
			log.Warnf("[API] 回收站删除-清理文件日志失败: endpointID=%d, instanceID=%s, err=%v", endpointID, *tunnelRecycle.InstanceID, err)
		} else {
			log.Infof("[API] 回收站删除-已清理文件日志: endpointID=%d, instanceID=%s", endpointID, *tunnelRecycle.InstanceID)
		}
	}

	c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// HandleRecycleListAll 获取全部端点的回收站隧道 (GET /api/recycle)
func (h *EndpointHandler) HandleRecycleListAll(c *gin.Context) {
	// Method validation removed - handled by Gin router

	db := h.endpointService.DB()

	// 使用GORM查询TunnelRecycle
	var recycledTunnels []models.TunnelRecycle
	if err := db.Order("id DESC").Find(&recycledTunnels).Error; err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	// 获取所有端点信息用于映射
	var endpoints []models.Endpoint
	if err := db.Find(&endpoints).Error; err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	// 创建端点ID到名称的映射
	endpointMap := make(map[int64]string)
	for _, ep := range endpoints {
		endpointMap[ep.ID] = ep.Name
	}

	type recycleItemAll struct {
		ID            int64          `json:"id"`
		EndpointID    int64          `json:"endpointId"`
		EndpointName  string         `json:"endpointName"`
		Name          string         `json:"name"`
		Mode          string         `json:"mode"`
		TunnelAddress string         `json:"tunnelAddress"`
		TunnelPort    string         `json:"tunnelPort"`
		TargetAddress string         `json:"targetAddress"`
		TargetPort    string         `json:"targetPort"`
		TLSMode       string         `json:"tlsMode"`
		CertPath      sql.NullString `json:"certPath"`
		KeyPath       sql.NullString `json:"keyPath"`
		LogLevel      string         `json:"logLevel"`
		CommandLine   string         `json:"commandLine"`
		InstanceID    sql.NullString `json:"instanceId"`
		Password      string         `json:"password"`
		TCPRx         int64          `json:"tcpRx"`
		TCPTx         int64          `json:"tcpTx"`
		UDPRx         int64          `json:"udpRx"`
		UDPTx         int64          `json:"udpTx"`
		Min           sql.NullInt64  `json:"min"`
		Max           sql.NullInt64  `json:"max"`
	}

	list := make([]recycleItemAll, 0)
	for _, tunnel := range recycledTunnels {
		item := recycleItemAll{
			ID:            tunnel.ID,
			EndpointID:    tunnel.EndpointID,
			EndpointName:  endpointMap[tunnel.EndpointID],
			Name:          tunnel.Name,
			Mode:          string(tunnel.Mode),
			TunnelAddress: tunnel.TunnelAddress,
			TunnelPort:    tunnel.TunnelPort,
			TargetAddress: tunnel.TargetAddress,
			TargetPort:    tunnel.TargetPort,
			TLSMode:       string(tunnel.TLSMode),
			LogLevel:      string(tunnel.LogLevel),
			CommandLine:   tunnel.CommandLine,
			Password:      "", // 密码字段不返回
			TCPRx:         tunnel.TCPRx,
			TCPTx:         tunnel.TCPTx,
			UDPRx:         tunnel.UDPRx,
			UDPTx:         tunnel.UDPTx,
		}

		// 处理可选字段
		if tunnel.CertPath != nil {
			item.CertPath = sql.NullString{String: *tunnel.CertPath, Valid: true}
		}
		if tunnel.KeyPath != nil {
			item.KeyPath = sql.NullString{String: *tunnel.KeyPath, Valid: true}
		}
		if tunnel.InstanceID != nil {
			item.InstanceID = sql.NullString{String: *tunnel.InstanceID, Valid: true}
		}
		if tunnel.Min != nil {
			item.Min = sql.NullInt64{Int64: *tunnel.Min, Valid: true}
		}
		if tunnel.Max != nil {
			item.Max = sql.NullInt64{Int64: *tunnel.Max, Valid: true}
		}

		list = append(list, item)
	}

	c.JSON(http.StatusOK, list)
}

// HandleRecycleClearAll 清空全部回收站记录 (DELETE /api/recycle)
func (h *EndpointHandler) HandleRecycleClearAll(c *gin.Context) {
	// Method validation removed - handled by Gin router

	db := h.endpointService.DB()

	// 先获取所有回收站记录用于清理文件日志
	var recycleItems []struct {
		EndpointID int64
		InstanceID sql.NullString
	}

	var allRecycles []models.TunnelRecycle
	if err := db.Select("endpoint_id, instance_id").Where("instance_id IS NOT NULL AND instance_id != ''").Find(&allRecycles).Error; err == nil {
		for _, recycle := range allRecycles {
			item := struct {
				EndpointID int64
				InstanceID sql.NullString
			}{
				EndpointID: recycle.EndpointID,
			}
			if recycle.InstanceID != nil {
				item.InstanceID = sql.NullString{String: *recycle.InstanceID, Valid: true}
			}
			recycleItems = append(recycleItems, item)
		}
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		// 删除 EndpointSSE 记录中对应实例
		if err := tx.Where("instance_id IN (SELECT instance_id FROM tunnel_recycles WHERE instance_id IS NOT NULL AND instance_id != '')").Delete(&models.EndpointSSE{}).Error; err != nil {
			return err
		}

		// 删除所有回收站记录
		if err := tx.Where("1 = 1").Delete(&models.TunnelRecycle{}).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		// Status handled by c.JSON
		c.JSON(http.StatusOK, map[string]interface{}{"error": err.Error()})
		return
	}

	// 清理所有相关的文件日志
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		for _, item := range recycleItems {
			if item.InstanceID.Valid {
				if err := h.sseManager.GetFileLogger().ClearLogs(item.EndpointID, item.InstanceID.String); err != nil {
					log.Warnf("[API] 清空回收站-清理文件日志失败: endpointID=%d, instanceID=%s, err=%v", item.EndpointID, item.InstanceID.String, err)
				} else {
					log.Infof("[API] 清空回收站-已清理文件日志: endpointID=%d, instanceID=%s", item.EndpointID, item.InstanceID.String)
				}
			}
		}
	}

	c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// buildTunnelFromInstance 从实例数据构建隧道模型，类似 sse/service.go 的 buildTunnel
func buildTunnelFromInstance(endpointID int64, inst nodepass.InstanceResult) *models.Tunnel {
	// 使用 nodepass.ParseTunnelURL 解析 URL 获取基本信息
	tunnel := nodepass.ParseTunnelURL(inst.URL)
	// 补充从EndpointSSE获取的信息
	tunnel.EndpointID = endpointID
	tunnel.InstanceID = &inst.ID
	tunnel.TCPRx = inst.TCPRx
	tunnel.TCPTx = inst.TCPTx
	tunnel.UDPRx = inst.UDPRx
	tunnel.UDPTx = inst.UDPTx
	tunnel.TCPs = inst.TCPs
	tunnel.UDPs = inst.UDPs
	tunnel.Pool = inst.Pool
	tunnel.Ping = inst.Ping
	// tunnel.LastEventTime = &payload.TimeStamp
	tunnel.EnableLogStore = true
	tunnel.Restart = inst.Restart
	tunnel.Name = *inst.Alias
	tunnel.Status = models.TunnelStatus(inst.Status)
	tunnel.ProxyProtocol = inst.ProxyProtocol

	tunnel.Tags = inst.Meta.Tags
	tunnel.Peer = inst.Meta.Peer

	// 同步设置 service_sid 字段
	if tunnel.Peer != nil && tunnel.Peer.SID != nil {
		tunnel.ServiceSID = tunnel.Peer.SID
	}

	if tunnel.Mode == nil {
		tunnel.Mode = (*models.TunnelMode)(inst.Mode)
	}

	// 复制Config字段到configLine
	if inst.Config != nil {
		tunnel.ConfigLine = inst.Config
	}

	return tunnel
}

// refreshTunnels 同步指定端点的隧道信息
func (h *EndpointHandler) refreshTunnels(endpointID int64) error {
	log.Infof("[API] 刷新端点 %v 的隧道信息", endpointID)

	// 获取实例列表
	instances, err := nodepass.GetInstances(endpointID)
	if err != nil {
		log.Errorf("[API] 获取实例列表失败: %v", err)
		return fmt.Errorf("获取实例列表失败: %v", err)
	}

	db := h.endpointService.DB()
	if db == nil {
		return fmt.Errorf("数据库连接不可用")
	}

	// 记录 NodePass 实例 ID，便于后续删除不存在的隧道
	instanceIDSet := make(map[string]struct{})

	// 使用事务执行
	err = db.Transaction(func(tx *gorm.DB) error {
		// 处理每个实例
		for _, inst := range instances {
			if inst.Type == "" {
				log.Debugf("[API] 端点 %d: 跳过空类型实例 %s", endpointID, inst.ID)
				continue
			}

			instanceIDSet[inst.ID] = struct{}{}

			// 使用新的 buildTunnelFromInstance 方法构建隧道模型
			tunnel := buildTunnelFromInstance(endpointID, inst)
			if tunnel == nil {
				log.Warnf("[API] 端点 %d: 无法构建隧道模型，跳过实例 %s", endpointID, inst.ID)
				continue
			}

			// 检查隧道是否已存在
			var existingTunnel models.Tunnel
			err := tx.Where("endpoint_id = ? AND instance_id = ?", endpointID, inst.ID).First(&existingTunnel).Error

			if err == gorm.ErrRecordNotFound {
				// 创建新隧道 - 类似 handleInitialEvent 逻辑
				if err = tx.Create(tunnel).Error; err != nil {
					log.Errorf("[API] 端点 %d: 创建隧道 %s 失败: %v", endpointID, inst.ID, err)
					return fmt.Errorf("创建隧道失败: %v", err)
				}
				log.Infof("[API] 端点 %d: 创建新隧道 %s (%s)", endpointID, inst.ID, tunnel.Name)
			} else if err != nil {
				// 查询出错
				log.Errorf("[API] 端点 %d: 查询隧道 %s 失败: %v", endpointID, inst.ID, err)
				return fmt.Errorf("查询隧道失败: %v", err)
			} else {
				updates := nodepass.TunnelToMap(tunnel)
				if err = tx.Model(&models.Tunnel{}).Where("id = ?", existingTunnel.ID).Updates(updates).Error; err != nil {
					log.Errorf("[API] 端点 %d: 更新隧道 %s 失败: %v", endpointID, inst.ID, err)
					return fmt.Errorf("更新隧道失败: %v", err)
				}
				log.Debugf("[API] 端点 %d: 更新隧道 %s (%s) 运行时信息", endpointID, inst.ID, tunnel.Name)
			}
		}

		// 删除不再存在的隧道
		var existingTunnels []models.Tunnel
		if err = tx.Select("id, instance_id").Where("endpoint_id = ?", endpointID).Find(&existingTunnels).Error; err != nil {
			return fmt.Errorf("查询现有隧道失败: %v", err)
		}

		for _, tunnel := range existingTunnels {
			if tunnel.InstanceID != nil {
				if _, exists := instanceIDSet[*tunnel.InstanceID]; !exists {
					// 先删除相关的操作日志记录，避免外键约束错误
					if err = tx.Where("tunnel_id = ?", tunnel.ID).Delete(&models.TunnelOperationLog{}).Error; err != nil {
						log.Warnf("[API] 删除隧道 %d 操作日志失败: %v", tunnel.ID, err)
					}

					if err = tx.Delete(&models.Tunnel{}, tunnel.ID).Error; err != nil {
						return fmt.Errorf("删除隧道失败: %v", err)
					}
					log.Infof("[API] 端点 %d: 删除不存在的隧道 %d (实例 %s)", endpointID, tunnel.ID, *tunnel.InstanceID)
				}
			}
		}

		log.Debugf("[API] 端点 %d: 隧道信息同步完成", endpointID)
		return nil
	})

	// 如果事务成功，异步更新隧道计数
	if err == nil {
		go func(id int64) {
			time.Sleep(50 * time.Millisecond)
			updateEndpointTunnelCount(id)
		}(endpointID)
	}

	return err
}

// testEndpointConnection 测试端点连接是否可用
func (h *EndpointHandler) testEndpointConnection(url, apiPath, apiKey string, timeoutMs int) error {
	testURL := url + apiPath + "/events"

	client := &http.Client{
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
		Transport: &http.Transport{
			Proxy:           ieproxy.GetProxyFunc(),
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}

	httpReq, err := http.NewRequest("GET", testURL, nil)
	if err != nil {
		return fmt.Errorf("创建请求失败: %v", err)
	}
	httpReq.Header.Set("X-API-Key", apiKey)
	httpReq.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("连接失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP错误: %d", resp.StatusCode)
	}

	return nil
}

// HandleGetEndpointInfo 获取端点系统信息
func (h *EndpointHandler) HandleGetEndpointInfo(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 获取端点信息
	ep, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 尝试获取系统信息 (处理低版本API不存在的情况)
	var info *nodepass.EndpointInfoResult
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Warnf("[Master-%v] 获取系统信息失败(可能为低版本): %v", ep.ID, r)
			}
		}()

		info, err = nodepass.GetInfo(id)
		if err != nil {
			log.Warnf("[Master-%v] 获取系统信息失败: %v", ep.ID, err)
			// 不返回错误，继续处理
		}
	}()

	// 如果成功获取到信息，更新数据库
	if info != nil && err == nil {
		if updateErr := h.endpointService.UpdateEndpointInfo(id, *info); updateErr != nil {
			log.Errorf("[Master-%v] 更新系统信息失败: %v", ep.ID, updateErr)
		} else {
			// 在日志中显示uptime信息
			uptimeMsg := fmt.Sprintf("%d秒", info.Uptime)
			log.Infof("[Master-%v] 系统信息已更新: OS=%s, Arch=%s, Ver=%s, Uptime=%s", ep.ID, info.OS, info.Arch, info.Ver, uptimeMsg)
		}

		c.JSON(http.StatusOK, endpoint.EndpointResponse{
			Success:  true,
			Message:  "系统信息获取成功",
			Endpoint: info,
		})
	} else {
		// 返回当前已存储的信息
		var storedUptime *int64
		if ep.Uptime != nil && *ep.Uptime > 0 {
			storedUptime = ep.Uptime
		}

		infoResponse := endpoint.NodePassInfo{
			OS: func() string {
				if ep.OS != nil {
					return *ep.OS
				}
				return ""
			}(),
			Arch: func() string {
				if ep.Arch != nil {
					return *ep.Arch
				}
				return ""
			}(),
			Ver: func() string {
				if ep.Ver != nil {
					return *ep.Ver
				}
				return ""
			}(),
			Name: ep.Name,
			Log: func() string {
				if ep.Log != nil {
					return *ep.Log
				}
				return ""
			}(),
			TLS: func() string {
				if ep.TLS != nil {
					return *ep.TLS
				}
				return ""
			}(),
			Crt: func() string {
				if ep.Crt != nil {
					return *ep.Crt
				}
				return ""
			}(),
			Key: func() string {
				if ep.KeyPath != nil {
					return *ep.KeyPath
				}
				return ""
			}(),
			Uptime: storedUptime,
		}

		c.JSON(http.StatusOK, endpoint.EndpointResponse{
			Success:  true,
			Message:  "返回已存储的系统信息",
			Endpoint: infoResponse,
		})
	}
}

// HandleGetEndpointDetail 获取端点详细信息
func (h *EndpointHandler) HandleGetEndpointDetail(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 先获取端点基本信息（用于连接NodePass API）
	ep, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 尝试调用NodePass API获取最新信息并更新数据库
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Warnf("[Master-%v] 获取最新系统信息失败(panic): %v", ep.ID, r)
			}
		}()

		// 尝试获取系统信息
		info, err := nodepass.GetInfo(id)
		if err != nil {
			log.Warnf("[Master-%v] 调用NodePass API获取系统信息失败: %v", ep.ID, err)
			return
		}

		if info != nil {
			// 更新数据库中的系统信息
			if updateErr := h.endpointService.UpdateEndpointInfo(id, *info); updateErr != nil {
				log.Errorf("[Master-%v] 更新系统信息到数据库失败: %v", ep.ID, updateErr)
			} else {
				// 在日志中显示uptime信息
				uptimeMsg := fmt.Sprintf("%d秒", info.Uptime)
				log.Infof("[Master-%v] 详情页刷新：系统信息已更新: OS=%s, Arch=%s, Ver=%s, Uptime=%s", ep.ID, info.OS, info.Arch, info.Ver, uptimeMsg)
			}
		}
	}()

	// 重新从数据库获取最新的端点详细信息
	updatedEp, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, endpoint.EndpointResponse{
		Success:  true,
		Message:  "获取端点详情成功",
		Endpoint: updatedEp,
	})
}

// HandleEndpointFileLogs 获取端点文件日志
func (h *EndpointHandler) HandleEndpointFileLogs(c *gin.Context) {
	// Method validation removed - handled by Gin router

	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpoint ID")
		return
	}

	// 获取查询参数
	instanceID := c.Query("instanceId")
	dateStr := c.Query("date") // 改为date参数
	if instanceID == "" {
		c.String(http.StatusBadRequest, "Missing instanceId parameter")
		return
	}

	// 解析日期参数，格式为 YYYY-MM-DD
	var targetDate time.Time
	if dateStr != "" {
		var parseErr error
		targetDate, parseErr = time.Parse("2006-01-02", dateStr)
		if parseErr != nil {
			c.String(http.StatusBadRequest, "Invalid date format, expected YYYY-MM-DD")
			return
		}
	} else {
		// 如果没有指定日期，默认使用今天
		targetDate = time.Now()
	}

	// 从文件日志管理器读取指定日期的日志
	logs, err := h.sseManager.GetFileLogger().ReadLogs(endpointID, instanceID, targetDate, 1000)
	if err != nil {
		log.Warnf("[API]读取文件日志失败: %v", err)
		c.String(http.StatusInternalServerError, "Failed to read file logs")
		return
	}

	// 转换为统一的日志格式
	var logEntries []map[string]interface{}
	for i, logLine := range logs {
		if logLine != "" {
			// 尝试解析日志行中的时间戳
			var timestamp time.Time
			if len(logLine) > 20 && logLine[0] == '[' {
				timeStr := logLine[1:20]
				if parsedTime, err := time.Parse("2006-01-02 15:04:05", timeStr); err == nil {
					timestamp = parsedTime
				} else {
					timestamp = targetDate // 如果解析失败，使用目标日期
				}
			} else {
				timestamp = targetDate // 如果没有时间戳，使用目标日期
			}

			logEntries = append(logEntries, map[string]interface{}{
				"id":        i + 1,
				"message":   processAnsiColors(logLine), // 处理ANSI颜色
				"content":   processAnsiColors(logLine), // 保持向后兼容
				"isHtml":    true,
				"timestamp": timestamp,
				"filePath":  fmt.Sprintf("%s.log", targetDate.Format("2006-01-02")),
			})
		}
	}

	response := map[string]interface{}{
		"success":   true,
		"logs":      logEntries,
		"storage":   "file",
		"date":      targetDate.Format("2006-01-02"),
		"timestamp": time.Now(),
	}

	c.JSON(http.StatusOK, response)
}

// HandleClearEndpointFileLogs 清空端点文件日志
func (h *EndpointHandler) HandleClearEndpointFileLogs(c *gin.Context) {
	// Method validation removed - handled by Gin router

	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpoint ID")
		return
	}

	// 获取查询参数
	instanceID := c.Query("instanceId")
	if instanceID == "" {
		c.String(http.StatusBadRequest, "Missing instanceId parameter")
		return
	}

	// 清空文件日志
	err = h.sseManager.GetFileLogger().ClearLogs(endpointID, instanceID)
	if err != nil {
		log.Warnf("[API]清空文件日志失败: %v", err)
		c.String(http.StatusInternalServerError, "Failed to clear file logs")
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "文件日志已清空",
	}

	c.JSON(http.StatusOK, response)
}

// HandleEndpointStats 获取端点统计信息
// GET /api/endpoints/{id}/stats
func (h *EndpointHandler) HandleEndpointStats(c *gin.Context) {
	// Method validation removed - handled by Gin router

	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpoint ID")
		return
	}

	// 获取隧道数量和流量统计
	tunnelCount, totalTcpIn, totalTcpOut, totalUdpIn, totalUdpOut, err := h.getTunnelStats(endpointID)
	if err != nil {
		log.Errorf("获取隧道统计失败: %v", err)
		c.String(http.StatusInternalServerError, "获取隧道统计失败")
		return
	}

	// 获取文件日志统计
	fileLogCount, fileLogSize, err := h.getFileLogStats(endpointID)
	if err != nil {
		log.Errorf("获取文件日志统计失败: %v", err)
		// 文件日志统计失败不影响其他统计，设置为0
		fileLogCount = 0
		fileLogSize = 0
	}

	// 计算总流量
	totalTrafficIn := totalTcpIn + totalUdpIn
	totalTrafficOut := totalTcpOut + totalUdpOut

	stats := map[string]interface{}{
		"tunnelCount":     tunnelCount,
		"fileLogCount":    fileLogCount,
		"fileLogSize":     fileLogSize,
		"totalTrafficIn":  totalTrafficIn,
		"totalTrafficOut": totalTrafficOut,
		"tcpTrafficIn":    totalTcpIn,
		"tcpTrafficOut":   totalTcpOut,
		"udpTrafficIn":    totalUdpIn,
		"udpTrafficOut":   totalUdpOut,
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}

// getTunnelStats 获取隧道数量和流量统计
func (h *EndpointHandler) getTunnelStats(endpointID int64) (int, int64, int64, int64, int64, error) {
	var result struct {
		Count  int   `json:"count"`
		TcpIn  int64 `json:"tcp_in"`
		TcpOut int64 `json:"tcp_out"`
		UdpIn  int64 `json:"udp_in"`
		UdpOut int64 `json:"udp_out"`
	}

	err := h.endpointService.DB().Raw(`
		SELECT 
			COUNT(*) as count,
			COALESCE(SUM(tcp_rx), 0) as tcp_in,
			COALESCE(SUM(tcp_tx), 0) as tcp_out,
			COALESCE(SUM(udp_rx), 0) as udp_in,
			COALESCE(SUM(udp_tx), 0) as udp_out
		FROM tunnels 
		WHERE endpoint_id = ?
	`, endpointID).Scan(&result).Error

	return result.Count, result.TcpIn, result.TcpOut, result.UdpIn, result.UdpOut, err
}

// getFileLogStats 获取文件日志统计
func (h *EndpointHandler) getFileLogStats(endpointID int64) (int, int64, error) {
	if h.sseManager == nil {
		return 0, 0, fmt.Errorf("SSE管理器未初始化")
	}

	// 获取文件日志管理器
	fileLogger := h.sseManager.GetFileLogger()
	if fileLogger == nil {
		return 0, 0, fmt.Errorf("文件日志管理器未初始化")
	}

	// 计算该端点的文件日志统计
	endpointDir := fmt.Sprintf("logs/endpoint_%d", endpointID)
	fileCount, totalSize := h.calculateDirStats(endpointDir)

	return fileCount, totalSize, nil
}

// calculateDirStats 计算目录下的文件统计
func (h *EndpointHandler) calculateDirStats(dirPath string) (int, int64) {
	fileCount := 0
	totalSize := int64(0)

	filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // 忽略错误，继续处理
		}

		if !info.IsDir() && filepath.Ext(path) == ".log" {
			fileCount++
			totalSize += info.Size()
		}

		return nil
	})

	return fileCount, totalSize
}

// updateEndpointTunnelCount 更新端点的隧道计数，使用重试机制避免死锁
func updateEndpointTunnelCount(endpointID int64) {
	err := db.ExecuteWithRetry(func(db *gorm.DB) error {
		return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
			Update("tunnel_count", gorm.Expr("(SELECT COUNT(*) FROM tunnels WHERE endpoint_id = ?)", endpointID)).Error
	})

	if err != nil {
		log.Errorf("[API]更新端点 %d 隧道计数失败: %v", endpointID, err)
	} else {
		log.Debugf("[API]端点 %d 隧道计数已更新", endpointID)
	}
}

// HandleGetAvailableLogDates 获取指定端点和实例的可用日志日期列表
func (h *EndpointHandler) HandleGetAvailableLogDates(c *gin.Context) {
	// Method validation removed - handled by Gin router

	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpoint ID")
		return
	}

	// 获取查询参数
	instanceID := c.Query("instanceId")
	if instanceID == "" {
		c.String(http.StatusBadRequest, "Missing instanceId parameter")
		return
	}

	// 从文件日志管理器获取可用的日志日期
	dates, err := h.sseManager.GetFileLogger().GetAvailableLogDates(endpointID, instanceID)
	if err != nil {
		log.Warnf("[API]获取可用日志日期失败: %v", err)
		c.String(http.StatusInternalServerError, "Failed to get available log dates")
		return
	}

	response := map[string]interface{}{
		"success": true,
		"dates":   dates,
		"count":   len(dates),
	}

	c.JSON(http.StatusOK, response)
}

// HandleTCPing TCPing诊断测试 (POST /api/endpoints/{id}/tcping)
func (h *EndpointHandler) HandleTCPing(c *gin.Context) {
	// Method validation removed - handled by Gin router

	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpoint ID")
		return
	}

	// 解析请求体
	var req struct {
		Target string `json:"target"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.String(http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Target == "" {
		c.String(http.StatusBadRequest, "Missing target parameter")
		return
	}

	// 获取端点信息
	var endpoint struct {
		URL     string
		APIPath string
		APIKey  string
	}

	db := h.endpointService.DB()
	if err := db.Raw(`SELECT url, api_path, api_key FROM endpoints WHERE id = ?`, endpointID).Scan(&endpoint).Error; err != nil {
		if err == sql.ErrNoRows {
			c.String(http.StatusNotFound, "Endpoint not found")
			return
		}
		c.String(http.StatusInternalServerError, "Failed to get endpoint info")
		return
	}

	// 调用NodePass的TCPing接口
	result, err := nodepass.TCPing(endpointID, req.Target)
	if err != nil {
		log.Errorf("[API]TCPing测试失败: target=%s, err=%v", req.Target, err)
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	// 返回结果
	response := map[string]interface{}{
		"success": true,
		"result":  result,
	}

	c.JSON(http.StatusOK, response)
}

// HandleNetworkDebug 网络诊断测试 (POST /api/endpoints/{id}/network-debug)
func (h *EndpointHandler) HandleNetworkDebug(c *gin.Context) {
	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpoint ID")
		return
	}

	// 解析请求体
	var req struct {
		Target string `json:"target"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.String(http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Target == "" {
		c.String(http.StatusBadRequest, "Missing target parameter")
		return
	}

	// 获取端点信息
	var endpoint struct {
		URL     string
		APIPath string
		APIKey  string
	}

	db := h.endpointService.DB()
	if err := db.Raw(`SELECT url, api_path, api_key FROM endpoints WHERE id = ?`, endpointID).Scan(&endpoint).Error; err != nil {
		if err == sql.ErrNoRows {
			c.String(http.StatusNotFound, "Endpoint not found")
			return
		}
		c.String(http.StatusInternalServerError, "Failed to get endpoint info")
		return
	}

	// 调用NodePass的单次TCPing接口（现在使用Resty实现）
	result, err := nodepass.SingleTCPing(endpointID, req.Target)
	if err != nil {
		log.Errorf("[API]网络诊断测试失败: target=%s, err=%v", req.Target, err)
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	// 直接返回 singleResult
	c.JSON(http.StatusOK, result)
}

// HandleResetApiKey 重置API密钥 (POST /api/endpoints/{id}/reset-key)
func (h *EndpointHandler) HandleResetApiKey(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, endpoint.EndpointResponse{
			Success: false,
			Error:   "无效的端点ID",
		})
		return
	}

	// 获取端点信息
	ep, err := h.endpointService.GetEndpointByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, endpoint.EndpointResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	log.Infof("[Master-%v] 开始重置API密钥", id)

	// 1. 调用NodePass API重置密钥
	newAPIKey, err := h.resetNodePassAPIKey(id, ep)
	if err != nil {
		log.Errorf("[Master-%v] 调用NodePass重置密钥失败: %v", id, err)
		c.JSON(http.StatusInternalServerError, endpoint.EndpointResponse{
			Success: false,
			Error:   "重置密钥失败: " + err.Error(),
		})
		return
	}

	// 2. 更新数据库中的API密钥（UpdateEndpoint内部会自动更新缓存）
	updateReq := endpoint.UpdateEndpointRequest{
		ID:     id,
		Action: "updateApiKey",
		APIKey: newAPIKey,
	}

	_, err = h.endpointService.UpdateEndpoint(updateReq)
	if err != nil {
		log.Errorf("[Master-%v] 更新数据库中的新密钥失败: %v", id, err)
		c.JSON(http.StatusInternalServerError, endpoint.EndpointResponse{
			Success: false,
			Error:   "更新新密钥失败: " + err.Error(),
		})
		return
	}

	log.Infof("[Master-%v] API密钥重置成功，缓存已更新: %v", id, newAPIKey)

	c.JSON(http.StatusOK, endpoint.EndpointResponse{
		Success: true,
		Message: "API密钥重置成功",
	})
}

// resetNodePassAPIKey 调用NodePass API重置密钥
func (h *EndpointHandler) resetNodePassAPIKey(endpointID int64, ep *endpoint.Endpoint) (string, error) {
	// NodePass重置密钥需要调用nodepass.PatchInstance方法，传递instanceID="********"和action="restart"
	// 根据注释，重置后的新密钥会在返回的result.url字段中

	log.Infof("[Master-%v] 调用NodePass PatchInstance重置密钥，instanceID=********", endpointID)

	// 构造patchBody，注意字段是小写的unexported字段，我们需要通过现有的方法来调用
	// 使用现有的ControlInstance方法，它内部会构造正确的patchBody
	result, err := nodepass.ControlInstance(endpointID, "********", "restart")
	log.Infof("[Master-%v] NodePass PatchInstance重置密钥结果: %+v", endpointID, result)
	if err != nil {
		return "", fmt.Errorf("调用PatchInstance失败: %v", err)
	}

	// 从返回结果中获取新的API密钥（在URL字段中）
	if result.URL == "" {
		return "", fmt.Errorf("NodePass未返回新的API密钥")
	}

	log.Infof("[Master-%v] NodePass重置密钥成功，获得新密钥", endpointID)
	return result.URL, nil
}

// parseFullURL 从完整URL中分离baseURL和apiPath
func (h *EndpointHandler) parseFullURL(fullURL string) *struct {
	BaseURL string
	APIPath string
} {
	// 使用正则表达式解析 protocol://host:port/path 格式
	// 例如：https://example.com:8080/api/v1 -> baseURL: https://example.com:8080, apiPath: /api/v1
	if fullURL == "" {
		return nil
	}

	// 查找第三个/的位置，它分隔baseURL和path
	slashCount := 0
	splitIndex := -1
	for i, char := range fullURL {
		if char == '/' {
			slashCount++
			if slashCount == 3 {
				splitIndex = i
				break
			}
		}
	}

	if splitIndex == -1 {
		// 没有找到path部分，使用默认/api
		return &struct {
			BaseURL string
			APIPath string
		}{
			BaseURL: fullURL,
			APIPath: "/api",
		}
	}

	baseURL := fullURL[:splitIndex]
	apiPath := fullURL[splitIndex:]
	if apiPath == "" {
		apiPath = "/api"
	}

	return &struct {
		BaseURL string
		APIPath string
	}{
		BaseURL: baseURL,
		APIPath: apiPath,
	}
}

// HandleTestConnection 测试端点连接 (POST /api/endpoints/{id}/test-connection)
func (h *EndpointHandler) HandleTestConnection(c *gin.Context) {
	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid endpoint ID"})
		return
	}

	// 调用nodepass client的测试连接方法（现在使用Resty实现）
	if err := nodepass.TestConnection(endpointID); err != nil {
		log.Errorf("[API]测试端点连接失败: endpointID=%d, err=%v", endpointID, err)
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "连接测试成功",
	})
}
