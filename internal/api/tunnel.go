package api

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"archive/zip"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// TunnelHandler 隧道相关的处理器
type TunnelHandler struct {
	tunnelService *tunnel.Service
	sseManager    *sse.Manager
}

// NewTunnelHandler 创建隧道处理器实例
func NewTunnelHandler(tunnelService *tunnel.Service, sseManager *sse.Manager) *TunnelHandler {
	return &TunnelHandler{
		tunnelService: tunnelService,
		sseManager:    sseManager,
	}
}

// setupTunnelRoutes 设置隧道相关路由
func SetupTunnelRoutes(rg *gin.RouterGroup, tunnelService *tunnel.Service, sseManager *sse.Manager, sseProcessor *metrics.SSEProcessor) {
	// 创建TunnelHandler实例
	tunnelHandler := NewTunnelHandler(tunnelService, sseManager)
	tunnelMetricsHandler := NewTunnelMetricsHandler(tunnelService, sseProcessor)

	// 实例相关路由
	// 实例相关路由
	rg.GET("/endpoints/:id/instances", tunnelHandler.HandleGetInstances)
	rg.GET("/endpoints/:id/instances/:instanceId", tunnelHandler.HandleGetInstance)
	rg.POST("/endpoints/:id/instances/:instanceId/control", tunnelHandler.HandleControlInstance)

	// 隧道相关路由
	rg.GET("/tunnels", tunnelHandler.HandleGetTunnels)
	rg.POST("/tunnels", tunnelHandler.HandleCreateTunnel)
	rg.POST("/tunnels/batch", tunnelHandler.HandleBatchCreateTunnels)
	rg.POST("/tunnels/batch-new", tunnelHandler.HandleNewBatchCreateTunnels)
	rg.DELETE("/tunnels/batch", tunnelHandler.HandleBatchDeleteTunnels)
	rg.POST("/tunnels/batch/action", tunnelHandler.HandleBatchActionTunnels)
	rg.POST("/tunnels/create_by_url", tunnelHandler.HandleQuickCreateTunnel)
	rg.POST("/tunnels/quick-batch", tunnelHandler.HandleQuickBatchCreateTunnel)
	rg.POST("/tunnels/template", tunnelHandler.HandleTemplateCreate)
	rg.PATCH("/tunnels", tunnelHandler.HandlePatchTunnels)
	rg.PATCH("/tunnels/:id", tunnelHandler.HandlePatchTunnels)
	rg.PATCH("/tunnels/:id/attributes", tunnelHandler.HandlePatchTunnelAttributes)
	rg.PATCH("/tunnels/:id/restart", tunnelHandler.HandleSetTunnelRestart)
	rg.GET("/tunnels/:id", tunnelHandler.HandleGetTunnels)
	rg.PUT("/tunnels/:id", tunnelHandler.HandleUpdateTunnelV2)
	rg.DELETE("/tunnels/:id", tunnelHandler.HandleDeleteTunnel)
	rg.PATCH("/tunnels/:id/status", tunnelHandler.HandleControlTunnel)
	rg.POST("/tunnels/:id/action", tunnelHandler.HandleControlTunnel)
	rg.GET("/tunnels/:id/details", tunnelHandler.HandleGetTunnelDetails)
	rg.GET("/tunnels/:id/file-logs", tunnelHandler.HandleTunnelFileLogs)
	rg.GET("/tunnels/:id/traffic-trend", tunnelHandler.HandleGetTunnelTrafficTrend)
	rg.GET("/tunnels/:id/ping-trend", tunnelHandler.HandleGetTunnelPingTrend)
	rg.GET("/tunnels/:id/pool-trend", tunnelHandler.HandleGetTunnelPoolTrend)
	rg.GET("/tunnels/:id/export-logs", tunnelHandler.HandleExportTunnelLogs)
	rg.PUT("/tunnels/:id/instance-tags", tunnelHandler.HandleUpdateInstanceTags)

	// 新的统一 metrics 趋势接口 - 基于 ServiceHistory 表，使用 instanceId
	rg.GET("/tunnels/:id/metrics-trend", tunnelMetricsHandler.HandleGetTunnelMetricsTrend)

	// TCPing 诊断测试接口 - 基于 instanceId
	rg.POST("/tunnels/:id/tcping", tunnelHandler.HandleTunnelTCPing)

	// 隧道日志相关路由（使用dashboard路径但由tunnel handler处理）
	rg.GET("/dashboard/operate_logs", tunnelHandler.HandleGetTunnelLogs)
	rg.DELETE("/dashboard/operate_logs", tunnelHandler.HandleClearTunnelLogs)
}

// HandleGetTunnels 获取隧道列表
func (h *TunnelHandler) HandleGetTunnels(c *gin.Context) {
	// 获取查询参数
	query := c.Request.URL.Query()

	// 筛选参数
	searchFilter := query.Get("search")
	statusFilter := query.Get("status")
	endpointFilter := query.Get("endpoint_id")
	endpointGroupFilter := query.Get("endpoint_group_id")
	portFilter := query.Get("port_filter")
	groupFilter := query.Get("group_id")

	// 分页参数
	page := 1
	pageSize := 10
	if p := query.Get("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if ps := query.Get("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil && parsed > 0 && parsed <= 1000 {
			pageSize = parsed
		}
	}

	// 排序参数
	sortBy := query.Get("sort_by")
	sortOrder := query.Get("sort_order")
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc" // 默认降序
	}

	result, err := h.tunnelService.GetTunnelsWithPagination(tunnel.TunnelQueryParams{
		Search:          searchFilter,
		Status:          statusFilter,
		EndpointID:      endpointFilter,
		EndpointGroupID: endpointGroupFilter,
		PortFilter:      portFilter,
		GroupID:         groupFilter,
		Page:            page,
		PageSize:        pageSize,
		SortBy:          sortBy,
		SortOrder:       sortOrder,
	})

	if err != nil {
		log.Errorf("[API] 获取隧道列表失败: %v", err)

		// 构建详细的错误信息
		errorDetail := map[string]interface{}{
			"success": false,
			"error":   "获取隧道列表失败: " + err.Error(),
			"details": map[string]interface{}{
				"timestamp": time.Now().Format(time.RFC3339),
				"operation": "GetTunnels",
				"hint":      "可能存在数据格式问题，建议检查数据库中的端口字段是否包含非数字内容",
			},
		}

		c.JSON(http.StatusInternalServerError, errorDetail)
		return
	}

	if result.Data == nil {
		result.Data = []tunnel.TunnelWithStats{}
	}

	c.JSON(http.StatusOK, result)
}

// HandleCreateTunnel 创建新隧道
func (h *TunnelHandler) HandleCreateTunnel(c *gin.Context) {

	// 兼容前端将端口作为字符串提交的情况
	var raw struct {
		Name           string          `json:"name"`
		EndpointID     int64           `json:"endpointId"`
		Type           string          `json:"type"`
		TunnelAddress  string          `json:"tunnelAddress"`
		TunnelPort     json.RawMessage `json:"tunnelPort"`
		TargetAddress  string          `json:"targetAddress"`
		TargetPort     json.RawMessage `json:"targetPort"`
		TLSMode        string          `json:"tlsMode"`
		CertPath       string          `json:"certPath"`
		KeyPath        string          `json:"keyPath"`
		LogLevel       string          `json:"logLevel"`
		Password       string          `json:"password"`
		Min            *int            `json:"min,omitempty"`
		Max            *int            `json:"max,omitempty"`
		Slot           *int            `json:"slot,omitempty"`             // 新增：最大连接数限制
		Mode           *int            `json:"mode,omitempty"`             // 新增：运行模式 (0, 1, 2)
		Read           *string         `json:"read,omitempty"`             // 新增：数据读取超时时间
		Rate           *int            `json:"rate,omitempty"`             // 新增：带宽速率限制
		ProxyProtocol  *bool           `json:"proxyProtocol,omitempty"`    // 新增：Proxy Protocol 支持
		Tags           []string        `json:"tags,omitempty"`             // 新增：实例标签 (仅用于前端显示，不影响URL生成)
		EnableSSEStore *bool           `json:"enable_sse_store,omitempty"` // 新增：是否启用SSE存储
		EnableLogStore *bool           `json:"enable_log_store,omitempty"` // 新增：是否启用日志存储
	}

	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 端口解析函数
	parseIntField := func(j json.RawMessage) (int, error) {
		if j == nil {
			return 0, fmt.Errorf("字段为空")
		}
		var i int
		if err := json.Unmarshal(j, &i); err == nil {
			return i, nil
		}
		var s string
		if err := json.Unmarshal(j, &s); err == nil {
			return strconv.Atoi(s)
		}
		return 0, fmt.Errorf("无法解析为整数")
	}

	tunnelPort, err1 := parseIntField(raw.TunnelPort)
	targetPort, err2 := parseIntField(raw.TargetPort)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "端口号格式错误，应为数字",
		})
		return
	}

	// min/max/slot 字段现在直接作为 *int 类型接收

	// 处理新增字段的默认值
	enableSSEStore := true
	if raw.EnableSSEStore != nil {
		enableSSEStore = *raw.EnableSSEStore
	}

	enableLogStore := true
	if raw.EnableLogStore != nil {
		enableLogStore = *raw.EnableLogStore
	}

	// 处理Mode字段的类型转换
	var modePtr *tunnel.TunnelMode
	if raw.Mode != nil {
		modePtr = (*tunnel.TunnelMode)(raw.Mode)
	}

	req := tunnel.CreateTunnelRequest{
		Name:           raw.Name,
		EndpointID:     raw.EndpointID,
		Type:           raw.Type,
		TunnelAddress:  raw.TunnelAddress,
		TunnelPort:     tunnelPort,
		TargetAddress:  raw.TargetAddress,
		TargetPort:     targetPort,
		TLSMode:        tunnel.TLSMode(raw.TLSMode),
		CertPath:       raw.CertPath,
		KeyPath:        raw.KeyPath,
		LogLevel:       tunnel.LogLevel(raw.LogLevel),
		Password:       raw.Password,
		Min:            raw.Min,
		Max:            raw.Max,
		Slot:           raw.Slot,          // 新增：最大连接数限制
		Mode:           modePtr,           // 新增：运行模式
		Read:           raw.Read,          // 新增：数据读取超时时间
		Rate:           raw.Rate,          // 新增：带宽速率限制
		ProxyProtocol:  raw.ProxyProtocol, // 新增：Proxy Protocol 支持
		Tags:           raw.Tags,          // 新增：实例标签
		EnableSSEStore: enableSSEStore,    // 新增：是否启用SSE存储
		EnableLogStore: enableLogStore,    // 新增：是否启用日志存储
	}

	log.Infof("[Master-%v] 创建隧道请求: %v", req.EndpointID, req.Name)

	// 使用直接URL模式创建隧道，超时时间为 3 秒
	newTunnel, err := h.tunnelService.CreateTunnelAndWait(req, 3*time.Second)
	if err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// CreateTunnelAndWait 已经包含了设置别名的逻辑，这里不需要再调用

	c.JSON(http.StatusOK, tunnel.TunnelResponse{
		Success: true,
		Message: "隧道创建成功",
		Tunnel:  newTunnel,
	})
}

// HandleBatchCreateTunnels 批量创建隧道
func (h *TunnelHandler) HandleBatchCreateTunnels(c *gin.Context) {
	var req tunnel.BatchCreateTunnelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 验证请求
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   "批量创建项目不能为空",
		})
		return
	}

	// 限制批量创建的数量，避免过多请求影响性能
	const maxBatchSize = 50
	if len(req.Items) > maxBatchSize {
		c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   fmt.Sprintf("批量创建数量不能超过 %d 个", maxBatchSize),
		})
		return
	}

	// 基础验证每个项目的必填字段
	for i, item := range req.Items {
		if item.EndpointID <= 0 {
			c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的端点ID无效", i+1),
			})
			return
		}
		if item.InboundsPort <= 0 || item.InboundsPort > 65535 {
			c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的入口端口无效", i+1),
			})
			return
		}
		if item.OutboundHost == "" {
			c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的出口地址不能为空", i+1),
			})
			return
		}
		if item.OutboundPort <= 0 || item.OutboundPort > 65535 {
			c.JSON(http.StatusBadRequest, tunnel.BatchCreateTunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 项的出口端口无效", i+1),
			})
			return
		}
	}

	log.Infof("[API] 接收到批量创建隧道请求，包含 %d 个项目", len(req.Items))

	// 调用服务层批量创建
	response, err := h.tunnelService.BatchCreateTunnels(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, tunnel.BatchCreateTunnelResponse{
			Success: false,
			Error:   "批量创建失败: " + err.Error(),
		})
		return
	}

	// 根据结果设置HTTP状态码
	if response.Success {
		if response.FailCount > 0 {
			// 部分成功
			c.JSON(http.StatusPartialContent, response)
		} else {
			// 全部成功
			c.JSON(http.StatusOK, response)
		}
	} else {
		// 全部失败
		c.JSON(http.StatusBadRequest, response)
	}
}

// HandleDeleteTunnel 删除隧道
func (h *TunnelHandler) HandleDeleteTunnel(c *gin.Context) {
	var req struct {
		InstanceID string `json:"instanceId"`
		Recycle    bool   `json:"recycle"`
	}
	_ = c.ShouldBindJSON(&req) // 即使失败也无妨，后续再判断

	// 如果未提供 instanceId ，则尝试从路径参数中解析数据库 id
	if req.InstanceID == "" {
		idStr := c.Param("id")
		if idStr != "" {
			if tunnelID, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				if iid, e := h.tunnelService.GetInstanceIDByTunnelID(tunnelID); e == nil {
					req.InstanceID = iid
				} else {
					c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
						Success: false,
						Error:   e.Error(),
					})
					return
				}
			}
		}
	}

	if req.InstanceID == "" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道实例ID",
		})
		return
	}

	// 在删除前先获取隧道数据库ID，用于清理分组关系和文件日志
	var tunnelID int64
	var endpointID int64
	if err := h.tunnelService.DB().QueryRow(`SELECT id, endpoint_id FROM tunnels WHERE instance_id = ?`, req.InstanceID).Scan(&tunnelID, &endpointID); err != nil {
	} else {
		// 清理隧道标签关联
		if _, err := h.tunnelService.DB().Exec("DELETE FROM tunnel_tags WHERE tunnel_id = ?", tunnelID); err != nil {
			log.Warnf("[API] 删除隧道标签关联失败: tunnelID=%d, err=%v", tunnelID, err)
		} else {
			log.Infof("[API] 已删除隧道标签关联: tunnelID=%d", tunnelID)
		}
	}

	if err := h.tunnelService.DeleteTunnelAndWait(req.InstanceID, 3*time.Second, req.Recycle); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// 如果不是移入回收站，则清理文件日志
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		if err := h.sseManager.GetFileLogger().ClearLogs(endpointID, req.InstanceID); err != nil {
			log.Warnf("[API] 清理隧道文件日志失败: endpointID=%d, instanceID=%s, err=%v", endpointID, req.InstanceID, err)
		} else {
			log.Infof("[API] 已清理隧道文件日志: endpointID=%d, instanceID=%s", endpointID, req.InstanceID)
		}
	}

	c.JSON(http.StatusOK, tunnel.TunnelResponse{
		Success: true,
		Message: "隧道删除成功",
	})
}

// HandleControlTunnel 控制隧道状态
func (h *TunnelHandler) HandleControlTunnel(c *gin.Context) {
	var req tunnel.TunnelActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 尝试从路径参数中获取数据库 ID 并转换为 instanceId（若 body 中缺失）
	if req.InstanceID == "" {
		idStr := c.Param("id")
		if idStr != "" {
			if tunnelID, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				if iid, e := h.tunnelService.GetInstanceIDByTunnelID(tunnelID); e == nil {
					req.InstanceID = iid
				} else {
					c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
						Success: false,
						Error:   e.Error(),
					})
					return
				}
			}
		}
	}

	if req.InstanceID == "" || req.Action == "" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道实例ID或操作类型",
		})
		return
	}

	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的操作类型，支持: start, stop, restart",
		})
		return
	}

	if err := h.tunnelService.ControlTunnel(req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, tunnel.TunnelResponse{
		Success: true,
		Message: "操作成功",
	})
}

// HandleUpdateTunnel 更新隧道配置
func (h *TunnelHandler) HandleUpdateTunnel(c *gin.Context) {
	tunnelIDStr := c.Param("id")

	tunnelID, err := strconv.ParseInt(tunnelIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道ID",
		})
		return
	}

	// 尝试解析为创建/替换请求体（与创建接口保持一致）
	var rawCreate struct {
		Name           string          `json:"name"`
		EndpointID     int64           `json:"endpointId"`
		Type           string          `json:"type"`
		TunnelAddress  string          `json:"tunnelAddress"`
		TunnelPort     json.RawMessage `json:"tunnelPort"`
		TargetAddress  string          `json:"targetAddress"`
		TargetPort     json.RawMessage `json:"targetPort"`
		TLSMode        string          `json:"tlsMode"`
		CertPath       string          `json:"certPath"`
		KeyPath        string          `json:"keyPath"`
		LogLevel       string          `json:"logLevel"`
		Password       string          `json:"password"`
		Min            *int            `json:"min,omitempty"`
		Max            *int            `json:"max,omitempty"`
		Slot           *int            `json:"slot,omitempty"`             // 新增：最大连接数限制
		Mode           *string         `json:"mode,omitempty"`             // 新增：运行模式
		Read           *string         `json:"read,omitempty"`             // 新增：数据读取超时时间
		Rate           *int            `json:"rate,omitempty"`             // 新增：带宽速率限制
		EnableSSEStore *bool           `json:"enable_sse_store,omitempty"` // 新增：是否启用SSE存储
		EnableLogStore *bool           `json:"enable_log_store,omitempty"` // 新增：是否启用日志存储
	}

	if err := c.ShouldBindJSON(&rawCreate); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 如果请求体包含 EndpointID 和 Type，则认定为"替换"逻辑，否则执行原 Update 逻辑
	if rawCreate.EndpointID != 0 && rawCreate.Type != "" {
		// 1. 获取旧 instanceId
		instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
		if err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: err.Error()})
			return
		}

		// 2. 删除旧实例（回收站=true）
		if err := h.tunnelService.DeleteTunnelAndWait(instanceID, 3*time.Second, true); err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，遭遇无法删除旧实例: " + err.Error()})
			return
		}
		log.Infof("[Master-%v] 编辑实例=>删除旧实例: %v", rawCreate.EndpointID, instanceID)

		// 端口解析函数（复用逻辑）
		parseIntFieldLocal := func(j json.RawMessage) (int, error) {
			if j == nil {
				return 0, fmt.Errorf("字段为空")
			}
			var i int
			if err := json.Unmarshal(j, &i); err == nil {
				return i, nil
			}
			var s string
			if err := json.Unmarshal(j, &s); err == nil {
				return strconv.Atoi(s)
			}
			return 0, fmt.Errorf("无法解析为整数")
		}

		tunnelPort, _ := parseIntFieldLocal(rawCreate.TunnelPort)
		targetPort, _ := parseIntFieldLocal(rawCreate.TargetPort)
		// min/max/slot 字段现在直接作为 *int 类型接收

		// 处理新增字段的默认值
		enableSSEStore := true
		if rawCreate.EnableSSEStore != nil {
			enableSSEStore = *rawCreate.EnableSSEStore
		}

		enableLogStore := true
		if rawCreate.EnableLogStore != nil {
			enableLogStore = *rawCreate.EnableLogStore
		}

		// 处理Mode字段的类型转换
		var modePtr *tunnel.TunnelMode
		if rawCreate.Mode != nil {
			if modeInt, err := strconv.Atoi(*rawCreate.Mode); err == nil {
				mode := tunnel.TunnelMode(modeInt)
				modePtr = &mode
			}
		}

		createReq := tunnel.CreateTunnelRequest{
			Name:           rawCreate.Name,
			EndpointID:     rawCreate.EndpointID,
			Type:           rawCreate.Type,
			TunnelAddress:  rawCreate.TunnelAddress,
			TunnelPort:     tunnelPort,
			TargetAddress:  rawCreate.TargetAddress,
			TargetPort:     targetPort,
			TLSMode:        tunnel.TLSMode(rawCreate.TLSMode),
			CertPath:       rawCreate.CertPath,
			KeyPath:        rawCreate.KeyPath,
			LogLevel:       tunnel.LogLevel(rawCreate.LogLevel),
			Password:       rawCreate.Password,
			Min:            rawCreate.Min,
			Max:            rawCreate.Max,
			Slot:           rawCreate.Slot, // 新增：最大连接数限制
			Mode:           modePtr,        // 新增：运行模式
			Read:           rawCreate.Read, // 新增：数据读取超时时间
			Rate:           rawCreate.Rate, // 新增：带宽速率限制
			EnableSSEStore: enableSSEStore, // 新增：是否启用SSE存储
			EnableLogStore: enableLogStore, // 新增：是否启用日志存储
		}

		// 使用直接URL模式创建新隧道，超时时间为 3 秒
		newTunnel, err := h.tunnelService.CreateTunnelAndWait(createReq, 3*time.Second)
		if err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，无法创建新实例: " + err.Error()})
			return
		}
		log.Infof("[Master-%v] 编辑实例=>创建新实例: %v", rawCreate.EndpointID, newTunnel.InstanceID)

		c.JSON(http.StatusOK, tunnel.TunnelResponse{Success: true, Message: "编辑实例成功", Tunnel: newTunnel})
		return
	}

	// -------- 原局部更新逻辑 ----------
	c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "不支持的更新请求"})
}

// HandleGetTunnelLogs GET /api/tunnel-logs
func (h *TunnelHandler) HandleGetTunnelLogs(c *gin.Context) {
	limitStr := c.Request.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 {
			limit = v
		}
	}

	logs, err := h.tunnelService.GetOperationLogs(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
		return
	}

	// 格式化为前端需要的字段；若无数据也返回空数组而非 null
	resp := make([]map[string]interface{}, 0)
	for _, l := range logs {
		statusType := "warning"
		if l.Status == "success" {
			statusType = "success"
		} else if l.Status == "failed" {
			statusType = "danger"
		}
		resp = append(resp, map[string]interface{}{
			"id":       l.ID,
			"time":     l.CreatedAt.Format(time.RFC3339),
			"action":   l.Action,
			"instance": l.TunnelName,
			"status": map[string]interface{}{
				"type": statusType,
				"text": l.Status,
			},
			"message": l.Message.String,
		})
	}

	c.JSON(http.StatusOK, resp)
}

// HandleClearTunnelLogs DELETE /api/dashboard/logs
// 清空隧道操作日志
func (h *TunnelHandler) HandleClearTunnelLogs(c *gin.Context) {
	deleted, err := h.tunnelService.ClearOperationLogs()
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"success":      true,
		"deletedCount": deleted,
	})
}

// HandlePatchTunnels 处理 PATCH /api/tunnels 请求 (启动/停止/重启/重命名)
// 该接口兼容旧版前端：
// 1. action 为 start/stop/restart 时，根据 instanceId 操作隧道状态
// 2. action 为 rename 时，根据 id 修改隧道名称
func (h *TunnelHandler) HandlePatchTunnels(c *gin.Context) {
	// 定义与旧版前端保持一致的请求结构
	var raw struct {
		// 用于状态控制
		InstanceID string `json:"instanceId"`
		// 用于重命名
		ID int64 `json:"id"`
		// 操作类型：start | stop | restart | rename
		Action string `json:"action"`
		// 当 action 为 rename 时的新名称
		Name string `json:"name"`
	}

	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 若 URL 中包含 {id}，且 body 中未提供 id，则从路径参数读取
	if raw.ID == 0 {
		idStr := c.Param("id")
		if idStr != "" {
			if tid, err := strconv.ParseInt(idStr, 10, 64); err == nil {
				raw.ID = tid
			}
		}
	}

	if raw.Action == "" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少操作类型(action)",
		})
		return
	}

	switch raw.Action {
	case "start", "stop", "restart":
		if raw.InstanceID == "" {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "缺少隧道实例ID(instanceId)",
			})
			return
		}

		if err := h.tunnelService.ControlTunnel(tunnel.TunnelActionRequest{
			InstanceID: raw.InstanceID,
			Action:     raw.Action,
		}); err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success: true,
			Message: "操作成功",
		})

	case "reset":
		if raw.InstanceID == "" {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "重置操作需提供有效的隧道实例ID(instanceId)",
			})
			return
		}

		// 重置隧道的流量统计信息
		if err := h.tunnelService.ResetTunnelTrafficByInstanceID(raw.InstanceID); err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success: true,
			Message: "隧道流量信息重置成功",
		})

	case "rename":
		if raw.ID == 0 || raw.Name == "" {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "重命名操作需提供有效的 id 和 name",
			})
			return
		}

		if err := h.tunnelService.RenameTunnel(raw.ID, raw.Name); err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success: true,
			Message: "隧道重命名成功",
		})

	default:
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的操作类型，支持: start, stop, restart, reset, rename",
		})
	}
}

// HandlePatchTunnelAttributes 处理隧道属性更新 (PATCH /api/tunnels/{id}/attributes)
// 支持更新别名和重启策略
func (h *TunnelHandler) HandlePatchTunnelAttributes(c *gin.Context) {
	// 获取隧道ID
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道ID",
		})
		return
	}

	tunnelID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道ID",
		})
		return
	}

	// 解析请求体
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 只允许更新 alias 字段
	if alias, ok := updates["alias"]; ok {
		aliasStr, ok := alias.(string)
		if !ok {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "alias 必须是字符串类型",
			})
			return
		}

		filteredUpdates := map[string]interface{}{"alias": aliasStr}
		if err := h.tunnelService.PatchTunnel(tunnelID, filteredUpdates); err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success: true,
			Message: "隧道别名更新成功",
		})
		return
	}

	c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
		Success: false,
		Error:   "只允许更新 alias 字段",
	})
}

// HandleSetTunnelRestart 设置隧道重启策略的专用接口
func (h *TunnelHandler) HandleSetTunnelRestart(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "缺少隧道ID",
		})
		return
	}

	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道ID",
		})
		return
	}

	var requestData struct {
		Restart bool `json:"restart"`
	}
	if err := c.ShouldBindJSON(&requestData); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	if err := h.tunnelService.SetTunnelRestart(id, requestData.Restart); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, tunnel.TunnelResponse{
		Success: true,
		Message: fmt.Sprintf("自动重启已%s", map[bool]string{true: "开启", false: "关闭"}[requestData.Restart]),
	})
}

// HandleGetTunnelDetails 获取隧道详细信息 (GET /api/tunnels/{id}/details)
func (h *TunnelHandler) HandleGetTunnelDetails(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "缺少隧道ID"})
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	db := h.tunnelService.DB()

	// 1. 查询隧道及端点信息（包含主控的tls和log信息）
	var tunnelRecord struct {
		ID              int64
		InstanceIDNS    sql.NullString
		Name            string
		Type            string
		Status          string
		EndpointID      int64
		EndpointName    sql.NullString
		EndpointTLS     sql.NullString
		EndpointLog     sql.NullString
		EndpointVersion sql.NullString
		TunnelPort      string
		TargetPort      string
		TLSMode         string
		LogLevel        string
		TunnelAddress   string
		TargetAddress   string
		CommandLine     string
		PasswordNS      sql.NullString
		CertPathNS      sql.NullString
		KeyPathNS       sql.NullString
		TCPRx           int64
		TCPTx           int64
		UDPRx           int64
		UDPTx           int64
		Pool            sql.NullInt64
		Ping            sql.NullInt64
		TCPs            sql.NullInt64
		UDPs            sql.NullInt64
		Min             sql.NullInt64
		Max             sql.NullInt64
		Restart         bool
		Mode            sql.NullInt64
		Read            sql.NullString
		Rate            sql.NullInt64
		Slot            sql.NullInt64
		ProxyProtocol   sql.NullBool
		InstanceTags    sql.NullString
	}

	query := `SELECT t.id, t.instance_id, t.name, t.type, t.status, t.endpoint_id,
		   e.name, e.tls, e.log, e.ver, t.tunnel_port, t.target_port, t.tls_mode, t.log_level,
		   t.tunnel_address, t.target_address, t.command_line, t.password, t.cert_path, t.key_path,
		   t.tcp_rx, t.tcp_tx, t.udp_rx, t.udp_tx, t.pool, t.ping, t.tcps, t.udps,
		   t.min, t.max, ifnull(t.restart, 0), t.mode, t.read, t.rate, t.slot, t.proxy_protocol, t.instance_tags
		   FROM tunnels t
		   LEFT JOIN endpoints e ON t.endpoint_id = e.id
		   WHERE t.id = ?`
	if err := db.QueryRow(query, id).Scan(
		&tunnelRecord.ID,
		&tunnelRecord.InstanceIDNS,
		&tunnelRecord.Name,
		&tunnelRecord.Type,
		&tunnelRecord.Status,
		&tunnelRecord.EndpointID,
		&tunnelRecord.EndpointName,
		&tunnelRecord.EndpointTLS,
		&tunnelRecord.EndpointLog,
		&tunnelRecord.EndpointVersion,
		&tunnelRecord.TunnelPort,
		&tunnelRecord.TargetPort,
		&tunnelRecord.TLSMode,
		&tunnelRecord.LogLevel,
		&tunnelRecord.TunnelAddress,
		&tunnelRecord.TargetAddress,
		&tunnelRecord.CommandLine,
		&tunnelRecord.PasswordNS,
		&tunnelRecord.CertPathNS,
		&tunnelRecord.KeyPathNS,
		&tunnelRecord.TCPRx,
		&tunnelRecord.TCPTx,
		&tunnelRecord.UDPRx,
		&tunnelRecord.UDPTx,
		&tunnelRecord.Pool,
		&tunnelRecord.Ping,
		&tunnelRecord.TCPs,
		&tunnelRecord.UDPs,
		&tunnelRecord.Min,
		&tunnelRecord.Max,
		&tunnelRecord.Restart,
		&tunnelRecord.Mode,
		&tunnelRecord.Read,
		&tunnelRecord.Rate,
		&tunnelRecord.Slot,
		&tunnelRecord.ProxyProtocol,
		&tunnelRecord.InstanceTags,
	); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]interface{}{"error": "隧道不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
		return
	}

	instanceID := ""
	if tunnelRecord.InstanceIDNS.Valid {
		instanceID = tunnelRecord.InstanceIDNS.String
	}
	endpointName := ""
	if tunnelRecord.EndpointName.Valid {
		endpointName = tunnelRecord.EndpointName.String
	}
	endpointTLS := ""
	if tunnelRecord.EndpointTLS.Valid {
		endpointTLS = tunnelRecord.EndpointTLS.String
	}
	endpointLog := ""
	if tunnelRecord.EndpointLog.Valid {
		endpointLog = tunnelRecord.EndpointLog.String
	}
	endpointVersion := ""
	if tunnelRecord.EndpointVersion.Valid {
		endpointVersion = tunnelRecord.EndpointVersion.String
	}
	password := ""
	if tunnelRecord.PasswordNS.Valid {
		password = tunnelRecord.PasswordNS.String
	}
	certPath := ""
	if tunnelRecord.CertPathNS.Valid {
		certPath = tunnelRecord.CertPathNS.String
	}
	keyPath := ""
	if tunnelRecord.KeyPathNS.Valid {
		keyPath = tunnelRecord.KeyPathNS.String
	}

	// 状态映射
	statusType := "danger"
	statusText := "已停止"
	if tunnelRecord.Status == "running" {
		statusType = "success"
		statusText = "运行中"
	} else if tunnelRecord.Status == "error" {
		statusType = "warning"
		statusText = "有错误"
	} else if tunnelRecord.Status == "offline" {
		statusType = "default"
		statusText = "已离线"
	}

	// 端口转换
	listenPort, _ := strconv.Atoi(tunnelRecord.TunnelPort)
	targetPort, _ := strconv.Atoi(tunnelRecord.TargetPort)

	// 处理新字段的NULL值
	// var mode int
	// if tunnelRecord.Mode.Valid {
	// 	mode = tunnelRecord.Mode
	// }
	read := ""
	if tunnelRecord.Read.Valid {
		read = tunnelRecord.Read.String
	}

	// 2. 组装响应（不再包含日志数据）
	resp := map[string]interface{}{
		"tunnelInfo": map[string]interface{}{
			"id":         tunnelRecord.ID,
			"instanceId": instanceID,
			"name":       tunnelRecord.Name,
			"type":       tunnelRecord.Type,
			"status": map[string]string{
				"type": statusType,
				"text": statusText,
			},
			"endpoint":        endpointName,
			"endpointId":      tunnelRecord.EndpointID,
			"endpointVersion": endpointVersion,
			"password":        password, // 添加密码字段
			"config": map[string]interface{}{
				"listenPort":  listenPort,
				"targetPort":  targetPort,
				"tls":         tunnelRecord.TLSMode != "0",
				"logLevel":    tunnelRecord.LogLevel,
				"tlsMode":     tunnelRecord.TLSMode,
				"endpointTLS": endpointTLS, // 主控的TLS配置
				"endpointLog": endpointLog, // 主控的Log配置
				"certPath":    certPath,    // TLS证书路径
				"keyPath":     keyPath,     // TLS密钥路径
				"min": func() interface{} {
					if tunnelRecord.Min.Valid {
						return tunnelRecord.Min.Int64
					}
					return nil
				}(),
				"max": func() interface{} {
					if tunnelRecord.Max.Valid {
						return tunnelRecord.Max.Int64
					}
					return nil
				}(),
				"restart": tunnelRecord.Restart,
				"mode": func() interface{} {
					if tunnelRecord.Mode.Valid {
						return tunnelRecord.Mode.Int64
					}
					return nil
				}(),
				"read": read,
				"rate": func() interface{} {
					if tunnelRecord.Rate.Valid {
						return tunnelRecord.Rate.Int64
					}
					return nil
				}(),
				"slot": func() interface{} {
					if tunnelRecord.Slot.Valid {
						return tunnelRecord.Slot.Int64
					}
					return nil
				}(),
				"proxyProtocol": func() interface{} {
					if tunnelRecord.ProxyProtocol.Valid {
						return tunnelRecord.ProxyProtocol.Bool
					}
					return nil
				}(),
			},
			"traffic": map[string]interface{}{
				"tcpRx": tunnelRecord.TCPRx,
				"tcpTx": tunnelRecord.TCPTx,
				"udpRx": tunnelRecord.UDPRx,
				"udpTx": tunnelRecord.UDPTx,
				"pool": func() interface{} {
					if tunnelRecord.Pool.Valid {
						return tunnelRecord.Pool.Int64
					}
					return nil
				}(),
				"ping": func() interface{} {
					if tunnelRecord.Ping.Valid {
						return tunnelRecord.Ping.Int64
					}
					return nil
				}(),
				"tcps": func() interface{} {
					if tunnelRecord.TCPs.Valid {
						return tunnelRecord.TCPs.Int64
					}
					return nil
				}(),
				"udps": func() interface{} {
					if tunnelRecord.UDPs.Valid {
						return tunnelRecord.UDPs.Int64
					}
					return nil
				}(),
			},
			"tunnelAddress": tunnelRecord.TunnelAddress,
			"targetAddress": tunnelRecord.TargetAddress,
			"commandLine":   tunnelRecord.CommandLine,
			"tags": func() interface{} {
				if tunnelRecord.InstanceTags.Valid && tunnelRecord.InstanceTags.String != "" {
					var tags []nodepass.InstanceTag
					if err := json.Unmarshal([]byte(tunnelRecord.InstanceTags.String), &tags); err == nil {
						return tags
					}
					return []nodepass.InstanceTag{}
				}
				return []nodepass.InstanceTag{}
			}(),
		},
	}

	c.JSON(http.StatusOK, resp)
}

// HandleTunnelLogs 获取指定隧道日志 (GET /api/tunnels/{id}/logs)
func (h *TunnelHandler) HandleTunnelLogs(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少隧道ID"})
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的隧道ID"})
		return
	}

	db := h.tunnelService.DB()

	// 查询隧道获得 endpointId 与 instanceId
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "隧道不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !instanceID.Valid || instanceID.String == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"logs":        []interface{}{},
				"trafficData": []interface{}{},
			},
		})
		return
	}

	// 获取日志
	logRows, err := db.Query(`SELECT id, logs, tcp_rx, tcp_tx, udp_rx, udp_tx, created_at FROM endpoint_sse WHERE endpoint_id = ? AND instance_id = ? AND event_type = 'log' ORDER BY created_at DESC LIMIT 100`, endpointID, instanceID.String)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer logRows.Close()

	logs := make([]map[string]interface{}, 0)
	trafficTrend := make([]map[string]interface{}, 0)

	// 使用 map 来存储每分钟的最新流量记录
	minuteTrafficMap := make(map[string]map[string]interface{})

	for logRows.Next() {
		var id int64
		var logsStr sql.NullString
		var tcpRx, tcpTx, udpRx, udpTx sql.NullInt64
		var createdAt time.Time
		if err := logRows.Scan(&id, &logsStr, &tcpRx, &tcpTx, &udpRx, &udpTx, &createdAt); err == nil {
			logs = append(logs, map[string]interface{}{
				"id":        id,
				"message":   processAnsiColors(ptrString(logsStr)),
				"isHtml":    true,
				"traffic":   map[string]int64{"tcpRx": tcpRx.Int64, "tcpTx": tcpTx.Int64, "udpRx": udpRx.Int64, "udpTx": udpTx.Int64},
				"timestamp": createdAt,
			})

			// 格式化时间到分钟用于流量趋势去重
			minuteKey := createdAt.Format("2006-01-02 15:04")
			// 存储这一分钟的最新流量记录（由于是按时间降序，先出现的是最新的）
			if _, exists := minuteTrafficMap[minuteKey]; !exists {
				minuteTrafficMap[minuteKey] = map[string]interface{}{
					"timestamp": minuteKey,
					"tcpRx":     tcpRx.Int64,
					"tcpTx":     tcpTx.Int64,
					"udpRx":     udpRx.Int64,
					"udpTx":     udpTx.Int64,
				}
			}
		}
	}

	// 将去重后的流量数据转换为 slice，并按时间排序
	for _, record := range minuteTrafficMap {
		trafficTrend = append(trafficTrend, record)
	}

	// 按时间排序（升序）
	sort.Slice(trafficTrend, func(i, j int) bool {
		return trafficTrend[i]["timestamp"].(string) < trafficTrend[j]["timestamp"].(string)
	})

	c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"logs":        logs,
			"trafficData": trafficTrend,
		},
	})
}

// HandleTunnelFileLogs 获取指定隧道的文件日志 (GET /api/tunnels/{id}/file-logs?date=YYYY-MM-DD)
func (h *TunnelHandler) HandleTunnelFileLogs(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少隧道ID"})
		return
	}
	//id, err := strconv.ParseInt(idStr, 10, 64)
	//if err != nil {
	//	c.JSON(http.StatusBadRequest, gin.H{"error": "无效的隧道ID"})
	//	return
	//}

	// 获取日期参数
	dateStr := c.Query("date")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少date参数，格式为YYYY-MM-DD"})
		return
	}

	// 解析日期
	targetDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "日期格式无效，应为YYYY-MM-DD"})
		return
	}

	db := h.tunnelService.DB()

	// 查询隧道获得 endpointId 与 instanceId
	var endpointID int64
	if err := db.QueryRow(`SELECT endpoint_id FROM tunnels WHERE instance_id = ?`, idStr).Scan(&endpointID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "隧道不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Debug: 添加调试日志
	log.Infof("[DEBUG] 文件日志查询 - instanceID: %s, endpointID: %d, date: %s", idStr, endpointID, dateStr)

	// 检查是否有FileLogger
	if h.sseManager == nil || h.sseManager.GetFileLogger() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "文件日志服务不可用"})
		return
	}

	fileLogger := h.sseManager.GetFileLogger()

	// 读取指定日期的日志
	logEntries, err := fileLogger.ReadLogs(endpointID, idStr, targetDate, 1000) // 限制1000条
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("读取日志失败: %v", err)})
		return
	}

	// 转换为API响应格式
	logs := make([]map[string]interface{}, 0)
	for i, logContent := range logEntries {
		logs = append(logs, map[string]interface{}{
			"id":        i + 1,
			"message":   processAnsiColors(logContent),
			"isHtml":    true,
			"timestamp": targetDate.Add(time.Duration(i) * time.Second), // 简单的时间戳分配
		})
	}

	// 获取可用的日期列表，用于判断是否还有其他日志
	availableDates, err := fileLogger.GetAvailableLogDates(endpointID, idStr)
	hasMoreDays := len(availableDates) > 1 || (len(availableDates) == 1 && availableDates[0] != dateStr)
	if err != nil {
		// 如果获取日期列表失败，不影响主要功能
		hasMoreDays = false
	}

	c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"logs":        logs,
			"date":        dateStr,
			"hasMoreDays": hasMoreDays,
			"totalCount":  len(logs),
		},
	})
}

// processAnsiColors 将 ANSI 颜色码转换为 HTML span
func processAnsiColors(text string) string {
	// 移除时间戳前缀（可选）
	text = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\\s\d{2}:\d{2}:\d{2}\.\d{3}\\s`).ReplaceAllString(text, "")
	// 移除 ESC 字符
	text = strings.ReplaceAll(text, "\u001B", "")

	// 替换颜色代码
	colorMap := map[*regexp.Regexp]string{
		regexp.MustCompile(`\[32m`): "<span class=\"text-green-400\">",
		regexp.MustCompile(`\[31m`): "<span class=\"text-red-400\">",
		regexp.MustCompile(`\[33m`): "<span class=\"text-yellow-400\">",
		regexp.MustCompile(`\[34m`): "<span class=\"text-blue-400\">",
		regexp.MustCompile(`\[35m`): "<span class=\"text-purple-400\">",
		regexp.MustCompile(`\[36m`): "<span class=\"text-cyan-400\">",
		regexp.MustCompile(`\[37m`): "<span class=\"text-gray-400\">",
		regexp.MustCompile(`\[0m`):  "</span>",
	}
	for re, repl := range colorMap {
		text = re.ReplaceAllString(text, repl)
	}

	// 确保标签闭合
	openTags := strings.Count(text, "<span")
	closeTags := strings.Count(text, "</span>")
	if openTags > closeTags {
		text += strings.Repeat("</span>", openTags-closeTags)
	}
	return text
}

// ptrString 安全地从 sql.NullString 获取字符串
func ptrString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

// HandleQuickCreateTunnel 根据 URL 快速创建隧道
func (h *TunnelHandler) HandleQuickCreateTunnel(c *gin.Context) {
	var req struct {
		EndpointID int64  `json:"endpointId"`
		URL        string `json:"url"`
		Name       string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	if req.EndpointID == 0 || req.URL == "" || strings.TrimSpace(req.Name) == "" {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "endpointId、url、name 均不能为空",
		})
		return
	}

	// 使用直接URL模式创建隧道，避免重复解析
	// 注意：这里仍然做基本验证，但使用新的直接URL方法避免重复解析->组装的过程
	parsedTunnel := nodepass.ParseTunnelURL(req.URL)
	if parsedTunnel == nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的隧道URL格式",
		})
		return
	}

	// 使用新的直接URL方法，避免重复解析，超时时间为 3 秒
	if err := h.tunnelService.QuickCreateTunnelDirectURL(req.EndpointID, req.URL, req.Name, 3*time.Second); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, tunnel.TunnelResponse{
		Success: true,
		Message: "隧道创建成功",
	})
}

// HandleQuickBatchCreateTunnel 批量快速创建隧道
func (h *TunnelHandler) HandleQuickBatchCreateTunnel(c *gin.Context) {
	var req struct {
		Rules []struct {
			EndpointID int64  `json:"endpointId"`
			URL        string `json:"url"`
			Name       string `json:"name"`
		} `json:"rules"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	if len(req.Rules) == 0 {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "请至少提供一条隧道规则",
		})
		return
	}

	// 验证所有规则
	for i, rule := range req.Rules {
		if rule.EndpointID == 0 || rule.URL == "" || strings.TrimSpace(rule.Name) == "" {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   fmt.Sprintf("第 %d 条规则：endpointId、url、name 均不能为空", i+1),
			})
			return
		}
	}

	// 批量创建隧道
	var successCount, failCount int
	var errorMessages []string

	for i, rule := range req.Rules {
		// 使用直接URL模式批量创建隧道，避免重复解析，超时时间为 3 秒
		if err := h.tunnelService.QuickCreateTunnelDirectURL(rule.EndpointID, rule.URL, rule.Name, 3*time.Second); err != nil {
			failCount++
			errorMessages = append(errorMessages, fmt.Sprintf("第 %d 条规则失败：%s", i+1, err.Error()))
			log.Errorf("[API] 批量创建隧道失败 - 规则 %d: %v", i+1, err)
		} else {
			successCount++
			log.Infof("[API] 批量创建隧道成功 - 规则 %d: %s", i+1, rule.Name)
		}
	}

	// 返回结果
	if failCount == 0 {
		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success: true,
			Message: fmt.Sprintf("成功创建 %d 个隧道", successCount),
		})
	} else if successCount == 0 {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   fmt.Sprintf("所有隧道创建失败：%s", strings.Join(errorMessages, "; ")),
		})
	} else {
		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success: true,
			Message: fmt.Sprintf("部分成功：成功创建 %d 个隧道，失败 %d 个。失败原因：%s",
				successCount, failCount, strings.Join(errorMessages, "; ")),
		})
	}
}

// getTunnelIDByName 通过隧道名称获取隧道数据库ID
func (h *TunnelHandler) getTunnelIDByName(tunnelName string) (int64, error) {
	var tunnelID int64
	err := h.tunnelService.DB().QueryRow(`SELECT id FROM tunnels WHERE name = ?`, tunnelName).Scan(&tunnelID)
	return tunnelID, err
}

// HandleTemplateCreate 处理模板创建请求
func (h *TunnelHandler) HandleTemplateCreate(c *gin.Context) {

	// 定义请求结构体
	var req struct {
		Log        string `json:"log"`
		ListenHost string `json:"listen_host,omitempty"`
		ListenPort int    `json:"listen_port"`
		Mode       string `json:"mode"`
		TLS        int    `json:"tls,omitempty"`
		CertPath   string `json:"cert_path,omitempty"`
		KeyPath    string `json:"key_path,omitempty"`
		Inbounds   *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		} `json:"inbounds,omitempty"`
		Outbounds *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		} `json:"outbounds,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	log.Infof("[API] 模板创建请求: mode=%s, listen_host=%s, listen_port=%d", req.Mode, req.ListenHost, req.ListenPort)

	switch req.Mode {
	case "single":
		if req.Inbounds == nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "单端模式缺少inbounds配置",
			})
			return
		}

		// 获取中转主控信息
		var endpointName string
		db := h.tunnelService.DB()
		err := db.QueryRow(
			"SELECT name FROM endpoints WHERE id = ?",
			req.Inbounds.MasterID,
		).Scan(&endpointName)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的中转主控不存在",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, tunnel.TunnelResponse{
				Success: false,
				Error:   "查询中转主控失败",
			})
			return
		}

		// 构建单端转发的URL，支持listen_host
		var listenAddr string
		if req.ListenHost != "" {
			listenAddr = fmt.Sprintf("%s:%d", req.ListenHost, req.ListenPort)
		} else {
			listenAddr = fmt.Sprintf(":%d", req.ListenPort)
		}

		tunnelURL := fmt.Sprintf("client://%s/%s:%d?log=%s",
			listenAddr,
			req.Inbounds.TargetHost,
			req.Inbounds.TargetPort,
			req.Log,
		)

		// 生成隧道名称 - 单端模式使用主控名-single-时间戳
		tunnelName := fmt.Sprintf("%s-single-%d", endpointName, time.Now().Unix())

		// 使用直接URL模式创建隧道，超时时间为 3 秒
		if err := h.tunnelService.QuickCreateTunnelDirectURL(req.Inbounds.MasterID, tunnelURL, tunnelName, 3*time.Second); err != nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "创建单端隧道失败: " + err.Error(),
			})
			return
		}

		// 获取创建的隧道ID
		tunnelID, _ := h.getTunnelIDByName(tunnelName)
		// if err == nil {
		// 	groupName := endpointName
		// 	if err := h.createTunnelGroup(groupName, "single", "单端转发分组", []int64{tunnelID}); err != nil {
		// 		log.Warnf("[API] 自动创建分组失败: %v", err)
		// 	}
		// }

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success:   true,
			Message:   "单端转发隧道创建成功",
			TunnelIDs: []int64{tunnelID}, // 返回创建的隧道ID
		})

	case "bothway":
		if req.Inbounds == nil || req.Outbounds == nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "双端模式缺少inbounds或outbounds配置",
			})
			return
		}

		// 根据type字段确定哪个是server，哪个是client
		var serverConfig, clientConfig *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		}

		if req.Inbounds.Type == "server" {
			serverConfig = req.Inbounds
			clientConfig = req.Outbounds
		} else {
			serverConfig = req.Outbounds
			clientConfig = req.Inbounds
		}

		// 获取endpoint信息
		var serverEndpoint, clientEndpoint struct {
			ID      int64
			URL     string
			IP      string
			APIPath string
			APIKey  string
			Name    string
		}

		db := h.tunnelService.DB()
		// 获取server endpoint信息
		err := db.QueryRow(
			"SELECT id, url, ip, api_path, api_key, name FROM endpoints WHERE id = ?",
			serverConfig.MasterID,
		).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.IP, &serverEndpoint.APIPath, &serverEndpoint.APIKey, &serverEndpoint.Name)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的服务端主控不存在",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, tunnel.TunnelResponse{
				Success: false,
				Error:   "查询服务端主控失败",
			})
			return
		}

		// 获取client endpoint信息
		err = db.QueryRow(
			"SELECT id, url, ip, api_path, api_key, name FROM endpoints WHERE id = ?",
			clientConfig.MasterID,
		).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.IP, &clientEndpoint.APIPath, &clientEndpoint.APIKey, &clientEndpoint.Name)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的客户端主控不存在",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, tunnel.TunnelResponse{
				Success: false,
				Error:   "查询客户端主控失败",
			})
			return
		}

		// 使用数据库中存储的server端IP
		serverIP := serverEndpoint.IP
		if serverIP == "" {
			// 如果数据库中没有IP，降级到从URL提取
			serverIP = strings.TrimPrefix(serverEndpoint.URL, "http://")
			serverIP = strings.TrimPrefix(serverIP, "https://")
			if idx := strings.Index(serverIP, ":"); idx != -1 {
				serverIP = serverIP[:idx]
			}
			if idx := strings.Index(serverIP, "/"); idx != -1 {
				serverIP = serverIP[:idx]
			}
		}

		// 双端转发：server端监听listen_port，转发到outbounds的target
		serverURL := fmt.Sprintf("server://:%d/%s:%d",
			req.ListenPort,
			serverConfig.TargetHost,
			serverConfig.TargetPort,
		)
		if req.TLS > 0 {
			serverURL += fmt.Sprintf("?tls=%d&log=%s", req.TLS, req.Log)
			// 如果是TLS 2且提供了证书路径，添加证书参数
			if req.TLS == 2 && req.CertPath != "" && req.KeyPath != "" {
				serverURL += fmt.Sprintf("&cert=%s&key=%s", url.QueryEscape(req.CertPath), url.QueryEscape(req.KeyPath))
			}
		} else {
			serverURL += fmt.Sprintf("?log=%s", req.Log)
		}

		// 双端转发：client端连接到server的IP:listen_port，转发到inbounds的target
		clientURL := fmt.Sprintf("client://%s:%d/%s:%d?log=%s",
			serverIP,
			req.ListenPort,
			clientConfig.TargetHost,
			clientConfig.TargetPort,
			req.Log,
		)

		// ⇔生成隧道名称 - 格式：${入口主控名}to${出口主控名}-${类型}-${时间}
		timestamp := time.Now().Unix()
		serverTunnelName := fmt.Sprintf("%s->%s-s-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
		clientTunnelName := fmt.Sprintf("%s->%s-c-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)

		log.Infof("[API] 开始创建双端隧道 - 先创建server端，再创建client端")

		// 第一步：创建server端隧道（使用直接URL模式）
		log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
		if err := h.tunnelService.QuickCreateTunnelDirectURL(serverConfig.MasterID, serverURL, serverTunnelName, 3*time.Second); err != nil {
			log.Errorf("[API] 创建server端隧道失败: %v", err)
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "创建server端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤1完成: server端隧道创建成功")

		// 第二步：创建client端隧道（使用直接URL模式）
		log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
		if err := h.tunnelService.QuickCreateTunnelDirectURL(clientConfig.MasterID, clientURL, clientTunnelName, 3*time.Second); err != nil {
			log.Errorf("[API] 创建client端隧道失败: %v", err)
			// 如果client端创建失败，可以考虑回滚server端，但这里先简单处理
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "创建client端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤2完成: client端隧道创建成功")
		log.Infof("[API] 双端隧道创建完成")

		// 获取创建的隧道ID并自动创建分组
		var tunnelIDs []int64
		if serverTunnelID, err := h.getTunnelIDByName(serverTunnelName); err == nil {
			tunnelIDs = append(tunnelIDs, serverTunnelID)
		}
		if clientTunnelID, err := h.getTunnelIDByName(clientTunnelName); err == nil {
			tunnelIDs = append(tunnelIDs, clientTunnelID)
		}

		// if len(tunnelIDs) > 0 {
		// 	groupName := fmt.Sprintf("%s->%s", serverEndpoint.Name, clientEndpoint.Name)
		// 	if err := h.createTunnelGroup(groupName, "double", "双端转发分组", tunnelIDs); err != nil {
		// 		log.Warnf("[API] 自动创建分组失败: %v", err)
		// 	}
		// }

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success:   true,
			Message:   "双端转发隧道创建成功",
			TunnelIDs: tunnelIDs, // 返回创建的隧道ID列表
		})

	case "intranet":
		if req.Inbounds == nil || req.Outbounds == nil {
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "内网穿透模式缺少inbounds或outbounds配置",
			})
			return
		}

		// 根据type字段确定哪个是server，哪个是client
		var serverConfig, clientConfig *struct {
			TargetHost string `json:"target_host"`
			TargetPort int    `json:"target_port"`
			MasterID   int64  `json:"master_id"`
			Type       string `json:"type"`
		}

		if req.Inbounds.Type == "server" {
			serverConfig = req.Inbounds
			clientConfig = req.Outbounds
		} else {
			serverConfig = req.Outbounds
			clientConfig = req.Inbounds
		}

		// 获取endpoint信息
		var serverEndpoint, clientEndpoint struct {
			ID      int64
			URL     string
			IP      string
			APIPath string
			APIKey  string
			Name    string
		}

		db := h.tunnelService.DB()
		// 获取server endpoint信息
		err := db.QueryRow(
			"SELECT id, url, ip, api_path, api_key, name FROM endpoints WHERE id = ?",
			serverConfig.MasterID,
		).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.IP, &serverEndpoint.APIPath, &serverEndpoint.APIKey, &serverEndpoint.Name)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的服务端主控不存在",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, tunnel.TunnelResponse{
				Success: false,
				Error:   "查询服务端主控失败",
			})
			return
		}

		// 获取client endpoint信息
		err = db.QueryRow(
			"SELECT id, url, ip, api_path, api_key, name FROM endpoints WHERE id = ?",
			clientConfig.MasterID,
		).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.IP, &clientEndpoint.APIPath, &clientEndpoint.APIKey, &clientEndpoint.Name)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
					Success: false,
					Error:   "指定的客户端主控不存在",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, tunnel.TunnelResponse{
				Success: false,
				Error:   "查询客户端主控失败",
			})
			return
		}

		// 使用数据库中存储的server端IP
		serverIP := serverEndpoint.IP
		if serverIP == "" {
			// 如果数据库中没有IP，降级到从URL提取
			serverIP = strings.TrimPrefix(serverEndpoint.URL, "http://")
			serverIP = strings.TrimPrefix(serverIP, "https://")
			if idx := strings.Index(serverIP, ":"); idx != -1 {
				serverIP = serverIP[:idx]
			}
			if idx := strings.Index(serverIP, "/"); idx != -1 {
				serverIP = serverIP[:idx]
			}
		}

		// 内网穿透：server端监听listen_port，目标是用户要访问的地址
		serverURL := fmt.Sprintf("server://:%d/%s:%d",
			req.ListenPort,
			serverConfig.TargetHost,
			serverConfig.TargetPort,
		)
		if req.TLS > 0 {
			serverURL += fmt.Sprintf("?tls=%d&log=%s", req.TLS, req.Log)
			// 如果是TLS 2且提供了证书路径，添加证书参数
			if req.TLS == 2 && req.CertPath != "" && req.KeyPath != "" {
				serverURL += fmt.Sprintf("&cert=%s&key=%s", url.QueryEscape(req.CertPath), url.QueryEscape(req.KeyPath))
			}
		} else {
			serverURL += fmt.Sprintf("?log=%s", req.Log)
		}

		// 内网穿透：client端连接到server的IP:listen_port，转发到最终目标
		clientURL := fmt.Sprintf("client://%s:%d/%s:%d?log=%s",
			serverIP,
			req.ListenPort,
			clientConfig.TargetHost,
			clientConfig.TargetPort,
			req.Log,
		)

		// 生成隧道名称 - 格式：${入口主控名}to${出口主控名}-${类型}-${时间}
		timestamp := time.Now().Unix()
		serverTunnelName := fmt.Sprintf("%s->%s-s-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
		clientTunnelName := fmt.Sprintf("%s->%s-c-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)

		log.Infof("[API] 开始创建内网穿透隧道 - 先创建server端，再创建client端")

		// 第一步：创建server端隧道（使用直接URL模式）
		log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
		if err := h.tunnelService.QuickCreateTunnelDirectURL(serverConfig.MasterID, serverURL, serverTunnelName, 3*time.Second); err != nil {
			log.Errorf("[API] 创建server端隧道失败: %v", err)
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "创建server端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤1完成: server端隧道创建成功")

		// 第二步：创建client端隧道（使用直接URL模式）
		log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
		if err := h.tunnelService.QuickCreateTunnelDirectURL(clientConfig.MasterID, clientURL, clientTunnelName, 3*time.Second); err != nil {
			log.Errorf("[API] 创建client端隧道失败: %v", err)
			// 如果client端创建失败，可以考虑回滚server端，但这里先简单处理
			c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
				Success: false,
				Error:   "创建client端隧道失败: " + err.Error(),
			})
			return
		}
		log.Infof("[API] 步骤2完成: client端隧道创建成功")
		log.Infof("[API] 内网穿透隧道创建完成")

		// 获取创建的隧道ID并自动创建分组
		var tunnelIDs []int64
		if serverTunnelID, err := h.getTunnelIDByName(serverTunnelName); err == nil {
			tunnelIDs = append(tunnelIDs, serverTunnelID)
		}
		if clientTunnelID, err := h.getTunnelIDByName(clientTunnelName); err == nil {
			tunnelIDs = append(tunnelIDs, clientTunnelID)
		}

		// if len(tunnelIDs) > 0 {
		// 	groupName := fmt.Sprintf("%s->%s", clientEndpoint.Name, serverEndpoint.Name)
		// 	if err := h.createTunnelGroup(groupName, "intranet", "内网穿透分组", tunnelIDs); err != nil {
		// 		log.Warnf("[API] 自动创建分组失败: %v", err)
		// 	}
		// }

		c.JSON(http.StatusOK, tunnel.TunnelResponse{
			Success:   true,
			Message:   "内网穿透隧道创建成功",
			TunnelIDs: tunnelIDs, // 返回创建的隧道ID列表
		})

	default:
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{
			Success: false,
			Error:   "不支持的隧道模式: " + req.Mode,
		})
		return
	}
}

// HandleBatchDeleteTunnels 批量删除隧道 (DELETE /api/tunnels/batch)
func (h *TunnelHandler) HandleBatchDeleteTunnels(c *gin.Context) {

	type batchDeleteRequest struct {
		// 根据数据库 ID 删除，可选
		IDs []int64 `json:"ids"`
		// 根据实例 ID 删除，可选
		InstanceIDs []string `json:"instanceIds"`
		// 是否移入回收站
		Recycle bool `json:"recycle"`
	}

	type itemResult struct {
		ID         int64  `json:"id,omitempty"`
		InstanceID string `json:"instanceId"`
		Success    bool   `json:"success"`
		Error      string `json:"error,omitempty"`
	}

	type batchDeleteResponse struct {
		Success   bool         `json:"success"`
		Deleted   int          `json:"deleted"`
		FailCount int          `json:"failCount"`
		Error     string       `json:"error,omitempty"`
		Results   []itemResult `json:"results,omitempty"`
	}

	var req batchDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, batchDeleteResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 至少提供一种 ID
	if len(req.IDs) == 0 && len(req.InstanceIDs) == 0 {
		c.JSON(http.StatusBadRequest, batchDeleteResponse{
			Success: false,
			Error:   "缺少隧道ID",
		})
		return
	}

	// 将 IDs 转换为 instanceIDs
	for _, id := range req.IDs {
		if iid, err := h.tunnelService.GetInstanceIDByTunnelID(id); err == nil {
			req.InstanceIDs = append(req.InstanceIDs, iid)
		}
	}

	if len(req.InstanceIDs) == 0 {
		c.JSON(http.StatusBadRequest, batchDeleteResponse{
			Success: false,
			Error:   "没有有效的隧道实例ID",
		})
		return
	}

	// 如果不是移入回收站，预先获取隧道ID和端点ID用于清理分组关系和文件日志
	var instanceEndpointMap = make(map[string]int64)
	var instanceTunnelMap = make(map[string]int64)
	if !req.Recycle {
		for _, iid := range req.InstanceIDs {
			var tunnelID, endpointID int64
			if err := h.tunnelService.DB().QueryRow(`SELECT id, endpoint_id FROM tunnels WHERE instance_id = ?`, iid).Scan(&tunnelID, &endpointID); err == nil {
				instanceTunnelMap[iid] = tunnelID
				instanceEndpointMap[iid] = endpointID
			} else {
				// 尝试从EndpointSSE表获取
				if err := h.tunnelService.DB().QueryRow(`SELECT DISTINCT endpoint_id FROM endpoint_sse WHERE instance_id = ? LIMIT 1`, iid).Scan(&endpointID); err == nil {
					instanceEndpointMap[iid] = endpointID
				}
			}
		}
	}

	// 开始删除
	var resp batchDeleteResponse
	for _, iid := range req.InstanceIDs {
		r := itemResult{InstanceID: iid}

		// 如果不是移入回收站，先解绑分组关系
		if !req.Recycle {
			// 清理标签关联等其他操作可以在这里进行
		}

		if err := h.tunnelService.DeleteTunnelAndWait(iid, 3*time.Second, req.Recycle); err != nil {
			r.Success = false
			r.Error = err.Error()
			resp.FailCount++
		} else {
			r.Success = true
			resp.Deleted++

			// 如果不是移入回收站，清理文件日志
			if !req.Recycle {
				if endpointID, exists := instanceEndpointMap[iid]; exists {
					if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
						if err := h.sseManager.GetFileLogger().ClearLogs(endpointID, iid); err != nil {
							log.Warnf("[API] 批量删除-清理隧道文件日志失败: endpointID=%d, instanceID=%s, err=%v", endpointID, iid, err)
						} else {
							log.Infof("[API] 批量删除-已清理隧道文件日志: endpointID=%d, instanceID=%s", endpointID, iid)
						}
					}
				}
			}
		}
		resp.Results = append(resp.Results, r)
	}

	resp.Success = resp.FailCount == 0

	// 设置状态码
	if resp.Success {
		if resp.FailCount > 0 {
			c.JSON(http.StatusPartialContent, resp)
		} else {
			c.JSON(http.StatusOK, resp)
		}
	} else {
		c.JSON(http.StatusBadRequest, resp)
	}
}

// HandleNewBatchCreateTunnels 新的批量创建隧道处理
func (h *TunnelHandler) HandleNewBatchCreateTunnels(c *gin.Context) {
	var req tunnel.NewBatchCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 添加调试日志，显示接收到的原始请求数据
	reqBytes, _ := json.MarshalIndent(req, "", "  ")
	log.Infof("[API] 接收到新的批量创建请求，原始数据: %s", string(reqBytes))

	// 验证请求模式
	if req.Mode == "" {
		c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "请求模式不能为空",
		})
		return
	}

	// 根据模式验证具体数据
	switch req.Mode {
	case "standard":
		if len(req.Standard) == 0 {
			c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   "标准模式批量创建项目不能为空",
			})
			return
		}

		// 限制批量创建的数量
		const maxBatchSize = 50
		if len(req.Standard) > maxBatchSize {
			c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   fmt.Sprintf("标准模式批量创建数量不能超过 %d 个", maxBatchSize),
			})
			return
		}

		// 验证每个项目的必填字段
		for i, item := range req.Standard {
			if item.EndpointID <= 0 {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的端点ID无效", i+1),
				})
				return
			}
			if item.TunnelPort <= 0 || item.TunnelPort > 65535 {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的隧道端口无效", i+1),
				})
				return
			}
			if item.TargetHost == "" {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的目标地址不能为空", i+1),
				})
				return
			}
			if item.TargetPort <= 0 || item.TargetPort > 65535 {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的目标端口无效", i+1),
				})
				return
			}
			if item.Name == "" {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 项的隧道名称不能为空", i+1),
				})
				return
			}
		}

	case "config":
		if len(req.Config) == 0 {
			c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   "配置模式批量创建项目不能为空",
			})
			return
		}

		// 计算总的配置项数量并验证
		totalConfigs := 0
		for _, configItem := range req.Config {
			totalConfigs += len(configItem.Config)
		}

		const maxBatchSize = 50
		if totalConfigs > maxBatchSize {
			c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
				Success: false,
				Error:   fmt.Sprintf("配置模式批量创建数量不能超过 %d 个", maxBatchSize),
			})
			return
		}

		// 验证每个配置项
		for i, configItem := range req.Config {
			if configItem.EndpointID <= 0 {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 个配置组的端点ID无效", i+1),
				})
				return
			}

			if len(configItem.Config) == 0 {
				c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
					Success: false,
					Error:   fmt.Sprintf("第 %d 个配置组的配置列表不能为空", i+1),
				})
				return
			}

			for j, config := range configItem.Config {
				if config.ListenPort <= 0 || config.ListenPort > 65535 {
					c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
						Success: false,
						Error:   fmt.Sprintf("第 %d 个配置组第 %d 项的监听端口无效", i+1, j+1),
					})
					return
				}
				if config.Dest == "" {
					c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
						Success: false,
						Error:   fmt.Sprintf("第 %d 个配置组第 %d 项的目标地址不能为空", i+1, j+1),
					})
					return
				}
				if config.Name == "" {
					c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
						Success: false,
						Error:   fmt.Sprintf("第 %d 个配置组第 %d 项的隧道名称不能为空", i+1, j+1),
					})
					return
				}
			}
		}

	default:
		c.JSON(http.StatusBadRequest, tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "不支持的批量创建模式: " + req.Mode,
		})
		return
	}

	log.Infof("[API] 接收到新的批量创建隧道请求，模式: %s", req.Mode)

	// 调用服务层新的批量创建
	response, err := h.tunnelService.NewBatchCreateTunnels(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, tunnel.NewBatchCreateResponse{
			Success: false,
			Error:   "新批量创建失败: " + err.Error(),
		})
		return
	}

	// 根据结果设置HTTP状态码
	if response.Success {
		if response.FailCount > 0 {
			// 部分成功
			c.JSON(http.StatusPartialContent, response)
		} else {
			// 全部成功
			c.JSON(http.StatusOK, response)
		}
	} else {
		// 全部失败
		c.JSON(http.StatusBadRequest, response)
	}
}

// HandleBatchActionTunnels 批量操作隧道（启动、停止、重启）
func (h *TunnelHandler) HandleBatchActionTunnels(c *gin.Context) {

	// 请求结构体
	type batchActionRequest struct {
		// 根据数据库 ID 操作
		IDs []int64 `json:"ids"`
		// 操作类型: start, stop, restart
		Action string `json:"action"`
	}

	// 操作结果
	type actionResult struct {
		ID         int64  `json:"id"`
		InstanceID string `json:"instanceId"`
		Name       string `json:"name"`
		Success    bool   `json:"success"`
		Error      string `json:"error,omitempty"`
	}

	// 响应结构体
	type batchActionResponse struct {
		Success   bool           `json:"success"`
		Operated  int            `json:"operated"`
		FailCount int            `json:"failCount"`
		Error     string         `json:"error,omitempty"`
		Results   []actionResult `json:"results,omitempty"`
		Action    string         `json:"action"`
	}

	var req batchActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, batchActionResponse{
			Success: false,
			Error:   "无效的请求数据",
		})
		return
	}

	// 验证操作类型
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		c.JSON(http.StatusBadRequest, batchActionResponse{
			Success: false,
			Error:   "无效的操作类型，支持: start, stop, restart",
		})
		return
	}

	// 验证 ID 列表
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, batchActionResponse{
			Success: false,
			Error:   "请提供要操作的隧道ID列表",
		})
		return
	}

	// 限制批量操作的数量
	const maxBatchSize = 50
	if len(req.IDs) > maxBatchSize {
		c.JSON(http.StatusBadRequest, batchActionResponse{
			Success: false,
			Error:   fmt.Sprintf("批量操作数量不能超过 %d 个", maxBatchSize),
		})
		return
	}

	log.Infof("[API] 开始批量%s操作，共 %d 个隧道", req.Action, len(req.IDs))

	var results []actionResult
	successCount := 0
	failCount := 0

	// 逐个处理每个隧道
	for _, tunnelID := range req.IDs {
		result := actionResult{
			ID: tunnelID,
		}

		// 获取隧道的 instanceID 和名称
		instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
		if err != nil {
			result.Success = false
			result.Error = fmt.Sprintf("获取实例ID失败: %v", err)
			failCount++
			results = append(results, result)
			continue
		}
		result.InstanceID = instanceID

		// 获取隧道名称（用于日志）
		tunnelName, err := h.tunnelService.GetTunnelNameByID(tunnelID)
		if err != nil {
			tunnelName = fmt.Sprintf("Tunnel-%d", tunnelID)
		}
		result.Name = tunnelName

		// 执行操作
		actionReq := tunnel.TunnelActionRequest{
			InstanceID: instanceID,
			Action:     req.Action,
		}

		if err := h.tunnelService.ControlTunnel(actionReq); err != nil {
			result.Success = false
			result.Error = err.Error()
			failCount++
			log.Warnf("[API] 批量%s操作失败 - 隧道: %s (ID: %d, InstanceID: %s), 错误: %v",
				req.Action, tunnelName, tunnelID, instanceID, err)
		} else {
			result.Success = true
			successCount++
			log.Infof("[API] 批量%s操作成功 - 隧道: %s (ID: %d, InstanceID: %s)",
				req.Action, tunnelName, tunnelID, instanceID)
		}

		results = append(results, result)
	}

	// 构建响应
	response := batchActionResponse{
		Success:   successCount > 0,
		Operated:  successCount,
		FailCount: failCount,
		Results:   results,
		Action:    req.Action,
	}

	// 设置整体错误信息
	if failCount > 0 && successCount == 0 {
		response.Error = "所有操作都失败了"
	} else if failCount > 0 {
		response.Error = fmt.Sprintf("部分操作失败: %d 个成功, %d 个失败", successCount, failCount)
	}

	statusCode := http.StatusOK
	if successCount == 0 {
		statusCode = http.StatusBadRequest
	}

	c.JSON(statusCode, response)

	log.Infof("[API] 批量%s操作完成 - 成功: %d, 失败: %d", req.Action, successCount, failCount)
}

// HandleGetTunnelTrafficTrend 获取隧道流量趋势数据 (GET /api/tunnels/{id}/traffic-trend)
func (h *TunnelHandler) HandleGetTunnelTrafficTrend(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "缺少隧道ID"})
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	db := h.tunnelService.DB()

	// 查询隧道基本信息
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]interface{}{"error": "隧道不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
		return
	}

	trafficTrend := make([]map[string]interface{}, 0)

	if instanceID.Valid && instanceID.String != "" {
		// 流量趋势 - 查询24小时内的数据
		trendRows, err := db.Query(`SELECT event_time, tcp_rx, tcp_tx, udp_rx, udp_tx, pool, ping FROM endpoint_sse WHERE endpoint_id = ? AND instance_id = ? AND push_type IN ('update','initial') AND (tcp_rx IS NOT NULL OR tcp_tx IS NOT NULL OR udp_rx IS NOT NULL OR udp_tx IS NOT NULL) AND event_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY event_time ASC`, endpointID, instanceID.String)
		if err == nil {
			defer trendRows.Close()

			// 使用 map 来存储每分钟的最新记录
			minuteMap := make(map[string]map[string]interface{})

			for trendRows.Next() {
				var eventTime time.Time
				var tcpRx, tcpTx, udpRx, udpTx, pool, ping sql.NullInt64
				if err := trendRows.Scan(&eventTime, &tcpRx, &tcpTx, &udpRx, &udpTx, &pool, &ping); err == nil {
					// 格式化时间到分钟
					minuteKey := eventTime.Format("2006-01-02 15:04")

					// 存储这一分钟的最新记录（由于是按时间升序，后面的会覆盖前面的）
					minuteMap[minuteKey] = map[string]interface{}{
						"eventTime": minuteKey,
						"tcpRx":     tcpRx.Int64,
						"tcpTx":     tcpTx.Int64,
						"udpRx":     udpRx.Int64,
						"udpTx":     udpTx.Int64,
						"pool": func() interface{} {
							if pool.Valid {
								return pool.Int64
							}
							return nil
						}(),
						"ping": func() interface{} {
							if ping.Valid {
								return ping.Int64
							}
							return nil
						}(),
					}
				}
			}

			// 将 map 转换为有序的 slice
			type TrafficPoint struct {
				EventTime string `json:"eventTime"`
				TcpRx     int64  `json:"tcpRx"`
				TcpTx     int64  `json:"tcpTx"`
				UdpRx     int64  `json:"udpRx"`
				UdpTx     int64  `json:"udpTx"`
				Pool      *int64 `json:"pool,omitempty"`
				Ping      *int64 `json:"ping,omitempty"`
			}

			var sortedPoints []TrafficPoint
			for _, record := range minuteMap {
				poolVal := func() *int64 {
					if pool, ok := record["pool"].(int64); ok {
						return &pool
					}
					return nil
				}()
				pingVal := func() *int64 {
					if ping, ok := record["ping"].(int64); ok {
						return &ping
					}
					return nil
				}()

				sortedPoints = append(sortedPoints, TrafficPoint{
					EventTime: record["eventTime"].(string),
					TcpRx:     record["tcpRx"].(int64),
					TcpTx:     record["tcpTx"].(int64),
					UdpRx:     record["udpRx"].(int64),
					UdpTx:     record["udpTx"].(int64),
					Pool:      poolVal,
					Ping:      pingVal,
				})
			}

			// 按时间排序
			sort.Slice(sortedPoints, func(i, j int) bool {
				return sortedPoints[i].EventTime < sortedPoints[j].EventTime
			})

			// 计算差值并构建最终的流量趋势数据
			for i := 1; i < len(sortedPoints); i++ {
				current := sortedPoints[i]
				previous := sortedPoints[i-1]

				// 计算差值，确保非负数
				tcpRxDiff := int64(0)
				if current.TcpRx >= previous.TcpRx {
					tcpRxDiff = current.TcpRx - previous.TcpRx
				}

				tcpTxDiff := int64(0)
				if current.TcpTx >= previous.TcpTx {
					tcpTxDiff = current.TcpTx - previous.TcpTx
				}

				udpRxDiff := int64(0)
				if current.UdpRx >= previous.UdpRx {
					udpRxDiff = current.UdpRx - previous.UdpRx
				}

				udpTxDiff := int64(0)
				if current.UdpTx >= previous.UdpTx {
					udpTxDiff = current.UdpTx - previous.UdpTx
				}

				// 计算pool和ping的差值
				poolDiff := int64(0)
				if current.Pool != nil && previous.Pool != nil {
					if *current.Pool >= *previous.Pool {
						poolDiff = *current.Pool - *previous.Pool
					}
				}

				pingDiff := int64(0)
				if current.Ping != nil && previous.Ping != nil {
					if *current.Ping >= *previous.Ping {
						pingDiff = *current.Ping - *previous.Ping
					}
				}

				// 添加差值数据到趋势中
				trendData := map[string]interface{}{
					"eventTime": current.EventTime,
					"tcpRxDiff": float64(tcpRxDiff), // 确保JSON序列化为数字
					"tcpTxDiff": float64(tcpTxDiff), // 确保JSON序列化为数字
					"udpRxDiff": float64(udpRxDiff), // 确保JSON序列化为数字
					"udpTxDiff": float64(udpTxDiff), // 确保JSON序列化为数字
				}

				// 只有当pool和ping有有效差值时才添加到数据中
				if poolDiff > 0 {
					trendData["poolDiff"] = float64(poolDiff)
				}
				if pingDiff > 0 {
					trendData["pingDiff"] = float64(pingDiff)
				}

				trafficTrend = append(trafficTrend, trendData)
			}

			// 补充缺失的时间点到当前时间
			if len(trafficTrend) > 0 {
				// 获取最后一个数据点的时间
				lastItem := trafficTrend[len(trafficTrend)-1]
				lastTimeStr := lastItem["eventTime"].(string)

				// 解析最后时间
				lastTime, err := time.Parse("2006-01-02 15:04", lastTimeStr)
				if err == nil {
					now := time.Now()
					// 计算时间差（分钟）
					timeDiffMinutes := int(now.Sub(lastTime).Minutes())

					// 如果最后数据时间距离当前时间超过2分钟，就补充虚拟时间点
					if timeDiffMinutes > 2 {
						// 从最后数据时间的下一分钟开始补充
						currentTime := lastTime.Add(time.Minute)

						for currentTime.Before(now) {
							// 格式化为 "YYYY-MM-DD HH:mm" 格式
							virtualTimeStr := currentTime.Format("2006-01-02 15:04")

							// 添加虚拟数据点（所有流量差值都为0，不包含pool和ping）
							trafficTrend = append(trafficTrend, map[string]interface{}{
								"eventTime": virtualTimeStr,
								"tcpRxDiff": float64(0),
								"tcpTxDiff": float64(0),
								"udpRxDiff": float64(0),
								"udpTxDiff": float64(0),
							})

							// 移动到下一分钟
							currentTime = currentTime.Add(time.Minute)
						}
					}
				}
			}
		}
	}

	// 返回流量趋势数据
	c.JSON(http.StatusOK, map[string]interface{}{
		"success":      true,
		"trafficTrend": trafficTrend,
	})
}

// HandleGetTunnelPingTrend 获取隧道延迟趋势数据 (GET /api/tunnels/{id}/ping-trend)
func (h *TunnelHandler) HandleGetTunnelPingTrend(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "缺少隧道ID"})
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	db := h.tunnelService.DB()

	// 查询隧道基本信息
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]interface{}{"error": "隧道不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
		return
	}

	pingTrend := make([]map[string]interface{}, 0)

	if instanceID.Valid && instanceID.String != "" {
		// 延迟趋势 - 查询24小时内的ping数据
		trendRows, err := db.Query(`SELECT event_time, ping FROM endpoint_sse WHERE endpoint_id = ? AND instance_id = ? AND push_type IN ('update','initial') AND ping IS NOT NULL AND event_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY event_time ASC`, endpointID, instanceID.String)
		if err == nil {
			defer trendRows.Close()

			// 使用 map 来存储每分钟的最新记录
			minuteMap := make(map[string]map[string]interface{})

			for trendRows.Next() {
				var eventTime time.Time
				var ping sql.NullInt64
				if err := trendRows.Scan(&eventTime, &ping); err == nil && ping.Valid {
					// 格式化时间到分钟
					minuteKey := eventTime.Format("2006-01-02 15:04")

					// 存储这一分钟的最新记录（由于是按时间升序，后面的会覆盖前面的）
					minuteMap[minuteKey] = map[string]interface{}{
						"eventTime": minuteKey,
						"ping":      ping.Int64,
					}
				}
			}

			// 将 map 转换为有序的 slice
			type PingPoint struct {
				EventTime string `json:"eventTime"`
				Ping      int64  `json:"ping"`
			}

			var sortedPoints []PingPoint
			for _, record := range minuteMap {
				sortedPoints = append(sortedPoints, PingPoint{
					EventTime: record["eventTime"].(string),
					Ping:      record["ping"].(int64),
				})
			}

			// 按时间排序
			sort.Slice(sortedPoints, func(i, j int) bool {
				return sortedPoints[i].EventTime < sortedPoints[j].EventTime
			})

			// 构建延迟趋势数据（不需要计算差值，直接使用绝对值）
			for _, current := range sortedPoints {
				// 直接添加延迟数据到趋势中
				trendData := map[string]interface{}{
					"eventTime": current.EventTime,
					"ping":      float64(current.Ping), // 确保JSON序列化为数字
				}

				pingTrend = append(pingTrend, trendData)
			}

			// 补充缺失的时间点到当前时间
			if len(pingTrend) > 0 {
				// 获取最后一个数据点的时间
				lastItem := pingTrend[len(pingTrend)-1]
				lastTimeStr := lastItem["eventTime"].(string)

				// 解析最后时间
				lastTime, err := time.Parse("2006-01-02 15:04", lastTimeStr)
				if err == nil {
					now := time.Now()
					// 计算时间差（分钟）
					timeDiffMinutes := int(now.Sub(lastTime).Minutes())

					// 如果最后数据时间距离当前时间超过2分钟，就补充虚拟时间点
					if timeDiffMinutes > 2 {
						// 从最后数据时间的下一分钟开始补充
						currentTime := lastTime.Add(time.Minute)

						for currentTime.Before(now) {
							// 格式化为 "YYYY-MM-DD HH:mm" 格式
							virtualTimeStr := currentTime.Format("2006-01-02 15:04")

							// 添加虚拟数据点（延迟为0，表示无数据）
							pingTrend = append(pingTrend, map[string]interface{}{
								"eventTime": virtualTimeStr,
								"ping":      float64(0),
							})

							// 移动到下一分钟
							currentTime = currentTime.Add(time.Minute)
						}
					}
				}
			}
		}
	}

	// 返回延迟趋势数据
	c.JSON(http.StatusOK, map[string]interface{}{
		"success":   true,
		"pingTrend": pingTrend,
	})
}

// HandleGetTunnelPoolTrend 获取隧道连接池趋势数据 (GET /api/tunnels/{id}/pool-trend)
func (h *TunnelHandler) HandleGetTunnelPoolTrend(c *gin.Context) {
	idStr := c.Param("id")
	if idStr == "" {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "缺少隧道ID"})
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, map[string]interface{}{"error": "无效的隧道ID"})
		return
	}

	db := h.tunnelService.DB()

	// 查询隧道基本信息
	var endpointID int64
	var instanceID sql.NullString
	if err := db.QueryRow(`SELECT endpoint_id, instance_id FROM tunnels WHERE id = ?`, id).Scan(&endpointID, &instanceID); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]interface{}{"error": "隧道不存在"})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]interface{}{"error": err.Error()})
		return
	}

	poolTrend := make([]map[string]interface{}, 0)

	if instanceID.Valid && instanceID.String != "" {
		// 连接池趋势 - 查询24小时内的pool数据
		trendRows, err := db.Query(`SELECT event_time, pool FROM endpoint_sse WHERE endpoint_id = ? AND instance_id = ? AND push_type IN ('update','initial') AND pool IS NOT NULL AND event_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY event_time ASC`, endpointID, instanceID.String)
		if err == nil {
			defer trendRows.Close()

			// 使用 map 来存储每分钟的最新记录
			minuteMap := make(map[string]map[string]interface{})

			for trendRows.Next() {
				var eventTime time.Time
				var pool sql.NullInt64
				if err := trendRows.Scan(&eventTime, &pool); err == nil && pool.Valid {
					// 格式化时间到分钟
					minuteKey := eventTime.Format("2006-01-02 15:04")

					// 存储这一分钟的最新记录（由于是按时间升序，后面的会覆盖前面的）
					minuteMap[minuteKey] = map[string]interface{}{
						"eventTime": minuteKey,
						"pool":      pool.Int64,
					}
				}
			}

			// 将 map 转换为有序的 slice
			type PoolPoint struct {
				EventTime string `json:"eventTime"`
				Pool      int64  `json:"pool"`
			}

			var sortedPoints []PoolPoint
			for _, record := range minuteMap {
				sortedPoints = append(sortedPoints, PoolPoint{
					EventTime: record["eventTime"].(string),
					Pool:      record["pool"].(int64),
				})
			}

			// 按时间排序
			sort.Slice(sortedPoints, func(i, j int) bool {
				return sortedPoints[i].EventTime < sortedPoints[j].EventTime
			})

			// 构建连接池趋势数据（不需要计算差值，直接使用绝对值）
			for _, current := range sortedPoints {
				// 直接添加连接池数据到趋势中
				trendData := map[string]interface{}{
					"eventTime": current.EventTime,
					"pool":      float64(current.Pool), // 确保JSON序列化为数字
				}

				poolTrend = append(poolTrend, trendData)
			}

			// 补充缺失的时间点到当前时间
			if len(poolTrend) > 0 {
				// 获取最后一个数据点的时间
				lastItem := poolTrend[len(poolTrend)-1]
				lastTimeStr := lastItem["eventTime"].(string)

				// 解析最后时间
				lastTime, err := time.Parse("2006-01-02 15:04", lastTimeStr)
				if err == nil {
					now := time.Now()
					// 计算时间差（分钟）
					timeDiffMinutes := int(now.Sub(lastTime).Minutes())

					// 如果最后数据时间距离当前时间超过2分钟，就补充虚拟时间点
					if timeDiffMinutes > 2 {
						// 从最后数据时间的下一分钟开始补充
						currentTime := lastTime.Add(time.Minute)

						for currentTime.Before(now) {
							// 格式化为 "YYYY-MM-DD HH:mm" 格式
							virtualTimeStr := currentTime.Format("2006-01-02 15:04")

							// 添加虚拟数据点（连接池为0，表示无数据）
							poolTrend = append(poolTrend, map[string]interface{}{
								"eventTime": virtualTimeStr,
								"pool":      float64(0),
							})

							// 移动到下一分钟
							currentTime = currentTime.Add(time.Minute)
						}
					}
				}
			}
		}
	}

	// 返回连接池趋势数据
	c.JSON(http.StatusOK, map[string]interface{}{
		"success":   true,
		"poolTrend": poolTrend,
	})
}

// HandleUpdateTunnelV2 新版隧道更新逻辑 (PUT /api/tunnels/{id})
// 特点：
// 1. 不再删除后重建，而是构建命令行后调用 NodePass PUT /v1/instance/{id}
// 2. 调用成功后等待 SSE 更新数据库中的 commandLine 字段；超时则直接更新本地数据库。
// 3. 若远端返回 405 等错误，则回退到旧逻辑 HandleUpdateTunnel。
func (h *TunnelHandler) HandleUpdateTunnelV2(c *gin.Context) {
	tunnelIDStr := c.Param("id")
	tunnelID, err := strconv.ParseInt(tunnelIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "无效的隧道ID"})
		return
	}

	// 解析请求体（与创建接口保持一致）
	var raw struct {
		Name           string   `json:"name"`
		EndpointID     int64    `json:"endpointId"`
		Type           string   `json:"type"`
		TunnelAddress  string   `json:"tunnelAddress"`
		TunnelPort     string   `json:"tunnelPort"`
		TargetAddress  string   `json:"targetAddress"`
		TargetPort     string   `json:"targetPort"`
		TLSMode        string   `json:"tlsMode"`
		CertPath       string   `json:"certPath"`
		KeyPath        string   `json:"keyPath"`
		LogLevel       string   `json:"logLevel"`
		Password       string   `json:"password"`
		Min            *int     `json:"min,omitempty"`
		Max            *int     `json:"max,omitempty"`
		Slot           *int     `json:"slot,omitempty"`             // 新增：最大连接数限制
		Mode           *int     `json:"mode,omitempty"`             // 新增：运行模式
		Read           *string  `json:"read,omitempty"`             // 新增：数据读取超时时间
		Rate           *int     `json:"rate,omitempty"`             // 新增：带宽速率限制
		ProxyProtocol  *bool    `json:"proxyProtocol,omitempty"`    // 新增：Proxy Protocol 支持
		Tags           []string `json:"tags,omitempty"`             // 新增：实例标签 (仅用于前端显示，不影响URL生成)
		EnableSSEStore *bool    `json:"enable_sse_store,omitempty"` // 新增：是否启用SSE存储
		EnableLogStore *bool    `json:"enable_log_store,omitempty"` // 新增：是否启用日志存储
		ResetTraffic   bool     `json:"resetTraffic"`               // 新增：是否重置流量统计
	}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "无效的请求数据"})
		return
	}

	// 直接解析端口字符串
	tunnelPort, err1 := strconv.Atoi(raw.TunnelPort)
	targetPort, err2 := strconv.Atoi(raw.TargetPort)
	if err1 != nil || err2 != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "端口号格式错误，应为数字"})
		return
	}

	// 构建命令行
	var commandLine string
	if raw.Password != "" {
		commandLine = fmt.Sprintf("%s://%s@%s:%d/%s:%d", raw.Type, raw.Password, raw.TunnelAddress, tunnelPort, raw.TargetAddress, targetPort)
	} else {
		commandLine = fmt.Sprintf("%s://%s:%d/%s:%d", raw.Type, raw.TunnelAddress, tunnelPort, raw.TargetAddress, targetPort)
	}

	var queryParams []string
	if raw.LogLevel != "" && raw.LogLevel != "inherit" {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", raw.LogLevel))
	}
	if raw.Type == "server" && raw.TLSMode != "" && raw.TLSMode != "inherit" {
		var tlsNum string
		switch raw.TLSMode {
		case "0":
			tlsNum = "0"
		case "1":
			tlsNum = "1"
		case "2":
			tlsNum = "2"
		}
		if tlsNum != "" {
			queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsNum))
		}
		if raw.TLSMode == "2" && raw.CertPath != "" && raw.KeyPath != "" {
			queryParams = append(queryParams, fmt.Sprintf("crt=%s", url.QueryEscape(raw.CertPath)), fmt.Sprintf("key=%s", url.QueryEscape(raw.KeyPath)))
		}
	}
	// 处理通用参数
	if raw.Min != nil {
		queryParams = append(queryParams, fmt.Sprintf("min=%d", *raw.Min))
	}
	if raw.Max != nil {
		queryParams = append(queryParams, fmt.Sprintf("max=%d", *raw.Max))
	}
	if raw.Slot != nil {
		queryParams = append(queryParams, fmt.Sprintf("slot=%d", *raw.Slot))
	}
	if raw.Mode != nil {
		queryParams = append(queryParams, fmt.Sprintf("mode=%d", *raw.Mode))
	}
	if raw.Read != nil && *raw.Read != "" {
		queryParams = append(queryParams, fmt.Sprintf("read=%s", *raw.Read))
	}
	if raw.Rate != nil {
		queryParams = append(queryParams, fmt.Sprintf("rate=%d", *raw.Rate))
	}
	if raw.ProxyProtocol != nil {
		if *raw.ProxyProtocol {
			queryParams = append(queryParams, "proxy=1")
		} else {
			queryParams = append(queryParams, "proxy=0")
		}
	}
	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	// 获取实例ID
	instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
	if err != nil {
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: err.Error()})
		return
	}

	// 获取端点信息
	var endpoint struct {
		ID                   int64
		URL, APIPath, APIKey string
	}
	if err := h.tunnelService.DB().QueryRow(`SELECT e.id, url, api_path, api_key FROM endpoints e JOIN tunnels t ON e.id = t.endpoint_id WHERE t.id = ?`, tunnelID).Scan(&endpoint.ID, &endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
		c.JSON(http.StatusInternalServerError, tunnel.TunnelResponse{Success: false, Error: "查询端点信息失败"})
		return
	}
	log.Infof("[API] 准备调用 UpdateInstance: instanceID=%s, commandLine=%s", instanceID, commandLine)
	if _, err := nodepass.UpdateInstance(endpoint.ID, instanceID, commandLine); err != nil {
		log.Errorf("[API] UpdateInstanceV1 调用失败: %v", err)
		// 若远端返回 405，则回退旧逻辑（删除+重建）
		if strings.Contains(err.Error(), "405") || strings.Contains(err.Error(), "404") {
			log.Infof("[API] 检测到405/404错误，回退到旧逻辑")
			// 删除旧实例
			if delErr := h.tunnelService.DeleteTunnelAndWait(instanceID, 3*time.Second, true); delErr != nil {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，删除旧实例错误: " + delErr.Error()})
				return
			}

			// 重新创建，直接使用指针类型
			// 处理新增字段的默认值
			enableSSEStore := true
			if raw.EnableSSEStore != nil {
				enableSSEStore = *raw.EnableSSEStore
			}

			enableLogStore := true
			if raw.EnableLogStore != nil {
				enableLogStore = *raw.EnableLogStore
			}

			// 处理Mode字段的类型转换
			var modePtr *tunnel.TunnelMode
			if raw.Mode != nil {
				mode := tunnel.TunnelMode(*raw.Mode)
				modePtr = &mode
			}

			createReq := tunnel.CreateTunnelRequest{
				Name:           raw.Name,
				EndpointID:     raw.EndpointID,
				Type:           raw.Type,
				TunnelAddress:  raw.TunnelAddress,
				TunnelPort:     tunnelPort,
				TargetAddress:  raw.TargetAddress,
				TargetPort:     targetPort,
				TLSMode:        tunnel.TLSMode(raw.TLSMode),
				CertPath:       raw.CertPath,
				KeyPath:        raw.KeyPath,
				LogLevel:       tunnel.LogLevel(raw.LogLevel),
				Password:       raw.Password,
				ProxyProtocol:  raw.ProxyProtocol,
				Min:            raw.Min,
				Max:            raw.Max,
				Slot:           raw.Slot,       // 新增：最大连接数限制
				Mode:           modePtr,        // 新增：运行模式
				Read:           raw.Read,       // 新增：数据读取超时时间
				Rate:           raw.Rate,       // 新增：带宽速率限制
				EnableSSEStore: enableSSEStore, // 新增：是否启用SSE存储
				EnableLogStore: enableLogStore, // 新增：是否启用日志存储
			}
			newTunnel, crtErr := h.tunnelService.CreateTunnelAndWait(createReq, 3*time.Second)
			if crtErr != nil {
				c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: "编辑实例失败，创建新实例错误: " + crtErr.Error()})
				return
			}
			c.JSON(http.StatusOK, tunnel.TunnelResponse{Success: true, Message: "编辑实例成功(回退旧逻辑)", Tunnel: newTunnel})
			return
		}
		// 其他错误
		c.JSON(http.StatusBadRequest, tunnel.TunnelResponse{Success: false, Error: err.Error()})
		return
	}

	// 调用成功后等待数据库同步
	success := false
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var dbCmd, dbStatus string
		if scanErr := h.tunnelService.DB().QueryRow(`SELECT command_line, status FROM tunnels WHERE instance_id = ?`, instanceID).Scan(&dbCmd, &dbStatus); scanErr == nil {
			if dbCmd == commandLine && dbStatus == "running" {
				success = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}

	if !success {
		// 超时，直接更新本地数据库，处理min/max/slot字段
		// 构建新字段的更新值
		var modeVal interface{}
		if raw.Mode != nil {
			modeVal = *raw.Mode
		} else {
			modeVal = nil
		}

		var readVal interface{}
		if raw.Read != nil {
			readVal = *raw.Read
		} else {
			readVal = nil
		}

		var rateVal interface{}
		if raw.Rate != nil {
			rateVal = *raw.Rate
		} else {
			rateVal = nil
		}

		enableSSEStore := true
		if raw.EnableSSEStore != nil {
			enableSSEStore = *raw.EnableSSEStore
		}

		enableLogStore := true
		if raw.EnableLogStore != nil {
			enableLogStore = *raw.EnableLogStore
		}

		proxyProtocol := false
		if raw.ProxyProtocol != nil {
			proxyProtocol = *raw.ProxyProtocol
		}

		_, _ = h.tunnelService.DB().Exec(`UPDATE tunnels SET name = ?, type = ?, mode = ?, tunnel_address = ?, tunnel_port = ?, target_address = ?, target_port = ?, tls_mode = ?, cert_path = ?, key_path = ?, log_level = ?, command_line = ?, min = ?, max = ?, slot = ?, status = ?, updated_at = ?, read = ?, rate = ?, enable_sse_store = ?, enable_log_store = ?,proxy_protocol =? WHERE id = ?`,
			raw.Name, raw.Type, modeVal, raw.TunnelAddress, tunnelPort, raw.TargetAddress, targetPort, raw.TLSMode, raw.CertPath, raw.KeyPath, raw.LogLevel, commandLine,
			raw.Min, raw.Max, raw.Slot,
			"running", time.Now(), readVal, rateVal, enableSSEStore, enableLogStore, proxyProtocol)
	}

	// 如果需要重置流量统计
	if raw.ResetTraffic {
		log.Infof("[API] 编辑实例后重置流量统计: tunnelID=%d", tunnelID)
		if err := h.tunnelService.ResetTunnelTrafficByInstanceID(instanceID); err != nil {
			log.Errorf("[API] 重置流量统计失败: %v", err)
			// 不返回错误，因为主要操作已经成功，只是重置失败
		} else {
			log.Infof("[API] 流量统计重置成功: tunnelID=%d", tunnelID)
		}
	}

	c.JSON(http.StatusOK, tunnel.TunnelResponse{Success: true, Message: "编辑实例成功"})
}

// HandleExportTunnelLogs 导出隧道的所有日志文件和EndpointSSE记录
func (h *TunnelHandler) HandleExportTunnelLogs(c *gin.Context) {
	tunnelIDStr := c.Param("id")

	// 解析隧道ID
	tunnelID, err := strconv.ParseInt(tunnelIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid tunnel ID")
		return
	}

	// 获取隧道信息
	db := h.tunnelService.DB()
	var tunnelName, instanceID string
	var endpointID int64

	err = db.QueryRow(`
		SELECT name, endpoint_id, instance_id 
		FROM tunnels 
		WHERE id = ?
	`, tunnelID).Scan(&tunnelName, &endpointID, &instanceID)

	if err != nil {
		if err == sql.ErrNoRows {
			c.String(http.StatusNotFound, "Tunnel not found")
			return
		}
		log.Errorf("[API] 获取隧道信息失败: %v", err)
		c.String(http.StatusInternalServerError, "Failed to get tunnel info")
		return
	}

	// 创建zip缓冲区
	var zipBuffer bytes.Buffer
	zipWriter := zip.NewWriter(&zipBuffer)

	// 1. 获取并添加现有的.log文件
	logFileCount := 0
	if h.sseManager != nil && h.sseManager.GetFileLogger() != nil {
		// 直接读取现有的.log文件，使用FileLogger的实际目录结构
		// 根据FileLogger的实现，目录结构应该是: baseDir/endpoint_{endpointId}/{instanceId}/*.log
		baseDir := "logs" // 这里可能需要根据实际配置调整
		logDir := filepath.Join(baseDir, fmt.Sprintf("endpoint_%d", endpointID), instanceID)

		// 检查日志目录是否存在
		if _, err := os.Stat(logDir); err == nil {
			// 遍历目录中的所有.log文件
			err := filepath.Walk(logDir, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil // 忽略错误，继续处理
				}

				// 只处理.log文件
				if !info.IsDir() && strings.HasSuffix(info.Name(), ".log") {
					// 读取文件内容
					fileContent, err := os.ReadFile(path)
					if err != nil {
						log.Warnf("[API] 读取日志文件失败: %s, err: %v", path, err)
						return nil
					}

					// 使用原始文件名作为zip内的文件名
					zipFileName := info.Name()
					writer, err := zipWriter.Create(zipFileName)
					if err != nil {
						log.Warnf("[API] 创建zip文件条目失败: %s, err: %v", zipFileName, err)
						return nil
					}

					_, err = writer.Write(fileContent)
					if err != nil {
						log.Warnf("[API] 写入zip文件失败: %s, err: %v", zipFileName, err)
					} else {
						logFileCount++
						log.Debugf("[API] 成功添加日志文件: %s", zipFileName)
					}
				}
				return nil
			})

			if err != nil {
				log.Warnf("[API] 遍历日志目录失败: %v", err)
			}
		} else {
			log.Warnf("[API] 日志目录不存在: %s", logDir)
		}
	}

	// 关闭zip writer
	err = zipWriter.Close()
	if err != nil {
		log.Errorf("[API] 关闭zip writer失败: %v", err)
		c.String(http.StatusInternalServerError, "Failed to create zip file")
		return
	}

	// 设置响应头
	filename := fmt.Sprintf("%s_logs_%s.zip", tunnelName, time.Now().Format("2006-01-02"))
	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Length", fmt.Sprintf("%d", zipBuffer.Len()))

	// 发送zip文件
	_, err = c.Writer.Write(zipBuffer.Bytes())
	if err != nil {
		log.Errorf("[API] 发送zip文件失败: %v", err)
		return
	}

	log.Infof("[API] 成功导出隧道 %s (ID: %d) 的日志文件，包含 %d 个.log文件和", tunnelName, tunnelID, logFileCount)
}

// getFieldValue 从map中安全获取字段值
func getFieldValue(record map[string]interface{}, key string) interface{} {
	if val, exists := record[key]; exists {
		return val
	}
	return ""
}

// escapeCSVField 转义CSV字段中的特殊字符
func escapeCSVField(field string) string {
	// 如果字段包含逗号、引号或换行符，需要用引号包围并转义内部引号
	if strings.Contains(field, ",") || strings.Contains(field, "\"") || strings.Contains(field, "\n") || strings.Contains(field, "\r") {
		// 转义内部引号
		escaped := strings.ReplaceAll(field, "\"", "\"\"")
		return fmt.Sprintf("\"%s\"", escaped)
	}
	return field
}

// ========== Instance 相关处理函数 ==========

// HandleGetInstances 获取实例列表 (GET /api/endpoints/{endpointId}/instances)
func (h *TunnelHandler) HandleGetInstances(c *gin.Context) {
	// 从路径参数中获取端点ID
	endpointIDStr := c.Param("id")
	if endpointIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Missing endpointId parameter",
		})
		return
	}

	// 解析端点ID
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid endpointId parameter",
		})
		return
	}

	// 使用服务层获取端点信息
	var endpoint struct{ URL, APIPath, APIKey string }
	if err := h.tunnelService.DB().QueryRow(`SELECT url, api_path, api_key FROM endpoints WHERE id = ?`, endpointID).Scan(&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Endpoint not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to get endpoint info",
		})
		return
	}

	// 获取实例列表
	instances, err := nodepass.GetInstances(endpointID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// 返回包装后的实例列表
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    instances,
	})
}

// HandleGetInstance 获取单个实例信息 (GET /api/endpoints/{endpointId}/instances/{instanceId})
func (h *TunnelHandler) HandleGetInstance(c *gin.Context) {
	// 从路径参数中获取端点ID和实例ID
	endpointIDStr := c.Param("endpointId")
	instanceID := c.Param("instanceId")

	// 解析端点ID
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpointId parameter")
		return
	}

	// 使用服务层获取端点信息
	var endpoint struct{ URL, APIPath, APIKey string }
	if err := h.tunnelService.DB().QueryRow(`SELECT url, api_path, api_key FROM endpoints WHERE id = ?`, endpointID).Scan(&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
		if err == sql.ErrNoRows {
			c.String(http.StatusNotFound, "Endpoint not found")
			return
		}
		c.String(http.StatusInternalServerError, "Failed to get endpoint info")
		return
	}

	// 获取实例信息 - 使用ControlInstance获取状态
	status, err := nodepass.ControlInstance(endpointID, instanceID, "status")
	if err != nil {
		c.String(http.StatusInternalServerError, err.Error())
		return
	}

	// 构造实例信息
	instance := map[string]interface{}{
		"id":     instanceID,
		"status": status,
	}

	// 返回实例信息
	c.JSON(http.StatusOK, instance)
}

// HandleControlInstance 控制实例状态 (PATCH /api/endpoints/{endpointId}/instances/{instanceId})
func (h *TunnelHandler) HandleControlInstance(c *gin.Context) {
	// 从路径参数中获取端点ID和实例ID
	endpointIDStr := c.Param("endpointId")
	instanceID := c.Param("instanceId")

	// 解析请求体
	var req struct {
		Action string `json:"action"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.String(http.StatusBadRequest, "Invalid request body")
		return
	}

	// 验证action
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		c.String(http.StatusBadRequest, "Invalid action")
		return
	}

	// 解析端点ID
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.String(http.StatusBadRequest, "Invalid endpointId parameter")
		return
	}

	// 使用服务层获取端点信息
	var endpoint struct{ URL, APIPath, APIKey string }
	if err := h.tunnelService.DB().QueryRow(`SELECT url, api_path, api_key FROM endpoints WHERE id = ?`, endpointID).Scan(&endpoint.URL, &endpoint.APIPath, &endpoint.APIKey); err != nil {
		if err == sql.ErrNoRows {
			c.String(http.StatusNotFound, "Endpoint not found")
			return
		}
		c.String(http.StatusInternalServerError, "Failed to get endpoint info")
		return
	}

	// 控制实例状态
	_, err2 := nodepass.ControlInstance(endpointID, instanceID, req.Action)

	if err2 != nil {
		c.String(http.StatusInternalServerError, err2.Error())
		return
	}

	// 返回成功响应
	c.JSON(http.StatusOK, map[string]bool{"success": true})
}

// HandleTunnelTCPing 隧道TCPing诊断测试 (POST /api/tunnels/{instanceId}/tcping)
func (h *TunnelHandler) HandleTunnelTCPing(c *gin.Context) {
	instanceID := c.Param("id")
	if instanceID == "" {
		c.String(http.StatusBadRequest, "Missing instanceId parameter")
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

	// 根据实例ID获取对应的端点ID
	endpointID, err := h.tunnelService.GetEndpointIDByInstanceID(instanceID)
	if err != nil {
		log.Errorf("[API]根据实例ID获取端点ID失败: instanceID=%s, err=%v", instanceID, err)
		c.String(http.StatusNotFound, "Tunnel instance not found")
		return
	}

	// 调用NodePass的TCPing接口
	result, err := nodepass.TCPing(endpointID, req.Target)
	if err != nil {
		log.Errorf("[API]隧道TCPing测试失败: instanceID=%s, target=%s, err=%v", instanceID, req.Target, err)
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

// HandleUpdateInstanceTags 更新隧道实例标签 (PUT /api/tunnels/{id}/instance-tags)
func (h *TunnelHandler) HandleUpdateInstanceTags(c *gin.Context) {
	// 获取隧道ID
	idStr := c.Param("id")
	tunnelID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		log.Errorf("[API]无效的隧道ID: %s", idStr)
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的隧道ID",
		})
		return
	}

	// 解析请求体
	var req struct {
		Tags []nodepass.InstanceTag `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Errorf("[API]解析实例标签请求失败: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的请求格式",
		})
		return
	}

	// 验证标签格式
	for _, tag := range req.Tags {
		if strings.TrimSpace(tag.Key) == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "标签键不能为空",
			})
			return
		}
	}

	// 检查重复的键
	keyMap := make(map[string]bool)
	for _, tag := range req.Tags {
		if keyMap[tag.Key] {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "标签键不能重复",
			})
			return
		}
		keyMap[tag.Key] = true
	}

	// 获取隧道的实例ID和端点ID
	instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
	if err != nil {
		log.Errorf("[API]获取隧道实例ID失败: tunnelID=%d, err=%v", tunnelID, err)
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "隧道不存在",
		})
		return
	}

	if instanceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "隧道实例ID为空",
		})
		return
	}

	endpointID, err := h.tunnelService.GetEndpointIDByTunnelID(tunnelID)
	if err != nil {
		log.Errorf("[API]获取隧道端点ID失败: tunnelID=%d, err=%v", tunnelID, err)
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "隧道端点不存在",
		})
		return
	}

	// 调用NodePass API更新实例标签
	result, err := nodepass.UpdateInstanceTags(endpointID, instanceID, req.Tags)
	if err != nil {
		log.Errorf("[API]更新实例标签失败: tunnelID=%d, instanceID=%s, err=%v", tunnelID, instanceID, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新实例标签失败",
			"error":   err.Error(),
		})
		return
	}

	log.Infof("[API]实例标签更新成功: tunnelID=%d, instanceID=%s, tagsCount=%d", tunnelID, instanceID, len(req.Tags))

	// 返回成功响应
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "实例标签更新成功",
		"data":    result,
	})
}
