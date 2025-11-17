package services

import (
	"NodePassDash/internal/models"
)

// ServiceResponse API响应
type ServiceResponse struct {
	Success  bool               `json:"success"`
	Message  string             `json:"message,omitempty"`
	Error    string             `json:"error,omitempty"`
	Service  *models.Services   `json:"service,omitempty"`
	Services []*models.Services `json:"services,omitempty"`
}

// AvailableInstance 可用实例（没有peer或peer.sid的实例）
type AvailableInstance struct {
	InstanceId    string `json:"instanceId"`
	EndpointId    int64  `json:"endpointId"`
	EndpointName  string `json:"endpointName"`
	TunnelType    string `json:"tunnelType"` // "server" | "client"
	Name          string `json:"name"`
	TunnelAddress string `json:"tunnelAddress"`
	TunnelPort    string `json:"tunnelPort"`
	TargetAddress string `json:"targetAddress"`
	TargetPort    string `json:"targetPort"`
}

// AvailableInstancesResponse 可用实例响应
type AvailableInstancesResponse struct {
	Success   bool                 `json:"success"`
	Instances []*AvailableInstance `json:"instances,omitempty"`
	Error     string               `json:"error,omitempty"`
}

// AssembleServiceRequest 组装服务请求
type AssembleServiceRequest struct {
	Sid              string  `json:"sid" binding:"required"`
	Name             string  `json:"name" binding:"required"`
	Type             string  `json:"type" binding:"required"`
	ClientInstanceId string  `json:"clientInstanceId" binding:"required"`
	ServerInstanceId *string `json:"serverInstanceId,omitempty"`
}
