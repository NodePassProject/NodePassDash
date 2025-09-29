package nodepass

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-resty/resty/v2"
)

// 创建 Resty 客户端，配置禁用代理和证书校验
func createRestyClient() *resty.Client {
	client := resty.New().
		SetTimeout(15 * time.Second).
		SetTLSClientConfig(&tls.Config{InsecureSkipVerify: true})

	// 明确禁用所有代理设置
	client.SetProxy("")
	client.RemoveProxy()

	return client
}

// request 执行 HTTP 请求的通用方法，使用 Resty 客户端
func request(method, url, apiKey string, body interface{}, dest interface{}) error {
	client := createRestyClient()
	req := client.R().
		SetHeader("X-API-Key", apiKey)

	// 设置请求体
	if body != nil {
		req.SetBody(body)
	}

	// 设置响应结构
	if dest != nil {
		req.SetResult(dest)
	}

	// 执行请求
	var resp *resty.Response
	var err error

	switch method {
	case "GET":
		resp, err = req.Get(url)
	case "POST":
		resp, err = req.Post(url)
	case "PUT":
		resp, err = req.Put(url)
	case "PATCH":
		resp, err = req.Patch(url)
	case "DELETE":
		resp, err = req.Delete(url)
	default:
		return fmt.Errorf("不支持的 HTTP 方法: %s", method)
	}

	if err != nil {
		return err
	}

	if resp.StatusCode() < 200 || resp.StatusCode() >= 300 {
		return fmt.Errorf("NodePass API 返回错误: %d", resp.StatusCode())
	}

	return nil
}

// GetInstances 获取所有隧道实例列表
func GetInstances(endpointID int64) ([]InstanceResult, error) {
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))
	// 创建临时客户端来执行请求
	var resp []InstanceResult
	if err := request("GET", fmt.Sprintf("%s/instances", baseURL), apiKey, nil, &resp); err != nil {
		return nil, err
	}
	return resp, nil
}

// GetInstance 获取指定实例信息
func GetInstance(endpointID int64, instanceID string) (*InstanceResult, error) {
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))
	var resp InstanceResult
	if err := request("GET", fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, nil, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// CreateInstance 创建隧道实例，返回实例 ID 与状态(running/stopped 等)
func CreateInstance(endpointID int64, commandLine string) (InstanceResult, error) {
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))

	payload := map[string]string{"url": commandLine}

	var resp InstanceResult
	if err := request("POST", fmt.Sprintf("%s/instances", baseURL), apiKey, payload, &resp); err != nil {
		return resp, err
	}
	return resp, nil
}

// DeleteInstance 删除指定实例
func DeleteInstance(endpointID int64, instanceID string) error {
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))
	return request("DELETE", fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, nil, nil)
}

// UpdateInstance 更新指定实例的命令行 (PUT /instances/{id})
func UpdateInstance(endpointID int64, instanceID, commandLine string) (InstanceResult, error) {
	payload := map[string]string{"url": commandLine}
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))
	var resp InstanceResult
	if err := request("PUT", fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, payload, &resp); err != nil {
		return resp, err
	}
	return resp, nil
}

// ControlInstance 对实例执行 start/stop/restart 操作，返回最新状态
func PatchInstance(endpointID int64, instanceID string, body patchBody) (InstanceResult, error) {
	var resp InstanceResult

	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))
	if err := request("PATCH", fmt.Sprintf("%s/instances/%s", baseURL, instanceID), apiKey, body, &resp); err != nil {
		return resp, err
	}
	return resp, nil
}

// ControlInstance 对实例执行 start/stop/restart 操作，返回最新状态
func ControlInstance(endpointID int64, instanceID, action string) (InstanceResult, error) {
	body := patchBody{
		Action: &action,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// ConvertInstanceTagsToTagsMap 将InstanceTag数组转换为map[string]string并序列化为JSON字符串
func ConvertInstanceTagsToTagsMap(instanceTags []InstanceTag) (*string, error) {
	if len(instanceTags) == 0 {
		return nil, nil
	}

	// 转换为map
	tagsMap := make(map[string]string)
	for _, tag := range instanceTags {
		tagsMap[tag.Key] = tag.Value
	}

	// 序列化为JSON
	jsonBytes, err := json.Marshal(tagsMap)
	if err != nil {
		return nil, err
	}

	jsonStr := string(jsonBytes)
	return &jsonStr, nil
}

// PatchInstance 更新指定实例的别名 (PATCH /instances/{id})
func RenameInstance(endpointID int64, instanceID string, name string) (InstanceResult, error) {
	body := patchBody{
		Alias: &name,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// PatchInstance 更新指定实例的重启策略 (PATCH /instances/{id})
func SetRestartInstance(endpointID int64, instanceID string, restart bool) (InstanceResult, error) {
	body := patchBody{
		Restart: &restart,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// ResetInstanceTraffic 重置指定实例的流量统计 (PATCH /instances/{id})
func ResetTraffic(endpointID int64, instanceID string) (InstanceResult, error) {
	action := "reset"
	body := patchBody{
		Action: &action,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// UpdateInstanceTags 更新指定实例的标签 (PATCH /instances/{id})
func UpdateInstanceTags(endpointID int64, instanceID string, tags []InstanceTag) (InstanceResult, error) {
	body := patchBody{
		Tags: tags,
	}
	return PatchInstance(endpointID, instanceID, body)
}

// GetInfo 获取NodePass实例的系统信息
func GetInfo(endpointID int64) (*EndpointInfoResult, error) {
	var resp EndpointInfoResult
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))

	// 创建临时客户端来执行请求

	if err := request("GET", fmt.Sprintf("%s/info", baseURL), apiKey, nil, &resp); err != nil {
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

	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))

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
		if err := request("GET", fmt.Sprintf("%s/tcping?target=%s", baseURL, target), apiKey, nil, &singleResult); err != nil {
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

// SingleTCPing 执行单次TCPing测试，用于网络诊断
func SingleTCPing(endpointID int64, target string) (*NetworkDebugResult, error) {
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))
	timestamp := time.Now().UnixMilli()

	// 单次测试结果结构
	var singleResult struct {
		Target    string `json:"target"`
		Connected bool   `json:"connected"`
		Latency   int64  `json:"latency"`
		Error     string `json:"error"`
	}

	// 使用超时客户端进行请求
	if err := request("GET", fmt.Sprintf("%s/tcping?target=%s", baseURL, target), apiKey, nil, &singleResult); err != nil {
		// 网络请求失败或超时
		return &NetworkDebugResult{
			Timestamp: timestamp,
			Success:   false,
			Latency:   0,
			Error:     err.Error(),
		}, nil
	}

	// 返回匹配前端期望的结构
	return &NetworkDebugResult{
		Timestamp: timestamp,
		Success:   singleResult.Connected,
		Latency:   singleResult.Latency,
		Error:     singleResult.Error,
	}, nil
}

// TestConnection 测试端点连接
func TestConnection(endpointID int64) error {
	baseURL, apiKey, _ := GetCache().Get(fmt.Sprintf("%d", endpointID))

	// 测试获取实例列表以验证连接
	err := request("GET", fmt.Sprintf("%s/instances", baseURL), apiKey, nil, nil)
	return err
}

// InstanceTag represents a key-value pair for tagging instances
type InstanceTag struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

//go:generate stringer -type=Instance
type InstanceResult struct {
	ID            string        `json:"id"`
	Type          string        `json:"type"`   // client|server
	Status        string        `json:"status"` // running|stopped|error
	URL           string        `json:"url"`
	TCPRx         int64         `json:"tcprx"`
	TCPTx         int64         `json:"tcptx"`
	UDPRx         int64         `json:"udprx"`
	UDPTx         int64         `json:"udptx"`
	Pool          *int64        `json:"pool,omitempty"`
	Ping          *int64        `json:"ping,omitempty"`
	Alias         *string       `json:"alias,omitempty"`
	Restart       *bool         `json:"restart,omitempty"`
	TCPs          *int64        `json:"tcps,omitempty"`
	UDPs          *int64        `json:"udps,omitempty"`
	Mode          *int          `json:"mode,omitempty"`
	ProxyProtocol *bool         `json:"proxyProtocol,omitempty"`
	Tags          []InstanceTag `json:"tags,omitempty"`
	Config        *string       `json:"config,omitempty"`
}

type patchBody struct {
	Restart *bool         `json:"restart,omitempty"`
	Action  *string       `json:"action,omitempty"` // start|stop|restart|reset
	Alias   *string       `json:"alias,omitempty"`
	Tags    []InstanceTag `json:"tags,omitempty"` // 实例标签
}

// EndpointInfoResult NodePass实例的系统信息
type EndpointInfoResult struct {
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	Ver       string `json:"ver"`
	Name      string `json:"name"`
	Log       string `json:"log"`
	TLS       string `json:"tls"`
	Crt       string `json:"crt"`
	Key       string `json:"key"`
	CPU       int    `json:"cpu"`        // CPU核心使用百分比
	MemFree   int64  `json:"mem_free"`   // 空闲内存(字节)
	MemTotal  int64  `json:"mem_total"`  // 总内存(字节)
	SwapFree  int64  `json:"swap_free"`  // 空闲交换空间(字节)
	SwapTotal int64  `json:"swap_total"` // 总交换空间(字节)
	DiskRead  int64  `json:"diskr"`      // 磁盘读取字节数
	DiskWrite int64  `json:"diskw"`      // 磁盘写入字节数
	NetRx     int64  `json:"netrx"`      // 网络接收字节数
	NetTx     int64  `json:"nettx"`      // 网络发送字节数
	SysUptime int64  `json:"sysup"`      // 系统运行时间(秒)
	Uptime    int64  `json:"uptime"`     // NodePass运行时间(秒)
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

// NetworkDebugResult 网络诊断结果（简单版本）
type NetworkDebugResult struct {
	Timestamp int64  `json:"timestamp"`
	Success   bool   `json:"success"`
	Latency   int64  `json:"latency"`
	Error     string `json:"error"`
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
