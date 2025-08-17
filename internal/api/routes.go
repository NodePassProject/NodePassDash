package api

import (
	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/metrics"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tag"
	"NodePassDash/internal/tunnel"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// Router API 路由器
type Router struct {
	router               *mux.Router
	authHandler          *AuthHandler
	endpointHandler      *EndpointHandler
	tunnelHandler        *TunnelHandler
	tunnelMetricsHandler *TunnelMetricsHandler
	tagHandler           *TagHandler
	sseHandler           *SSEHandler
	dashboardHandler     *DashboardHandler
	dataHandler          *DataHandler
	versionHandler       *VersionHandler
	groupHandler         *GroupHandler
}

// NewRouter 创建路由器实例
// 如果外部已创建 sseService / sseManager，则传入以复用，避免出现多个实例导致推流失效
func NewRouter(db *gorm.DB, sseService *sse.Service, sseManager *sse.Manager) *Router {
	// 创建路由器（忽略末尾斜杠差异）
	router := mux.NewRouter()
	router.StrictSlash(true)

	// 创建（或复用）服务实例
	authService := auth.NewService(db)
	endpointService := endpoint.NewService(db)
	tunnelService := tunnel.NewService(db)
	tagService := tag.NewService(db)

	if sseService == nil {
		panic("sseService is nil")
	}
	if sseManager == nil {
		panic("sseManager is nil")
	}
	dashboardService := dashboard.NewService(db)

	// 创建处理器实例
	authHandler := NewAuthHandler(authService)
	endpointHandler := NewEndpointHandler(endpointService, sseManager)
	tunnelHandler := NewTunnelHandler(tunnelService, sseManager)

	// 创建 Metrics 系统相关的处理器 (简化版，不依赖完整的增强系统)
	metricsAggregator := metrics.NewMetricsAggregator(db)
	sseProcessor := metrics.NewSSEProcessor(metricsAggregator)
	tunnelMetricsHandler := NewTunnelMetricsHandler(tunnelService, sseProcessor)

	tagHandler := NewTagHandler(tagService)
	sseHandler := NewSSEHandler(sseService, sseManager)
	dataHandler := NewDataHandler(db, sseManager, endpointService, tunnelService)
	dashboardHandler := NewDashboardHandler(dashboardService)
	versionHandler := NewVersionHandler()
	groupHandler := NewGroupHandler(db)

	r := &Router{
		router:               router,
		authHandler:          authHandler,
		endpointHandler:      endpointHandler,
		tunnelHandler:        tunnelHandler,
		tunnelMetricsHandler: tunnelMetricsHandler,
		tagHandler:           tagHandler,
		sseHandler:           sseHandler,
		dashboardHandler:     dashboardHandler,
		dataHandler:          dataHandler,
		versionHandler:       versionHandler,
		groupHandler:         groupHandler,
	}

	// 注册路由
	r.registerRoutes()

	// 为所有路由添加 CORS 处理
	r.router.Use(corsMiddleware)

	return r
}

// ServeHTTP 实现 http.Handler 接口
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.router.ServeHTTP(w, req)
}

// registerRoutes 注册所有 API 路由
func (r *Router) registerRoutes() {
	// 认证相关路由
	r.router.HandleFunc("/api/auth/login", r.authHandler.HandleLogin).Methods("POST")
	r.router.HandleFunc("/api/auth/logout", r.authHandler.HandleLogout).Methods("POST")
	r.router.HandleFunc("/api/auth/validate", r.authHandler.HandleValidateSession).Methods("GET")
	r.router.HandleFunc("/api/auth/me", r.authHandler.HandleGetMe).Methods("GET")
	r.router.HandleFunc("/api/auth/init", r.authHandler.HandleInitSystem).Methods("POST")
	r.router.HandleFunc("/api/auth/change-password", r.authHandler.HandleChangePassword).Methods("POST")
	r.router.HandleFunc("/api/auth/change-username", r.authHandler.HandleChangeUsername).Methods("POST")
	r.router.HandleFunc("/api/auth/oauth2", r.authHandler.HandleOAuth2Provider).Methods("GET")

	// OAuth2 回调
	r.router.HandleFunc("/api/oauth2/callback", r.authHandler.HandleOAuth2Callback).Methods("GET")
	r.router.HandleFunc("/api/oauth2/login", r.authHandler.HandleOAuth2Login).Methods("GET")
	// OAuth2 配置读写
	r.router.HandleFunc("/api/oauth2/config", r.authHandler.HandleOAuth2Config).Methods("GET", "POST", "DELETE")

	// 端点相关路由
	r.router.HandleFunc("/api/endpoints", r.endpointHandler.HandleGetEndpoints).Methods("GET")
	r.router.HandleFunc("/api/endpoints", r.endpointHandler.HandleCreateEndpoint).Methods("POST")
	r.router.HandleFunc("/api/endpoints/{id}", r.endpointHandler.HandleUpdateEndpoint).Methods("PUT")
	r.router.HandleFunc("/api/endpoints/{id}", r.endpointHandler.HandleDeleteEndpoint).Methods("DELETE")
	r.router.HandleFunc("/api/endpoints/{id}", r.endpointHandler.HandlePatchEndpoint).Methods("PATCH")
	r.router.HandleFunc("/api/endpoints", r.endpointHandler.HandlePatchEndpoint).Methods("PATCH")
	r.router.HandleFunc("/api/endpoints/simple", r.endpointHandler.HandleGetSimpleEndpoints).Methods("GET")
	r.router.HandleFunc("/api/endpoints/test", r.endpointHandler.HandleTestEndpoint).Methods("POST")
	r.router.HandleFunc("/api/endpoints/status", r.endpointHandler.HandleEndpointStatus).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/detail", r.endpointHandler.HandleGetEndpointDetail).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/info", r.endpointHandler.HandleGetEndpointInfo).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/file-logs", r.endpointHandler.HandleEndpointFileLogs).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/file-logs/clear", r.endpointHandler.HandleClearEndpointFileLogs).Methods("DELETE")
	r.router.HandleFunc("/api/endpoints/{id}/stats", r.endpointHandler.HandleEndpointStats).Methods("GET")

	// 全局回收站
	r.router.HandleFunc("/api/recycle", r.endpointHandler.HandleRecycleListAll).Methods("GET")
	r.router.HandleFunc("/api/recycle", r.endpointHandler.HandleRecycleClearAll).Methods("DELETE")

	// 实例相关路由
	r.router.HandleFunc("/api/endpoints/{endpointId}/instances", r.tunnelHandler.HandleGetInstances).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{endpointId}/instances/{instanceId}", r.tunnelHandler.HandleGetInstance).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{endpointId}/instances/{instanceId}/control", r.tunnelHandler.HandleControlInstance).Methods("POST")

	// SSE 相关路由
	r.router.HandleFunc("/api/sse/tunnel/{tunnelId}", r.sseHandler.HandleTunnelSSE).Methods("GET")     // 实例详情页用
	r.router.HandleFunc("/api/sse/nodepass-proxy", r.sseHandler.HandleNodePassSSEProxy).Methods("GET") // 主控详情页代理用
	r.router.HandleFunc("/api/sse/test", r.sseHandler.HandleTestSSEEndpoint).Methods("POST")           // 添加主控的时候 测试sse是否通用

	// 日志清理相关路由
	r.router.HandleFunc("/api/sse/log-cleanup/stats", r.sseHandler.HandleLogCleanupStats).Methods("GET")
	r.router.HandleFunc("/api/sse/log-cleanup/config", r.sseHandler.HandleLogCleanupConfig).Methods("GET", "POST")
	r.router.HandleFunc("/api/sse/log-cleanup/trigger", r.sseHandler.HandleTriggerLogCleanup).Methods("POST")

	// EndpointSSE统计和管理

	// 标签相关路由
	r.router.HandleFunc("/api/tags", r.tagHandler.GetTags).Methods("GET")
	r.router.HandleFunc("/api/tags", r.tagHandler.CreateTag).Methods("POST")
	r.router.HandleFunc("/api/tags/{id}", r.tagHandler.UpdateTag).Methods("PUT")
	r.router.HandleFunc("/api/tags/{id}", r.tagHandler.DeleteTag).Methods("DELETE")
	r.router.HandleFunc("/api/tunnels/{tunnelId}/tag", r.tagHandler.GetTunnelTag).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{tunnelId}/tag", r.tagHandler.AssignTagToTunnel).Methods("POST")

	// 隧道相关路由
	r.router.HandleFunc("/api/tunnels", r.tunnelHandler.HandleGetTunnels).Methods("GET")
	r.router.HandleFunc("/api/tunnels", r.tunnelHandler.HandleCreateTunnel).Methods("POST")
	r.router.HandleFunc("/api/tunnels/batch", r.tunnelHandler.HandleBatchCreateTunnels).Methods("POST")
	r.router.HandleFunc("/api/tunnels/batch-new", r.tunnelHandler.HandleNewBatchCreateTunnels).Methods("POST")
	r.router.HandleFunc("/api/tunnels/batch", r.tunnelHandler.HandleBatchDeleteTunnels).Methods("DELETE")
	r.router.HandleFunc("/api/tunnels/batch/action", r.tunnelHandler.HandleBatchActionTunnels).Methods("POST")
	r.router.HandleFunc("/api/tunnels/quick", r.tunnelHandler.HandleQuickCreateTunnel).Methods("POST")
	r.router.HandleFunc("/api/tunnels/quick-batch", r.tunnelHandler.HandleQuickBatchCreateTunnel).Methods("POST")
	r.router.HandleFunc("/api/tunnels/template", r.tunnelHandler.HandleTemplateCreate).Methods("POST")
	r.router.HandleFunc("/api/tunnels", r.tunnelHandler.HandlePatchTunnels).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandlePatchTunnels).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}/attributes", r.tunnelHandler.HandlePatchTunnelAttributes).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}/restart", r.tunnelHandler.HandleSetTunnelRestart).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandleGetTunnels).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandleUpdateTunnelV2).Methods("PUT")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandleDeleteTunnel).Methods("DELETE")
	r.router.HandleFunc("/api/tunnels/{id}/status", r.tunnelHandler.HandleControlTunnel).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}/action", r.tunnelHandler.HandleControlTunnel).Methods("POST")
	r.router.HandleFunc("/api/tunnels/{id}/details", r.tunnelHandler.HandleGetTunnelDetails).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}/logs", r.tunnelHandler.HandleTunnelLogs).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}/traffic-trend", r.tunnelHandler.HandleGetTunnelTrafficTrend).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}/ping-trend", r.tunnelHandler.HandleGetTunnelPingTrend).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}/pool-trend", r.tunnelHandler.HandleGetTunnelPoolTrend).Methods("GET")

	// 新的统一 metrics 趋势接口 - 基于 ServiceHistory 表，使用 instanceId
	r.router.HandleFunc("/api/tunnels/{instanceId}/metrics-trend", r.tunnelMetricsHandler.HandleGetTunnelMetricsTrend).Methods("GET")

	r.router.HandleFunc("/api/tunnels/{id}/export-logs", r.tunnelHandler.HandleExportTunnelLogs).Methods("GET")

	// 隧道日志相关路由
	r.router.HandleFunc("/api/dashboard/logs", r.tunnelHandler.HandleGetTunnelLogs).Methods("GET")
	r.router.HandleFunc("/api/dashboard/logs", r.tunnelHandler.HandleClearTunnelLogs).Methods("DELETE")

	// 健康检查
	r.router.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "ok"}`))
	}).Methods("GET")

	// 仪表盘流量趋势
	r.router.HandleFunc("/api/dashboard/traffic-trend", r.dashboardHandler.HandleTrafficTrend).Methods("GET")

	// 仪表盘统计数据
	r.router.HandleFunc("/api/dashboard/stats", r.dashboardHandler.HandleGetStats).Methods("GET")
	r.router.HandleFunc("/api/dashboard/tunnel-stats", r.dashboardHandler.HandleGetTunnelStats).Methods("GET")
	r.router.HandleFunc("/api/dashboard/overall-stats", r.dashboardHandler.HandleGetOverallStats).Methods("GET")

	// 数据导入导出
	r.router.HandleFunc("/api/data/export", r.dataHandler.HandleExport).Methods("GET")
	r.router.HandleFunc("/api/data/import", r.dataHandler.HandleImport).Methods("POST")

	// 版本相关路由
	r.router.HandleFunc("/api/version/current", r.versionHandler.HandleGetCurrentVersion).Methods("GET")
	r.router.HandleFunc("/api/version/check-update", r.versionHandler.HandleCheckUpdate).Methods("GET")
	r.router.HandleFunc("/api/version/update-info", r.versionHandler.HandleGetUpdateInfo).Methods("GET")

	// 分组相关路由
	r.router.HandleFunc("/api/groups", r.groupHandler.HandleGetGroups).Methods("GET")
	r.router.HandleFunc("/api/groups", r.groupHandler.HandleCreateGroup).Methods("POST")
	r.router.HandleFunc("/api/groups/{id}", r.groupHandler.HandleUpdateGroup).Methods("PUT")
	r.router.HandleFunc("/api/groups/{id}", r.groupHandler.HandleDeleteGroup).Methods("DELETE")
	r.router.HandleFunc("/api/groups/from-template", r.groupHandler.HandleCreateGroupFromTemplate).Methods("POST")
	r.router.HandleFunc("/api/version/history", r.versionHandler.HandleGetReleaseHistory).Methods("GET")
	r.router.HandleFunc("/api/version/deployment-info", r.versionHandler.HandleGetDeploymentInfo).Methods("GET")
	r.router.HandleFunc("/api/version/auto-update", r.versionHandler.HandleAutoUpdate).Methods("POST")
}

// corsMiddleware 允许跨域请求（开发阶段 8080 → 3000）
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// 如果带 Origin 头，则回显；否则允许所有
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}

		w.Header().Set("Access-Control-Allow-Credentials", "true")
		// 回显浏览器预检要求的 Headers，如果没有则给常用默认值
		reqHeaders := r.Header.Get("Access-Control-Request-Headers")
		if reqHeaders == "" {
			reqHeaders = "Content-Type, Authorization"
		}
		w.Header().Set("Access-Control-Allow-Headers", reqHeaders)

		// 同理回显预检方法，或允许常见方法
		reqMethod := r.Header.Get("Access-Control-Request-Method")
		if reqMethod == "" {
			reqMethod = "GET, POST, PUT, PATCH, DELETE"
		}
		w.Header().Set("Access-Control-Allow-Methods", reqMethod)

		// 预检结果缓存 12 小时，减少重复 OPTIONS
		w.Header().Set("Access-Control-Max-Age", "43200")

		// 预检请求直接返回
		if strings.ToUpper(r.Method) == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// 以下是各个处理函数的实现
func handleLogin(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现登录逻辑
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现登出逻辑
}

func handleGetMe(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现获取当前用户信息逻辑
}

func handleChangePassword(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现修改密码逻辑
}

func handleChangeUsername(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现修改用户名逻辑
}

func handleListTunnels(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现隧道列表逻辑
}

func handleCreateTunnel(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现创建隧道逻辑
}

func handleGetTunnel(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现获取隧道详情逻辑
}

func handleUpdateTunnel(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现更新隧道逻辑
}

func handleDeleteTunnel(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现删除隧道逻辑
}

func handleGetTunnelStatus(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现获取隧道状态逻辑
}

func handleGetTunnelLogs(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现获取隧道日志逻辑
}

func handleProxy(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现代理逻辑
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "ok"}`))
}

func handleTrafficTrend(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现流量趋势统计逻辑
}

func handleListUsers(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现用户列表逻辑
}

func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	// TODO: 实现创建用户逻辑
}
