package endpoint

import (
	"NodePassDash/internal/models"
	"errors"
	"time"

	"gorm.io/gorm"
)

// Service 端点管理服务
type Service struct {
	db *gorm.DB
}

// NewService 创建端点服务实例
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// DB 返回底层 *gorm.DB 以便其他层访问
func (s *Service) DB() *gorm.DB {
	return s.db
}

// GetEndpoints 获取所有端点列表
func (s *Service) GetEndpoints() ([]EndpointWithStats, error) {
	var endpoints []EndpointWithStats

	err := s.db.Table("endpoints e").
		Select(`
			e.id, e.name, e.url, e.api_path, e.api_key, e.status, e.color,
			e.os, e.arch, e.ver, e.log, e.tls, e.crt, e.key_path, e.uptime,
			e.last_check, e.created_at, e.updated_at,
			COUNT(t.id) as tunnel_count,
			COUNT(CASE WHEN t.status = 'running' THEN 1 END) as active_tunnels
		`).
		Joins("LEFT JOIN tunnels t ON e.id = t.endpoint_id").
		Group("e.id").
		Order("e.created_at DESC").
		Scan(&endpoints).Error

	// 确保返回空数组而不是nil
	if err != nil {
		return nil, err
	}

	// 如果没有数据，返回空数组
	if endpoints == nil {
		endpoints = []EndpointWithStats{}
	}

	return endpoints, nil
}

// CreateEndpoint 创建新端点
func (s *Service) CreateEndpoint(req CreateEndpointRequest) (*Endpoint, error) {
	// 检查名称是否重复
	var count int64
	if err := s.db.Model(&models.Endpoint{}).Where("name = ?", req.Name).Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("端点名称已存在")
	}

	// 检查URL是否重复
	if err := s.db.Model(&models.Endpoint{}).Where("url = ?", req.URL).Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, errors.New("该URL已存在")
	}

	// 创建新端点
	endpoint := &models.Endpoint{
		Name:      req.Name,
		URL:       req.URL,
		APIPath:   req.APIPath,
		APIKey:    req.APIKey,
		Status:    StatusOffline,
		Color:     &req.Color,
		LastCheck: time.Now(),
	}

	if err := s.db.Create(endpoint).Error; err != nil {
		return nil, err
	}

	return endpoint, nil
}

// UpdateEndpoint 更新端点信息
func (s *Service) UpdateEndpoint(req UpdateEndpointRequest) (*Endpoint, error) {
	// 获取现有端点
	var endpoint models.Endpoint
	if err := s.db.First(&endpoint, req.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("端点不存在")
		}
		return nil, err
	}

	switch req.Action {
	case "rename":
		if req.Name == "" {
			return nil, errors.New("新名称不能为空")
		}
		// 检查新名称是否已存在
		var count int64
		if err := s.db.Model(&models.Endpoint{}).Where("name = ? AND id != ?", req.Name, req.ID).Count(&count).Error; err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, errors.New("端点名称已存在")
		}

		if err := s.db.Model(&endpoint).Update("name", req.Name).Error; err != nil {
			return nil, err
		}
		endpoint.Name = req.Name

	case "update":
		// 检查URL是否重复
		if req.URL != "" && req.URL != endpoint.URL {
			var count int64
			if err := s.db.Model(&models.Endpoint{}).Where("url = ? AND id != ?", req.URL, req.ID).Count(&count).Error; err != nil {
				return nil, err
			}
			if count > 0 {
				return nil, errors.New("该URL已存在")
			}
		}

		// 准备更新数据
		updates := make(map[string]interface{})
		if req.Name != "" {
			updates["name"] = req.Name
		}
		if req.URL != "" {
			updates["url"] = req.URL
		}
		if req.APIPath != "" {
			updates["api_path"] = req.APIPath
		}
		if req.APIKey != "" {
			updates["api_key"] = req.APIKey
		}
		updates["updated_at"] = time.Now()

		if err := s.db.Model(&endpoint).Updates(updates).Error; err != nil {
			return nil, err
		}

		// 重新获取更新后的数据
		if err := s.db.First(&endpoint, req.ID).Error; err != nil {
			return nil, err
		}
	}

	return &endpoint, nil
}

// DeleteEndpoint 删除端点
func (s *Service) DeleteEndpoint(id int64) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 1) 删除关联隧道
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.Tunnel{}).Error; err != nil {
			return err
		}

		// 2) 删除SSE日志
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.EndpointSSE{}).Error; err != nil {
			// 忽略记录不存在的错误
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		// 3) 删除回收站记录
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.TunnelRecycle{}).Error; err != nil {
			// 忽略记录不存在的错误
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		// 4) 删除端点
		result := tx.Delete(&models.Endpoint{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("端点不存在")
		}

		return nil
	})
}

// UpdateEndpointStatus 更新端点状态
func (s *Service) UpdateEndpointStatus(id int64, status EndpointStatus) error {
	return s.db.Model(&models.Endpoint{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":     status,
		"last_check": time.Now(),
	}).Error
}

// GetEndpointByID 根据ID获取端点信息
func (s *Service) GetEndpointByID(id int64) (*Endpoint, error) {
	var endpoint models.Endpoint
	if err := s.db.First(&endpoint, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("端点不存在")
		}
		return nil, err
	}
	return &endpoint, nil
}

// SimpleEndpoint 简化端点信息结构
type SimpleEndpoint struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	URL         string         `json:"url"`
	APIPath     string         `json:"apiPath"`
	Status      EndpointStatus `json:"status"`
	TunnelCount int            `json:"tunnelCount"`
	Version     string         `json:"version"`
	TLS         string         `json:"tls"`
	Log         string         `json:"log"`
	Crt         string         `json:"crt"`
	KeyPath     string         `json:"keyPath"`
	Uptime      *int64         `json:"uptime,omitempty"`
}

// GetSimpleEndpoints 获取简化端点列表，可排除 FAIL
func (s *Service) GetSimpleEndpoints(excludeFail bool) ([]SimpleEndpoint, error) {
	query := s.db.Table("endpoints e").
		Select("e.id, e.name, e.url, e.api_path, e.status, 0 as tunnel_count, e.ver, e.tls, e.log, e.crt, e.key_path, e.uptime")

	if excludeFail {
		query = query.Where("e.status NOT IN ('FAIL', 'DISCONNECT')")
	}

	var endpoints []SimpleEndpoint
	err := query.Order("e.created_at DESC").Scan(&endpoints).Error

	// 确保返回空数组而不是nil
	if err != nil {
		return nil, err
	}

	// 如果没有数据，返回空数组
	if endpoints == nil {
		endpoints = []SimpleEndpoint{}
	}

	return endpoints, nil
}

// UpdateEndpointInfo 更新端点的系统信息
func (s *Service) UpdateEndpointInfo(id int64, info NodePassInfo) error {
	updates := map[string]interface{}{
		"os":         info.OS,
		"arch":       info.Arch,
		"ver":        info.Ver,
		"log":        info.Log,
		"tls":        info.TLS,
		"crt":        info.Crt,
		"key_path":   info.Key,
		"updated_at": time.Now(),
	}

	// 处理uptime字段，如果为nil则保持NULL
	if info.Uptime != nil {
		updates["uptime"] = *info.Uptime
	}

	return s.db.Model(&models.Endpoint{}).Where("id = ?", id).Updates(updates).Error
}
