"use client";

import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
  Input,
  Select,
  SelectItem,
  Chip
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from "next/navigation";
import { Box, Flex } from "@/components";
import { TunnelGroup } from "@/lib/types";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';
import { SmallGroupCard } from "./components/small-group-card";

// 隧道接口定义（用于显示）
interface Tunnel {
  id: string;
  name: string;
  type: string;
  mode: string; // 添加模式字段：server 或 client
  endpointName?: string; // 主控名称
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

export default function GroupsPage() {
  const router = useRouter();
  
  // 状态管理
  const [groups, setGroups] = useState<TunnelGroup[]>([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(true);

  // 模态框控制
  const { 
    isOpen: isCreateGroupOpen, 
    onOpen: onCreateGroupOpen, 
    onOpenChange: onCreateGroupOpenChange 
  } = useDisclosure();

  const { 
    isOpen: isEditGroupOpen, 
    onOpen: onEditGroupOpen, 
    onOpenChange: onEditGroupOpenChange 
  } = useDisclosure();

  // 表单状态
  const [groupForm, setGroupForm] = useState({
    name: "",
    type: "single" as "single" | "double" | "intranet" | "custom",
    tunnelIds: [] as string[]
  });

  // 编辑状态
  const [editingGroup, setEditingGroup] = useState<TunnelGroup | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // 添加单独的选择状态
  const [selectedGroupType, setSelectedGroupType] = useState<Set<string>>(new Set(["single"]));
  const [selectedTunnels, setSelectedTunnels] = useState<Set<string>>(new Set());

  // 获取隧道列表
  const fetchTunnels = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/api/tunnels'));
      if (!response.ok) throw new Error('获取隧道列表失败');
      const data = await response.json();
      // 将后端返回的数字ID转换为字符串
      const tunnelsWithStringIds = data.map((tunnel: any) => ({
        ...tunnel,
        id: String(tunnel.id)
      }));
      setTunnels(tunnelsWithStringIds);
    } catch (error) {
      console.error('获取隧道列表失败:', error);
      addToast({
        title: '错误',
        description: '获取隧道列表失败',
        color: 'danger'
      });
    }
  }, []);

  // 获取分组列表
  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      // 获取分组列表 - 从API获取
      const response = await fetch(buildApiUrl('/api/groups'));
      if (!response.ok) throw new Error('获取分组列表失败');
      const data = await response.json();
      
      // 转换数据结构：将 members 转换为 tunnelIds，并转换时间字段名称
      const groupsWithTunnelIds = data.map((groupWithMembers: any) => ({
        id: groupWithMembers.id,
        name: groupWithMembers.name,
        description: groupWithMembers.description,
        type: groupWithMembers.type,
        color: groupWithMembers.color,
        createdAt: groupWithMembers.created_at,
        updatedAt: groupWithMembers.updated_at,
        tunnelIds: groupWithMembers.members?.map((member: any) => member.tunnel_id) || []
      }));
      
      setGroups(groupsWithTunnelIds);
    } catch (error) {
      console.error('获取分组列表失败:', error);
      addToast({
        title: '错误',
        description: '获取分组列表失败',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTunnels();
    fetchGroups();
  }, [fetchTunnels, fetchGroups]);

  // 辅助函数：获取客户端隧道
  const getClientTunnels = () => {
    return tunnels.filter(tunnel => tunnel.mode === 'client' || tunnel.type === '客户端');
  };

  // 辅助函数：获取服务端隧道
  const getServerTunnels = () => {
    return tunnels.filter(tunnel => tunnel.mode === 'server' || tunnel.type === '服务端');
  };



  // 编辑分组
  const handleEditGroup = (group: TunnelGroup) => {
    setEditingGroup(group);
    setIsEditing(true);
    
    // 填充表单数据
    setGroupForm({
      name: group.name,
      type: group.type as "single" | "double" | "intranet" | "custom",
      tunnelIds: group.tunnelIds
    });
    
    // 设置选择状态
    setSelectedGroupType(new Set([group.type]));
    setSelectedTunnels(new Set(group.tunnelIds));
    
    onEditGroupOpen();
  };

  // 更新分组
  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    
    if (!groupForm.name.trim()) {
      addToast({
        title: '错误',
        description: '请输入分组名称',
        color: 'danger'
      });
      return;
    }

    // 验证隧道选择
    if (tunnels.length === 0) {
      addToast({
        title: '错误',
        description: '暂无可用隧道，请先创建隧道',
        color: 'danger'
      });
      return;
    }

    if (groupForm.type === "single" && groupForm.tunnelIds.length !== 1) {
      addToast({
        title: '错误',
        description: '单端转发需要选择1个客户端隧道',
        color: 'danger'
      });
      return;
    }

    if ((groupForm.type === "double" || groupForm.type === "intranet") && groupForm.tunnelIds.length !== 2) {
      addToast({
        title: '错误',
        description: `${groupForm.type === "double" ? "双端转发" : "内网穿透"}需要选择1个客户端和1个服务端隧道`,
        color: 'danger'
      });
      return;
    }

    // 验证双端转发和内网穿透的隧道类型组合
    if (groupForm.type === "double" || groupForm.type === "intranet") {
      const selectedTunnels = tunnels.filter(t => groupForm.tunnelIds.includes(t.id));
      const clientCount = selectedTunnels.filter(t => t.mode === 'client' || t.type === '客户端').length;
      const serverCount = selectedTunnels.filter(t => t.mode === 'server' || t.type === '服务端').length;
      
      if (clientCount !== 1 || serverCount !== 1) {
        addToast({
          title: '错误',
          description: `${groupForm.type === "double" ? "双端转发" : "内网穿透"}必须选择1个客户端和1个服务端隧道`,
          color: 'danger'
        });
        return;
      }
    }

    // 验证单端转发的隧道类型
    if (groupForm.type === "single") {
      const selectedTunnels = tunnels.filter(t => groupForm.tunnelIds.includes(t.id));
      const clientCount = selectedTunnels.filter(t => t.mode === 'client' || t.type === '客户端').length;
      
      if (clientCount !== 1) {
        addToast({
          title: '错误',
          description: '单端转发必须选择1个客户端隧道',
          color: 'danger'
        });
        return;
      }
    }

    try {
      const response = await fetch(buildApiUrl(`/api/groups/${editingGroup.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: groupForm.name,
          type: groupForm.type,
          description: `${
            groupForm.type === 'single' ? '单端转发' : 
            groupForm.type === 'double' ? '双端转发' : 
            groupForm.type === 'intranet' ? '内网穿透' : 
            '自定义'
          }分组`,
          tunnel_ids: groupForm.tunnelIds.map(id => parseInt(id))
        }),
      });

      if (!response.ok) throw new Error('更新分组失败');
      
      await fetchGroups(); // 重新获取分组列表

      // 重置表单状态
      resetForm();
      setEditingGroup(null);
      setIsEditing(false);

      onEditGroupOpenChange();
      addToast({
        title: '成功',
        description: '分组更新成功',
        color: 'success'
      });
    } catch (error) {
      console.error('更新分组失败:', error);
      addToast({
        title: '错误',
        description: '更新分组失败',
        color: 'danger'
      });
    }
  };

  // 创建新分组
  const handleCreateGroup = async () => {
    if (!groupForm.name.trim()) {
      addToast({
        title: '错误',
        description: '请输入分组名称',
        color: 'danger'
      });
      return;
    }

    // 验证隧道选择
    if (tunnels.length === 0) {
      addToast({
        title: '错误',
        description: '暂无可用隧道，请先创建隧道',
        color: 'danger'
      });
      return;
    }

    if (groupForm.type === "single" && groupForm.tunnelIds.length !== 1) {
      addToast({
        title: '错误',
        description: '单端转发需要选择1个客户端隧道',
        color: 'danger'
      });
      return;
    }

    if ((groupForm.type === "double" || groupForm.type === "intranet") && groupForm.tunnelIds.length !== 2) {
      addToast({
        title: '错误',
        description: `${groupForm.type === "double" ? "双端转发" : "内网穿透"}需要选择1个客户端和1个服务端隧道`,
        color: 'danger'
      });
      return;
    }

    // 验证双端转发和内网穿透的隧道类型组合
    if (groupForm.type === "double" || groupForm.type === "intranet") {
      const selectedTunnels = tunnels.filter(t => groupForm.tunnelIds.includes(t.id));
      const clientCount = selectedTunnels.filter(t => t.mode === 'client' || t.type === '客户端').length;
      const serverCount = selectedTunnels.filter(t => t.mode === 'server' || t.type === '服务端').length;
      
      if (clientCount !== 1 || serverCount !== 1) {
        addToast({
          title: '错误',
          description: `${groupForm.type === "double" ? "双端转发" : "内网穿透"}必须选择1个客户端和1个服务端隧道`,
          color: 'danger'
        });
        return;
      }
    }

    // 验证单端转发的隧道类型
    if (groupForm.type === "single") {
      const selectedTunnels = tunnels.filter(t => groupForm.tunnelIds.includes(t.id));
      const clientCount = selectedTunnels.filter(t => t.mode === 'client' || t.type === '客户端').length;
      
      if (clientCount !== 1) {
        addToast({
          title: '错误',
          description: '单端转发必须选择1个客户端隧道',
          color: 'danger'
        });
        return;
      }
    }

    try {
      const response = await fetch(buildApiUrl('/api/groups'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: groupForm.name,
          type: groupForm.type,
          description: `${
            groupForm.type === 'single' ? '单端转发' : 
            groupForm.type === 'double' ? '双端转发' : 
            groupForm.type === 'intranet' ? '内网穿透' : 
            '自定义'
          }分组`,
          tunnel_ids: groupForm.tunnelIds.map(id => parseInt(id))
        }),
      });

      if (!response.ok) throw new Error('创建分组失败');
      
      await fetchGroups(); // 重新获取分组列表

      // 重置表单状态
      resetForm();

      onCreateGroupOpenChange();
      addToast({
        title: '成功',
        description: '分组创建成功',
        color: 'success'
      });
    } catch (error) {
      console.error('创建分组失败:', error);
      addToast({
        title: '错误',
        description: '创建分组失败',
        color: 'danger'
      });
    }
  };

  // 删除分组
  const handleDeleteGroup = async (group: TunnelGroup) => {
    try {
      const response = await fetch(buildApiUrl(`/api/groups/${group.id}`), {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('删除分组失败');
      
      await fetchGroups(); // 重新获取分组列表
      addToast({
        title: '成功',
        description: '分组删除成功',
        color: 'success'
      });
    } catch (error) {
      console.error('删除分组失败:', error);
      addToast({
        title: '错误',
        description: '删除分组失败',
        color: 'danger'
      });
    }
  };

  // 重置表单状态
  const resetForm = () => {
    setGroupForm({
      name: "",
      type: "single",
      tunnelIds: []
    });
    setSelectedGroupType(new Set(["single"]));
    setSelectedTunnels(new Set());
    setEditingGroup(null);
    setIsEditing(false);
  };

  if (loading) {
    return (
      <Box className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <div className="text-default-500">加载中...</div>
        </div>
      </Box>
    );
  }

  return (
    <Box className="space-y-6">
      {/* 页面标题和操作按钮 */}
      <Flex className="items-center justify-between">
        <Box>
          <h1 className="text-2xl font-bold">分组场景</h1>
          <p className="text-default-500">管理隧道分组和场景配置</p>
        </Box>
        <Button
          color="primary"
          startContent={<FontAwesomeIcon icon={faPlus} />}
          onPress={onCreateGroupOpen}
        >
          新建分组
        </Button>
      </Flex>

      {/* 分组列表 */}
      {groups.length > 0 && (
        <Box className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">分组列表</h2>
            {/* 颜色图例 */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 dark:bg-blue-400"></span>
                <span className="text-default-600">服务端</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 dark:bg-green-400"></span>
                <span className="text-default-600">客户端</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {groups.map((group) => (
              <SmallGroupCard
                key={group.id}
                group={group}
                tunnels={tunnels}
                onEdit={handleEditGroup}
                onDelete={handleDeleteGroup}
              />
            ))}
          </div>
        </Box>
      )}

      {/* 创建分组模态框 */}
      <Modal 
        isOpen={isCreateGroupOpen} 
        onOpenChange={onCreateGroupOpenChange}
        size="lg"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>创建新分组</ModalHeader>
              <ModalBody>
                <Box className="space-y-4">
                  <Input
                    label="分组名称"
                    placeholder="输入分组名称"
                    value={groupForm.name}
                    onValueChange={(value) => setGroupForm({...groupForm, name: value})}
                  />
                  
                  <Select
                    label="分组类型"
                    placeholder="选择分组类型"
                    className="w-full"
                    selectedKeys={selectedGroupType}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0] as string;
                      setSelectedGroupType(new Set([key]));
                      setGroupForm(prev => ({ ...prev, type: key as "single" | "double" | "intranet" | "custom" }));
                      // 清空已选择的隧道
                      setSelectedTunnels(new Set());
                      setGroupForm(prev => ({ ...prev, tunnelIds: [] }));
                    }}
                  >
                    <SelectItem key="single">单端转发</SelectItem>
                    <SelectItem key="double">双端转发</SelectItem>
                    <SelectItem key="intranet">内网穿透</SelectItem>
                  </Select>

                  {groupForm.type === "single" && (
                    <Select
                      label="选择客户端隧道"
                      placeholder="请选择1个客户端隧道"
                      className="w-full"
                      selectedKeys={new Set(groupForm.tunnelIds)}
                      onSelectionChange={(keys) => {
                        const keysArray = Array.from(keys) as string[];
                        if (keysArray.length <= 1) {
                          setSelectedTunnels(new Set(keysArray));
                          setGroupForm(prev => ({ ...prev, tunnelIds: keysArray }));
                        }
                      }}
                    >
                      {getClientTunnels().map(tunnel => (
                        <SelectItem key={tunnel.id} description={`${tunnel.tunnelAddress}:${tunnel.tunnelPort} - ${tunnel.status.text}`}>
                          {tunnel.name}
                        </SelectItem>
                      ))}
                    </Select>
                  )}

                  {(groupForm.type === "double" || groupForm.type === "intranet") && (
                    <>
                      <Select
                        label="选择客户端隧道"
                        placeholder="请选择1个客户端隧道"
                        className="w-full"
                        selectedKeys={new Set(groupForm.tunnelIds.filter(id => 
                          getClientTunnels().some(t => t.id === id)
                        ))}
                        onSelectionChange={(keys) => {
                          const clientTunnelId = Array.from(keys)[0] as string;
                          if (clientTunnelId) {
                            const serverTunnel = groupForm.tunnelIds.find(id => 
                              getServerTunnels().some(t => t.id === id)
                            );
                            const newSelection = serverTunnel ? [clientTunnelId, serverTunnel] : [clientTunnelId];
                            setSelectedTunnels(new Set(newSelection));
                            setGroupForm(prev => ({ ...prev, tunnelIds: newSelection }));
                          }
                        }}
                      >
                        {getClientTunnels().map(tunnel => (
                          <SelectItem key={tunnel.id} description={`${tunnel.tunnelAddress}:${tunnel.tunnelPort} - ${tunnel.status.text}`}>
                            {tunnel.name}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label="选择服务端隧道"
                        placeholder="请选择1个服务端隧道"
                        className="w-full"
                        selectedKeys={new Set(groupForm.tunnelIds.filter(id => 
                          getServerTunnels().some(t => t.id === id)
                        ))}
                        onSelectionChange={(keys) => {
                          const serverTunnelId = Array.from(keys)[0] as string;
                          if (serverTunnelId) {
                            const clientTunnel = groupForm.tunnelIds.find(id => 
                              getClientTunnels().some(t => t.id === id)
                            );
                            const newSelection = clientTunnel ? [clientTunnel, serverTunnelId] : [serverTunnelId];
                            setSelectedTunnels(new Set(newSelection));
                            setGroupForm(prev => ({ ...prev, tunnelIds: newSelection }));
                          }
                        }}
                      >
                        {getServerTunnels().map(tunnel => (
                          <SelectItem key={tunnel.id} description={`${tunnel.tunnelAddress}:${tunnel.tunnelPort} - ${tunnel.status.text}`}>
                            {tunnel.name}
                          </SelectItem>
                        ))}
                      </Select>
                    </>
                  )}


                </Box>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="primary" 
                  onPress={handleCreateGroup}
                >
                  创建分组
                </Button>
                <Button 
                  variant="light" 
                  onPress={() => {
                    resetForm();
                    onCreateGroupOpenChange();
                  }}
                >
                  取消
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 编辑分组模态框 */}
      <Modal 
        isOpen={isEditGroupOpen} 
        onOpenChange={onEditGroupOpenChange}
        size="lg"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>编辑分组</ModalHeader>
              <ModalBody>
                <Box className="space-y-4">
                  <Input
                    label="分组名称"
                    placeholder="输入分组名称"
                    value={groupForm.name}
                    onValueChange={(value) => setGroupForm({...groupForm, name: value})}
                  />
                  
                  <Select
                    label="分组类型"
                    placeholder="选择分组类型"
                    className="w-full"
                    selectedKeys={selectedGroupType}
                    onSelectionChange={(keys) => {
                      const key = Array.from(keys)[0] as string;
                      setSelectedGroupType(new Set([key]));
                      setGroupForm(prev => ({ ...prev, type: key as "single" | "double" | "intranet" | "custom" }));
                      // 清空已选择的隧道
                      setSelectedTunnels(new Set());
                      setGroupForm(prev => ({ ...prev, tunnelIds: [] }));
                    }}
                  >
                    <SelectItem key="single">单端转发</SelectItem>
                    <SelectItem key="double">双端转发</SelectItem>
                    <SelectItem key="intranet">内网穿透</SelectItem>
                  </Select>

                  {groupForm.type === "single" && (
                    <Select
                      label="选择客户端隧道"
                      placeholder="请选择1个客户端隧道"
                      className="w-full"
                      selectedKeys={selectedTunnels}
                      onSelectionChange={(keys) => {
                        const keysArray = Array.from(keys) as string[];
                        if (keysArray.length <= 1) {
                          setSelectedTunnels(new Set(keysArray));
                          setGroupForm(prev => ({ ...prev, tunnelIds: keysArray }));
                        }
                      }}
                    >
                      {getClientTunnels().map(tunnel => (
                        <SelectItem key={tunnel.id} description={`${tunnel.tunnelAddress}:${tunnel.tunnelPort} - ${tunnel.status.text}`}>
                          {tunnel.name}
                        </SelectItem>
                      ))}
                    </Select>
                  )}

                  {(groupForm.type === "double" || groupForm.type === "intranet") && (
                    <>
                      <Select
                        label="选择客户端隧道"
                        placeholder="请选择1个客户端隧道"
                        className="w-full"
                        selectedKeys={selectedTunnels.size > 0 ? new Set([Array.from(selectedTunnels)[0]]) : new Set()}
                        onSelectionChange={(keys) => {
                          const clientTunnelId = Array.from(keys)[0] as string;
                          if (clientTunnelId) {
                            const currentSelected = Array.from(selectedTunnels);
                            const serverTunnel = currentSelected.find(id => 
                              getServerTunnels().some(t => t.id === id)
                            );
                            const newSelection = serverTunnel ? [clientTunnelId, serverTunnel] : [clientTunnelId];
                            setSelectedTunnels(new Set(newSelection));
                            setGroupForm(prev => ({ ...prev, tunnelIds: newSelection }));
                          }
                        }}
                      >
                        {getClientTunnels().map(tunnel => (
                          <SelectItem key={tunnel.id} description={`${tunnel.tunnelAddress}:${tunnel.tunnelPort} - ${tunnel.status.text}`}>
                            {tunnel.name}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label="选择服务端隧道"
                        placeholder="请选择1个服务端隧道"
                        className="w-full"
                        selectedKeys={selectedTunnels.size > 1 ? new Set([Array.from(selectedTunnels)[1]]) : 
                                    selectedTunnels.size === 1 && getServerTunnels().some(t => t.id === Array.from(selectedTunnels)[0]) ? 
                                    new Set([Array.from(selectedTunnels)[0]]) : new Set()}
                        onSelectionChange={(keys) => {
                          const serverTunnelId = Array.from(keys)[0] as string;
                          if (serverTunnelId) {
                            const currentSelected = Array.from(selectedTunnels);
                            const clientTunnel = currentSelected.find(id => 
                              getClientTunnels().some(t => t.id === id)
                            );
                            const newSelection = clientTunnel ? [clientTunnel, serverTunnelId] : [serverTunnelId];
                            setSelectedTunnels(new Set(newSelection));
                            setGroupForm(prev => ({ ...prev, tunnelIds: newSelection }));
                          }
                        }}
                      >
                        {getServerTunnels().map(tunnel => (
                          <SelectItem key={tunnel.id} description={`${tunnel.tunnelAddress}:${tunnel.tunnelPort} - ${tunnel.status.text}`}>
                            {tunnel.name}
                          </SelectItem>
                        ))}
                      </Select>
                    </>
                  )}

                </Box>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="primary" 
                  onPress={handleUpdateGroup}
                >
                  更新分组
                </Button>
                <Button 
                  variant="light" 
                  onPress={() => {
                    resetForm();
                    onEditGroupOpenChange();
                  }}
                >
                  取消
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Box>
  );
} 