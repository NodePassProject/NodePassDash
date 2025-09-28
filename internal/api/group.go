package api

import (
	"NodePassDash/internal/group"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// GroupHandler 分组处理器
type GroupHandler struct {
	groupService *group.Service
}

// NewGroupHandler 创建分组处理器
func NewGroupHandler(groupService *group.Service) *GroupHandler {
	return &GroupHandler{groupService: groupService}
}

// SetupGroupRoutes 设置分组相关路由
func SetupGroupRoutes(rg *gin.RouterGroup, groupService *group.Service) {
	// 创建GroupHandler实例
	groupHandler := NewGroupHandler(groupService)

	// 分组相关路由
	rg.GET("/groups", groupHandler.GetGroups)
	rg.POST("/groups", groupHandler.CreateGroup)
	rg.PUT("/groups/:id", groupHandler.UpdateGroup)
	rg.DELETE("/groups/:id", groupHandler.DeleteGroup)
	rg.GET("/tunnels/:id/groups", groupHandler.GetTunnelGroup)
	rg.POST("/tunnels/:id/groups", groupHandler.AssignGroupToTunnel)
	rg.PUT("/groups/:id/tunnels", groupHandler.BatchAssignTunnelsToGroup)
}

// GetGroups 获取所有分组
func (h *GroupHandler) GetGroups(c *gin.Context) {
	groups, err := h.groupService.GetGroups()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := group.GroupResponse{
		Success: true,
		Groups:  groups,
	}

	c.JSON(http.StatusOK, response)
}

// CreateGroup 创建分组
func (h *GroupHandler) CreateGroup(c *gin.Context) {
	var req group.CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}

	groupObj, err := h.groupService.CreateGroup(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response := group.GroupResponse{
		Success: true,
		Message: "分组创建成功",
		Group:   groupObj,
	}

	c.JSON(http.StatusOK, response)
}

// UpdateGroup 更新分组
func (h *GroupHandler) UpdateGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的分组ID"})
		return
	}

	var req group.UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}
	req.ID = id

	groupObj, err := h.groupService.UpdateGroup(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response := group.GroupResponse{
		Success: true,
		Message: "分组更新成功",
		Group:   groupObj,
	}

	c.JSON(http.StatusOK, response)
}

// DeleteGroup 删除分组
func (h *GroupHandler) DeleteGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   "无效的分组ID",
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	err = h.groupService.DeleteGroup(id)
	if err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   err.Error(),
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	response := group.GroupResponse{
		Success: true,
		Message: "分组删除成功",
	}

	c.JSON(http.StatusOK, response)
}

// AssignGroupToTunnel 为隧道分配分组
func (h *GroupHandler) AssignGroupToTunnel(c *gin.Context) {
	var req group.AssignGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   "无效的请求数据",
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	err := h.groupService.AssignGroupToTunnel(&req)
	if err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   err.Error(),
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	response := group.GroupResponse{
		Success: true,
		Message: "分组分配成功",
	}

	c.JSON(http.StatusOK, response)
}

// GetTunnelGroup 获取隧道的分组
func (h *GroupHandler) GetTunnelGroup(c *gin.Context) {
	tunnelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的隧道ID"})
		return
	}

	groupObj, err := h.groupService.GetTunnelGroup(tunnelID)
	if err != nil {
		// 如果没有分组，返回空
		response := group.GroupResponse{
			Success: true,
			Group:   nil,
		}
		c.JSON(http.StatusOK, response)
		return
	}

	response := group.GroupResponse{
		Success: true,
		Group:   groupObj,
	}

	c.JSON(http.StatusOK, response)
}

// BatchAssignTunnelsToGroup 批量分配隧道到分组 (PUT /api/groups/{id}/tunnels)
func (h *GroupHandler) BatchAssignTunnelsToGroup(c *gin.Context) {
	// 获取分组ID
	groupID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   "无效的分组ID",
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	// 解析请求体
	var req group.BatchAssignTunnelsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   "无效的请求数据",
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	// 调用服务方法
	err = h.groupService.BatchAssignTunnelsToGroup(groupID, &req)
	if err != nil {
		response := group.GroupResponse{
			Success: false,
			Error:   err.Error(),
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	response := group.GroupResponse{
		Success: true,
		Message: "批量分配隧道到分组成功",
	}
	c.JSON(http.StatusOK, response)
}
