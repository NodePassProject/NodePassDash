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
	rg.GET("/services/:sid/:type", servicesHandler.GetServiceByID)
	rg.GET("/services/available-instances", servicesHandler.GetAvailableInstances)
	rg.POST("/services/assemble", servicesHandler.AssembleService)
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
	serviceType := c.Param("type")

	service, err := h.servicesService.GetServiceByID(sid, serviceType)
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
