"use client";

import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Chip,
  Spinner,
  Tooltip
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faTag,
  faTimes
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';

// 标签类型
interface Tag {
  id: number;
  name: string;
}

interface SimpleTagModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentTag?: Tag | null;
  onSaved: () => void;
}

export default function SimpleTagModal({ 
  isOpen, 
  onOpenChange, 
  tunnelId,
  currentTag,
  onSaved 
}: SimpleTagModalProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(currentTag?.id || null);

  // 获取标签列表
  const fetchTags = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  // 保存标签设置
  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}/tag`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tunnelId: parseInt(tunnelId),
          tagId: selectedTagId || 0
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '设置标签失败');
      }

      addToast({
        title: '成功',
        description: '标签设置成功',
        color: 'success'
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('设置标签失败:', error);
      addToast({
        title: '错误',
        description: error instanceof Error ? error.message : '设置标签失败',
        color: 'danger'
      });
    } finally {
      setSaving(false);
    }
  };

  // 清除标签
  const handleClear = async () => {
    try {
      setSaving(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}/tag`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tunnelId: parseInt(tunnelId),
          tagId: 0
        })
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
      setSaving(false);
    }
  };

  // 模态框打开时获取数据并设置当前选中的标签
  useEffect(() => {
    if (isOpen) {
      fetchTags();
      setSelectedTagId(currentTag?.id || null);
    }
  }, [isOpen, currentTag]);

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="md"
    >
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
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-default-600">
                    为当前实例选择一个标签，或选择"无标签"来清除现有标签
                  </p>
                  
                  {/* 无标签选项 */}
                  <div className="flex items-center gap-3 p-3 border border-default-200 rounded-lg hover:bg-default-50 cursor-pointer transition-colors"
                       onClick={() => setSelectedTagId(null)}>
                    <div className={`w-4 h-4 rounded-full border-2 ${selectedTagId === null ? 'border-primary bg-primary' : 'border-default-300'}`} />
                    <span className="text-sm">无标签</span>
                  </div>

                  {/* 标签列表 */}
                  <div className="space-y-2">
                    {tags.map((tag) => (
                      <div 
                        key={tag.id}
                        className="flex items-center gap-3 p-3 border border-default-200 rounded-lg hover:bg-default-50 cursor-pointer transition-colors"
                        onClick={() => setSelectedTagId(tag.id)}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 ${selectedTagId === tag.id ? 'border-primary bg-primary' : 'border-default-300'}`} />
                        <span className="text-sm">{tag.name}</span>
                      </div>
                    ))}
                  </div>

                  {tags.length === 0 && (
                    <div className="text-center py-4">
                      <div className="flex flex-col items-center gap-2">
                        <FontAwesomeIcon icon={faTag} className="text-xl text-default-400" />
                        <p className="text-sm text-default-500">暂无可用标签</p>
                        <p className="text-xs text-default-400">请先在标签管理中创建标签</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button 
                color="default" 
                variant="light" 
                onPress={onClose}
                isDisabled={saving}
              >
                取消
              </Button>
              {currentTag && (
                <Button 
                  color="danger" 
                  variant="light"
                  onPress={handleClear}
                  isLoading={saving}
                  startContent={<FontAwesomeIcon icon={faTimes} />}
                >
                  清除标签
                </Button>
              )}
              <Button 
                color="primary" 
                onPress={handleSave}
                isLoading={saving}
                isDisabled={selectedTagId === (currentTag?.id || null)}
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