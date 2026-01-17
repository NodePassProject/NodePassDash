package api

import (
	"NodePassDash/internal/auth"
	"NodePassDash/internal/middleware"
	"encoding/base64"
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

	// 公开路由（无需认证）
	rg.POST("/auth/login", authHandler.HandleLogin)
	rg.POST("/auth/init", authHandler.HandleInitSystem)
	rg.GET("/auth/check-default-credentials", authHandler.HandleCheckDefaultCredentials)
	rg.GET("/auth/oauth2", authHandler.HandleOAuth2Provider)
	rg.GET("/oauth2/callback", authHandler.HandleOAuth2Callback)
	rg.GET("/oauth2/login", authHandler.HandleOAuth2Login)

	// 受保护的路由（需要 JWT 认证）
	authMiddleware := middleware.AuthMiddleware(authService)

	// 认证相关的受保护路由
	rg.POST("/auth/logout", authMiddleware, authHandler.HandleLogout)
	rg.GET("/auth/validate", authMiddleware, authHandler.HandleValidateSession)
	rg.GET("/auth/me", authMiddleware, authHandler.HandleGetMe)
	rg.POST("/auth/change-password", authMiddleware, authHandler.HandleChangePassword)
	rg.POST("/auth/change-username", authMiddleware, authHandler.HandleChangeUsername)
	rg.POST("/auth/update-security", authMiddleware, authHandler.HandleUpdateSecurity)

	// OAuth2 配置的受保护路由
	rg.GET("/oauth2/config", authMiddleware, authHandler.HandleOAuth2Config)
	rg.POST("/oauth2/config", authMiddleware, authHandler.HandleOAuth2Config)
	rg.DELETE("/oauth2/config", authMiddleware, authHandler.HandleOAuth2Config)
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
			Error:   "Username and password login is disabled, please use OAuth2 login",
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
			Error:   "Username and password cannot be empty",
		})
		return
	}

	// 验证用户身份
	if !h.authService.AuthenticateUser(req.Username, req.Password) {
		c.JSON(http.StatusUnauthorized, auth.LoginResponse{
			Success: false,
			Error:   "Invalid username or password",
		})
		return
	}

	// 生成 JWT token
	token, expiresAt, jti, err := h.authService.GenerateToken(req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, auth.LoginResponse{
			Success: false,
			Error:   "Failed to generate token",
		})
		return
	}

	// 保存 JTI 到内存（实现 token 互踢：新登录会踢掉旧 token，避免启动时SQLite锁）
	h.authService.SetCurrentJTI(jti)

	// 检查是否是默认账号密码
	isDefaultCredentials := h.authService.IsDefaultCredentials()

	// 返回成功响应，包含 JWT token
	response := map[string]interface{}{
		"success":              true,
		"message":              "Login successful",
		"token":                token,
		"expiresAt":            expiresAt.Format(time.RFC3339),
		"isDefaultCredentials": isDefaultCredentials,
	}

	c.JSON(http.StatusOK, response)

}

// HandleLogout 处理登出请求
func (h *AuthHandler) HandleLogout(c *gin.Context) {
	// 获取会话 cookie（兼容旧版本）
	sessionID, err := c.Cookie("session")
	if err == nil {
		// 销毁会话
		h.authService.DestroySession(sessionID)
	}

	// 清除内存中的 JTI，使所有 token 失效
	h.authService.ClearCurrentJTI()

	// 清除 cookie
	c.SetCookie("session", "", -1, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logout successful",
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
			"error": "System already initialized",
		})
		return
	}

	// 初始化系统
	username, password, err := h.authService.InitializeSystem()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "System initialization failed",
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
// 注意：此接口需要应用 AuthMiddleware，由中间件负责验证 JWT token
func (h *AuthHandler) HandleGetMe(c *gin.Context) {
	// 从 context 中获取用户名（由 AuthMiddleware 注入）
	username, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Not logged in",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"username": username.(string),
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
	// 从 context 中获取用户名（由 AuthMiddleware 注入）
	username, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Not logged in",
		})
		return
	}

	currentUsername := username.(string)

	var req PasswordChangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Missing fields",
		})
		return
	}

	ok2, msg := h.authService.ChangePassword(currentUsername, req.CurrentPassword, req.NewPassword)
	if !ok2 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": msg,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": msg,
	})
}

// HandleChangeUsername 修改用户名
func (h *AuthHandler) HandleChangeUsername(c *gin.Context) {
	// 从 context 中获取用户名（由 AuthMiddleware 注入）
	username, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Not logged in",
		})
		return
	}

	currentUsername := username.(string)

	var req UsernameChangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	if req.NewUsername == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "New username cannot be empty",
		})
		return
	}

	ok2, msg := h.authService.ChangeUsername(currentUsername, req.NewUsername)
	if !ok2 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": msg,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": msg,
	})
}

// HandleUpdateSecurity 同时修改用户名和密码
func (h *AuthHandler) HandleUpdateSecurity(c *gin.Context) {
	// 从 context 中获取用户名（由 AuthMiddleware 注入）
	username, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Not logged in",
		})
		return
	}

	currentUsername := username.(string)

	// 验证系统是否仍使用默认凭据，只有使用默认凭据时才允许此操作
	if !h.authService.IsDefaultCredentials() {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "This operation is only available during initial setup",
		})
		return
	}

	var req SecurityUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	if req.CurrentPassword == "" || req.NewUsername == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Missing required fields",
		})
		return
	}

	ok2, msg := h.authService.UpdateSecurity(currentUsername, req.CurrentPassword, req.NewUsername, req.NewPassword)
	if !ok2 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": msg,
		})
		return
	}

	// 修改成功后，生成新的 JWT token（基于新用户名）
	token, expiresAt, jti, err := h.authService.GenerateToken(req.NewUsername)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to generate new token",
		})
		return
	}

	// 保存新的 JTI 到内存（使旧 token 失效）
	h.authService.SetCurrentJTI(jti)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   msg,
		"token":     token,
		"expiresAt": expiresAt.Format(time.RFC3339),
		"username":  req.NewUsername,
	})
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
			"error":   "Missing provider or code parameter",
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
	default:
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"error":   "Unknown provider",
		})
	}
}

// handleGitHubOAuth 处理 GitHub OAuth2 回调
func (h *AuthHandler) handleGitHubOAuth(c *gin.Context, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub OAuth2 not configured"})
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
	_ = json.Unmarshal([]byte(cfgStr), &cfg)

	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "GitHub OAuth2 configuration incomplete"})
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
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to request GitHub token"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		fmt.Printf("❌ GitHub Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		c.JSON(http.StatusBadGateway, gin.H{"error": "GitHub token endpoint returned error"})
		return
	}

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Printf("🔑 GitHub Token 响应: %s\n", string(body))

	var tokenRes struct {
		AccessToken string `json:"access_token"`
		Scope       string `json:"scope"`
		TokenType   string `json:"token_type"`
	}
	_ = json.Unmarshal(body, &tokenRes)
	if tokenRes.AccessToken == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to get access token"})
		return
	}

	// 获取用户信息
	userReq, _ := http.NewRequest("GET", cfg.UserInfoURL, nil)
	userReq.Header.Set("Authorization", "token "+tokenRes.AccessToken)
	userReq.Header.Set("Accept", "application/json")

	// 使用支持代理的HTTP客户端
	userResp, err := proxyClient.Do(userReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to get user information"})
		return
	}
	defer userResp.Body.Close()
	userBody, _ := ioutil.ReadAll(userResp.Body)
	fmt.Printf("👤 GitHub 用户信息: %s\n", string(userBody))

	var userData map[string]interface{}
	_ = json.Unmarshal(userBody, &userData)
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

	// 生成 JWT token
	token, expiresAt, jti, err := h.authService.GenerateToken(username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// 保存 JTI 到内存（实现 token 互踢，避免启动时SQLite锁）
	h.authService.SetCurrentJTI(jti)

	// 如果请求携带 redirect 参数或 Accept text/html，则执行页面跳转；否则返回 JSON
	redirectURL := c.Query("redirect")
	if redirectURL == "" {
		// 直接使用配置的 redirectUri 替换 /api/oauth2/callback 为 /oauth-success
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/oauth-success", 1)
	}

	// 将 token 和过期时间作为 URL 参数传递
	redirectURL = fmt.Sprintf("%s?token=%s&expiresAt=%s&username=%s",
		redirectURL,
		url.QueryEscape(token),
		url.QueryEscape(expiresAt.Format(time.RFC3339)),
		url.QueryEscape(username))

	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"provider":  "github",
		"username":  username,
		"message":   "Login successful",
		"token":     token,
		"expiresAt": expiresAt.Format(time.RFC3339),
	})
}

// handleCloudflareOAuth 处理 Cloudflare OAuth2 回调
func (h *AuthHandler) handleCloudflareOAuth(c *gin.Context, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare OAuth2 not configured"})
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
	_ = json.Unmarshal([]byte(cfgStr), &cfg)

	if cfg.ClientID == "" || cfg.ClientSecret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare OAuth2 configuration incomplete"})
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
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to request Cloudflare token"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		fmt.Printf("❌ Cloudflare Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		c.JSON(http.StatusBadGateway, gin.H{"error": "Cloudflare token endpoint returned error"})
		return
	}

	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Printf("🔑 Cloudflare Token 响应: %s\n", string(body))

	var tokenRes struct {
		AccessToken string `json:"access_token"`
		IdToken     string `json:"id_token"`
		Scope       string `json:"scope"`
		TokenType   string `json:"token_type"`
	}
	_ = json.Unmarshal(body, &tokenRes)
	if tokenRes.AccessToken == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to get access token"})
		return
	}

	var userData map[string]interface{}

	if cfg.UserInfoURL != "" {
		// 调用用户信息端点
		userReq, _ := http.NewRequest("GET", cfg.UserInfoURL, nil)
		userReq.Header.Set("Authorization", "Bearer "+tokenRes.AccessToken)
		userReq.Header.Set("Accept", "application/json")

		// 使用支持代理的HTTP客户端
		userResp, err := proxyClient.Do(userReq)
		if err == nil {
			defer userResp.Body.Close()
			bodyBytes, _ := ioutil.ReadAll(userResp.Body)
			_ = json.Unmarshal(bodyBytes, &userData)
			fmt.Printf("👤 Cloudflare 用户信息: %s\n", string(bodyBytes))
		}
	}

	// 若未获取到用户信息且 id_token 存在，则解析 id_token
	if len(userData) == 0 && tokenRes.IdToken != "" {
		parts := strings.Split(tokenRes.IdToken, ".")
		if len(parts) >= 2 {
			payload, _ := base64.RawURLEncoding.DecodeString(parts[1])
			_ = json.Unmarshal(payload, &userData)
			fmt.Printf("👤 Cloudflare id_token payload: %s\n", string(payload))
		}
	}

	if len(userData) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Unable to get Cloudflare user information"})
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
		c.JSON(http.StatusBadGateway, gin.H{"error": "Unable to get Cloudflare user unique identifier"})
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

	// 生成 JWT token
	token, expiresAt, jti, err := h.authService.GenerateToken(username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// 保存 JTI 到内存（实现 token 互踢，避免启动时SQLite锁）
	h.authService.SetCurrentJTI(jti)

	// 如果请求携带 redirect 参数或 Accept text/html，则执行页面跳转；否则返回 JSON
	redirectURL := c.Query("redirect")
	if redirectURL == "" {
		// 直接使用配置的 redirectUri 替换 /api/oauth2/callback 为 /oauth-success
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/oauth-success", 1)
	}

	// 将 token 和过期时间作为 URL 参数传递
	redirectURL = fmt.Sprintf("%s?token=%s&expiresAt=%s&username=%s",
		redirectURL,
		url.QueryEscape(token),
		url.QueryEscape(expiresAt.Format(time.RFC3339)),
		url.QueryEscape(username))

	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"provider":  "cloudflare",
		"username":  username,
		"message":   "Login successful",
		"token":     token,
		"expiresAt": expiresAt.Format(time.RFC3339),
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
		// 检查是否通过 JWT 认证（由 authMiddleware 注入）
		includeCfg := false
		if _, exists := c.Get("username"); exists {
			// 已通过 JWT 认证，返回完整配置
			includeCfg = true
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
		var req OAuth2ConfigRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
			return
		}
		if req.Provider == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing provider"})
			return
		}

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

	if provider == "cloudflare" {
		q.Set("response_type", "code")
	}

	// GitHub 需要允许重复 scope param encode
	loginURL := authUrl + "?" + q.Encode()

	c.Redirect(http.StatusFound, loginURL)
}

// HandleOAuth2Provider 仅返回当前绑定的 OAuth2 provider（用于登录页）
func (h *AuthHandler) HandleOAuth2Provider(c *gin.Context) {
	provider, _ := h.authService.GetSystemConfig("oauth2_provider")
	disableLogin, _ := h.authService.GetSystemConfig("disable_login")

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"provider":     provider,
		"disableLogin": disableLogin == "true",
	})
}
