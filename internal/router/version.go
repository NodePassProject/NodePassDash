package router

import (
	"NodePassDash/internal/api"

	"github.com/gin-gonic/gin"
)

// setupVersionRoutes 设置版本相关路由
func setupVersionRoutes(rg *gin.RouterGroup) {
	// 创建VersionHandler实例
	versionHandler := api.NewVersionHandler()

	// 版本相关路由
	rg.GET("/version/current", versionHandler.HandleGetCurrentVersion)
	rg.GET("/version/check-update", versionHandler.HandleCheckUpdate)
	rg.GET("/version/update-info", versionHandler.HandleGetUpdateInfo)
	rg.GET("/version/history", versionHandler.HandleGetReleaseHistory)
	rg.GET("/version/deployment-info", versionHandler.HandleGetDeploymentInfo)
	rg.POST("/version/auto-update", versionHandler.HandleAutoUpdate)
}
