package router

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/auth"

	"github.com/gin-gonic/gin"
)

// setupAuthRoutes 设置认证相关路由
func setupAuthRoutes(rg *gin.RouterGroup, authService *auth.Service) {
	// 创建AuthHandler实例
	authHandler := api.NewAuthHandler(authService)

	// 认证路由
	rg.POST("/auth/login", authHandler.HandleLogin)
	rg.POST("/auth/logout", authHandler.HandleLogout)
	rg.GET("/auth/validate", authHandler.HandleValidateSession)
	rg.GET("/auth/me", authHandler.HandleGetMe)
	rg.POST("/auth/init", authHandler.HandleInitSystem)
	rg.POST("/auth/change-password", authHandler.HandleChangePassword)
	rg.POST("/auth/change-username", authHandler.HandleChangeUsername)
	rg.POST("/auth/update-security", authHandler.HandleUpdateSecurity)
	rg.GET("/auth/check-default-credentials", authHandler.HandleCheckDefaultCredentials)
	rg.GET("/auth/oauth2", authHandler.HandleOAuth2Provider)

	// OAuth2 回调
	rg.GET("/oauth2/callback", authHandler.HandleOAuth2Callback)
	rg.GET("/oauth2/login", authHandler.HandleOAuth2Login)
	// OAuth2 配置读写
	rg.GET("/oauth2/config", authHandler.HandleOAuth2Config)
	rg.POST("/oauth2/config", authHandler.HandleOAuth2Config)
	rg.DELETE("/oauth2/config", authHandler.HandleOAuth2Config)
}
