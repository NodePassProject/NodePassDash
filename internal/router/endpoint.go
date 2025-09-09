package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/sse"

	"github.com/gin-gonic/gin"
)

// setupEndpointRoutes 设置端点相关路由
func setupEndpointRoutes(rg *gin.RouterGroup, endpointService *endpoint.Service, sseManager *sse.Manager) {
	// 创建EndpointHandler实例
	endpointHandler := api.NewEndpointHandler(endpointService, sseManager)

	// 端点相关路由
	rg.GET("/endpoints", httpToGin(endpointHandler.HandleGetEndpoints))
	rg.POST("/endpoints", httpToGin(endpointHandler.HandleCreateEndpoint))
	rg.PUT("/endpoints/:id", httpToGin(endpointHandler.HandleUpdateEndpoint))
	rg.DELETE("/endpoints/:id", httpToGin(endpointHandler.HandleDeleteEndpoint))
	rg.PATCH("/endpoints/:id", httpToGin(endpointHandler.HandlePatchEndpoint))
	rg.PATCH("/endpoints", httpToGin(endpointHandler.HandlePatchEndpoint))
	rg.GET("/endpoints/simple", httpToGin(endpointHandler.HandleGetSimpleEndpoints))
	rg.POST("/endpoints/test", httpToGin(endpointHandler.HandleTestEndpoint))
	rg.GET("/endpoints/status", httpToGin(endpointHandler.HandleEndpointStatus))
	rg.GET("/endpoints/:id/detail", httpToGin(endpointHandler.HandleGetEndpointDetail))
	rg.GET("/endpoints/:id/info", httpToGin(endpointHandler.HandleGetEndpointInfo))
	rg.GET("/endpoints/:id/file-logs", httpToGin(endpointHandler.HandleEndpointFileLogs))
	rg.DELETE("/endpoints/:id/file-logs/clear", httpToGin(endpointHandler.HandleClearEndpointFileLogs))
	rg.GET("/endpoints/:id/file-logs/dates", httpToGin(endpointHandler.HandleGetAvailableLogDates))
	rg.GET("/endpoints/:id/stats", httpToGin(endpointHandler.HandleEndpointStats))
	rg.POST("/endpoints/:id/tcping", httpToGin(endpointHandler.HandleTCPing))

	// 全局回收站
	rg.GET("/recycle", httpToGin(endpointHandler.HandleRecycleListAll))
	rg.DELETE("/recycle", httpToGin(endpointHandler.HandleRecycleClearAll))
}
