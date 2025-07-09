"use client";

import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Chip,
  Divider,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faDesktop,
  faCog,
  faEdit,
  faTrash,
  faEye,
  faArrowRight,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import React from 'react';
import { Flex, Box } from "@/components";
import { TunnelGroup } from "@/lib/types";

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

interface GroupCardProps {
  group: TunnelGroup;
  tunnels: Tunnel[];
  onEdit?: (group: TunnelGroup) => void;
  onDelete?: (group: TunnelGroup) => void;
  onAddTunnels?: (group: TunnelGroup) => void;
  onViewDetails?: (group: TunnelGroup) => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  tunnels,
  onEdit,
  onDelete,
  onAddTunnels,
  onViewDetails,
}) => {
  // 获取分组中的隧道
  const groupTunnels = tunnels.filter(tunnel => 
    group.tunnelIds.includes(tunnel.id)
  );

  // 获取隧道类型标签
  const getTunnelTypeChip = (type: string) => {
    return (
      <Chip
        size="sm"
        variant="flat"
        color={type === '服务端' ? 'primary' : 'secondary'}
      >
        {type}
      </Chip>
    );
  };

  // 获取状态颜色
  const getStatusDot = (status: { type: string }) => {
    const colorMap = {
      success: 'bg-success',
      danger: 'bg-danger',
      warning: 'bg-warning',
    };
    return colorMap[status.type as keyof typeof colorMap] || 'bg-default';
  };

  // 统计不同类型的隧道数量
  const tunnelStats = groupTunnels.reduce((acc, tunnel) => {
    const type = tunnel.type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 统计运行中的隧道数量
  const runningCount = groupTunnels.filter(t => t.status.type === 'success').length;

  return (
    <Card className="hover:shadow-lg transition-all duration-200 border-l-4" 
          style={{ borderLeftColor: group.color }}>
      <CardHeader>
        <Flex className="items-center justify-between w-full">
          <Flex className="items-center gap-3">
            <div 
              className="w-4 h-4 rounded-full shadow-sm"
              style={{ backgroundColor: group.color }}
            />
            <Box>
              <h3 className="font-semibold text-lg">{group.name}</h3>
              {group.description && (
                <p className="text-sm text-default-500 mt-1">{group.description}</p>
              )}
            </Box>
          </Flex>
          
          <Dropdown>
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="text-default-400 hover:text-default-600"
              >
                <FontAwesomeIcon icon={faCog} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu>
              <DropdownItem 
                key="view" 
                startContent={<FontAwesomeIcon icon={faEye} />}
                onPress={() => onViewDetails?.(group)}
              >
                查看详情
              </DropdownItem>
              <DropdownItem 
                key="add" 
                startContent={<FontAwesomeIcon icon={faPlus} />}
                onPress={() => onAddTunnels?.(group)}
              >
                添加隧道
              </DropdownItem>
              <DropdownItem 
                key="edit" 
                startContent={<FontAwesomeIcon icon={faEdit} />}
                onPress={() => onEdit?.(group)}
              >
                编辑分组
              </DropdownItem>
              <DropdownItem 
                key="delete" 
                className="text-danger"
                color="danger"
                startContent={<FontAwesomeIcon icon={faTrash} />}
                onPress={() => onDelete?.(group)}
              >
                删除分组
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </Flex>
      </CardHeader>
      
      <Divider />
      
      <CardBody>
        <Box className="space-y-4">
          {/* 统计信息 */}
          <Flex className="items-center gap-4">
            <Badge content={group.tunnelIds.length} color="primary">
              <FontAwesomeIcon icon={faServer} className="text-default-400" />
            </Badge>
            <span className="text-sm text-default-500">
              {group.tunnelIds.length} 个隧道
            </span>
            
            {runningCount > 0 && (
              <>
                <div className="w-1 h-1 bg-default-300 rounded-full" />
                <span className="text-sm text-success">
                  {runningCount} 个运行中
                </span>
              </>
            )}
          </Flex>

          {/* 隧道类型统计 */}
          {Object.keys(tunnelStats).length > 0 && (
            <Flex className="gap-2 flex-wrap">
              {Object.entries(tunnelStats).map(([type, count]) => (
                <Chip key={type} size="sm" variant="flat" color="default">
                  {type}: {count}
                </Chip>
              ))}
            </Flex>
          )}

          {/* 隧道列表预览 */}
          {groupTunnels.length > 0 ? (
            <Box className="space-y-2">
              <h4 className="text-sm font-medium text-default-700">隧道列表</h4>
              <Box className="space-y-2 max-h-40 overflow-y-auto">
                {groupTunnels.slice(0, 5).map(tunnel => (
                  <Flex 
                    key={tunnel.id} 
                    className="items-center gap-3 p-2 bg-default-50 rounded-lg hover:bg-default-100 transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${getStatusDot(tunnel.status)}`} />
                    <FontAwesomeIcon 
                      icon={tunnel.type === '服务端' ? faServer : faDesktop} 
                      className="text-default-400 text-sm"
                    />
                    <span className="text-sm font-medium flex-1 truncate">
                      {tunnel.name}
                    </span>
                    {getTunnelTypeChip(tunnel.type)}
                  </Flex>
                ))}
                
                {groupTunnels.length > 5 && (
                  <div className="text-center py-2">
                    <span className="text-xs text-default-400">
                      还有 {groupTunnels.length - 5} 个隧道...
                    </span>
                  </div>
                )}
              </Box>
            </Box>
          ) : (
            <Box className="text-center py-6">
              <FontAwesomeIcon icon={faServer} className="text-3xl text-default-300 mb-2" />
              <p className="text-sm text-default-500">该分组暂无隧道</p>
              <Button
                size="sm"
                color="primary"
                variant="flat"
                className="mt-2"
                startContent={<FontAwesomeIcon icon={faPlus} />}
                onPress={() => onAddTunnels?.(group)}
              >
                添加隧道
              </Button>
            </Box>
          )}

          {/* 连接关系示例（针对双端/穿透类型） */}
          {groupTunnels.length >= 2 && (
            <Box className="border-t pt-3">
              <h4 className="text-sm font-medium text-default-700 mb-2">连接关系</h4>
              <Box className="bg-gradient-to-r from-primary-50 to-secondary-50 p-3 rounded-lg">
                <Flex className="items-center gap-2 text-sm">
                  <span className="font-medium">{groupTunnels[0]?.name}</span>
                  <FontAwesomeIcon icon={faArrowRight} className="text-default-400" />
                  <span className="font-medium">{groupTunnels[1]?.name}</span>
                </Flex>
                <p className="text-xs text-default-500 mt-1">
                  双端连接示例
                </p>
              </Box>
            </Box>
          )}
        </Box>
      </CardBody>
    </Card>
  );
}; 