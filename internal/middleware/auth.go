package middleware

import (
	"net/http"
	"strings"

	"NodePassDash/internal/auth"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware JWT 认证中间件
func AuthMiddleware(authService *auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 优先从 Authorization header 中提取 token
		authHeader := c.GetHeader("Authorization")
		token := ""

		if authHeader != "" {
			// 检查格式：Bearer <token>
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid authorization header format. Expected: Bearer <token>",
				})
				c.Abort()
				return
			}

			token = parts[1]
		} else {
			// WebSocket / SSE 在浏览器端无法方便地自定义 Authorization header，
			// 允许仅对 /api/ws/* 与 /api/sse/* 使用 query 参数透传 token。
			path := c.Request.URL.Path
			if c.Request.Method == http.MethodGet &&
				(strings.HasPrefix(path, "/api/ws/") || strings.HasPrefix(path, "/api/sse/")) {
				token = c.Query("token")
			}

			if token == "" {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Missing authorization header",
				})
				c.Abort()
				return
			}
		}

		// 验证 token
		username, err := authService.ValidateToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid or expired token",
			})
			c.Abort()
			return
		}

		// 将用户名存储到 context 中，供后续处理器使用
		c.Set("username", username)

		// 继续处理请求
		c.Next()
	}
}

// GetUsername 从 Gin context 中获取当前认证用户的用户名
// 这个辅助函数用于在 API 处理器中方便地获取用户信息
func GetUsername(c *gin.Context) string {
	username, exists := c.Get("username")
	if !exists {
		return ""
	}
	return username.(string)
}
