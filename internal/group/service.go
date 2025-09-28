package group

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

// CreateGroup 创建分组
func (s *Service) CreateGroup(req *CreateGroupRequest) (*Group, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("分组名不能为空")
	}

	// 检查分组名是否已存在
	var existingGroup models.Group
	err := s.db.Where("name = ?", req.Name).First(&existingGroup).Error
	if err == nil {
		return nil, errors.New("分组名已存在")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// 创建分组
	group := models.Group{
		Name:      req.Name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err = s.db.Create(&group).Error
	if err != nil {
		return nil, err
	}

	return &Group{
		ID:        group.ID,
		Name:      group.Name,
		CreatedAt: group.CreatedAt,
		UpdatedAt: group.UpdatedAt,
	}, nil
}

// GetGroups 获取所有分组
func (s *Service) GetGroups() ([]*Group, error) {
	var modelGroups []models.Group
	err := s.db.Order("name").Find(&modelGroups).Error
	if err != nil {
		return nil, err
	}

	var groups []*Group
	for _, modelGroup := range modelGroups {
		// 获取该分组绑定的隧道ID列表
		tunnelIDs, err := s.GetTunnelsByGroup(modelGroup.ID)
		if err != nil {
			// 如果获取失败，设置为空数组而不是返回错误
			tunnelIDs = []int64{}
		}

		groups = append(groups, &Group{
			ID:        modelGroup.ID,
			Name:      modelGroup.Name,
			CreatedAt: modelGroup.CreatedAt,
			UpdatedAt: modelGroup.UpdatedAt,
			TunnelIDs: tunnelIDs,
		})
	}

	return groups, nil
}

// GetGroupByID 根据ID获取分组
func (s *Service) GetGroupByID(id int64) (*Group, error) {
	var modelGroup models.Group
	err := s.db.Where("id = ?", id).First(&modelGroup).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("分组不存在")
		}
		return nil, err
	}

	return &Group{
		ID:        modelGroup.ID,
		Name:      modelGroup.Name,
		CreatedAt: modelGroup.CreatedAt,
		UpdatedAt: modelGroup.UpdatedAt,
	}, nil
}

// UpdateGroup 更新分组
func (s *Service) UpdateGroup(req *UpdateGroupRequest) (*Group, error) {
	if req.ID <= 0 {
		return nil, errors.New("分组ID无效")
	}

	// 检查分组是否存在
	existingGroup, err := s.GetGroupByID(req.ID)
	if err != nil {
		return nil, err
	}

	// 如果更新名称，检查是否与其他分组重名
	if req.Name != "" && req.Name != existingGroup.Name {
		var duplicateGroup models.Group
		err := s.db.Where("name = ? AND id != ?", req.Name, req.ID).First(&duplicateGroup).Error
		if err == nil {
			return nil, errors.New("分组名已存在")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	// 更新字段
	name := req.Name
	if name == "" {
		name = existingGroup.Name
	}

	// 使用GORM更新
	updateData := map[string]interface{}{
		"name":       name,
		"updated_at": time.Now(),
	}
	err = s.db.Model(&models.Group{}).Where("id = ?", req.ID).Updates(updateData).Error
	if err != nil {
		return nil, err
	}

	return &Group{
		ID:        req.ID,
		Name:      name,
		CreatedAt: existingGroup.CreatedAt,
		UpdatedAt: time.Now(),
	}, nil
}

// DeleteGroup 删除分组
func (s *Service) DeleteGroup(id int64) error {
	// 检查分组是否存在
	_, err := s.GetGroupByID(id)
	if err != nil {
		return err
	}

	// 使用事务删除分组和相关联的隧道分组记录
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先删除关联的隧道分组记录
		if err := tx.Where("group_id = ?", id).Delete(&models.TunnelGroup{}).Error; err != nil {
			return err
		}

		// 删除分组
		if err := tx.Where("id = ?", id).Delete(&models.Group{}).Error; err != nil {
			return err
		}

		return nil
	})
}

// AssignGroupToTunnel 为隧道分配分组
func (s *Service) AssignGroupToTunnel(req *AssignGroupRequest) error {
	if req.TunnelId <= 0 {
		return errors.New("隧道ID无效")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先删除现有的分组关联
		if err := tx.Where("tunnel_id = ?", req.TunnelId).Delete(&models.TunnelGroup{}).Error; err != nil {
			return err
		}

		// 如果GroupID为0，表示清除分组，只删除不插入
		if req.GroupID <= 0 {
			return nil
		}

		// 验证分组是否存在
		var group models.Group
		err := tx.Where("id = ?", req.GroupID).First(&group).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("指定的分组不存在")
			}
			return err
		}

		// 添加新的分组关联
		tunnelGroup := models.TunnelGroup{
			TunnelID:  req.TunnelId,
			GroupID:   req.GroupID,
			CreatedAt: time.Now(),
		}
		return tx.Create(&tunnelGroup).Error
	})
}

// GetTunnelGroup 获取隧道的分组
func (s *Service) GetTunnelGroup(tunnelID int64) (*Group, error) {
	var result struct {
		models.Group
		models.TunnelGroup
	}

	err := s.db.Table("Groups g").
		Select("g.id, g.name, g.created_at, g.updated_at").
		Joins("JOIN TunnelGroups tg ON g.id = tg.group_id").
		Where("tg.tunnel_id = ?", tunnelID).
		First(&result).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("该隧道没有分配分组")
		}
		return nil, err
	}

	return &Group{
		ID:        result.Group.ID,
		Name:      result.Group.Name,
		CreatedAt: result.Group.CreatedAt,
		UpdatedAt: result.Group.UpdatedAt,
	}, nil
}

// GetTunnelsByGroup 根据分组获取隧道列表
func (s *Service) GetTunnelsByGroup(groupID int64) ([]int64, error) {
	var tunnelGroups []models.TunnelGroup
	err := s.db.Where("group_id = ?", groupID).Find(&tunnelGroups).Error
	if err != nil {
		return nil, err
	}

	var tunnelIDs []int64
	for _, tunnelGroup := range tunnelGroups {
		tunnelIDs = append(tunnelIDs, tunnelGroup.TunnelID)
	}

	return tunnelIDs, nil
}

// GetGroupStats 获取分组统计信息
func (s *Service) GetGroupStats() (map[int64]int, error) {
	var results []struct {
		GroupID int64 `json:"group_id"`
		Count   int   `json:"count"`
	}

	err := s.db.Table("TunnelGroups").
		Select("group_id, COUNT(*) as count").
		Group("group_id").
		Find(&results).Error

	if err != nil {
		return nil, err
	}

	stats := make(map[int64]int)
	for _, result := range results {
		stats[result.GroupID] = result.Count
	}

	return stats, nil
}

// BatchAssignTunnelsToGroup 批量分配隧道到分组
func (s *Service) BatchAssignTunnelsToGroup(groupID int64, req *BatchAssignTunnelsRequest) error {
	if groupID <= 0 {
		return errors.New("分组ID无效")
	}

	// 验证分组是否存在
	_, err := s.GetGroupByID(groupID)
	if err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		// 先删除该分组下所有现有的隧道关联
		if err := tx.Where("group_id = ?", groupID).Delete(&models.TunnelGroup{}).Error; err != nil {
			return err
		}

		// 如果TunnelIDs为空，表示清除所有关联，只删除不插入
		if len(req.TunnelIDs) == 0 {
			return nil
		}

		// 批量插入新的关联
		var tunnelGroups []models.TunnelGroup
		for _, tunnelID := range req.TunnelIDs {
			if tunnelID > 0 { // 确保隧道ID有效
				tunnelGroups = append(tunnelGroups, models.TunnelGroup{
					TunnelID:  tunnelID,
					GroupID:   groupID,
					CreatedAt: time.Now(),
				})
			}
		}

		if len(tunnelGroups) > 0 {
			// 使用批量插入
			if err := tx.Create(&tunnelGroups).Error; err != nil {
				return err
			}
		}

		return nil
	})
}
