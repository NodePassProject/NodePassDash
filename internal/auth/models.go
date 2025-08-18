package auth

import "time"

// LoginRequest 登录请求结构
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse 登录响应结构
type LoginResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// Session 用户会话结构
type Session struct {
	SessionID string    `json:"sessionId"`
	Username  string    `json:"username"`
	ExpiresAt time.Time `json:"expiresAt"`
	IsActive  bool      `json:"isActive"`
}

// SystemConfig 系统配置结构
type SystemConfig struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
}

// SystemConfigKeys 系统配置键名常量
const (
	ConfigKeyIsInitialized = "system_initialized"
	ConfigKeyAdminUsername = "admin_username"
	ConfigKeyAdminPassword = "admin_password_hash"
)

// 默认账号密码常量
const (
	DefaultAdminUsername = "nodepass"
	DefaultAdminPassword = "Np123456"
)
