package endpoint

import (
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"errors"
	"fmt"
	"net/url"
	"strings"
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

// extractIPFromURL 从URL中提取IP地址（IPv4或IPv6）
func extractIPFromURL(urlStr string) string {
	// 尝试解析URL
	parsedURL, err := url.Parse(urlStr)
	if err != nil {
		// 如果URL解析失败，尝试手动提取
		return extractIPFromString(urlStr)
	}

	// 从解析后的URL中提取主机名
	host := parsedURL.Hostname()
	if host == "" {
		return ""
	}

	// 检查是否为有效的IP地址
	//if ip := net.ParseIP(host); ip != nil {
	//	return ip.String()
	//}

	// 如果不是IP地址，返回空字符串
	return host
}

// extractIPFromString 从字符串中手动提取host部分（备用方法）
func extractIPFromString(input string) string {
	// 去除协议部分
	if idx := strings.Index(input, "://"); idx != -1 {
		input = input[idx+3:]
	}

	// 去除用户认证信息
	if atIdx := strings.Index(input, "@"); atIdx != -1 {
		input = input[atIdx+1:]
	}

	// 去除路径部分
	if slashIdx := strings.Index(input, "/"); slashIdx != -1 {
		input = input[:slashIdx]
	}

	// 去除查询参数
	if queryIdx := strings.Index(input, "?"); queryIdx != -1 {
		input = input[:queryIdx]
	}

	// 去除端口部分
	if colonIdx := strings.Index(input, ":"); colonIdx != -1 {
		input = input[:colonIdx]
	}

	return input
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

	// 从URL中提取IP地址
	extractedIP := extractIPFromURL(req.URL)

	// 创建新端点
	endpoint := &models.Endpoint{
		Name:      req.Name,
		URL:       req.URL,
		Hostname:  extractedIP, // 填充提取的IP地址
		APIPath:   req.APIPath,
		APIKey:    req.APIKey,
		Status:    StatusOffline,
		LastCheck: time.Now(),
	}

	if err := s.db.Create(endpoint).Error; err != nil {
		return nil, err
	}

	// 添加到缓存
	nodepass.GetCache().Set(fmt.Sprintf("%d", endpoint.ID), endpoint.URL+endpoint.APIPath, endpoint.APIKey)

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
		// 名称更新不影响缓存，因为缓存只存储ID、URL和APIKey

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
			// 如果URL更新了，同时更新IP字段
			if extractedIP := extractIPFromURL(req.URL); extractedIP != "" {
				updates["hostname"] = extractedIP
			}
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

		// 更新缓存（只有在URL或APIKey变化时才需要更新）
		if req.URL != "" || req.APIKey != "" {
			nodepass.GetCache().Update(fmt.Sprintf("%d", endpoint.ID), endpoint.URL+endpoint.APIPath, endpoint.APIKey)
		}

	case "updateConfig":
		// 修改配置：更新名称、URL、API路径，可选的API密钥
		updates := make(map[string]interface{})
		needUpdateCache := false

		if req.Name != "" {
			// 检查新名称是否已存在
			var count int64
			if err := s.db.Model(&models.Endpoint{}).Where("name = ? AND id != ?", req.Name, req.ID).Count(&count).Error; err != nil {
				return nil, err
			}
			if count > 0 {
				return nil, errors.New("端点名称已存在")
			}
			updates["name"] = req.Name
		}

		if req.URL != "" && req.URL != endpoint.URL {
			// 检查URL是否重复
			var count int64
			if err := s.db.Model(&models.Endpoint{}).Where("url = ? AND id != ?", req.URL, req.ID).Count(&count).Error; err != nil {
				return nil, err
			}
			if count > 0 {
				return nil, errors.New("该URL已存在")
			}
			updates["url"] = req.URL
			// 更新IP字段
			if extractedIP := extractIPFromURL(req.URL); extractedIP != "" {
				updates["hostname"] = extractedIP
			}
			needUpdateCache = true
		}

		if req.APIPath != "" && req.APIPath != endpoint.APIPath {
			updates["api_path"] = req.APIPath
			needUpdateCache = true
		}

		if req.APIKey != "" && req.APIKey != endpoint.APIKey {
			updates["api_key"] = req.APIKey
			needUpdateCache = true
		}

		updates["updated_at"] = time.Now()

		if err := s.db.Model(&endpoint).Updates(updates).Error; err != nil {
			return nil, err
		}

		// 重新获取更新后的数据
		if err := s.db.First(&endpoint, req.ID).Error; err != nil {
			return nil, err
		}

		// 更新缓存
		if needUpdateCache {
			nodepass.GetCache().Update(fmt.Sprintf("%d", endpoint.ID), endpoint.URL+endpoint.APIPath, endpoint.APIKey)
		}

	case "updateApiKey":
		// 仅更新API密钥
		if req.APIKey == "" {
			return nil, errors.New("API密钥不能为空")
		}

		updates := map[string]interface{}{
			"api_key":    req.APIKey,
			"updated_at": time.Now(),
		}

		if err := s.db.Model(&endpoint).Updates(updates).Error; err != nil {
			return nil, err
		}

		// 重新获取更新后的数据
		if err := s.db.First(&endpoint, req.ID).Error; err != nil {
			return nil, err
		}

		// 更新缓存
		nodepass.GetCache().Update(fmt.Sprintf("%d", endpoint.ID), endpoint.URL+endpoint.APIPath, endpoint.APIKey)
	}

	return &endpoint, nil
}

// DeleteEndpoint 删除端点
func (s *Service) DeleteEndpoint(id int64) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 1) 删除隧道分组关联表记录（通过隧道ID关联）
		if err := tx.Exec("DELETE FROM tunnel_groups WHERE tunnel_id IN (SELECT id FROM tunnels WHERE endpoint_id = ?)", id).Error; err != nil {
			// 忽略记录不存在的错误
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("删除隧道分组关联失败: %v", err)
			}
		}

		// 2) 删除隧道操作日志，避免外键约束错误
		if err := tx.Exec("DELETE FROM tunnel_operation_logs WHERE tunnel_id IN (SELECT id FROM tunnels WHERE endpoint_id = ?)", id).Error; err != nil {
			// 忽略记录不存在的错误
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("删除隧道操作日志失败: %v", err)
			}
		}

		// 3) 删除关联隧道
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.Tunnel{}).Error; err != nil {
			return err
		}

		// 4) 删除SSE日志
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.EndpointSSE{}).Error; err != nil {
			// 忽略记录不存在的错误
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		// 4) 删除回收站记录
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.TunnelRecycle{}).Error; err != nil {
			// 忽略记录不存在的错误
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		// 5) 删除流量历史汇总记录
		if err := tx.Exec("DELETE FROM traffic_hourly_summary WHERE endpoint_id = ?", id).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("删除流量历史记录失败: %v", err)
			}
		}

		// 6) 删除服务历史记录
		if err := tx.Where("endpoint_id = ?", id).Delete(&models.ServiceHistory{}).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("删除服务历史记录失败: %v", err)
			}
		}

		// 7) 删除流量归档记录（如果存在）
		if err := tx.Exec("DELETE FROM traffic_archive_records WHERE endpoint_id = ?", id).Error; err != nil {
			// 这个表可能不存在，忽略错误
		}

		// 8) 删除状态变化记录（如果存在）
		if err := tx.Exec("DELETE FROM status_change_records WHERE endpoint_id = ?", id).Error; err != nil {
			// 这个表可能不存在，忽略错误
		}

		// 9) 删除流量历史记录（如果存在）
		if err := tx.Exec("DELETE FROM traffic_history WHERE endpoint_id = ?", id).Error; err != nil {
			// 这个表可能不存在，忽略错误
		}

		// 10) 删除端点
		result := tx.Delete(&models.Endpoint{}, id)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("端点不存在")
		}

		// 11) 从缓存中删除
		nodepass.GetCache().Delete(fmt.Sprintf("%d", id))

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
	Ver         string         `json:"version"`
	TLS         string         `json:"tls"`
	Log         string         `json:"log"`
	Crt         string         `json:"crt"`
	KeyPath     string         `json:"keyPath"`
	Uptime      *int64         `json:"uptime,omitempty"`
}

// GetSimpleEndpoints 获取简化端点列表，可排除 FAIL
func (s *Service) GetSimpleEndpoints(excludeFail bool) ([]SimpleEndpoint, error) {
	query := s.db.Table("endpoints e").
		Select("e.id, e.name, e.hostname as url, e.api_path, e.status,  e.tunnel_count, e.ver, e.tls, e.log, e.crt, e.key_path, e.uptime")

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
func (s *Service) UpdateEndpointInfo(id int64, info nodepass.EndpointInfoResult) error {
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

	// 处理uptime字段
	updates["uptime"] = info.Uptime

	return s.db.Model(&models.Endpoint{}).Where("id = ?", id).Updates(updates).Error
}
