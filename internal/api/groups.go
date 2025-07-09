package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"NodePassDash/internal/models"

	"github.com/gorilla/mux"
)

// GroupHandler 分组处理器
type GroupHandler struct {
	db *sql.DB
}

// NewGroupHandler 创建分组处理器
func NewGroupHandler(db *sql.DB) *GroupHandler {
	return &GroupHandler{db: db}
}

// HandleGetGroups 获取所有分组
func (h *GroupHandler) HandleGetGroups(w http.ResponseWriter, r *http.Request) {
	// 查询所有分组
	query := `
		SELECT id, name, description, type, color, created_at, updated_at 
		FROM tunnel_groups 
		ORDER BY created_at DESC`

	rows, err := h.db.Query(query)
	if err != nil {
		http.Error(w, `{"error": "查询分组失败"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// 初始化为空数组而不是 nil 切片，确保 JSON 序列化时返回 [] 而不是 null
	groups := make([]models.TunnelGroupWithMembers, 0)

	for rows.Next() {
		var group models.TunnelGroup
		err := rows.Scan(&group.ID, &group.Name, &group.Description, &group.Type,
			&group.Color, &group.CreatedAt, &group.UpdatedAt)
		if err != nil {
			http.Error(w, `{"error": "扫描分组数据失败"}`, http.StatusInternalServerError)
			return
		}

		// 查询分组成员
		members, err := h.getTunnelGroupMembers(group.ID)
		if err != nil {
			http.Error(w, `{"error": "查询分组成员失败"}`, http.StatusInternalServerError)
			return
		}

		groupWithMembers := models.TunnelGroupWithMembers{
			TunnelGroup: group,
			Members:     members,
		}
		groups = append(groups, groupWithMembers)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// HandleCreateGroup 创建新分组
func (h *GroupHandler) HandleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTunnelGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "请求参数错误: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	// 验证分组类型
	if req.Type != "single" && req.Type != "double" && req.Type != "intranet" && req.Type != "custom" {
		http.Error(w, `{"error": "无效的分组类型"}`, http.StatusBadRequest)
		return
	}

	// 开始事务
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, `{"error": "开始事务失败"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 插入分组记录
	insertGroupQuery := `
		INSERT INTO tunnel_groups (name, description, type, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`

	now := time.Now()
	result, err := tx.Exec(insertGroupQuery, req.Name, req.Description, req.Type, "#3B82F6", now, now)
	if err != nil {
		http.Error(w, `{"error": "创建分组失败"}`, http.StatusInternalServerError)
		return
	}

	groupID, err := result.LastInsertId()
	if err != nil {
		http.Error(w, `{"error": "获取分组ID失败"}`, http.StatusInternalServerError)
		return
	}

	// 添加分组成员
	if len(req.TunnelIDs) > 0 {
		insertMemberQuery := `
			INSERT INTO tunnel_group_members (group_id, tunnel_id, role, created_at)
			VALUES (?, ?, ?, ?)`

		for _, tunnelID := range req.TunnelIDs {
			_, err := tx.Exec(insertMemberQuery, groupID, strconv.Itoa(tunnelID), "member", now)
			if err != nil {
				http.Error(w, `{"error": "添加分组成员失败"}`, http.StatusInternalServerError)
				return
			}
		}
	}

	// 提交事务
	if err := tx.Commit(); err != nil {
		http.Error(w, `{"error": "提交事务失败"}`, http.StatusInternalServerError)
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

	// 开始事务
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, `{"error": "开始事务失败"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 更新分组信息
	updateGroupQuery := `
		UPDATE tunnel_groups 
		SET name = ?, description = ?, type = ?, updated_at = ?
		WHERE id = ?`

	_, err = tx.Exec(updateGroupQuery, req.Name, req.Description, req.Type, time.Now(), groupID)
	if err != nil {
		http.Error(w, `{"error": "更新分组失败"}`, http.StatusInternalServerError)
		return
	}

	// 如果提供了隧道ID列表，则更新成员关系
	if req.TunnelIDs != nil {
		// 先删除现有成员
		deleteQuery := "DELETE FROM tunnel_group_members WHERE group_id = ?"
		_, err = tx.Exec(deleteQuery, groupID)
		if err != nil {
			http.Error(w, `{"error": "删除现有成员失败"}`, http.StatusInternalServerError)
			return
		}

		// 重新添加成员
		if len(req.TunnelIDs) > 0 {
			insertMemberQuery := `
				INSERT INTO tunnel_group_members (group_id, tunnel_id, role, created_at)
				VALUES (?, ?, ?, ?)`

			now := time.Now()
			for _, tunnelID := range req.TunnelIDs {
				_, err := tx.Exec(insertMemberQuery, groupID, strconv.Itoa(tunnelID), "member", now)
				if err != nil {
					http.Error(w, `{"error": "添加分组成员失败"}`, http.StatusInternalServerError)
					return
				}
			}
		}
	}

	// 提交事务
	if err := tx.Commit(); err != nil {
		http.Error(w, `{"error": "提交事务失败"}`, http.StatusInternalServerError)
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
	deleteQuery := "DELETE FROM tunnel_groups WHERE id = ?"
	result, err := h.db.Exec(deleteQuery, groupID)
	if err != nil {
		http.Error(w, `{"error": "删除分组失败"}`, http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		http.Error(w, `{"error": "获取影响行数失败"}`, http.StatusInternalServerError)
		return
	}

	if rowsAffected == 0 {
		http.Error(w, `{"error": "分组不存在"}`, http.StatusNotFound)
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
	query := `
		SELECT id, group_id, tunnel_id, role, created_at 
		FROM tunnel_group_members 
		WHERE group_id = ? 
		ORDER BY created_at ASC`

	rows, err := h.db.Query(query, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// 初始化为空数组而不是 nil 切片，确保 JSON 序列化时返回 [] 而不是 null
	members := make([]models.TunnelGroupMember, 0)
	for rows.Next() {
		var member models.TunnelGroupMember
		err := rows.Scan(&member.ID, &member.GroupID, &member.TunnelID,
			&member.Role, &member.CreatedAt)
		if err != nil {
			return nil, err
		}
		members = append(members, member)
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

	// 开始事务
	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, `{"error": "开始事务失败"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 插入分组记录
	insertGroupQuery := `
		INSERT INTO tunnel_groups (name, description, type, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`

	now := time.Now()
	result, err := tx.Exec(insertGroupQuery, groupName, description, groupType, "#3B82F6", now, now)
	if err != nil {
		http.Error(w, `{"error": "创建分组失败"}`, http.StatusInternalServerError)
		return
	}

	groupID, err := result.LastInsertId()
	if err != nil {
		http.Error(w, `{"error": "获取分组ID失败"}`, http.StatusInternalServerError)
		return
	}

	// 添加分组成员
	insertMemberQuery := `
		INSERT INTO tunnel_group_members (group_id, tunnel_id, role, created_at)
		VALUES (?, ?, ?, ?)`

	for i, tunnelID := range req.TunnelIDs {
		role := "member"
		// 对于双端模式和内网穿透模式，设置角色
		if (groupType == "double" || groupType == "intranet") && len(req.TunnelIDs) == 2 {
			if i == 0 {
				role = "source"
			} else {
				role = "target"
			}
		}

		_, err := tx.Exec(insertMemberQuery, groupID, tunnelID, role, now)
		if err != nil {
			http.Error(w, `{"error": "添加分组成员失败"}`, http.StatusInternalServerError)
			return
		}
	}

	// 提交事务
	if err := tx.Commit(); err != nil {
		http.Error(w, `{"error": "提交事务失败"}`, http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"success": true,
		"id":      groupID,
		"message": "模板分组创建成功",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
