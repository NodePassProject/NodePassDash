import React, { useState, useEffect } from "react";
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
  Listbox,
  ListboxItem,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHammer, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

interface Endpoint {
  id: string;
  name: string;
}

interface TunnelRule {
  id: string;
  endpointId: string;
  name: string;
  url: string;
}

interface BatchUrlCreateTunnelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * 批量URL创建实例模态框（与主控管理页面相同的简单表单）
 */
export default function BatchUrlCreateTunnelModal({
  isOpen,
  onOpenChange,
  onSaved,
}: BatchUrlCreateTunnelModalProps) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 隧道规则列表
  const [tunnelRules, setTunnelRules] = useState<TunnelRule[]>([]);

  // 当打开时加载端点
  useEffect(() => {
    if (!isOpen) return;

    const fetchEndpoints = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          buildApiUrl("/api/endpoints/simple?excludeFailed=true"),
        );
        const data = await response.json();

        setEndpoints(data);
      } catch (err) {
        addToast({
          title: "获取主控失败",
          description: "无法获取主控列表",
          color: "danger",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEndpoints();
    resetForm();
  }, [isOpen]);

  // 重置表单
  const resetForm = () => {
    setTunnelRules([]);
  };

  // 添加新规则
  const addNewRule = () => {
    const newRule: TunnelRule = {
      id: `rule-${Date.now()}`,
      endpointId: endpoints.length > 0 ? endpoints[0].id : "",
      name: "",
      url: "",
    };

    setTunnelRules((prev) => [...prev, newRule]);
  };

  // 删除规则
  const removeRule = (ruleId: string) => {
    setTunnelRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  // 更新规则
  const updateRule = (
    ruleId: string,
    field: keyof TunnelRule,
    value: string,
  ) => {
    setTunnelRules((prev) =>
      prev.map((rule) =>
        rule.id === ruleId ? { ...rule, [field]: value } : rule,
      ),
    );
  };

  // 提交表单
  const handleSubmit = async () => {
    if (tunnelRules.length === 0) {
      addToast({
        title: "创建失败",
        description: "请添加至少一条隧道",
        color: "warning",
      });

      return;
    }

    // 验证所有规则的完整性
    for (let i = 0; i < tunnelRules.length; i++) {
      const rule = tunnelRules[i];

      if (!rule.endpointId) {
        addToast({
          title: "创建失败",
          description: `第 ${i + 1} 条规则请选择主控服务器`,
          color: "warning",
        });

        return;
      }
      if (!rule.name.trim()) {
        addToast({
          title: "创建失败",
          description: `第 ${i + 1} 条规则请输入实例名称`,
          color: "warning",
        });

        return;
      }
      if (!rule.url.trim()) {
        addToast({
          title: "创建失败",
          description: `第 ${i + 1} 条规则请输入实例URL`,
          color: "warning",
        });

        return;
      }
    }

    try {
      setSubmitting(true);

      // 调用新的批量创建接口
      const response = await fetch(buildApiUrl(`/api/tunnels/quick-batch`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rules: tunnelRules.map((rule) => ({
            endpointId: Number(rule.endpointId),
            name: rule.name.trim(),
            url: rule.url.trim(),
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.message || "创建实例失败");
      }

      const result = await response.json();

      addToast({
        title: "创建成功",
        description: result.message || `成功创建 ${tunnelRules.length} 个实例`,
        color: "success",
      });

      // 重置表单并关闭弹窗
      resetForm();
      onOpenChange(false);

      // 调用回调函数刷新列表
      if (onSaved) onSaved();
    } catch (error) {
      console.error("创建实例失败:", error);
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
      placement="center"
      scrollBehavior="inside"
      size="5xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center justify-start gap-2">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-warning" icon={faHammer} />
                批量URL创建实例
              </div>
              <Button
                color="primary"
                isDisabled={loading}
                size="sm"
                startContent={
                  <FontAwesomeIcon className="text-xs" icon={faPlus} />
                }
                variant="flat"
                onClick={addNewRule}
              >
                添加
              </Button>
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center items-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 隧道规则区域 */}
                  <div className="space-y-3">
                    {tunnelRules.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-default-200 rounded-lg">
                        <p className="text-default-500 text-sm">
                          暂无隧道规则，点击右上角"添加规则"开始配置
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto border border-default-200 rounded-lg">
                        <Listbox
                          aria-label="隧道规则列表"
                          className="p-0"
                          selectionMode="none"
                          variant="flat"
                        >
                          {tunnelRules.map((rule, index) => (
                            <ListboxItem
                              key={rule.id}
                              className="py-2"
                              textValue={`规则 ${index + 1}`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-default-600 min-w-fit">
                                  #{index + 1}
                                </span>
                                <div className="flex-1 grid grid-cols-8 gap-3">
                                  {/* 主控选择 */}
                                  <div className="col-span-2">
                                    <Select
                                      isRequired
                                      placeholder="选择主控"
                                      selectedKeys={
                                        rule.endpointId ? [rule.endpointId] : []
                                      }
                                      size="sm"
                                      variant="bordered"
                                      onSelectionChange={(keys) => {
                                        const selected = Array.from(
                                          keys,
                                        )[0] as string;

                                        updateRule(
                                          rule.id,
                                          "endpointId",
                                          selected,
                                        );
                                      }}
                                    >
                                      {endpoints.map((endpoint) => (
                                        <SelectItem key={endpoint.id}>
                                          {endpoint.name}
                                        </SelectItem>
                                      ))}
                                    </Select>
                                  </div>

                                  {/* 隧道名称 */}
                                  <div className="col-span-2">
                                    <Input
                                      placeholder="隧道名称"
                                      size="sm"
                                      value={rule.name}
                                      variant="bordered"
                                      onValueChange={(value) =>
                                        updateRule(rule.id, "name", value)
                                      }
                                    />
                                  </div>

                                  {/* 隧道URL */}
                                  <div className="col-span-4">
                                    <Input
                                      className="font-mono"
                                      placeholder="<core>://<tunnel_addr>/<target_addr>"
                                      size="sm"
                                      value={rule.url}
                                      variant="bordered"
                                      onValueChange={(value) =>
                                        updateRule(rule.id, "url", value)
                                      }
                                    />
                                  </div>
                                </div>
                                <Button
                                  isIconOnly
                                  color="danger"
                                  size="sm"
                                  variant="light"
                                  onClick={() => removeRule(rule.id)}
                                >
                                  <FontAwesomeIcon
                                    className="text-xs"
                                    icon={faTrash}
                                  />
                                </Button>
                              </div>
                            </ListboxItem>
                          ))}
                        </Listbox>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                isDisabled={submitting}
                variant="light"
                onPress={() => {
                  resetForm();
                  onClose();
                }}
              >
                取消
              </Button>
              <Button
                color="primary"
                isDisabled={loading || tunnelRules.length === 0}
                isLoading={submitting}
                startContent={
                  !submitting ? <FontAwesomeIcon icon={faHammer} /> : null
                }
                onPress={handleSubmit}
              >
                {submitting ? "创建中..." : `批量创建 (${tunnelRules.length})`}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
