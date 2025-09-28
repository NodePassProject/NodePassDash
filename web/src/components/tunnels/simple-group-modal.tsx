"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faTimes } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

// 分组类型
interface Group {
  id: number;
  name: string;
}

interface SimpleGroupModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentGroup?: Group | null;
  onSaved: () => void;
}

export default function SimpleGroupModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentGroup,
  onSaved,
}: SimpleGroupModalProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    currentGroup?.id || null,
  );

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

  // 保存分组设置
  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/groups`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tunnelId: parseInt(tunnelId),
            groupId: selectedGroupId || 0,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "设置分组失败");
      }

      addToast({
        title: "成功",
        description: "分组设置成功",
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("设置分组失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "设置分组失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 清除分组
  const handleClear = async () => {
    try {
      setSaving(true);
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/groups`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tunnelId: parseInt(tunnelId),
            groupId: 0,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "清除分组失败");
      }

      addToast({
        title: "成功",
        description: "分组已清除",
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("清除分组失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "清除分组失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 模态框打开时获取数据并设置当前选中的分组
  useEffect(() => {
    if (isOpen) {
      fetchGroups();
      setSelectedGroupId(currentGroup?.id || null);
    }
  }, [isOpen, currentGroup]);

  return (
    <Modal isOpen={isOpen} size="md" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faTag} />
                设置分组
              </div>
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-default-600">
                    为当前实例选择一个分组，或选择"无分组"来清除现有分组
                  </p>

                  {/* 无分组选项 */}
                  <div
                    className="flex items-center gap-3 p-3 border border-default-200 rounded-lg hover:bg-default-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedGroupId(null)}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 ${selectedGroupId === null ? "border-primary bg-primary" : "border-default-300"}`}
                    />
                    <span className="text-sm">无分组</span>
                  </div>

                  {/* 分组列表 */}
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center gap-3 p-3 border border-default-200 rounded-lg hover:bg-default-50 cursor-pointer transition-colors"
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border-2 ${selectedGroupId === group.id ? "border-primary bg-primary" : "border-default-300"}`}
                        />
                        <span className="text-sm">{group.name}</span>
                      </div>
                    ))}
                  </div>

                  {groups.length === 0 && (
                    <div className="text-center py-4">
                      <div className="flex flex-col items-center gap-2">
                        <FontAwesomeIcon
                          className="text-xl text-default-400"
                          icon={faTag}
                        />
                        <p className="text-sm text-default-500">暂无可用分组</p>
                        <p className="text-xs text-default-400">
                          请先在分组管理中创建分组
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                isDisabled={saving}
                variant="light"
                onPress={onClose}
              >
                取消
              </Button>
              {currentGroup && (
                <Button
                  color="danger"
                  isLoading={saving}
                  startContent={<FontAwesomeIcon icon={faTimes} />}
                  variant="light"
                  onPress={handleClear}
                >
                  清除分组
                </Button>
              )}
              <Button
                color="primary"
                isDisabled={selectedGroupId === (currentGroup?.id || null)}
                isLoading={saving}
                onPress={handleSave}
              >
                保存
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
