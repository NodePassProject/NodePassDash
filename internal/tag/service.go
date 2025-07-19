package tag

import (
	"database/sql"
	"errors"
	"strings"
	"time"
)

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// CreateTag 创建标签
func (s *Service) CreateTag(req *CreateTagRequest) (*Tag, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("标签名不能为空")
	}

	// 检查标签名是否已存在
	var exists int
	err := s.db.QueryRow("SELECT 1 FROM Tags WHERE name = ?", req.Name).Scan(&exists)
	if err == nil {
		return nil, errors.New("标签名已存在")
	} else if err != sql.ErrNoRows {
		return nil, err
	}

	// 插入标签
	result, err := s.db.Exec(
		"INSERT INTO Tags (name, created_at, updated_at) VALUES (?, ?, ?)",
		req.Name, time.Now(), time.Now(),
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Tag{
		ID:        id,
		Name:      req.Name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}, nil
}

// GetTags 获取所有标签
func (s *Service) GetTags() ([]*Tag, error) {
	rows, err := s.db.Query("SELECT id, name, created_at, updated_at FROM Tags ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []*Tag
	for rows.Next() {
		var tag Tag
		err := rows.Scan(&tag.ID, &tag.Name, &tag.CreatedAt, &tag.UpdatedAt)
		if err != nil {
			return nil, err
		}
		tags = append(tags, &tag)
	}

	return tags, nil
}

// GetTagByID 根据ID获取标签
func (s *Service) GetTagByID(id int64) (*Tag, error) {
	var tag Tag
	err := s.db.QueryRow(
		"SELECT id, name, created_at, updated_at FROM Tags WHERE id = ?",
		id,
	).Scan(&tag.ID, &tag.Name, &tag.CreatedAt, &tag.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

// UpdateTag 更新标签
func (s *Service) UpdateTag(req *UpdateTagRequest) (*Tag, error) {
	if req.ID <= 0 {
		return nil, errors.New("标签ID无效")
	}

	// 检查标签是否存在
	existingTag, err := s.GetTagByID(req.ID)
	if err != nil {
		return nil, err
	}

	// 如果更新名称，检查是否与其他标签重名
	if req.Name != "" && req.Name != existingTag.Name {
		var exists int
		err := s.db.QueryRow("SELECT 1 FROM Tags WHERE name = ? AND id != ?", req.Name, req.ID).Scan(&exists)
		if err == nil {
			return nil, errors.New("标签名已存在")
		} else if err != sql.ErrNoRows {
			return nil, err
		}
	}

	// 更新字段
	name := req.Name
	if name == "" {
		name = existingTag.Name
	}

	_, err = s.db.Exec(
		"UPDATE Tags SET name = ?, updated_at = ? WHERE id = ?",
		name, time.Now(), req.ID,
	)
	if err != nil {
		return nil, err
	}

	return &Tag{
		ID:        req.ID,
		Name:      name,
		CreatedAt: existingTag.CreatedAt,
		UpdatedAt: time.Now(),
	}, nil
}

// DeleteTag 删除标签
func (s *Service) DeleteTag(id int64) error {
	// 检查标签是否存在
	_, err := s.GetTagByID(id)
	if err != nil {
		return err
	}

	// 先删除关联的隧道标签记录
	_, err = s.db.Exec("DELETE FROM TunnelTags WHERE tag_id = ?", id)
	if err != nil {
		return err
	}

	// 删除标签
	_, err = s.db.Exec("DELETE FROM Tags WHERE id = ?", id)
	return err
}

// AssignTagToTunnel 为隧道分配标签
func (s *Service) AssignTagToTunnel(req *AssignTagRequest) error {
	if req.TunnelId <= 0 {
		return errors.New("隧道ID无效")
	}

	// 先删除现有的标签关联
	_, err := s.db.Exec("DELETE FROM TunnelTags WHERE tunnel_id = ?", req.TunnelId)
	if err != nil {
		return err
	}

	// 添加新的标签关联
	_, err = s.db.Exec(
		"INSERT INTO TunnelTags (tunnel_id, tag_id, created_at) VALUES (?, ?, ?)",
		req.TunnelId, req.TagID, time.Now(),
	)
	return err
}

// GetTunnelTag 获取隧道的标签
func (s *Service) GetTunnelTag(tunnelID int64) (*Tag, error) {
	var tag Tag
	err := s.db.QueryRow(`
		SELECT t.id, t.name, t.created_at, t.updated_at 
		FROM Tag t 
		JOIN TunnelTags tt ON t.id = tt.tag_id 
		WHERE tt.tunnel_id = ?
	`, tunnelID).Scan(&tag.ID, &tag.Name, &tag.CreatedAt, &tag.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &tag, nil
}

// GetTunnelsByTag 根据标签获取隧道列表
func (s *Service) GetTunnelsByTag(tagID int64) ([]int64, error) {
	rows, err := s.db.Query("SELECT tunnel_id FROM TunnelTags WHERE tag_id = ?", tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tunnelIDs []int64
	for rows.Next() {
		var tunnelID int64
		err := rows.Scan(&tunnelID)
		if err != nil {
			return nil, err
		}
		tunnelIDs = append(tunnelIDs, tunnelID)
	}

	return tunnelIDs, nil
}

// GetTagStats 获取标签统计信息
func (s *Service) GetTagStats() (map[int64]int, error) {
	rows, err := s.db.Query(`
		SELECT tag_id, COUNT(*) as count 
		FROM TunnelTags 
		GROUP BY tag_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := make(map[int64]int)
	for rows.Next() {
		var tagID int64
		var count int
		err := rows.Scan(&tagID, &count)
		if err != nil {
			return nil, err
		}
		stats[tagID] = count
	}

	return stats, nil
}
