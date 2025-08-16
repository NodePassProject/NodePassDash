package nodepass

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// TunnelConfig 表示解析后的隧道配置信息
type TunnelConfig struct {
	Type          string // client 或 server
	TunnelAddress string
	TunnelPort    string
	TargetAddress string
	TargetPort    string
	TLSMode       string // 空字符串表示不设置（inherit）
	LogLevel      string // 空字符串表示不设置（inherit）
	CertPath      string
	KeyPath       string
	Password      string
	Min           string
	Max           string
	Mode          string
	Read          string
	Rate          string
}

// ParseTunnelURL 解析隧道实例 URL
// 支持格式: protocol://[password@][tunnel_address:tunnel_port]/[target_address:target_port]?[params]
func ParseTunnelURL(rawURL, tunnelType string) *TunnelConfig {
	// 默认值
	config := &TunnelConfig{
		Type:     tunnelType, // 使用传入的隧道类型
		TLSMode:  "",         // 空字符串表示不设置（inherit）
		LogLevel: "",         // 空字符串表示不设置（inherit）
		CertPath: "",
		KeyPath:  "",
		Password: "",
	}

	if rawURL == "" {
		return config
	}

	// 提取协议部分并设置Type
	var protocol string
	if idx := strings.Index(rawURL, "://"); idx != -1 {
		protocol = rawURL[:idx]
		rawURL = rawURL[idx+3:]

		// 如果URL中包含协议，优先使用URL中的协议
		if protocol == "client" || protocol == "server" {
			config.Type = protocol
		}
	}

	// 分离用户认证信息 (password@)
	var userInfo string
	if atIdx := strings.Index(rawURL, "@"); atIdx != -1 {
		userInfo = rawURL[:atIdx]
		rawURL = rawURL[atIdx+1:]
		config.Password = userInfo
	}

	// 分离查询参数
	var queryPart string
	if qIdx := strings.Index(rawURL, "?"); qIdx != -1 {
		queryPart = rawURL[qIdx+1:]
		rawURL = rawURL[:qIdx]
	}

	// 分离路径
	var hostPart, pathPart string
	if pIdx := strings.Index(rawURL, "/"); pIdx != -1 {
		hostPart = rawURL[:pIdx]
		pathPart = rawURL[pIdx+1:]
	} else {
		hostPart = rawURL
	}

	// 解析 hostPart -> tunnelAddress:tunnelPort (兼容 IPv6)
	if hostPart != "" {
		addr, port := parseAddressPort(hostPart)
		config.TunnelAddress = addr
		config.TunnelPort = port
	}

	// 解析 pathPart -> targetAddress:targetPort (兼容 IPv6)
	if pathPart != "" {
		addr, port := parseAddressPort(pathPart)
		config.TargetAddress = addr
		config.TargetPort = port
	}

	// 解析查询参数
	if queryPart != "" {
		for _, kv := range strings.Split(queryPart, "&") {
			if kv == "" {
				continue
			}
			parts := strings.SplitN(kv, "=", 2)
			if len(parts) != 2 {
				continue
			}
			key, val := parts[0], parts[1]
			switch key {
			case "tls":
				if config.Type == "server" {
					switch val {
					case "0":
						config.TLSMode = "0"
					case "1":
						config.TLSMode = "1"
					case "2":
						config.TLSMode = "2"
					}
				}
			case "log":
				config.LogLevel = strings.ToLower(val)
			case "crt":
				// URL解码证书路径
				if decodedVal, err := url.QueryUnescape(val); err == nil {
					config.CertPath = decodedVal
				} else {
					config.CertPath = val // 解码失败时使用原值
				}
			case "key":
				// URL解码密钥路径
				if decodedVal, err := url.QueryUnescape(val); err == nil {
					config.KeyPath = decodedVal
				} else {
					config.KeyPath = val // 解码失败时使用原值
				}
			case "min":
				config.Min = val
			case "max":
				config.Max = val
			case "mode":
				config.Mode = val
			case "read":
				config.Read = val
			case "rate":
				config.Rate = val
			}
		}
	}

	return config
}

// BuildTunnelURL 根据配置生成隧道 URL
func (c *TunnelConfig) BuildTunnelURL() string {
	protocol := c.Type
	if protocol == "" {
		protocol = "client" // 默认协议
	}

	var urlParts []string
	urlParts = append(urlParts, protocol+"://")

	// 添加密码
	if c.Password != "" {
		urlParts = append(urlParts, c.Password+"@")
	}

	// 添加隧道地址和端口
	if c.TunnelAddress != "" || c.TunnelPort != "" {
		if c.TunnelAddress != "" {
			urlParts = append(urlParts, c.TunnelAddress)
		}
		if c.TunnelPort != "" {
			urlParts = append(urlParts, ":"+c.TunnelPort)
		}
	}

	// 添加目标地址和端口
	if c.TargetAddress != "" || c.TargetPort != "" {
		urlParts = append(urlParts, "/")
		if c.TargetAddress != "" {
			urlParts = append(urlParts, c.TargetAddress)
		}
		if c.TargetPort != "" {
			urlParts = append(urlParts, ":"+c.TargetPort)
		}
	}

	// 构建查询参数
	var queryParams []string

	// 只有非空才添加log参数
	if c.LogLevel != "" {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", c.LogLevel))
	}

	// 只有server模式且非空才添加tls参数
	if c.TLSMode != "" && protocol == "server" {
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", c.TLSMode))
	}

	if c.CertPath != "" {
		queryParams = append(queryParams, fmt.Sprintf("crt=%s", url.QueryEscape(c.CertPath)))
	}

	if c.KeyPath != "" {
		queryParams = append(queryParams, fmt.Sprintf("key=%s", url.QueryEscape(c.KeyPath)))
	}

	if c.Min != "" {
		queryParams = append(queryParams, fmt.Sprintf("min=%s", c.Min))
	}

	if c.Max != "" {
		queryParams = append(queryParams, fmt.Sprintf("max=%s", c.Max))
	}

	if c.Mode != "" {
		queryParams = append(queryParams, fmt.Sprintf("mode=%s", c.Mode))
	}

	if c.Read != "" {
		queryParams = append(queryParams, fmt.Sprintf("read=%s", c.Read))
	}

	if c.Rate != "" {
		queryParams = append(queryParams, fmt.Sprintf("rate=%s", c.Rate))
	}

	// 添加查询参数
	if len(queryParams) > 0 {
		urlParts = append(urlParts, "?"+strings.Join(queryParams, "&"))
	}

	return strings.Join(urlParts, "")
}

// parseAddressPort 解析 "addr:port" 片段 (兼容 IPv6 字面量，如 [::1]:8080)
func parseAddressPort(part string) (addr, port string) {
	part = strings.TrimSpace(part)
	if part == "" {
		return "", ""
	}

	// 特殊处理 ":port" 格式（只有端口号，没有地址）
	if strings.HasPrefix(part, ":") {
		port = strings.TrimPrefix(part, ":")
		addr = "" // 空地址表示使用默认地址
		return
	}

	// 处理方括号包围的IPv6地址格式：[IPv6]:port
	if strings.HasPrefix(part, "[") {
		if end := strings.Index(part, "]"); end != -1 {
			addr = part[:end+1]
			if len(part) > end+1 && part[end+1] == ':' {
				port = part[end+2:]
			}
			return
		}
	}

	// 检查是否包含冒号
	if strings.Contains(part, ":") {
		// 判断是否为IPv6地址（包含多个冒号或双冒号）
		colonCount := strings.Count(part, ":")
		if colonCount > 1 || strings.Contains(part, "::") {
			// 可能是IPv6地址，尝试从右侧找最后一个冒号作为端口分隔符
			lastColonIdx := strings.LastIndex(part, ":")
			// 检查最后一个冒号后面是否为纯数字（端口号）
			if lastColonIdx != -1 && lastColonIdx < len(part)-1 {
				potentialPort := part[lastColonIdx+1:]
				if portNum, err := strconv.Atoi(potentialPort); err == nil && portNum > 0 && portNum <= 65535 {
					// 最后部分是有效的端口号
					addr = part[:lastColonIdx]
					port = potentialPort
					return
				}
			}
			// 没有找到有效端口，整个部分都是地址
			addr = part
			return
		} else {
			// 只有一个冒号，按照传统方式分割
			pieces := strings.SplitN(part, ":", 2)
			addr, port = pieces[0], pieces[1]
		}
	} else {
		// 没有冒号，判断是纯数字端口还是地址
		if _, err := strconv.Atoi(part); err == nil {
			port = part
		} else {
			addr = part
		}
	}
	return
}
