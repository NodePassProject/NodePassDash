// Package netcheck 提供网络自检能力：IPv4/IPv6 公网可达性、GitHub 关键域名
// 连通性、以及最小化的部署环境信息。setup 模式与 Ready 模式都能复用；
// 不依赖数据库、不依赖认证；刻意不返回任何 IP、hostname、延迟、状态码等
// 可能被用作指纹或情报的字段。
package netcheck

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Result 是一次完整网络检查的输出。
type Result struct {
	Timestamp string        `json:"timestamp"`
	System    SystemInfo    `json:"system"`
	IPv4      StackInfo     `json:"ipv4"`
	IPv6      StackInfo     `json:"ipv6"`
	GitHub    []DomainProbe `json:"github"`
}

// SystemInfo 只暴露"是否 Docker"这一档最小信息，用于前端条件式渲染
// IPv6 修复提示。OS/Arch/GoVersion/CPU/hostname 全部主动去除。
type SystemInfo struct {
	Deployment  string `json:"deployment"`  // docker / binary / unknown
	Environment string `json:"environment"` // container / host / unknown
}

// StackInfo 只回答"该协议栈是否可达公网"。刻意不返回延迟与错误细节。
type StackInfo struct {
	Reachable bool   `json:"reachable"`
	Error     string `json:"error,omitempty"` // 归一化后的类别，不含原始堆栈
}

// DomainProbe 只回答"该域名 HEAD 是否 <500"。刻意不返回延迟与状态码。
type DomainProbe struct {
	Domain    string `json:"domain"`
	Reachable bool   `json:"reachable"`
	Error     string `json:"error,omitempty"` // 归一化后的类别
}

const probeTimeout = 5 * time.Second

var githubDomains = []string{
	"github.com",
	"api.github.com",
	"raw.githubusercontent.com",
}

// Run 并发执行所有探测。总耗时受 ctx 控制；单项探测超时 5s。
func Run(ctx context.Context) Result {
	res := Result{
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		System:    collectSystemInfo(),
		GitHub:    make([]DomainProbe, len(githubDomains)),
	}

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		// myip.ipip.net 只提供 HTTP，不解析 body 也不存储 IP
		probeStack(ctx, &res.IPv4, "tcp4", "http://myip.ipip.net/")
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		// ifconfig.co 等价于 curl -6 ifconfig.co；Dialer 强制 tcp6，
		// 即便域名同时有 A 记录也只会走 v6 出去。
		probeStack(ctx, &res.IPv6, "tcp6", "https://ifconfig.co")
	}()

	for i, d := range githubDomains {
		i, d := i, d
		wg.Add(1)
		go func() {
			defer wg.Done()
			res.GitHub[i] = probeDomain(ctx, d)
		}()
	}

	wg.Wait()
	return res
}

// collectSystemInfo 抓取最小部署信息 —— 仅足以让前端条件渲染 IPv6 提示。
func collectSystemInfo() SystemInfo {
	switch {
	case isRunningInDocker():
		return SystemInfo{Deployment: "docker", Environment: "container"}
	case isBinaryDeployment():
		return SystemInfo{Deployment: "binary", Environment: "host"}
	default:
		return SystemInfo{Deployment: "unknown", Environment: "unknown"}
	}
}

// probeStack 强制走指定协议栈访问 target，只判定可达性。body 全丢，不存 IP。
func probeStack(ctx context.Context, dst *StackInfo, network, target string) {
	dialer := &net.Dialer{Timeout: probeTimeout}
	client := &http.Client{
		Timeout: probeTimeout,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _ string, addr string) (net.Conn, error) {
				return dialer.DialContext(ctx, network, addr)
			},
		},
	}
	reqCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, target, nil)
	if err != nil {
		dst.Error = classifyProbeErr(err, network)
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		dst.Error = classifyProbeErr(err, network)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		dst.Error = "server error"
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 128))
	dst.Reachable = true
}

// probeDomain 对单个域名做 HEAD 请求；<500 视为可达（api.github.com HEAD 会返回 404）。
func probeDomain(ctx context.Context, domain string) DomainProbe {
	probe := DomainProbe{Domain: domain}
	client := &http.Client{
		Timeout: probeTimeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	reqCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodHead, "https://"+domain, nil)
	if err != nil {
		probe.Error = classifyProbeErr(err, "tcp")
		return probe
	}
	resp, err := client.Do(req)
	if err != nil {
		probe.Error = classifyProbeErr(err, "tcp")
		return probe
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 500 {
		probe.Error = "server error"
		return probe
	}
	probe.Reachable = true
	return probe
}

// classifyProbeErr 把常见网络错误折叠成有限的几种类别字符串，避免把
// 原始 err.Error() 的堆栈 / 代理地址 / DNS 服务器等泄漏出去。
func classifyProbeErr(err error, network string) string {
	if err == nil {
		return ""
	}
	lower := strings.ToLower(err.Error())
	switch {
	case strings.Contains(lower, "network is unreachable"),
		strings.Contains(lower, "no route to host"),
		strings.Contains(lower, "no suitable address found"),
		strings.Contains(lower, "address family not supported"):
		if network == "tcp6" {
			return "IPv6 unreachable"
		}
		if network == "tcp4" {
			return "IPv4 unreachable"
		}
		return "network unreachable"
	case strings.Contains(lower, "no such host"),
		strings.Contains(lower, "dns"):
		return "dns error"
	case strings.Contains(lower, "connection refused"):
		return "connection refused"
	case strings.Contains(lower, "connection reset"):
		return "connection reset"
	case strings.Contains(lower, "tls"),
		strings.Contains(lower, "x509"),
		strings.Contains(lower, "certificate"):
		return "tls error"
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout"
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	return "network error"
}

// isRunningInDocker 与 internal/api/version.go 中的实现保持一致（复制而非
// 依赖，避免 netcheck 反向依赖 api 包）。
func isRunningInDocker() bool {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	if data, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		s := string(data)
		if strings.Contains(s, "docker") || strings.Contains(s, "containerd") {
			return true
		}
	}
	if os.Getenv("DOCKER_CONTAINER") == "true" {
		return true
	}
	return false
}

// isBinaryDeployment 与 internal/api/version.go 中的实现保持一致。
func isBinaryDeployment() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	info, err := os.Stat(exe)
	if err != nil {
		return false
	}
	return info.Mode().Perm()&0o200 != 0
}
