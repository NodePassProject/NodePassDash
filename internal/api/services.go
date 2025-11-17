package api

import (
	"NodePassDash/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ServicesHandler 服务处理器
type ServicesHandler struct {
	servicesService *services.ServiceImpl
}

// NewServicesHandler 创建服务处理器
func NewServicesHandler(servicesService *services.ServiceImpl) *ServicesHandler {
	return &ServicesHandler{servicesService: servicesService}
}

// SetupServicesRoutes 设置服务相关路由
func SetupServicesRoutes(rg *gin.RouterGroup, servicesService *services.ServiceImpl) {
	// 创建ServicesHandler实例
	servicesHandler := NewServicesHandler(servicesService)

	// 服务相关路由
	rg.GET("/services", servicesHandler.GetServices)
	rg.GET("/services/:sid", servicesHandler.GetServiceByID)
	rg.GET("/services/available-instances", servicesHandler.GetAvailableInstances)
	rg.POST("/services/assemble", servicesHandler.AssembleService)

	// 服务操作路由
	rg.POST("/services/:sid/start", servicesHandler.StartService)
	rg.POST("/services/:sid/stop", servicesHandler.StopService)
	rg.POST("/services/:sid/restart", servicesHandler.RestartService)
	rg.DELETE("/services/:sid", servicesHandler.DeleteService)
	rg.PUT("/services/:sid/rename", servicesHandler.RenameService)
	rg.POST("/services/:sid/dissolve", servicesHandler.DissolveService)
	rg.POST("/services/:sid/sync", servicesHandler.SyncService)
}

// GetServices 获取所有服务
func (h *ServicesHandler) GetServices(c *gin.Context) {
	serviceList, err := h.servicesService.GetServices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := services.ServiceResponse{
		Success:  true,
		Services: serviceList,
	}

	c.JSON(http.StatusOK, response)
}

// GetServiceByID 根据 SID 和 Type 获取单个服务
func (h *ServicesHandler) GetServiceByID(c *gin.Context) {
	sid := c.Param("sid")

	service, err := h.servicesService.GetServiceByID(sid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "服务不存在"})
		return
	}

	response := services.ServiceResponse{
		Success: true,
		Service: service,
	}

	c.JSON(http.StatusOK, response)
}

// GetAvailableInstances 获取可用实例
func (h *ServicesHandler) GetAvailableInstances(c *gin.Context) {
	instances, err := h.servicesService.GetAvailableInstances()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := services.AvailableInstancesResponse{
		Success:   true,
		Instances: instances,
	}

	c.JSON(http.StatusOK, response)
}

// AssembleService 组装服务
func (h *ServicesHandler) AssembleService(c *gin.Context) {
	var req services.AssembleServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	if err := h.servicesService.AssembleService(&req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "组装服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "组装服务成功",
	})
}

// StartService 启动服务
func (h *ServicesHandler) StartService(c *gin.Context) {
	sid := c.Param("sid")

	if err := h.servicesService.StartService(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "启动服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "启动服务成功",
	})
}

// StopService 停止服务
func (h *ServicesHandler) StopService(c *gin.Context) {
	sid := c.Param("sid")

	if err := h.servicesService.StopService(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "停止服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "停止服务成功",
	})
}

// RestartService 重启服务
func (h *ServicesHandler) RestartService(c *gin.Context) {
	sid := c.Param("sid")

	if err := h.servicesService.RestartService(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重启服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "重启服务成功",
	})
}

// DeleteService 删除服务
func (h *ServicesHandler) DeleteService(c *gin.Context) {
	sid := c.Param("sid")

	if err := h.servicesService.DeleteService(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除服务成功",
	})
}

// RenameService 重命名服务
func (h *ServicesHandler) RenameService(c *gin.Context) {
	sid := c.Param("sid")
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	if err := h.servicesService.RenameService(sid, req.Name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重命名服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "重命名服务成功",
	})
}

// DissolveService 解散服务
func (h *ServicesHandler) DissolveService(c *gin.Context) {
	sid := c.Param("sid")

	if err := h.servicesService.DissolveService(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解散服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "解散服务成功",
	})
}

// SyncService 同步服务
func (h *ServicesHandler) SyncService(c *gin.Context) {
	sid := c.Param("sid")

	if err := h.servicesService.SyncService(sid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "同步服务失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "同步服务成功",
	})
}
