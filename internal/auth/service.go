package auth

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"os"
	"sync"
	"time"

	"NodePassDash/internal/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	// 内存中的会话存储
	sessionCache = sync.Map{}
	// OAuth2 state 缓存，防止 CSRF
	oauthStateCache = sync.Map{} // key:string state, value:int64 timestamp
)

// Service 认证服务
type Service struct {
	db          *gorm.DB
	configCache sync.Map     // 系统配置缓存，跟随当前 DB 连接，避免 setup 切库时串库
	currentJTI  string       // 当前有效的 JWT ID（内存存储，避免启动时SQLite锁）
	jtiMutex    sync.RWMutex // JTI 读写锁
	demoMode    bool         // Demo 模式开关
}

// NewService 创建认证服务实例，需要传入GORM数据库连接
func NewService(db *gorm.DB) *Service {
	return &Service{
		db:       db,
		demoMode: false,
	}
}

// SetDemoMode 设置 Demo 模式
func (s *Service) SetDemoMode(enabled bool) {
	s.demoMode = enabled
}

// HashPassword 密码加密
func (s *Service) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword 密码验证
func (s *Service) VerifyPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// GetSystemConfig 获取系统配置（优先缓存）
func (s *Service) GetSystemConfig(key string) (string, error) {
	// 先检查缓存
	if value, ok := s.configCache.Load(key); ok {
		return value.(string), nil
	}

	// 使用GORM查询数据库（用 Find+Limit 避免 First 把 not-found 打成 ERROR 日志）
	var configs []models.SystemConfig
	if err := s.db.Where("key = ?", key).Limit(1).Find(&configs).Error; err != nil {
		return "", err
	}
	if len(configs) == 0 {
		return "", errors.New("configuration does not exist")
	}
	config := configs[0]

	// 写入缓存
	s.configCache.Store(key, config.Value)
	return config.Value, nil
}

// SetSystemConfig 设置系统配置
func (s *Service) SetSystemConfig(key, value string) error {
	// 使用GORM的Upsert操作 (Create or Update)
	config := models.SystemConfig{
		Key:   key,
		Value: value,
	}

	// 先尝试更新，如果不存在则创建
	result := s.db.Where("key = ?", key).Updates(&config)
	if result.Error != nil {
		return result.Error
	}

	// 如果没有更新任何行，则创建新记录
	if result.RowsAffected == 0 {
		err := s.db.Create(&config).Error
		if err != nil {
			return err
		}
	}

	// 更新缓存
	s.configCache.Store(key, value)
	return nil
}

// GetSystemConfigWithDefault 获取系统配置，如果不存在则返回默认值
func (s *Service) GetSystemConfigWithDefault(key, defaultValue string) string {
	value, err := s.GetSystemConfig(key)
	if err != nil {
		return defaultValue
	}
	return value
}

// DeleteSystemConfig 删除系统配置
func (s *Service) DeleteSystemConfig(key string) error {
	// 使用GORM删除
	err := s.db.Where("key = ?", key).Delete(&models.SystemConfig{}).Error
	if err != nil {
		return err
	}

	// 删除缓存
	s.configCache.Delete(key)
	return nil
}

// IsSystemInitialized 检查系统是否已初始化
func (s *Service) IsSystemInitialized() bool {
	value, _ := s.GetSystemConfig(ConfigKeyIsInitialized)
	return value == "true"
}

// IsDefaultCredentials 检查当前账号密码是否是默认的
func (s *Service) IsDefaultCredentials() bool {
	storedUsername, _ := s.GetSystemConfig(ConfigKeyAdminUsername)
	storedPasswordHash, _ := s.GetSystemConfig(ConfigKeyAdminPassword)

	if storedUsername != DefaultAdminUsername {
		return false
	}

	// 验证密码是否是默认密码
	return s.VerifyPassword(DefaultAdminPassword, storedPasswordHash)
}

// AuthenticateUser 用户登录验证
func (s *Service) AuthenticateUser(username, password string) bool {
	storedUsername, _ := s.GetSystemConfig(ConfigKeyAdminUsername)
	storedPasswordHash, _ := s.GetSystemConfig(ConfigKeyAdminPassword)

	if storedUsername == "" || storedPasswordHash == "" {
		return false
	}

	if username != storedUsername {
		return false
	}

	return s.VerifyPassword(password, storedPasswordHash)
}

// CreateSession 创建用户会话
func (s *Service) CreateSession(username string, duration time.Duration) (string, error) {
	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(duration)

	// 使用GORM创建会话
	session := models.UserSession{
		SessionID: sessionID,
		Username:  username,
		CreatedAt: time.Now(),
		ExpiresAt: expiresAt,
		IsActive:  true,
	}

	err := s.db.Create(&session).Error
	if err != nil {
		return "", err
	}

	// 更新缓存
	sessionCache.Store(sessionID, Session{
		SessionID: sessionID,
		Username:  username,
		ExpiresAt: expiresAt,
		IsActive:  true,
	})

	return sessionID, nil
}

// ValidateSession 验证会话是否有效
func (s *Service) ValidateSession(sessionID string) bool {
	// 先检查缓存
	if value, ok := sessionCache.Load(sessionID); ok {
		session := value.(Session)
		if session.IsActive && time.Now().Before(session.ExpiresAt) {
			return true
		}
		// 缓存过期或失效，删除
		sessionCache.Delete(sessionID)
	}

	// 使用GORM查询数据库
	var userSession models.UserSession
	err := s.db.Where("session_id = ?", sessionID).First(&userSession).Error
	if err != nil {
		return false
	}

	if !userSession.IsActive || time.Now().After(userSession.ExpiresAt) {
		// 标记为失效
		s.db.Model(&userSession).Update("is_active", false)
		return false
	}

	// 更新缓存
	sessionCache.Store(sessionID, Session{
		SessionID: sessionID,
		Username:  userSession.Username,
		ExpiresAt: userSession.ExpiresAt,
		IsActive:  userSession.IsActive,
	})

	return true
}

// GetSessionUser 获取会话对应的用户名
func (s *Service) GetSessionUser(sessionID string) (string, error) {
	// 先检查缓存
	if value, ok := sessionCache.Load(sessionID); ok {
		session := value.(Session)
		if session.IsActive && time.Now().Before(session.ExpiresAt) {
			return session.Username, nil
		}
		sessionCache.Delete(sessionID)
	}

	// 使用GORM查询数据库
	var userSession models.UserSession
	err := s.db.Where("session_id = ?", sessionID).First(&userSession).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", errors.New("session does not exist")
		}
		return "", err
	}

	if !userSession.IsActive || time.Now().After(userSession.ExpiresAt) {
		return "", errors.New("session has expired")
	}

	// 更新缓存
	sessionCache.Store(sessionID, Session{
		SessionID: sessionID,
		Username:  userSession.Username,
		ExpiresAt: userSession.ExpiresAt,
		IsActive:  userSession.IsActive,
	})

	return userSession.Username, nil
}

// DestroySession 销毁会话
func (s *Service) DestroySession(sessionID string) {
	// 使用GORM更新数据库
	s.db.Model(&models.UserSession{}).Where("session_id = ?", sessionID).Update("is_active", false)

	// 删除缓存
	sessionCache.Delete(sessionID)
}

// CleanupExpiredSessions 清理过期会话
func (s *Service) CleanupExpiredSessions() {
	// 使用GORM更新数据库
	s.db.Model(&models.UserSession{}).
		Where("expires_at < ? AND is_active = ?", time.Now(), true).
		Update("is_active", false)

	// 清理缓存
	sessionCache.Range(func(key, value interface{}) bool {
		session := value.(Session)
		if !session.IsActive || time.Now().After(session.ExpiresAt) {
			sessionCache.Delete(key)
		}
		return true
	})
}

// setAdminConfigs 写入管理员账号到 system_configs 表。
// 包含 username / password hash / is_initialized=true。
// 供 InitializeSystem 与 InitializeSystemWithCredentials 共用。
func (s *Service) setAdminConfigs(username, passwordHash string) error {
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, username); err != nil {
		return err
	}
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, passwordHash); err != nil {
		return err
	}
	if err := s.SetSystemConfig(ConfigKeyIsInitialized, "true"); err != nil {
		return err
	}
	return nil
}

// validateAdminCredentials 校验用户提供的管理员凭据是否符合规则。
// 用户名: 3~20 字符,只允许字母数字下划线。
// 密码: 长度 ≥ 8。
func validateAdminCredentials(username, password string) error {
	if n := len(username); n < 3 || n > 20 {
		return errors.New("用户名长度必须在 3~20 字符之间")
	}
	for _, r := range username {
		isAlpha := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
		isDigit := r >= '0' && r <= '9'
		isUnderscore := r == '_'
		if !(isAlpha || isDigit || isUnderscore) {
			return errors.New("用户名只允许字母、数字和下划线")
		}
	}
	if len(password) < 8 {
		return errors.New("密码长度必须 ≥ 8")
	}
	return nil
}

// InitializeSystemWithCredentials 使用调用方提供的用户名/密码初始化系统。
// 用于 Setup 向导一条龙流程。失败时调用方负责回滚 db/config.json。
// 与 InitializeSystem 区别: 不打日志输出明文密码,因为 Web 端已确认。
func (s *Service) InitializeSystemWithCredentials(username, password string) error {
	if s.IsSystemInitialized() {
		return errors.New("system is already initialized")
	}
	if err := validateAdminCredentials(username, password); err != nil {
		return err
	}
	passwordHash, err := s.HashPassword(password)
	if err != nil {
		return err
	}
	return s.setAdminConfigs(username, passwordHash)
}

// InitializeSystem 初始化系统
func (s *Service) InitializeSystem() (string, string, error) {
	if s.IsSystemInitialized() {
		return "", "", errors.New("system is already initialized")
	}

	username := DefaultAdminUsername
	password := DefaultAdminPassword

	// Demo 模式使用特定密码
	if s.demoMode {
		password = DemoModeAdminPassword
	}

	passwordHash, err := s.HashPassword(password)
	if err != nil {
		return "", "", err
	}

	// 保存系统配置
	if err := s.setAdminConfigs(username, passwordHash); err != nil {
		return "", "", err
	}

	// 日志输出
	// 重要: 输出初始密码
	fmt.Println("================================")
	if s.demoMode {
		fmt.Println("🎭 NodePass 演示模式初始化完成！")
	} else {
		fmt.Println("🚀 NodePass 系统初始化完成！")
	}
	fmt.Println("================================")
	fmt.Println("管理员账户信息：")
	fmt.Println("用户名:", username)
	fmt.Println("密码:", password)
	if s.demoMode {
		fmt.Println("================================")
		fmt.Println("⚠️  演示模式已启用！")
		fmt.Println("密码将每天自动重置为:", DemoModeAdminPassword)
	}
	fmt.Println("================================")
	fmt.Println("⚠️  请妥善保存这些信息！")
	fmt.Println("================================")

	return username, password, nil
}

// GetSession 根据 SessionID 获取会话信息
func (s *Service) GetSession(sessionID string) (*Session, bool) {
	if value, ok := sessionCache.Load(sessionID); ok {
		session := value.(Session)
		return &session, true
	}

	// 查询数据库
	var userSession models.UserSession
	err := s.db.Where("session_id = ?", sessionID).First(&userSession).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false
		}
		return nil, false
	}

	if !userSession.IsActive || time.Now().After(userSession.ExpiresAt) {
		return nil, false
	}

	session := Session{
		SessionID: userSession.SessionID,
		Username:  userSession.Username,
		ExpiresAt: userSession.ExpiresAt,
		IsActive:  userSession.IsActive,
	}
	// 更新缓存
	sessionCache.Store(sessionID, session)

	return &session, true
}

// generateRandomPassword 生成随机密码，演示环境返回固定密码
func generateRandomPassword(length int) string {
	if os.Getenv("DEMO_STATUS") == "true" {
		return "np123456"
	}

	charset := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
	result := make([]byte, length)
	for i := range result {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		result[i] = charset[num.Int64()]
	}
	return string(result)
}

// ChangePassword 修改用户密码
func (s *Service) ChangePassword(username, currentPassword, newPassword string) (bool, string) {
	// 验证当前密码
	if !s.AuthenticateUser(username, currentPassword) {
		return false, "current password is incorrect"
	}

	// 验证新密码不能与默认密码相同
	if newPassword == DefaultAdminPassword {
		return false, "new password cannot be the same as default password, please set a secure password"
	}

	// 加密新密码
	hash, err := s.HashPassword(newPassword)
	if err != nil {
		return false, "password encryption failed"
	}

	// 更新系统配置
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash); err != nil {
		return false, "password update failed"
	}

	// 使所有现有 Session 失效
	s.invalidateAllSessions()
	return true, "password changed successfully"
}

// ChangeUsername 修改用户名
func (s *Service) ChangeUsername(currentUsername, newUsername string) (bool, string) {
	storedUsername, _ := s.GetSystemConfig(ConfigKeyAdminUsername)
	if currentUsername != storedUsername {
		return false, "current username is incorrect"
	}

	// 允许设置任何用户名，包括默认用户名

	// 更新系统配置中的用户名
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, newUsername); err != nil {
		return false, "username update failed"
	}

	// 更新数据库中的会话记录
	s.db.Model(&models.UserSession{}).Where("username = ?", currentUsername).Update("username", newUsername)

	// 更新缓存中的会话
	sessionCache.Range(func(key, value interface{}) bool {
		sess := value.(Session)
		if sess.Username == currentUsername {
			sess.Username = newUsername
			sessionCache.Store(key, sess)
		}
		return true
	})

	// 使所有现有 Session 失效
	s.invalidateAllSessions()
	return true, "username changed successfully"
}

// UpdateSecurity 同时修改用户名和密码
func (s *Service) UpdateSecurity(currentUsername, currentPassword, newUsername, newPassword string) (bool, string) {
	// 验证当前用户身份
	if !s.AuthenticateUser(currentUsername, currentPassword) {
		return false, "current password is incorrect"
	}

	// 验证新密码不能与默认密码相同
	if newPassword == DefaultAdminPassword {
		return false, "new password cannot be the same as default password, please set a secure password"
	}

	// 允许设置任何用户名，包括默认用户名

	// 加密新密码
	hash, err := s.HashPassword(newPassword)
	if err != nil {
		return false, "password encryption failed"
	}

	// 更新用户名
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, newUsername); err != nil {
		return false, "username update failed"
	}

	// 更新密码
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash); err != nil {
		// 如果密码更新失败，回滚用户名
		s.SetSystemConfig(ConfigKeyAdminUsername, currentUsername)
		return false, "password update failed"
	}

	// 更新数据库中的会话记录
	s.db.Model(&models.UserSession{}).Where("username = ?", currentUsername).Update("username", newUsername)

	// 更新缓存中的会话
	sessionCache.Range(func(key, value interface{}) bool {
		sess := value.(Session)
		if sess.Username == currentUsername {
			sess.Username = newUsername
			sessionCache.Store(key, sess)
		}
		return true
	})

	// 使所有现有 Session 失效
	s.invalidateAllSessions()
	return true, "account information updated successfully"
}

// ResetAdminPassword 重置管理员密码并返回新密码
func (s *Service) ResetAdminPassword() (string, string, error) {
	// 确认系统已初始化
	initialized := s.IsSystemInitialized()
	if !initialized {
		return "", "", errors.New("system is not initialized, cannot reset password")
	}

	// 读取当前用户名
	username, err := s.GetSystemConfig(ConfigKeyAdminUsername)
	if err != nil || username == "" {
		username = "nodepass"
	}

	// 生成新密码
	newPassword := generateRandomPassword(12)
	hash, err := s.HashPassword(newPassword)
	if err != nil {
		return "", "", err
	}

	// 更新配置
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash); err != nil {
		return "", "", err
	}

	// 使所有现有 Session 失效
	s.invalidateAllSessions()

	// 输出提示
	fmt.Println("================================")
	fmt.Println("🔐 NodePass 管理员密码已重置！")
	fmt.Println("================================")
	fmt.Println("用户名:", username)
	fmt.Println("新密码:", newPassword)
	fmt.Println("================================")
	fmt.Println("⚠️  请尽快登录并修改此密码！")
	fmt.Println("================================")

	return username, newPassword, nil
}

// invalidateAllSessions 使所有会话失效（数据库 + 缓存）
func (s *Service) invalidateAllSessions() {
	// 更新数据库会话状态
	s.db.Model(&models.UserSession{}).Update("is_active", false)
	// 清空缓存
	sessionCache.Range(func(key, value interface{}) bool {
		sessionCache.Delete(key)
		return true
	})
}

// SaveOAuthUser 保存或更新 OAuth 用户信息
// provider: github / cloudflare 等
// providerID: 第三方平台返回的用户唯一 ID
// username: 映射到本系统的用户名（可带前缀）
// dataJSON: 原始用户信息 JSON 字符串
func (s *Service) SaveOAuthUser(provider, providerID, username, dataJSON string) error {
	// 创建表（若不存在）
	// GORM handles table creation automatically if models are defined

	// 检查是否已存在 OAuth 用户（只允许第一个用户登录）
	var existingCount int64
	err := s.db.Model(&models.OAuthUser{}).Count(&existingCount).Error
	if err != nil {
		return err
	}

	// 如果已有用户，检查是否是同一个用户
	if existingCount > 0 {
		var existingUser models.OAuthUser
		err := s.db.Where("provider = ?", provider).First(&existingUser).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// 当前 provider 没有用户，但其他 provider 有用户，不允许登录
				return errors.New("system has been bound to other OAuth2 users, different OAuth2 accounts are not allowed to login")
			}
			return err
		}

		// 如果是不同的用户ID，拒绝登录
		if existingUser.ProviderID != providerID {
			return errors.New("system has been bound to other OAuth2 users, different accounts are not allowed to login")
		}
	}

	// 插入或更新（只有同一用户才能更新）
	oauthUser := models.OAuthUser{
		Provider:   provider,
		ProviderID: providerID,
		Username:   username,
		Data:       dataJSON,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	err = s.db.Where("provider = ? AND provider_id = ?", provider, providerID).FirstOrCreate(&oauthUser).Error
	if err != nil {
		return err
	}

	return nil
}

// DeleteAllOAuthUsers 删除所有 OAuth 用户信息（解绑时使用）
func (s *Service) DeleteAllOAuthUsers() error {
	err := s.db.Where("1 = 1").Delete(&models.OAuthUser{}).Error
	if err != nil {
		return err
	}
	return nil
}

// GenerateOAuthState 生成并缓存 state 值（10 分钟有效）
func (s *Service) GenerateOAuthState() string {
	state := uuid.NewString()
	oauthStateCache.Store(state, time.Now().Unix())
	return state
}

// ValidateOAuthState 校验 state 并清除，返回是否有效
func (s *Service) ValidateOAuthState(state string) bool {
	if v, ok := oauthStateCache.Load(state); ok {
		ts := v.(int64)
		if time.Now().Unix()-ts < 600 { // 10 分钟
			oauthStateCache.Delete(state)
			return true
		}
		oauthStateCache.Delete(state)
	}
	return false
}

// SetCurrentJTI 设置当前有效的 JWT ID（内存存储）
func (s *Service) SetCurrentJTI(jti string) {
	s.jtiMutex.Lock()
	defer s.jtiMutex.Unlock()
	s.currentJTI = jti
}

// GetCurrentJTI 获取当前有效的 JWT ID（内存存储）
func (s *Service) GetCurrentJTI() (string, error) {
	s.jtiMutex.RLock()
	defer s.jtiMutex.RUnlock()
	if s.currentJTI == "" {
		return "", errors.New("no valid token")
	}
	return s.currentJTI, nil
}

// ClearCurrentJTI 清除当前有效的 JWT ID（登出时使用）
func (s *Service) ClearCurrentJTI() {
	s.jtiMutex.Lock()
	defer s.jtiMutex.Unlock()
	s.currentJTI = ""
}

// ResetDemoPassword 重置 Demo 模式密码为默认值
func (s *Service) ResetDemoPassword() error {
	if !s.demoMode {
		return errors.New("not in demo mode")
	}

	// 生成密码哈希
	passwordHash, err := s.HashPassword(DemoModeAdminPassword)
	if err != nil {
		return fmt.Errorf("hash password failed: %v", err)
	}

	// 更新密码
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, passwordHash); err != nil {
		return fmt.Errorf("update password failed: %v", err)
	}

	fmt.Println("================================")
	fmt.Println("🎭 Demo 模式密码已重置")
	fmt.Println("================================")
	fmt.Println("用户名:", DefaultAdminUsername)
	fmt.Println("密码:", DemoModeAdminPassword)
	fmt.Println("================================")

	return nil
}

// StartDemoModeScheduler 启动 Demo 模式定时任务（每天凌晨重置密码）
func (s *Service) StartDemoModeScheduler() {
	if !s.demoMode {
		return
	}

	fmt.Println("🎭 Demo 模式定时任务已启动，将在每天凌晨 00:00 重置密码")

	go func() {
		for {
			// 计算到下一个凌晨 00:00 的时间
			now := time.Now()
			nextMidnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
			duration := nextMidnight.Sub(now)

			// 等待到凌晨
			time.Sleep(duration)

			// 重置密码
			if err := s.ResetDemoPassword(); err != nil {
				fmt.Printf("❌ Demo 模式密码重置失败: %v\n", err)
			}
		}
	}()
}
