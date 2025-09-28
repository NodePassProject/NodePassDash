import React, { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Spinner,
  Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTrash,
  faPen,
  faTag,
  faLink,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import GroupInstancesModal from "./group-instances-modal";

import { buildApiUrl } from "@/lib/utils";

// 分组类型
interface Group {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  tunnelIds?: number[]; // 绑定的隧道ID列表
}

interface GroupManagementModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function GroupManagementModal({
  isOpen,
  onOpenChange,
  onSaved,
}: GroupManagementModalProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 编辑状态
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState("");

  // 新增状态
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // 设置实例状态
  const [instanceModalOpen, setInstanceModalOpen] = useState(false);
  const [selectedGroupForInstances, setSelectedGroupForInstances] =
    useState<Group | null>(null);

  // 获取分组列表
  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl("/api/groups"));

      if (!response.ok) throw new Error("获取分组列表失败");
      const data = await response.json();

      setGroups(data.groups || []);
    } catch (error) {
      console.error("获取分组列表失败:", error);
      addToast({
        title: "错误",
        description: "获取分组列表失败",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  // 创建分组
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      addToast({
        title: "错误",
        description: "请输入分组名称",
        color: "danger",
      });

      return;
    }

    try {
      setSaving(true);
      const response = await fetch(buildApiUrl("/api/groups"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "创建分组失败");
      }

      addToast({
        title: "成功",
        description: "分组创建成功",
        color: "success",
      });

      setNewGroupName("");
      setShowAddForm(false);
      fetchGroups();
      onSaved(); // 通知父组件刷新分组列表
    } catch (error) {
      console.error("创建分组失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "创建分组失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 开始编辑
  const handleEdit = (group: Group) => {
    setEditingGroup(group);
    setEditName(group.name);
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingGroup || !editName.trim()) {
      addToast({
        title: "错误",
        description: "请输入分组名称",
        color: "danger",
      });

      return;
    }

    try {
      setSaving(true);
      const response = await fetch(
        buildApiUrl(`/api/groups/${editingGroup.id}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName.trim(),
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "更新分组失败");
      }

      addToast({
        title: "成功",
        description: "分组更新成功",
        color: "success",
      });

      setEditingGroup(null);
      setEditName("");
      fetchGroups();
      onSaved(); // 通知父组件刷新分组列表
    } catch (error) {
      console.error("更新分组失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "更新分组失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingGroup(null);
    setEditName("");
  };

  // 删除分组
  const handleDelete = async (group: Group) => {
    if (!confirm(`确定要删除分组 "${group.name}" 吗？`)) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(buildApiUrl(`/api/groups/${group.id}`), {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "删除分组失败");
      }

      addToast({
        title: "成功",
        description: "分组删除成功",
        color: "success",
      });

      fetchGroups();
      onSaved(); // 通知父组件刷新分组列表
    } catch (error) {
      console.error("删除分组失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "删除分组失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 打开设置实例模态框
  const handleSetInstances = (group: Group) => {
    setSelectedGroupForInstances(group);
    setInstanceModalOpen(true);
  };

  // 模态框关闭时重置状态
  const handleClose = () => {
    setEditingGroup(null);
    setEditName("");
    setNewGroupName("");
    setShowAddForm(false);
    onOpenChange(false);
  };

  // 模态框打开时获取数据
  useEffect(() => {
    if (isOpen) {
      fetchGroups();
    }
  }, [isOpen]);

  return (
    <Drawer
      hideCloseButton={true}
      isOpen={isOpen}
      placement="right"
      size="lg"
      onOpenChange={handleClose}
    >
      <DrawerContent>
        <>
          <DrawerHeader className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faTag} />
                分组管理
              </div>
              <Button
                color="primary"
                size="sm"
                startContent={<FontAwesomeIcon icon={faPlus} />}
                variant="flat"
                onClick={() => setShowAddForm(true)}
              >
                添加
              </Button>
            </div>
          </DrawerHeader>
          <DrawerBody>
            {/* 添加新分组区域 */}
            {showAddForm && (
              <div className="mb-6 p-4 border border-default-200 rounded-lg bg-default-50">
                <div className="flex items-center gap-4 mb-4">
                  <Input
                    className="flex-1"
                    label="分组名称"
                    placeholder="请输入分组名称"
                    value={newGroupName}
                    onValueChange={setNewGroupName}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    color="primary"
                    isDisabled={!newGroupName.trim()}
                    isLoading={saving}
                    onClick={handleCreateGroup}
                  >
                    保存
                  </Button>
                  <Button
                    color="default"
                    variant="light"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewGroupName("");
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}

            {/* 分组列表 */}
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Spinner size="lg" />
              </div>
            ) : (
              <Table aria-label="分组列表" shadow="none">
                <TableHeader>
                  <TableColumn>分组名称</TableColumn>
                  <TableColumn>操作</TableColumn>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        {editingGroup?.id === group.id ? (
                          <div className="flex items-center gap-4">
                            <Input
                              className="flex-1"
                              size="sm"
                              value={editName}
                              onValueChange={setEditName}
                            />
                          </div>
                        ) : (
                          <span className="text-sm">{group.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingGroup?.id === group.id ? (
                          <div className="flex gap-2">
                            <Button
                              color="primary"
                              isLoading={saving}
                              size="sm"
                              onClick={handleSaveEdit}
                            >
                              保存
                            </Button>
                            <Button
                              color="default"
                              size="sm"
                              variant="light"
                              onClick={handleCancelEdit}
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Tooltip content="绑定实例" size="sm">
                              <Button
                                isIconOnly
                                color="secondary"
                                size="sm"
                                variant="light"
                                onClick={() => handleSetInstances(group)}
                              >
                                <FontAwesomeIcon
                                  className="text-xs"
                                  icon={faLink}
                                />
                              </Button>
                            </Tooltip>
                            <Tooltip content="编辑分组" size="sm">
                              <Button
                                isIconOnly
                                color="primary"
                                size="sm"
                                variant="light"
                                onClick={() => handleEdit(group)}
                              >
                                <FontAwesomeIcon
                                  className="text-xs"
                                  icon={faPen}
                                />
                              </Button>
                            </Tooltip>
                            <Tooltip content="删除分组" size="sm">
                              <Button
                                isIconOnly
                                color="danger"
                                size="sm"
                                variant="light"
                                onClick={() => handleDelete(group)}
                              >
                                <FontAwesomeIcon
                                  className="text-xs"
                                  icon={faTrash}
                                />
                              </Button>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!loading && groups.length === 0 && (
              <div className="text-center py-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center">
                    <FontAwesomeIcon
                      className="text-2xl text-default-400"
                      icon={faTag}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-default-500 text-sm font-medium">
                      暂无分组
                    </p>
                    <p className="text-default-400 text-xs">
                      点击上方按钮创建第一个分组
                    </p>
                  </div>
                </div>
              </div>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button color="default" variant="light" onPress={handleClose}>
              关闭
            </Button>
          </DrawerFooter>
        </>
      </DrawerContent>

      {/* 设置实例模态框 */}
      <GroupInstancesModal
        group={selectedGroupForInstances}
        isOpen={instanceModalOpen}
        onOpenChange={setInstanceModalOpen}
        onSaved={() => {
          fetchGroups();
          onSaved();
        }}
      />
    </Drawer>
  );
}
