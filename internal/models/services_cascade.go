package models

import (
	"gorm.io/gorm"
)

// CleanupServicesForInstance 在隧道实例被删除后，清理 services 表里指向它的引用。
// - 找出所有 server_*=instance 或 client_*=instance 的 service 行
// - 把匹配的那一侧字段置空
// - 如果两侧都没了，整行删掉，避免留下完全悬空的 service 记录
//
// 传入 db 既可以是普通 *gorm.DB，也可以是事务 tx，调用方自行决定上下文。
func CleanupServicesForInstance(db *gorm.DB, endpointID int64, instanceID string) error {
	if db == nil || instanceID == "" {
		return nil
	}

	var rows []Services
	if err := db.
		Where("(server_instance_id = ? AND server_endpoint_id = ?) OR (client_instance_id = ? AND client_endpoint_id = ?)",
			instanceID, endpointID, instanceID, endpointID).
		Find(&rows).Error; err != nil {
		return err
	}

	for _, svc := range rows {
		serverMatch := svc.ServerInstanceId != nil && *svc.ServerInstanceId == instanceID &&
			svc.ServerEndpointId != nil && *svc.ServerEndpointId == endpointID
		clientMatch := svc.ClientInstanceId != nil && *svc.ClientInstanceId == instanceID &&
			svc.ClientEndpointId != nil && *svc.ClientEndpointId == endpointID

		// 清理后剩余的另一侧是否还在
		remainingServer := !serverMatch && svc.ServerInstanceId != nil && *svc.ServerInstanceId != ""
		remainingClient := !clientMatch && svc.ClientInstanceId != nil && *svc.ClientInstanceId != ""

		if !remainingServer && !remainingClient {
			// 两侧都空，整条删除
			if err := db.Where("sid = ? AND type = ?", svc.Sid, svc.Type).
				Delete(&Services{}).Error; err != nil {
				return err
			}
			continue
		}

		updates := map[string]interface{}{}
		if serverMatch {
			updates["server_instance_id"] = nil
			updates["server_endpoint_id"] = nil
		}
		if clientMatch {
			updates["client_instance_id"] = nil
			updates["client_endpoint_id"] = nil
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.Model(&Services{}).
			Where("sid = ? AND type = ?", svc.Sid, svc.Type).
			Updates(updates).Error; err != nil {
			return err
		}
	}

	// 与隧道一起，把 tunnels.service_sid / peer 引用也同步清掉，避免列表里出现指向死服务的隧道
	_ = db.Model(&Tunnel{}).
		Where("endpoint_id = ? AND instance_id = ?", endpointID, instanceID).
		Updates(map[string]interface{}{
			"service_sid": nil,
		}).Error

	return nil
}

// CleanupServicesForEndpoint 在整个端点被删除时一次性清理。
// 任何一侧指向该 endpoint 的 service 都按 CleanupServicesForInstance 的语义处理：
// 匹配那一侧置空；两侧都空就删整行。
func CleanupServicesForEndpoint(db *gorm.DB, endpointID int64) error {
	if db == nil {
		return nil
	}

	var rows []Services
	if err := db.
		Where("server_endpoint_id = ? OR client_endpoint_id = ?", endpointID, endpointID).
		Find(&rows).Error; err != nil {
		return err
	}

	for _, svc := range rows {
		serverMatch := svc.ServerEndpointId != nil && *svc.ServerEndpointId == endpointID
		clientMatch := svc.ClientEndpointId != nil && *svc.ClientEndpointId == endpointID

		remainingServer := !serverMatch && svc.ServerInstanceId != nil && *svc.ServerInstanceId != ""
		remainingClient := !clientMatch && svc.ClientInstanceId != nil && *svc.ClientInstanceId != ""

		if !remainingServer && !remainingClient {
			if err := db.Where("sid = ? AND type = ?", svc.Sid, svc.Type).
				Delete(&Services{}).Error; err != nil {
				return err
			}
			continue
		}

		updates := map[string]interface{}{}
		if serverMatch {
			updates["server_instance_id"] = nil
			updates["server_endpoint_id"] = nil
		}
		if clientMatch {
			updates["client_instance_id"] = nil
			updates["client_endpoint_id"] = nil
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.Model(&Services{}).
			Where("sid = ? AND type = ?", svc.Sid, svc.Type).
			Updates(updates).Error; err != nil {
			return err
		}
	}
	return nil
}

// RelinkServiceForInstance 导入新实例并设置完 peer 后立刻调用，让 services 表的对应那侧
// （根据 tunnelType）指到新 (endpointID, instanceID)，不再依赖 SSE 时序。
//
// - sid / peerType: 对应 services 表的 (sid, type) 复合主键；从备份的 Peer 字段里拿
// - tunnelType: "server" 或 "client"，决定更新 service 的哪一侧
// - 如果服务还不存在，什么都不做；首个 SSE 事件到达时 upsertService 会负责创建
func RelinkServiceForInstance(db *gorm.DB, sid string, peerType string, tunnelType TunnelType, endpointID int64, instanceID string) error {
	if db == nil || sid == "" || peerType == "" || instanceID == "" {
		return nil
	}

	var svc Services
	err := db.Where("sid = ? AND type = ?", sid, peerType).First(&svc).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil
		}
		return err
	}

	updates := map[string]interface{}{}
	switch tunnelType {
	case TunnelModeServer:
		updates["server_instance_id"] = instanceID
		updates["server_endpoint_id"] = endpointID
	case TunnelModeClient:
		updates["client_instance_id"] = instanceID
		updates["client_endpoint_id"] = endpointID
	default:
		return nil
	}

	return db.Model(&Services{}).
		Where("sid = ? AND type = ?", sid, peerType).
		Updates(updates).Error
}
