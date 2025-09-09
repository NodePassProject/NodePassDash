package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/tag"

	"github.com/gin-gonic/gin"
)

// setupTagRoutes 设置标签相关路由
func setupTagRoutes(rg *gin.RouterGroup, tagService *tag.Service) {
	// 创建TagHandler实例
	tagHandler := api.NewTagHandler(tagService)

	// 标签相关路由
	rg.GET("/tags", tagHandler.GetTags)
	rg.POST("/tags", tagHandler.CreateTag)
	rg.PUT("/tags/:id", tagHandler.UpdateTag)
	rg.DELETE("/tags/:id", tagHandler.DeleteTag)
	rg.GET("/tunnels/:tunnelId/tag", tagHandler.GetTunnelTag)
	rg.POST("/tunnels/:tunnelId/tag", tagHandler.AssignTagToTunnel)
}
