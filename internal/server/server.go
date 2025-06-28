package server

import (
	"net/http"
	"strings"

	"NodePassDash/internal/api"

	"github.com/gorilla/mux"
)

type Server struct {
	router *mux.Router
}

func NewServer() *Server {
	return &Server{
		router: mux.NewRouter(),
	}
}

func (s *Server) Start() error {
	// API 路由
	api.SetupRoutes(s.router)

	// 静态文件服务
	fs := http.FileServer(http.Dir("dist"))
	s.router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 如果是API请求，跳过
		if strings.HasPrefix(r.URL.Path, "/api/") {
			return
		}

		// 检查文件是否存在
		if _, err := http.Dir("dist").Open(r.URL.Path); err != nil {
			// 如果文件不存在，返回index.html
			http.ServeFile(w, r, "dist/index.html")
			return
		}

		// 提供静态文件
		fs.ServeHTTP(w, r)
	})

	return http.ListenAndServe(":3000", s.router)
}
