package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
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
		// 默认密钥（生产环境应该设置环境变量）
		return "nodepass-default-jwt-secret-please-change-in-production"
	}
	return secret
}

// GenerateToken 生成 JWT token
func (s *Service) GenerateToken(username string) (string, time.Time, error) {
	expirationTime := time.Now().Add(jwtExpiration)

	claims := &JWTClaims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "nodepass-dash",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecretKey)
	if err != nil {
		return "", time.Time{}, err
	}

	return tokenString, expirationTime, nil
}

// ValidateToken 验证 JWT token 并返回用户名
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

	return claims.Username, nil
}

// RefreshToken 刷新 token（验证旧 token 并生成新 token）
func (s *Service) RefreshToken(oldToken string) (string, time.Time, error) {
	// 验证旧 token
	username, err := s.ValidateToken(oldToken)
	if err != nil {
		return "", time.Time{}, errors.New("invalid token, cannot refresh")
	}

	// 生成新 token
	return s.GenerateToken(username)
}

// SetJWTExpiration 设置 JWT 过期时间（用于自定义配置）
func SetJWTExpiration(duration time.Duration) {
	jwtExpiration = duration
}
