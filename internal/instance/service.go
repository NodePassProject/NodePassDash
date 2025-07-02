package instance

import (
	"database/sql"
	"fmt"

	"NodePassDash/internal/nodepass"
)

// Instance 实例信息
type Instance struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Status string `json:"status"`
	TcpRx  int64  `json:"tcp_rx"`
	TcpTx  int64  `json:"tcp_tx"`
	UdpRx  int64  `json:"udp_rx"`
	UdpTx  int64  `json:"udp_tx"`
	Error  string `json:"error,omitempty"`
}

// Service 实例管理服务
type Service struct {
	db *sql.DB
}

// NewService 创建实例服务
func NewService(db *sql.DB) *Service {
	return &Service{db: db}
}

// GetInstances 获取指定端点的所有实例
func (s *Service) GetInstances(endpointURL, endpointAPIPath, endpointAPIKey string) ([]Instance, error) {
	// 使用 nodepass client
	client := nodepass.NewClient(endpointURL, endpointAPIPath, endpointAPIKey, nil)

	nodepassInstances, err := client.GetInstances()
	if err != nil {
		return nil, fmt.Errorf("调用NodePass API失败: %v", err)
	}

	// 转换 nodepass.Instance 到 instance.Instance
	instances := make([]Instance, len(nodepassInstances))
	for i, npInstance := range nodepassInstances {
		instances[i] = Instance{
			ID:     npInstance.ID,
			URL:    npInstance.URL,
			Status: npInstance.Status,
			TcpRx:  npInstance.TCPRx,
			TcpTx:  npInstance.TCPTx,
			UdpRx:  npInstance.UDPRx,
			UdpTx:  npInstance.UDPTx,
		}
	}

	return instances, nil
}

// GetInstance 获取单个实例信息
func (s *Service) GetInstance(endpointURL, endpointAPIPath, endpointAPIKey, instanceID string) (*Instance, error) {
	// 使用 nodepass client 获取所有实例，然后筛选指定 ID
	// 注意：nodepass client 目前没有单独的 GetInstance 方法，所以我们先获取所有实例
	instances, err := s.GetInstances(endpointURL, endpointAPIPath, endpointAPIKey)
	if err != nil {
		return nil, err
	}

	// 查找指定 ID 的实例
	for _, instance := range instances {
		if instance.ID == instanceID {
			return &instance, nil
		}
	}

	return nil, fmt.Errorf("未找到 ID 为 %s 的实例", instanceID)
}

// ControlInstance 控制实例状态（启动/停止/重启）
func (s *Service) ControlInstance(endpointURL, endpointAPIPath, endpointAPIKey, instanceID, action string) error {
	// 使用 nodepass client
	client := nodepass.NewClient(endpointURL, endpointAPIPath, endpointAPIKey, nil)

	_, err := client.ControlInstance(instanceID, action)
	if err != nil {
		return fmt.Errorf("控制实例失败: %v", err)
	}

	return nil
}

func (s *Service) GetInstanceTraffic(id int) ([]byte, error) {
	rows, err := s.db.Query("SELECT traffic_history FROM instances WHERE id = ?", id)
	if err != nil {
		return nil, fmt.Errorf("查询实例流量历史失败: %v", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, sql.ErrNoRows
	}

	var trafficHistory []byte
	if err := rows.Scan(&trafficHistory); err != nil {
		return nil, fmt.Errorf("读取流量历史数据失败: %v", err)
	}

	return trafficHistory, nil
}
