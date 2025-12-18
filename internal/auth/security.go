package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// URLValidator URL 验证器
type URLValidator struct {
	AllowHTTP      bool // 是否允许 HTTP (默认允许,支持内网部署)
	AllowPrivateIP bool // 是否允许私有 IP (默认允许,支持内网部署)
}

// ValidateURL 验证 URL 的安全性
func (v *URLValidator) ValidateURL(rawURL string) error {
	// 解析 URL
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("无效的 URL 格式: %w", err)
	}

	// 检查 scheme
	scheme := strings.ToLower(parsedURL.Scheme)
	if scheme != "http" && scheme != "https" {
		return fmt.Errorf("不支持的协议 %s, 仅允许 HTTP/HTTPS", scheme)
	}

	// 如果不允许 HTTP,则强制 HTTPS
	if !v.AllowHTTP && scheme == "http" {
		return fmt.Errorf("不允许使用 HTTP 协议,请使用 HTTPS")
	}

	// 检查 host 是否为空
	if parsedURL.Host == "" {
		return fmt.Errorf("URL 缺少 host")
	}

	// 如果不允许私有 IP,则检查 IP 地址
	if !v.AllowPrivateIP {
		// 提取 hostname (去除端口)
		hostname := parsedURL.Hostname()

		// 解析 IP
		ip := net.ParseIP(hostname)
		if ip == nil {
			// 如果不是 IP,尝试解析域名
			ips, err := net.LookupIP(hostname)
			if err == nil && len(ips) > 0 {
				ip = ips[0]
			}
		}

		// 检查是否为私有 IP
		if ip != nil && v.isPrivateIP(ip) {
			return fmt.Errorf("不允许访问私有 IP 地址: %s", ip.String())
		}
	}

	return nil
}

// isPrivateIP 检查 IP 是否为私有地址
func (v *URLValidator) isPrivateIP(ip net.IP) bool {
	// 检查 loopback
	if ip.IsLoopback() {
		return true
	}

	// 检查私有 IP 范围
	privateRanges := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"fc00::/7", // IPv6 unique local addresses
	}

	for _, cidr := range privateRanges {
		_, ipnet, _ := net.ParseCIDR(cidr)
		if ipnet.Contains(ip) {
			return true
		}
	}

	return false
}

// OIDCConfig OIDC 配置
type OIDCConfig struct {
	Issuer                string `json:"issuer"`
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
}

// SecureDiscoverOIDC 安全地执行 OIDC Discovery
func SecureDiscoverOIDC(issuer string, validator *URLValidator) (*OIDCConfig, error) {
	// 构造 Discovery URL
	issuer = strings.TrimSuffix(issuer, "/")
	discoveryURL := issuer + "/.well-known/openid-configuration"

	// 验证 Discovery URL
	if err := validator.ValidateURL(discoveryURL); err != nil {
		return nil, fmt.Errorf("Discovery URL 验证失败: %w", err)
	}

	// 发起 HTTP 请求
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("GET", discoveryURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Discovery 请求失败,状态码: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	// 解析配置
	var config OIDCConfig
	if err := json.Unmarshal(body, &config); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}

	// 验证 issuer 一致性
	responseIssuer := strings.TrimSuffix(config.Issuer, "/")
	expectedIssuer := strings.TrimSuffix(issuer, "/")
	if responseIssuer != expectedIssuer {
		return nil, fmt.Errorf("issuer 不匹配: 请求 %s, 响应 %s", expectedIssuer, responseIssuer)
	}

	// 验证必要端点
	if config.AuthorizationEndpoint == "" || config.TokenEndpoint == "" {
		return nil, fmt.Errorf("配置不完整,缺少必要端点")
	}

	return &config, nil
}
