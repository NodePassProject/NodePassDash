package api

import (
	"NodePassDash/internal/models"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// GroupHandler 分组处理器
type GroupHandler struct {
	db *gorm.DB
}

// NewGroupHandler 创建分组处理器
func NewGroupHandler(db *gorm.DB) *GroupHandler {
	return &GroupHandler{db: db}
}

// HandleGetGroups 获取所有分组
func (h *GroupHandler) HandleGetGroups(w http.ResponseWriter, r *http.Request) {
	// 使用GORM查询所有分组
	var groups []models.TunnelGroup
	if err := h.db.Order("created_at DESC").Find(&groups).Error; err != nil {
		http.Error(w, `{"error": "查询分组失败"}`, http.StatusInternalServerError)
		return
	}

	// 初始化为空数组而不是 nil 切片，确保 JSON 序列化时返回 [] 而不是 null
	groupsWithMembers := make([]models.TunnelGroupWithMembers, 0)

	for _, group := range groups {
		// 查询该分组的成员
		var members []models.TunnelGroupMember
		if err := h.db.Where("group_id = ?", group.ID).Find(&members).Error; err != nil {
			http.Error(w, `{"error": "查询分组成员失败"}`, http.StatusInternalServerError)
			return
		}

		groupWithMembers := models.TunnelGroupWithMembers{
			TunnelGroup: group,
			Members:     members,
		}

		groupsWithMembers = append(groupsWithMembers, groupWithMembers)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    groupsWithMembers,
	})
}

// HandleCreateGroup 创建分组
func (h *GroupHandler) HandleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTunnelGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "请求参数错误: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// 使用GORM事务
	var groupID int
	err := h.db.Transaction(func(tx *gorm.DB) error {
		// 创建分组
		group := models.TunnelGroup{
			Name:        req.Name,
			Description: req.Description,
			Type:        req.Type,
			Color:       "#3B82F6",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		if err := tx.Create(&group).Error; err != nil {
			return err
		}

		groupID = group.ID

		// 添加分组成员
		if len(req.TunnelIDs) > 0 {
			for _, tunnelID := range req.TunnelIDs {
				member := models.TunnelGroupMember{
					GroupID:   group.ID,
					TunnelID:  strconv.Itoa(tunnelID),
					Role:      "member",
					CreatedAt: time.Now(),
				}

				if err := tx.Create(&member).Error; err != nil {
					return err
				}
			}
		}

		return nil
	})

	if err != nil {
		http.Error(w, `{"error": "创建分组失败"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"id":      groupID,
		"message": "分组创建成功",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleUpdateGroup 更新分组
func (h *GroupHandler) HandleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	groupIDStr := vars["id"]
	groupID, err := strconv.Atoi(groupIDStr)
	if err != nil {
		http.Error(w, `{"error": "无效的分组ID"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdateTunnelGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "请求参数错误: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// 使用GORM事务
	err = h.db.Transaction(func(tx *gorm.DB) error {
		// 更新分组信息
		updates := models.TunnelGroup{
			Name:        req.Name,
			Description: req.Description,
			Type:        req.Type,
			UpdatedAt:   time.Now(),
		}

		if err := tx.Model(&models.TunnelGroup{}).Where("id = ?", groupID).Updates(updates).Error; err != nil {
			return err
		}

		// 如果提供了隧道ID列表，则更新成员关系
		if req.TunnelIDs != nil {
			// 先删除现有成员
			if err := tx.Where("group_id = ?", groupID).Delete(&models.TunnelGroupMember{}).Error; err != nil {
				return err
			}

			// 重新添加成员
			if len(req.TunnelIDs) > 0 {
				for _, tunnelID := range req.TunnelIDs {
					member := models.TunnelGroupMember{
						GroupID:   groupID,
						TunnelID:  strconv.Itoa(tunnelID),
						Role:      "member",
						CreatedAt: time.Now(),
					}

					if err := tx.Create(&member).Error; err != nil {
						return err
					}
				}
			}
		}

		return nil
	})

	if err != nil {
		http.Error(w, `{"error": "更新分组失败"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "分组更新成功",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleDeleteGroup 删除分组
func (h *GroupHandler) HandleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	groupIDStr := vars["id"]
	groupID, err := strconv.Atoi(groupIDStr)
	if err != nil {
		http.Error(w, `{"error": "无效的分组ID"}`, http.StatusBadRequest)
		return
	}

	// 删除分组（CASCADE 会自动删除成员关系）
	if err := h.db.Delete(&models.TunnelGroup{}, groupID).Error; err != nil {
		http.Error(w, `{"error": "删除分组失败"}`, http.StatusInternalServerError)
		return
	}

	// 使用GORM删除相关成员
	if err := h.db.Where("group_id = ?", groupID).Delete(&models.TunnelGroupMember{}).Error; err != nil {
		http.Error(w, `{"error": "删除分组成员失败"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "分组删除成功",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// getTunnelGroupMembers 获取分组成员
func (h *GroupHandler) getTunnelGroupMembers(groupID int) ([]models.TunnelGroupMember, error) {
	var members []models.TunnelGroupMember
	if err := h.db.Where("group_id = ?", groupID).Order("created_at ASC").Find(&members).Error; err != nil {
		return nil, err
	}

	// 确保返回空数组而不是nil
	if members == nil {
		members = []models.TunnelGroupMember{}
	}

	return members, nil
}

// HandleCreateGroupFromTemplate 从模板创建分组
func (h *GroupHandler) HandleCreateGroupFromTemplate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TemplateName string   `json:"template_name" binding:"required"`
		TunnelIDs    []string `json:"tunnel_ids" binding:"required"`
		Mode         string   `json:"mode" binding:"required"` // single, double, intranet
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "请求参数错误: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// 根据模式确定分组类型和名称
	var groupType, groupName, description string
	switch req.Mode {
	case "single":
		groupType = "single"
		groupName = req.TemplateName + " - 单端转发"
		description = "单端转发分组"
	case "double":
		groupType = "double"
		groupName = req.TemplateName + " - 双端转发"
		description = "双端转发分组"
	case "intranet":
		groupType = "intranet"
		groupName = req.TemplateName + " - 内网穿透"
		description = "内网穿透分组"
	default:
		http.Error(w, `{"error": "无效的模式类型"}`, http.StatusBadRequest)
		return
	}

	// 使用GORM事务
	err := h.db.Transaction(func(tx *gorm.DB) error {
		// 创建分组
		group := models.TunnelGroup{
			Name:        groupName,
			Description: description,
			Type:        groupType,
			Color:       "#3B82F6",
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		if err := tx.Create(&group).Error; err != nil {
			return err
		}

		// 添加分组成员
		for i, tunnelIDStr := range req.TunnelIDs {
			role := "member"
			// 对于双端模式和内网穿透模式，设置角色
			if (groupType == "double" || groupType == "intranet") && len(req.TunnelIDs) == 2 {
				if i == 0 {
					role = "source"
				} else {
					role = "target"
				}
			}

			member := models.TunnelGroupMember{
				GroupID:   group.ID,
				TunnelID:  tunnelIDStr,
				Role:      role,
				CreatedAt: time.Now(),
			}

			if err := tx.Create(&member).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		http.Error(w, `{"error": "创建模板分组失败"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"message": "模板分组创建成功",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
