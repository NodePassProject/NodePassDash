package services

import "time"

// Service 服务响应模型
type Service struct {
	Sid                string    `json:"sid"`
	Type               string    `json:"type"`
	Alias              *string   `json:"alias,omitempty"`
	ServerInstanceId   *string   `json:"serverInstanceId,omitempty"`
	ClientInstanceId   *string   `json:"clientInstanceId,omitempty"`
	ServerEndpointId   *int64    `json:"serverEndpointId,omitempty"`
	ClientEndpointId   *int64    `json:"clientEndpointId,omitempty"`
	TunnelPort         *string   `json:"tunnelPort,omitempty"`
	TunnelEndpointName *string   `json:"tunnelEndpointName,omitempty"`
	EntrancePort       *string   `json:"entrancePort,omitempty"`
	EntranceHost       *string   `json:"entranceHost,omitempty"`
	ExitPort           *string   `json:"exitPort,omitempty"`
	ExitHost           *string   `json:"exitHost,omitempty"`
	CreatedAt          time.Time `json:"createdAt,omitempty"`
	UpdatedAt          time.Time `json:"updatedAt,omitempty"`
}

// ServiceResponse API响应
type ServiceResponse struct {
	Success  bool       `json:"success"`
	Message  string     `json:"message,omitempty"`
	Error    string     `json:"error,omitempty"`
	Service  *Service   `json:"service,omitempty"`
	Services []*Service `json:"services,omitempty"`
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
