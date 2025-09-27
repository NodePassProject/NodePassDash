package nodepass

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"NodePassDash/internal/models"
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
	Slot          string
	Proxy         string // proxy protocol 支持 (0|1)
}

// ParseTunnelURL 解析隧道实例 URL 并返回 Tunnel 模型
// 支持格式: protocol://[password@][tunnel_address:tunnel_port]/[target_address:target_port]?[params]
func ParseTunnelURL(rawURL string) *models.Tunnel {
	// 创建一个新的 Tunnel 实例
	tunnel := &models.Tunnel{
		Status:        models.TunnelStatusStopped, // 默认状态
		TLSMode:       models.TLSModeInherit,      // 默认继承
		LogLevel:      models.LogLevelInherit,     // 默认继承
		TunnelAddress: "",
		TunnelPort:    "",
		TargetAddress: "",
		CommandLine:   rawURL,
		TargetPort:    "",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// 提取协议部分并设置Type
	var protocol string
	if idx := strings.Index(rawURL, "://"); idx != -1 {
		protocol = rawURL[:idx]
		rawURL = rawURL[idx+3:]

		// 设置隧道类型
		if protocol == "client" {
			tunnel.Type = models.TunnelModeClient
		} else if protocol == "server" {
			tunnel.Type = models.TunnelModeServer
		}
	}

	// 分离用户认证信息 (password@)
	var userInfo string
	if atIdx := strings.Index(rawURL, "@"); atIdx != -1 {
		userInfo = rawURL[:atIdx]
		rawURL = rawURL[atIdx+1:]
		if userInfo != "" {
			tunnel.Password = &userInfo
		}
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
		tunnel.TunnelAddress = addr
		tunnel.TunnelPort = port
	}

	// 解析 pathPart -> targetAddress:targetPort (兼容 IPv6)
	if pathPart != "" {
		addr, port := parseAddressPort(pathPart)
		tunnel.TargetAddress = addr
		tunnel.TargetPort = port
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
				if tunnel.Type == models.TunnelModeServer {
					switch val {
					case "0":
						tunnel.TLSMode = models.TLS0
					case "1":
						tunnel.TLSMode = models.TLS1
					case "2":
						tunnel.TLSMode = models.TLS2
					}
				}
			case "log":
				lowerVal := strings.ToLower(val)
				switch lowerVal {
				case "debug":
					tunnel.LogLevel = models.LogLevelDebug
				case "info":
					tunnel.LogLevel = models.LogLevelInfo
				case "warn":
					tunnel.LogLevel = models.LogLevelWarn
				case "error":
					tunnel.LogLevel = models.LogLevelError
				case "event":
					tunnel.LogLevel = models.LogLevelEvent
				case "none":
					tunnel.LogLevel = models.LogLevelNone
				default:
					tunnel.LogLevel = models.LogLevelInherit
				}
			case "crt":
				// URL解码证书路径
				if decodedVal, err := url.QueryUnescape(val); err == nil {
					tunnel.CertPath = &decodedVal
				} else {
					tunnel.CertPath = &val // 解码失败时使用原值
				}
			case "key":
				// URL解码密钥路径
				if decodedVal, err := url.QueryUnescape(val); err == nil {
					tunnel.KeyPath = &decodedVal
				} else {
					tunnel.KeyPath = &val // 解码失败时使用原值
				}
			case "min":
				if minVal, err := strconv.ParseInt(val, 10, 64); err == nil {
					tunnel.Min = &minVal
				}
			case "max":
				if maxVal, err := strconv.ParseInt(val, 10, 64); err == nil {
					tunnel.Max = &maxVal
				}
			case "mode":
				switch val {
				case "0":
					mode := models.Mode0
					tunnel.Mode = &mode
				case "1":
					mode := models.Mode1
					tunnel.Mode = &mode
				case "2":
					mode := models.Mode2
					tunnel.Mode = &mode
				}
			case "read":
				if val != "" {
					tunnel.Read = &val
				}
			case "rate":
				if val != "" {
					if rateVal, err := strconv.ParseInt(val, 10, 64); err == nil {
						tunnel.Rate = &rateVal
					}
				}
			case "slot":
				if slotVal, err := strconv.ParseInt(val, 10, 64); err == nil {
					tunnel.Slot = &slotVal
				}
			case "proxy":
				// proxy_protocol 参数解析 (proxy=0|1)
				switch val {
				case "0":
					proxyProtocol := false
					tunnel.ProxyProtocol = &proxyProtocol
				case "1":
					proxyProtocol := true
					tunnel.ProxyProtocol = &proxyProtocol
				}
			}
		}
	}

	return tunnel
}
func TunnelToMap(tunnel *models.Tunnel) map[string]interface{} {
	updates := map[string]interface{}{
		"name":            tunnel.Name,
		"status":          tunnel.Status,
		"type":            tunnel.Type,
		"tcp_rx":          tunnel.TCPRx,
		"tcp_tx":          tunnel.TCPTx,
		"udp_rx":          tunnel.UDPRx,
		"udp_tx":          tunnel.UDPTx,
		"tcps":            tunnel.TCPs,
		"udps":            tunnel.UDPs,
		"pool":            tunnel.Pool,
		"ping":            tunnel.Ping,
		"tunnel_address":  tunnel.TunnelAddress,
		"tunnel_port":     tunnel.TunnelPort,
		"target_address":  tunnel.TargetAddress,
		"target_port":     tunnel.TargetPort,
		"tls_mode":        tunnel.TLSMode,
		"log_level":       tunnel.LogLevel,
		"command_line":    tunnel.CommandLine,
		"password":        tunnel.Password, // 直接使用指针类型
		"restart":         tunnel.Restart,  // 添加restart字段更新
		"last_event_time": tunnel.LastEventTime,
		"updated_at":      time.Now(),
	}

	if tunnel.CertPath != nil {
		updates["cert_path"] = tunnel.CertPath
	}
	if tunnel.KeyPath != nil {
		updates["key_path"] = tunnel.KeyPath
	}
	if tunnel.Min != nil {
		updates["min"] = tunnel.Min
	}
	if tunnel.Max != nil {
		updates["max"] = tunnel.Max
	}

	// 处理新字段
	if tunnel.Mode != nil {
		updates["mode"] = tunnel.Mode
	}
	if tunnel.Read != nil {
		updates["read"] = tunnel.Read
	}
	if tunnel.Rate != nil {
		updates["rate"] = tunnel.Rate
	}
	if tunnel.Slot != nil {
		updates["slot"] = tunnel.Slot
	}
	if tunnel.ProxyProtocol != nil {
		updates["proxy_protocol"] = tunnel.ProxyProtocol
	}
	if tunnel.InstanceTags != nil {
		updates["instance_tags"] = tunnel.InstanceTags
	}
	return updates
}

// ParseTunnelConfig 解析隧道实例 URL 并返回 TunnelConfig
func ParseTunnelConfig(rawURL string) *TunnelConfig {
	// 使用现有的ParseTunnelURL逻辑，但返回配置信息
	cfg := &TunnelConfig{}

	// 简单的URL解析逻辑（可以从ParseTunnelURL中提取）
	u, err := url.Parse(rawURL)
	if err != nil {
		return cfg
	}

	cfg.Type = u.Scheme
	if u.User != nil {
		cfg.Password = u.User.Username()
	}

	hostPort := u.Host
	if hostPort != "" {
		parts := strings.Split(hostPort, ":")
		if len(parts) >= 1 {
			cfg.TunnelAddress = parts[0]
		}
		if len(parts) >= 2 {
			cfg.TunnelPort = parts[1]
		}
	}

	pathParts := strings.Trim(u.Path, "/")
	if pathParts != "" {
		targetParts := strings.Split(pathParts, ":")
		if len(targetParts) >= 1 {
			cfg.TargetAddress = targetParts[0]
		}
		if len(targetParts) >= 2 {
			cfg.TargetPort = targetParts[1]
		}
	}

	// 解析查询参数
	query := u.Query()
	cfg.TLSMode = query.Get("tls")
	cfg.LogLevel = query.Get("log")
	cfg.CertPath = query.Get("crt")
	cfg.KeyPath = query.Get("key")
	cfg.Min = query.Get("min")
	cfg.Max = query.Get("max")
	cfg.Mode = query.Get("mode")
	cfg.Read = query.Get("read")
	cfg.Rate = query.Get("rate")
	cfg.Slot = query.Get("slot")
	cfg.Proxy = query.Get("proxy")

	return cfg
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

	if c.Slot != "" {
		queryParams = append(queryParams, fmt.Sprintf("slot=%s", c.Slot))
	}

	if c.Proxy != "" {
		queryParams = append(queryParams, fmt.Sprintf("proxy=%s", c.Proxy))
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
