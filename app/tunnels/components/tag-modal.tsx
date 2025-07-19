"use client";

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Input,
  Select,
  SelectItem,
  Chip,
  Spinner,
  useDisclosure,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faPlus, faTimes } from "@fortawesome/free-solid-svg-icons";
import React, { useState, useEffect } from 'react';
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface TagModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentTag?: Tag | null;
  onSaved: () => void;
}

export default function TagModal({ 
  isOpen, 
  onOpenChange, 
  tunnelId, 
  currentTag, 
  onSaved 
}: TagModalProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string>("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // 获取所有标签
  const fetchTags = async () => {
    try {
      setTagsLoading(true);
      const response = await fetch(buildApiUrl('/api/tags'));
      if (!response.ok) throw new Error('获取标签列表失败');
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error('获取标签列表失败:', error);
      addToast({
        title: '错误',
        description: '获取标签列表失败',
        color: 'danger'
      });
    } finally {
      setTagsLoading(false);
    }
  };

  // 创建新标签
  const createTag = async () => {
    if (!newTagName.trim()) {
      addToast({
        title: '错误',
        description: '请输入标签名称',
        color: 'danger'
      });
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/api/tags'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: '#0072F5' // 默认颜色
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '创建标签失败');
      }

      const data = await response.json();
      addToast({
        title: '成功',
        description: '标签创建成功',
        color: 'success'
      });

      // 重新获取标签列表
      await fetchTags();
      setNewTagName("");
      setIsCreatingNew(false);
    } catch (error) {
      console.error('创建标签失败:', error);
      addToast({
        title: '错误',
        description: error instanceof Error ? error.message : '创建标签失败',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  // 分配标签到隧道
  const assignTag = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}/tag`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tunnelId: parseInt(tunnelId),
          tagId: selectedTagId ? parseInt(selectedTagId) : undefined
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '分配标签失败');
      }

      addToast({
        title: '成功',
        description: selectedTagId ? '标签分配成功' : '标签已清除',
        color: 'success'
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('分配标签失败:', error);
      addToast({
        title: '错误',
        description: error instanceof Error ? error.message : '分配标签失败',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  // 清除标签
  const clearTag = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}/tag`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tunnelId: parseInt(tunnelId),
          tagId: undefined
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '清除标签失败');
      }

      addToast({
        title: '成功',
        description: '标签已清除',
        color: 'success'
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('清除标签失败:', error);
      addToast({
        title: '错误',
        description: error instanceof Error ? error.message : '清除标签失败',
        color: 'danger'
      });
    } finally {
      setLoading(false);
    }
  };

  // 当模态框打开时获取标签列表
  useEffect(() => {
    if (isOpen) {
      fetchTags();
      // 设置当前选中的标签
      if (currentTag) {
        setSelectedTagId(currentTag.id.toString());
      } else {
        setSelectedTagId("");
      }
    }
  }, [isOpen, currentTag]);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faTag} className="text-primary" />
                设置标签
              </div>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                {/* 当前标签显示 */}
                {currentTag && (
                  <div className="space-y-2">
                    <p className="text-sm text-default-600">当前标签:</p>
                    <Chip 
                      color="primary" 
                      variant="flat"
                      style={{ backgroundColor: currentTag.color }}
                    >
                      {currentTag.name}
                    </Chip>
                  </div>
                )}

                {/* 选择现有标签 */}
                <div className="space-y-2">
                  <p className="text-sm text-default-600">选择标签:</p>
                  {tagsLoading ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      <span className="text-sm text-default-500">加载中...</span>
                    </div>
                  ) : (
                    <Select
                      placeholder="选择标签"
                      selectedKeys={selectedTagId ? [selectedTagId] : []}
                      onSelectionChange={(keys) => {
                        const value = Array.from(keys)[0] as string;
                        setSelectedTagId(value);
                      }}
                      isDisabled={loading}
                    >
                                             {tags.map((tag) => (
                         <SelectItem key={tag.id.toString()}>
                           <div className="flex items-center gap-2">
                             <div 
                               className="w-3 h-3 rounded-full" 
                               style={{ backgroundColor: tag.color }}
                             />
                             {tag.name}
                           </div>
                         </SelectItem>
                       ))}
                    </Select>
                  )}
                </div>

                {/* 创建新标签 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-default-600">创建新标签:</p>
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => setIsCreatingNew(!isCreatingNew)}
                      startContent={<FontAwesomeIcon icon={isCreatingNew ? faTimes : faPlus} />}
                    >
                      {isCreatingNew ? '取消' : '新建'}
                    </Button>
                  </div>
                  {isCreatingNew && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入标签名称"
                        value={newTagName}
                        onValueChange={setNewTagName}
                        isDisabled={loading}
                        className="flex-1"
                      />
                      <Button
                        color="primary"
                        onPress={createTag}
                        isLoading={loading}
                        isDisabled={!newTagName.trim()}
                      >
                        创建
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button 
                color="default" 
                variant="light" 
                onPress={onClose}
                isDisabled={loading}
              >
                取消
              </Button>
              {currentTag && (
                <Button 
                  color="danger" 
                  variant="flat"
                  onPress={clearTag}
                  isLoading={loading}
                >
                  清除标签
                </Button>
              )}
              <Button 
                color="primary" 
                onPress={assignTag}
                isLoading={loading}
                isDisabled={!selectedTagId && !currentTag}
              >
                确认
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 