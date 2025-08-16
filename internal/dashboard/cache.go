package dashboard

import (
	"fmt"
	"time"
)

// CacheProvider 缓存提供者接口
type CacheProvider interface {
	Get(key string) ([]byte, error)
	Set(key string, value []byte, ttl time.Duration) error
	Del(key string) error
	Exists(key string) bool
}

// MemoryCache 内存缓存实现
type MemoryCache struct {
	cache map[string]*CacheItem
}

type CacheItem struct {
	Value     []byte
	ExpiresAt time.Time
}

// NewMemoryCache 创建内存缓存
func NewMemoryCache() *MemoryCache {
	cache := &MemoryCache{
		cache: make(map[string]*CacheItem),
	}

	// 启动清理协程
	go cache.cleanup()

	return cache
}

// Get 获取缓存
func (c *MemoryCache) Get(key string) ([]byte, error) {
	item, exists := c.cache[key]
	if !exists {
		return nil, fmt.Errorf("cache miss")
	}

	if time.Now().After(item.ExpiresAt) {
		delete(c.cache, key)
		return nil, fmt.Errorf("cache expired")
	}

	return item.Value, nil
}

// Set 设置缓存
func (c *MemoryCache) Set(key string, value []byte, ttl time.Duration) error {
	c.cache[key] = &CacheItem{
		Value:     value,
		ExpiresAt: time.Now().Add(ttl),
	}
	return nil
}

// Del 删除缓存
func (c *MemoryCache) Del(key string) error {
	delete(c.cache, key)
	return nil
}

// Exists 检查缓存是否存在
func (c *MemoryCache) Exists(key string) bool {
	item, exists := c.cache[key]
	if !exists {
		return false
	}

	if time.Now().After(item.ExpiresAt) {
		delete(c.cache, key)
		return false
	}

	return true
}

// cleanup 清理过期的缓存项
func (c *MemoryCache) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		for key, item := range c.cache {
			if now.After(item.ExpiresAt) {
				delete(c.cache, key)
			}
		}
	}
}

// 简化版本：移除复杂的缓存服务，TrafficService内部已经包含了简单的内存缓存
