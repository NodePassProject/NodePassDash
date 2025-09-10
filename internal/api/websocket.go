package api

import (
	"net/http"

	log "NodePassDash/internal/log"
	"NodePassDash/internal/websocket"

	"github.com/gin-gonic/gin"
	gorillaWebsocket "github.com/gorilla/websocket"
)

var upgrader = gorillaWebsocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// 允许所有来源，在生产环境中应该更严格
		return true
	},
}

// SetupWebSocketRoutes 设置WebSocket路由
func SetupWebSocketRoutes(apiGroup *gin.RouterGroup, wsService *websocket.Service) {
	wsGroup := apiGroup.Group("/ws")
	{
		wsGroup.GET("/system-monitor", handleSystemMonitor(wsService))
		wsGroup.GET("/tunnel-monitor", handleTunnelMonitor(wsService))
	}
}

// handleSystemMonitor 处理系统监控WebSocket连接
func handleSystemMonitor(wsService *websocket.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取endpointId参数
		endpointID := c.Query("endpointId")
		if endpointID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing endpointId parameter"})
			return
		}

		// 升级HTTP连接为WebSocket连接
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Errorf("WebSocket升级失败: %v", err)
			return
		}

		// 处理WebSocket连接
		if err := wsService.HandleWebSocketConnection(conn, endpointID); err != nil {
			log.Errorf("处理WebSocket连接失败: %v", err)
			conn.Close()
			return
		}

		log.Infof("WebSocket连接已建立 - EndpointID: %s", endpointID)
	}
}

// handleTunnelMonitor 处理tunnel监控WebSocket连接
func handleTunnelMonitor(wsService *websocket.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取instanceId参数
		instanceID := c.Query("instanceId")
		if instanceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing instanceId parameter"})
			return
		}

		// 升级HTTP连接为WebSocket连接
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Errorf("WebSocket升级失败: %v", err)
			return
		}

		// 处理tunnel WebSocket连接
		if err := wsService.HandleTunnelWebSocketConnection(conn, instanceID); err != nil {
			log.Errorf("处理tunnel WebSocket连接失败: %v", err)
			conn.Close()
			return
		}

		log.Infof("WebSocket tunnel连接已建立 - InstanceID: %s", instanceID)
	}
}
