package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	log "NodePassDash/internal/log"
	"NodePassDash/internal/sse"
)

// DataHandler 负责导入/导出数据
type DataHandler struct {
	db         *sql.DB
	sseManager *sse.Manager
}

func NewDataHandler(db *sql.DB, mgr *sse.Manager) *DataHandler {
	return &DataHandler{db: db, sseManager: mgr}
}

// EndpointExport 导出端点结构（简化版，仅包含基本配置信息）
type EndpointExport struct {
	Name    string `json:"name"`
	URL     string `json:"url"`
	APIPath string `json:"apiPath"`
	APIKey  string `json:"apiKey"`
	Color   string `json:"color,omitempty"`
}

// EndpointExportV1 旧版本v1的端点结构（包含tunnels数据）
type EndpointExportV1 struct {
	Name    string         `json:"name"`
	URL     string         `json:"url"`
	APIPath string         `json:"apiPath"`
	APIKey  string         `json:"apiKey"`
	Status  string         `json:"status"`
	Tunnels []TunnelExport `json:"tunnels,omitempty"`
}

// TunnelExport 隧道导出结构
type TunnelExport struct {
	Name          string `json:"name"`
	Mode          string `json:"mode"`
	Status        string `json:"status"`
	TunnelAddress string `json:"tunnelAddress"`
	TunnelPort    string `json:"tunnelPort"`
	TargetAddress string `json:"targetAddress"`
	TargetPort    string `json:"targetPort"`
	TLSMode       string `json:"tlsMode"`
	LogLevel      string `json:"logLevel"`
	CommandLine   string `json:"commandLine"`
	InstanceID    string `json:"instanceId"`
	TCPRx         string `json:"tcpRx"`
	TCPTx         string `json:"tcpTx"`
	UDPRx         string `json:"udpRx"`
	UDPTx         string `json:"udpTx"`
}

// ---------- 导出 ----------
func (h *DataHandler) HandleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 查询端点（仅导出基本配置信息，不包括状态和隧道信息）
	rows, err := h.db.Query(`SELECT name, url, apiPath, apiKey, COALESCE(color, '') as color FROM "Endpoint" ORDER BY id`)
	if err != nil {
		log.Errorf("export query endpoints: %v", err)
		http.Error(w, "export failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var endpoints []EndpointExport
	for rows.Next() {
		var ep EndpointExport
		if err := rows.Scan(&ep.Name, &ep.URL, &ep.APIPath, &ep.APIKey, &ep.Color); err != nil {
			continue
		}
		endpoints = append(endpoints, ep)
	}

	payload := map[string]interface{}{
		"version":   "2.0", // 更新版本号以表示新的简化格式
		"timestamp": time.Now().Format(time.RFC3339),
		"data": map[string]interface{}{
			"endpoints": endpoints,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=nodepass-endpoints.json")
	json.NewEncoder(w).Encode(payload)
}

// ---------- 导入 ----------
func (h *DataHandler) HandleImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 首先解析基本结构以获取版本信息
	var baseImportData struct {
		Version   string      `json:"version"`
		Timestamp string      `json:"timestamp"`
		Data      interface{} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&baseImportData); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	// 根据版本选择不同的处理逻辑
	if baseImportData.Version == "1.0" {
		h.handleImportV1(w, r, baseImportData)
	} else {
		h.handleImportV2(w, r, baseImportData)
	}
}

// 处理v1版本导入（包含tunnels数据）
func (h *DataHandler) handleImportV1(w http.ResponseWriter, r *http.Request, baseData struct {
	Version   string      `json:"version"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data"`
}) {
	// 重新解析完整的v1格式数据
	r.Body.Close()
	var importDataV1 struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Data      struct {
			Endpoints []EndpointExportV1 `json:"endpoints"`
		} `json:"data"`
	}

	// 重新读取请求体并解析
	dataBytes, _ := json.Marshal(baseData)
	if err := json.Unmarshal(dataBytes, &importDataV1); err != nil {
		http.Error(w, "invalid v1 format", http.StatusBadRequest)
		return
	}

	var skippedEndpoints, importedEndpoints, importedTunnels int

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 存储新创建的端点信息，用于后续启动SSE
	var newEndpoints []struct {
		ID      int64
		URL     string
		APIPath string
		APIKey  string
	}

	for _, ep := range importDataV1.Data.Endpoints {
		var endpointID int64

		// 检查端点是否已存在
		if err := tx.QueryRow(`SELECT id FROM "Endpoint" WHERE url = ? AND apiPath = ?`, ep.URL, ep.APIPath).Scan(&endpointID); err != nil {
			if err == sql.ErrNoRows {
				// 端点不存在，创建新端点
				status := ep.Status
				if status == "" {
					status = "OFFLINE"
				}

				result, err := tx.Exec(`INSERT INTO "Endpoint" (name, url, apiPath, apiKey, status, tunnelCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
					ep.Name, ep.URL, ep.APIPath, ep.APIKey, status)
				if err != nil {
					log.Errorf("insert endpoint failed: %v", err)
					continue
				}

				// 获取新创建的端点ID
				endpointID, err = result.LastInsertId()
				if err != nil {
					log.Errorf("get last insert id failed: %v", err)
					continue
				}

				// 保存端点信息用于后续启动SSE
				newEndpoints = append(newEndpoints, struct {
					ID      int64
					URL     string
					APIPath string
					APIKey  string
				}{
					ID:      endpointID,
					URL:     ep.URL,
					APIPath: ep.APIPath,
					APIKey:  ep.APIKey,
				})

				importedEndpoints++
			} else {
				log.Errorf("check endpoint exists failed: %v", err)
				continue
			}
		} else {
			// 端点已存在
			skippedEndpoints++
		}

		// 无论端点是否存在，都要处理隧道数据
		for _, tunnel := range ep.Tunnels {
			// 检查隧道是否已存在（通过端点ID和隧道名称）
			var tunnelExists bool
			if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM "Tunnel" WHERE endpointId = ? AND name = ?)`, endpointID, tunnel.Name).Scan(&tunnelExists); err != nil {
				log.Errorf("check tunnel exists failed: %v", err)
				continue
			}
			if tunnelExists {
				log.Infof("隧道 %s 已存在于端点 %d，跳过导入", tunnel.Name, endpointID)
				continue
			}

			// 插入隧道数据（确保tunnel.Name被正确导入，包含commandLine字段）
			_, err := tx.Exec(`INSERT INTO "Tunnel" (
				name, endpointId, mode, tunnelAddress, tunnelPort, targetAddress, targetPort,
				tlsMode, logLevel, commandLine, instanceId, createdAt, updatedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
				tunnel.Name, endpointID, tunnel.Mode, tunnel.TunnelAddress, tunnel.TunnelPort,
				tunnel.TargetAddress, tunnel.TargetPort, tunnel.TLSMode, tunnel.LogLevel, tunnel.CommandLine, tunnel.InstanceID)

			if err != nil {
				log.Errorf("insert tunnel failed: %v", err)
				continue
			}

			log.Infof("成功导入隧道: %s 到端点 %d", tunnel.Name, endpointID)
			importedTunnels++
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "commit failed", http.StatusInternalServerError)
		return
	}

	// 为每个新导入的端点启动SSE监听
	if h.sseManager != nil {
		for _, ep := range newEndpoints {
			go func(endpointID int64, url, apiPath, apiKey string) {
				log.Infof("[Master-%v] v1数据导入成功，准备启动 SSE 监听", endpointID)
				if err := h.sseManager.ConnectEndpoint(endpointID, url, apiPath, apiKey); err != nil {
					log.Errorf("[Master-%v] 启动 SSE 监听失败: %v", endpointID, err)
				}
			}(ep.ID, ep.URL, ep.APIPath, ep.APIKey)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":           true,
		"message":           "v1格式数据导入成功",
		"importedEndpoints": importedEndpoints,
		"importedTunnels":   importedTunnels,
		"skippedEndpoints":  skippedEndpoints,
	})
}

// 处理v2版本导入（仅endpoints，不含tunnels）
func (h *DataHandler) handleImportV2(w http.ResponseWriter, r *http.Request, baseData struct {
	Version   string      `json:"version"`
	Timestamp string      `json:"timestamp"`
	Data      interface{} `json:"data"`
}) {
	// 重新解析v2格式数据
	var importDataV2 struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Data      struct {
			Endpoints []EndpointExport `json:"endpoints"`
		} `json:"data"`
	}

	dataBytes, _ := json.Marshal(baseData)
	if err := json.Unmarshal(dataBytes, &importDataV2); err != nil {
		http.Error(w, "invalid v2 format", http.StatusBadRequest)
		return
	}

	var skippedEndpoints int
	var importedEndpoints int

	tx, err := h.db.Begin()
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// 存储新创建的端点信息，用于后续启动SSE
	var newEndpoints []struct {
		ID      int64
		URL     string
		APIPath string
		APIKey  string
	}

	for _, ep := range importDataV2.Data.Endpoints {
		var exists bool
		if err := tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM "Endpoint" WHERE url = ? AND apiPath = ?)`, ep.URL, ep.APIPath).Scan(&exists); err != nil {
			continue
		}
		if exists {
			skippedEndpoints++
			continue
		}

		// 插入端点，设置默认状态为 OFFLINE
		result, err := tx.Exec(`INSERT INTO "Endpoint" (name, url, apiPath, apiKey, status, color, tunnelCount, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'OFFLINE', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
			ep.Name, ep.URL, ep.APIPath, ep.APIKey, ep.Color)
		if err != nil {
			log.Errorf("insert endpoint failed: %v", err)
			continue
		}

		// 获取新创建的端点ID
		endpointID, err := result.LastInsertId()
		if err != nil {
			log.Errorf("get last insert id failed: %v", err)
			continue
		}

		// 保存端点信息用于后续启动SSE
		newEndpoints = append(newEndpoints, struct {
			ID      int64
			URL     string
			APIPath string
			APIKey  string
		}{
			ID:      endpointID,
			URL:     ep.URL,
			APIPath: ep.APIPath,
			APIKey:  ep.APIKey,
		})

		importedEndpoints++
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "commit failed", http.StatusInternalServerError)
		return
	}

	// 为每个新导入的端点启动SSE监听
	if h.sseManager != nil {
		for _, ep := range newEndpoints {
			go func(endpointID int64, url, apiPath, apiKey string) {
				log.Infof("[Master-%v] v2数据导入成功，准备启动 SSE 监听", endpointID)
				if err := h.sseManager.ConnectEndpoint(endpointID, url, apiPath, apiKey); err != nil {
					log.Errorf("[Master-%v] 启动 SSE 监听失败: %v", endpointID, err)
				}
			}(ep.ID, ep.URL, ep.APIPath, ep.APIKey)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":           true,
		"message":           "端点配置导入成功",
		"importedEndpoints": importedEndpoints,
		"skippedEndpoints":  skippedEndpoints,
	})
}
