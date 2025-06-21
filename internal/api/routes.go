package api

import (
	"database/sql"
	"net/http"
	"strings"

	"NodePassDash/internal/auth"
	"NodePassDash/internal/dashboard"
	"NodePassDash/internal/endpoint"
	"NodePassDash/internal/instance"
	"NodePassDash/internal/sse"
	"NodePassDash/internal/tunnel"

	"github.com/gorilla/mux"
)

// Router API 路由器
type Router struct {
	router           *mux.Router
	authHandler      *AuthHandler
	endpointHandler  *EndpointHandler
	instanceHandler  *InstanceHandler
	tunnelHandler    *TunnelHandler
	sseHandler       *SSEHandler
	dashboardHandler *DashboardHandler
	dataHandler      *DataHandler
}

// NewRouter 创建路由器实例
// 如果外部已创建 sseService / sseManager，则传入以复用，避免出现多个实例导致推流失效
func NewRouter(db *sql.DB, sseService *sse.Service, sseManager *sse.Manager) *Router {
	// 创建路由器（忽略末尾斜杠差异）
	router := mux.NewRouter()
	router.StrictSlash(true)

	// 创建（或复用）服务实例
	authService := auth.NewService(db)
	endpointService := endpoint.NewService(db)
	instanceService := instance.NewService(db)
	tunnelService := tunnel.NewService(db)

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
	instanceHandler := NewInstanceHandler(db, instanceService)
	tunnelHandler := NewTunnelHandler(tunnelService)
	sseHandler := NewSSEHandler(sseService)
	dataHandler := NewDataHandler(db, sseManager)
	dashboardHandler := NewDashboardHandler(dashboardService)

	r := &Router{
		router:           router,
		authHandler:      authHandler,
		endpointHandler:  endpointHandler,
		instanceHandler:  instanceHandler,
		tunnelHandler:    tunnelHandler,
		sseHandler:       sseHandler,
		dashboardHandler: dashboardHandler,
		dataHandler:      dataHandler,
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
	r.router.HandleFunc("/api/endpoints/{id}/logs", r.endpointHandler.HandleEndpointLogs).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/logs/search", r.endpointHandler.HandleSearchEndpointLogs).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/recycle", r.endpointHandler.HandleRecycleList).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{id}/recycle/count", r.endpointHandler.HandleRecycleCount).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{endpointId}/recycle/{recycleId}", r.endpointHandler.HandleRecycleDelete).Methods("DELETE")

	// 实例相关路由
	r.router.HandleFunc("/api/endpoints/{endpointId}/instances", r.instanceHandler.HandleGetInstances).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{endpointId}/instances/{instanceId}", r.instanceHandler.HandleGetInstance).Methods("GET")
	r.router.HandleFunc("/api/endpoints/{endpointId}/instances/{instanceId}/control", r.instanceHandler.HandleControlInstance).Methods("POST")

	// SSE 相关路由
	r.router.HandleFunc("/api/sse/global", r.sseHandler.HandleGlobalSSE).Methods("GET")
	r.router.HandleFunc("/api/sse/tunnel/{tunnelId}", r.sseHandler.HandleTunnelSSE).Methods("GET")
	r.router.HandleFunc("/api/sse/test", r.sseHandler.HandleTestSSEEndpoint).Methods("POST")

	// 隧道相关路由
	r.router.HandleFunc("/api/tunnels", r.tunnelHandler.HandleGetTunnels).Methods("GET")
	r.router.HandleFunc("/api/tunnels", r.tunnelHandler.HandleCreateTunnel).Methods("POST")
	r.router.HandleFunc("/api/tunnels/quick", r.tunnelHandler.HandleQuickCreateTunnel).Methods("POST")
	r.router.HandleFunc("/api/tunnels", r.tunnelHandler.HandlePatchTunnels).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandlePatchTunnels).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandleGetTunnels).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandleUpdateTunnel).Methods("PUT")
	r.router.HandleFunc("/api/tunnels/{id}", r.tunnelHandler.HandleDeleteTunnel).Methods("DELETE")
	r.router.HandleFunc("/api/tunnels/{id}/status", r.tunnelHandler.HandleControlTunnel).Methods("PATCH")
	r.router.HandleFunc("/api/tunnels/{id}/details", r.tunnelHandler.HandleGetTunnelDetails).Methods("GET")
	r.router.HandleFunc("/api/tunnels/{id}/logs", r.tunnelHandler.HandleTunnelLogs).Methods("GET")

	// 隧道日志相关路由
	r.router.HandleFunc("/api/dashboard/logs", r.tunnelHandler.HandleGetTunnelLogs).Methods("GET")

	// 健康检查
	r.router.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "ok"}`))
	}).Methods("GET")

	// 仪表盘流量趋势
	r.router.HandleFunc("/api/dashboard/traffic-trend", r.dashboardHandler.HandleTrafficTrend).Methods("GET")

	// 仪表盘统计数据
	r.router.HandleFunc("/api/dashboard/stats", r.dashboardHandler.HandleGetStats).Methods("GET")

	// 数据导入导出
	r.router.HandleFunc("/api/data/export", r.dataHandler.HandleExport).Methods("GET")
	r.router.HandleFunc("/api/data/import", r.dataHandler.HandleImport).Methods("POST")
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
