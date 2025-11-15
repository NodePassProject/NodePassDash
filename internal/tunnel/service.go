package tunnel

import (
	"NodePassDash/internal/db"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Service 隧道管理服务
type Service struct {
	db *gorm.DB
}

// OperationLog 操作日志结构
type OperationLog struct {
	ID         int64          `json:"id"`
	TunnelID   sql.NullInt64  `json:"tunnelId,omitempty"`
	TunnelName string         `json:"tunnelName"`
	Action     string         `json:"action"`
	Status     string         `json:"status"`
	Message    sql.NullString `json:"message,omitempty"`
	CreatedAt  time.Time      `json:"createdAt"`
}

// NewService 创建隧道服务实例
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// GetTunnels 获取所有隧道列表 (GORM版本)
func (s *Service) GetTunnels() ([]TunnelWithStats, error) {
	// 临时解决方案：使用原生SQL查询直到完全迁移完成
	sqlDB, err := s.db.DB()
	if err != nil {
		return nil, err
	}

	query := `
		SELECT
			t.id, t.name, t.endpoint_id, t.type,
			t.tunnel_address, t.tunnel_port, t.target_address, t.target_port,
			t.status, t.instance_id,
			t.tcp_rx + t.udp_rx as total_rx,
			t.tcp_tx + t.udp_tx as total_tx,
			e.name AS endpoint_name,
			COALESCE(e.ver, '') as version
		FROM tunnels t
		LEFT JOIN endpoints e ON t.endpoint_id = e.id
		ORDER BY t.created_at DESC
	`

	rows, err := sqlDB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tunnels []TunnelWithStats
	for rows.Next() {
		var t TunnelWithStats
		var typeStr, statusStr string
		var instanceID sql.NullString
		var endpointNameNS sql.NullString
		var version string

		err := rows.Scan(
			&t.ID, &t.Name, &t.EndpointID, &typeStr,
			&t.TunnelAddress, &t.TunnelPort, &t.TargetAddress, &t.TargetPort,
			&statusStr, &instanceID,
			&t.TotalRx, &t.TotalTx,
			&endpointNameNS,
			&version,
		)
		if err != nil {
			return nil, err
		}

		// 处理NULL值
		if instanceID.Valid {
			t.InstanceID = &instanceID.String
		}
		if endpointNameNS.Valid {
			t.EndpointName = endpointNameNS.String
		}

		t.Type = TunnelType(typeStr)
		t.Status = TunnelStatus(statusStr)
		t.EndpointVersion = version

		tunnels = append(tunnels, t)
	}

	// 确保返回空数组而不是nil
	if tunnels == nil {
		tunnels = []TunnelWithStats{}
	}

	return tunnels, nil
}

// CreateTunnel 创建新隧道
func (s *Service) CreateTunnel(req CreateTunnelRequest) (*Tunnel, error) {
	log.Infof("[API] 创建隧道: %v", req.Name)

	// 1. 检查端点是否存在
	var endpoint models.Endpoint
	if err := s.db.Where("id = ?", req.EndpointID).First(&endpoint).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New("指定的端点不存在")
		}
		return nil, err
	}

	// 2. 构建命令行
	var commandLine string
	if req.Password != "" {
		commandLine = fmt.Sprintf("%s://%s@%s:%d/%s:%d",
			req.Type, // 修复：使用Type作为隧道类型
			req.Password,
			req.TunnelAddress,
			req.TunnelPort,
			req.TargetAddress,
			req.TargetPort,
		)
	} else {
		commandLine = fmt.Sprintf("%s://%s:%d/%s:%d",
			req.Type, // 修复：使用Type作为隧道类型
			req.TunnelAddress,
			req.TunnelPort,
			req.TargetAddress,
			req.TargetPort,
		)
	}

	log.Infof("[API] 构建的命令行: %s", commandLine)

	// 3. 添加查询参数
	var queryParams []string

	if req.LogLevel != LogLevelInherit && req.LogLevel != "" {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", req.LogLevel))
	}

	if req.Type == "server" && req.TLSMode != TLSModeInherit && req.TLSMode != "" {
		var tlsModeNum string
		switch req.TLSMode {
		case TLS0:
			tlsModeNum = "0"
		case TLS1:
			tlsModeNum = "1"
		case TLS2:
			tlsModeNum = "2"
		}
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsModeNum))

		if req.TLSMode == TLS2 && req.CertPath != "" && req.KeyPath != "" {
			queryParams = append(queryParams,
				fmt.Sprintf("crt=%s", url.QueryEscape(req.CertPath)),
				fmt.Sprintf("key=%s", url.QueryEscape(req.KeyPath)),
			)
		}
	}

	if req.Type == "client" {
		if req.Min != nil {
			queryParams = append(queryParams, fmt.Sprintf("min=%d", *req.Min))
		}
	}
	// Max 参数对服务端和客户端都适用
	if req.Max != nil {
		queryParams = append(queryParams, fmt.Sprintf("max=%d", *req.Max))
	}

	// 添加新的字段到命令行
	if req.Mode != nil {
		queryParams = append(queryParams, fmt.Sprintf("mode=%s", *req.Mode))
	}
	if req.Read != nil {
		queryParams = append(queryParams, fmt.Sprintf("read=%s", *req.Read))
	}
	if req.Rate != nil {
		queryParams = append(queryParams, fmt.Sprintf("rate=%d", *req.Rate))
	}

	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	// 4. 使用 NodePass 客户端创建实例
	response, err := nodepass.CreateInstance(endpoint.ID, commandLine)
	if err != nil {
		log.Errorf("[NodePass] 创建实例失败 endpoint=%d cmd=%s err=%v", req.EndpointID, commandLine, err)
		return nil, err
	}

	// 5. 在事务中处理数据库更新
	var tunnel *Tunnel
	err = db.TxWithRetry(func(tx *gorm.DB) error {
		// 检查是否已存在相同 endpointId+instanceId 的记录
		var existingTunnel models.Tunnel
		err := tx.Where("endpoint_id = ? AND instance_id = ?", req.EndpointID, response.ID).First(&existingTunnel).Error

		now := time.Now()
		var tunnelID int64

		if err == gorm.ErrRecordNotFound {
			// 创建新记录
			newTunnel := models.Tunnel{
				InstanceID:    &response.ID,
				Name:          req.Name,
				EndpointID:    req.EndpointID,
				Type:          models.TunnelType(req.Type),
				TunnelAddress: req.TunnelAddress,
				TunnelPort:    strconv.Itoa(req.TunnelPort),
				TargetAddress: req.TargetAddress,
				TargetPort:    strconv.Itoa(req.TargetPort),
				TLSMode:       models.TLSMode(req.TLSMode),
				LogLevel:      models.LogLevel(req.LogLevel),
				CommandLine:   commandLine,
				Restart:       &req.Restart,
				Status:        models.TunnelStatusRunning,
				CreatedAt:     now,
				UpdatedAt:     now,
			}

			// 处理可选字段
			if req.CertPath != "" {
				newTunnel.CertPath = &req.CertPath
			}
			if req.KeyPath != "" {
				newTunnel.KeyPath = &req.KeyPath
			}
			if req.Password != "" {
				newTunnel.Password = &req.Password
			}
			if req.Min != nil {
				minVal := int64(*req.Min)
				newTunnel.Min = &minVal
			}
			if req.Max != nil {
				maxVal := int64(*req.Max)
				newTunnel.Max = &maxVal
			}

			err = tx.Create(&newTunnel).Error
			if err != nil {
				return err
			}
			tunnelID = newTunnel.ID
		} else if err != nil {
			return err
		} else {
			// 已存在，仅更新名称
			err = tx.Model(&existingTunnel).Updates(map[string]interface{}{
				"name":       req.Name,
				"updated_at": now,
			}).Error
			if err != nil {
				return err
			}
			tunnelID = existingTunnel.ID
		}

		// 记录操作日志
		message := "隧道创建成功"
		operationLog := models.TunnelOperationLog{
			TunnelID:   &tunnelID,
			TunnelName: req.Name,
			Action:     models.OperationActionCreate,
			Status:     "success",
			Message:    &message,
			CreatedAt:  time.Now(),
		}
		if err := tx.Create(&operationLog).Error; err != nil {
			log.Errorf("[API] 记录操作日志失败: %v", err)
			// 不中断事务，只记录错误
		}

		// 构建返回的隧道对象
		tunnel = &Tunnel{
			ID:            tunnelID,
			InstanceID:    &response.ID,
			Name:          req.Name,
			EndpointID:    req.EndpointID,
			Type:          TunnelType(req.Type),
			Status:        TunnelStatus(response.Status),
			TunnelAddress: req.TunnelAddress,
			TunnelPort:    strconv.Itoa(req.TunnelPort),
			TargetAddress: req.TargetAddress,
			TargetPort:    strconv.Itoa(req.TargetPort),
			TLSMode:       req.TLSMode,
			LogLevel:      req.LogLevel,
			CommandLine:   commandLine,
			Restart:       &req.Restart,
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		// 处理可选字段
		if req.CertPath != "" {
			tunnel.CertPath = &req.CertPath
		}
		if req.KeyPath != "" {
			tunnel.KeyPath = &req.KeyPath
		}
		if req.Password != "" {
			tunnel.Password = &req.Password
		}
		if req.Min != nil {
			minVal := int64(*req.Min)
			tunnel.Min = &minVal
		}
		if req.Max != nil {
			maxVal := int64(*req.Max)
			tunnel.Max = &maxVal
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// 异步更新端点隧道计数（避免死锁）
	go func() {
		time.Sleep(100 * time.Millisecond) // 稍作延迟
		s.updateEndpointTunnelCount(req.EndpointID)
	}()

	// 设置隧道别名
	if err := s.SetTunnelAlias(tunnel.ID, tunnel.Name); err != nil {
		log.Warnf("[API] 设置隧道别名失败，但不影响创建: %v", err)
	}

	log.Infof("[API] 隧道创建成功: %s (ID: %d, InstanceID: %s)", tunnel.Name, tunnel.ID, *tunnel.InstanceID)
	return tunnel, nil
}

// DeleteTunnel 删除隧道
func (s *Service) DeleteTunnel(instanceID string) error {
	log.Infof("[API] 删除隧道: %v", instanceID)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("instance_id = ?", instanceID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	if err := nodepass.DeleteInstance(tunnelWithEndpoint.Endpoint.ID, instanceID); err != nil {
		// 如果收到401或404错误，说明NodePass核心已经没有这个实例了
		if strings.Contains(err.Error(), "NodePass API 返回错误: 401") || strings.Contains(err.Error(), "NodePass API 返回错误: 404") {
			log.Warnf("[API] NodePass API 返回401/404错误，实例 %s 可能已不存在，继续删除本地记录", instanceID)
		} else {
			log.Errorf("[API] NodePass API 删除失败: %v", err)
			return fmt.Errorf("NodePass API 删除失败: %v", err)
		}
	}

	// 先删除相关的操作日志记录，避免外键约束错误
	if err := s.db.Where("tunnel_id = ?", tunnelWithEndpoint.ID).Delete(&models.TunnelOperationLog{}).Error; err != nil {
		log.Warnf("[API] 删除隧道操作日志失败: tunnelID=%d, err=%v", tunnelWithEndpoint.ID, err)
	}

	// 使用GORM删除隧道记录
	result := s.db.Where("id = ?", tunnelWithEndpoint.ID).Delete(&models.Tunnel{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		// 如果删除影响行数为0，说明隧道可能已经被SSE推送先删除了
		// 这种情况算作删除成功，不返回错误
		log.Infof("[API] 隧道 %s 可能已被SSE推送先删除，算作删除成功", instanceID)
	}

	// 异步更新端点隧道计数（避免死锁）
	go func(endpointID int64) {
		time.Sleep(50 * time.Millisecond)
		s.updateEndpointTunnelCount(endpointID)
	}(tunnelWithEndpoint.EndpointID)

	return nil
}

// UpdateTunnelStatus 更新隧道状态
func (s *Service) UpdateTunnelStatus(instanceID string, status TunnelStatus) error {
	result := s.db.Model(&models.Tunnel{}).
		Where("instance_id = ?", instanceID).
		Updates(map[string]interface{}{
			"status":     models.TunnelStatus(status),
			"updated_at": time.Now(),
		})

	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("隧道不存在")
	}

	return nil
}

// ControlTunnel 控制隧道状态（启动/停止/重启）
func (s *Service) ControlTunnel(req TunnelActionRequest) error {
	log.Infof("[API] 控制隧道状态: %v => %v", req.InstanceID, req.Action)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("instance_id = ?", req.InstanceID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 调用 NodePass API
	if _, err = nodepass.ControlInstance(tunnelWithEndpoint.Endpoint.ID, req.InstanceID, req.Action); err != nil {
		return err
	}

	// 重启操作需要特殊处理：先监听stopped，再监听running
	if req.Action == "restart" {
		log.Infof("[API] 重启隧道 %s: 开始监听状态变化", req.InstanceID)

		// 第一阶段：等待状态变为 stopped（最多5秒）
		log.Infof("[API] 重启隧道 %s: 等待停止状态", req.InstanceID)
		stoppedDeadline := time.Now().Add(5 * time.Second)
		stoppedDetected := false

		for time.Now().Before(stoppedDeadline) {
			var tunnel models.Tunnel
			if err := s.db.Select("status").Where("instance_id = ?", req.InstanceID).First(&tunnel).Error; err == nil {
				if tunnel.Status == models.TunnelStatusStopped {
					log.Infof("[API] 重启隧道 %s: 检测到停止状态", req.InstanceID)
					stoppedDetected = true
					break
				}
			}
			time.Sleep(200 * time.Millisecond)
		}

		if !stoppedDetected {
			log.Warnf("[API] 重启隧道 %s: 未检测到停止状态，继续等待启动", req.InstanceID)
		}

		// 第二阶段：等待状态变为 running（最多5秒）
		log.Infof("[API] 重启隧道 %s: 等待运行状态", req.InstanceID)
		runningDeadline := time.Now().Add(5 * time.Second)
		runningDetected := false

		for time.Now().Before(runningDeadline) {
			var tunnel models.Tunnel
			if err := s.db.Select("status").Where("instance_id = ?", req.InstanceID).First(&tunnel).Error; err == nil {
				if tunnel.Status == models.TunnelStatusRunning {
					log.Infof("[API] 重启隧道 %s: 检测到运行状态，重启完成", req.InstanceID)
					runningDetected = true
					break
				}
			}
			time.Sleep(200 * time.Millisecond)
		}

		// 如果未检测到运行状态，手动更新
		if !runningDetected {
			log.Warnf("[API] 重启隧道 %s: 未检测到运行状态，手动更新状态", req.InstanceID)
			_ = s.UpdateTunnelStatus(req.InstanceID, StatusRunning)
		}

	} else {
		// start 和 stop 操作使用原有的简单轮询逻辑
		var targetStatus TunnelStatus
		switch req.Action {
		case "start":
			targetStatus = StatusRunning
		case "stop":
			targetStatus = StatusStopped
		default:
			targetStatus = "" // 不会发生，已验证
		}

		// 轮询数据库等待状态变更 (最多3秒)
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			var tunnel models.Tunnel
			if err := s.db.Select("status").Where("instance_id = ?", req.InstanceID).First(&tunnel).Error; err == nil {
				if tunnel.Status == models.TunnelStatus(targetStatus) {
					break // 成功
				}
			}
			time.Sleep(200 * time.Millisecond)
		}

		// 再次检查，若仍未到目标状态则手动更新
		var finalTunnel models.Tunnel
		_ = s.db.Select("status").Where("instance_id = ?", req.InstanceID).First(&finalTunnel).Error
		if finalTunnel.Status != models.TunnelStatus(targetStatus) {
			_ = s.UpdateTunnelStatus(req.InstanceID, targetStatus)
		}
	}

	// 记录操作日志
	controlMessage := fmt.Sprintf("隧道%s成功", req.Action)
	operationLog := models.TunnelOperationLog{
		TunnelID:   &tunnelWithEndpoint.ID,
		TunnelName: tunnelWithEndpoint.Name,
		Action:     models.OperationAction(req.Action),
		Status:     "success",
		Message:    &controlMessage,
		CreatedAt:  time.Now(),
	}
	err = s.db.Create(&operationLog).Error
	return err
}

// formatTrafficBytes 格式化流量数据
func formatTrafficBytes(bytes int64) string {
	const (
		_          = iota
		KB float64 = 1 << (10 * iota)
		MB
		GB
		TB
	)

	var size float64
	var unit string

	switch {
	case bytes >= int64(TB):
		size = float64(bytes) / TB
		unit = "TB"
	case bytes >= int64(GB):
		size = float64(bytes) / GB
		unit = "GB"
	case bytes >= int64(MB):
		size = float64(bytes) / MB
		unit = "MB"
	case bytes >= int64(KB):
		size = float64(bytes) / KB
		unit = "KB"
	default:
		size = float64(bytes)
		unit = "B"
	}

	return fmt.Sprintf("%.2f %s", size, unit)
}

// UpdateTunnel 更新隧道配置
func (s *Service) UpdateTunnel(req UpdateTunnelRequest) error {
	log.Infof("[API] 更新隧道: %v", req.ID)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("id = ?", req.ID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 检查instance_id是否存在
	if tunnelWithEndpoint.InstanceID == nil || *tunnelWithEndpoint.InstanceID == "" {
		return errors.New("隧道没有关联的实例ID")
	}

	// 准备更新字段
	updateFields := make(map[string]interface{})

	// 根据请求参数更新字段
	if req.Name != "" {
		tunnelWithEndpoint.Name = req.Name
		updateFields["name"] = req.Name
	}
	if req.TunnelAddress != "" {
		tunnelWithEndpoint.TunnelAddress = req.TunnelAddress
		updateFields["tunnel_address"] = req.TunnelAddress
	}
	if req.TunnelPort != 0 {
		tunnelPortStr := strconv.Itoa(req.TunnelPort)
		tunnelWithEndpoint.TunnelPort = tunnelPortStr
		updateFields["tunnel_port"] = tunnelPortStr
	}
	if req.TargetAddress != "" {
		tunnelWithEndpoint.TargetAddress = req.TargetAddress
		updateFields["target_address"] = req.TargetAddress
	}
	if req.TargetPort != 0 {
		targetPortStr := strconv.Itoa(req.TargetPort)
		tunnelWithEndpoint.TargetPort = targetPortStr
		updateFields["target_port"] = targetPortStr
	}
	if req.TLSMode != "" {
		tunnelWithEndpoint.TLSMode = models.TLSMode(req.TLSMode)
		updateFields["tls_mode"] = req.TLSMode
	}
	if req.CertPath != "" {
		tunnelWithEndpoint.CertPath = &req.CertPath
		updateFields["cert_path"] = req.CertPath
	}
	if req.KeyPath != "" {
		tunnelWithEndpoint.KeyPath = &req.KeyPath
		updateFields["key_path"] = req.KeyPath
	}
	if req.LogLevel != "" {
		tunnelWithEndpoint.LogLevel = models.LogLevel(req.LogLevel)
		updateFields["log_level"] = req.LogLevel
	}

	// 构建命令行
	tunnelPortInt, _ := strconv.Atoi(tunnelWithEndpoint.TunnelPort)
	targetPortInt, _ := strconv.Atoi(tunnelWithEndpoint.TargetPort)
	commandLine := fmt.Sprintf("%s://%s:%d/%s:%d",
		tunnelWithEndpoint.Type,
		tunnelWithEndpoint.TunnelAddress,
		tunnelPortInt,
		tunnelWithEndpoint.TargetAddress,
		targetPortInt,
	)

	// 添加查询参数
	var queryParams []string

	if tunnelWithEndpoint.LogLevel != models.LogLevelInherit && tunnelWithEndpoint.LogLevel != "" {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", tunnelWithEndpoint.LogLevel))
	}

	if tunnelWithEndpoint.Type == models.TunnelModeServer && tunnelWithEndpoint.TLSMode != models.TLSModeInherit && tunnelWithEndpoint.TLSMode != "" {
		var tlsModeNum string
		switch tunnelWithEndpoint.TLSMode {
		case models.TLS0:
			tlsModeNum = "0"
		case models.TLS1:
			tlsModeNum = "1"
		case models.TLS2:
			tlsModeNum = "2"
		}
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsModeNum))

		if tunnelWithEndpoint.TLSMode == models.TLS2 &&
			tunnelWithEndpoint.CertPath != nil && *tunnelWithEndpoint.CertPath != "" &&
			tunnelWithEndpoint.KeyPath != nil && *tunnelWithEndpoint.KeyPath != "" {
			queryParams = append(queryParams,
				fmt.Sprintf("crt=%s", url.QueryEscape(*tunnelWithEndpoint.CertPath)),
				fmt.Sprintf("key=%s", url.QueryEscape(*tunnelWithEndpoint.KeyPath)),
			)
		}
	}

	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	// 更新commandLine到字段
	updateFields["command_line"] = commandLine
	updateFields["updated_at"] = time.Now()

	// 使用GORM更新数据库
	err = s.db.Model(&tunnelWithEndpoint).Updates(updateFields).Error
	if err != nil {
		return err
	}

	// 调用 NodePass API 更新隧道实例
	if _, err := nodepass.UpdateInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, commandLine); err != nil {
		// 若远端未实现新版接口(如返回405 Method Not Allowed)，回退旧版接口
		if strings.Contains(err.Error(), "405") {
			if _, err2 := nodepass.UpdateInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, commandLine); err2 != nil {
				return err2
			}
		} else {
			return err
		}
	}

	return nil
}

// GetOperationLogs 获取最近 limit 条隧道操作日志
func (s *Service) GetOperationLogs(limit int) ([]OperationLog, error) {
	if limit <= 0 {
		limit = 50
	}

	var logs []models.TunnelOperationLog
	err := s.db.Order("created_at DESC").Limit(limit).Find(&logs).Error
	if err != nil {
		return nil, err
	}

	// 转换为OperationLog类型
	result := make([]OperationLog, len(logs))
	for i, log := range logs {
		// 转换TunnelID类型
		var tunnelID sql.NullInt64
		if log.TunnelID != nil {
			tunnelID = sql.NullInt64{Int64: *log.TunnelID, Valid: true}
		}

		// 转换Message类型
		var message sql.NullString
		if log.Message != nil {
			message = sql.NullString{String: *log.Message, Valid: true}
		}

		result[i] = OperationLog{
			ID:         log.ID,
			TunnelID:   tunnelID,
			TunnelName: log.TunnelName,
			Action:     string(log.Action),
			Status:     log.Status,
			Message:    message,
			CreatedAt:  log.CreatedAt,
		}
	}

	// 确保返回空数组而不是nil
	if result == nil {
		result = []OperationLog{}
	}

	return result, nil
}

// GetInstanceIDByTunnelID 根据隧道数据库ID获取对应的实例ID (instanceId)
func (s *Service) GetInstanceIDByTunnelID(id int64) (string, error) {
	var tunnel models.Tunnel
	err := s.db.Select("instance_id").Where("id = ?", id).First(&tunnel).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return "", errors.New("隧道不存在")
		}
		return "", err
	}
	if tunnel.InstanceID == nil || *tunnel.InstanceID == "" {
		return "", errors.New("隧道没有关联的实例ID")
	}
	return *tunnel.InstanceID, nil
}

// GetEndpointIDByTunnelID 根据隧道数据库ID获取对应的端点ID
func (s *Service) GetEndpointIDByTunnelID(id int64) (int64, error) {
	var tunnel models.Tunnel
	err := s.db.Select("endpoint_id").Where("id = ?", id).First(&tunnel).Error
	if err != nil {
		return 0, err
	}
	return tunnel.EndpointID, nil
}

// GetEndpointIDByInstanceID 根据实例ID获取对应的端点ID
func (s *Service) GetEndpointIDByInstanceID(instanceID string) (int64, error) {
	var tunnel models.Tunnel
	err := s.db.Select("endpoint_id").Where("instance_id = ?", instanceID).First(&tunnel).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, errors.New("实例不存在")
		}
		return 0, err
	}
	return tunnel.EndpointID, nil
}

// GetTunnelNameByID 根据隧道数据库ID获取隧道名称
func (s *Service) GetTunnelNameByID(id int64) (string, error) {
	var tunnel models.Tunnel
	err := s.db.Select("name").Where("id = ?", id).First(&tunnel).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return "", errors.New("隧道不存在")
		}
		return "", err
	}
	return tunnel.Name, nil
}

// DeleteTunnelAndWait 触发远端删除后等待数据库记录被移除
// 该方法不会主动删除本地记录，而是假设有其它进程 (如 SSE 监听) 负责删除
// timeout 为等待的最长时长
func (s *Service) DeleteTunnelAndWait(instanceID string, timeout time.Duration, recycle bool) error {
	log.Infof("[API] 删除隧道: %v", instanceID)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("instance_id = ?", instanceID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 调用 NodePass API 删除实例
	if err := nodepass.DeleteInstance(tunnelWithEndpoint.Endpoint.ID, instanceID); err != nil {
		// 如果收到401或404错误，说明NodePass核心已经没有这个实例了，按删除成功处理
		if strings.Contains(err.Error(), "NodePass API 返回错误: 401") || strings.Contains(err.Error(), "NodePass API 返回错误: 404") {
			log.Warnf("[API] NodePass API 返回401/404错误，实例 %s 可能已不存在，继续删除本地记录", instanceID)
		} else {
			return err
		}
	}

	// 轮询等待数据库记录被删除
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var count int64
		if err := s.db.Model(&models.Tunnel{}).Where("instance_id = ?", instanceID).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			return nil // 删除完成
		}
		time.Sleep(200 * time.Millisecond)
	}

	// 超时仍未删除，执行本地强制删除并刷新计数
	log.Warnf("[API] 等待删除超时，执行本地删除: %v", instanceID)

	// 先删除相关的操作日志记录，避免外键约束错误
	if err := s.db.Where("tunnel_id = ?", tunnelWithEndpoint.ID).Delete(&models.TunnelOperationLog{}).Error; err != nil {
		log.Warnf("[API] 删除隧道操作日志失败: tunnelID=%d, err=%v", tunnelWithEndpoint.ID, err)
	}

	// 删除隧道记录
	result := s.db.Where("id = ?", tunnelWithEndpoint.ID).Delete(&models.Tunnel{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		// 如果删除影响行数为0，说明隧道可能已经被SSE推送先删除了
		// 这种情况算作删除成功，不返回错误
		log.Infof("[API] 隧道 %s 可能已被SSE推送先删除，算作删除成功", instanceID)
		return nil
	}

	if !recycle {
		s.db.Where("instance_id = ?", instanceID).Delete(&models.EndpointSSE{})
	}

	// 异步更新端点隧道计数（避免死锁）
	go func(endpointID int64) {
		time.Sleep(50 * time.Millisecond)
		s.updateEndpointTunnelCount(endpointID)
	}(tunnelWithEndpoint.EndpointID)

	// 写入操作日志
	timeoutMessage := "远端删除超时，本地强制删除"
	operationLog := models.TunnelOperationLog{
		TunnelID:   &tunnelWithEndpoint.ID,
		TunnelName: tunnelWithEndpoint.Name,
		Action:     models.OperationActionDelete,
		Status:     "success",
		Message:    &timeoutMessage,
		CreatedAt:  time.Now(),
	}
	s.db.Create(&operationLog)

	return nil
}

// CreateTunnelAndWait 先调用 NodePass API 创建隧道，等待 SSE 通知数据库记录后更新名称
// 如果等待超时，则回退到原来的手动创建逻辑
func (s *Service) CreateTunnelAndWait(req CreateTunnelRequest, timeout time.Duration) (*Tunnel, error) {
	log.Infof("[API] 创建隧道（等待模式）: %v", req.Name)

	// 使用GORM检查端点是否存在
	var endpoint models.Endpoint
	err := s.db.Where("id = ?", req.EndpointID).First(&endpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New("指定的端点不存在")
		}
		return nil, err
	}

	// 构建命令行（复用原有逻辑）
	var commandLine string
	if req.Password != "" {
		commandLine = fmt.Sprintf("%s://%s@%s:%d/%s:%d",
			req.Type, // 修复：使用Type作为隧道类型
			req.Password,
			req.TunnelAddress,
			req.TunnelPort,
			req.TargetAddress,
			req.TargetPort,
		)
	} else {
		commandLine = fmt.Sprintf("%s://%s:%d/%s:%d",
			req.Type, // 修复：使用Type作为隧道类型
			req.TunnelAddress,
			req.TunnelPort,
			req.TargetAddress,
			req.TargetPort,
		)
	}

	// 添加查询参数
	var queryParams []string
	if req.LogLevel != LogLevelInherit && req.LogLevel != "" {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", req.LogLevel))
	}
	if req.Type == "server" && req.TLSMode != TLSModeInherit && req.TLSMode != "" {
		var tlsModeNum string
		switch req.TLSMode {
		case TLS0:
			tlsModeNum = "0"
		case TLS1:
			tlsModeNum = "1"
		case TLS2:
			tlsModeNum = "2"
		}
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", tlsModeNum))

		if req.TLSMode == TLS2 && req.CertPath != "" && req.KeyPath != "" {
			queryParams = append(queryParams,
				fmt.Sprintf("crt=%s", url.QueryEscape(req.CertPath)),
				fmt.Sprintf("key=%s", url.QueryEscape(req.KeyPath)),
			)
		}
	}
	if req.Type == "client" {
		if req.Min != nil {
			queryParams = append(queryParams, fmt.Sprintf("min=%d", *req.Min))
		}
	}
	// Max 参数对服务端和客户端都适用
	if req.Max != nil {
		queryParams = append(queryParams, fmt.Sprintf("max=%d", *req.Max))
	}
	// 添加新的字段到命令行
	if req.Mode != nil {
		queryParams = append(queryParams, fmt.Sprintf("mode=%d", *req.Mode))
	}
	if req.Read != nil {
		queryParams = append(queryParams, fmt.Sprintf("read=%s", *req.Read))
	}
	if req.Rate != nil {
		queryParams = append(queryParams, fmt.Sprintf("rate=%d", *req.Rate))
	}
	if req.Slot != nil {
		queryParams = append(queryParams, fmt.Sprintf("slot=%d", *req.Slot))
	}
	if req.ProxyProtocol != nil {
		queryParams = append(queryParams, fmt.Sprintf("proxy=%d", *req.Slot))
	}

	if len(queryParams) > 0 {
		commandLine += "?" + strings.Join(queryParams, "&")
	}

	log.Infof("[API] 构建的命令行: %s", commandLine)

	// 1. 使用 NodePass 客户端创建实例
	resp, err := nodepass.CreateInstance(endpoint.ID, commandLine)
	if err != nil {
		log.Errorf("[NodePass] 创建实例失败 endpoint=%d cmd=%s err=%v", req.EndpointID, commandLine, err)
		return nil, err
	}

	log.Infof("[API] NodePass API 创建成功，instanceID=%s，开始等待SSE通知", resp.ID)

	// 2. 轮询等待数据库中存在该 endpointId+instanceId 记录（通过 SSE 通知）
	deadline := time.Now().Add(timeout)
	var tunnelID int64
	waitSuccess := false

	for time.Now().Before(deadline) {
		var tunnel models.Tunnel
		err := s.db.Select("id").Where("endpoint_id = ? AND instance_id = ?", req.EndpointID, resp.ID).First(&tunnel).Error
		if err == nil {
			tunnelID = tunnel.ID
			log.Infof("[API] 检测到SSE已创建隧道记录，tunnelID=%d, instanceID=%s", tunnelID, resp.ID)
			waitSuccess = true
			break
		}
		if err != gorm.ErrRecordNotFound {
			log.Warnf("[API] 查询隧道记录时出错: %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}

	now := time.Now()

	if waitSuccess {
		log.Infof("[API] 等待SSE成功，更新隧道名称为: %s", req.Name)

		// 3. 更新隧道字段（包括名称和其他配置字段）
		updateFields := map[string]interface{}{
			"name":       req.Name,
			"updated_at": now,
		}

		// 添加可选配置字段
		if req.Min != nil {
			updateFields["min"] = int64(*req.Min)
		}
		if req.Max != nil {
			updateFields["max"] = int64(*req.Max)
		}
		if req.Slot != nil {
			updateFields["slot"] = int64(*req.Slot)
		}
		if req.Rate != nil {
			updateFields["rate"] = int64(*req.Rate)
		}
		if req.Mode != nil {
			updateFields["mode"] = int(*req.Mode)
		}
		if req.Read != nil {
			updateFields["read"] = *req.Read
		}
		if req.ProxyProtocol != nil {
			updateFields["proxy_protocol"] = *req.ProxyProtocol
		}

		err = s.db.Model(&models.Tunnel{}).Where("id = ?", tunnelID).Updates(updateFields).Error
		if err != nil {
			log.Warnf("[API] 更新隧道名称失败: %v", err)
		}

		// 记录操作日志
		waitMessage := "隧道创建成功（等待模式）"
		operationLog := models.TunnelOperationLog{
			TunnelID:   &tunnelID,
			TunnelName: req.Name,
			Action:     models.OperationActionCreate,
			Status:     "success",
			Message:    &waitMessage,
			CreatedAt:  time.Now(),
		}
		s.db.Create(&operationLog)

		// 异步更新端点隧道计数（避免死锁）
		go func(endpointID int64) {
			time.Sleep(50 * time.Millisecond)
			s.updateEndpointTunnelCount(endpointID)
		}(req.EndpointID)

		// 设置隧道别名
		if err := s.SetTunnelAlias(tunnelID, req.Name); err != nil {
			log.Warnf("[API] 设置隧道别名失败，但不影响创建: %v", err)
		}

		// 构建返回的隧道对象
		tunnel := &Tunnel{
			ID:            tunnelID,
			InstanceID:    &resp.ID,
			Name:          req.Name,
			EndpointID:    req.EndpointID,
			Type:          TunnelType(req.Type),
			Status:        TunnelStatus(resp.Status),
			TunnelAddress: req.TunnelAddress,
			TunnelPort:    strconv.Itoa(req.TunnelPort),
			TargetAddress: req.TargetAddress,
			TargetPort:    strconv.Itoa(req.TargetPort),
			TLSMode:       req.TLSMode,
			LogLevel:      req.LogLevel,
			CommandLine:   commandLine,
			Restart:       &req.Restart,
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		// 处理可选字段
		if req.CertPath != "" {
			tunnel.CertPath = &req.CertPath
		}
		if req.KeyPath != "" {
			tunnel.KeyPath = &req.KeyPath
		}
		if req.Password != "" {
			tunnel.Password = &req.Password
		}
		if req.ProxyProtocol != nil {
			tunnel.ProxyProtocol = req.ProxyProtocol
		}
		if req.Min != nil {
			minVal := int64(*req.Min)
			tunnel.Min = &minVal
		}
		if req.Max != nil {
			maxVal := int64(*req.Max)
			tunnel.Max = &maxVal
		}

		log.Infof("[API] 隧道创建成功（等待模式）: %s (ID: %d, InstanceID: %s)", tunnel.Name, tunnel.ID, tunnel.InstanceID)
		return tunnel, nil
	}

	// 4. 等待超时，执行原来的手动创建逻辑
	log.Warnf("[API] 等待SSE超时，回退到手动创建模式: %s", resp.ID)

	// 尝试查询是否已存在相同 endpointId+instanceId 的记录（可能由 SSE 先行创建）
	var existingTunnel models.Tunnel
	err = s.db.Select("id").Where("endpoint_id = ? AND instance_id = ?", req.EndpointID, resp.ID).First(&existingTunnel).Error
	var existingID int64
	if err == nil {
		existingID = existingTunnel.ID
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	if existingID == 0 {
		// 创建新记录
		newTunnel := models.Tunnel{
			InstanceID:    &resp.ID,
			Name:          req.Name,
			EndpointID:    req.EndpointID,
			Type:          models.TunnelType(req.Type),
			TunnelAddress: req.TunnelAddress,
			TunnelPort:    strconv.Itoa(req.TunnelPort),
			TargetAddress: req.TargetAddress,
			TargetPort:    strconv.Itoa(req.TargetPort),
			TLSMode:       models.TLSMode(req.TLSMode),
			LogLevel:      models.LogLevel(req.LogLevel),
			CommandLine:   commandLine,
			Restart:       &req.Restart,
			Status:        models.TunnelStatusRunning,
			CreatedAt:     now,
			UpdatedAt:     now,
		}

		// 处理可选字段
		if req.CertPath != "" {
			newTunnel.CertPath = &req.CertPath
		}
		if req.KeyPath != "" {
			newTunnel.KeyPath = &req.KeyPath
		}
		if req.Password != "" {
			newTunnel.Password = &req.Password
		}
		if req.Min != nil {
			minVal := int64(*req.Min)
			newTunnel.Min = &minVal
		}
		if req.Max != nil {
			maxVal := int64(*req.Max)
			newTunnel.Max = &maxVal
		}

		err = s.db.Create(&newTunnel).Error
		if err != nil {
			return nil, err
		}
		existingID = newTunnel.ID
	} else {
		// 已存在，仅更新名称
		err := s.db.Model(&models.Tunnel{}).Where("id = ?", existingID).Updates(map[string]interface{}{
			"name":       req.Name,
			"updated_at": now,
		}).Error
		if err != nil {
			return nil, err
		}
	}

	// 记录操作日志
	fallbackMessage := "隧道创建成功（超时回退模式）"
	operationLog := models.TunnelOperationLog{
		TunnelID:   &existingID,
		TunnelName: req.Name,
		Action:     models.OperationActionCreate,
		Status:     "success",
		Message:    &fallbackMessage,
		CreatedAt:  time.Now(),
	}
	err = s.db.Create(&operationLog).Error
	if err != nil {
		return nil, err
	}

	// 异步更新端点隧道计数（避免死锁）
	go func(endpointID int64) {
		time.Sleep(50 * time.Millisecond)
		s.updateEndpointTunnelCount(endpointID)
	}(req.EndpointID)

	// 设置隧道别名
	if err := s.SetTunnelAlias(existingID, req.Name); err != nil {
		log.Warnf("[API] 设置隧道别名失败，但不影响创建: %v", err)
	}

	// 构建返回的隧道对象
	tunnel := &Tunnel{
		ID:            existingID,
		InstanceID:    &resp.ID,
		Name:          req.Name,
		EndpointID:    req.EndpointID,
		Type:          TunnelType(req.Type),
		Status:        TunnelStatus(resp.Status),
		TunnelAddress: req.TunnelAddress,
		TunnelPort:    strconv.Itoa(req.TunnelPort),
		TargetAddress: req.TargetAddress,
		TargetPort:    strconv.Itoa(req.TargetPort),
		TLSMode:       req.TLSMode,
		LogLevel:      req.LogLevel,
		CommandLine:   commandLine,
		Restart:       &req.Restart,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	// 处理可选字段
	if req.CertPath != "" {
		tunnel.CertPath = &req.CertPath
	}
	if req.KeyPath != "" {
		tunnel.KeyPath = &req.KeyPath
	}
	if req.Password != "" {
		tunnel.Password = &req.Password
	}
	if req.Min != nil {
		minVal := int64(*req.Min)
		tunnel.Min = &minVal
	}
	if req.Max != nil {
		maxVal := int64(*req.Max)
		tunnel.Max = &maxVal
	}

	log.Infof("[API] 隧道创建成功（超时回退模式）: %s (ID: %d, InstanceID: %s)", tunnel.Name, tunnel.ID, tunnel.InstanceID)
	return tunnel, nil
}

// CreateTunnelAndWait 先调用 NodePass API 创建隧道，等待 SSE 通知数据库记录后更新名称
// 如果等待超时，则回退到原来的手动创建逻辑
func (s *Service) NewCreateTunnelAndWait(req Tunnel, timeout time.Duration) (*Tunnel, error) {
	log.Infof("[API] 创建隧道（等待模式）: %v", req.Name)

	// 使用GORM检查端点是否存在
	var endpoint models.Endpoint
	err := s.db.Where("id = ?", req.EndpointID).First(&endpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, errors.New("指定的端点不存在")
		}
		return nil, err
	}

	// 构建命令行（复用原有逻辑）
	var commandLine string = nodepass.BuildTunnelURLs(req)
	log.Infof("[API] 构建的命令行: %s", commandLine)

	// 1. 使用 NodePass 客户端创建实例
	resp, err := nodepass.CreateInstance(endpoint.ID, commandLine)
	if err != nil {
		log.Errorf("[NodePass] 创建实例失败 endpoint=%d cmd=%s err=%v", req.EndpointID, commandLine, err)
		return nil, err
	}

	log.Infof("[API] NodePass API 创建成功，instanceID=%s，开始等待SSE通知", resp.ID)

	// 2. 轮询等待数据库中存在该 endpointId+instanceId 记录（通过 SSE 通知）
	deadline := time.Now().Add(timeout)
	var tunnelID int64
	waitSuccess := false

	for time.Now().Before(deadline) {
		var tunnel models.Tunnel
		err := s.db.Select("id").Where("endpoint_id = ? AND instance_id = ?", req.EndpointID, resp.ID).First(&tunnel).Error
		if err == nil {
			tunnelID = tunnel.ID
			log.Infof("[API] 检测到SSE已创建隧道记录，tunnelID=%d, instanceID=%s", tunnelID, resp.ID)
			waitSuccess = true
			break
		}
		if err != gorm.ErrRecordNotFound {
			log.Warnf("[API] 查询隧道记录时出错: %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}

	now := time.Now()

	if waitSuccess {
		log.Infof("[API] 等待SSE成功，更新隧道名称为: %s", req.Name)

		// 3. 更新隧道字段（包括名称和其他配置字段）
		updateFields := map[string]interface{}{
			"name":       req.Name,
			"updated_at": now,
		}

		err = s.db.Model(&models.Tunnel{}).Where("id = ?", tunnelID).Updates(updateFields).Error
		if err != nil {
			log.Warnf("[API] 更新隧道名称失败: %v", err)
		}

		// 记录操作日志
		waitMessage := "隧道创建成功（等待模式）"
		operationLog := models.TunnelOperationLog{
			TunnelID:   &tunnelID,
			TunnelName: req.Name,
			Action:     models.OperationActionCreate,
			Status:     "success",
			Message:    &waitMessage,
			CreatedAt:  time.Now(),
		}
		s.db.Create(&operationLog)

		// 异步更新端点隧道计数（避免死锁）
		go func(endpointID int64) {
			time.Sleep(50 * time.Millisecond)
			s.updateEndpointTunnelCount(endpointID)
		}(req.EndpointID)

		// 设置隧道别名
		if err := s.SetTunnelAlias(tunnelID, req.Name); err != nil {
			log.Warnf("[API] 设置隧道别名失败，但不影响创建: %v", err)
		}

		log.Infof("[API] 隧道创建成功（等待模式）: %s (ID: %d, InstanceID: %s)", req.Name, req.ID, req.InstanceID)
		return &req, nil
	}

	// 4. 等待超时，执行原来的手动创建逻辑
	log.Warnf("[API] 等待SSE超时，回退到手动创建模式: %s", resp.ID)

	// 尝试查询是否已存在相同 endpointId+instanceId 的记录（可能由 SSE 先行创建）
	var existingTunnel models.Tunnel
	err = s.db.Select("id").Where("endpoint_id = ? AND instance_id = ?", req.EndpointID, resp.ID).First(&existingTunnel).Error
	var existingID int64
	if err == nil {
		existingID = existingTunnel.ID
	} else if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	if existingID == 0 {
		// 创建新记录
		err = s.db.Create(&req).Error
		if err != nil {
			return nil, err
		}
		existingID = req.ID
	} else {
		// 已存在，仅更新名称
		err := s.db.Model(&models.Tunnel{}).Where("id = ?", existingID).Updates(map[string]interface{}{
			"name":       req.Name,
			"updated_at": now,
		}).Error
		if err != nil {
			return nil, err
		}
	}

	// 记录操作日志
	fallbackMessage := "隧道创建成功（超时回退模式）"
	operationLog := models.TunnelOperationLog{
		TunnelID:   &existingID,
		TunnelName: req.Name,
		Action:     models.OperationActionCreate,
		Status:     "success",
		Message:    &fallbackMessage,
		CreatedAt:  time.Now(),
	}
	err = s.db.Create(&operationLog).Error
	if err != nil {
		return nil, err
	}

	// 异步更新端点隧道计数（避免死锁）
	go func(endpointID int64) {
		time.Sleep(50 * time.Millisecond)
		s.updateEndpointTunnelCount(endpointID)
	}(req.EndpointID)

	// 设置隧道别名
	if err := s.SetTunnelAlias(existingID, req.Name); err != nil {
		log.Warnf("[API] 设置隧道别名失败，但不影响创建: %v", err)
	}

	log.Infof("[API] 隧道创建成功（超时回退模式）: %s (ID: %d, InstanceID: %s)", req.Name, req.ID, req.InstanceID)
	return &req, nil
}

// PatchTunnel 更新隧道别名或重启策略
func (s *Service) PatchTunnel(id int64, updates map[string]interface{}) error {
	log.Infof("[API] 修补隧道: %v, 更新: %+v", id, updates)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("id = ?", id).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 检查instance_id是否存在
	if tunnelWithEndpoint.InstanceID == nil || *tunnelWithEndpoint.InstanceID == "" {
		return errors.New("隧道没有关联的实例ID")
	}

	// 准备本地数据库更新和远程API更新
	localUpdates := make(map[string]interface{})
	remoteUpdates := make(map[string]interface{})

	// 处理别名更新
	if alias, ok := updates["alias"]; ok {
		aliasStr, ok := alias.(string)
		if !ok {
			return errors.New("alias 必须是字符串类型")
		}
		if aliasStr == "" {
			return errors.New("alias 不能为空")
		}

		// 移除名称重复检查 - 允许重复名称

		localUpdates["name"] = aliasStr
		remoteUpdates["alias"] = aliasStr
	}

	if len(localUpdates) == 0 {
		return errors.New("没有有效的更新字段")
	}

	// 更新本地数据库
	if len(localUpdates) > 0 {
		localUpdates["updated_at"] = time.Now()
		err = s.db.Model(&models.Tunnel{}).Where("id = ?", id).Updates(localUpdates).Error
		if err != nil {
			return err
		}
	}

	// 调用 NodePass API 更新远程实例

	// 处理别名更新
	if alias, ok := remoteUpdates["alias"]; ok {
		aliasStr := alias.(string)
		if _, err := nodepass.RenameInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, aliasStr); err != nil {
			// 检查是否为 404 错误（旧版本 NodePass 不支持）
			if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
				log.Warnf("[API] NodePass API 不支持重命名功能（可能是旧版本）: %v", err)
				// 不返回错误，继续执行
			} else {
				log.Errorf("[API] NodePass API 重命名失败: %v", err)
				return fmt.Errorf("NodePass API 重命名失败: %v", err)
			}
		}
	}

	return nil
}

// SetTunnelAlias 为隧道设置别名（调用 NodePass API）
func (s *Service) SetTunnelAlias(tunnelID int64, alias string) error {
	log.Infof("[API] 设置隧道别名: tunnelID=%d, alias=%s", tunnelID, alias)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("id = ?", tunnelID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 检查instance_id是否存在
	if tunnelWithEndpoint.InstanceID == nil || *tunnelWithEndpoint.InstanceID == "" {
		return errors.New("隧道没有关联的实例ID")
	}

	// 调用 NodePass API 设置别名
	if _, err := nodepass.RenameInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, alias); err != nil {
		// 检查是否为 404 错误（旧版本 NodePass 不支持）
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
			log.Warnf("[API] NodePass API 不支持别名功能（可能是旧版本），跳过设置: %v", err)
			return nil // 不返回错误，继续执行
		} else {
			log.Errorf("[API] NodePass API 设置别名失败: %v", err)
			return fmt.Errorf("NodePass API 设置别名失败: %v", err)
		}
	}

	log.Infof("[API] 隧道别名设置成功: tunnelID=%d, alias=%s", tunnelID, alias)
	return nil
}

// RenameTunnel 修改隧道名称，同时调用远端 API
func (s *Service) RenameTunnel(id int64, newName string) error {
	log.Infof("[API] 重命名隧道: %v", newName)

	// 移除名称重复检查 - 允许重复名称

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("id = ?", id).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 检查instance_id是否存在
	if tunnelWithEndpoint.InstanceID == nil || *tunnelWithEndpoint.InstanceID == "" {
		return errors.New("隧道没有关联的实例ID")
	}

	// 首先调用 NodePass API 尝试重命名远程实例
	if _, err := nodepass.RenameInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, newName); err != nil {
		// 检查是否为 404 错误（旧版本 NodePass 不支持）
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
			log.Warnf("[API] NodePass API 不支持重命名功能（可能是旧版本），仅更新本地记录: %v", err)
			// 继续执行本地更新
		} else {
			log.Errorf("[API] NodePass API 重命名失败: %v", err)
			return fmt.Errorf("NodePass API 重命名失败: %v", err)
		}
	}

	// 更新本地数据库名称
	result := s.db.Model(&models.Tunnel{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name":       newName,
		"updated_at": time.Now(),
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("隧道不存在")
	}

	// 记录操作日志
	renameMessage := "重命名成功"
	operationLog := models.TunnelOperationLog{
		TunnelID:   &id,
		TunnelName: newName,
		Action:     models.OperationActionRename,
		Status:     "success",
		Message:    &renameMessage,
		CreatedAt:  time.Now(),
	}
	s.db.Create(&operationLog)

	return nil
}

// DB 返回底层 *sql.DB 指针，供需要直接执行查询的调用者使用
func (s *Service) DB() *sql.DB {
	sqlDB, err := s.db.DB()
	if err != nil {
		return nil
	}
	return sqlDB
}

// GormDB 返回 GORM 数据库实例，供需要使用 GORM 方法的调用者使用
func (s *Service) GormDB() *gorm.DB {
	return s.db
}

// QuickCreateTunnel 根据完整 URL 快速创建隧道实例 (server://addr:port/target:port?params)
func (s *Service) QuickCreateTunnel(endpointID int64, rawURL string, name string) error {
	// 使用统一的parseUrl方法解析URL
	parsedTunnel := nodepass.ParseTunnelURL(rawURL)
	if parsedTunnel == nil {
		return errors.New("无效的隧道URL格式")
	}

	// 端口转换
	tp, _ := strconv.Atoi(parsedTunnel.TunnelPort)
	sp, _ := strconv.Atoi(parsedTunnel.TargetPort)

	finalName := name
	if strings.TrimSpace(finalName) == "" {
		finalName = fmt.Sprintf("auto-%d-%d", endpointID, time.Now().Unix())
	}
	req := CreateTunnelRequest{
		Name:          finalName,
		EndpointID:    endpointID,
		Type:          string(parsedTunnel.Type),
		TunnelAddress: parsedTunnel.TunnelAddress,
		TunnelPort:    tp,
		TargetAddress: parsedTunnel.TargetAddress,
		TargetPort:    sp,
		TLSMode:       TLSMode(parsedTunnel.TLSMode),
		CertPath: func() string {
			if parsedTunnel.CertPath != nil {
				return *parsedTunnel.CertPath
			}
			return ""
		}(),
		KeyPath: func() string {
			if parsedTunnel.KeyPath != nil {
				return *parsedTunnel.KeyPath
			}
			return ""
		}(),
		LogLevel: LogLevel(parsedTunnel.LogLevel),
		Password: func() string {
			if parsedTunnel.Password != nil {
				return *parsedTunnel.Password
			}
			return ""
		}(),
		Min: func() *int {
			if parsedTunnel.Min != nil {
				val := int(*parsedTunnel.Min)
				return &val
			}
			return nil
		}(),
		Max: func() *int {
			if parsedTunnel.Max != nil {
				val := int(*parsedTunnel.Max)
				return &val
			}
			return nil
		}(),
		Mode: func() *TunnelMode {
			if parsedTunnel.Mode != nil {
				return (*TunnelMode)(parsedTunnel.Mode)
			}
			return nil
		}(),
		Read: func() *string {
			if parsedTunnel.Read != nil {
				return parsedTunnel.Read
			}
			return nil
		}(),
		Rate: func() *int {
			if parsedTunnel.Rate != nil {
				rate := int(*parsedTunnel.Rate)
				return &rate
			}
			return nil
		}(),
		EnableSSEStore: true,
		EnableLogStore: true,
	}
	_, err := s.CreateTunnelAndWait(req, 3*time.Second)
	return err
}

// QuickCreateTunnelAndWait 根据完整 URL 快速创建隧道实例，使用等待模式
func (s *Service) QuickCreateTunnelAndWait(endpointID int64, rawURL string, name string, timeout time.Duration) error {
	// 使用统一的parseUrl方法解析URL
	parsedTunnel := nodepass.ParseTunnelURL(rawURL)
	if parsedTunnel == nil {
		return errors.New("无效的隧道URL格式")
	}

	// 端口转换
	tp, _ := strconv.Atoi(parsedTunnel.TunnelPort)
	sp, _ := strconv.Atoi(parsedTunnel.TargetPort)

	finalName := name
	if strings.TrimSpace(finalName) == "" {
		finalName = fmt.Sprintf("auto-%d-%d", endpointID, time.Now().Unix())
	}

	// 正确处理min和max值，区分未设置和设置为0的情况
	var minVal, maxVal *int
	if parsedTunnel.Min != nil {
		val := int(*parsedTunnel.Min)
		minVal = &val
	}
	if parsedTunnel.Max != nil {
		val := int(*parsedTunnel.Max)
		maxVal = &val
	}

	// 处理新字段
	var modeVal *TunnelMode
	if parsedTunnel.Mode != nil {
		modeVal = (*TunnelMode)(parsedTunnel.Mode)
	}

	var readVal *string
	if parsedTunnel.Read != nil {
		readVal = parsedTunnel.Read
	}

	var rateVal *int
	if parsedTunnel.Rate != nil {
		rate := int(*parsedTunnel.Rate)
		rateVal = &rate
	}

	req := CreateTunnelRequest{
		Name:          finalName,
		EndpointID:    endpointID,
		Type:          string(parsedTunnel.Type),
		TunnelAddress: parsedTunnel.TunnelAddress,
		TunnelPort:    tp,
		TargetAddress: parsedTunnel.TargetAddress,
		TargetPort:    sp,
		TLSMode:       TLSMode(parsedTunnel.TLSMode),
		CertPath: func() string {
			if parsedTunnel.CertPath != nil {
				return *parsedTunnel.CertPath
			}
			return ""
		}(),
		KeyPath: func() string {
			if parsedTunnel.KeyPath != nil {
				return *parsedTunnel.KeyPath
			}
			return ""
		}(),
		LogLevel: LogLevel(parsedTunnel.LogLevel),
		Password: func() string {
			if parsedTunnel.Password != nil {
				return *parsedTunnel.Password
			}
			return ""
		}(),
		Min:            minVal,
		Max:            maxVal,
		Mode:           modeVal,
		Read:           readVal,
		Rate:           rateVal,
		EnableSSEStore: true,
		EnableLogStore: true,
	}
	_, err := s.CreateTunnelAndWait(req, timeout)
	return err
}

// BatchCreateTunnels 批量创建隧道
func (s *Service) BatchCreateTunnels(req BatchCreateTunnelRequest) (*BatchCreateTunnelResponse, error) {
	log.Infof("[API] 开始批量创建隧道，共 %d 个项目", len(req.Items))

	if len(req.Items) == 0 {
		return &BatchCreateTunnelResponse{
			Success: false,
			Error:   "批量创建项目不能为空",
		}, nil
	}

	// 预先查询所有涉及的endpoint信息，减少重复查询
	endpointMap := make(map[int64]struct {
		URL     string
		APIPath string
		APIKey  string
		Name    string
	})

	for _, item := range req.Items {
		if _, exists := endpointMap[item.EndpointID]; !exists {
			var endpoint models.Endpoint
			err := s.db.Select("url, api_path, api_key, name").Where("id = ?", item.EndpointID).First(&endpoint).Error
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					log.Errorf("[API] 批量创建: 端点 %d 不存在", item.EndpointID)
					continue // 跳过不存在的端点，在结果中标记为失败
				}
				log.Errorf("[API] 批量创建: 查询端点 %d 失败: %v", item.EndpointID, err)
				continue
			}
			endpointMap[item.EndpointID] = struct {
				URL     string
				APIPath string
				APIKey  string
				Name    string
			}{endpoint.URL, endpoint.APIPath, endpoint.APIKey, endpoint.Name}
		}
	}

	results := make([]BatchCreateResult, len(req.Items))
	successCount := 0
	failCount := 0

	// 逐个创建隧道实例
	for i, item := range req.Items {
		log.Infof("[API] 批量创建进度: %d/%d - 端点 %d, 端口 %d → %s:%d",
			i+1, len(req.Items), item.EndpointID, item.InboundsPort, item.OutboundHost, item.OutboundPort)

		result := BatchCreateResult{Index: i}

		// 检查端点是否存在
		_, exists := endpointMap[item.EndpointID]
		if !exists {
			result.Success = false
			result.Error = fmt.Sprintf("端点 %d 不存在", item.EndpointID)
			results[i] = result
			failCount++
			continue
		}

		// 生成隧道名称
		tunnelName := fmt.Sprintf("批量实例-%d", item.InboundsPort)

		// 如果用户提供了自定义名称，则使用自定义名称
		if item.Name != "" {
			tunnelName = item.Name
		}

		// 移除隧道名称重复检查 - 允许重复名称

		// 构建创建请求
		createReq := CreateTunnelRequest{
			Name:          tunnelName,
			EndpointID:    item.EndpointID,
			Type:          "server", // 批量创建默认为服务端模式
			TunnelAddress: "",       // 服务端模式下为空
			TunnelPort:    item.InboundsPort,
			TargetAddress: item.OutboundHost,
			TargetPort:    item.OutboundPort,
			TLSMode:       "",           // 空字符串表示不设置（inherit）
			LogLevel:      LogLevelInfo, // 使用Info日志级别
		}

		// 调用等待模式创建方法
		tunnel, err := s.CreateTunnelAndWait(createReq, 3*time.Second)
		if err != nil {
			log.Errorf("[API] 批量创建第 %d 项失败: %v", i+1, err)
			result.Success = false
			result.Error = err.Error()
			failCount++
		} else {
			// CreateTunnelAndWait 已经包含了设置别名的逻辑

			log.Infof("[API] 批量创建第 %d 项成功: %s (ID: %d)", i+1, tunnel.Name, tunnel.ID)
			result.Success = true
			result.Message = "创建成功"
			result.TunnelID = tunnel.ID
			successCount++
		}

		results[i] = result
	}

	// 记录批量操作日志
	batchStatus := "failed"
	if successCount > 0 {
		batchStatus = "success"
	}
	batchMessage := fmt.Sprintf("批量创建完成，成功 %d 个，失败 %d 个", successCount, failCount)

	batchLog := models.TunnelOperationLog{
		TunnelID:   nil, // 批量操作没有特定的tunnelId
		TunnelName: "批量创建",
		Action:     "batch_create",
		Status:     batchStatus,
		Message:    &batchMessage,
		CreatedAt:  time.Now(),
	}
	err := s.db.Create(&batchLog).Error
	if err != nil {
		log.Errorf("[API] 记录批量创建日志失败: %v", err)
	}

	response := &BatchCreateTunnelResponse{
		Success:      successCount > 0,
		Results:      results,
		SuccessCount: successCount,
		FailCount:    failCount,
	}

	if successCount > 0 && failCount == 0 {
		response.Message = fmt.Sprintf("批量创建完成，成功创建 %d 个隧道", successCount)
	} else if successCount > 0 && failCount > 0 {
		response.Message = fmt.Sprintf("批量创建完成，成功 %d 个，失败 %d 个", successCount, failCount)
	} else {
		response.Error = fmt.Sprintf("批量创建失败，%d 个项目全部失败", failCount)
	}

	log.Infof("[API] 批量创建隧道完成: 成功 %d 个，失败 %d 个", successCount, failCount)
	return response, nil
}

// NewBatchCreateTunnels 新的批量创建隧道方法
func (s *Service) NewBatchCreateTunnels(req NewBatchCreateRequest) (*NewBatchCreateResponse, error) {
	log.Infof("[API] 开始新的批量创建隧道，模式: %s", req.Mode)

	var allItems []struct {
		Name       string
		EndpointID int64
		LogLevel   string
		TunnelPort int
		TargetHost string
		TargetPort int
	}

	// 根据模式解析请求
	switch req.Mode {
	case "standard":
		if len(req.Standard) == 0 {
			return &NewBatchCreateResponse{
				Success: false,
				Error:   "标准模式批量创建项目不能为空",
			}, nil
		}

		for _, item := range req.Standard {
			allItems = append(allItems, struct {
				Name       string
				EndpointID int64
				LogLevel   string
				TunnelPort int
				TargetHost string
				TargetPort int
			}{
				Name:       item.Name,
				EndpointID: item.EndpointID,
				LogLevel:   item.Log,
				TunnelPort: item.TunnelPort,
				TargetHost: item.TargetHost,
				TargetPort: item.TargetPort,
			})
		}

	case "config":
		if len(req.Config) == 0 {
			return &NewBatchCreateResponse{
				Success: false,
				Error:   "配置模式批量创建项目不能为空",
			}, nil
		}

		for _, configItem := range req.Config {
			for _, config := range configItem.Config {
				// 解析 dest 字段
				var targetHost string
				var targetPort int

				if strings.Contains(config.Dest, ":") {
					lastColonIndex := strings.LastIndex(config.Dest, ":")
					targetHost = config.Dest[:lastColonIndex]
					if portStr := config.Dest[lastColonIndex+1:]; portStr != "" {
						if port, err := strconv.Atoi(portStr); err == nil {
							targetPort = port
						} else {
							log.Errorf("[API] 解析目标端口失败: %s", portStr)
							continue
						}
					} else {
						log.Errorf("[API] 目标端口为空: %s", config.Dest)
						continue
					}
				} else {
					log.Errorf("[API] dest 格式错误: %s", config.Dest)
					continue
				}

				allItems = append(allItems, struct {
					Name       string
					EndpointID int64
					LogLevel   string
					TunnelPort int
					TargetHost string
					TargetPort int
				}{
					Name:       config.Name,
					EndpointID: configItem.EndpointID,
					LogLevel:   configItem.Log,
					TunnelPort: config.ListenPort,
					TargetHost: targetHost,
					TargetPort: targetPort,
				})
			}
		}

	default:
		return &NewBatchCreateResponse{
			Success: false,
			Error:   "不支持的批量创建模式: " + req.Mode,
		}, nil
	}

	if len(allItems) == 0 {
		return &NewBatchCreateResponse{
			Success: false,
			Error:   "没有有效的创建项目",
		}, nil
	}

	// 预先查询所有涉及的endpoint信息
	endpointMap := make(map[int64]struct {
		URL     string
		APIPath string
		APIKey  string
		Name    string
	})

	log.Infof("[API] 新批量创建：开始查询端点信息，共 %d 个项目", len(allItems))

	for _, item := range allItems {
		log.Infof("[API] 新批量创建：检查端点 %d", item.EndpointID)
		if _, exists := endpointMap[item.EndpointID]; !exists {
			var endpoint models.Endpoint
			err := s.db.Select("url, api_path, api_key, name").Where("id = ?", item.EndpointID).First(&endpoint).Error
			if err != nil {
				if err == gorm.ErrRecordNotFound {
					log.Errorf("[API] 新批量创建: 端点 %d 不存在", item.EndpointID)
					continue
				}
				log.Errorf("[API] 新批量创建: 查询端点 %d 失败: %v", item.EndpointID, err)
				continue
			}
			endpointMap[item.EndpointID] = struct {
				URL     string
				APIPath string
				APIKey  string
				Name    string
			}{endpoint.URL, endpoint.APIPath, endpoint.APIKey, endpoint.Name}
			log.Infof("[API] 新批量创建：端点 %d 查询成功: %s", item.EndpointID, endpoint.Name)
		} else {
			log.Infof("[API] 新批量创建：端点 %d 已在缓存中", item.EndpointID)
		}
	}

	log.Infof("[API] 新批量创建：端点查询完成，有效端点数量: %d", len(endpointMap))

	results := make([]BatchCreateResult, len(allItems))
	successCount := 0
	failCount := 0

	// 逐个创建隧道实例
	for i, item := range allItems {
		log.Infof("[API] 新批量创建进度: %d/%d - 端点 %d, 端口 %d → %s:%d",
			i+1, len(allItems), item.EndpointID, item.TunnelPort, item.TargetHost, item.TargetPort)

		result := BatchCreateResult{Index: i, Success: true} // 默认设置为成功，遇到错误时再设置为失败

		// 检查端点是否存在
		log.Infof("[API] 新批量创建第 %d 项：检查端点 %d 是否存在", i+1, item.EndpointID)
		_, exists := endpointMap[item.EndpointID]
		if !exists {
			log.Errorf("[API] 新批量创建第 %d 项：端点 %d 不存在", i+1, item.EndpointID)
			result.Success = false
			result.Error = fmt.Sprintf("端点 %d 不存在", item.EndpointID)
			results[i] = result
			failCount++
			continue
		}
		log.Infof("[API] 新批量创建第 %d 项：端点 %d 检查通过", i+1, item.EndpointID)

		// 直接使用提供的隧道名称 - 移除重复检查
		tunnelName := item.Name
		log.Infof("[API] 新批量创建第 %d 项：使用隧道名称 '%s'", i+1, tunnelName)

		// 构建创建请求
		var logLevel LogLevel
		switch strings.ToLower(item.LogLevel) {
		case "debug":
			logLevel = LogLevelDebug
		case "info":
			logLevel = LogLevelInfo
		case "warn":
			logLevel = LogLevelWarn
		case "error":
			logLevel = LogLevelError
		default:
			logLevel = LogLevelDebug // 默认为debug
		}

		log.Infof("[API] 新批量创建第 %d 项：准备创建客户端隧道，LogLevel=%s", i+1, logLevel)

		createReq := CreateTunnelRequest{
			Name:          tunnelName,
			EndpointID:    item.EndpointID,
			Type:          "client", // 新的批量创建默认为客户端模式
			TunnelAddress: "",       // 客户端模式下tunnel_address为空，生成client://:port/target:port格式
			TunnelPort:    item.TunnelPort,
			TargetAddress: item.TargetHost,
			TargetPort:    item.TargetPort,
			TLSMode:       "", // 空字符串表示不设置（inherit）
			LogLevel:      logLevel,
		}

		// 调用等待模式创建方法
		log.Infof("[API] 新批量创建第 %d 项详细信息: Name=%s, EndpointID=%d, Mode=%s, TunnelPort=%d, TargetAddress=%s, TargetPort=%d",
			i+1, createReq.Name, createReq.EndpointID, createReq.Mode, createReq.TunnelPort, createReq.TargetAddress, createReq.TargetPort)

		tunnel, err := s.CreateTunnelAndWait(createReq, 3*time.Second)
		if err != nil {
			log.Errorf("[API] 新批量创建第 %d 项失败: %v", i+1, err)
			log.Errorf("[API] 失败的创建请求详情: %+v", createReq)
			result.Success = false
			result.Error = err.Error()
			failCount++
		} else {
			log.Infof("[API] 新批量创建第 %d 项成功: %s (ID: %d)", i+1, tunnel.Name, tunnel.ID)
			result.Success = true
			result.Message = "创建成功"
			result.TunnelID = tunnel.ID
			successCount++
		}

		results[i] = result
	}

	// 记录批量操作日志
	newBatchStatus := "failed"
	if successCount > 0 {
		newBatchStatus = "success"
	}
	newBatchMessage := fmt.Sprintf("新批量创建完成，成功 %d 个，失败 %d 个", successCount, failCount)

	newBatchLog := models.TunnelOperationLog{
		TunnelID:   nil, // 批量操作没有特定的tunnelId
		TunnelName: fmt.Sprintf("新批量创建-%s", req.Mode),
		Action:     "new_batch_create",
		Status:     newBatchStatus,
		Message:    &newBatchMessage,
		CreatedAt:  time.Now(),
	}
	err := s.db.Create(&newBatchLog).Error
	if err != nil {
		log.Errorf("[API] 记录新批量创建日志失败: %v", err)
	}

	response := &NewBatchCreateResponse{
		Success:      successCount > 0,
		Results:      results,
		SuccessCount: successCount,
		FailCount:    failCount,
	}

	if successCount > 0 && failCount == 0 {
		response.Message = fmt.Sprintf("新批量创建完成，成功创建 %d 个隧道", successCount)
	} else if successCount > 0 && failCount > 0 {
		response.Message = fmt.Sprintf("新批量创建完成，成功 %d 个，失败 %d 个", successCount, failCount)
	} else {
		response.Error = fmt.Sprintf("新批量创建失败，%d 个项目全部失败", failCount)
	}

	log.Infof("[API] 新批量创建隧道完成: 成功 %d 个，失败 %d 个", successCount, failCount)
	return response, nil
}

// SetTunnelRestart 设置隧道重启策略（只有在 NodePass API 调用成功后才更新数据库）
func (s *Service) SetTunnelRestart(tunnelID int64, restart bool) error {
	log.Infof("[API] 设置隧道重启策略: tunnelID=%d, restart=%t", tunnelID, restart)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("id = ?", tunnelID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 检查instance_id是否存在
	if tunnelWithEndpoint.InstanceID == nil || *tunnelWithEndpoint.InstanceID == "" {
		return errors.New("隧道没有关联的实例ID")
	}

	// 先调用 NodePass API 设置重启策略
	if _, err := nodepass.SetRestartInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, restart); err != nil {
		// 检查是否为 404 错误（旧版本 NodePass 不支持）
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
			log.Warnf("[API] NodePass API 不支持重启策略功能（可能是旧版本）: %v", err)
			return errors.New("当前实例不支持自动重启功能")
		} else {
			log.Errorf("[API] NodePass API 设置重启策略失败: %v", err)
			return fmt.Errorf("NodePass API 设置重启策略失败: %v", err)
		}
	}

	// 只有 NodePass API 调用成功后才更新数据库
	err = s.db.Model(&models.Tunnel{}).Where("id = ?", tunnelID).Updates(map[string]interface{}{
		"restart":    restart,
		"updated_at": time.Now(),
	}).Error
	if err != nil {
		log.Errorf("[API] 数据库更新重启策略失败: %v", err)
		return fmt.Errorf("数据库更新重启策略失败: %v", err)
	}

	log.Infof("[API] 隧道重启策略设置成功: tunnelID=%d, restart=%t", tunnelID, restart)
	return nil
}

// ClearOperationLogs 删除所有隧道操作日志，返回删除的行数
func (s *Service) ClearOperationLogs() (int64, error) {
	// 使用GORM执行删除操作
	result := s.db.Where("1 = 1").Delete(&models.TunnelOperationLog{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

// ResetTunnelTraffic 重置隧道的流量统计信息
func (s *Service) ResetTunnelTraffic(tunnelID int64) error {
	log.Infof("[API] 重置隧道流量统计: tunnelID=%d", tunnelID)

	// 使用GORM获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("id = ?", tunnelID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return err
	}

	// 检查instance_id是否存在
	if tunnelWithEndpoint.InstanceID == nil || *tunnelWithEndpoint.InstanceID == "" {
		log.Warnf("[API] 隧道没有关联的实例ID，只重置本地数据库流量统计")
	} else {
		// 先调用 NodePass API 重置流量统计
		if _, err := nodepass.ControlInstance(tunnelWithEndpoint.Endpoint.ID, *tunnelWithEndpoint.InstanceID, "reset"); err != nil {
			// 检查是否为 404 错误（旧版本 NodePass 不支持）
			if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
				log.Warnf("[API] NodePass API 不支持重置流量功能（可能是旧版本）: %v", err)
				return errors.New("当前实例不支持重置流量功能")
			} else {
				log.Errorf("[API] NodePass API 重置流量失败: %v", err)
				return fmt.Errorf("NodePass API 重置流量失败: %v", err)
			}
		}
	}

	// 重置数据库流量统计
	err = s.db.Model(&models.Tunnel{}).Where("id = ?", tunnelID).Updates(map[string]interface{}{
		"tcp_rx":     0,
		"tcp_tx":     0,
		"udp_rx":     0,
		"udp_tx":     0,
		"pool":       nil,
		"ping":       nil,
		"updated_at": time.Now(),
	}).Error
	if err != nil {
		log.Errorf("[API] 数据库重置流量统计失败: %v", err)
		return fmt.Errorf("数据库重置流量统计失败: %v", err)
	}

	// 记录操作日志
	resetMessage := "重置流量统计信息"
	operationLog := models.TunnelOperationLog{
		TunnelID:   &tunnelID,
		TunnelName: tunnelWithEndpoint.Name,
		Action:     models.OperationActionResetTraffic,
		Status:     "success",
		Message:    &resetMessage,
		CreatedAt:  time.Now(),
	}
	if err := s.db.Create(&operationLog).Error; err != nil {
		log.Errorf("[API] 记录重置流量日志失败: %v", err)
		// 不返回错误，因为主要操作已经成功
	}

	log.Infof("[API] 隧道流量统计重置成功: tunnelID=%d, name=%s", tunnelID, tunnelWithEndpoint.Name)
	return nil
}

// ResetTunnelTrafficByInstanceID 根据实例ID重置隧道的流量统计信息
func (s *Service) ResetTunnelTrafficByInstanceID(instanceID string) error {
	log.Infof("[API] 根据实例ID重置隧道流量统计: instanceID=%s", instanceID)

	// 使用GORM通过instance_id获取隧道和端点信息
	var tunnelWithEndpoint models.Tunnel
	err := s.db.Preload("Endpoint").Where("instance_id = ?", instanceID).First(&tunnelWithEndpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("隧道不存在")
		}
		return fmt.Errorf("查询隧道失败: %v", err)
	}

	// 先调用 NodePass API 重置流量统计
	if _, err := nodepass.ControlInstance(tunnelWithEndpoint.Endpoint.ID, instanceID, "reset"); err != nil {
		// 检查是否为 404 错误（旧版本 NodePass 不支持）
		if strings.Contains(err.Error(), "404") || strings.Contains(err.Error(), "Not Found") {
			log.Warnf("[API] NodePass API 不支持重置流量功能（可能是旧版本）: %v", err)
			return errors.New("当前实例不支持重置流量功能")
		} else {
			log.Errorf("[API] NodePass API 重置流量失败: %v", err)
			return fmt.Errorf("NodePass API 重置流量失败: %v", err)
		}
	}

	// 重置数据库流量统计
	err = s.db.Model(&models.Tunnel{}).Where("instance_id = ?", instanceID).Updates(map[string]interface{}{
		"tcp_rx":     0,
		"tcp_tx":     0,
		"udp_rx":     0,
		"udp_tx":     0,
		"pool":       nil,
		"ping":       nil,
		"updated_at": time.Now(),
	}).Error
	if err != nil {
		log.Errorf("[API] 数据库重置流量统计失败: %v", err)
		return fmt.Errorf("数据库重置流量统计失败: %v", err)
	}

	// 记录操作日志
	resetMessage2 := "重置流量统计信息"
	operationLog := models.TunnelOperationLog{
		TunnelID:   &tunnelWithEndpoint.ID,
		TunnelName: tunnelWithEndpoint.Name,
		Action:     models.OperationActionResetTraffic,
		Status:     "success",
		Message:    &resetMessage2,
		CreatedAt:  time.Now(),
	}
	if err := s.db.Create(&operationLog).Error; err != nil {
		log.Errorf("[API] 记录重置流量日志失败: %v", err)
		// 不返回错误，因为主要操作已经成功
	}

	log.Infof("[API] 隧道流量统计重置成功: instanceID=%s, name=%s", instanceID, tunnelWithEndpoint.Name)
	return nil
}

// updateEndpointTunnelCount 更新端点的隧道计数，使用重试机制避免死锁
func (s *Service) updateEndpointTunnelCount(endpointID int64) {
	err := db.ExecuteWithRetry(func(db *gorm.DB) error {
		return db.Model(&models.Endpoint{}).Where("id = ?", endpointID).
			Update("tunnel_count", db.Model(&models.Tunnel{}).
				Where("endpoint_id = ?", endpointID).
				Select("count(*)")).Error
	})

	if err != nil {
		log.Errorf("[API] 更新端点 %d 隧道计数失败: %v", endpointID, err)
	} else {
		log.Debugf("[API] 端点 %d 隧道计数已更新", endpointID)
	}
}

// GetTunnelsWithPagination 获取带分页和筛选的隧道列表（优化版本）
func (s *Service) GetTunnelsWithPagination(params TunnelQueryParams) (*TunnelListResult, error) {
	sqlDB, err := s.db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取数据库连接失败: %v", err)
	}

	// 优化策略1：分离主查询和关联查询，减少JOIN复杂度
	// 构建基础查询 - 只查询tunnels表
	baseQuery := "FROM tunnels t"

	// 构建 WHERE 条件
	var whereConditions []string
	var args []interface{}

	// 搜索筛选
	if params.Search != "" {
		whereConditions = append(whereConditions, "(t.name LIKE ? OR t.tunnel_address LIKE ? OR t.target_address LIKE ?)")
		args = append(args, "%"+params.Search+"%", "%"+params.Search+"%", "%"+params.Search+"%")
	}

	// 状态筛选
	if params.Status != "" && params.Status != "all" {
		switch params.Status {
		case "running":
			whereConditions = append(whereConditions, "t.status = ?")
			args = append(args, "running")
		case "stopped":
			whereConditions = append(whereConditions, "t.status = ?")
			args = append(args, "stopped")
		case "error":
			whereConditions = append(whereConditions, "t.status = ?")
			args = append(args, "error")
		case "offline":
			whereConditions = append(whereConditions, "t.status = ?")
			args = append(args, "offline")
		}
	}

	// 主控筛选
	if params.EndpointID != "" && params.EndpointID != "all" {
		whereConditions = append(whereConditions, "t.endpoint_id = ?")
		args = append(args, params.EndpointID)
	}

	// 主控组筛选（需要特殊处理，因为不在主表中）
	if params.EndpointGroupID != "" && params.EndpointGroupID != "all" {
		// 这里需要子查询来获取属于指定组的主控ID
		whereConditions = append(whereConditions, "t.endpoint_id IN (SELECT e.id FROM endpoints e WHERE e.group_id = ?)")
		args = append(args, params.EndpointGroupID)
	}

	// 端口筛选
	if params.PortFilter != "" {
		whereConditions = append(whereConditions, "t.tunnel_port LIKE ?")
		args = append(args, "%"+params.PortFilter+"%")
	}

	// 分组筛选（需要特殊处理，因为不在主表中）
	if params.GroupID != "" && params.GroupID != "all" {
		if params.GroupID == "ungrouped" {
			whereConditions = append(whereConditions, "t.id NOT IN (SELECT DISTINCT tunnel_id FROM tunnel_groups)")
		} else {
			whereConditions = append(whereConditions, "t.id IN (SELECT tunnel_id FROM tunnel_groups WHERE group_id = ?)")
			args = append(args, params.GroupID)
		}
	}

	// 构建完整的 WHERE 子句
	var whereClause string
	if len(whereConditions) > 0 {
		whereClause = " WHERE " + strings.Join(whereConditions, " AND ")
	}

	// 优化策略2：使用子查询优化COUNT，避免复杂JOIN
	countQuery := "SELECT COUNT(*) " + baseQuery + whereClause
	var total int
	err = sqlDB.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return nil, fmt.Errorf("获取总数失败: %v", err)
	}

	// 构建排序
	var orderClause string
	if params.SortBy != "" {
		switch params.SortBy {
		case "name":
			orderClause = fmt.Sprintf(" ORDER BY t.name %s", params.SortOrder)
		case "created_at":
			orderClause = fmt.Sprintf(" ORDER BY t.created_at %s", params.SortOrder)
		case "status":
			orderClause = fmt.Sprintf(" ORDER BY t.status %s", params.SortOrder)
		case "tunnelAddress":
			orderClause = fmt.Sprintf(" ORDER BY t.tunnel_address %s, t.tunnel_port %s", params.SortOrder, params.SortOrder)
		case "targetAddress":
			orderClause = fmt.Sprintf(" ORDER BY t.target_address %s, t.target_port %s", params.SortOrder, params.SortOrder)
		case "type":
			orderClause = fmt.Sprintf(" ORDER BY t.type %s", params.SortOrder)
		case "updated_at":
			orderClause = fmt.Sprintf(" ORDER BY t.updated_at %s", params.SortOrder)
		default:
			orderClause = " ORDER BY t.created_at DESC"
		}
	} else {
		orderClause = " ORDER BY t.created_at DESC"
	}

	// 构建分页
	offset := (params.Page - 1) * params.PageSize
	limitClause := " LIMIT ? OFFSET ?"
	args = append(args, params.PageSize, offset)

	// 优化策略3：先查询主表数据，再批量获取关联数据
	// 只查询需要的字段，在SQL中计算汇总值
	selectFields := `
		SELECT
			t.id, t.name, t.endpoint_id, t.type, t.tunnel_address, t.tunnel_port,
			t.target_address, t.target_port, t.status, t.instance_id,
			t.tcp_rx + t.udp_rx as total_rx,
			t.tcp_tx + t.udp_tx as total_tx
	`

	// 执行主查询
	query := selectFields + baseQuery + whereClause + orderClause + limitClause
	rows, err := sqlDB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询隧道列表失败: %v", err)
	}
	defer rows.Close()

	var tunnels []TunnelWithStats
	var endpointIDs []int64

	// 收集主数据
	for rows.Next() {
		var tunnel TunnelWithStats
		err := rows.Scan(
			&tunnel.ID, &tunnel.Name, &tunnel.EndpointID, &tunnel.Type,
			&tunnel.TunnelAddress, &tunnel.TunnelPort, &tunnel.TargetAddress, &tunnel.TargetPort,
			&tunnel.Status, &tunnel.InstanceID,
			&tunnel.TotalRx, &tunnel.TotalTx,
		)
		if err != nil {
			return nil, fmt.Errorf("扫描隧道数据失败: %v", err)
		}

		tunnels = append(tunnels, tunnel)
		endpointIDs = append(endpointIDs, tunnel.EndpointID)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历查询结果失败: %v", err)
	}

	// 优化策略4：批量获取关联数据，减少数据库查询次数
	if len(tunnels) > 0 {
		// 批量获取endpoint信息
		endpointMap, err := s.getEndpointsByIDs(endpointIDs)
		if err != nil {
			return nil, fmt.Errorf("获取主控信息失败: %v", err)
		}

		// 填充关联数据
		for i := range tunnels {
			// 填充endpoint信息
			if endpoint, exists := endpointMap[tunnels[i].EndpointID]; exists {
				tunnels[i].EndpointName = endpoint.Name
				// 添加version字段到tunnel中
				if tunnels[i].EndpointVersion == "" {
					tunnels[i].EndpointVersion = endpoint.Version
				}
			}
		}
	}

	// 计算总页数
	totalPages := (total + params.PageSize - 1) / params.PageSize

	return &TunnelListResult{
		Data:       tunnels,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.PageSize,
		TotalPages: totalPages,
	}, nil
}

// getEndpointsByIDs 批量获取主控信息
func (s *Service) getEndpointsByIDs(endpointIDs []int64) (map[int64]struct {
	ID      int64
	Name    string
	Status  string
	Version string
}, error) {
	if len(endpointIDs) == 0 {
		return make(map[int64]struct {
			ID      int64
			Name    string
			Status  string
			Version string
		}), nil
	}

	sqlDB, err := s.db.DB()
	if err != nil {
		return nil, err
	}

	// 构建IN查询
	placeholders := strings.Repeat("?,", len(endpointIDs))
	placeholders = placeholders[:len(placeholders)-1] // 移除最后一个逗号

	query := fmt.Sprintf(`
		SELECT e.id, e.name, e.status, COALESCE(e.ver, '') as version
		FROM endpoints e
		WHERE e.id IN (%s)
	`, placeholders)

	// 转换参数类型
	args := make([]interface{}, len(endpointIDs))
	for i, id := range endpointIDs {
		args[i] = id
	}

	rows, err := sqlDB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64]struct {
		ID      int64
		Name    string
		Status  string
		Version string
	})

	for rows.Next() {
		var endpoint struct {
			ID      int64
			Name    string
			Status  string
			Version string
		}
		err := rows.Scan(&endpoint.ID, &endpoint.Name, &endpoint.Status, &endpoint.Version)
		if err != nil {
			return nil, err
		}

		result[endpoint.ID] = endpoint
	}

	return result, nil
}

// getGroupsByTunnelIDs 批量获取分组信息
func (s *Service) getGroupsByTunnelIDs(tunnelIDs []int64) (map[int64][]models.Group, error) {
	if len(tunnelIDs) == 0 {
		return make(map[int64][]models.Group), nil
	}

	sqlDB, err := s.db.DB()
	if err != nil {
		return nil, err
	}

	// 构建IN查询
	placeholders := strings.Repeat("?,", len(tunnelIDs))
	placeholders = placeholders[:len(placeholders)-1] // 移除最后一个逗号

	query := fmt.Sprintf(`
		SELECT tt.tunnel_id, t.id, t.name
		FROM tunnel_groups tt
		JOIN groups t ON tt.group_id = t.id
		WHERE tt.tunnel_id IN (%s)
	`, placeholders)

	// 转换参数类型
	args := make([]interface{}, len(tunnelIDs))
	for i, id := range tunnelIDs {
		args[i] = id
	}

	rows, err := sqlDB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64][]models.Group)
	for rows.Next() {
		var tunnelID int64
		var group models.Group
		err := rows.Scan(&tunnelID, &group.ID, &group.Name)
		if err != nil {
			return nil, err
		}
		result[tunnelID] = append(result[tunnelID], group)
	}

	return result, nil
}

// getEndpointsWithGroups 获取端点及其分组信息
func (s *Service) getEndpointsWithGroups(endpointIDs []int) ([]struct {
	ID        int
	Name      string
	GroupID   *int
	GroupName *string
}, error) {
	sqlDB, err := s.db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取数据库连接失败: %v", err)
	}

	// 构建查询
	query := `
		SELECT e.id, e.name, e.group_id, eg.name AS group_name
		FROM endpoints e
		LEFT JOIN endpoint_groups eg ON e.group_id = eg.id
		WHERE e.id IN (?` + strings.Repeat(",?", len(endpointIDs)-1) + `)`

	args := make([]interface{}, len(endpointIDs))
	for i, id := range endpointIDs {
		args[i] = id
	}

	rows, err := sqlDB.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询端点信息失败: %v", err)
	}
	defer rows.Close()

	var endpoints []struct {
		ID        int
		Name      string
		GroupID   *int
		GroupName *string
	}

	for rows.Next() {
		var endpoint struct {
			ID        int
			Name      string
			GroupID   *int
			GroupName *string
		}
		var groupID sql.NullInt64
		var groupName sql.NullString

		err := rows.Scan(&endpoint.ID, &endpoint.Name, &groupID, &groupName)
		if err != nil {
			return nil, fmt.Errorf("扫描端点数据失败: %v", err)
		}

		if groupID.Valid {
			id := int(groupID.Int64)
			endpoint.GroupID = &id
		}
		if groupName.Valid {
			endpoint.GroupName = &groupName.String
		}

		endpoints = append(endpoints, endpoint)
	}

	// 确保返回空数组而不是nil
	if endpoints == nil {
		endpoints = []struct {
			ID        int
			Name      string
			GroupID   *int
			GroupName *string
		}{}
	}

	return endpoints, nil
}

// getEndpointWithGroup 获取单个端点及其分组信息
func (s *Service) getEndpointWithGroup(endpointID int) (struct {
	ID        int
	Name      string
	GroupName *string
}, error) {
	sqlDB, err := s.db.DB()
	if err != nil {
		return struct {
			ID        int
			Name      string
			GroupName *string
		}{}, fmt.Errorf("获取数据库连接失败: %v", err)
	}

	query := `
		SELECT e.id, e.name, eg.name AS group_name
		FROM endpoints e
		LEFT JOIN endpoint_groups eg ON e.group_id = eg.id
		WHERE e.id = ?`

	var endpoint struct {
		ID        int
		Name      string
		GroupName *string
	}
	var groupName sql.NullString

	err = sqlDB.QueryRow(query, endpointID).Scan(&endpoint.ID, &endpoint.Name, &groupName)
	if err != nil {
		return endpoint, fmt.Errorf("查询端点信息失败: %v", err)
	}

	if groupName.Valid {
		endpoint.GroupName = &groupName.String
	}

	return endpoint, nil
}

// getTunnelsByIDs 根据ID列表获取隧道信息
func (s *Service) getTunnelsByIDs(tunnelIDs []int) ([]models.Tunnel, error) {
	var tunnels []models.Tunnel

	if len(tunnelIDs) == 0 {
		return tunnels, nil
	}

	err := s.db.Where("id IN ?", tunnelIDs).Find(&tunnels).Error
	if err != nil {
		return nil, fmt.Errorf("查询隧道信息失败: %v", err)
	}

	// 确保返回空数组而不是nil
	if tunnels == nil {
		tunnels = []models.Tunnel{}
	}

	return tunnels, nil
}

// QuickCreateTunnelDirectURL 根据完整 URL 快速创建隧道实例，直接传递URL给NodePass API
// 这个方法避免了URL解析->重新组装的过程，提高性能并减少错误风险
func (s *Service) QuickCreateTunnelDirectURL(endpointID int64, rawURL string, name string, timeout time.Duration) error {
	// 1. 基本验证：只解析URL进行格式验证，但不使用解析结果重新组装
	parsedTunnel := nodepass.ParseTunnelURL(rawURL)
	if parsedTunnel == nil {
		return errors.New("无效的隧道URL格式")
	}

	// 2. 生成隧道名称
	finalName := name
	if strings.TrimSpace(finalName) == "" {
		finalName = fmt.Sprintf("auto-%d-%d", endpointID, time.Now().Unix())
	}

	// 3. 获取端点信息
	var endpoint struct {
		URL     string
		APIPath string
		APIKey  string
		Name    string
	}
	err := s.db.Raw(`SELECT url, api_path, api_key, name FROM endpoints WHERE id = ?`, endpointID).Scan(&endpoint).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return errors.New("指定的端点不存在")
		}
		return fmt.Errorf("查询端点信息失败: %v", err)
	}

	// 4. 直接使用原始URL调用NodePass API创建实例
	log.Infof("[NodePass] 直接URL创建实例 endpoint=%d url=%s", endpointID, rawURL)

	resp, err := nodepass.CreateInstance(endpointID, rawURL)
	if err != nil {
		log.Errorf("[NodePass] 直接URL创建实例失败 endpoint=%d url=%s err=%v", endpointID, rawURL, err)
		return err
	}

	log.Infof("[API] NodePass API 创建成功，instanceID=%s，开始等待SSE通知", resp.ID)

	// 5. 轮询等待数据库中存在该 endpointId+instanceId 记录（通过 SSE 通知）
	deadline := time.Now().Add(timeout)
	var tunnelID int64
	waitSuccess := false

	for time.Now().Before(deadline) {
		var existingTunnel models.Tunnel
		err := s.db.Select("id").Where("endpoint_id = ? AND instance_id = ?", endpointID, resp.ID).First(&existingTunnel).Error
		if err == nil {
			tunnelID = existingTunnel.ID
			waitSuccess = true
			break
		} else if err != gorm.ErrRecordNotFound {
			log.Warnf("[API] 查询隧道记录时出错: %v", err)
		}
		time.Sleep(200 * time.Millisecond)
	}

	if waitSuccess {
		log.Infof("[API] 直接URL等待SSE成功，更新隧道名称为: %s", finalName)

		// 6. 更新隧道名称为指定的名称
		err = s.db.Model(&models.Tunnel{}).Where("id = ?", tunnelID).Updates(map[string]interface{}{
			"name":       finalName,
			"updated_at": time.Now(),
		}).Error
		if err != nil {
			log.Warnf("[API] 更新隧道名称失败: %v", err)
		}

		// 7. 记录操作日志
		waitMessage := "隧道创建成功（直接URL模式）"
		operationLog := models.TunnelOperationLog{
			TunnelID:   &tunnelID,
			TunnelName: finalName,
			Action:     models.OperationActionCreate,
			Status:     "success",
			Message:    &waitMessage,
			CreatedAt:  time.Now(),
		}
		s.db.Create(&operationLog)

		// 8. 异步更新端点隧道计数
		go func(endpointID int64) {
			time.Sleep(50 * time.Millisecond)
			s.updateEndpointTunnelCount(endpointID)
		}(endpointID)

		// 9. 设置隧道别名
		if err := s.SetTunnelAlias(tunnelID, finalName); err != nil {
			log.Warnf("[API] 设置隧道别名失败，但不影响创建: %v", err)
		}

		log.Infof("[API] 隧道创建成功（直接URL模式）: %s (ID: %d, InstanceID: %s)", finalName, tunnelID, resp.ID)
		return nil
	}

	// 10. 等待超时，记录警告但不执行手动创建（因为实例已经在NodePass中创建）
	log.Warnf("[API] 直接URL等待SSE超时，但NodePass实例已创建: instanceID=%s", resp.ID)

	// 记录失败的操作日志
	failMessage := "隧道创建超时（直接URL模式），NodePass实例已创建但数据库未同步"
	operationLog := models.TunnelOperationLog{
		TunnelName: finalName,
		Action:     models.OperationActionCreate,
		Status:     "warning",
		Message:    &failMessage,
		CreatedAt:  time.Now(),
	}
	s.db.Create(&operationLog)

	return fmt.Errorf("等待数据库同步超时，但NodePass实例已创建(instanceID: %s)", resp.ID)
}
