package api

import (
	"NodePassDash/internal/auth"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AuthHandler 认证相关的处理器
type AuthHandler struct {
	authService *auth.Service
}

// NewAuthHandler 创建认证处理器实例
func NewAuthHandler(authService *auth.Service) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

// SetupAuthRoutes 设置认证相关路由（从 internal/router/auth.go 迁移）
func SetupAuthRoutes(rg *gin.RouterGroup, authService *auth.Service) {
	// 创建AuthHandler实例
	authHandler := NewAuthHandler(authService)

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

// createProxyClient 创建支持系统代理的HTTP客户端
func (h *AuthHandler) createProxyClient() *http.Client {
	// 创建Transport，自动检测系统代理设置
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment, // 自动从环境变量读取代理配置
	}

	return &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second, // 设置30秒超时
	}
}

// HandleLogin 处理登录请求
func (h *AuthHandler) HandleLogin(c *gin.Context) {

	// 检查是否禁用用户名密码登录
	disableLogin, _ := h.authService.GetSystemConfig("disable_login")
	if disableLogin == "true" {
		c.JSON(http.StatusForbidden, auth.LoginResponse{
			Success: false,
			Error:   "用户名密码登录已禁用，请使用 OAuth2 登录",
		})
		return
	}

	var req auth.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// 验证用户名和密码不为空
	if req.Username == "" || req.Password == "" {
		c.JSON(http.StatusOK, auth.LoginResponse{
			Success: false,
			Error:   "用户名和密码不能为空",
		})
		return
	}

	// 验证用户身份
	if !h.authService.AuthenticateUser(req.Username, req.Password) {
		c.JSON(http.StatusUnauthorized, auth.LoginResponse{
			Success: false,
			Error:   "用户名或密码错误",
		})
		return
	}

	// 创建用户会话 (24小时有效期)
	sessionID, err := h.authService.CreateSession(req.Username, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, auth.LoginResponse{
			Success: false,
			Error:   "创建会话失败",
		})
		return
	}

	// 设置会话 cookie
	c.SetCookie("session", sessionID, 24*60*60, "/", "", false, true)

	// 检查是否是默认账号密码
	isDefaultCredentials := h.authService.IsDefaultCredentials()

	// 返回成功响应
	response := map[string]interface{}{
		"success":              true,
		"message":              "登录成功",
		"isDefaultCredentials": isDefaultCredentials,
	}

	c.JSON(http.StatusOK, response)

}

// HandleLogout 处理登出请求
func (h *AuthHandler) HandleLogout(c *gin.Context) {
	// 获取会话 cookie
	sessionID, err := c.Cookie("session")
	if err == nil {
		// 销毁会话
		h.authService.DestroySession(sessionID)
	}

	// 清除 cookie
	c.SetCookie("session", "", -1, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "登出成功",
	})
}

// HandleValidateSession 处理会话验证请求
func (h *AuthHandler) HandleValidateSession(c *gin.Context) {
	// 获取会话 cookie
	sessionID, err := c.Cookie("session")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"valid": false,
		})
		return
	}

	// 验证会话
	isValid := h.authService.ValidateSession(sessionID)
	c.JSON(http.StatusOK, gin.H{
		"valid": isValid,
	})
}

// HandleInitSystem 处理系统初始化请求
func (h *AuthHandler) HandleInitSystem(c *gin.Context) {
	// 检查系统是否已初始化
	if h.authService.IsSystemInitialized() {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "系统已初始化",
		})
		return
	}

	// 初始化系统
	username, password, err := h.authService.InitializeSystem()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "系统初始化失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"username": username,
		"password": password,
	})
}

// HandleGetMe 获取当前登录用户信息
func (h *AuthHandler) HandleGetMe(c *gin.Context) {
	sessionID, err := c.Cookie("session")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "未登录",
		})
		return
	}

	session, ok := h.authService.GetSession(sessionID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "会话失效",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"username":  session.Username,
		"expiresAt": session.ExpiresAt,
	})
}

// PasswordChangeRequest 请求体
type PasswordChangeRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

// UsernameChangeRequest 请求体
type UsernameChangeRequest struct {
	NewUsername string `json:"newUsername"`
}

// SecurityUpdateRequest 安全设置更新请求体（用户名+密码）
type SecurityUpdateRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewUsername     string `json:"newUsername"`
	NewPassword     string `json:"newPassword"`
}

// HandleChangePassword 修改密码
func (h *AuthHandler) HandleChangePassword(c *gin.Context) {
	// 获取 session cookie
	sessionID, err := c.Cookie("session")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(sessionID) {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(sessionID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "会话无效"})
		return
	}

	var req PasswordChangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效请求体"})
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少字段"})
		return
	}

	ok2, msg := h.authService.ChangePassword(sess.Username, req.CurrentPassword, req.NewPassword)
	if !ok2 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": msg})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg})
}

// HandleChangeUsername 修改用户名
func (h *AuthHandler) HandleChangeUsername(c *gin.Context) {
	sessionID, err := c.Cookie("session")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(sessionID) {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(sessionID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "会话无效"})
		return
	}

	var req UsernameChangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效请求体"})
		return
	}

	if req.NewUsername == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "新用户名不能为空"})
		return
	}

	ok2, msg := h.authService.ChangeUsername(sess.Username, req.NewUsername)
	if !ok2 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": msg})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg})
}

// HandleUpdateSecurity 同时修改用户名和密码
func (h *AuthHandler) HandleUpdateSecurity(c *gin.Context) {
	// 获取 session cookie
	sessionID, err := c.Cookie("session")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(sessionID) {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(sessionID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "会话无效"})
		return
	}

	// 验证系统是否仍使用默认凭据，只有使用默认凭据时才允许此操作
	if !h.authService.IsDefaultCredentials() {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "此操作仅在首次设置时可用"})
		return
	}

	var req SecurityUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "无效请求体"})
		return
	}

	if req.CurrentPassword == "" || req.NewUsername == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "缺少必填字段"})
		return
	}

	ok2, msg := h.authService.UpdateSecurity(sess.Username, req.CurrentPassword, req.NewUsername, req.NewPassword)
	if !ok2 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": msg})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg})
}

// HandleCheckDefaultCredentials 检查系统是否仍使用默认凭据
func (h *AuthHandler) HandleCheckDefaultCredentials(c *gin.Context) {
	// 检查是否是默认凭据
	isDefaultCredentials := h.authService.IsDefaultCredentials()

	c.JSON(http.StatusOK, gin.H{
		"success":              true,
		"isDefaultCredentials": isDefaultCredentials,
	})
}

// HandleOAuth2Callback 处理第三方 OAuth2 回调
//
// 目前仅作为占位实现，记录回调信息并返回成功响应。
// 后续将根据 provider（github、cloudflare 等）交换 access token 并创建用户会话。
func (h *AuthHandler) HandleOAuth2Callback(c *gin.Context) {
	provider, _ := h.authService.GetSystemConfig("oauth2_provider")
	code := c.Query("code")
	state := c.Query("state")

	// state 校验，防止 CSRF
	if !h.authService.ValidateOAuthState(state) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid state"})
		return
	}

	if provider == "" || code == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "缺少 provider 或 code 参数",
		})
		return
	}

	// 打印回调日志，便于调试
	fmt.Printf("📢 收到 OAuth2 回调 → provider=%s, code=%s, state=%s\n", provider, code, state)

	switch provider {
	case "github":
		h.handleGitHubOAuth(c, code)
	case "cloudflare":
		h.handleCloudflareOAuth(c, code)
	case "custom":
		h.handleCustomOIDC(c, code)
	default:
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   "未知 provider",
		})
	}
}

// handleGitHubOAuth 处理 GitHub OAuth2 回调
func (h *AuthHandler) handleGitHubOAuth(c *gin.Context, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub OAuth2 未配置"})
		return
	}

	type ghCfg struct {
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
		TokenURL     string `json:"tokenUrl"`
		UserInfoURL  string `json:"userInfoUrl"`
		RedirectURI  string `json:"redirectUri"`
	}
	var cfg ghCfg
	if err := auth.UnmarshalConfig(cfgStr, &cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("配置解析失败: %v", err)})
		return
	}

	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub OAuth2 配置不完整"})
		return
	}

	// 交换 access token
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")

	// GitHub 如果在 App 设置中配置了回调地址，需要在交换 token 时附带同样的 redirect_uri
	// 优先使用配置中的 redirectUri，如果没有则回退到基于 c.Request.Host 的拼接
	redirectURI := cfg.RedirectURI
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", c.Request.Host)
		redirectURI = baseURL + "/api/oauth2/callback"
	}
	form.Set("redirect_uri", redirectURI)

	fmt.Printf("🔍 GitHub Token 请求参数: client_id=%s, redirect_uri=%s, token_url=%s\n",
		cfg.ClientID, redirectURI, cfg.TokenURL)
	fmt.Printf("🔍 请求体: %s\n", form.Encode())

	tokenReq, _ := http.NewRequest("POST", cfg.TokenURL, strings.NewReader(form.Encode()))
	tokenReq.Header.Set("Accept", "application/json")
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// 使用支持代理的HTTP客户端
	proxyClient := h.createProxyClient()
	resp, err := proxyClient.Do(tokenReq)
	if err != nil {
		fmt.Printf("❌ GitHub Token 请求错误: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "请求 GitHub Token 失败"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("❌ GitHub Token 读取响应失败: %v\n", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "读取 GitHub Token 响应失败"})
			return
		}
		fmt.Printf("❌ GitHub Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		c.JSON(http.StatusBadGateway, gin.H{"error": "GitHub Token 接口返回错误"})
		return
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("❌ GitHub Token 读取响应失败: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 GitHub Token 响应失败"})
		return
	}
	fmt.Printf("🔑 GitHub Token 响应: %s\n", string(body))

	var tokenRes struct {
		AccessToken string `json:"access_token"`
		Scope       string `json:"scope"`
		TokenType   string `json:"token_type"`
	}
	if err := auth.UnmarshalBytes(body, &tokenRes); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析 Token 响应失败"})
		return
	}
	if tokenRes.AccessToken == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取 AccessToken 失败"})
		return
	}

	// 获取用户信息
	userReq, _ := http.NewRequest("GET", cfg.UserInfoURL, nil)
	userReq.Header.Set("Authorization", "token "+tokenRes.AccessToken)
	userReq.Header.Set("Accept", "application/json")

	// 使用支持代理的HTTP客户端
	userResp, err := proxyClient.Do(userReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取用户信息失败"})
		return
	}
	defer userResp.Body.Close()
	userBody, err := ioutil.ReadAll(userResp.Body)
	if err != nil {
		fmt.Printf("❌ GitHub 用户信息读取失败: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 GitHub 用户信息失败"})
		return
	}
	fmt.Printf("👤 GitHub 用户信息: %s\n", string(userBody))

	var userData map[string]interface{}
	if err := auth.UnmarshalBytes(userBody, &userData); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析用户信息失败"})
		return
	}
	providerID := fmt.Sprintf("%v", userData["id"])
	login := fmt.Sprintf("%v", userData["login"])

	username := "github:" + login

	// 保存用户信息
	dataJSON, _ := json.Marshal(userData)
	if err := h.authService.SaveOAuthUser("github", providerID, username, string(dataJSON)); err != nil {
		fmt.Printf("❌ 保存 GitHub 用户失败: %v\n", err)
		// 重定向到错误页面而不是返回 HTTP 错误
		// 使用与配置中相同的 host 进行跳转
		baseURL := ""
		if cfg.RedirectURI != "" {
			baseURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "", 1)
		} else {
			// 回退到基于请求 Host 的拼接
			scheme := "http"
			if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
				scheme = "https"
			}
			baseURL = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
		}
		errorURL := fmt.Sprintf("%s/oauth-error?error=%s&provider=github",
			baseURL, url.QueryEscape(err.Error()))
		c.Redirect(http.StatusFound, errorURL)
		return
	}

	// 创建会话 (24小时有效期)
	sessionID, err := h.authService.CreateSession(username, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}

	// 设置 cookie
	c.SetCookie("session", sessionID, 24*60*60, "/", "", false, true)

	// 如果请求携带 redirect 参数或 Accept text/html，则执行页面跳转；否则返回 JSON
	redirectURL := c.Query("redirect")
	if redirectURL == "" {
		// 直接使用配置的 redirectUri 替换 /api/oauth2/callback 为 /dashboard
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/dashboard", 1)
	}

	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"provider": "github",
		"username": username,
		"message":  "登录成功",
	})
}

// handleCloudflareOAuth 处理 Cloudflare OAuth2 回调
func (h *AuthHandler) handleCloudflareOAuth(c *gin.Context, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare OAuth2 未配置"})
		return
	}

	type cfCfg struct {
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
		TokenURL     string `json:"tokenUrl"`
		UserInfoURL  string `json:"userInfoUrl"`
		RedirectURI  string `json:"redirectUri"`
	}
	var cfg cfCfg
	if err := auth.UnmarshalConfig(cfgStr, &cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("配置解析失败: %v", err)})
		return
	}

	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare OAuth2 配置不完整"})
		return
	}

	// 交换 access token
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("state", c.Query("state"))

	// Cloudflare 如果在 App 设置中配置了回调地址，需要在交换 token 时附带同样的 redirect_uri
	// 优先使用配置中的 redirectUri，如果没有则回退到基于 c.Request.Host 的拼接
	redirectURI := cfg.RedirectURI
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", c.Request.Host)
		redirectURI = baseURL + "/api/oauth2/callback"
	}
	form.Set("redirect_uri", redirectURI)

	tokenReq, _ := http.NewRequest("POST", cfg.TokenURL, strings.NewReader(form.Encode()))
	tokenReq.Header.Set("Accept", "application/json")
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// 使用支持代理的HTTP客户端
	proxyClient := h.createProxyClient()
	resp, err := proxyClient.Do(tokenReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "请求 Cloudflare Token 失败"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("❌ Cloudflare Token 读取响应失败: %v\n", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "读取 Cloudflare Token 响应失败"})
			return
		}
		fmt.Printf("❌ Cloudflare Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		c.JSON(http.StatusBadGateway, gin.H{"error": "Cloudflare Token 接口返回错误"})
		return
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("❌ Cloudflare Token 读取响应失败: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 Cloudflare Token 响应失败"})
		return
	}
	fmt.Printf("🔑 Cloudflare Token 响应: %s\n", string(body))

	var tokenRes struct {
		AccessToken string `json:"access_token"`
		IdToken     string `json:"id_token"`
		Scope       string `json:"scope"`
		TokenType   string `json:"token_type"`
	}
	if err := auth.UnmarshalBytes(body, &tokenRes); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析 Token 响应失败"})
		return
	}
	if tokenRes.AccessToken == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取 AccessToken 失败"})
		return
	}

	// 获取用户信息
	if cfg.UserInfoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare OAuth2 配置缺少 userInfoUrl"})
		return
	}

	userReq, _ := http.NewRequest("GET", cfg.UserInfoURL, nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenRes.AccessToken)
	userReq.Header.Set("Accept", "application/json")

	// 使用支持代理的HTTP客户端
	userResp, err := proxyClient.Do(userReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取 Cloudflare 用户信息失败"})
		return
	}
	defer userResp.Body.Close()
	bodyBytes, err := ioutil.ReadAll(userResp.Body)
	if err != nil {
		fmt.Printf("❌ Cloudflare 用户信息读取失败: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 Cloudflare 用户信息失败"})
		return
	}
	fmt.Printf("👤 Cloudflare 用户信息: %s\n", string(bodyBytes))

	var userData map[string]interface{}
	if err := auth.UnmarshalBytes(bodyBytes, &userData); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析 Cloudflare 用户信息失败"})
		return
	}

	// Cloudflare 使用 sub 字段作为用户唯一标识，GitHub 使用 id 字段
	providerID := fmt.Sprintf("%v", userData["id"])
	if providerID == "<nil>" || providerID == "" {
		// 如果 id 字段为空或 nil，则使用 sub 字段
		providerID = fmt.Sprintf("%v", userData["sub"])
		fmt.Printf("🔍 Cloudflare 使用 sub 字段作为 providerID: %s\n", providerID)
	} else {
		fmt.Printf("🔍 Cloudflare 使用 id 字段作为 providerID: %s\n", providerID)
	}

	// 最终验证 providerID 是否有效
	if providerID == "<nil>" || providerID == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法获取 Cloudflare 用户唯一标识"})
		return
	}

	login := fmt.Sprintf("%v", userData["login"])
	if login == "<nil>" || login == "" {
		// 如果 login 字段为空，则使用 email 或 sub 字段作为登录名
		if email := fmt.Sprintf("%v", userData["email"]); email != "<nil>" && email != "" {
			login = email
		} else {
			login = providerID // 回退到使用 providerId 作为登录名
		}
	}

	username := "cloudflare:" + login

	// 保存用户信息
	dataJSON, _ := json.Marshal(userData)
	if err := h.authService.SaveOAuthUser("cloudflare", providerID, username, string(dataJSON)); err != nil {
		fmt.Printf("❌ 保存 Cloudflare 用户失败: %v\n", err)
		// 重定向到错误页面而不是返回 HTTP 错误
		// 使用与配置中相同的 host 进行跳转
		baseURL := ""
		if cfg.RedirectURI != "" {
			baseURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "", 1)
		} else {
			// 回退到基于请求 Host 的拼接
			scheme := "http"
			if c.Request.TLS != nil || c.Request.Header.Get("X-Forwarded-Proto") == "https" {
				scheme = "https"
			}
			baseURL = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
		}
		errorURL := fmt.Sprintf("%s/oauth-error?error=%s&provider=cloudflare",
			baseURL, url.QueryEscape(err.Error()))
		c.Redirect(http.StatusFound, errorURL)
		return
	}

	// 创建会话 (24小时有效期)
	sessionID, err := h.authService.CreateSession(username, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}

	// 设置 cookie
	c.SetCookie("session", sessionID, 24*60*60, "/", "", false, true)

	// 如果请求携带 redirect 参数或 Accept text/html，则执行页面跳转；否则返回 JSON
	redirectURL := c.Query("redirect")
	if redirectURL == "" {
		// 直接使用配置的 redirectUri 替换 /api/oauth2/callback 为 /dashboard
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/dashboard", 1)
	}

	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"provider": "cloudflare",
		"username": username,
		"message":  "登录成功",
	})
}

// OAuth2Config 请求体
type OAuth2ConfigRequest struct {
	Provider string                 `json:"provider"`
	Config   map[string]interface{} `json:"config"`
}

// HandleOAuth2Config 读取或保存 OAuth2 配置
// GET  参数: ?provider=github|cloudflare
// POST Body: {provider, config}
func (h *AuthHandler) HandleOAuth2Config(c *gin.Context) {
	switch c.Request.Method {
	case http.MethodGet:
		// 若请求携带有效 session，则返回完整配置；否则只返回 provider
		includeCfg := false
		if sessionID, err := c.Cookie("session"); err == nil {
			if h.authService.ValidateSession(sessionID) {
				includeCfg = true
			}
		}

		curProvider, _ := h.authService.GetSystemConfig("oauth2_provider")

		// 若 query ?provider=xxx 且与当前不一致，则视为未绑定
		if q := c.Query("provider"); q != "" && q != curProvider {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "provider not configured",
			})
			return
		}

		resp := gin.H{
			"success":  true,
			"provider": curProvider,
		}
		if includeCfg {
			cfgStr, _ := h.authService.GetSystemConfig("oauth2_config")
			var cfg map[string]interface{}
			if cfgStr != "" {
				_ = json.Unmarshal([]byte(cfgStr), &cfg)
			}
			resp["config"] = cfg
		}

		c.JSON(http.StatusOK, resp)

	case http.MethodPost:
		// 1. 验证会话（仅管理员可配置）
		sessionID, err := c.Cookie("session")
		if err != nil || !h.authService.ValidateSession(sessionID) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "需要管理员权限"})
			return
		}

		var req OAuth2ConfigRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if req.Provider == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing provider"})
			return
		}

		// 2. Custom OIDC 执行 discovery
		if req.Provider == "custom" {
			issuerURL, ok := req.Config["issuerUrl"].(string)
			if !ok || issuerURL == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 issuerUrl"})
				return
			}

			// 3. Discovery（仅允许 HTTPS，支持内网 IP）
			validator := &auth.URLValidator{
				AllowHTTP:      false, // 仅允许 HTTPS
				AllowPrivateIP: true,  // 支持内网 IP（需 HTTPS）
			}

			discoveredConfig, err := auth.SecureDiscoverOIDC(issuerURL, validator)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{
					"success": false,
					"error":   fmt.Sprintf("OIDC Discovery 失败: %v", err),
				})
				return
			}

			// 4. 自动填充端点
			req.Config["authUrl"] = discoveredConfig.AuthorizationEndpoint
			req.Config["tokenUrl"] = discoveredConfig.TokenEndpoint
			req.Config["userInfoUrl"] = discoveredConfig.UserinfoEndpoint
			req.Config["issuer"] = discoveredConfig.Issuer
		}

		// 5. 添加 redirectUri
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		req.Config["redirectUri"] = fmt.Sprintf("%s://%s/api/oauth2/callback", scheme, c.Request.Host)

		cfgBytes, _ := json.Marshal(req.Config)
		if err := h.authService.SetSystemConfig("oauth2_config", string(cfgBytes)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "save config failed"})
			return
		}
		_ = h.authService.SetSystemConfig("oauth2_provider", req.Provider)

		c.JSON(http.StatusOK, gin.H{"success": true})

	case http.MethodDelete:
		// 解绑：统一清空配置和用户信息
		_ = h.authService.SetSystemConfig("oauth2_config", "")
		_ = h.authService.SetSystemConfig("oauth2_provider", "")
		// 清空所有 OAuth 用户信息
		if err := h.authService.DeleteAllOAuthUsers(); err != nil {
			fmt.Printf("⚠️ 清空 OAuth 用户信息失败: %v\n", err)
		}

		c.JSON(http.StatusOK, gin.H{"success": true})

	default:
		c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "Method not allowed"})
	}
}

// HandleOAuth2Login 生成 state 并重定向到第三方授权页
func (h *AuthHandler) HandleOAuth2Login(c *gin.Context) {
	provider := c.Query("provider")
	if provider == "" {
		var err error
		provider, err = h.authService.GetSystemConfig("oauth2_provider")
		if err != nil || provider == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "oauth2 not configured"})
			return
		}
	}

	// 统一配置存储在 oauth2_config
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "oauth2 not configured"})
		return
	}

	// 通用字段
	var cfg map[string]interface{}
	_ = json.Unmarshal([]byte(cfgStr), &cfg)

	clientId := fmt.Sprintf("%v", cfg["clientId"])
	authUrl := fmt.Sprintf("%v", cfg["authUrl"])
	scopes := ""
	if v, ok := cfg["scopes"].([]interface{}); ok {
		var s []string
		for _, itm := range v {
			s = append(s, fmt.Sprintf("%v", itm))
		}
		scopes = strings.Join(s, " ")
	}

	if clientId == "" || authUrl == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "oauth2 config incomplete"})
		return
	}

	state := h.authService.GenerateOAuthState()

	// 优先从配置中读取 redirectUri
	redirectURI := ""
	if v, ok := cfg["redirectUri"]; ok {
		redirectURI = fmt.Sprintf("%v", v)
	}
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", c.Request.Host)
		redirectURI = baseURL + "/api/oauth2/callback"
	}

	// 拼接查询参数
	q := url.Values{}
	q.Set("client_id", clientId)
	q.Set("redirect_uri", redirectURI)
	q.Set("state", state)
	if scopes != "" {
		q.Set("scope", scopes)
	}

	// Cloudflare 和 Custom OIDC 需要设置 response_type=code（OIDC 标准）
	if provider == "cloudflare" || provider == "custom" {
		q.Set("response_type", "code")
	}

	// GitHub 需要允许重复 scope param encode
	loginURL := authUrl + "?" + q.Encode()

	c.Redirect(http.StatusFound, loginURL)
}

// handleCustomOIDC 处理 Custom OIDC 回调
func (h *AuthHandler) handleCustomOIDC(c *gin.Context, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Custom OIDC 未配置"})
		return
	}

	type customCfg struct {
		ClientID     string   `json:"clientId"`
		ClientSecret string   `json:"clientSecret"`
		AuthURL      string   `json:"authUrl"`
		TokenURL     string   `json:"tokenUrl"`
		UserInfoURL  string   `json:"userInfoUrl"`
		RedirectURI  string   `json:"redirectUri"`
		Scopes       []string `json:"scopes"`
		UserIDPath   string   `json:"userIdPath"`
		UsernamePath string   `json:"usernamePath"`
		DisplayName  string   `json:"displayName"`
	}
	var cfg customCfg
	if err := auth.UnmarshalConfig(cfgStr, &cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("配置解析失败: %v", err)})
		return
	}

	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.TokenURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Custom OIDC 配置不完整"})
		return
	}

	// 设置默认值
	if cfg.UserIDPath == "" {
		cfg.UserIDPath = "sub"
	}
	if cfg.UsernamePath == "" {
		cfg.UsernamePath = "preferred_username"
	}
	if cfg.DisplayName == "" {
		cfg.DisplayName = "OIDC"
	}

	// 交换 access token
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")

	// 设置 redirect_uri
	redirectURI := cfg.RedirectURI
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", c.Request.Host)
		redirectURI = baseURL + "/api/oauth2/callback"
	}
	form.Set("redirect_uri", redirectURI)

	fmt.Printf("🔍 Custom OIDC Token 请求: token_url=%s, redirect_uri=%s\n", cfg.TokenURL, redirectURI)

	tokenReq, _ := http.NewRequest("POST", cfg.TokenURL, strings.NewReader(form.Encode()))
	tokenReq.Header.Set("Accept", "application/json")
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// 使用支持代理的HTTP客户端
	proxyClient := h.createProxyClient()
	resp, err := proxyClient.Do(tokenReq)
	if err != nil {
		fmt.Printf("❌ Custom OIDC Token 请求错误: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "请求 OIDC Token 失败"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("❌ Custom OIDC Token 读取响应失败: %v\n", err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "读取 OIDC Token 响应失败"})
			return
		}
		fmt.Printf("❌ Custom OIDC Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		c.JSON(http.StatusBadGateway, gin.H{"error": "OIDC Token 接口返回错误"})
		return
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("❌ Custom OIDC Token 读取响应失败: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 OIDC Token 响应失败"})
		return
	}
	fmt.Printf("🔑 Custom OIDC Token 响应: %s\n", string(body))

	var tokenRes struct {
		AccessToken string `json:"access_token"`
		IdToken     string `json:"id_token"`
		Scope       string `json:"scope"`
		TokenType   string `json:"token_type"`
	}
	if err := auth.UnmarshalBytes(body, &tokenRes); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析 Token 响应失败"})
		return
	}
	if tokenRes.AccessToken == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取 AccessToken 失败"})
		return
	}

	// 获取用户信息
	if cfg.UserInfoURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Custom OIDC 配置缺少 userInfoUrl"})
		return
	}

	userReq, _ := http.NewRequest("GET", cfg.UserInfoURL, nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenRes.AccessToken)
	userReq.Header.Set("Accept", "application/json")

	userResp, err := proxyClient.Do(userReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取 OIDC 用户信息失败"})
		return
	}
	defer userResp.Body.Close()
	bodyBytes, err := ioutil.ReadAll(userResp.Body)
	if err != nil {
		fmt.Printf("❌ Custom OIDC 用户信息读取失败: %v\n", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 OIDC 用户信息失败"})
		return
	}
	fmt.Printf("👤 Custom OIDC 用户信息: %s\n", string(bodyBytes))

	var userData map[string]interface{}
	if err := auth.UnmarshalBytes(bodyBytes, &userData); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析 OIDC 用户信息失败"})
		return
	}

	// 提取用户 ID（使用配置的 userIdPath）
	providerID := h.extractFieldFromUserData(userData, cfg.UserIDPath)
	if providerID == "" {
		// 回退到常用字段
		providerID = h.extractFieldFromUserData(userData, "sub")
		if providerID == "" {
			providerID = h.extractFieldFromUserData(userData, "id")
		}
	}

	if providerID == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "无法获取 OIDC 用户唯一标识"})
		return
	}

	// 提取用户名（使用配置的 usernamePath）
	login := h.extractFieldFromUserData(userData, cfg.UsernamePath)
	if login == "" {
		// 回退到常用字段
		login = h.extractFieldFromUserData(userData, "preferred_username")
		if login == "" {
			login = h.extractFieldFromUserData(userData, "email")
		}
		if login == "" {
			login = h.extractFieldFromUserData(userData, "name")
		}
		if login == "" {
			login = providerID // 最后回退到使用 providerID
		}
	}

	username := "custom:" + login

	// 保存用户信息
	dataJSON, _ := json.Marshal(userData)
	if err := h.authService.SaveOAuthUser("custom", providerID, username, string(dataJSON)); err != nil {
		fmt.Printf("❌ 保存 Custom OIDC 用户失败: %v\n", err)
		// 重定向到错误页面
		baseURL := ""
		if cfg.RedirectURI != "" {
			baseURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "", 1)
		} else {
			scheme := "http"
			if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
				scheme = "https"
			}
			baseURL = fmt.Sprintf("%s://%s", scheme, c.Request.Host)
		}
		errorURL := fmt.Sprintf("%s/oauth-error?error=%s&provider=custom",
			baseURL, url.QueryEscape(err.Error()))
		c.Redirect(http.StatusFound, errorURL)
		return
	}

	// 创建会话 (24小时有效期)
	sessionID, err := h.authService.CreateSession(username, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建会话失败"})
		return
	}

	// 设置 cookie
	c.SetCookie("session", sessionID, 24*60*60, "/", "", false, true)

	// 重定向到 dashboard
	redirectURL := c.Query("redirect")
	if redirectURL == "" {
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/dashboard", 1)
	}

	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"provider": "custom",
		"username": username,
		"message":  "登录成功",
	})
}

// extractFieldFromUserData 从用户数据中提取字段（支持简单的点号路径）
func (h *AuthHandler) extractFieldFromUserData(data map[string]interface{}, path string) string {
	if path == "" {
		return ""
	}

	parts := strings.Split(path, ".")
	current := data

	for i, part := range parts {
		if val, ok := current[part]; ok {
			if i == len(parts)-1 {
				// 最后一个部分，转换为字符串
				return fmt.Sprintf("%v", val)
			}
			// 不是最后一个部分，继续深入
			if nested, ok := val.(map[string]interface{}); ok {
				current = nested
			} else {
				return ""
			}
		} else {
			return ""
		}
	}
	return ""
}

// HandleOAuth2Provider 仅返回当前绑定的 OAuth2 provider（用于登录页）
func (h *AuthHandler) HandleOAuth2Provider(c *gin.Context) {
	provider, _ := h.authService.GetSystemConfig("oauth2_provider")
	disableLogin, _ := h.authService.GetSystemConfig("disable_login")

	resp := gin.H{
		"success":      true,
		"provider":     provider,
		"disableLogin": disableLogin == "true",
	}

	// 如果是 custom provider，返回 displayName
	if provider == "custom" {
		cfgStr, _ := h.authService.GetSystemConfig("oauth2_config")
		if cfgStr != "" {
			var cfg map[string]interface{}
			if err := auth.UnmarshalConfig(cfgStr, &cfg); err == nil {
				displayName := auth.SafeStringAssert(cfg["displayName"], "")
				if displayName != "" {
					resp["displayName"] = displayName
				}
			}
		}
	}

	c.JSON(http.StatusOK, resp)
}

