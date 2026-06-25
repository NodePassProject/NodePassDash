package compliance

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Handler 是 GET /api/setup/compliance 的统一 gin 处理器。
// Setup 模式与 Ready 模式共用,前端按 ?lang= 选择语言(默认 zh-CN)。
func Handler(c *gin.Context) {
	lang := c.Query("lang")
	if lang == "" {
		lang = LangZhCN
	}
	doc := Get(lang)
	c.JSON(http.StatusOK, gin.H{
		"lang":       doc.Lang,
		"version":    doc.Version,
		"content":    doc.Content,
		"source_url": doc.SourceURL,
	})
}
