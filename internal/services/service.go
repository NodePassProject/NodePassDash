package services

import (
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"fmt"

	"gorm.io/gorm"
)

type ServiceImpl struct {
	db *gorm.DB
}

func NewService(db *gorm.DB) *ServiceImpl {
	return &ServiceImpl{db: db}
}

// GetServices 获取所有服务
func (s *ServiceImpl) GetServices() ([]*Service, error) {
	var modelServices []models.Services
	err := s.db.Order("sid, type").Find(&modelServices).Error
	if err != nil {
		return nil, err
	}

	var services []*Service
	for _, modelService := range modelServices {
		services = append(services, &Service{
			Sid:                modelService.Sid,
			Type:               modelService.Type,
			Alias:              modelService.Alias,
			ServerInstanceId:   modelService.ServerInstanceId,
			ClientInstanceId:   modelService.ClientInstanceId,
			ServerEndpointId:   modelService.ServerEndpointId,
			ClientEndpointId:   modelService.ClientEndpointId,
			TunnelPort:         modelService.TunnelPort,
			TunnelEndpointName: modelService.TunnelEndpointName,
			EntrancePort:       modelService.EntrancePort,
			EntranceHost:       modelService.EntranceHost,
			ExitPort:           modelService.ExitPort,
			ExitHost:           modelService.ExitHost,
			CreatedAt:          modelService.CreatedAt,
			UpdatedAt:          modelService.UpdatedAt,
		})
	}

	return services, nil
}

// GetServiceByID 根据 SID 和 Type 获取单个服务
func (s *ServiceImpl) GetServiceByID(sid, serviceType string) (*Service, error) {
	var modelService models.Services
	err := s.db.Where("sid = ? AND type = ?", sid, serviceType).First(&modelService).Error
	if err != nil {
		return nil, err
	}

	return &Service{
		Sid:                modelService.Sid,
		Type:               modelService.Type,
		Alias:              modelService.Alias,
		ServerInstanceId:   modelService.ServerInstanceId,
		ClientInstanceId:   modelService.ClientInstanceId,
		ServerEndpointId:   modelService.ServerEndpointId,
		ClientEndpointId:   modelService.ClientEndpointId,
		TunnelPort:         modelService.TunnelPort,
		TunnelEndpointName: modelService.TunnelEndpointName,
		EntrancePort:       modelService.EntrancePort,
		EntranceHost:       modelService.EntranceHost,
		ExitPort:           modelService.ExitPort,
		ExitHost:           modelService.ExitHost,
		CreatedAt:          modelService.CreatedAt,
		UpdatedAt:          modelService.UpdatedAt,
	}, nil
}

// GetAvailableInstances 获取可用实例（没有peer或peer.sid的实例）
func (s *ServiceImpl) GetAvailableInstances() ([]*AvailableInstance, error) {
	var tunnels []models.Tunnel

	// 查询没有 peer 或 peer.sid 为空的隧道
	// peer 字段为 JSON，需要检查是否为 null 或者 sid 字段为空
	err := s.db.Where("peer IS NULL OR json_extract(peer, '$.sid') IS NULL OR json_extract(peer, '$.sid') = ''").
		Preload("Endpoint").
		Find(&tunnels).Error

	if err != nil {
		return nil, err
	}

	var instances []*AvailableInstance
	for _, tunnel := range tunnels {
		if tunnel.InstanceID == nil {
			continue
		}

		instances = append(instances, &AvailableInstance{
			InstanceId:    *tunnel.InstanceID,
			EndpointId:    tunnel.EndpointID,
			EndpointName:  tunnel.Endpoint.Name,
			TunnelType:    string(tunnel.Type),
			Name:          tunnel.Name,
			TunnelAddress: tunnel.TunnelAddress,
			TunnelPort:    tunnel.TunnelPort,
			TargetAddress: tunnel.TargetAddress,
			TargetPort:    tunnel.TargetPort,
		})
	}

	return instances, nil
}

// AssembleService 组装服务
func (s *ServiceImpl) AssembleService(req *AssembleServiceRequest) error {
	// 验证客户端实例是否存在并获取 tunnel 信息
	var clientTunnel models.Tunnel
	if err := s.db.Where("instance_id = ?", req.ClientInstanceId).First(&clientTunnel).Error; err != nil {
		return fmt.Errorf("客户端实例不存在: %w", err)
	}

	// 如果需要服务端实例，验证是否存在并获取 tunnel 信息
	var serverTunnel *models.Tunnel
	if req.ServerInstanceId != nil && *req.ServerInstanceId != "" {
		serverTunnel = &models.Tunnel{}
		if err := s.db.Where("instance_id = ?", *req.ServerInstanceId).First(serverTunnel).Error; err != nil {
			return fmt.Errorf("服务端实例不存在: %w", err)
		}
	}

	// 创建 peer 对象
	alias := req.Name
	peer := &models.Peer{
		SID:   &req.Sid,
		Type:  &req.Type,
		Alias: &alias,
	}

	// 调用 nodepass API 更新客户端实例的 peer 信息
	if _, err := nodepass.UpdateInstancePeers(clientTunnel.EndpointID, req.ClientInstanceId, peer); err != nil {
		return fmt.Errorf("更新客户端实例peer信息失败: %w", err)
	}

	// 更新数据库中客户端隧道的 peer 字段
	clientTunnel.Peer = peer
	if err := s.db.Model(&models.Tunnel{}).
		Where("instance_id = ?", req.ClientInstanceId).
		Select("peer").
		Updates(&clientTunnel).Error; err != nil {
		return fmt.Errorf("更新客户端隧道peer字段失败: %w", err)
	}

	// 如果有服务端实例，也调用 nodepass API 更新其 peer 信息
	if serverTunnel != nil {
		if _, err := nodepass.UpdateInstancePeers(serverTunnel.EndpointID, *req.ServerInstanceId, peer); err != nil {
			return fmt.Errorf("更新服务端实例peer信息失败: %w", err)
		}

		// 更新数据库中服务端隧道的 peer 字段
		serverTunnel.Peer = peer
		if err := s.db.Model(&models.Tunnel{}).
			Where("instance_id = ?", *req.ServerInstanceId).
			Select("peer").
			Updates(serverTunnel).Error; err != nil {
			return fmt.Errorf("更新服务端隧道peer字段失败: %w", err)
		}
	}

	return nil
}
