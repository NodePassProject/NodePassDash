package services

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"
)

type ServiceImpl struct {
	db            *gorm.DB
	tunnelService *tunnel.Service
	sseManager    *sse.Manager
}

func NewService(db *gorm.DB, tunnelService *tunnel.Service, sseManager *sse.Manager) *ServiceImpl {
	return &ServiceImpl{
		db:            db,
		tunnelService: tunnelService,
		sseManager:    sseManager,
	}
}

// GetServices 获取所有服务
func (s *ServiceImpl) GetServices() ([]*models.Services, error) {
	var services []*models.Services
	err := s.db.Order("sorts").Find(&services).Error
	return services, err
}

// GetServiceByID 根据 SID 和 Type 获取单个服务
func (s *ServiceImpl) GetServiceByID(sid string) (*models.Services, error) {
	var service models.Services
	err := s.db.Where("sid = ?", sid).First(&service).Error
	if err != nil {
		return nil, err
	}
	return &service, nil
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

// StartService 启动服务（启动 client 和 server 实例）
func (s *ServiceImpl) StartService(sid string) error {
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 启动客户端实例
	if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
		if _, err := nodepass.ControlInstance(*service.ClientEndpointId, *service.ClientInstanceId, "start"); err != nil {
			return fmt.Errorf("启动客户端实例失败: %w", err)
		}
	}

	// 启动服务端实例（如果存在）
	if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
		if _, err := nodepass.ControlInstance(*service.ServerEndpointId, *service.ServerInstanceId, "start"); err != nil {
			return fmt.Errorf("启动服务端实例失败: %w", err)
		}
	}

	return nil
}

// StopService 停止服务（停止 client 和 server 实例）
func (s *ServiceImpl) StopService(sid string) error {
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 停止客户端实例
	if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
		if _, err := nodepass.ControlInstance(*service.ClientEndpointId, *service.ClientInstanceId, "stop"); err != nil {
			return fmt.Errorf("停止客户端实例失败: %w", err)
		}
	}

	// 停止服务端实例（如果存在）
	if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
		if _, err := nodepass.ControlInstance(*service.ServerEndpointId, *service.ServerInstanceId, "stop"); err != nil {
			return fmt.Errorf("停止服务端实例失败: %w", err)
		}
	}

	return nil
}

// RestartService 重启服务（重启 client 和 server 实例）
func (s *ServiceImpl) RestartService(sid string) error {
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 重启客户端实例
	if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
		if _, err := nodepass.ControlInstance(*service.ClientEndpointId, *service.ClientInstanceId, "restart"); err != nil {
			return fmt.Errorf("重启客户端实例失败: %w", err)
		}
	}

	// 重启服务端实例（如果存在）
	if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
		if _, err := nodepass.ControlInstance(*service.ServerEndpointId, *service.ServerInstanceId, "restart"); err != nil {
			return fmt.Errorf("重启服务端实例失败: %w", err)
		}
	}

	return nil
}

// DeleteService 删除服务（先删除实例再删除服务记录）
func (s *ServiceImpl) DeleteService(sid string) error {
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 删除客户端实例
	if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
		// 在删除前先获取隧道数据库ID，用于清理分组关系和文件日志
		var clientTunnelID int64
		if err := s.db.Raw(`SELECT id FROM tunnels WHERE instance_id = ?`, *service.ClientInstanceId).Scan(&clientTunnelID).Error; err == nil && clientTunnelID > 0 {
			// 清理隧道分组关联
			if err := s.db.Exec("DELETE FROM tunnel_groups WHERE tunnel_id = ?", clientTunnelID).Error; err != nil {
				// 只记录警告，不影响删除流程
			}
		}

		// 使用 DeleteTunnelAndWait 代替直接调用 nodepass.DeleteInstance
		// 这样可以等待SSE推送自动更新数据库，如果超时则强制删除
		if err := s.tunnelService.DeleteTunnelAndWait(*service.ClientInstanceId, 3*time.Second, false); err != nil {
			// 兼容处理：如果隧道已经不存在（可能已从实例管理删除），不应报错
			if err.Error() == "隧道不存在" {
				log.Warnf("[Service] 客户端实例不存在，可能已被删除: instanceID=%s, endpointID=%d", *service.ClientInstanceId, *service.ClientEndpointId)
			} else {
				return fmt.Errorf("删除客户端实例失败: %w", err)
			}
		}

		// 清理文件日志（即使隧道记录不存在，文件日志可能还在）
		if s.sseManager != nil && s.sseManager.GetFileLogger() != nil && service.ClientEndpointId != nil {
			if err := s.sseManager.GetFileLogger().ClearLogs(*service.ClientEndpointId, *service.ClientInstanceId); err != nil {
				// 只记录警告，不影响删除流程
			}
		}
	}

	// 删除服务端实例（如果存在）
	if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
		// 在删除前先获取隧道数据库ID，用于清理分组关系和文件日志
		var serverTunnelID int64
		if err := s.db.Raw(`SELECT id FROM tunnels WHERE instance_id = ?`, *service.ServerInstanceId).Scan(&serverTunnelID).Error; err == nil && serverTunnelID > 0 {
			// 清理隧道分组关联
			if err := s.db.Exec("DELETE FROM tunnel_groups WHERE tunnel_id = ?", serverTunnelID).Error; err != nil {
				// 只记录警告，不影响删除流程
			}
		}

		// 使用 DeleteTunnelAndWait 代替直接调用 nodepass.DeleteInstance
		if err := s.tunnelService.DeleteTunnelAndWait(*service.ServerInstanceId, 3*time.Second, false); err != nil {
			// 兼容处理：如果隧道已经不存在（可能已从实例管理删除），不应报错
			if err.Error() == "隧道不存在" {
				log.Warnf("[Service] 服务端实例不存在，可能已被删除: instanceID=%s, endpointID=%d", *service.ServerInstanceId, *service.ServerEndpointId)
			} else {
				return fmt.Errorf("删除服务端实例失败: %w", err)
			}
		}

		// 清理文件日志（即使隧道记录不存在，文件日志可能还在）
		if s.sseManager != nil && s.sseManager.GetFileLogger() != nil && service.ServerEndpointId != nil {
			if err := s.sseManager.GetFileLogger().ClearLogs(*service.ServerEndpointId, *service.ServerInstanceId); err != nil {
				// 只记录警告，不影响删除流程
			}
		}
	}

	// 删除服务记录
	if err := s.db.Where("sid = ?", sid).Delete(&models.Services{}).Error; err != nil {
		return fmt.Errorf("删除服务记录失败: %w", err)
	}

	return nil
}

// RenameService 重命名服务（修改 client 和 server 的 peer.alias）
func (s *ServiceImpl) RenameService(sid, newName string) error {
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 创建只包含 alias 的 peer 对象（保持其他字段不变）
	peer := &models.Peer{
		SID:   &service.Sid,
		Type:  &service.Type,
		Alias: &newName,
	}

	// 更新客户端实例的 peer.alias
	if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
		if _, err := nodepass.UpdateInstancePeers(*service.ClientEndpointId, *service.ClientInstanceId, peer); err != nil {
			return fmt.Errorf("更新客户端实例peer信息失败: %w", err)
		}

		// 更新数据库中客户端隧道的 peer 字段
		// 使用 Updates 而不是 Update，以正确触发 JSON 序列化
		if peerJSON, err := json.Marshal(peer); err == nil {
			if err := s.db.Model(&models.Tunnel{}).
				Where("instance_id = ?", *service.ClientInstanceId).
				Updates(map[string]interface{}{"peer": string(peerJSON)}).Error; err != nil {
				return fmt.Errorf("更新客户端隧道peer字段失败: %w", err)
			}
		}

	}

	// 更新服务端实例的 peer.alias（如果存在）
	if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
		if _, err := nodepass.UpdateInstancePeers(*service.ServerEndpointId, *service.ServerInstanceId, peer); err != nil {
			return fmt.Errorf("更新服务端实例peer信息失败: %w", err)
		}

		// 更新数据库中服务端隧道的 peer 字段
		if peerJSON, err := json.Marshal(peer); err == nil {
			if err := s.db.Model(&models.Tunnel{}).
				Where("instance_id = ?", *service.ServerInstanceId).
				Updates(map[string]interface{}{"peer": string(peerJSON)}).Error; err != nil {
				return fmt.Errorf("更新服务端隧道peer字段失败: %w", err)
			}
		}
	}

	// 更新服务记录中的别名
	if err := s.db.Model(&models.Services{}).
		Where("sid = ? ", sid).
		Update("alias", newName).Error; err != nil {
		return fmt.Errorf("更新服务别名失败: %w", err)
	}

	return nil
}

// DissolveService 解散服务（清空 peer 信息，删除服务但不删除实例）
func (s *ServiceImpl) DissolveService(sid string) error {
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 清空 peer 信息（设置为空对象）
	empty := ""
	emptyPeer := &models.Peer{
		SID:   &empty,
		Type:  &empty,
		Alias: &empty,
	}

	// 清空客户端实例的 peer 信息
	if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
		if _, err := nodepass.UpdateInstancePeers(*service.ClientEndpointId, *service.ClientInstanceId, emptyPeer); err != nil {
			return fmt.Errorf("清空客户端实例peer信息失败: %w", err)
		}

		// 清空数据库中客户端隧道的 peer 字段
		// 使用 Updates 而不是 Update，以正确触发 JSON 序列化
		if peerJSON, err := json.Marshal(emptyPeer); err == nil {
			if err := s.db.Model(&models.Tunnel{}).
				Where("instance_id = ?", *service.ClientInstanceId).
				Updates(map[string]interface{}{"peer": string(peerJSON)}).Error; err != nil {
				return fmt.Errorf("清空客户端隧道peer字段失败: %w", err)
			}
		}
	}

	// 清空服务端实例的 peer 信息（如果存在）
	if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
		if _, err := nodepass.UpdateInstancePeers(*service.ServerEndpointId, *service.ServerInstanceId, emptyPeer); err != nil {
			return fmt.Errorf("清空服务端实例peer信息失败: %w", err)
		}

		// 清空数据库中服务端隧道的 peer 字段
		// 使用 Updates 而不是 Update，以正确触发 JSON 序列化
		if peerJSON, err := json.Marshal(emptyPeer); err == nil {
			if err := s.db.Model(&models.Tunnel{}).
				Where("instance_id = ?", *service.ServerInstanceId).
				Updates(map[string]interface{}{"peer": string(peerJSON)}).Error; err != nil {
				return fmt.Errorf("清空服务端隧道peer字段失败: %w", err)
			}
		}
	}

	// 删除服务记录（但不删除实例）
	if err := s.db.Where("sid = ?", sid).Delete(&models.Services{}).Error; err != nil {
		return fmt.Errorf("删除服务记录失败: %w", err)
	}

	return nil
}

// SyncService 同步服务（更新服务的流量统计等信息）
func (s *ServiceImpl) SyncService(sid string) error {
	// 获取服务信息
	service, err := s.GetServiceByID(sid)
	if err != nil {
		return fmt.Errorf("获取服务失败: %w", err)
	}

	// 根据 service.Type 查询并更新服务信息
	switch service.Type {
	case "0":
		// type=0: 单端转发，只有 client 端
		if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
			if err := s.syncServiceFromTunnel(sid, service.Type, *service.ClientInstanceId, *service.ClientEndpointId); err != nil {
				return fmt.Errorf("同步客户端实例失败: %w", err)
			}
		}
	case "1", "2":
		// type=1/2: NAT穿透/隧道转发，有 client 和 server 两端
		// 同步 client 端
		if service.ClientInstanceId != nil && service.ClientEndpointId != nil {
			if err := s.syncServiceFromTunnel(sid, service.Type, *service.ClientInstanceId, *service.ClientEndpointId); err != nil {
				return fmt.Errorf("同步客户端实例失败: %w", err)
			}
		}
		// 同步 server 端
		if service.ServerInstanceId != nil && service.ServerEndpointId != nil {
			if err := s.syncServiceFromTunnel(sid, service.Type, *service.ServerInstanceId, *service.ServerEndpointId); err != nil {
				return fmt.Errorf("同步服务端实例失败: %w", err)
			}
		}
	}

	return nil
}

// syncServiceFromTunnel 从 tunnel 同步服务信息（类似 upsertService 的逻辑）
func (s *ServiceImpl) syncServiceFromTunnel(sid, serviceType, instanceID string, endpointID int64) error {
	// 查询 tunnel
	var tunnel models.Tunnel
	if err := s.db.Where("instance_id = ? AND endpoint_id = ?", instanceID, endpointID).First(&tunnel).Error; err != nil {
		return fmt.Errorf("查询隧道失败: %w", err)
	}

	// 构建 service 更新对象
	service := models.Services{
		Sid:  sid,
		Type: serviceType,
	}

	// 根据 tunnel.Peer 获取别名
	if tunnel.Peer != nil && tunnel.Peer.Alias != nil {
		service.Alias = tunnel.Peer.Alias
	}

	// 根据 serviceType 设置不同的字段
	var updateColumns []string

	switch serviceType {
	case "0":
		if tunnel.Type == models.TunnelModeServer {
			return fmt.Errorf("服务 SID=%s 的 Type 为 0，但 tunnel 类型为 %s", sid, tunnel.Type)
		}
		service.ClientInstanceId = &instanceID
		service.ClientEndpointId = &endpointID
		service.ExitHost = &tunnel.TargetAddress
		service.ExitPort = &tunnel.TargetPort
		service.EntranceHost = &tunnel.TunnelAddress
		service.EntrancePort = &tunnel.TunnelPort

		// type=0: 直接 TCP+UDP 相加（单端转发，只有 client 端）
		service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
		service.TotalTx = tunnel.TCPTx + tunnel.UDPTx

		updateColumns = []string{"alias", "client_instance_id", "client_endpoint_id", "exit_host", "exit_port", "entrance_host", "entrance_port", "total_rx", "total_tx"}

	case "1":
		if tunnel.Type == models.TunnelModeServer {
			service.ServerInstanceId = &instanceID
			service.ServerEndpointId = &endpointID
			service.EntranceHost = &tunnel.TargetAddress
			service.EntrancePort = &tunnel.TargetPort
			service.TunnelPort = &tunnel.TunnelPort

			// 查询并填充 tunnelEndpointName
			var endpoint models.Endpoint
			if err := s.db.First(&endpoint, endpointID).Error; err == nil {
				service.TunnelEndpointName = &endpoint.Name
				if service.EntranceHost == nil || *service.EntranceHost == "" {
					service.EntranceHost = &endpoint.IP
				}
			}

			// type=1 server端: 查询 client 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 client 端流量
			var clientTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", sid, serviceType, models.TunnelModeClient).First(&clientTunnel).Error; err == nil {
				service.TotalRx += clientTunnel.TCPRx + clientTunnel.UDPRx
				service.TotalTx += clientTunnel.TCPTx + clientTunnel.UDPTx
			}

			updateColumns = []string{"alias", "server_instance_id", "server_endpoint_id", "tunnel_port", "tunnel_endpoint_name", "entrance_host", "entrance_port", "total_rx", "total_tx"}

		} else {
			service.ClientInstanceId = &instanceID
			service.ClientEndpointId = &endpointID
			service.ExitHost = &tunnel.TargetAddress
			service.ExitPort = &tunnel.TargetPort

			// type=1 client端: 查询 server 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 server 端流量
			var serverTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", sid, serviceType, models.TunnelModeServer).First(&serverTunnel).Error; err == nil {
				service.TotalRx += serverTunnel.TCPRx + serverTunnel.UDPRx
				service.TotalTx += serverTunnel.TCPTx + serverTunnel.UDPTx
			}

			updateColumns = []string{"alias", "client_instance_id", "client_endpoint_id", "exit_host", "exit_port", "total_rx", "total_tx"}
		}

	case "2":
		if tunnel.Type == models.TunnelModeServer {
			service.ServerInstanceId = &instanceID
			service.ServerEndpointId = &endpointID
			service.EntranceHost = &tunnel.TargetAddress
			service.EntrancePort = &tunnel.TargetPort
			service.TunnelPort = &tunnel.TunnelPort

			// 查询并填充 tunnelEndpointName
			var endpoint models.Endpoint
			if err := s.db.First(&endpoint, endpointID).Error; err == nil {
				service.TunnelEndpointName = &endpoint.Name
				if service.EntranceHost == nil || *service.EntranceHost == "" {
					service.EntranceHost = &endpoint.IP
				}
			}

			// type=2 server端: 查询 client 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 client 端流量
			var clientTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", sid, serviceType, models.TunnelModeClient).First(&clientTunnel).Error; err == nil {
				service.TotalRx += clientTunnel.TCPRx + clientTunnel.UDPRx
				service.TotalTx += clientTunnel.TCPTx + clientTunnel.UDPTx
			}

			updateColumns = []string{"alias", "server_instance_id", "server_endpoint_id", "tunnel_port", "tunnel_endpoint_name", "entrance_host", "entrance_port", "total_rx", "total_tx"}

		} else {
			service.ClientInstanceId = &instanceID
			service.ClientEndpointId = &endpointID
			service.ExitHost = &tunnel.TargetAddress
			service.ExitPort = &tunnel.TargetPort

			// type=2 client端: 查询 server 端的流量数据，相加
			service.TotalRx = tunnel.TCPRx + tunnel.UDPRx
			service.TotalTx = tunnel.TCPTx + tunnel.UDPTx
			// 查询 server 端流量
			var serverTunnel models.Tunnel
			if err := s.db.Where("peer->>'$.sid' = ? AND peer->>'$.type' = ? AND type = ?", sid, serviceType, models.TunnelModeServer).First(&serverTunnel).Error; err == nil {
				service.TotalRx += serverTunnel.TCPRx + serverTunnel.UDPRx
				service.TotalTx += serverTunnel.TCPTx + serverTunnel.UDPTx
			}

			updateColumns = []string{"alias", "client_instance_id", "client_endpoint_id", "exit_host", "exit_port", "total_rx", "total_tx"}
		}
	}

	// 更新数据库
	if err := s.db.Model(&models.Services{}).
		Where("sid = ? AND type = ?", sid, serviceType).
		Select(updateColumns).
		Updates(&service).Error; err != nil {
		return fmt.Errorf("更新服务记录失败: %w", err)
	}

	return nil
}
