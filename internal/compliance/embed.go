// Package compliance 嵌入并提供 NodePassDash 部署与运营合规协议文本。
//
// 协议文本随二进制一同发布(go:embed),由 setup 向导 Step 2 与运行时
// 复确认 gate 读取。版本号从 markdown 头部自动解析(每种语言独立),
// 提交初始化时校验前端 accepted_version 必须与当前嵌入版本一致。
package compliance

import (
	_ "embed"
	"errors"
	"regexp"
	"strings"
)

//go:embed COMPLIANCE.zh-CN.md
var docZhCN string

//go:embed COMPLIANCE.en-US.md
var docEnUS string

// Doc 是一份合规协议文档的对外表示。
type Doc struct {
	Lang      string `json:"lang"`
	Version   string `json:"version"`
	Content   string `json:"content"`
	SourceURL string `json:"source_url"`
}

const (
	LangZhCN = "zh-CN"
	LangEnUS = "en-US"

	repoRawBase = "https://github.com/NodePassProject/NodePassDash/blob/main/internal/compliance"
)

// versionLineRe 匹配以下任一头部行:
//   版本：v2026.06.26
//   版本: v2026.06.26
//   Version: v2026.06.26
// 取首次匹配,容忍前后空白。
var versionLineRe = regexp.MustCompile(`(?m)^\s*(?:版本[：:]|Version:)\s*(v[0-9][\w.\-]*)\s*$`)

var docs = func() map[string]Doc {
	m := map[string]Doc{
		LangZhCN: {
			Lang:      LangZhCN,
			Version:   mustParseVersion(LangZhCN, docZhCN),
			Content:   docZhCN,
			SourceURL: repoRawBase + "/COMPLIANCE.zh-CN.md",
		},
		LangEnUS: {
			Lang:      LangEnUS,
			Version:   mustParseVersion(LangEnUS, docEnUS),
			Content:   docEnUS,
			SourceURL: repoRawBase + "/COMPLIANCE.en-US.md",
		},
	}
	// 跨语言版本必须保持一致,否则 setup 校验会按用户选的 lang
	// 给出不同结果,容易制造 bug。
	if m[LangZhCN].Version != m[LangEnUS].Version {
		panic("compliance: zh-CN and en-US version mismatch: " +
			m[LangZhCN].Version + " vs " + m[LangEnUS].Version)
	}
	return m
}()

func mustParseVersion(lang, content string) string {
	matches := versionLineRe.FindStringSubmatch(content)
	if len(matches) < 2 {
		panic("compliance: missing version header in " + lang)
	}
	return strings.TrimSpace(matches[1])
}

// Get 返回指定语言的协议文档。未知 lang 回退到 en-US。
func Get(lang string) Doc {
	if d, ok := docs[lang]; ok {
		return d
	}
	return docs[LangEnUS]
}

// CurrentVersion 返回当前嵌入的协议版本(所有语言一致,由 init 校验)。
func CurrentVersion() string {
	return docs[LangEnUS].Version
}

// IsCurrentVersion 判断给定版本是否等于当前嵌入版本。
// 用于 setup initialize 时校验前端提交的 accepted_version。
func IsCurrentVersion(v string) bool {
	return strings.TrimSpace(v) != "" && strings.TrimSpace(v) == CurrentVersion()
}

// ErrVersionMismatch 在 accepted_version 与当前嵌入版本不一致时由调用方返回。
// 在 setup 与运行时 gate 之间统一错误标识。
var ErrVersionMismatch = errors.New("compliance: accepted_version does not match current embedded version")
