package tag

import (
	"errors"
	"strings"
	"time"

	"NodePassDash/internal/models"

	"gorm.io/gorm"
)

type Service struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// CreateTag 创建标签
func (s *Service) CreateTag(req *CreateTagRequest) (*Tag, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("标签名不能为空")
	}

	// 检查标签名是否已存在
	var existingTag models.Tag
	err := s.db.Where("name = ?", req.Name).First(&existingTag).Error
	if err == nil {
		return nil, errors.New("标签名已存在")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// 创建标签
	tag := models.Tag{
		Name:      req.Name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err = s.db.Create(&tag).Error
	if err != nil {
		return nil, err
	}

	return &Tag{
		ID:        tag.ID,
		Name:      tag.Name,
		CreatedAt: tag.CreatedAt,
		UpdatedAt: tag.UpdatedAt,
	}, nil
}

// GetTags 获取所有标签
func (s *Service) GetTags() ([]*Tag, error) {
	var modelTags []models.Tag
	err := s.db.Order("name").Find(&modelTags).Error
	if err != nil {
		return nil, err
	}

	var tags []*Tag
	for _, modelTag := range modelTags {
		tags = append(tags, &Tag{
			ID:        modelTag.ID,
			Name:      modelTag.Name,
			CreatedAt: modelTag.CreatedAt,
			UpdatedAt: modelTag.UpdatedAt,
		})
	}

	return tags, nil
}

// GetTagByID 根据ID获取标签
func (s *Service) GetTagByID(id int64) (*Tag, error) {
	var modelTag models.Tag
	err := s.db.Where("id = ?", id).First(&modelTag).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("标签不存在")
		}
		return nil, err
	}

	return &Tag{
		ID:        modelTag.ID,
		Name:      modelTag.Name,
		CreatedAt: modelTag.CreatedAt,
		UpdatedAt: modelTag.UpdatedAt,
	}, nil
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
		var duplicateTag models.Tag
		err := s.db.Where("name = ? AND id != ?", req.Name, req.ID).First(&duplicateTag).Error
		if err == nil {
			return nil, errors.New("标签名已存在")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	// 更新字段
	name := req.Name
	if name == "" {
		name = existingTag.Name
	}

	// 使用GORM更新
	updateData := map[string]interface{}{
		"name":       name,
		"updated_at": time.Now(),
	}
	err = s.db.Model(&models.Tag{}).Where("id = ?", req.ID).Updates(updateData).Error
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

	// 使用事务删除标签和相关联的隧道标签记录
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先删除关联的隧道标签记录
		if err := tx.Where("tag_id = ?", id).Delete(&models.TunnelTag{}).Error; err != nil {
			return err
		}

		// 删除标签
		if err := tx.Where("id = ?", id).Delete(&models.Tag{}).Error; err != nil {
			return err
		}

		return nil
	})
}

// AssignTagToTunnel 为隧道分配标签
func (s *Service) AssignTagToTunnel(req *AssignTagRequest) error {
	if req.TunnelId <= 0 {
		return errors.New("隧道ID无效")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先删除现有的标签关联
		if err := tx.Where("tunnel_id = ?", req.TunnelId).Delete(&models.TunnelTag{}).Error; err != nil {
			return err
		}

		// 如果TagID为0，表示清除标签，只删除不插入
		if req.TagID <= 0 {
			return nil
		}

		// 验证标签是否存在
		var tag models.Tag
		err := tx.Where("id = ?", req.TagID).First(&tag).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("指定的标签不存在")
			}
			return err
		}

		// 添加新的标签关联
		tunnelTag := models.TunnelTag{
			TunnelID:  req.TunnelId,
			TagID:     req.TagID,
			CreatedAt: time.Now(),
		}
		return tx.Create(&tunnelTag).Error
	})
}

// GetTunnelTag 获取隧道的标签
func (s *Service) GetTunnelTag(tunnelID int64) (*Tag, error) {
	var result struct {
		models.Tag
		models.TunnelTag
	}

	err := s.db.Table("Tags t").
		Select("t.id, t.name, t.created_at, t.updated_at").
		Joins("JOIN TunnelTags tt ON t.id = tt.tag_id").
		Where("tt.tunnel_id = ?", tunnelID).
		First(&result).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("该隧道没有分配标签")
		}
		return nil, err
	}

	return &Tag{
		ID:        result.Tag.ID,
		Name:      result.Tag.Name,
		CreatedAt: result.Tag.CreatedAt,
		UpdatedAt: result.Tag.UpdatedAt,
	}, nil
}

// GetTunnelsByTag 根据标签获取隧道列表
func (s *Service) GetTunnelsByTag(tagID int64) ([]int64, error) {
	var tunnelTags []models.TunnelTag
	err := s.db.Where("tag_id = ?", tagID).Find(&tunnelTags).Error
	if err != nil {
		return nil, err
	}

	var tunnelIDs []int64
	for _, tunnelTag := range tunnelTags {
		tunnelIDs = append(tunnelIDs, tunnelTag.TunnelID)
	}

	return tunnelIDs, nil
}

// GetTagStats 获取标签统计信息
func (s *Service) GetTagStats() (map[int64]int, error) {
	var results []struct {
		TagID int64 `json:"tag_id"`
		Count int   `json:"count"`
	}

	err := s.db.Table("TunnelTags").
		Select("tag_id, COUNT(*) as count").
		Group("tag_id").
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	stats := make(map[int64]int)
	for _, result := range results {
		stats[result.TagID] = result.Count
	}

	return stats, nil
}
