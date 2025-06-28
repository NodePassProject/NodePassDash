"use client";

import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHammer } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';

interface Endpoint {
  id: string;
  name: string;
}

interface ManualCreateTunnelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * 手搓创建实例模态框（与主控管理页面相同的简单表单）
 */
export default function ManualCreateTunnelModal({ 
  isOpen, 
  onOpenChange, 
  onSaved 
}: ManualCreateTunnelModalProps) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // 表单数据
  const [formData, setFormData] = useState({
    endpointId: "",
    tunnelName: "",
    tunnelUrl: ""
  });

  // 当打开时加载端点
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchEndpoints = async () => {
      try {
        setLoading(true);
        const response = await fetch(buildApiUrl("/api/endpoints/simple?excludeFailed=true"));
        const data = await response.json();
        setEndpoints(data);
        
        // 如果有主控，默认选择第一个
        if (data.length > 0) {
          setFormData(prev => ({ ...prev, endpointId: String(data[0].id) }));
        }
      } catch (err) {
        addToast({ 
          title: "获取主控失败", 
          description: "无法获取主控列表", 
          color: "danger" 
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchEndpoints();
  }, [isOpen]);

  // 重置表单
  const resetForm = () => {
    setFormData({
      endpointId: "",
      tunnelName: "",
      tunnelUrl: ""
    });
  };

  // 处理字段变化
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!formData.endpointId.trim()) {
      addToast({
        title: "创建失败",
        description: "请选择主控服务器",
        color: "warning"
      });
      return;
    }

    if (!formData.tunnelName.trim()) {
      addToast({
        title: "创建失败", 
        description: "请输入实例名称",
        color: "warning"
      });
      return;
    }

    if (!formData.tunnelUrl.trim()) {
      addToast({
        title: "创建失败",
        description: "请输入实例URL",
        color: "warning"
      });
      return;
    }

    try {
      setSubmitting(true);
      
      const response = await fetch(buildApiUrl(`/api/tunnels/quick`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpointId: Number(formData.endpointId),
          name: formData.tunnelName.trim(),
          url: formData.tunnelUrl.trim()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '创建实例失败');
      }

      addToast({
        title: "创建成功",
        description: `实例 "${formData.tunnelName}" 已成功创建`,
        color: "success",
      });

      // 重置表单并关闭弹窗
      resetForm();
      onOpenChange(false);
      
      // 调用回调函数刷新列表
      if (onSaved) onSaved();

    } catch (error) {
      console.error('创建实例失败:', error);
      addToast({
        title: "创建失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange} 
      placement="center" 
      size="lg"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <FontAwesomeIcon icon={faHammer} className="text-warning" />
              手搓创建实例
            </ModalHeader>
            <ModalBody >
              {loading ? (
                <div className="flex justify-center items-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  {/* 主控选择 */}
                  <Select
                    label="选择主控"
                    placeholder="请选择要使用的主控服务器"
                    variant="bordered"
                    selectedKeys={formData.endpointId ? [formData.endpointId] : []}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;
                      handleFieldChange('endpointId', selected);
                    }}
                    isRequired
                  >
                    {endpoints.map((endpoint) => (
                      <SelectItem key={endpoint.id}>
                        {endpoint.name}
                      </SelectItem>
                    ))}
                  </Select>

                  {/* 实例名称 */}
                  <Input
                    label="实例名称"
                    placeholder="请输入实例名称"
                    variant="bordered"
                    value={formData.tunnelName}
                    onValueChange={(value) => handleFieldChange('tunnelName', value)}
                    isRequired
                  />

                  {/* 实例URL */}
                  <Input
                    label="实例URL"
                    placeholder="<core>://<tunnel_addr>/<target_addr>"
                    variant="bordered"
                    value={formData.tunnelUrl}
                    onValueChange={(value) => handleFieldChange('tunnelUrl', value)}
                    isRequired
                  />
                </>
              )}
            </ModalBody>
            <ModalFooter>
              <Button 
                color="default" 
                variant="light" 
                onPress={() => {
                  resetForm();
                  onClose();
                }}
                isDisabled={submitting}
              >
                取消
              </Button>
              <Button 
                color="primary" 
                onPress={handleSubmit}
                isLoading={submitting}
                isDisabled={loading}
              >
                创建实例
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 