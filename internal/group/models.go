package group

import (
	"time"
)

// Group 分组模型
type Group struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	TunnelIDs []int64   `json:"tunnelIds,omitempty"` // 绑定的隧道ID列表
}

// TunnelGroup 隧道分组关联模型
type TunnelGroup struct {
	ID        int64     `json:"id"`
	TunnelID  int64     `json:"tunnelId"`
	GroupID   int64     `json:"groupId"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateGroupRequest 创建分组请求
type CreateGroupRequest struct {
	Name string `json:"name" validate:"required"`
}

// UpdateGroupRequest 更新分组请求
type UpdateGroupRequest struct {
	ID   int64  `json:"id" validate:"required"`
	Name string `json:"name,omitempty"`
}

// AssignGroupRequest 分配分组请求
type AssignGroupRequest struct {
	TunnelId int64 `json:"tunnelId" validate:"required"` // 隧道数据库主键ID
	GroupID  int64 `json:"groupId,omitempty"`            // 如果为空，则清除分组
}

// BatchAssignTunnelsRequest 批量分配隧道到分组请求
type BatchAssignTunnelsRequest struct {
	TunnelIDs []int64 `json:"tunnel_ids" validate:"required"` // 隧道ID列表
}

// GroupResponse API 响应
type GroupResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
	Group   interface{} `json:"group,omitempty"`
	Groups  interface{} `json:"groups,omitempty"`
}
