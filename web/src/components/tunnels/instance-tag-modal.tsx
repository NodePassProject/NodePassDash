"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Divider,
  Chip,
  Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTag,
  faPlus,
  faTrash,
  faSave,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

// 实例标签类型
interface InstanceTag {
  key: string;
  value: string;
}

interface InstanceTagModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentTags?: InstanceTag[];
  onSaved: () => void;
}

export default function InstanceTagModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentTags = [],
  onSaved,
}: InstanceTagModalProps) {
  const [tags, setTags] = useState<InstanceTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [newTagKey, setNewTagKey] = useState("");
  const [newTagValue, setNewTagValue] = useState("");

  // 初始化标签数据
  useEffect(() => {
    if (isOpen) {
      setTags([...currentTags]);
      setNewTagKey("");
      setNewTagValue("");
    }
  }, [isOpen, currentTags]);

  // 添加新标签
  const handleAddTag = () => {
    if (!newTagKey.trim() || !newTagValue.trim()) {
      addToast({
        title: "错误",
        description: "请输入标签键和值",
        color: "danger",
      });
      return;
    }

    // 检查是否已存在相同的键
    if (tags.some(tag => tag.key === newTagKey.trim())) {
      addToast({
        title: "错误",
        description: "标签键已存在",
        color: "danger",
      });
      return;
    }

    setTags([...tags, { key: newTagKey.trim(), value: newTagValue.trim() }]);
    setNewTagKey("");
    setNewTagValue("");
  };

  // 删除标签
  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  // 更新标签
  const handleUpdateTag = (index: number, key: string, value: string) => {
    const updatedTags = [...tags];
    updatedTags[index] = { key: key.trim(), value: value.trim() };
    setTags(updatedTags);
  };

  // 保存标签设置
  const handleSave = async () => {
    try {
      setSaving(true);

      // 验证标签格式
      for (const tag of tags) {
        if (!tag.key.trim() || !tag.value.trim()) {
          addToast({
            title: "错误",
            description: "所有标签键和值都不能为空",
            color: "danger",
          });
          return;
        }
      }

      // 检查重复的键
      const keys = tags.map(tag => tag.key);
      const uniqueKeys = new Set(keys);
      if (keys.length !== uniqueKeys.size) {
        addToast({
          title: "错误",
          description: "标签键不能重复",
          color: "danger",
        });
        return;
      }

      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/instance-tags`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tags: tags,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "设置实例标签失败");
      }

      addToast({
        title: "成功",
        description: "实例标签设置成功",
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("设置实例标签失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "设置实例标签失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 检查是否有变化
  const hasChanges = () => {
    if (tags.length !== currentTags.length) return true;

    return tags.some((tag, index) => {
      const currentTag = currentTags[index];
      return !currentTag || tag.key !== currentTag.key || tag.value !== currentTag.value;
    });
  };

  return (
    <Modal isOpen={isOpen} size="lg" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faTag} />
                实例标签设置
              </div>
              <p className="text-sm text-default-600 font-normal">
                管理当前隧道实例的自定义标签（键值对）
              </p>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                {/* 现有标签列表 */}
                {tags.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-default-700">当前标签</h4>
                    {tags.map((tag, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 border border-default-200 rounded-lg">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <Input
                            size="sm"
                            label="键"
                            value={tag.key}
                            onValueChange={(value) => handleUpdateTag(index, value, tag.value)}
                          />
                          <Input
                            size="sm"
                            label="值"
                            value={tag.value}
                            onValueChange={(value) => handleUpdateTag(index, tag.key, value)}
                          />
                        </div>
                        <Tooltip content="删除标签" size="sm">
                          <Button
                            isIconOnly
                            color="danger"
                            size="sm"
                            variant="light"
                            onClick={() => handleRemoveTag(index)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </Button>
                        </Tooltip>
                      </div>
                    ))}
                  </div>
                )}

                <Divider />

                {/* 添加新标签 */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-default-700">添加新标签</h4>
                  <div className="flex items-end gap-3">
                    <Input
                      className="flex-1"
                      size="sm"
                      label="键"
                      placeholder="例如：environment"
                      value={newTagKey}
                      onValueChange={setNewTagKey}
                    />
                    <Input
                      className="flex-1"
                      size="sm"
                      label="值"
                      placeholder="例如：production"
                      value={newTagValue}
                      onValueChange={setNewTagValue}
                    />
                    <Button
                      color="primary"
                      size="sm"
                      startContent={<FontAwesomeIcon icon={faPlus} />}
                      isDisabled={!newTagKey.trim() || !newTagValue.trim()}
                      onClick={handleAddTag}
                    >
                      添加
                    </Button>
                  </div>
                </div>

                {/* 预览区域 */}
                {tags.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-default-700">标签预览</h4>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag, index) => (
                        <Chip
                          key={index}
                          size="sm"
                          variant="flat"
                          color="primary"
                        >
                          {tag.key}: {tag.value}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {tags.length === 0 && (
                  <div className="text-center py-6">
                    <div className="flex flex-col items-center gap-2">
                      <FontAwesomeIcon
                        className="text-2xl text-default-400"
                        icon={faTag}
                      />
                      <p className="text-sm text-default-500">暂无实例标签</p>
                      <p className="text-xs text-default-400">
                        添加标签来为实例进行分类和标识
                      </p>
                    </div>
                  </div>
                )}
              </div>
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
              <Button
                color="primary"
                isDisabled={!hasChanges()}
                isLoading={saving}
                startContent={<FontAwesomeIcon icon={faSave} />}
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