package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	// JWT 密钥，优先从环境变量读取，否则使用默认值（生产环境应该设置环境变量）
	jwtSecretKey = []byte(getJWTSecret())

	// JWT 有效期（默认 24 小时）
	jwtExpiration = 24 * time.Hour
)

// JWTClaims JWT 声明结构
type JWTClaims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// getJWTSecret 获取 JWT 密钥
func getJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		// 每次启动时自动生成随机密钥（注意：重启应用会导致所有 token 失效）
		randomSecret := generateRandomSecret(32)
		log.Println("JWT_SECRET not set, using randomly generated secret (tokens will expire on restart)")
		return randomSecret
	}
	return secret
}

// generateRandomSecret 生成指定长度的随机密钥
func generateRandomSecret(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		// 如果随机生成失败，使用 UUID 作为后备方案
		log.Printf("Failed to generate random secret: %v, using UUID fallback", err)
		return uuid.New().String() + uuid.New().String()
	}
	return base64.URLEncoding.EncodeToString(bytes)
}

// GenerateToken 生成 JWT token，返回 token 字符串、过期时间和 JTI
func (s *Service) GenerateToken(username string) (tokenString string, expiresAt time.Time, jti string, err error) {
	expirationTime := time.Now().Add(jwtExpiration)
	jti = uuid.New().String() // 生成唯一的 JWT ID

	claims := &JWTClaims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti, // 添加 jti claim
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "nodepass-dash",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err = token.SignedString(jwtSecretKey)
	if err != nil {
		return "", time.Time{}, "", err
	}

	return tokenString, expirationTime, jti, nil
}

// ValidateToken 验证 JWT token 并返回用户名
// 验证包括：签名、过期时间、以及 JTI 是否与数据库中的当前有效 JTI 匹配（防止 token 互踢）
func (s *Service) ValidateToken(tokenString string) (string, error) {
	claims := &JWTClaims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		// 验证签名方法
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return jwtSecretKey, nil
	})

	if err != nil {
		return "", err
	}

	if !token.Valid {
		return "", errors.New("invalid token")
	}

	// 验证 JTI 是否与数据库中的当前有效 JTI 匹配（实现 token 互踢）
	currentJTI, err := s.GetSystemConfig(ConfigKeyCurrentTokenJTI)
	if err != nil {
		// 如果数据库中没有 JTI 配置，说明所有 token 都已失效
		return "", errors.New("token has been invalidated")
	}

	if claims.ID != currentJTI {
		// JTI 不匹配，说明有新的登录，此 token 已被踢出
		return "", errors.New("token has been replaced by a new login")
	}

	return claims.Username, nil
}

// RefreshToken 刷新 token（验证旧 token 并生成新 token）
func (s *Service) RefreshToken(oldToken string) (tokenString string, expiresAt time.Time, jti string, err error) {
	// 验证旧 token
	username, validateErr := s.ValidateToken(oldToken)
	if validateErr != nil {
		return "", time.Time{}, "", errors.New("invalid token, cannot refresh")
	}

	// 生成新 token
	return s.GenerateToken(username)
}

// SetJWTExpiration 设置 JWT 过期时间（用于自定义配置）
func SetJWTExpiration(duration time.Duration) {
	jwtExpiration = duration
}
