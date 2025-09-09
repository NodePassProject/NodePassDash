package api

import (
	"NodePassDash/internal/tag"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// TagHandler 标签处理器
type TagHandler struct {
	tagService *tag.Service
}

// NewTagHandler 创建标签处理器
func NewTagHandler(tagService *tag.Service) *TagHandler {
	return &TagHandler{tagService: tagService}
}

// GetTags 获取所有标签
func (h *TagHandler) GetTags(c *gin.Context) {
	tags, err := h.tagService.GetTags()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := tag.TagResponse{
		Success: true,
		Tags:    tags,
	}

	c.JSON(http.StatusOK, response)
}

// CreateTag 创建标签
func (h *TagHandler) CreateTag(c *gin.Context) {
	var req tag.CreateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}

	tagObj, err := h.tagService.CreateTag(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签创建成功",
		Tag:     tagObj,
	}

	c.JSON(http.StatusOK, response)
}

// UpdateTag 更新标签
func (h *TagHandler) UpdateTag(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的标签ID"})
		return
	}

	var req tag.UpdateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}
	req.ID = id

	tagObj, err := h.tagService.UpdateTag(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签更新成功",
		Tag:     tagObj,
	}

	c.JSON(http.StatusOK, response)
}

// DeleteTag 删除标签
func (h *TagHandler) DeleteTag(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   "无效的标签ID",
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	err = h.tagService.DeleteTag(id)
	if err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   err.Error(),
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签删除成功",
	}

	c.JSON(http.StatusOK, response)
}

// AssignTagToTunnel 为隧道分配标签
func (h *TagHandler) AssignTagToTunnel(c *gin.Context) {
	var req tag.AssignTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   "无效的请求数据",
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	err := h.tagService.AssignTagToTunnel(&req)
	if err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   err.Error(),
		}
		c.JSON(http.StatusBadRequest, response)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签分配成功",
	}

	c.JSON(http.StatusOK, response)
}

// GetTunnelTag 获取隧道的标签
func (h *TagHandler) GetTunnelTag(c *gin.Context) {
	tunnelID, err := strconv.ParseInt(c.Param("tunnelId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的隧道ID"})
		return
	}

	tagObj, err := h.tagService.GetTunnelTag(tunnelID)
	if err != nil {
		// 如果没有标签，返回空
		response := tag.TagResponse{
			Success: true,
			Tag:     nil,
		}
		c.JSON(http.StatusOK, response)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Tag:     tagObj,
	}

	c.JSON(http.StatusOK, response)
}
