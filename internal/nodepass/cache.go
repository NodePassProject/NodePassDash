package nodepass

import (
	"NodePassDash/internal/models"
	"fmt"
	"gorm.io/gorm"
	"sync"
)

// Cache 端点缓存结构
type Cache struct {
	mu    sync.RWMutex
	items map[string]*CacheItem
}

// CacheItem 缓存项
type CacheItem struct {
	BaseURL string
	APIKey  string
	Exists  bool
}

// 全局缓存实例
var globalCache *Cache
var cacheOnce sync.Once

// InitializeCache 初始化端点缓存
func InitializeCache(db *gorm.DB) error {
	cacheOnce.Do(func() {
		globalCache = &Cache{
			items: make(map[string]*CacheItem),
		}
	})

	// 从数据库加载所有端点
	var endpoints []models.Endpoint
	if err := db.Find(&endpoints).Error; err != nil {
		return err
	}

	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	// 清空现有缓存
	globalCache.items = make(map[string]*CacheItem)

	// 加载端点到缓存
	for _, endpoint := range endpoints {
		globalCache.items[fmt.Sprintf("%d", endpoint.ID)] = &CacheItem{
			BaseURL: endpoint.URL + endpoint.APIPath,
			APIKey:  endpoint.APIKey,
			Exists:  true,
		}
	}

	return nil
}

// GetCache 获取全局缓存实例
func GetCache() *Cache {
	if globalCache == nil {
		cacheOnce.Do(func() {
			globalCache = &Cache{
				items: make(map[string]*CacheItem),
			}
		})
	}
	return globalCache
}

// Get 获取缓存项
func (c *Cache) Get(endpointID string) (baseURL, apiKey string, exists bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if item, ok := c.items[endpointID]; ok && item.Exists {
		return item.BaseURL, item.APIKey, true
	}
	return "", "", false
}

// Set 设置缓存项
func (c *Cache) Set(endpointID, baseURL, apiKey string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items[endpointID] = &CacheItem{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Exists:  true,
	}
}

// Update 更新缓存项
func (c *Cache) Update(endpointID, baseURL, apiKey string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.items[endpointID]; exists {
		c.items[endpointID] = &CacheItem{
			BaseURL: baseURL,
			APIKey:  apiKey,
			Exists:  true,
		}
	}
}

// Delete 删除缓存项
func (c *Cache) Delete(endpointID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.items, endpointID)
}

// Count 返回缓存中的项目数量
func (c *Cache) Count() int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return len(c.items)
}

// Clear 清空缓存
func (c *Cache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.items = make(map[string]*CacheItem)
}
