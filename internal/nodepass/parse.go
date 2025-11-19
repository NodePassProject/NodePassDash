package nodepass

import (
	"NodePassDash/internal/models"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// TunnelConfig 表示解析后的隧道配置信息
type TunnelConfig struct {
	Type                  string // client 或 server
	TunnelAddress         string
	TunnelPort            string
	TargetAddress         string
	TargetPort            string
	ExtendTargetAddresses []string // 扩展目标地址列表
	ListenType            string   // ALL|TCP|UDP
	TLSMode               string   // 空字符串表示不设置（inherit）
	LogLevel              string   // 空字符串表示不设置（inherit）
	CertPath              string
	KeyPath               string
	Password              string
	Min                   string
	Max                   string
	Mode                  string
	Read                  string
	Rate                  string
	Slot                  string
	Proxy                 string // proxy protocol 支持 (0|1)
	Quic                  string // proxy protocol 支持 (0|1)
	Dial                  string // proxy protocol 支持 (0|1)
	Dns                   string // proxy protocol 支持 (0|1)
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
	// 支持多个逗号拼接的地址，第一个作为主地址，其余放入extendTargetAddress
	if pathPart != "" {
		// 检查是否存在多个逗号分隔的地址
		addresses := strings.Split(pathPart, ",")

		// 处理第一个地址
		addr, port := parseAddressPort(addresses[0])
		tunnel.TargetAddress = addr
		tunnel.TargetPort = port

		// 处理剩余的地址（如果有的话）
		if len(addresses) > 1 {
			extendAddrList := make([]string, 0, len(addresses)-1)
			for i := 1; i < len(addresses); i++ {
				extendAddr, extendPort := parseAddressPort(addresses[i])
				extendAddrList = append(extendAddrList, extendAddr+":"+extendPort)
			}
			if len(extendAddrList) > 0 {
				tunnel.ExtendTargetAddress = &extendAddrList
			}
		}
	}

	// 解析查询参数
	var noTCP, noUDP *string // 用于临时存储notcp和noudp参数
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
			case "notcp":
				// TCP支持控制 (0=启用, 1=禁用)
				noTCP = &val
			case "noudp":
				// UDP支持控制 (0=启用, 1=禁用)
				noUDP = &val
			case "dial":
				// UDP支持控制 (0=启用, 1=禁用)
				tunnel.Dial = &val
			case "dns":
				// UDP支持控制 (0=启用, 1=禁用)
				tunnel.Dns = &val
			case "quic":
				// QUIC控制 (0=启用, 1=禁用)
				switch val {
				case "0":
					enableQuic := false
					tunnel.Quic = &enableQuic
				case "1":
					enableQuic := true
					tunnel.Quic = &enableQuic
				}
			}
		}
	}

	// 根据notcp和noudp参数的组合来设置listenType
	if noTCP != nil || noUDP != nil {
		// 默认两个都启用
		tcpEnabled := true
		udpEnabled := true

		if noTCP != nil {
			tcpEnabled = *noTCP != "1"
		}
		if noUDP != nil {
			udpEnabled = *noUDP != "1"
		}

		// 根据启用情况设置listenType
		var listenType string
		if tcpEnabled && udpEnabled {
			listenType = "ALL"
		} else if tcpEnabled && !udpEnabled {
			listenType = "TCP"
		} else if !tcpEnabled && udpEnabled {
			listenType = "UDP"
		}
		// 如果都禁用则不设置listenType

		if listenType != "" {
			tunnel.ListenType = &listenType
		}
	}

	return tunnel
}

// - Insert/Create 时 - GORM 会调用字段的 Value() 方法进行序列化 ✅
// - Update 时用 map - 当使用 Updates(map[string]interface{}) 时，GORM 不会调用字段的序列化方法，而是直接把 map中的值传给 SQLite 驱动
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
		"proxy_protocol":  tunnel.ProxyProtocol,
		"config_line":     tunnel.ConfigLine,
		"listen_type":     tunnel.ListenType,
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
	// Update 时 GORM 不会自动调用序列化器，需要手动序列化为 JSON 字符串
	if tunnel.Tags != nil {
		if tagsJSON, err := json.Marshal(tunnel.Tags); err == nil {
			updates["tags"] = string(tagsJSON)
		}
	}
	if tunnel.Peer != nil {
		if peerJSON, err := json.Marshal(tunnel.Peer); err == nil {
			updates["peer"] = string(peerJSON)
		}
		// 同步更新 service_sid 字段，用于快速查询和排序
		if tunnel.Peer.SID != nil && *tunnel.Peer.SID != "" {
			updates["service_sid"] = *tunnel.Peer.SID
		} else {
			updates["service_sid"] = nil
		}
	} else {
		// peer 为 nil 时，清空 service_sid
		updates["service_sid"] = nil
	}
	if tunnel.ConfigLine != nil {
		updates["config_line"] = tunnel.ConfigLine
	}
	if tunnel.Dial != nil {
		updates["dial"] = tunnel.Dial
	}
	if tunnel.ExtendTargetAddress != nil {
		if extendAddrJSON, err := json.Marshal(tunnel.ExtendTargetAddress); err == nil {
			updates["extend_target_address"] = string(extendAddrJSON)
		}
	}
	// 处理新字段
	if tunnel.Quic != nil {
		updates["quic"] = tunnel.Quic
	}
	if tunnel.Dns != nil {
		updates["dns"] = tunnel.Dns
	}
	return updates
}

// ParseTunnelConfig 解析隧道实例 URL 并返回 TunnelConfig
func ParseTunnelConfig(rawURL string) *TunnelConfig {
	cfg := &TunnelConfig{}

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
		// 处理多个逗号分隔的地址
		addresses := strings.Split(pathParts, ",")

		// 处理第一个地址
		targetParts := strings.Split(addresses[0], ":")
		if len(targetParts) >= 1 {
			cfg.TargetAddress = targetParts[0]
		}
		if len(targetParts) >= 2 {
			cfg.TargetPort = targetParts[1]
		}

		// 处理剩余的地址
		if len(addresses) > 1 {
			for i := 1; i < len(addresses); i++ {
				extendAddr := strings.Split(addresses[i], ":")
				if len(extendAddr) >= 1 && extendAddr[0] != "" {
					cfg.ExtendTargetAddresses = append(cfg.ExtendTargetAddresses, extendAddr[0])
				}
			}
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
	cfg.Quic = query.Get("quic")
	cfg.Dial = query.Get("dial")
	noTCP := query.Get("notcp")
	noUDP := query.Get("noudp")
	cfg.Dns = query.Get("dns")

	// 根据notcp和noudp参数的组合来设置listenType
	if noTCP != "" || noUDP != "" {
		// 默认两个都启用
		tcpEnabled := true
		udpEnabled := true

		if noTCP != "" {
			tcpEnabled = noTCP != "1"
		}
		if noUDP != "" {
			udpEnabled = noUDP != "1"
		}

		// 根据启用情况设置listenType
		if tcpEnabled && udpEnabled {
			cfg.ListenType = "ALL"
		} else if tcpEnabled && !udpEnabled {
			cfg.ListenType = "TCP"
		} else if !tcpEnabled && udpEnabled {
			cfg.ListenType = "UDP"
		}
		// 如果都禁用则不设置listenType
	}

	return cfg
}

// BuildTunnelURL 根据配置生成隧道 URL
func (c *TunnelConfig) BuildTunnelConfigURL() string {
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

	// 添加目标地址和端口（包括扩展地址）
	if c.TargetAddress != "" || c.TargetPort != "" || len(c.ExtendTargetAddresses) > 0 {
		urlParts = append(urlParts, "/")
		if c.TargetAddress != "" {
			urlParts = append(urlParts, c.TargetAddress)
		}
		if c.TargetPort != "" {
			urlParts = append(urlParts, ":"+c.TargetPort)
		}

		// 添加扩展地址（逗号分隔）
		if len(c.ExtendTargetAddresses) > 0 {
			for _, addr := range c.ExtendTargetAddresses {
				urlParts = append(urlParts, ","+addr)
			}
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
	if c.Quic != "" {
		queryParams = append(queryParams, fmt.Sprintf("quic=%s", c.Quic))
	}
	if c.Dial != "" {
		queryParams = append(queryParams, fmt.Sprintf("dial=%s", c.Dial))
	}
	if c.Dns != "" {
		queryParams = append(queryParams, fmt.Sprintf("dns=%s", c.Dns))
	}

	// 根据listenType生成notcp和noudp参数
	if c.ListenType != "" {
		switch c.ListenType {
		case "TCP":
			queryParams = append(queryParams, "notcp=0")
			queryParams = append(queryParams, "noudp=1")
		case "UDP":
			queryParams = append(queryParams, "notcp=1")
			queryParams = append(queryParams, "noudp=0")
		case "ALL":
			queryParams = append(queryParams, "notcp=0")
			queryParams = append(queryParams, "noudp=0")
		}
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

// BuildTunnelURLs 将 Tunnel 对象转换为 URL 字符串
// 用于在其他地方方便地获取隧道的URL配置
func BuildTunnelURLs(tunnel models.Tunnel) string {

	protocol := string(tunnel.Type)
	if protocol == "" {
		protocol = "client" // 默认协议
	}

	var urlParts []string
	urlParts = append(urlParts, protocol+"://")

	// 添加密码
	if tunnel.Password != nil && *tunnel.Password != "" {
		urlParts = append(urlParts, *tunnel.Password+"@")
	}

	// 添加隧道地址和端口
	if tunnel.TunnelAddress != "" || tunnel.TunnelPort != "" {
		if tunnel.TunnelAddress != "" {
			urlParts = append(urlParts, tunnel.TunnelAddress)
		}
		if tunnel.TunnelPort != "" {
			urlParts = append(urlParts, ":"+tunnel.TunnelPort)
		}
	}

	// 添加目标地址和端口（包括扩展地址）
	if tunnel.TargetAddress != "" || tunnel.TargetPort != "" || (tunnel.ExtendTargetAddress != nil && len(*tunnel.ExtendTargetAddress) > 0) {
		urlParts = append(urlParts, "/")
		if tunnel.TargetAddress != "" {
			urlParts = append(urlParts, tunnel.TargetAddress)
		}
		if tunnel.TargetPort != "" {
			urlParts = append(urlParts, ":"+tunnel.TargetPort)
		}

		// 添加扩展地址（逗号分隔）
		if tunnel.ExtendTargetAddress != nil && len(*tunnel.ExtendTargetAddress) > 0 {
			for _, addr := range *tunnel.ExtendTargetAddress {
				urlParts = append(urlParts, ","+addr)
			}
		}
	}

	// 构建查询参数
	var queryParams []string

	// 只有非空且非inherit才添加log参数
	if tunnel.LogLevel != "" && tunnel.LogLevel != models.LogLevelInherit {
		queryParams = append(queryParams, fmt.Sprintf("log=%s", tunnel.LogLevel))
	}

	// 只有server模式且非空且非inherit才添加tls参数
	if tunnel.TLSMode != "" && tunnel.TLSMode != models.TLSModeInherit && protocol == "server" {
		queryParams = append(queryParams, fmt.Sprintf("tls=%s", tunnel.TLSMode))
	}

	if tunnel.CertPath != nil && *tunnel.CertPath != "" {
		queryParams = append(queryParams, fmt.Sprintf("crt=%s", url.QueryEscape(*tunnel.CertPath)))
	}

	if tunnel.KeyPath != nil && *tunnel.KeyPath != "" {
		queryParams = append(queryParams, fmt.Sprintf("key=%s", url.QueryEscape(*tunnel.KeyPath)))
	}

	if tunnel.Min != nil {
		queryParams = append(queryParams, fmt.Sprintf("min=%d", *tunnel.Min))
	}

	if tunnel.Max != nil {
		queryParams = append(queryParams, fmt.Sprintf("max=%d", *tunnel.Max))
	}

	if tunnel.Mode != nil {
		queryParams = append(queryParams, fmt.Sprintf("mode=%d", *tunnel.Mode))
	}

	if tunnel.Read != nil && *tunnel.Read != "" {
		queryParams = append(queryParams, fmt.Sprintf("read=%s", *tunnel.Read))
	}

	if tunnel.Rate != nil {
		queryParams = append(queryParams, fmt.Sprintf("rate=%d", *tunnel.Rate))
	}

	if tunnel.Slot != nil {
		queryParams = append(queryParams, fmt.Sprintf("slot=%d", *tunnel.Slot))
	}
	if tunnel.Dial != nil {
		queryParams = append(queryParams, fmt.Sprintf("dial=%s", *tunnel.Dial))
	}
	if tunnel.Dns != nil {
		queryParams = append(queryParams, fmt.Sprintf("dns=%s", *tunnel.Dns))
	}
	if tunnel.Quic != nil && protocol == "server" {
		quicVal := "0"
		if *tunnel.Quic {
			quicVal = "1"
		}
		queryParams = append(queryParams, fmt.Sprintf("quic=%s", quicVal))
	}

	if tunnel.ProxyProtocol != nil {
		proxyVal := "0"
		if *tunnel.ProxyProtocol {
			proxyVal = "1"
		}
		queryParams = append(queryParams, fmt.Sprintf("proxy=%s", proxyVal))
	}

	// 根据listenType生成notcp和noudp参数
	if tunnel.ListenType != nil && *tunnel.ListenType != "" {
		switch *tunnel.ListenType {
		case "TCP":
			queryParams = append(queryParams, "notcp=0")
			queryParams = append(queryParams, "noudp=1")
		case "UDP":
			queryParams = append(queryParams, "notcp=1")
			queryParams = append(queryParams, "noudp=0")
		case "ALL":
			queryParams = append(queryParams, "notcp=0")
			queryParams = append(queryParams, "noudp=0")
		}
	}

	// 添加查询参数
	if len(queryParams) > 0 {
		urlParts = append(urlParts, "?"+strings.Join(queryParams, "&"))
	}

	return strings.Join(urlParts, "")
}
