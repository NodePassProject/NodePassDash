package api

import (
	"NodePassDash/internal/db"
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// DataHandler 负责导入/导出数据
type DataHandler struct {
	db              *gorm.DB
	sseManager      *sse.Manager
	endpointService *endpoint.Service
	tunnelService   *tunnel.Service
}

func NewDataHandler(db *gorm.DB, mgr *sse.Manager, endpointService *endpoint.Service, tunnelService *tunnel.Service) *DataHandler {
	return &DataHandler{
		db:              db,
		sseManager:      mgr,
		endpointService: endpointService,
		tunnelService:   tunnelService,
	}
}

// extractIPFromURL 从URL中提取hostname（可以是IP地址或域名）
func extractIPFromURL(urlStr string) string {
	// 尝试解析URL
	parsedURL, err := url.Parse(urlStr)
	if err != nil {
		// 如果URL解析失败，尝试手动提取
		return extractIPFromString(urlStr)
	}

	// 从解析后的URL中提取主机名
	host := parsedURL.Hostname()
	if host == "" {
		return ""
	}

	// 检查是否为IPv6地址（包含冒号）
	if strings.Contains(host, ":") {
		// IPv6地址需要用方括号包裹
		return "[" + host + "]"
	}

	// 返回主机名（域名或IPv4地址）
	return host
}

// extractIPFromString 从字符串中手动提取host部分（备用方法）
func extractIPFromString(input string) string {
	// 去除协议部分
	if idx := strings.Index(input, "://"); idx != -1 {
		input = input[idx+3:]
	}

	// 去除用户认证信息
	if atIdx := strings.Index(input, "@"); atIdx != -1 {
		input = input[atIdx+1:]
	}

	// 去除路径部分
	if slashIdx := strings.Index(input, "/"); slashIdx != -1 {
		input = input[:slashIdx]
	}

	// 去除查询参数
	if queryIdx := strings.Index(input, "?"); queryIdx != -1 {
		input = input[:queryIdx]
	}

	// 去除端口部分
	if colonIdx := strings.Index(input, ":"); colonIdx != -1 {
		input = input[:colonIdx]
	}

	return input
}

func SetupDataRoutes(rg *gin.RouterGroup, db *gorm.DB, sseManager *sse.Manager, endpointService *endpoint.Service, tunnelService *tunnel.Service) {
	// 创建DataHandler实例
	dataHandler := NewDataHandler(db, sseManager, endpointService, tunnelService)

	// 数据导入导出
	rg.GET("/data/export", dataHandler.HandleExport)
	rg.POST("/data/import", dataHandler.HandleImport)
}

// EndpointExport 导出端点结构（简化版，仅包含基本配置信息）
type EndpointExport struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	APIPath string `json:"apiPath"`
	APIKey  string `json:"apiKey"`
	Color   string `json:"color,omitempty"`
}

// EndpointExportV1 旧版本v1的端点结构（包含tunnels数据）
type EndpointExportV1 struct {
	Name    string         `json:"name"`
	URL     string         `json:"url"`
	APIPath string         `json:"apiPath"`
	APIKey  string         `json:"apiKey"`
	Status  string         `json:"status"`
	Tunnels []TunnelExport `json:"tunnels,omitempty"`
}

// TunnelExport 隧道导出结构
type TunnelExport struct {
	Name          string `json:"name"`
	Mode          string `json:"mode"`
	Status        string `json:"status"`
	TunnelAddress string `json:"tunnelAddress"`
	TunnelPort    string `json:"tunnelPort"`
	TargetAddress string `json:"targetAddress"`
	TargetPort    string `json:"targetPort"`
	TLSMode       string `json:"tlsMode"`
	LogLevel      string `json:"logLevel"`
	CommandLine   string `json:"commandLine"`
	InstanceID    string `json:"instanceId"`
	TCPRx         string `json:"tcpRx"`
	TCPTx         string `json:"tcpTx"`
	UDPRx         string `json:"udpRx"`
	UDPTx         string `json:"udpTx"`
}

// ---------- 导出 ----------
func (h *DataHandler) HandleExport(c *gin.Context) {

	// 使用服务层获取所有端点
	endpoints, err := h.endpointService.GetEndpoints()
	if err != nil {
		log.Errorf("export query endpoints: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "export failed"})
		return
	}

	var exportEndpoints []EndpointExport
	for _, ep := range endpoints {
		exportEp := EndpointExport{
			Name:    ep.Name,
			URL:     ep.URL,
			APIPath: ep.APIPath,
			APIKey:  ep.APIKey,
		}

		exportEndpoints = append(exportEndpoints, exportEp)
	}

	payload := map[string]interface{}{
		"version":   "2.0", // 更新版本号以表示新的简化格式
		"timestamp": time.Now().Format(time.RFC3339),
		"data": map[string]interface{}{
			"endpoints": exportEndpoints,
		},
	}

	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=nodepass-endpoints.json")
	c.JSON(http.StatusOK, payload)
}

// ---------- 导入 ----------
func (h *DataHandler) HandleImport(c *gin.Context) {

	// 首先解析基本结构以获取版本信息
	var baseImportData struct {
		Version   string      `json:"version"`
		Timestamp string      `json:"timestamp"`
		Data      interface{} `json:"data"`
	}
	if err := c.ShouldBindJSON(&baseImportData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
		return
	}

	// 根据版本选择不同的处理逻辑
	if baseImportData.Version == "1.0" {
		h.handleImportV1(c, baseImportData)
	} else {
		h.handleImportV2(c, baseImportData)
	}
}

// 处理v1版本导入（包含tunnels数据）
func (h *DataHandler) handleImportV1(c *gin.Context, baseData struct {
	Version   string      `json:"version"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data"`
}) {
	// 重新解析完整的v1格式数据
	var importDataV1 struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Data      struct {
			Endpoints []EndpointExportV1 `json:"endpoints"`
		} `json:"data"`
	}

	// 重新读取请求体并解析
	dataBytes, _ := json.Marshal(baseData)
	if err := json.Unmarshal(dataBytes, &importDataV1); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid v1 format"})
		return
	}

	var skippedEndpoints, importedEndpoints, importedTunnels int

	// 存储新创建的端点信息，用于后续启动SSE和异步更新隧道计数
	var newEndpoints []struct {
		ID      int64
		URL     string
		APIPath string
		APIKey  string
	}

	// 使用GORM事务
	err := h.db.Transaction(func(tx *gorm.DB) error {

		for _, ep := range importDataV1.Data.Endpoints {
			// 检查端点是否已存在
			var existingEndpoint models.Endpoint
			err := tx.Where("url = ? AND api_path = ?", ep.URL, ep.APIPath).First(&existingEndpoint).Error

			if err == nil {
				// 端点已存在，跳过
				skippedEndpoints++
				continue
			} else if err != gorm.ErrRecordNotFound {
				// 查询出错
				log.Errorf("查询端点失败: %v", err)
				continue
			}

			// 端点不存在，创建新端点
			status := models.EndpointStatusOffline
			if ep.Status != "" {
				switch ep.Status {
				case "ONLINE":
					status = models.EndpointStatusOnline
				case "OFFLINE":
					status = models.EndpointStatusOffline
				}
			}

			// 从URL中提取IP地址
			extractedIP := extractIPFromURL(ep.URL)

			newEndpoint := models.Endpoint{
				Name:      ep.Name,
				URL:       ep.URL,
				Hostname:  extractedIP, // 填充提取的IP地址
				APIPath:   ep.APIPath,
				APIKey:    ep.APIKey,
				Status:    status,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}

			if err := tx.Create(&newEndpoint).Error; err != nil {
				log.Errorf("插入端点失败: %v", err)
				continue
			}

			// 添加到缓存
			nodepass.GetCache().Set(fmt.Sprintf("%d", newEndpoint.ID), newEndpoint.URL+newEndpoint.APIPath, newEndpoint.APIKey)

			// 保存端点信息用于后续启动SSE
			newEndpoints = append(newEndpoints, struct {
				ID      int64
				URL     string
				APIPath string
				APIKey  string
			}{
				ID:      newEndpoint.ID,
				URL:     ep.URL,
				APIPath: ep.APIPath,
				APIKey:  ep.APIKey,
			})

			importedEndpoints++

			// 导入该端点的隧道数据
			for _, tunnel := range ep.Tunnels {
				// 检查隧道是否已存在
				var existingTunnel models.Tunnel
				instanceID := tunnel.InstanceID
				if instanceID != "" {
					err := tx.Where("endpoint_id = ? AND instance_id = ?", newEndpoint.ID, instanceID).First(&existingTunnel).Error
					if err == nil {
						// 隧道已存在，跳过
						continue
					}
				}

				// 创建新隧道
				tunnelStatus := models.TunnelStatusStopped
				switch tunnel.Status {
				case "running":
					tunnelStatus = models.TunnelStatusRunning
				case "stopped":
					tunnelStatus = models.TunnelStatusStopped
				case "error":
					tunnelStatus = models.TunnelStatusError
				case "offline":
					tunnelStatus = models.TunnelStatusOffline
				}

				tunnelType := models.TunnelModeClient
				if tunnel.Mode == "server" {
					tunnelType = models.TunnelModeServer
				}

				tlsMode := models.TLSModeInherit
				switch tunnel.TLSMode {
				case "0":
					tlsMode = models.TLS0
				case "1":
					tlsMode = models.TLS1
				case "2":
					tlsMode = models.TLS2
				}

				logLevel := models.LogLevelInherit
				switch tunnel.LogLevel {
				case "debug":
					logLevel = models.LogLevelDebug
				case "info":
					logLevel = models.LogLevelInfo
				case "warn":
					logLevel = models.LogLevelWarn
				case "error":
					logLevel = models.LogLevelError
				}

				newTunnel := models.Tunnel{
					Name:          tunnel.Name,
					EndpointID:    newEndpoint.ID,
					Type:          tunnelType,
					Status:        tunnelStatus,
					TunnelAddress: tunnel.TunnelAddress,
					TunnelPort:    tunnel.TunnelPort,
					TargetAddress: tunnel.TargetAddress,
					TargetPort:    tunnel.TargetPort,
					TLSMode:       tlsMode,
					LogLevel:      logLevel,
					CommandLine:   tunnel.CommandLine,
					CreatedAt:     time.Now(),
					UpdatedAt:     time.Now(),
				}

				if instanceID != "" {
					newTunnel.InstanceID = &instanceID
				}

				if err := tx.Create(&newTunnel).Error; err != nil {
					log.Errorf("插入隧道失败: %v", err)
					continue
				}

				importedTunnels++
			}

			// 端点隧道计数将在事务完成后异步更新
		}

		// 将newEndpoints存储到外部作用域，这里需要用一个技巧
		// 由于Go的闭包特性，我们可以修改外部的变量
		// 为每个新导入的端点启动SSE监听
		if h.sseManager != nil {
			for _, ep := range newEndpoints {
				go func(endpointID int64, url, apiPath, apiKey string) {
					log.Infof("[Master-%v] v1数据导入成功，准备启动 SSE 监听", endpointID)
					if err := h.sseManager.ConnectEndpoint(endpointID, url, apiPath, apiKey); err != nil {
						log.Errorf("[Master-%v] 启动 SSE 监听失败: %v", endpointID, err)
					}
				}(ep.ID, ep.URL, ep.APIPath, ep.APIKey)
			}
		}

		return nil
	})

	if err != nil {
		log.Errorf("v1导入事务失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导入失败"})
		return
	}

	// 异步更新所有新导入端点的隧道计数
	if len(newEndpoints) > 0 {
		go func() {
			time.Sleep(100 * time.Millisecond) // 稍作延迟确保事务提交完成
			for _, ep := range newEndpoints {
				updateEndpointTunnelCountForData(ep.ID)
			}
		}()
	}

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"message":           "v1格式数据导入成功",
		"importedEndpoints": importedEndpoints,
		"importedTunnels":   importedTunnels,
		"skippedEndpoints":  skippedEndpoints,
	})
}

// 处理v2版本导入（仅endpoints，不含tunnels）
func (h *DataHandler) handleImportV2(c *gin.Context, baseData struct {
	Version   string      `json:"version"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data"`
}) {
	// 重新解析v2格式数据
	var importDataV2 struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Data      struct {
			Endpoints []EndpointExport `json:"endpoints"`
		} `json:"data"`
	}

	dataBytes, _ := json.Marshal(baseData)
	if err := json.Unmarshal(dataBytes, &importDataV2); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid v2 format"})
		return
	}

	var skippedEndpoints int
	var importedEndpoints int

	// 使用GORM事务
	err := h.db.Transaction(func(tx *gorm.DB) error {
		// 存储新创建的端点信息，用于后续启动SSE
		var newEndpoints []struct {
			ID      int64
			URL     string
			APIPath string
			APIKey  string
		}

		for _, ep := range importDataV2.Data.Endpoints {
			// 检查端点是否已存在
			var existingEndpoint models.Endpoint
			if err := tx.Where("url = ? AND api_path = ?", ep.URL, ep.APIPath).First(&existingEndpoint).Error; err == nil {
				skippedEndpoints++
				continue
			}

			// 从URL中提取IP地址
			extractedIP := extractIPFromURL(ep.URL)

			// 插入端点，设置默认状态为 OFFLINE
			newEndpoint := models.Endpoint{
				Name:      ep.Name,
				URL:       ep.URL,
				Hostname:  extractedIP, // 填充提取的IP地址
				APIPath:   ep.APIPath,
				APIKey:    ep.APIKey,
				Status:    models.EndpointStatusOffline,
				LastCheck: time.Now(), // 添加 LastCheck 默认值
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}

			if err := tx.Create(&newEndpoint).Error; err != nil {
				log.Errorf("插入端点失败: %v", err)
				continue
			}

			// 添加到缓存
			nodepass.GetCache().Set(fmt.Sprintf("%d", newEndpoint.ID), newEndpoint.URL+newEndpoint.APIPath, newEndpoint.APIKey)

			// 保存端点信息用于后续启动SSE
			newEndpoints = append(newEndpoints, struct {
				ID      int64
				URL     string
				APIPath string
				APIKey  string
			}{
				ID:      newEndpoint.ID,
				URL:     ep.URL,
				APIPath: ep.APIPath,
				APIKey:  ep.APIKey,
			})

			importedEndpoints++
		}

		// 为每个新导入的端点启动SSE监听
		if h.sseManager != nil {
			for _, ep := range newEndpoints {
				go func(endpointID int64, url, apiPath, apiKey string) {
					log.Infof("[Master-%v] v2数据导入成功，准备启动 SSE 监听", endpointID)
					if err := h.sseManager.ConnectEndpoint(endpointID, url, apiPath, apiKey); err != nil {
						log.Errorf("[Master-%v] 启动 SSE 监听失败: %v", endpointID, err)
					}
				}(ep.ID, ep.URL, ep.APIPath, ep.APIKey)
			}
		}

		return nil
	})

	if err != nil {
		log.Errorf("v2导入事务失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "导入失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"message":           "端点配置导入成功",
		"importedEndpoints": importedEndpoints,
		"skippedEndpoints":  skippedEndpoints,
	})
}

// updateEndpointTunnelCountForData 更新端点的隧道计数，用于数据导入后的异步更新
func updateEndpointTunnelCountForData(endpointID int64) {
	err := db.ExecuteWithRetry(func(db *gorm.DB) error {
		return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
			Update("tunnel_count", gorm.Expr("(SELECT COUNT(*) FROM tunnels WHERE endpoint_id = ?)", endpointID)).Error
	})

	if err != nil {
		log.Errorf("[数据导入]更新端点 %d 隧道计数失败: %v", endpointID, err)
	} else {
		log.Debugf("[数据导入]端点 %d 隧道计数已更新", endpointID)
	}
}
