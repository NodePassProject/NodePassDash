package tag

import (
	"time"
)

// Tag 标签模型
type Tag struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// TunnelTag 隧道标签关联模型
type TunnelTag struct {
	ID        int64     `json:"id"`
	TunnelID  int64     `json:"tunnelId"`
	TagID     int64     `json:"tagId"`
	CreatedAt time.Time `json:"createdAt"`
}

// CreateTagRequest 创建标签请求
type CreateTagRequest struct {
	Name string `json:"name" validate:"required"`
}

// UpdateTagRequest 更新标签请求
type UpdateTagRequest struct {
	ID   int64  `json:"id" validate:"required"`
	Name string `json:"name,omitempty"`
}

// AssignTagRequest 分配标签请求
type AssignTagRequest struct {
	TunnelId int64 `json:"tunnelId" validate:"required"` // 隧道数据库主键ID
	TagID    int64 `json:"tagId,omitempty"`              // 如果为空，则清除标签
}

// TagResponse API 响应
type TagResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Error   string      `json:"error,omitempty"`
	Tag     interface{} `json:"tag,omitempty"`
	Tags    interface{} `json:"tags,omitempty"`
}
