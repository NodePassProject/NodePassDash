package nodepass

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
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

// Instance 表示 NodePass 中的隧道实例信息
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
//	  "udptx": 0
//	}
//
// ]
//
// 字段保持驼峰以方便 JSON 解析
//
//go:generate stringer -type=Instance
type Instance struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Status string `json:"status"`
	URL    string `json:"url"`
	TCPRx  int64  `json:"tcprx"`
	TCPTx  int64  `json:"tcptx"`
	UDPRx  int64  `json:"udprx"`
	UDPTx  int64  `json:"udptx"`
}

// GetInstances 获取所有隧道实例列表
func (c *Client) GetInstances() ([]Instance, error) {
	url := fmt.Sprintf("%s%s/instances", c.baseURL, c.apiPath)
	var resp []Instance
	if err := c.doRequest(http.MethodGet, url, nil, &resp); err != nil {
		return nil, err
	}
	return resp, nil
}
