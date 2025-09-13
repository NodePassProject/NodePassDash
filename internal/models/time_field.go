package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// NullTime 兼容SQLite的可空时间类型
type NullTime struct {
	Time  time.Time
	Valid bool // Valid表示Time不是NULL
}

// Scan 实现sql.Scanner接口
func (nt *NullTime) Scan(value interface{}) error {
	if value == nil {
		nt.Time, nt.Valid = time.Time{}, false
		return nil
	}

	switch v := value.(type) {
	case time.Time:
		nt.Time, nt.Valid = v, true
		return nil
	case string:
		if v == "" {
			nt.Time, nt.Valid = time.Time{}, false
			return nil
		}
		// 尝试多种时间格式
		formats := []string{
			time.RFC3339,
			time.RFC3339Nano,
			"2006-01-02 15:04:05",
			"2006-01-02T15:04:05",
			"2006-01-02 15:04:05.000000",
		}
		for _, format := range formats {
			if t, err := time.Parse(format, v); err == nil {
				nt.Time, nt.Valid = t, true
				return nil
			}
		}
		return fmt.Errorf("无法解析时间字符串: %s", v)
	case []byte:
		return nt.Scan(string(v))
	default:
		return fmt.Errorf("无法将 %T 转换为 NullTime", value)
	}
}

// Value 实现driver.Valuer接口
func (nt NullTime) Value() (driver.Value, error) {
	if !nt.Valid {
		return nil, nil
	}
	return nt.Time.Format("2006-01-02 15:04:05"), nil
}

// Ptr 返回指向时间的指针，如果无效则返回nil
func (nt *NullTime) Ptr() *time.Time {
	if !nt.Valid {
		return nil
	}
	return &nt.Time
}

// MarshalJSON 实现JSON序列化
func (nt NullTime) MarshalJSON() ([]byte, error) {
	if !nt.Valid {
		return []byte("null"), nil
	}
	return json.Marshal(nt.Time)
}

// UnmarshalJSON 实现JSON反序列化
func (nt *NullTime) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		nt.Valid = false
		return nil
	}

	var t time.Time
	if err := json.Unmarshal(data, &t); err != nil {
		return err
	}

	nt.Time = t
	nt.Valid = true
	return nil
}