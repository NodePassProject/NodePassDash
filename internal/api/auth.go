package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
	"strings"
	"time"

	"NodePassDash/internal/auth"
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
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 检查是否禁用用户名密码登录
	disableLogin, _ := h.authService.GetSystemConfig("disable_login")
	if disableLogin == "true" {
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "用户名密码登录已禁用，请使用 OAuth2 登录",
		})
		return
	}

	var req auth.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 验证用户名和密码不为空
	if req.Username == "" || req.Password == "" {
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "用户名和密码不能为空",
		})
		return
	}

	// 验证用户身份
	if !h.authService.AuthenticateUser(req.Username, req.Password) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "用户名或密码错误",
		})
		return
	}

	// 创建用户会话
	sessionID, err := h.authService.CreateUserSession(req.Username)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(auth.LoginResponse{
			Success: false,
			Error:   "创建会话失败",
		})
		return
	}

	// 设置会话 cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   24 * 60 * 60, // 24小时
		SameSite: http.SameSiteLaxMode,
	})

	// 返回成功响应
	json.NewEncoder(w).Encode(auth.LoginResponse{
		Success: true,
		Message: "登录成功",
	})
}

// HandleLogout 处理登出请求
func (h *AuthHandler) HandleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取会话 cookie
	cookie, err := r.Cookie("session")
	if err == nil {
		// 销毁会话
		h.authService.DestroySession(cookie.Value)
	}

	// 清除 cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "登出成功",
	})
}

// HandleValidateSession 处理会话验证请求
func (h *AuthHandler) HandleValidateSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取会话 cookie
	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid": false,
		})
		return
	}

	// 验证会话
	isValid := h.authService.ValidateSession(cookie.Value)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid": isValid,
	})
}

// HandleInitSystem 处理系统初始化请求
func (h *AuthHandler) HandleInitSystem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 检查系统是否已初始化
	if h.authService.IsSystemInitialized() {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "系统已初始化",
		})
		return
	}

	// 初始化系统
	username, password, err := h.authService.InitializeSystem()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "系统初始化失败",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": username,
		"password": password,
	})
}

// HandleGetMe 获取当前登录用户信息
func (h *AuthHandler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "未登录",
		})
		return
	}

	session, ok := h.authService.GetSession(cookie.Value)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "会话失效",
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
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

// HandleChangePassword 修改密码
func (h *AuthHandler) HandleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 获取 session cookie
	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(cookie.Value) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(cookie.Value)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	var req PasswordChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "无效请求体"})
		return
	}

	if req.CurrentPassword == "" || req.NewPassword == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "缺少字段"})
		return
	}

	ok2, msg := h.authService.ChangePassword(sess.Username, req.CurrentPassword, req.NewPassword)
	if !ok2 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": msg})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": msg})
}

// HandleChangeUsername 修改用户名
func (h *AuthHandler) HandleChangeUsername(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "未登录"})
		return
	}

	if !h.authService.ValidateSession(cookie.Value) {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	sess, ok := h.authService.GetSession(cookie.Value)
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "会话无效"})
		return
	}

	var req UsernameChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "无效请求体"})
		return
	}

	if req.NewUsername == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": "新用户名不能为空"})
		return
	}

	ok2, msg := h.authService.ChangeUsername(sess.Username, req.NewUsername)
	if !ok2 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "message": msg})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": msg})
}

// HandleOAuth2Callback 处理第三方 OAuth2 回调
//
// 目前仅作为占位实现，记录回调信息并返回成功响应。
// 后续将根据 provider（github、cloudflare 等）交换 access token 并创建用户会话。
func (h *AuthHandler) HandleOAuth2Callback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	provider, _ := h.authService.GetSystemConfig("oauth2_provider")
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")

	// state 校验，防止 CSRF
	if !h.authService.ValidateOAuthState(state) {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}

	if provider == "" || code == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "缺少 provider 或 code 参数",
		})
		return
	}

	// 打印回调日志，便于调试
	fmt.Printf("📢 收到 OAuth2 回调 → provider=%s, code=%s, state=%s\n", provider, code, state)

	switch provider {
	case "github":
		h.handleGitHubOAuth(w, r, code)
	case "cloudflare":
		h.handleCloudflareOAuth(w, r, code)
	default:
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "未知 provider",
		})
	}
}

// handleGitHubOAuth 处理 GitHub OAuth2 回调
func (h *AuthHandler) handleGitHubOAuth(w http.ResponseWriter, r *http.Request, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		http.Error(w, "GitHub OAuth2 未配置", http.StatusBadRequest)
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
		http.Error(w, "GitHub OAuth2 配置不完整", http.StatusBadRequest)
		return
	}

	// 交换 access token
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")

	// GitHub 如果在 App 设置中配置了回调地址，需要在交换 token 时附带同样的 redirect_uri
	// 优先使用配置中的 redirectUri，如果没有则回退到基于 r.Host 的拼接
	redirectURI := cfg.RedirectURI
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", r.Host)
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
		http.Error(w, "请求 GitHub Token 失败", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		fmt.Printf("❌ GitHub Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		http.Error(w, "GitHub Token 接口返回错误", http.StatusBadGateway)
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
		http.Error(w, "获取 AccessToken 失败", http.StatusBadGateway)
		return
	}

	// 获取用户信息
	userReq, _ := http.NewRequest("GET", cfg.UserInfoURL, nil)
	userReq.Header.Set("Authorization", "token "+tokenRes.AccessToken)
	userReq.Header.Set("Accept", "application/json")

	// 使用支持代理的HTTP客户端
	userResp, err := proxyClient.Do(userReq)
	if err != nil {
		http.Error(w, "获取用户信息失败", http.StatusBadGateway)
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
	_ = h.authService.SaveOAuthUser("github", providerID, username, string(dataJSON))

	// 创建会话
	sessionID, err := h.authService.CreateUserSession(username)
	if err != nil {
		http.Error(w, "创建会话失败", http.StatusInternalServerError)
		return
	}

	// 设置 cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   24 * 60 * 60,
		SameSite: http.SameSiteLaxMode,
	})

	// 如果请求携带 redirect 参数或 Accept text/html，则执行页面跳转；否则返回 JSON
	redirectURL := r.URL.Query().Get("redirect")
	if redirectURL == "" {
		// 直接使用配置的 redirectUri 替换 /api/oauth2/callback 为 /dashboard
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/dashboard", 1)
	}

	accept := r.Header.Get("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		http.Redirect(w, r, redirectURL, http.StatusFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"provider": "github",
		"username": username,
		"message":  "登录成功",
	})
}

// handleCloudflareOAuth 处理 Cloudflare OAuth2 回调
func (h *AuthHandler) handleCloudflareOAuth(w http.ResponseWriter, r *http.Request, code string) {
	// 读取配置
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		http.Error(w, "Cloudflare OAuth2 未配置", http.StatusBadRequest)
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
		http.Error(w, "Cloudflare OAuth2 配置不完整", http.StatusBadRequest)
		return
	}

	// 交换 access token
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("state", r.URL.Query().Get("state"))

	// Cloudflare 如果在 App 设置中配置了回调地址，需要在交换 token 时附带同样的 redirect_uri
	// 优先使用配置中的 redirectUri，如果没有则回退到基于 r.Host 的拼接
	redirectURI := cfg.RedirectURI
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", r.Host)
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
		http.Error(w, "请求 Cloudflare Token 失败", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		fmt.Printf("❌ Cloudflare Token 错误 %d: %s\n", resp.StatusCode, string(bodyBytes))
		http.Error(w, "Cloudflare Token 接口返回错误", http.StatusBadGateway)
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
		http.Error(w, "获取 AccessToken 失败", http.StatusBadGateway)
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
		http.Error(w, "无法获取 Cloudflare 用户信息", http.StatusBadGateway)
		return
	}

	providerID := fmt.Sprintf("%v", userData["id"])
	login := fmt.Sprintf("%v", userData["login"])

	username := "cloudflare:" + login

	// 保存用户信息
	dataJSON, _ := json.Marshal(userData)
	_ = h.authService.SaveOAuthUser("cloudflare", providerID, username, string(dataJSON))

	// 创建会话
	sessionID, err := h.authService.CreateUserSession(username)
	if err != nil {
		http.Error(w, "创建会话失败", http.StatusInternalServerError)
		return
	}

	// 设置 cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   24 * 60 * 60,
		SameSite: http.SameSiteLaxMode,
	})

	// 如果请求携带 redirect 参数或 Accept text/html，则执行页面跳转；否则返回 JSON
	redirectURL := r.URL.Query().Get("redirect")
	if redirectURL == "" {
		// 直接使用配置的 redirectUri 替换 /api/oauth2/callback 为 /dashboard
		redirectURL = strings.Replace(cfg.RedirectURI, "/api/oauth2/callback", "/dashboard", 1)
	}

	accept := r.Header.Get("Accept")
	if strings.Contains(accept, "text/html") || strings.Contains(accept, "application/xhtml+xml") || redirectURL != "" {
		http.Redirect(w, r, redirectURL, http.StatusFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
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
func (h *AuthHandler) HandleOAuth2Config(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// 若请求携带有效 session，则返回完整配置；否则只返回 provider
		includeCfg := false
		if cookie, err := r.Cookie("session"); err == nil {
			if h.authService.ValidateSession(cookie.Value) {
				includeCfg = true
			}
		}

		curProvider, _ := h.authService.GetSystemConfig("oauth2_provider")

		// 若 query ?provider=xxx 且与当前不一致，则视为未绑定
		if q := r.URL.Query().Get("provider"); q != "" && q != curProvider {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": "provider not configured",
			})
			return
		}

		resp := map[string]interface{}{
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

		json.NewEncoder(w).Encode(resp)

	case http.MethodPost:
		var req OAuth2ConfigRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if req.Provider == "" {
			http.Error(w, "missing provider", http.StatusBadRequest)
			return
		}

		cfgBytes, _ := json.Marshal(req.Config)
		if err := h.authService.SetSystemConfig("oauth2_config", string(cfgBytes), "OAuth2 配置"); err != nil {
			http.Error(w, "save config failed", http.StatusInternalServerError)
			return
		}
		_ = h.authService.SetSystemConfig("oauth2_provider", req.Provider, "当前 OAuth2 提供者")

		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})

	case http.MethodDelete:
		// 解绑：统一清空
		_ = h.authService.SetSystemConfig("oauth2_config", "", "清空 OAuth2 配置")
		_ = h.authService.SetSystemConfig("oauth2_provider", "", "解绑 OAuth2")

		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// HandleOAuth2Login 生成 state 并重定向到第三方授权页
func (h *AuthHandler) HandleOAuth2Login(w http.ResponseWriter, r *http.Request) {
	provider := r.URL.Query().Get("provider")
	if provider == "" {
		var err error
		provider, err = h.authService.GetSystemConfig("oauth2_provider")
		if err != nil || provider == "" {
			http.Error(w, "oauth2 not configured", http.StatusBadRequest)
			return
		}
	}

	// 统一配置存储在 oauth2_config
	cfgStr, err := h.authService.GetSystemConfig("oauth2_config")
	if err != nil || cfgStr == "" {
		http.Error(w, "oauth2 not configured", http.StatusBadRequest)
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
		http.Error(w, "oauth2 config incomplete", http.StatusBadRequest)
		return
	}

	state := h.authService.GenerateOAuthState()

	// 优先从配置中读取 redirectUri
	redirectURI := ""
	if v, ok := cfg["redirectUri"]; ok {
		redirectURI = fmt.Sprintf("%v", v)
	}
	if redirectURI == "" {
		baseURL := fmt.Sprintf("%s://%s", "http", r.Host)
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

	http.Redirect(w, r, loginURL, http.StatusFound)
}

// HandleOAuth2Provider 仅返回当前绑定的 OAuth2 provider（用于登录页）
func (h *AuthHandler) HandleOAuth2Provider(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	provider, _ := h.authService.GetSystemConfig("oauth2_provider")
	disableLogin, _ := h.authService.GetSystemConfig("disable_login")

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"provider":     provider,
		"disableLogin": disableLogin == "true",
	})
}
