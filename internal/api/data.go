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

	var importData struct {
		Version   string `json:"version"`
		Timestamp string `json:"timestamp"`
		Data      struct {
			Endpoints []EndpointExport `json:"endpoints"`
		} `json:"data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&importData); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
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

	for _, ep := range importData.Data.Endpoints {
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

	// 为每个新导入的端点启动SSE监听（学习HandleCreateEndpoint的逻辑）
	if h.sseManager != nil {
		for _, ep := range newEndpoints {
			go func(endpointID int64, url, apiPath, apiKey string) {
				log.Infof("[Master-%v] 导入成功，准备启动 SSE 监听", endpointID)
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
