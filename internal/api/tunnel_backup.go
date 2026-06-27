package api

import (
	log "NodePassDash/internal/log"
	"NodePassDash/internal/models"
	"NodePassDash/internal/nodepass"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// BackupVersion 当前导出文件结构的版本号，方便后续做不兼容升级。
const BackupVersion = 1

// BackupInstance 表示备份导出中的一条隧道实例。
// 字段是数据库 tunnels 表的可还原配置子集；运行时统计（流量/连接数等）不导出。
type BackupInstance struct {
	Name        string  `json:"name"`
	Type        string  `json:"type"`
	CommandLine string  `json:"commandLine"`
	InstanceID  *string `json:"instanceId,omitempty"`

	TunnelAddress       string    `json:"tunnelAddress,omitempty"`
	TunnelPort          string    `json:"tunnelPort,omitempty"`
	TargetAddress       string    `json:"targetAddress,omitempty"`
	TargetPort          string    `json:"targetPort,omitempty"`
	ExtendTargetAddress *[]string `json:"extendTargetAddress,omitempty"`

	TLSMode       string             `json:"tlsMode,omitempty"`
	LogLevel      string             `json:"logLevel,omitempty"`
	CertPath      *string            `json:"certPath,omitempty"`
	KeyPath       *string            `json:"keyPath,omitempty"`
	Password      *string            `json:"password,omitempty"`
	Restart       *bool              `json:"restart,omitempty"`
	Mode          *int               `json:"mode,omitempty"`
	Rate          *int64             `json:"rate,omitempty"`
	Read          *string            `json:"read,omitempty"`
	Min           *int64             `json:"min,omitempty"`
	Max           *int64             `json:"max,omitempty"`
	Slot          *int64             `json:"slot,omitempty"`
	ProxyProtocol *bool              `json:"proxyProtocol,omitempty"`
	Tags          *map[string]string `json:"tags,omitempty"`
	Dial          *string            `json:"dial,omitempty"`
	PoolType      *int               `json:"poolType,omitempty"`
	Dns           *string            `json:"dns,omitempty"`
	Sni           *string            `json:"sni,omitempty"`
	Block         *int               `json:"block,omitempty"`
	Lbs           *int               `json:"lbs,omitempty"`
	ListenType    *string            `json:"listenType,omitempty"`
	Peer          *models.Peer       `json:"peer,omitempty"`
	ConfigLine    *string            `json:"configLine,omitempty"`
}

// BackupSource 记录备份来源信息，方便用户辨识。
type BackupSource struct {
	EndpointID   int64   `json:"endpointId"`
	EndpointName string  `json:"endpointName"`
	EndpointURL  string  `json:"endpointUrl"`
	EndpointVer  *string `json:"endpointVer,omitempty"`
}

// BackupExport 备份文件的顶层结构。
type BackupExport struct {
	Version    int              `json:"version"`
	ExportedAt time.Time        `json:"exportedAt"`
	Source     BackupSource     `json:"source"`
	Count      int              `json:"count"`
	Instances  []BackupInstance `json:"instances"`
}

// ImportResultItem 单条实例的导入结果。
type ImportResultItem struct {
	Name       string `json:"name"`
	Status     string `json:"status"` // success | skipped | failed
	Reason     string `json:"reason,omitempty"`
	InstanceID string `json:"instanceId,omitempty"`
}

// ImportResponse 导入接口的聚合返回。
type ImportResponse struct {
	Success  bool               `json:"success"`
	Imported int                `json:"imported"`
	Skipped  int                `json:"skipped"`
	Failed   int                `json:"failed"`
	Total    int                `json:"total"`
	Results  []ImportResultItem `json:"results"`
}

// tunnelToBackupInstance 把 GORM 模型转换成可序列化的备份条目。
func tunnelToBackupInstance(t models.Tunnel) BackupInstance {
	bi := BackupInstance{
		Name:                t.Name,
		Type:                string(t.Type),
		CommandLine:         t.CommandLine,
		InstanceID:          t.InstanceID,
		TunnelAddress:       t.TunnelAddress,
		TunnelPort:          t.TunnelPort,
		TargetAddress:       t.TargetAddress,
		TargetPort:          t.TargetPort,
		ExtendTargetAddress: t.ExtendTargetAddress,
		TLSMode:             string(t.TLSMode),
		LogLevel:            string(t.LogLevel),
		CertPath:            t.CertPath,
		KeyPath:             t.KeyPath,
		Password:            t.Password,
		Restart:             t.Restart,
		Rate:                t.Rate,
		Read:                t.Read,
		Min:                 t.Min,
		Max:                 t.Max,
		Slot:                t.Slot,
		ProxyProtocol:       t.ProxyProtocol,
		Tags:                t.Tags,
		Dial:                t.Dial,
		PoolType:            t.PoolType,
		Dns:                 t.Dns,
		Sni:                 t.Sni,
		Block:               t.Block,
		Lbs:                 t.Lbs,
		ListenType:          t.ListenType,
		Peer:                t.Peer,
		ConfigLine:          t.ConfigLine,
	}
	if t.Mode != nil {
		v := int(*t.Mode)
		bi.Mode = &v
	}
	return bi
}

// HandleBackupInstances 导出主控下所有实例的可还原配置 (GET /api/endpoints/:id/backup-instances)。
// 直接读取数据库 tunnels 表，主控失联仍可使用。
func (h *TunnelHandler) HandleBackupInstances(c *gin.Context) {
	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid endpointId parameter"})
		return
	}

	var endpoint models.Endpoint
	if err := h.tunnelService.GormDB().
		Select("id, name, url, api_path, ver").
		Where("id = ?", endpointID).
		First(&endpoint).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Endpoint not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load endpoint"})
		return
	}

	var tunnels []models.Tunnel
	if err := h.tunnelService.GormDB().
		Where("endpoint_id = ?", endpointID).
		Order("id ASC").
		Find(&tunnels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
		return
	}

	instances := make([]BackupInstance, 0, len(tunnels))
	for _, t := range tunnels {
		instances = append(instances, tunnelToBackupInstance(t))
	}

	export := BackupExport{
		Version:    BackupVersion,
		ExportedAt: time.Now(),
		Source: BackupSource{
			EndpointID:   endpoint.ID,
			EndpointName: endpoint.Name,
			EndpointURL:  endpoint.URL + endpoint.APIPath,
			EndpointVer:  endpoint.Ver,
		},
		Count:     len(instances),
		Instances: instances,
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    export,
	})
}

// HandleImportInstances 把备份 JSON 还原为目标主控上的实例 (POST /api/endpoints/:id/import-instances)。
// 冲突策略：与目标主控上同名实例冲突时跳过该条；按条返回 success/skipped/failed 结果。
func (h *TunnelHandler) HandleImportInstances(c *gin.Context) {
	endpointIDStr := c.Param("id")
	endpointID, err := strconv.ParseInt(endpointIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid endpointId parameter"})
		return
	}

	// 目标主控存在性校验
	var target models.Endpoint
	if err := h.tunnelService.GormDB().
		Select("id, name").
		Where("id = ?", endpointID).
		First(&target).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Endpoint not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load endpoint"})
		return
	}

	// 同时支持顶层 BackupExport 结构和直接的 BackupInstance 数组，方便手动构造导入。
	var raw struct {
		Version   int              `json:"version"`
		Instances []BackupInstance `json:"instances"`
	}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid request data: " + err.Error()})
		return
	}

	if len(raw.Instances) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No instances provided"})
		return
	}

	if raw.Version != 0 && raw.Version > BackupVersion {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Unsupported backup version",
		})
		return
	}

	// 预先把目标主控现有 tunnel 的名称取出来用于冲突判定。
	existingNames := make(map[string]struct{})
	{
		var rows []struct {
			Name string
		}
		if err := h.tunnelService.GormDB().
			Model(&models.Tunnel{}).
			Where("endpoint_id = ?", endpointID).
			Select("name").
			Find(&rows).Error; err == nil {
			for _, r := range rows {
				existingNames[strings.TrimSpace(r.Name)] = struct{}{}
			}
		}
	}

	resp := ImportResponse{
		Success: true,
		Total:   len(raw.Instances),
		Results: make([]ImportResultItem, 0, len(raw.Instances)),
	}

	for _, item := range raw.Instances {
		name := strings.TrimSpace(item.Name)
		cmd := strings.TrimSpace(item.CommandLine)

		if cmd == "" {
			resp.Failed++
			resp.Results = append(resp.Results, ImportResultItem{
				Name:   name,
				Status: "failed",
				Reason: "缺少 commandLine",
			})
			continue
		}

		if _, exists := existingNames[name]; exists && name != "" {
			resp.Skipped++
			resp.Results = append(resp.Results, ImportResultItem{
				Name:   name,
				Status: "skipped",
				Reason: "同名实例已存在",
			})
			continue
		}

		instanceID, importErr := h.importSingleInstance(endpointID, item)
		if importErr != nil {
			resp.Failed++
			resp.Results = append(resp.Results, ImportResultItem{
				Name:       name,
				Status:     "failed",
				Reason:     importErr.Error(),
				InstanceID: instanceID,
			})
			continue
		}

		if name != "" {
			existingNames[name] = struct{}{}
		}
		resp.Imported++
		resp.Results = append(resp.Results, ImportResultItem{
			Name:       name,
			Status:     "success",
			InstanceID: instanceID,
		})
	}

	c.JSON(http.StatusOK, resp)
}

// importSingleInstance 在目标主控创建一条实例并尝试还原其附加元数据。
// 返回新 instanceID（即使后续 PATCH 失败也会返回，便于排查）。
func (h *TunnelHandler) importSingleInstance(endpointID int64, item BackupInstance) (string, error) {
	created, err := nodepass.CreateInstance(endpointID, item.CommandLine)
	if err != nil {
		return "", err
	}

	newInstanceID := created.ID
	name := strings.TrimSpace(item.Name)

	// 等待本地 SSE 同步出新的 tunnel 记录，再做后续重命名/标签等动作。
	tunnelID, waitErr := h.waitTunnelSynced(endpointID, newInstanceID, 3*time.Second)
	if waitErr != nil {
		log.Warnf("[Backup] 等待 SSE 同步超时 endpoint=%d instance=%s err=%v", endpointID, newInstanceID, waitErr)
	}

	if name != "" {
		if _, err := nodepass.RenameInstance(endpointID, newInstanceID, name); err != nil {
			log.Warnf("[Backup] 设置别名失败 endpoint=%d instance=%s err=%v", endpointID, newInstanceID, err)
		} else if tunnelID > 0 {
			_ = h.tunnelService.GormDB().Model(&models.Tunnel{}).
				Where("id = ?", tunnelID).
				Updates(map[string]interface{}{
					"name":       name,
					"updated_at": time.Now(),
				}).Error
		}
	}

	if item.Restart != nil {
		if _, err := nodepass.SetRestartInstance(endpointID, newInstanceID, *item.Restart); err != nil {
			log.Warnf("[Backup] 设置 restart 失败 endpoint=%d instance=%s err=%v", endpointID, newInstanceID, err)
		}
	}

	if item.Tags != nil && len(*item.Tags) > 0 {
		if _, err := nodepass.UpdateInstanceTags(endpointID, newInstanceID, *item.Tags); err != nil {
			log.Warnf("[Backup] 设置 tags 失败 endpoint=%d instance=%s err=%v", endpointID, newInstanceID, err)
		}
	}

	if item.Peer != nil {
		if _, err := nodepass.UpdateInstancePeers(endpointID, newInstanceID, item.Peer); err != nil {
			log.Warnf("[Backup] 设置 peer 失败 endpoint=%d instance=%s err=%v", endpointID, newInstanceID, err)
		} else {
			// PATCH peer 成功后，直接把已有 service 的对应那一侧指到新 (endpointID, newInstanceID)，
			// 不再依赖后续 SSE 事件的时序。SSE 到达时 upsertService 会再用 OnConflict 兜底刷新一次。
			if item.Peer.SID != nil && *item.Peer.SID != "" &&
				item.Peer.Type != nil && *item.Peer.Type != "" {
				tunnelType := models.TunnelType(item.Type)
				if rerr := models.RelinkServiceForInstance(
					h.tunnelService.GormDB(),
					*item.Peer.SID,
					*item.Peer.Type,
					tunnelType,
					endpointID,
					newInstanceID,
				); rerr != nil {
					log.Warnf("[Backup] relink service 失败 sid=%s type=%s endpoint=%d instance=%s err=%v",
						*item.Peer.SID, *item.Peer.Type, endpointID, newInstanceID, rerr)
				}
			}
		}
	}

	return newInstanceID, nil
}

// waitTunnelSynced 轮询数据库等待 SSE 把新建实例写入 tunnels 表。
func (h *TunnelHandler) waitTunnelSynced(endpointID int64, instanceID string, timeout time.Duration) (int64, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var t models.Tunnel
		err := h.tunnelService.GormDB().
			Select("id").
			Where("endpoint_id = ? AND instance_id = ?", endpointID, instanceID).
			First(&t).Error
		if err == nil {
			return t.ID, nil
		}
		if err != gorm.ErrRecordNotFound {
			return 0, err
		}
		time.Sleep(150 * time.Millisecond)
	}
	return 0, gorm.ErrRecordNotFound
}
