package enhanced

import (
	"NodePassDash/internal/api"
	"NodePassDash/internal/endpoint"
	log "NodePassDash/internal/log"
	"NodePassDash/internal/sse"

	"gorm.io/gorm"
)

// ServiceIntegrator 服务集成器，负责集成所有增强功能
type ServiceIntegrator struct {
	db              *gorm.DB
	sseService      *sse.Service
	memoryAPI       *api.MemoryAPIHandler
	endpointService *endpoint.Service
}

// NewServiceIntegrator 创建服务集成器
func NewServiceIntegrator(db *gorm.DB, endpointService *endpoint.Service) *ServiceIntegrator {
	return &ServiceIntegrator{
		db:              db,
		endpointService: endpointService,
	}
}

// Initialize 初始化所有增强服务
func (si *ServiceIntegrator) Initialize() error {
	log.Info("开始初始化增强服务集成")

	// 1. 创建 SSE 服务（已集成增强功能）
	si.sseService = sse.NewService(si.db, si.endpointService)
	log.Info("SSE 服务已创建")

	// 2. 初始化 SSE 服务（从数据库加载数据到内存）
	if err := si.sseService.Initialize(); err != nil {
		return err
	}
	log.Info("SSE 服务已初始化，数据已加载到内存")

	// 3. 创建内存 API 处理器
	si.memoryAPI = api.NewMemoryAPIHandler(si.sseService)
	log.Info("内存 API 处理器已创建")

	log.Info("增强服务集成初始化完成")
	return nil
}

// GetSSEService 获取 SSE 服务
func (si *ServiceIntegrator) GetSSEService() *sse.Service {
	return si.sseService
}

// GetMemoryAPI 获取内存 API 处理器
func (si *ServiceIntegrator) GetMemoryAPI() *api.MemoryAPIHandler {
	return si.memoryAPI
}

// Close 关闭所有服务
func (si *ServiceIntegrator) Close() {
	log.Info("正在关闭增强服务集成")

	if si.sseService != nil {
		si.sseService.Close()
	}

	log.Info("增强服务集成已关闭")
}

// GetSystemStats 获取系统统计信息
func (si *ServiceIntegrator) GetSystemStats() map[string]interface{} {
	stats := make(map[string]interface{})

	// SSE 服务统计
	if si.sseService != nil {
		stats["sse_service"] = si.sseService.GetStats()
		stats["queue_stats"] = si.sseService.GetQueueStats()
		stats["performance_stats"] = si.sseService.GetPerformanceStats()
	}

	// 内存 API 统计
	if si.memoryAPI != nil {
		stats["memory_api"] = map[string]interface{}{
			"status": "active",
		}
	}

	return stats
}

// IsEnhancedModeActive 检查增强模式是否激活
func (si *ServiceIntegrator) IsEnhancedModeActive() bool {
	return si.sseService != nil
}
