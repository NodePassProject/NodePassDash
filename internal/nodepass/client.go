package nodepass

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	// 引入系统代理检测 (Windows/macOS)
	"github.com/mattn/go-ieproxy"
)

// Client 封装与 NodePass HTTP API 的交互
// 每个端点可根据自身 URL / API 路径 / API Key 构造一个实例
// 示例：
//  client := nodepass.NewClient(endpointURL, apiPath, apiKey)
//  id, status, _ := client.CreateInstance("server://0.0.0.0:80/127.0.0.1:8080")
//  _ = client.DeleteInstance(id)
//  newStatus, _ := client.ControlInstance(id, "restart")
//
// 该实现内部统一设置 Content-Type 与 X-API-Key 头，并提供超时设置。

type Client struct {
	baseURL    string
	apiPath    string
	apiKey     string
	httpClient *http.Client
}

// NewClient 新建客户端；httpClient 为空时使用默认 15 秒超时
func NewClient(baseURL, apiPath, apiKey string, httpClient *http.Client) *Client {
	if httpClient == nil {
		// 复制默认 Transport 并禁用证书校验，以支持自建/自签名 SSL
		tr := http.DefaultTransport.(*http.Transport).Clone()
		// 启用系统/环境代理检测：先读 env，再回退到系统代理
		tr.Proxy = ieproxy.GetProxyFunc()
		if tr.TLSClientConfig == nil {
			tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		} else {
			tr.TLSClientConfig.InsecureSkipVerify = true
		}
		httpClient = &http.Client{
			Timeout:   15 * time.Second,
			Transport: tr,
		}
	}
	return &Client{
		baseURL:    baseURL,
		apiPath:    apiPath,
		apiKey:     apiKey,
		httpClient: httpClient,
	}
}

// CreateInstance 创建隧道实例，返回实例 ID 与状态(running/stopped 等)
func (c *Client) CreateInstance(commandLine string) (string, string, error) {
	url := fmt.Sprintf("%s%s/instances", c.baseURL, c.apiPath)
	payload := map[string]string{"url": commandLine}

	var resp struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := c.doRequest(http.MethodPost, url, payload, &resp); err != nil {
		return "", "", err
	}
	return resp.ID, resp.Status, nil
}

// DeleteInstance 删除指定实例
func (c *Client) DeleteInstance(instanceID string) error {
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	return c.doRequest(http.MethodDelete, url, nil, nil)
}

// ControlInstance 对实例执行 start/stop/restart 操作，返回最新状态
func (c *Client) ControlInstance(instanceID, action string) (string, error) {
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	payload := map[string]string{"action": action}

	var resp struct {
		Status string `json:"status"`
	}
	if err := c.doRequest(http.MethodPatch, url, payload, &resp); err != nil {
		return "", err
	}
	return resp.Status, nil
}

// UpdateInstance 更新指定实例的命令行 (PUT /instances/{id})
func (c *Client) UpdateInstance(instanceID, commandLine string) error {
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	payload := map[string]string{"url": commandLine}

	return c.doRequest(http.MethodPut, url, payload, nil)
}

// UpdateInstanceV1 更新指定实例的命令行 (PUT /v1/instance/{id})
// 与旧版 UpdateInstance 不同，此方法使用新版接口路径 /v1/instance/{id}
// 当远端核心升级后，应优先调用本方法。
func (c *Client) UpdateInstanceV1(instanceID, commandLine string) error {
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	payload := map[string]string{"url": commandLine}

	return c.doRequest(http.MethodPut, url, payload, nil)
}

// PatchInstance 更新指定实例的别名 (PATCH /instances/{id})
func (c *Client) RenameInstance(instanceID string, name string) error {
	payload := map[string]string{"alias": name}
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	if err := c.doRequest(http.MethodPatch, url, payload, nil); err != nil {
		return err
	}
	return nil
}

// PatchInstance 更新指定实例的重启策略 (PATCH /instances/{id})
func (c *Client) SetRestartInstance(instanceID string, restart bool) error {
	payload := map[string]bool{"restart": restart}
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	if err := c.doRequest(http.MethodPatch, url, payload, nil); err != nil {
		return err
	}
	return nil
}

// ResetInstanceTraffic 重置指定实例的流量统计 (PATCH /instances/{id})
func (c *Client) ResetInstanceTraffic(instanceID string) error {
	payload := map[string]string{"action": "reset"}
	url := fmt.Sprintf("%s%s/instances/%s", c.baseURL, c.apiPath, instanceID)
	if err := c.doRequest(http.MethodPatch, url, payload, nil); err != nil {
		return err
	}
	return nil
}

// GetInfo 获取NodePass实例的系统信息
func (c *Client) GetInfo() (*EndpointInfoResult, error) {
	url := fmt.Sprintf("%s%s/info", c.baseURL, c.apiPath)
	var resp EndpointInfoResult
	if err := c.doRequest(http.MethodGet, url, nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// doRequest 内部方法：构建并发送 HTTP 请求，解析 JSON
func (c *Client) doRequest(method, url string, body interface{}, dest interface{}) error {
	var buf *bytes.Buffer
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		buf = bytes.NewBuffer(data)
	} else {
		buf = &bytes.Buffer{}
	}

	req, err := http.NewRequest(method, url, buf)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	if method != http.MethodGet && method != http.MethodDelete {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("NodePass API 返回错误: %d", resp.StatusCode)
	}

	if dest != nil {
		if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
			return err
		}
	}
	return nil
}

// doRequestWithClient 内部方法：使用指定的HTTP客户端构建并发送请求，解析 JSON
func (c *Client) doRequestWithClient(client *http.Client, method, url string, body interface{}, dest interface{}) error {
	var buf *bytes.Buffer
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		buf = bytes.NewBuffer(data)
	} else {
		buf = &bytes.Buffer{}
	}

	req, err := http.NewRequest(method, url, buf)
	if err != nil {
		return err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	if method != http.MethodGet && method != http.MethodDelete {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("NodePass API 返回错误: %d", resp.StatusCode)
	}

	if dest != nil {
		if err := json.NewDecoder(resp.Body).Decode(dest); err != nil {
			return err
		}
	}
	return nil
}

// InstanceResult 表示 NodePass 中的隧道实例信息
// 与 NodePass API /instances 响应保持一致
//
// 示例响应:
// [
//
//	{
//	  "id": "860e24a3",
//	  "type": "client",
//	  "status": "running",
//	  "url": "client://:3004/:3008?log=debug&max=100&min=10",
//	  "tcprx": 0,
//	  "tcptx": 0,
//	  "udprx": 0,
//	  "udptx": 0,
//	  "pool": 0,
//	  "ping": 0
//	}
//
// ]
//
// 字段保持驼峰以方便 JSON 解析
//
//go:generate stringer -type=Instance
type InstanceResult struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`   // client|server
	Status  string  `json:"status"` // running|stopped|error
	URL     string  `json:"url"`
	TCPRx   int64   `json:"tcprx"`
	TCPTx   int64   `json:"tcptx"`
	UDPRx   int64   `json:"udprx"`
	UDPTx   int64   `json:"udptx"`
	Pool    *int64  `json:"pool,omitempty"`
	Ping    *int64  `json:"ping,omitempty"`
	Alias   *string `json:"alias,omitempty"`
	Restart *bool   `json:"restart,omitempty"`
	TCPs    *int64  `json:"tcps,omitempty"`
	UDPs    *int64  `json:"udps,omitempty"`
}

// EndpointInfoResult NodePass实例的系统信息
type EndpointInfoResult struct {
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	Ver    string `json:"ver"`
	Name   string `json:"name"`
	Log    string `json:"log"`
	TLS    string `json:"tls"`
	Crt    string `json:"crt"`
	Key    string `json:"key"`
	Uptime *int64 `json:"uptime,omitempty"` // 使用指针类型，支持低版本兼容
}

// TCPingResult 表示TCP连接测试的结果
type TCPingResult struct {
	Target    string `json:"target"`
	Connected bool   `json:"connected"`
	Latency   int64  `json:"latency"` // 延迟时间，单位毫秒（保持兼容性）
	Error     string `json:"error"`   // 错误信息，连接成功时为null
	// 新增字段 - 5次测试统计
	TotalTests      int      `json:"totalTests"`      // 总测试次数
	SuccessfulTests int      `json:"successfulTests"` // 成功测试次数
	MinLatency      *int64   `json:"minLatency"`      // 最快响应时间（毫秒）
	MaxLatency      *int64   `json:"maxLatency"`      // 最慢响应时间（毫秒）
	AvgLatency      *float64 `json:"avgLatency"`      // 平均响应时间（毫秒）
	PacketLoss      float64  `json:"packetLoss"`      // 丢包率（百分比）
}

// TCPing 执行TCP连接测试，检测目标地址的连通性和延迟
// target 参数格式为 host:port，例如 "example.com:80"
// 进行5次测试并返回统计信息
func (c *Client) TCPing(target string) (*TCPingResult, error) {
	const testCount = 5

	result := &TCPingResult{
		Target:          target,
		TotalTests:      testCount,
		SuccessfulTests: 0,
		PacketLoss:      0.0,
	}

	var latencies []int64
	var errors []string

	// 进行5次测试
	for i := 0; i < testCount; i++ {
		url := fmt.Sprintf("%s%s/tcping?target=%s", c.baseURL, c.apiPath, target)

		// 单次测试结果结构
		var singleResult struct {
			Target    string `json:"target"`
			Connected bool   `json:"connected"`
			Latency   int64  `json:"latency"`
			Error     string `json:"error"`
		}

		// 为单次测试创建5秒超时的HTTP客户端
		timeoutClient := &http.Client{
			Timeout:   5 * time.Second,
			Transport: c.httpClient.Transport, // 复用原有的Transport配置
		}

		// 使用超时客户端进行请求
		if err := c.doRequestWithClient(timeoutClient, http.MethodGet, url, nil, &singleResult); err != nil {
			// 网络请求失败或超时，算作丢包
			errors = append(errors, err.Error())
			continue
		}

		if singleResult.Connected {
			// 连接成功
			result.SuccessfulTests++
			latencies = append(latencies, singleResult.Latency)
		} else {
			// 连接失败
			if singleResult.Error != "" {
				errors = append(errors, singleResult.Error)
			} else {
				errors = append(errors, "连接失败")
			}
		}

		// 避免测试过于频繁，间隔100ms
		if i < testCount-1 {
			time.Sleep(100 * time.Millisecond)
		}
	}

	// 计算统计信息
	if result.SuccessfulTests > 0 {
		result.Connected = true

		// 计算延迟统计
		var sum int64
		minLat := latencies[0]
		maxLat := latencies[0]

		for _, lat := range latencies {
			sum += lat
			if lat < minLat {
				minLat = lat
			}
			if lat > maxLat {
				maxLat = lat
			}
		}

		result.MinLatency = &minLat
		result.MaxLatency = &maxLat
		avgLat := float64(sum) / float64(len(latencies))
		result.AvgLatency = &avgLat
		result.Latency = minLat // 保持兼容性，使用最快响应时间

	} else {
		// 全部失败时仍然返回基本信息，延迟字段设为nil
		result.Connected = false
		result.MinLatency = nil
		result.MaxLatency = nil
		result.AvgLatency = nil
		result.Latency = 0
		// 不设置Error字段，前端不显示错误信息
	}

	// 计算丢包率
	result.PacketLoss = float64(testCount-result.SuccessfulTests) / float64(testCount) * 100.0

	return result, nil
}

// GetInstances 获取所有隧道实例列表
func (c *Client) GetInstances() ([]InstanceResult, error) {
	url := fmt.Sprintf("%s%s/instances", c.baseURL, c.apiPath)
	var resp []InstanceResult
	if err := c.doRequest(http.MethodGet, url, nil, &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

// server://<bind_addr>:<bind_port>/<target_host>:<target_port>?<参数>
// client://<server_host>:<server_port>/<local_host>:<local_port>?<参数>
// 支持参数:log、tls、crt、key、min、max、mode、read、rate
// log=none|debug|info|warn|error|event
// min／max：连接池容量（min 由客户端设置，max由服务端设置并在握手时传递给客户端)
// tls=0,1,2
// tls_crt=path 证书/密钥文件路径 (当 tls=2 时)
// tls_key=path 证书/密钥文件路径 (当 tls=2 时)
// read：数据读取超时时长（如1h、30m、15s）
// rate：带宽速率限制，单位Mbps（0=无限制）

// 数据读取超时可以通过URL查询参数read 设置，单位为秒或分钟：
// read:数据读取超时时间(默认:10分钟)
// # 设置数据读取超时为5分钟
// nodepass "client://server.example.com:10101/127.0.0.1:8080?read=5m"

// # 设置数据读取超时为30秒，适用于快速响应应用
// nodepass "client://server.example.com:10101/127.0.0.1:8080?read=30s"

// # 设置数据读取超时为30分钟，适用于长时间传输
// nodepass "client://server.example.com:10101/127.0.0.1:8080?read=30m"

// 重新生成API Key（需要知道当前的API Key）
// async function regenerateApiKey() {
// 	const response = await fetch(`${API_URL}/instances/${apiKeyID}`, {
// 	  method: 'PATCH',
// 	  headers: {
// 		'Content-Type': 'application/json',
// 		'X-API-Key': 'current-api-key'
// 	  },
// 	  body: JSON.stringify({ action: 'restart' })
// 	});

// 	const result = await response.json();
// 	return result.url; // 新的API Key
//   }

// NodePass支持通过rate参数进行带宽速率限制，用于流量控制。此功能有助于防止网络拥塞，确保多个连接间的公平资源分配。

// rate: 最大带宽限制，单位为Mbps（兆比特每秒）
// 值为0或省略：无速率限制（无限带宽）
// 正整数：以Mbps为单位的速率限制（例如，10表示10 Mbps）
// 同时应用于上传和下载流量
// 使用令牌桶算法进行平滑流量整形
// 示例：

// # 限制带宽为50 Mbps
// nodepass "server://0.0.0.0:10101/0.0.0.0:8080?rate=50"

// # 客户端100 Mbps速率限制
// nodepass "client://server.example.com:10101/127.0.0.1:8080?rate=100"

// # 与其他参数组合使用
// nodepass "server://0.0.0.0:10101/0.0.0.0:8080?log=error&tls=1&rate=50"
// 速率限制使用场景：

// 带宽控制：防止NodePass消耗所有可用带宽
// 公平共享：确保多个应用程序可以共享网络资源
// 成本管理：在按流量计费的网络环境中控制数据使用
// QoS合规：满足带宽使用的服务级别协议
// 测试：模拟低带宽环境进行应用程序测试
