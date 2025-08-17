package endpoint

import (
	"testing"
)

func TestExtractIPFromURL(t *testing.T) {
	tests := []struct {
		name     string
		url      string
		expected string
	}{
		{
			name:     "IPv4地址带端口",
			url:      "http://192.168.1.1:10101",
			expected: "192.168.1.1",
		},
		{
			name:     "IPv4地址带端口和路径",
			url:      "http://192.168.1.100:8080/api",
			expected: "192.168.1.100",
		},
		{
			name:     "HTTPS IPv4地址带端口",
			url:      "https://10.0.0.1:443/",
			expected: "10.0.0.1",
		},
		{
			name:     "IPv6地址带端口",
			url:      "https://[2a0f:85c1:861:2180::1]:41231",
			expected: "2a0f:85c1:861:2180::1",
		},
		{
			name:     "IPv6地址带端口和路径",
			url:      "http://[2001:db8::1]:8080/api",
			expected: "2001:db8::1",
		},
		{
			name:     "IPv6本地地址带端口",
			url:      "https://[::1]:8443/",
			expected: "::1",
		},
		{
			name:     "域名地址",
			url:      "http://example.com:8080/api",
			expected: "",
		},
		{
			name:     "带用户认证的IPv4",
			url:      "http://user:pass@192.168.1.100:8080/api",
			expected: "192.168.1.100",
		},
		{
			name:     "带用户认证的IPv6",
			url:      "http://user:pass@[2001:db8::1]:8080/api",
			expected: "2001:db8::1",
		},
		{
			name:     "无效URL",
			url:      "invalid-url",
			expected: "",
		},
		{
			name:     "空字符串",
			url:      "",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractIPFromURL(tt.url)
			if result != tt.expected {
				t.Errorf("extractIPFromURL(%q) = %q, want %q", tt.url, result, tt.expected)
			}
		})
	}
}

func TestExtractIPFromString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "纯IPv4地址",
			input:    "192.168.1.100",
			expected: "192.168.1.100",
		},
		{
			name:     "IPv4地址带端口",
			input:    "192.168.1.1:10101",
			expected: "192.168.1.1",
		},
		{
			name:     "IPv4地址带端口",
			input:    "192.168.1.100:8080",
			expected: "192.168.1.100",
		},
		{
			name:     "IPv6地址",
			input:    "[2001:db8::1]",
			expected: "2001:db8::1",
		},
		{
			name:     "IPv6地址带端口",
			input:    "[2a0f:85c1:861:2180::1]:41231",
			expected: "2a0f:85c1:861:2180::1",
		},
		{
			name:     "IPv6地址带端口",
			input:    "[::1]:8080",
			expected: "::1",
		},
		{
			name:     "带协议的IPv4",
			input:    "http://192.168.1.100",
			expected: "192.168.1.100",
		},
		{
			name:     "带用户认证的IPv4",
			input:    "user:pass@192.168.1.100",
			expected: "192.168.1.100",
		},
		{
			name:     "域名",
			input:    "example.com",
			expected: "example.com",
		},
		{
			name:     "空字符串",
			input:    "",
			expected: "",
		},
		{
			name:     "非标准格式带端口",
			input:    "xxxxxxxx:10101",
			expected: "xxxxxxxx",
		},
		{
			name:     "非标准格式带端口",
			input:    "adasdasd:1111",
			expected: "adasdasd",
		},
		{
			name:     "带协议的非标准格式",
			input:    "http://xxxxxxxx:10101",
			expected: "xxxxxxxx",
		},
		{
			name:     "带协议的非标准格式",
			input:    "https://adasdasd:1111",
			expected: "adasdasd",
		},
		{
			name:     "无效IPv6格式但带端口",
			input:    "[invalid-ipv6]:8080",
			expected: "invalid-ipv6",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractIPFromString(tt.input)
			if result != tt.expected {
				t.Errorf("extractIPFromString(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
