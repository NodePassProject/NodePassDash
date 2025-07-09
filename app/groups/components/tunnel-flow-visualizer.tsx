"use client";

import {
  Card,
  CardHeader,
  CardBody,
  Chip,
  Badge,
  Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faDesktop,
  faArrowRight,
  faArrowsLeftRight,
  faRoute,
  faNetworkWired,
  faGlobe,
  faHome,
} from "@fortawesome/free-solid-svg-icons";
import React from 'react';
import { Flex, Box } from "@/components";
import { TunnelType } from "@/lib/types";

interface Tunnel {
  id: string;
  name: string;
  type: string;
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  endpoint: string;
}

interface TunnelConnection {
  sourceId: string;
  targetId: string;
  type: 'double' | 'penetrate' | 'custom';
  description?: string;
}

interface TunnelFlowVisualizerProps {
  tunnels: Tunnel[];
  connections?: TunnelConnection[];
  title?: string;
  showTrafficFlow?: boolean;
}

export const TunnelFlowVisualizer: React.FC<TunnelFlowVisualizerProps> = ({
  tunnels,
  connections = [],
  title = "隧道连接关系",
  showTrafficFlow = true,
}) => {
  // 获取隧道类型图标
  const getTunnelIcon = (type: string) => {
    switch (type) {
      case '服务端':
        return faServer;
      case '客户端':
        return faDesktop;
      default:
        return faNetworkWired;
    }
  };

  // 获取隧道类型颜色
  const getTunnelTypeColor = (type: string) => {
    switch (type) {
      case '服务端':
        return 'primary';
      case '客户端':
        return 'secondary';
      default:
        return 'default';
    }
  };

  // 获取状态颜色
  const getStatusColor = (status: { type: string }) => {
    switch (status.type) {
      case 'success':
        return 'bg-success';
      case 'danger':
        return 'bg-danger';
      case 'warning':
        return 'bg-warning';
      default:
        return 'bg-default';
    }
  };

  // 获取连接类型图标
  const getConnectionIcon = (type: string) => {
    switch (type) {
      case 'double':
        return faArrowsLeftRight;
      case 'penetrate':
        return faRoute;
      default:
        return faArrowRight;
    }
  };

  // 获取连接类型标签
  const getConnectionTypeChip = (type: string) => {
    const config = {
      double: { label: '双端', color: 'secondary' as const },
      penetrate: { label: '穿透', color: 'success' as const },
      custom: { label: '自定义', color: 'warning' as const },
    };
    return config[type as keyof typeof config] || config.custom;
  };

  // 渲染单个隧道卡片（竖直方向，更紧凑）
  const renderTunnelCard = (tunnel: Tunnel, position: 'source' | 'target') => {
    const isSource = position === 'source';
    return (
      <Box className={`p-3 rounded-lg border-2 ${isSource ? 'border-primary bg-primary-50' : 'border-success bg-success-50'} min-w-[200px]`}>
        <Flex className="items-center gap-2 mb-2">
          <FontAwesomeIcon 
            icon={getTunnelIcon(tunnel.type)} 
            className={`text-lg ${isSource ? 'text-primary' : 'text-success'}`}
          />
          <Box className="flex-1">
            <div className="text-xs font-medium text-default-700">
              {isSource ? '入口端' : '出口端'}
            </div>
            <div className={`w-2 h-2 rounded-full ${getStatusColor(tunnel.status)} mt-1`} />
          </Box>
          <Chip
            size="sm"
            variant="flat"
            color={getTunnelTypeColor(tunnel.type)}
          >
            {tunnel.type}
          </Chip>
        </Flex>
        
        <Box className="space-y-2">
          <div className="text-sm font-semibold truncate">{tunnel.name}</div>
          
          <Box className="space-y-1">
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faGlobe} className="text-xs text-primary" />
              <code className="text-xs bg-white px-1 rounded truncate">
                {tunnel.tunnelAddress}:{tunnel.tunnelPort}
              </code>
            </div>
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={faHome} className="text-xs text-success" />
              <code className="text-xs bg-white px-1 rounded truncate">
                {tunnel.targetAddress}:{tunnel.targetPort}
              </code>
            </div>
          </Box>

          <Chip
            size="sm"
            variant="flat"
            color={tunnel.status.type === 'success' ? 'success' : 'danger'}
          >
            {tunnel.status.text}
          </Chip>
        </Box>
      </Box>
    );
  };

  // 渲染连接箭头（更紧凑）
  const renderConnectionArrow = (connection: TunnelConnection) => {
    const typeConfig = getConnectionTypeChip(connection.type);
    return (
      <Box className="flex flex-col items-center justify-center px-2">
        <Tooltip content={connection.description || `${typeConfig.label}连接`}>
          <div className="flex flex-col items-center gap-1">
            <FontAwesomeIcon 
              icon={getConnectionIcon(connection.type)} 
              className="text-xl text-default-400 hover:text-primary transition-colors"
            />
            <Chip size="sm" variant="flat" color={typeConfig.color}>
              {typeConfig.label}
            </Chip>
          </div>
        </Tooltip>
      </Box>
    );
  };

  // 自动检测连接关系（如果没有提供）
  const autoDetectConnections = (): TunnelConnection[] => {
    if (connections.length > 0) return connections;
    
    const serverTunnels = tunnels.filter(t => t.type === '服务端');
    const clientTunnels = tunnels.filter(t => t.type === '客户端');
    
    const autoConnections: TunnelConnection[] = [];
    
    // 简单的自动配对逻辑
    for (let i = 0; i < Math.min(serverTunnels.length, clientTunnels.length); i++) {
      autoConnections.push({
        sourceId: serverTunnels[i].id,
        targetId: clientTunnels[i].id,
        type: 'double',
        description: '自动检测的双端连接'
      });
    }
    
    return autoConnections;
  };

  const displayConnections = autoDetectConnections();

  if (tunnels.length === 0) {
    return (
      <Card>
        <CardBody className="text-center py-8">
          <FontAwesomeIcon icon={faNetworkWired} className="text-4xl text-default-300 mb-4" />
          <p className="text-default-500">暂无隧道数据</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <Flex className="items-center justify-between w-full">
          <Flex className="items-center gap-2">
            <FontAwesomeIcon icon={faRoute} className="text-primary" />
            <span className="font-medium">{title}</span>
          </Flex>
          <Badge content={displayConnections.length} color="primary">
            <FontAwesomeIcon icon={faArrowsLeftRight} className="text-default-400" />
          </Badge>
        </Flex>
      </CardHeader>
      <CardBody>
        <Box className="space-y-6">
          {displayConnections.length > 0 ? (
            displayConnections.map((connection, index) => {
              const sourceTunnel = tunnels.find(t => t.id === connection.sourceId);
              const targetTunnel = tunnels.find(t => t.id === connection.targetId);
              
              if (!sourceTunnel || !targetTunnel) return null;
              
              return (
                <Box 
                  key={`${connection.sourceId}-${connection.targetId}-${index}`}
                  className="p-3 bg-default-50 rounded-lg border border-default-200"
                >
                  <Flex className="items-center justify-center gap-3">
                    {renderTunnelCard(sourceTunnel, 'source')}
                    {renderConnectionArrow(connection)}
                    {renderTunnelCard(targetTunnel, 'target')}
                  </Flex>
                  
                  {connection.description && (
                    <div className="mt-2 text-xs text-default-600 text-center">
                      {connection.description}
                    </div>
                  )}
                </Box>
              );
            })
          ) : (
            <Box className="text-center py-8">
              <FontAwesomeIcon icon={faRoute} className="text-4xl text-default-300 mb-4" />
              <p className="text-default-500">暂无连接关系</p>
              <p className="text-xs text-default-400 mt-2">
                需要至少2个不同类型的隧道才能显示连接关系
              </p>
            </Box>
          )}
          
          {/* 简单的隧道列表显示（作为备选） */}
          {displayConnections.length === 0 && tunnels.length > 0 && (
            <Box className="space-y-3">
              <h4 className="text-sm font-medium text-default-700">隧道列表</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tunnels.map(tunnel => (
                  <Box 
                    key={tunnel.id}
                    className="p-3 bg-default-50 rounded-lg border border-default-200"
                  >
                    <Flex className="items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(tunnel.status)}`} />
                      <FontAwesomeIcon 
                        icon={getTunnelIcon(tunnel.type)} 
                        className="text-default-400"
                      />
                      <Box className="flex-1">
                        <div className="text-sm font-medium">{tunnel.name}</div>
                        <div className="text-xs text-default-500">
                          {tunnel.tunnelAddress}:{tunnel.tunnelPort} → {tunnel.targetAddress}:{tunnel.targetPort}
                        </div>
                      </Box>
                      <Chip size="sm" variant="flat" color={getTunnelTypeColor(tunnel.type)}>
                        {tunnel.type}
                      </Chip>
                    </Flex>
                  </Box>
                ))}
              </div>
            </Box>
          )}
        </Box>
      </CardBody>
    </Card>
  );
}; 