package api

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"database/sql"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// EndpointConfig 端点配置
type EndpointConfig struct {
	TargetHost string `json:"target_host"`
	TargetPort int    `json:"target_port"`
	MasterID   int64  `json:"master_id"`
	Type       string `json:"type"`
}

// ServiceCreateRequest 服务创建请求结构体
type ServiceCreateRequest struct {
	Log                 string          `json:"log"`
	ListenHost          string          `json:"listen_host,omitempty"`
	ListenPort          int             `json:"listen_port"`
	Mode                string          `json:"mode"`
	TLS                 int             `json:"tls,omitempty"`
	CertPath            string          `json:"cert_path,omitempty"`
	KeyPath             string          `json:"key_path,omitempty"`
	TunnelName          string          `json:"tunnel_name,omitempty"`
	ServiceType         int             `json:"service_type"`          // 服务类型 0-7
	ListenType          string          `json:"listen_type,omitempty"` // 监听类型 TCP/UDP/ALL
	ExtendTargetAddress []string        `json:"extend_target_address"` // 扩展目标地址（负载均衡）
	Inbounds            *EndpointConfig `json:"inbounds,omitempty"`
	Outbounds           *EndpointConfig `json:"outbounds,omitempty"`
}

// CreateService 处理服务创建请求（对接 service-create-modal.tsx）
func (h *ServicesHandler) CreateService(c *gin.Context) {
	var req ServiceCreateRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{
			"success": false,
			"error":   "无效的请求数据",
		})
		return
	}

	log.Infof("[API] 服务创建请求: mode=%s, listen_host=%s, listen_port=%d", req.Mode, req.ListenHost, req.ListenPort)

	switch req.Mode {
	case "single":
		h.handleSingleMode(c, &req)
	case "bothway":
		h.handleBothwayMode(c, &req)
	case "intranet":
		h.handleIntranetMode(c, &req)
	default:
		c.JSON(400, gin.H{
			"success": false,
			"error":   "不支持的服务模式: " + req.Mode,
		})
	}
}

// handleSingleMode 处理单端转发模式
func (h *ServicesHandler) handleSingleMode(c *gin.Context, req *ServiceCreateRequest) {
	if req.Inbounds == nil {
		c.JSON(400, gin.H{
			"success": false,
			"error":   "单端模式缺少inbounds配置",
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
			c.JSON(400, gin.H{
				"success": false,
				"error":   "指定的中转主控不存在",
			})
			return
		}
		c.JSON(500, gin.H{
			"success": false,
			"error":   "查询中转主控失败",
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

	tunnelURL := fmt.Sprintf("client://%s/%s:%d",
		listenAddr,
		req.Inbounds.TargetHost,
		req.Inbounds.TargetPort,
	)

	// 添加扩展地址（逗号分隔）
	if req.ExtendTargetAddress != nil && len(req.ExtendTargetAddress) > 0 {
		for _, addr := range req.ExtendTargetAddress {
			tunnelURL += "," + addr
		}
	}
	tunnelURL += fmt.Sprintf("?log=%s&mode=1", req.Log)
	// 根据listenType生成notcp和noudp参数
	if req.ListenType != "" {
		switch req.ListenType {
		case "TCP":
			tunnelURL += "&notcp=0"
			tunnelURL += "&noudp=1"
		case "UDP":
			tunnelURL += "&notcp=1"
			tunnelURL += "&noudp=0"
		case "ALL":
			tunnelURL += "&notcp=0"
			tunnelURL += "&noudp=0"
		}
	}
	// 生成隧道名称 - 优先使用用户提供的名称，否则自动生成
	var tunnelName string
	if req.TunnelName != "" {
		tunnelName = req.TunnelName
	} else {
		tunnelName = fmt.Sprintf("%s-single-%d", endpointName, time.Now().Unix())
	}

	// 使用直接URL模式创建隧道，超时时间为 3 秒
	if err := h.tunnelService.QuickCreateTunnelDirectURL(req.Inbounds.MasterID, tunnelURL, tunnelName, 3*time.Second); err != nil {
		c.JSON(400, gin.H{
			"success": false,
			"error":   "创建单端隧道失败: " + err.Error(),
		})
		return
	}

	// 获取创建的隧道ID和instanceID
	tunnelID, _ := h.getTunnelIDByName(tunnelName)

	// 生成服务ID并更新peer信息
	if tunnelID > 0 {
		// 获取隧道的instanceID
		instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(tunnelID)
		if err == nil {
			// 生成UUID作为sid
			sid := uuid.New().String()

			// 计算服务类型（single模式下只需要判断扩展目标地址）
			serviceType := strconv.Itoa(req.ServiceType)

			// 构建peer对象
			peer := &models.Peer{
				SID:  &sid,
				Type: &serviceType,
			}

			// 如果TunnelName有值，设置alias
			if req.TunnelName != "" {
				peer.Alias = &req.TunnelName
			}

			// 调用UpdateInstancePeers更新peer信息
			_, err := nodepass.UpdateInstancePeers(req.Inbounds.MasterID, instanceID, peer)
			if err != nil {
				log.Warnf("[API] 更新隧道peer信息失败，但不影响创建: %v", err)
			} else {
				log.Infof("[API] 成功更新隧道peer信息: sid=%s, type=%s, alias=%s", sid, serviceType, req.TunnelName)
			}
		}
	}

	c.JSON(200, gin.H{
		"success":    true,
		"message":    "单端转发服务创建成功",
		"tunnel_ids": []int64{tunnelID},
	})
}

// handleBothwayMode 处理双端转发模式
func (h *ServicesHandler) handleBothwayMode(c *gin.Context, req *ServiceCreateRequest) {
	if req.Inbounds == nil || req.Outbounds == nil {
		c.JSON(400, gin.H{
			"success": false,
			"error":   "双端模式缺少inbounds或outbounds配置",
		})
		return
	}

	// 根据type字段确定哪个是server，哪个是client
	var serverConfig, clientConfig *EndpointConfig

	if req.Inbounds.Type == "server" {
		serverConfig = req.Inbounds
		clientConfig = req.Outbounds
	} else {
		serverConfig = req.Outbounds
		clientConfig = req.Inbounds
	}

	// 获取endpoint信息
	var serverEndpoint, clientEndpoint struct {
		ID       int64
		URL      string
		Hostname string
		APIPath  string
		APIKey   string
		Name     string
	}

	db := h.tunnelService.DB()
	// 获取server endpoint信息
	err := db.QueryRow(
		"SELECT id, url, hostname, api_path, api_key, name FROM endpoints WHERE id = ?",
		serverConfig.MasterID,
	).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.Hostname, &serverEndpoint.APIPath, &serverEndpoint.APIKey, &serverEndpoint.Name)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(400, gin.H{
				"success": false,
				"error":   "指定的服务端主控不存在",
			})
			return
		}
		c.JSON(500, gin.H{
			"success": false,
			"error":   "查询服务端主控失败",
		})
		return
	}

	// 获取client endpoint信息
	err = db.QueryRow(
		"SELECT id, url, hostname, api_path, api_key, name FROM endpoints WHERE id = ?",
		clientConfig.MasterID,
	).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.Hostname, &clientEndpoint.APIPath, &clientEndpoint.APIKey, &clientEndpoint.Name)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(400, gin.H{
				"success": false,
				"error":   "指定的客户端主控不存在",
			})
			return
		}
		c.JSON(500, gin.H{
			"success": false,
			"error":   "查询客户端主控失败",
		})
		return
	}

	// 使用数据库中存储的server端IP
	serverIP := serverEndpoint.Hostname
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
	// 添加扩展地址（逗号分隔）
	if req.ExtendTargetAddress != nil && len(req.ExtendTargetAddress) > 0 {
		for _, addr := range req.ExtendTargetAddress {
			serverURL += "," + addr
		}
	}
	if req.TLS > 0 {
		serverURL += fmt.Sprintf("?tls=%d&log=%s&mode=2", req.TLS, req.Log)
		// 如果是TLS 2且提供了证书路径，添加证书参数
		if req.TLS == 2 && req.CertPath != "" && req.KeyPath != "" {
			serverURL += fmt.Sprintf("&cert=%s&key=%s", url.QueryEscape(req.CertPath), url.QueryEscape(req.KeyPath))
		}
	} else {
		serverURL += fmt.Sprintf("?log=%s&&mode=2", req.Log)
	}
	// 双端转发：client端连接到server的IP:listen_port，转发到inbounds的target
	clientURL := fmt.Sprintf("client://%s:%d/%s:%d?log=%s&mode=2",
		serverIP,
		req.ListenPort,
		clientConfig.TargetHost,
		clientConfig.TargetPort,
		req.Log,
	)
	// 根据listenType生成notcp和noudp参数
	if req.ListenType != "" {
		switch req.ListenType {
		case "TCP":
			serverURL += "&notcp=0"
			serverURL += "&noudp=1"
			clientURL += "&notcp=0"
			clientURL += "&noudp=1"
		case "UDP":
			serverURL += "&notcp=1"
			serverURL += "&noudp=0"
			clientURL += "&notcp=1"
			clientURL += "&noudp=0"
		case "ALL":
			serverURL += "&notcp=0"
			serverURL += "&noudp=0"
			clientURL += "&notcp=0"
			clientURL += "&noudp=0"
		}
	}
	// 生成隧道名称 - 优先使用用户提供的名称，否则自动生成
	var serverTunnelName, clientTunnelName string
	if req.TunnelName != "" {
		serverTunnelName = req.TunnelName + "-s"
		clientTunnelName = req.TunnelName + "-c"
	} else {
		timestamp := time.Now().Unix()
		serverTunnelName = fmt.Sprintf("%s->%s-s-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
		clientTunnelName = fmt.Sprintf("%s->%s-c-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
	}

	log.Infof("[API] 开始创建双端隧道 - 先创建server端，再创建client端")

	// 第一步：创建server端隧道（使用直接URL模式）
	log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
	if err := h.tunnelService.QuickCreateTunnelDirectURL(serverConfig.MasterID, serverURL, serverTunnelName, 3*time.Second); err != nil {
		log.Errorf("[API] 创建server端隧道失败: %v", err)
		c.JSON(400, gin.H{
			"success": false,
			"error":   "创建server端隧道失败: " + err.Error(),
		})
		return
	}
	log.Infof("[API] 步骤1完成: server端隧道创建成功")

	// 第二步：创建client端隧道（使用直接URL模式）
	log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
	if err := h.tunnelService.QuickCreateTunnelDirectURL(clientConfig.MasterID, clientURL, clientTunnelName, 3*time.Second); err != nil {
		log.Errorf("[API] 创建client端隧道失败: %v", err)
		c.JSON(400, gin.H{
			"success": false,
			"error":   "创建client端隧道失败: " + err.Error(),
		})
		return
	}
	log.Infof("[API] 步骤2完成: client端隧道创建成功")
	log.Infof("[API] 双端隧道创建完成")

	// 生成服务ID（双端模式共用一个sid）
	sid := uuid.New().String()

	// 计算服务类型（bothway模式根据server端的targetAddr判断）
	serviceType := strconv.Itoa(req.ServiceType)

	// 获取创建的隧道ID并更新peer信息
	var tunnelIDs []int64
	if serverTunnelID, err := h.getTunnelIDByName(serverTunnelName); err == nil {
		tunnelIDs = append(tunnelIDs, serverTunnelID)

		// 更新server端隧道的peer信息
		if instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(serverTunnelID); err == nil {
			peer := &models.Peer{
				SID:  &sid,
				Type: &serviceType,
			}
			if req.TunnelName != "" {
				peer.Alias = &req.TunnelName
			}

			_, err := nodepass.UpdateInstancePeers(serverConfig.MasterID, instanceID, peer)
			if err != nil {
				log.Warnf("[API] 更新server端隧道peer信息失败: %v", err)
			} else {
				log.Infof("[API] 成功更新server端隧道peer信息: sid=%s, type=%s", sid, serviceType)
			}
		}
	}
	if clientTunnelID, err := h.getTunnelIDByName(clientTunnelName); err == nil {
		tunnelIDs = append(tunnelIDs, clientTunnelID)

		// 更新client端隧道的peer信息
		if instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(clientTunnelID); err == nil {
			peer := &models.Peer{
				SID:  &sid,
				Type: &serviceType,
			}
			if req.TunnelName != "" {
				peer.Alias = &req.TunnelName
			}

			_, err := nodepass.UpdateInstancePeers(clientConfig.MasterID, instanceID, peer)
			if err != nil {
				log.Warnf("[API] 更新client端隧道peer信息失败: %v", err)
			} else {
				log.Infof("[API] 成功更新client端隧道peer信息: sid=%s, type=%s", sid, serviceType)
			}
		}
	}

	c.JSON(200, gin.H{
		"success":    true,
		"message":    "双端转发服务创建成功",
		"tunnel_ids": tunnelIDs,
	})
}

// handleIntranetMode 处理内网穿透模式
func (h *ServicesHandler) handleIntranetMode(c *gin.Context, req *ServiceCreateRequest) {
	if req.Inbounds == nil || req.Outbounds == nil {
		c.JSON(400, gin.H{
			"success": false,
			"error":   "内网穿透模式缺少inbounds或outbounds配置",
		})
		return
	}

	// 根据type字段确定哪个是server，哪个是client
	var serverConfig, clientConfig *EndpointConfig

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
		"SELECT id, url, hostname, api_path, api_key, name FROM endpoints WHERE id = ?",
		serverConfig.MasterID,
	).Scan(&serverEndpoint.ID, &serverEndpoint.URL, &serverEndpoint.IP, &serverEndpoint.APIPath, &serverEndpoint.APIKey, &serverEndpoint.Name)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(400, gin.H{
				"success": false,
				"error":   "指定的服务端主控不存在",
			})
			return
		}
		c.JSON(500, gin.H{
			"success": false,
			"error":   "查询服务端主控失败",
		})
		return
	}

	// 获取client endpoint信息
	err = db.QueryRow(
		"SELECT id, url, hostname, api_path, api_key, name FROM endpoints WHERE id = ?",
		clientConfig.MasterID,
	).Scan(&clientEndpoint.ID, &clientEndpoint.URL, &clientEndpoint.IP, &clientEndpoint.APIPath, &clientEndpoint.APIKey, &clientEndpoint.Name)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(400, gin.H{
				"success": false,
				"error":   "指定的客户端主控不存在",
			})
			return
		}
		c.JSON(500, gin.H{
			"success": false,
			"error":   "查询客户端主控失败",
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
		serverURL += fmt.Sprintf("?tls=%d&log=%s&mode=1", req.TLS, req.Log)
		// 如果是TLS 2且提供了证书路径，添加证书参数
		if req.TLS == 2 && req.CertPath != "" && req.KeyPath != "" {
			serverURL += fmt.Sprintf("&cert=%s&key=%s", url.QueryEscape(req.CertPath), url.QueryEscape(req.KeyPath))
		}
	} else {
		serverURL += fmt.Sprintf("?log=%s&mode=1", req.Log)
	}

	// 内网穿透：client端连接到server的IP:listen_port，转发到最终目标
	clientURL := fmt.Sprintf("client://%s:%d/%s:%d",
		serverIP,
		req.ListenPort,
		clientConfig.TargetHost,
		clientConfig.TargetPort,
	)
	// 添加扩展地址（逗号分隔）
	if req.ExtendTargetAddress != nil && len(req.ExtendTargetAddress) > 0 {
		for _, addr := range req.ExtendTargetAddress {
			clientURL += "," + addr
		}
	}
	clientURL += fmt.Sprintf("?log=%s&mode=2", req.Log)

	// 根据listenType生成notcp和noudp参数
	if req.ListenType != "" {
		switch req.ListenType {
		case "TCP":
			serverURL += "&notcp=0"
			serverURL += "&noudp=1"
			clientURL += "&notcp=0"
			clientURL += "&noudp=1"
		case "UDP":
			serverURL += "&notcp=1"
			serverURL += "&noudp=0"
			clientURL += "&notcp=1"
			clientURL += "&noudp=0"
		case "ALL":
			serverURL += "&notcp=0"
			serverURL += "&noudp=0"
			clientURL += "&notcp=0"
			clientURL += "&noudp=0"
		}
	}

	// 生成隧道名称 - 优先使用用户提供的名称，否则自动生成
	var serverTunnelName, clientTunnelName string
	if req.TunnelName != "" {
		serverTunnelName = req.TunnelName + "-s"
		clientTunnelName = req.TunnelName + "-c"
	} else {
		timestamp := time.Now().Unix()
		serverTunnelName = fmt.Sprintf("%s->%s-s-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
		clientTunnelName = fmt.Sprintf("%s->%s-c-%d", clientEndpoint.Name, serverEndpoint.Name, timestamp)
	}

	log.Infof("[API] 开始创建内网穿透隧道 - 先创建server端，再创建client端")

	// 第一步：创建server端隧道（使用直接URL模式）
	log.Infof("[API] 步骤1: 在endpoint %d 创建server隧道 %s", serverConfig.MasterID, serverTunnelName)
	if err := h.tunnelService.QuickCreateTunnelDirectURL(serverConfig.MasterID, serverURL, serverTunnelName, 3*time.Second); err != nil {
		log.Errorf("[API] 创建server端隧道失败: %v", err)
		c.JSON(400, gin.H{
			"success": false,
			"error":   "创建server端隧道失败: " + err.Error(),
		})
		return
	}
	log.Infof("[API] 步骤1完成: server端隧道创建成功")

	// 第二步：创建client端隧道（使用直接URL模式）
	log.Infof("[API] 步骤2: 在endpoint %d 创建client隧道 %s", clientConfig.MasterID, clientTunnelName)
	if err := h.tunnelService.QuickCreateTunnelDirectURL(clientConfig.MasterID, clientURL, clientTunnelName, 3*time.Second); err != nil {
		log.Errorf("[API] 创建client端隧道失败: %v", err)
		c.JSON(400, gin.H{
			"success": false,
			"error":   "创建client端隧道失败: " + err.Error(),
		})
		return
	}
	log.Infof("[API] 步骤2完成: client端隧道创建成功")
	log.Infof("[API] 内网穿透隧道创建完成")

	// 生成服务ID（内网穿透模式共用一个sid）
	sid := uuid.New().String()

	// 计算服务类型（intranet模式根据client端的targetAddr判断）
	serviceType := strconv.Itoa(req.ServiceType)
	// 获取创建的隧道ID并更新peer信息
	var tunnelIDs []int64
	if serverTunnelID, err := h.getTunnelIDByName(serverTunnelName); err == nil {
		tunnelIDs = append(tunnelIDs, serverTunnelID)

		// 更新server端隧道的peer信息
		if instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(serverTunnelID); err == nil {
			peer := &models.Peer{
				SID:  &sid,
				Type: &serviceType,
			}
			if req.TunnelName != "" {
				peer.Alias = &req.TunnelName
			}

			_, err := nodepass.UpdateInstancePeers(serverConfig.MasterID, instanceID, peer)
			if err != nil {
				log.Warnf("[API] 更新server端隧道peer信息失败: %v", err)
			} else {
				log.Infof("[API] 成功更新server端隧道peer信息: sid=%s, type=%s", sid, serviceType)
			}
		}
	}
	if clientTunnelID, err := h.getTunnelIDByName(clientTunnelName); err == nil {
		tunnelIDs = append(tunnelIDs, clientTunnelID)

		// 更新client端隧道的peer信息
		if instanceID, err := h.tunnelService.GetInstanceIDByTunnelID(clientTunnelID); err == nil {
			peer := &models.Peer{
				SID:  &sid,
				Type: &serviceType,
			}
			if req.TunnelName != "" {
				peer.Alias = &req.TunnelName
			}

			_, err := nodepass.UpdateInstancePeers(clientConfig.MasterID, instanceID, peer)
			if err != nil {
				log.Warnf("[API] 更新client端隧道peer信息失败: %v", err)
			} else {
				log.Infof("[API] 成功更新client端隧道peer信息: sid=%s, type=%s", sid, serviceType)
			}
		}
	}

	c.JSON(200, gin.H{
		"success":    true,
		"message":    "内网穿透服务创建成功",
		"tunnel_ids": tunnelIDs,
	})
}

// ============ 辅助函数 ============

// getTunnelIDByName 通过隧道名称获取隧道数据库ID
func (h *ServicesHandler) getTunnelIDByName(tunnelName string) (int64, error) {
	var tunnelID int64
	err := h.tunnelService.DB().QueryRow(`SELECT id FROM tunnels WHERE name = ?`, tunnelName).Scan(&tunnelID)
	return tunnelID, err
}
