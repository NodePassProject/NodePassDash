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
