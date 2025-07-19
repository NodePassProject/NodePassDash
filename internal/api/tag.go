package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"NodePassDash/internal/tag"

	"github.com/gorilla/mux"
)

// TagHandler 标签处理器
type TagHandler struct {
	tagService *tag.Service
}

// NewTagHandler 创建标签处理器
func NewTagHandler(tagService *tag.Service) *TagHandler {
	return &TagHandler{tagService: tagService}
}

// GetTags 获取所有标签
func (h *TagHandler) GetTags(w http.ResponseWriter, r *http.Request) {
	tags, err := h.tagService.GetTags()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Tags:    tags,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// CreateTag 创建标签
func (h *TagHandler) CreateTag(w http.ResponseWriter, r *http.Request) {
	var req tag.CreateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "无效的请求数据", http.StatusBadRequest)
		return
	}

	tagObj, err := h.tagService.CreateTag(&req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签创建成功",
		Tag:     tagObj,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// UpdateTag 更新标签
func (h *TagHandler) UpdateTag(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		http.Error(w, "无效的标签ID", http.StatusBadRequest)
		return
	}

	var req tag.UpdateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "无效的请求数据", http.StatusBadRequest)
		return
	}
	req.ID = id

	tagObj, err := h.tagService.UpdateTag(&req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签更新成功",
		Tag:     tagObj,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteTag 删除标签
func (h *TagHandler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.ParseInt(vars["id"], 10, 64)
	if err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   "无效的标签ID",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	err = h.tagService.DeleteTag(id)
	if err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签删除成功",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// AssignTagToTunnel 为隧道分配标签
func (h *TagHandler) AssignTagToTunnel(w http.ResponseWriter, r *http.Request) {
	var req tag.AssignTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   "无效的请求数据",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	err := h.tagService.AssignTagToTunnel(&req)
	if err != nil {
		response := tag.TagResponse{
			Success: false,
			Error:   err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Message: "标签分配成功",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetTunnelTag 获取隧道的标签
func (h *TagHandler) GetTunnelTag(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	tunnelID, err := strconv.ParseInt(vars["tunnelId"], 10, 64)
	if err != nil {
		http.Error(w, "无效的隧道ID", http.StatusBadRequest)
		return
	}

	tagObj, err := h.tagService.GetTunnelTag(tunnelID)
	if err != nil {
		// 如果没有标签，返回空
		response := tag.TagResponse{
			Success: true,
			Tag:     nil,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	response := tag.TagResponse{
		Success: true,
		Tag:     tagObj,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
