package auth

import (
	"encoding/json"
	"fmt"
)

// UnmarshalConfig 安全地解析配置 JSON 字符串
func UnmarshalConfig(data string, v interface{}) error {
	if data == "" {
		return fmt.Errorf("配置为空")
	}
	if err := json.Unmarshal([]byte(data), v); err != nil {
		return fmt.Errorf("解析配置失败: %w", err)
	}
	return nil
}

// UnmarshalBytes 安全地解析字节数据为 JSON
func UnmarshalBytes(data []byte, v interface{}) error {
	if len(data) == 0 {
		return fmt.Errorf("数据为空")
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("解析数据失败: %w", err)
	}
	return nil
}

// SafeStringAssert 安全地断言为字符串,失败返回默认值
func SafeStringAssert(v interface{}, fallback string) string {
	if v == nil {
		return fallback
	}
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return fallback
}

// SafeInt64Assert 安全地断言为 int64,失败返回默认值
func SafeInt64Assert(v interface{}, fallback int64) int64 {
	if v == nil {
		return fallback
	}
	// 尝试 int64
	if i, ok := v.(int64); ok {
		return i
	}
	// 尝试 float64 (JSON 默认数字类型)
	if f, ok := v.(float64); ok {
		return int64(f)
	}
	// 尝试 int
	if i, ok := v.(int); ok {
		return int64(i)
	}
	return fallback
}
