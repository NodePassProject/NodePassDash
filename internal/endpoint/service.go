package endpoint

import (
	"database/sql"
	"errors"
	"time"
)

// Service 端点管理服务
type Service struct {
	db *sql.DB
}

// NewService 创建端点服务实例
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// DB 返回底层 *sql.DB 以便其他层访问
func (s *Service) DB() *sql.DB {
	return s.db
}

// GetEndpoints 获取所有端点列表
func (s *Service) GetEndpoints() ([]EndpointWithStats, error) {
	query := `
		SELECT 
			e.id, e.name, e.url, e.apiPath, e.apiKey, e.status, e.color,
			e.lastCheck, e.createdAt, e.updatedAt,
			COUNT(t.id) as tunnel_count,
			COUNT(CASE WHEN t.status = 'running' THEN 1 END) as active_tunnels
		FROM "Endpoint" e
		LEFT JOIN "Tunnel" t ON e.id = t.endpointId
		GROUP BY e.id
		ORDER BY e.createdAt DESC
	`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var endpoints []EndpointWithStats
	for rows.Next() {
		var e EndpointWithStats
		var statusStr string
		err := rows.Scan(
			&e.ID, &e.Name, &e.URL, &e.APIPath, &e.APIKey, &statusStr, &e.Color,
			&e.LastCheck, &e.CreatedAt, &e.UpdatedAt,
			&e.TunnelCount, &e.ActiveTunnels,
		)
		if err != nil {
			return nil, err
		}
		e.Status = EndpointStatus(statusStr)
		endpoints = append(endpoints, e)
	}

	return endpoints, nil
}

// CreateEndpoint 创建新端点
func (s *Service) CreateEndpoint(req CreateEndpointRequest) (*Endpoint, error) {
	// 检查名称是否重复
	var exists bool
	err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM Endpoint WHERE name = ?)", req.Name).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("端点名称已存在")
	}

	// 检查URL是否重复
	err = s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM Endpoint WHERE url = ?)", req.URL).Scan(&exists)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("该URL已存在")
	}

	// 创建新端点
	query := `
		INSERT INTO "Endpoint" (name, url, apiPath, apiKey, status, color, lastCheck, createdAt, updatedAt)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	now := time.Now()
	result, err := s.db.Exec(query,
		req.Name,
		req.URL,
		req.APIPath,
		req.APIKey,
		StatusOffline,
		req.Color,
		now,
		now,
		now,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Endpoint{
		ID:        id,
		Name:      req.Name,
		URL:       req.URL,
		APIPath:   req.APIPath,
		APIKey:    req.APIKey,
		Status:    StatusOffline,
		Color:     req.Color,
		LastCheck: now,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

// UpdateEndpoint 更新端点信息
func (s *Service) UpdateEndpoint(req UpdateEndpointRequest) (*Endpoint, error) {
	// 检查端点是否存在
	var endpoint Endpoint
	var statusStr string
	err := s.db.QueryRow(
		"SELECT id, name, url, apiPath, apiKey, status, color, lastCheck, createdAt, updatedAt FROM \"Endpoint\" WHERE id = ?",
		req.ID,
	).Scan(
		&endpoint.ID, &endpoint.Name, &endpoint.URL, &endpoint.APIPath, &endpoint.APIKey,
		&statusStr, &endpoint.Color, &endpoint.LastCheck, &endpoint.CreatedAt, &endpoint.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("端点不存在")
		}
		return nil, err
	}
	endpoint.Status = EndpointStatus(statusStr)

	switch req.Action {
	case "rename":
		if req.Name == "" {
			return nil, errors.New("新名称不能为空")
		}
		// 检查新名称是否已存在
		var exists bool
		err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM Endpoint WHERE name = ? AND id != ?)", req.Name, req.ID).Scan(&exists)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, errors.New("端点名称已存在")
		}

		_, err = s.db.Exec("UPDATE \"Endpoint\" SET name = ?, updatedAt = ? WHERE id = ?",
			req.Name, time.Now(), req.ID)
		if err != nil {
			return nil, err
		}
		endpoint.Name = req.Name

	case "update":
		// 检查URL是否重复
		if req.URL != "" && req.URL != endpoint.URL {
			var exists bool
			err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM Endpoint WHERE url = ? AND id != ?)", req.URL, req.ID).Scan(&exists)
			if err != nil {
				return nil, err
			}
			if exists {
				return nil, errors.New("该URL已存在")
			}
		}

		// 若某些字段未提供，则保持原值
		newName := endpoint.Name
		if req.Name != "" {
			newName = req.Name
		}

		newURL := endpoint.URL
		if req.URL != "" {
			newURL = req.URL
		}

		newAPIPath := endpoint.APIPath
		if req.APIPath != "" {
			newAPIPath = req.APIPath
		}

		newAPIKey := endpoint.APIKey
		if req.APIKey != "" {
			newAPIKey = req.APIKey
		}

		// 更新端点信息
		query := `
			UPDATE "Endpoint" 
			SET name = ?, url = ?, apiPath = ?, apiKey = ?, updatedAt = ?
			WHERE id = ?
		`
		_, err = s.db.Exec(query,
			newName,
			newURL,
			newAPIPath,
			newAPIKey,
			time.Now(),
			req.ID,
		)
		if err != nil {
			return nil, err
		}

		endpoint.Name = newName
		endpoint.URL = newURL
		endpoint.APIPath = newAPIPath
		endpoint.APIKey = newAPIKey
	}

	endpoint.UpdatedAt = time.Now()
	return &endpoint, nil
}

// DeleteEndpoint 删除端点
func (s *Service) DeleteEndpoint(id int64) error {
	// 使用事务保证原子性：先删隧道再删端点
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}

	// 1) 删除关联隧道
	if _, err := tx.Exec(`DELETE FROM "Tunnel" WHERE endpointId = ?`, id); err != nil {
		tx.Rollback()
		return err
	}

	// 2) 删除SSE日志
	if _, err := tx.Exec(`DELETE FROM "EndpointSSE" WHERE endpointId = ?`, id); err != nil {
		tx.Rollback()
		return err
	}

	// 3) 删除端点
	res, err := tx.Exec(`DELETE FROM "Endpoint" WHERE id = ?`, id)
	if err != nil {
		tx.Rollback()
		return err
	}

	// 检查端点是否存在
	affected, err := res.RowsAffected()
	if err != nil {
		tx.Rollback()
		return err
	}
	if affected == 0 {
		tx.Rollback()
		return errors.New("端点不存在")
	}

	// 4) 删除回收站（不检查影响行数，因为可能没有回收站记录）
	_, err = tx.Exec(`DELETE FROM "TunnelRecycle" WHERE endpointId = ?`, id)
	if err != nil {
		tx.Rollback()
		return err
	}

	return tx.Commit()
}

// UpdateEndpointStatus 更新端点状态
func (s *Service) UpdateEndpointStatus(id int64, status EndpointStatus) error {
	_, err := s.db.Exec(
		"UPDATE \"Endpoint\" SET status = ?, lastCheck = ? WHERE id = ?",
		status, time.Now(), id,
	)
	return err
}

// GetEndpointByID 根据ID获取端点信息
func (s *Service) GetEndpointByID(id int64) (*Endpoint, error) {
	var e Endpoint
	var statusStr sql.NullString
	err := s.db.QueryRow(`SELECT id, name, url, apiPath, apiKey, status, color, lastCheck, createdAt, updatedAt FROM "Endpoint" WHERE id = ?`, id).
		Scan(&e.ID, &e.Name, &e.URL, &e.APIPath, &e.APIKey, &statusStr, &e.Color, &e.LastCheck, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("端点不存在")
		}
		return nil, err
	}
	e.Status = EndpointStatus(statusStr.String)
	return &e, nil
}

// SimpleEndpoint 简化端点信息结构
type SimpleEndpoint struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	URL         string         `json:"url"`
	APIPath     string         `json:"apiPath"`
	Status      EndpointStatus `json:"status"`
	TunnelCount int            `json:"tunnelCount"`
}

// GetSimpleEndpoints 获取简化端点列表，可排除 FAIL
func (s *Service) GetSimpleEndpoints(excludeFail bool) ([]SimpleEndpoint, error) {
	query := `SELECT e.id, e.name, e.url, e.apiPath, e.status, e.tunnelCount FROM "Endpoint" e`
	if excludeFail {
		query += ` WHERE e.status not in ('FAIL', 'DISCONNECT')`
	}
	query += ` ORDER BY e.createdAt DESC`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var endpoints []SimpleEndpoint
	for rows.Next() {
		var e SimpleEndpoint
		var statusStr string
		if err := rows.Scan(&e.ID, &e.Name, &e.URL, &e.APIPath, &statusStr, &e.TunnelCount); err != nil {
			return nil, err
		}
		e.Status = EndpointStatus(statusStr)
		endpoints = append(endpoints, e)
	}
	return endpoints, nil
}
