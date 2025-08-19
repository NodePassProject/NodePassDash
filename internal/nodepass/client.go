package nodepass

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	// 引入系统代理检测 (Windows/macOS)
	"github.com/mattn/go-ieproxy"
)

// 全局 HTTP 客户端，只初始化一次
var (
	globalHTTPClient *http.Client
	httpClientOnce   sync.Once
)

// createGlobalHTTPClient 获取全局 HTTP 客户端，确保只初始化一次
func createGlobalHTTPClient() *http.Client {
	httpClientOnce.Do(func() {
		// 复制默认 Transport 并禁用证书校验，以支持自建/自签名 SSL
		tr := http.DefaultTransport.(*http.Transport).Clone()
		// 启用系统/环境代理检测：先读 env，再回退到系统代理
		tr.Proxy = ieproxy.GetProxyFunc()
		if tr.TLSClientConfig == nil {
			tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		} else {
			tr.TLSClientConfig.InsecureSkipVerify = true
		}
		globalHTTPClient = &http.Client{
			Timeout:   15 * time.Second,
			Transport: tr,
		}
	})
	return globalHTTPClient
}

// buildClient 获取客户端的 HTTP 客户端，如果为空则使用全局客户端
func getClient() *http.Client {
	if globalHTTPClient == nil {
		createGlobalHTTPClient()
	}
	return globalHTTPClient
}

// request 执行 HTTP 请求的通用方法
func request(method, url, apiKey string, body interface{}, dest interface{}) error {
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
	req.Header.Set("X-API-Key", apiKey)
	if method != http.MethodGet && method != http.MethodDelete {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := getClient().Do(req)
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

// GetInstances 获取所有隧道实例列表
func GetInstances(endpointID int64) ([]InstanceResult, error) {
	baseURL, apiKey, _ := GetCache().Get(endpointID)
	// 创建临时客户端来执行请求
	var resp []InstanceResult
	if err := request(http.MethodGet, fmt.Sprintf("%s/instances", baseURL), apiKey, nil, &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

// CreateInstance 创建隧道实例，返回实例 ID 与状态(running/stopped 等)
func CreateInstance(endpointID int64, commandLine string) (InstanceResult, error) {
	baseURL, apiKey, _ := GetCache().Get(endpointID)

	payload := map[string]string{"url": commandLine}

	var resp InstanceResult
	if err := request(http.MethodPost, fmt.Sprintf("%s/instances", baseURL), apiKey, payload, &resp); err != nil {
		return resp, err
	}
	return resp, nil
}

// DeleteInstance 删除指定实例
func DeleteInstance(endpointID int64, instanceID string) error {
	baseURL, apiKey, _ := GetCache().Get(endpointID)
	return request(http.MethodDelete, fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, nil, nil)
}

// UpdateInstance 更新指定实例的命令行 (PUT /instances/{id})
func UpdateInstance(endpointID int64, instanceID, commandLine string) (InstanceResult, error) {
	payload := map[string]string{"url": commandLine}
	baseURL, apiKey, _ := GetCache().Get(endpointID)
	var resp InstanceResult
	if err := request(http.MethodPut, fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, payload, &resp); err != nil {
		return resp, err
	}
	return resp, nil
}

// ControlInstance 对实例执行 start/stop/restart 操作，返回最新状态
func PatchInstance(endpointID int64, instanceID string, body patchBody) (InstanceResult, error) {
	var resp InstanceResult

	baseURL, apiKey, _ := GetCache().Get(endpointID)
	if err := request(http.MethodPatch, fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, body, &resp); err != nil {
		return resp, err
	}
	return resp, nil
}

// ControlInstance 对实例执行 start/stop/restart 操作，返回最新状态
func ControlInstance(endpointID int64, instanceID, action string) (InstanceResult, error) {
	body := patchBody{
		action: action,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// PatchInstance 更新指定实例的别名 (PATCH /instances/{id})
func RenameInstance(endpointID int64, instanceID string, name string) (InstanceResult, error) {
	body := patchBody{
		alias: name,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// PatchInstance 更新指定实例的重启策略 (PATCH /instances/{id})
func SetRestartInstance(endpointID int64, instanceID string, restart bool) (InstanceResult, error) {
	body := patchBody{
		restart: restart,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// ResetInstanceTraffic 重置指定实例的流量统计 (PATCH /instances/{id})
func ResetTraffic(endpointID int64, instanceID string) (InstanceResult, error) {
	body := patchBody{
		action: "reset",
	}
	return PatchInstance(endpointID, instanceID, body)
}

// GetInfo 获取NodePass实例的系统信息
func GetInfo(endpointID int64) (*EndpointInfoResult, error) {
	var resp EndpointInfoResult
	baseURL, apiKey, _ := GetCache().Get(endpointID)

	// 创建临时客户端来执行请求

	if err := request(http.MethodGet, fmt.Sprintf("%s/info", baseURL), apiKey, nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// TCPing 执行TCP连接测试，检测目标地址的连通性和延迟
// target 参数格式为 host:port，例如 "example.com:80"
// 进行5次测试并返回统计信息
func TCPing(endpointID int64, target string) (*TCPingResult, error) {
	const testCount = 5

	result := &TCPingResult{
		Target:          target,
		TotalTests:      testCount,
		SuccessfulTests: 0,
		PacketLoss:      0.0,
	}

	var latencies []int64
	var errors []string

	baseURL, apiKey, _ := GetCache().Get(endpointID)

	// 进行5次测试
	for i := 0; i < testCount; i++ {

		// 单次测试结果结构
		var singleResult struct {
			Target    string `json:"target"`
			Connected bool   `json:"connected"`
			Latency   int64  `json:"latency"`
			Error     string `json:"error"`
		}

		// 使用超时客户端进行请求
		if err := request(http.MethodGet, fmt.Sprintf("%s/tcping?target=%s", baseURL, target), apiKey, nil, &singleResult); err != nil {
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

type patchBody struct {
	restart bool   `json:"restart,omitempty"`
	action  string `json:"action,omitempty"` // start|stop|restart|reset
	alias   string `json:"alias,omitempty"`
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
