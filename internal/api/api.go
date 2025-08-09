package api

import (
	"log"

	"NodePassDash/internal/db"

	"github.com/gorilla/mux"
)

// SetupRoutes 向父级路由器注册所有 API 路由
// 由于 internal/server/server.go 仅传递父级 *mux.Router，我们在此函数内部
// 获取GORM数据库连接并创建具体的 API Router，然后将其挂载到父路由上。
func SetupRoutes(parent *mux.Router) {
	// 获取GORM数据库连接
	gormDB := db.GetDB()
	if gormDB == nil {
		log.Printf("初始化数据库失败: 数据库连接为空")
		return
	}

	// 创建 API Router 并挂载到父级路由器（此处不共享 SSE 实例，传入 nil 即由内部创建）
	apiRouter := NewRouter(gormDB, nil, nil)
	parent.PathPrefix("/").Handler(apiRouter)
}
