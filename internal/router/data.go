package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// setupDataRoutes 设置数据导入导出相关路由
func setupDataRoutes(rg *gin.RouterGroup, db *gorm.DB, sseManager *sse.Manager, endpointService *endpoint.Service, tunnelService *tunnel.Service) {
	// 创建DataHandler实例
	dataHandler := api.NewDataHandler(db, sseManager, endpointService, tunnelService)

	// 数据导入导出
	rg.GET("/data/export", dataHandler.HandleExport)
	rg.POST("/data/import", dataHandler.HandleImport)
}
