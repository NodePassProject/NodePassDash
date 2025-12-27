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
	// 内存中的系统配置存储
	configCache = sync.Map{}
	// OAuth2 state 缓存，防止 CSRF
	oauthStateCache = sync.Map{} // key:string state, value:int64 timestamp
)

// Service 认证服务
type Service struct {
	db         *gorm.DB
	currentJTI string        // 当前有效的 JWT ID（内存存储，避免启动时SQLite锁）
	jtiMutex   sync.RWMutex  // JTI 读写锁
}

// NewService 创建认证服务实例，需要传入GORM数据库连接
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
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
	if value, ok := configCache.Load(key); ok {
		return value.(string), nil
	}

	// 使用GORM查询数据库
	var config models.SystemConfig
	err := s.db.Where("`key` = ?", key).First(&config).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", errors.New("配置不存在")
		}
		return "", err
	}

	// 写入缓存
	configCache.Store(key, config.Value)
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
	result := s.db.Where("`key` = ?", key).Updates(&config)
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
	configCache.Store(key, value)
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
	err := s.db.Where("`key` = ?", key).Delete(&models.SystemConfig{}).Error
	if err != nil {
		return err
	}

	// 删除缓存
	configCache.Delete(key)
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
			return "", errors.New("会话不存在")
		}
		return "", err
	}

	if !userSession.IsActive || time.Now().After(userSession.ExpiresAt) {
		return "", errors.New("会话已过期")
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

// InitializeSystem 初始化系统
func (s *Service) InitializeSystem() (string, string, error) {
	if s.IsSystemInitialized() {
		return "", "", errors.New("系统已初始化")
	}

	username := DefaultAdminUsername
	password := DefaultAdminPassword

	passwordHash, err := s.HashPassword(password)
	if err != nil {
		return "", "", err
	}

	// 保存系统配置
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, username); err != nil {
		return "", "", err
	}
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, passwordHash); err != nil {
		return "", "", err
	}
	if err := s.SetSystemConfig(ConfigKeyIsInitialized, "true"); err != nil {
		return "", "", err
	}

	// 日志输出
	// 重要: 输出初始密码
	fmt.Println("================================")
	fmt.Println("🚀 NodePass 系统初始化完成！")
	fmt.Println("================================")
	fmt.Println("管理员账户信息：")
	fmt.Println("用户名:", username)
	fmt.Println("密码:", password)
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
		return false, "当前密码不正确"
	}

	// 验证新密码不能与默认密码相同
	if newPassword == DefaultAdminPassword {
		return false, "新密码不能与默认密码相同，请设置一个安全的密码"
	}

	// 加密新密码
	hash, err := s.HashPassword(newPassword)
	if err != nil {
		return false, "密码加密失败"
	}

	// 更新系统配置
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash); err != nil {
		return false, "更新密码失败"
	}

	// 使所有现有 Session 失效
	s.invalidateAllSessions()
	return true, "密码修改成功"
}

// ChangeUsername 修改用户名
func (s *Service) ChangeUsername(currentUsername, newUsername string) (bool, string) {
	storedUsername, _ := s.GetSystemConfig(ConfigKeyAdminUsername)
	if currentUsername != storedUsername {
		return false, "当前用户名不正确"
	}

	// 允许设置任何用户名，包括默认用户名

	// 更新系统配置中的用户名
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, newUsername); err != nil {
		return false, "更新用户名失败"
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
	return true, "用户名修改成功"
}

// UpdateSecurity 同时修改用户名和密码
func (s *Service) UpdateSecurity(currentUsername, currentPassword, newUsername, newPassword string) (bool, string) {
	// 验证当前用户身份
	if !s.AuthenticateUser(currentUsername, currentPassword) {
		return false, "当前密码不正确"
	}

	// 验证新密码不能与默认密码相同
	if newPassword == DefaultAdminPassword {
		return false, "新密码不能与默认密码相同，请设置一个安全的密码"
	}

	// 允许设置任何用户名，包括默认用户名

	// 加密新密码
	hash, err := s.HashPassword(newPassword)
	if err != nil {
		return false, "密码加密失败"
	}

	// 更新用户名
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, newUsername); err != nil {
		return false, "更新用户名失败"
	}

	// 更新密码
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash); err != nil {
		// 如果密码更新失败，回滚用户名
		s.SetSystemConfig(ConfigKeyAdminUsername, currentUsername)
		return false, "更新密码失败"
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
	return true, "账号信息修改成功"
}

// ResetAdminPassword 重置管理员密码并返回新密码
func (s *Service) ResetAdminPassword() (string, string, error) {
	// 确认系统已初始化
	initialized := s.IsSystemInitialized()
	if !initialized {
		return "", "", errors.New("系统未初始化，无法重置密码")
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
				return errors.New("系统已绑定其他 OAuth2 用户，不允许使用不同的 OAuth2 账户登录")
			}
			return err
		}

		// 如果是不同的用户ID，拒绝登录
		if existingUser.ProviderID != providerID {
			return errors.New("系统已绑定其他 OAuth2 用户，不允许使用不同的账户登录")
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
