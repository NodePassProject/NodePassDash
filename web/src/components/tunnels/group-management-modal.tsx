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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("tunnels");
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

      if (!response.ok) throw new Error(t("groupManagement.toast.fetchFailedDesc"));
      const data = await response.json();

      setGroups(data.groups || []);
    } catch (error) {
      console.error(t("groupManagement.toast.fetchFailedDesc") + ":", error);
      addToast({
        title: t("groupManagement.toast.fetchFailed"),
        description: t("groupManagement.toast.fetchFailedDesc"),
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
        title: t("groupManagement.toast.nameRequired"),
        description: t("groupManagement.toast.nameRequiredDesc"),
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

        throw new Error(error.message || t("groupManagement.toast.createFailedDesc"));
      }

      addToast({
        title: t("groupManagement.toast.createSuccess"),
        description: t("groupManagement.toast.createSuccessDesc"),
        color: "success",
      });

      setNewGroupName("");
      setShowAddForm(false);
      fetchGroups();
      onSaved(); // 通知父组件刷新分组列表
    } catch (error) {
      console.error(t("groupManagement.toast.createFailedDesc") + ":", error);
      addToast({
        title: t("groupManagement.toast.createFailed"),
        description: error instanceof Error ? error.message : t("groupManagement.toast.createFailedDesc"),
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
        title: t("groupManagement.toast.nameRequired"),
        description: t("groupManagement.toast.nameRequiredDesc"),
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

        throw new Error(error.message || t("groupManagement.toast.updateFailedDesc"));
      }

      addToast({
        title: t("groupManagement.toast.updateSuccess"),
        description: t("groupManagement.toast.updateSuccessDesc"),
        color: "success",
      });

      setEditingGroup(null);
      setEditName("");
      fetchGroups();
      onSaved(); // 通知父组件刷新分组列表
    } catch (error) {
      console.error(t("groupManagement.toast.updateFailedDesc") + ":", error);
      addToast({
        title: t("groupManagement.toast.updateFailed"),
        description: error instanceof Error ? error.message : t("groupManagement.toast.updateFailedDesc"),
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
    if (!confirm(t("groupManagement.confirmDelete", { name: group.name }))) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(buildApiUrl(`/api/groups/${group.id}`), {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || t("groupManagement.toast.deleteFailedDesc"));
      }

      addToast({
        title: t("groupManagement.toast.deleteSuccess"),
        description: t("groupManagement.toast.deleteSuccessDesc"),
        color: "success",
      });

      fetchGroups();
      onSaved(); // 通知父组件刷新分组列表
    } catch (error) {
      console.error(t("groupManagement.toast.deleteFailedDesc") + ":", error);
      addToast({
        title: t("groupManagement.toast.deleteFailed"),
        description: error instanceof Error ? error.message : t("groupManagement.toast.deleteFailedDesc"),
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
                {t("groupManagement.title")}
              </div>
              <Button
                color="primary"
                size="sm"
                startContent={<FontAwesomeIcon icon={faPlus} />}
                variant="flat"
                onClick={() => setShowAddForm(true)}
              >
                {t("groupManagement.addButton")}
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
                    label={t("groupManagement.addForm.groupName")}
                    placeholder={t("groupManagement.addForm.placeholder")}
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
                    {t("groupManagement.addForm.save")}
                  </Button>
                  <Button
                    color="default"
                    variant="light"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewGroupName("");
                    }}
                  >
                    {t("groupManagement.addForm.cancel")}
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
              <Table aria-label={t("groupManagement.title")} shadow="none">
                <TableHeader>
                  <TableColumn>{t("groupManagement.table.groupName")}</TableColumn>
                  <TableColumn>{t("groupManagement.table.actions")}</TableColumn>
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
                              {t("groupManagement.addForm.save")}
                            </Button>
                            <Button
                              color="default"
                              size="sm"
                              variant="light"
                              onClick={handleCancelEdit}
                            >
                              {t("groupManagement.addForm.cancel")}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Tooltip content={t("groupManagement.actions.bindInstances")} size="sm">
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
                            <Tooltip content={t("groupManagement.actions.edit")} size="sm">
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
                            <Tooltip content={t("groupManagement.actions.delete")} size="sm">
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
                      {t("groupManagement.empty.title")}
                    </p>
                    <p className="text-default-400 text-xs">
                      {t("groupManagement.empty.description")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button color="default" variant="light" onPress={handleClose}>
              {t("groupManagement.close")}
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
