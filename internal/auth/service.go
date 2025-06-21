package auth

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	// 内存中的会话存储
	sessionCache = sync.Map{}
	// 内存中的系统配置存储
	configCache = sync.Map{}
)

// Service 认证服务
type Service struct {
	db *sql.DB
}

// NewService 创建认证服务实例，需要传入数据库连接
func NewService(db *sql.DB) *Service {
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

	// 查询数据库
	var value string
	err := s.db.QueryRow(`SELECT value FROM "SystemConfig" WHERE key = ?`, key).Scan(&value)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", errors.New("配置不存在")
		}
		return "", err
	}

	// 写入缓存
	configCache.Store(key, value)
	return value, nil
}

// SetSystemConfig 设置系统配置（写库并更新缓存）
func (s *Service) SetSystemConfig(key, value, description string) error {
	_, err := s.db.Exec(`
		INSERT INTO "SystemConfig" (key, value, description, createdAt, updatedAt)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description, updatedAt = CURRENT_TIMESTAMP;
	`, key, value, description)
	if err != nil {
		return err
	}

	// 更新缓存
	configCache.Store(key, value)
	return nil
}

// IsSystemInitialized 检查系统是否已初始化
func (s *Service) IsSystemInitialized() bool {
	value, _ := s.GetSystemConfig(ConfigKeyIsInitialized)
	return value == "true"
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

// CreateUserSession 创建用户会话
func (s *Service) CreateUserSession(username string) (string, error) {
	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(24 * time.Hour)

	// 写入数据库
	_, err := s.db.Exec(`
		INSERT INTO "UserSession" (sessionId, username, createdAt, expiresAt, isActive)
		VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1);
	`, sessionID, username, expiresAt)
	if err != nil {
		return "", err
	}

	// 写入缓存
	sessionCache.Store(sessionID, Session{
		SessionID: sessionID,
		Username:  username,
		ExpiresAt: expiresAt,
		IsActive:  true,
	})

	return sessionID, nil
}

// ValidateSession 验证会话
func (s *Service) ValidateSession(sessionID string) bool {
	// 先查缓存
	if value, ok := sessionCache.Load(sessionID); ok {
		session := value.(Session)
		if session.IsActive && time.Now().Before(session.ExpiresAt) {
			return true
		}
		// 缓存过期或失效，删除
		sessionCache.Delete(sessionID)
	}

	// 查询数据库
	var username string
	var expiresAt time.Time
	var isActive bool
	err := s.db.QueryRow(`SELECT username, expiresAt, isActive FROM "UserSession" WHERE sessionId = ?`, sessionID).Scan(&username, &expiresAt, &isActive)
	if err != nil {
		return false
	}

	if !isActive || time.Now().After(expiresAt) {
		// 标记为失效
		s.db.Exec(`UPDATE "UserSession" SET isActive = 0 WHERE sessionId = ?`, sessionID)
		return false
	}

	// 更新缓存
	sessionCache.Store(sessionID, Session{
		SessionID: sessionID,
		Username:  username,
		ExpiresAt: expiresAt,
		IsActive:  isActive,
	})

	return true
}

// DestroySession 销毁会话
func (s *Service) DestroySession(sessionID string) {
	// 更新数据库
	s.db.Exec(`UPDATE "UserSession" SET isActive = 0 WHERE sessionId = ?`, sessionID)
	// 删除缓存
	sessionCache.Delete(sessionID)
}

// CleanupExpiredSessions 清理过期会话
func (s *Service) CleanupExpiredSessions() {
	// 更新数据库
	s.db.Exec(`UPDATE "UserSession" SET isActive = 0 WHERE expiresAt < CURRENT_TIMESTAMP AND isActive = 1`)

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

	username := "nodepass"
	password := generateRandomPassword(12)

	passwordHash, err := s.HashPassword(password)
	if err != nil {
		return "", "", err
	}

	// 保存系统配置
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, username, "管理员用户名"); err != nil {
		return "", "", err
	}
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, passwordHash, "管理员密码哈希"); err != nil {
		return "", "", err
	}
	if err := s.SetSystemConfig(ConfigKeyIsInitialized, "true", "系统是否已初始化"); err != nil {
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
	var username string
	var expiresAt time.Time
	var isActive bool
	err := s.db.QueryRow(`SELECT username, expiresAt, isActive FROM "UserSession" WHERE sessionId = ?`, sessionID).
		Scan(&username, &expiresAt, &isActive)
	if err != nil {
		return nil, false
	}

	if !isActive || time.Now().After(expiresAt) {
		return nil, false
	}

	session := Session{
		SessionID: sessionID,
		Username:  username,
		ExpiresAt: expiresAt,
		IsActive:  isActive,
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

	// 加密新密码
	hash, err := s.HashPassword(newPassword)
	if err != nil {
		return false, "密码加密失败"
	}

	// 更新系统配置
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash, "管理员密码哈希"); err != nil {
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

	// 更新系统配置中的用户名
	if err := s.SetSystemConfig(ConfigKeyAdminUsername, newUsername, "管理员用户名"); err != nil {
		return false, "更新用户名失败"
	}

	// 更新数据库中的会话记录
	_, _ = s.db.Exec(`UPDATE "UserSession" SET username = ? WHERE username = ? AND isActive = 1`, newUsername, currentUsername)

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
	if err := s.SetSystemConfig(ConfigKeyAdminPassword, hash, "管理员密码哈希"); err != nil {
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
	_, _ = s.db.Exec(`UPDATE "UserSession" SET isActive = 0`)
	// 清空缓存
	sessionCache.Range(func(key, value interface{}) bool {
		sessionCache.Delete(key)
		return true
	})
}
