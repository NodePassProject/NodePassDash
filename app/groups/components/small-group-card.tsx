"use client";

import {
  Card,
  CardBody,
  CardFooter,
  Chip,
  Button,Divider
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEdit,
  faTrash,
  faArrowDown,
  faLayerGroup,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import React from 'react';
import { useRouter } from "next/navigation";
import { TunnelGroup } from "@/lib/types";

interface Tunnel {
  id: string;
  name: string;
  type: string;
  mode: string; // 添加模式字段：server 或 client
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  endpoint: string; // 主控名称
}

interface SmallGroupCardProps {
  group: TunnelGroup;
  tunnels: Tunnel[];
  onEdit?: (group: TunnelGroup) => void;
  onDelete?: (group: TunnelGroup) => void;
}

export const SmallGroupCard: React.FC<SmallGroupCardProps> = ({
  group,
  tunnels,
  onEdit,
  onDelete,
}) => {
  const router = useRouter();

  // 获取分组中的隧道
  const groupTunnels = tunnels.filter(tunnel => 
    group.tunnelIds.includes(tunnel.id)
  );

  // 获取分组类型显示
  const getGroupTypeInfo = () => {
    const description = group.description || '';
    if (description.includes('双端')) {
      return { label: '双端转发', color: 'secondary' as const, type: 'double' };
    } else if (description.includes('单端')) {
      return { label: '单端转发', color: 'primary' as const, type: 'single' };
    } else if (description.includes('穿透')) {
      return { label: '内网穿透', color: 'success' as const, type: 'penetrate' };
    } else {
      return { label: '自定义', color: 'warning' as const, type: 'custom' };
    }
  };

  const typeInfo = getGroupTypeInfo();

  // 根据分组类型确定入口端和出口端
  let sourceTunnel, targetTunnel;
  
  if (typeInfo.type === 'penetrate') {
    // 内网穿透：客户端 -> 服务端
    sourceTunnel = groupTunnels.find(t => t.mode === 'client' || t.type === '客户端');
    targetTunnel = groupTunnels.find(t => t.mode === 'server' || t.type === '服务端');
  } else {
    // 双端转发：服务端 -> 客户端
    sourceTunnel = groupTunnels.find(t => t.mode === 'server' || t.type === '服务端');
    targetTunnel = groupTunnels.find(t => t.mode === 'client' || t.type === '客户端');
  }

  // 处理隧道点击跳转
  const handleTunnelClick = (tunnelId: string) => {
    router.push(`/tunnels/details?id=${tunnelId}`);
  };

  // 渲染单端转发显示
  const renderSingleTunnelDisplay = () => {
    if (groupTunnels.length === 0) {
      return (
        <div className="p-3 bg-default-100 dark:bg-default-800 border border-default-300 dark:border-default-600 rounded-lg text-center min-h-[120px] flex items-center justify-center">
          <div className="text-xs text-default-500 dark:text-default-400">未配置隧道</div>
        </div>
      );
    }

    const tunnel = groupTunnels[0];
    return (
      <div 
        className={`p-3 rounded-lg text-left space-y-2 min-h-[120px] cursor-pointer transition-all duration-200 border ${
          tunnel.mode === 'server' || tunnel.type === '服务端' 
            ? 'bg-gradient-to-br from-blue-50 to-blue-200 border-blue-300 dark:from-blue-900 dark:to-blue-800 dark:border-blue-700' 
            : 'bg-gradient-to-br from-green-50 to-green-200 border-green-300 dark:from-green-900 dark:to-green-800 dark:border-green-700'
        }`}
        onClick={() => handleTunnelClick(tunnel.id)}
      >
        <div className="space-y-2">
          {/* 第一行：主控名称 */}
          {tunnel.endpoint && (
            <div className="text-xs font-medium text-default-600">
              {tunnel.endpoint}
            </div>
          )}
          
          {/* 第二行：入口节点标签 */}
          <div className="text-xs font-semibold text-default-600 flex items-center gap-1">
                         <span className={`inline-block w-2 h-2 rounded-full ${
               tunnel.mode === 'server' || tunnel.type === '服务端' 
                 ? 'bg-blue-500 dark:bg-blue-400' 
                 : 'bg-green-500 dark:bg-green-400'
             }`}></span>
            入口地址 ({tunnel.mode === 'server' || tunnel.type === '服务端' ? '服务端' : '客户端'})
          </div>
          
          {/* 第三行：隧道端口地址 */}
          <div className="text-xs text-default-700">
            {tunnel.tunnelAddress}:{tunnel.tunnelPort}
          </div>
          
                     <div className="py-1 flex justify-center">
             <FontAwesomeIcon icon={faArrowDown} className="text-default-400 text-lg" />
           </div>
          
          {/* 出口节点标签 */}
          <div className="text-xs font-semibold text-default-600">
          出口地址
          </div>
          
          {/* 目标地址 */}
          <div className="text-xs text-default-700">
            {tunnel.targetAddress}:{tunnel.targetPort}
          </div>
        </div>
      </div>
    );
  };

  // 渲染双端/内网穿透显示
  const renderDoubleTunnelDisplay = () => {
    return (
      <div className="space-y-3 min-h-[120px]">
        {/* 入口端 */}
        {sourceTunnel ? (
          <div 
            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 text-left space-y-1 border ${
              sourceTunnel.mode === 'server' || sourceTunnel.type === '服务端' 
                ? 'bg-gradient-to-br from-blue-50 to-blue-200 border-blue-300 dark:from-blue-900 dark:to-blue-800 dark:border-blue-700' 
                : 'bg-gradient-to-br from-green-50 to-green-200 border-green-300 dark:from-green-900 dark:to-green-800 dark:border-green-700'
            }`}
            onClick={() => handleTunnelClick(sourceTunnel.id)}
          >
            <div className="text-xs font-semibold text-default-600 flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${
                sourceTunnel.mode === 'server' || sourceTunnel.type === '服务端' 
                  ? 'bg-blue-500 dark:bg-blue-400' 
                  : 'bg-green-500 dark:bg-green-400'
              }`}></span>
              入口节点 ({sourceTunnel.mode === 'server' || sourceTunnel.type === '服务端' ? '服务端' : '客户端'})
            </div>
            <div className="text-xs text-default-800">
              {sourceTunnel.endpoint}
            </div>
            <div className="text-xs text-default-700">
              {sourceTunnel.targetAddress}:{sourceTunnel.targetPort}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-default-100 dark:bg-default-800 border border-default-200 dark:border-default-600 rounded-lg text-center">
            <div className="text-xs text-default-500 dark:text-default-400">
              未配置入口端
            </div>
          </div>
        )}

        {/* 竖直箭头 */}
        <div className="flex items-center justify-center">
          <FontAwesomeIcon 
            icon={faArrowDown} 
            className="text-lg text-default-400" 
          />
        </div>
        
        {/* 出口端 */}
        {targetTunnel ? (
          <div 
            className={`p-3 rounded-lg cursor-pointer transition-all duration-200 text-left space-y-1 border ${
              targetTunnel.mode === 'server' || targetTunnel.type === '服务端' 
                ? 'bg-gradient-to-br from-blue-50 to-blue-200 border-blue-300 dark:from-blue-900 dark:to-blue-800 dark:border-blue-700' 
                : 'bg-gradient-to-br from-green-50 to-green-200 border-green-300 dark:from-green-900 dark:to-green-800 dark:border-green-700'
            }`}
            onClick={() => handleTunnelClick(targetTunnel.id)}
          >
            <div className="text-xs font-semibold text-default-600 flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${
                targetTunnel.mode === 'server' || targetTunnel.type === '服务端' 
                  ? 'bg-blue-500 dark:bg-blue-400' 
                  : 'bg-green-500 dark:bg-green-400'
              }`}></span>
              出口节点 ({targetTunnel.mode === 'server' || targetTunnel.type === '服务端' ? '服务端' : '客户端'})
            </div>
            <div className="text-xs text-default-800">
              {targetTunnel.endpoint}
            </div>
            <div className="text-xs text-default-700">
              {targetTunnel.targetAddress}:{targetTunnel.targetPort}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-default-100 dark:bg-default-800 border border-default-200 dark:border-default-600 rounded-lg text-center">
            <div className="text-xs text-default-500 dark:text-default-400">
              未配置出口端
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染自定义模式显示
  const renderCustomDisplay = () => {
    return (
      <div className="p-3 bg-default-100 dark:bg-default-800 border border-default-200 dark:border-default-600 rounded-lg text-center min-h-[120px] flex items-center justify-center">
        <div className="flex items-center justify-center gap-2">
          <FontAwesomeIcon icon={faLayerGroup} className="text-sm text-default-400 dark:text-default-500" />
          <span className="text-sm text-default-600 dark:text-default-300">
            {groupTunnels.length} 个隧道
          </span>
        </div>
      </div>
    );
  };

  // 格式化时间显示
  const formatTime = (dateString: string | Date) => {
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return '时间无效';
    }
  };

  return (
    <Card className="h-full">
      <CardBody className="p-4">
        <div className="space-y-3 h-full flex flex-col">
          {/* 分组名称和类型 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold truncate flex-1 text-foreground">{group.name}</h3>
            </div>
            
            {/* 分组类型标签 */}
            {typeInfo.type !== 'custom' && (
              <Chip 
                size="sm" 
                variant="flat" 
                color={typeInfo.color}
                className="text-xs font-medium"
              >
                {typeInfo.label}
              </Chip>
            )}
          </div>

          {/* 隧道连接信息 */}
          <div className="flex-1 flex flex-col justify-center">
            {typeInfo.type === 'single' ? renderSingleTunnelDisplay() : 
             typeInfo.type === 'double' || typeInfo.type === 'penetrate' ? renderDoubleTunnelDisplay() : 
             renderCustomDisplay()}
          </div>

          {/* 创建时间 - 放在底部 */}
          <div className="flex items-center gap-1 mt-auto pt-2">
            <FontAwesomeIcon icon={faClock} className="text-xs text-default-400" />
            <span className="text-xs text-default-500">
              {formatTime(group.createdAt)}
            </span>
          </div>
        </div>
      </CardBody>
      {/* 分割线，左右有间距空出来 */}
      <Divider />
      <CardFooter >
        <div className="w-full flex gap-2">
          {/* 编辑按钮 */}
          <Button
            size="sm"
            variant="flat"
            color="primary"
            className="flex-1"
            startContent={<FontAwesomeIcon icon={faEdit} className="text-xs" />}
            onPress={() => onEdit?.(group)}
          >
            编辑
          </Button>
          
          {/* 删除按钮 */}
          <Button
            size="sm"
            variant="flat"
            color="danger"
            className="flex-1"
            startContent={<FontAwesomeIcon icon={faTrash} className="text-xs" />}
            onPress={() => onDelete?.(group)}
          >
            删除
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}; 