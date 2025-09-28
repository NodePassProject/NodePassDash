import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Select,
  SelectItem,
  Spinner,
  Chip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLink,
  faTag,
  faCheck,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { Selection } from "@react-types/shared";

import { buildApiUrl } from "@/lib/utils";

// 实例类型定义
interface Tunnel {
  id: string;
  name: string;
  endpoint: string;
  type: "server" | "client";
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  group?: {
    id: number;
    name: string;
  };
}

// 分组类型定义
interface Group {
  id: number;
  name: string;
  tunnelIds?: number[]; // 绑定的隧道ID列表
}

interface GroupInstancesModalProps {
  isOpen: boolean;
  group: Group | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function GroupInstancesModal({
  isOpen,
  group: group,
  onOpenChange,
  onSaved,
}: GroupInstancesModalProps) {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTunnels, setSelectedTunnels] = useState<Selection>(new Set());

  // 获取所有实例列表
  const fetchTunnels = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl("/api/tunnels?page_size=1000"));

      if (!response.ok) throw new Error("获取实例列表失败");
      const result = await response.json();

      const tunnelList = result.data || [];

      setTunnels(tunnelList);

      // 设置当前分组下的实例为已选中状态
      if (group && group.tunnelIds) {
        // 使用后端返回的tunnelIds信息，转换为字符串格式（因为Select组件需要字符串key）
        const currentGroupedTunnels = group.tunnelIds.map((id) => String(id));

        setSelectedTunnels(new Set(currentGroupedTunnels));
      } else {
        setSelectedTunnels(new Set());
      }
    } catch (error) {
      console.error("获取实例列表失败:", error);
      addToast({
        title: "错误",
        description: "获取实例列表失败",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  // 保存分组设置
  const handleSave = async () => {
    if (!group) return;

    try {
      setSaving(true);

      // 获取选中的实例ID列表
      let tunnelIds: string[] = [];

      if (selectedTunnels === "all") {
        tunnelIds = tunnels.map((tunnel) => tunnel.id);
      } else {
        tunnelIds = Array.from(selectedTunnels as Set<string>);
      }

      const response = await fetch(
        buildApiUrl(`/api/groups/${group.id}/tunnels`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tunnel_ids: tunnelIds.map((id) => parseInt(id)),
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "设置实例分组失败");
      }

      addToast({
        title: "成功",
        description: `已为 ${tunnelIds.length} 个实例绑定分组"${group.name}"`,
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("设置实例分组失败:", error);
      addToast({
        title: "错误",
        description:
          error instanceof Error ? error.message : "设置实例分组失败",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 获取类型显示文本
  const getTypeDisplayText = (type: "server" | "client"): string => {
    return type === "server" ? "服务端" : "客户端";
  };

  // 获取已选择的实例数量
  const getSelectedCount = () => {
    if (selectedTunnels === "all") return tunnels.length;
    if (selectedTunnels instanceof Set) return selectedTunnels.size;

    return 0;
  };

  // 模态框打开时获取数据
  useEffect(() => {
    if (isOpen && group) {
      fetchTunnels();
    }
  }, [isOpen, group]);

  // 模态框关闭时重置状态
  const handleClose = () => {
    setSelectedTunnels(new Set());
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      placement="center"
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={handleClose}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="text-secondary" icon={faLink} />
                  {group && (
                    <>
                      分组{group.name}实例管理{" "}
                      <span className="text-sm">
                        [已选择 {getSelectedCount()} / {tunnels.length} ]
                      </span>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    onClick={() => {
                      // 确保使用字符串类型的ID，与Select组件的key保持一致
                      const allIds = tunnels.map((t) => String(t.id));

                      setSelectedTunnels(new Set(allIds));
                    }}
                  >
                    全选
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    onClick={() => setSelectedTunnels(new Set())}
                  >
                    清空
                  </Button>
                </div>
              </div>
            </ModalHeader>
            <ModalBody>
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <Spinner size="lg" />
                </div>
              ) : (
                <div className="space-y-4">
                  <Select
                    aria-label="选择实例"
                    classNames={{
                      trigger: "min-h-12",
                      listbox: "max-h-[400px] overflow-auto",
                    }}
                    disallowEmptySelection={false}
                    placeholder="选择要绑定分组的实例"
                    scrollShadowProps={{
                      isEnabled: false,
                    }}
                    selectedKeys={selectedTunnels}
                    selectionMode="multiple"
                    onSelectionChange={setSelectedTunnels}
                  >
                    {tunnels.map((tunnel) => (
                      <SelectItem
                        key={tunnel.id}
                        className="py-2"
                        textValue={tunnel.name}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {tunnel.name}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-default-500">
                              <Chip
                                color={
                                  tunnel.type === "server"
                                    ? "primary"
                                    : "secondary"
                                }
                                size="sm"
                                variant="flat"
                              >
                                {getTypeDisplayText(tunnel.type)}
                              </Chip>
                              <span>主控: {tunnel.endpoint}</span>
                              {tunnel.group &&
                                tunnel.group.id !== group?.id && (
                                  <Chip
                                    color="warning"
                                    size="sm"
                                    startContent={
                                      <FontAwesomeIcon icon={faTag} />
                                    }
                                    variant="flat"
                                  >
                                    {tunnel.group.name}
                                  </Chip>
                                )}
                            </div>
                          </div>
                          <Chip
                            color={tunnel.status.type}
                            size="sm"
                            variant="flat"
                          >
                            {tunnel.status.text}
                          </Chip>
                        </div>
                      </SelectItem>
                    ))}
                  </Select>

                  {tunnels.length === 0 && (
                    <div className="text-center py-8">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-default-100 flex items-center justify-center">
                          <FontAwesomeIcon
                            className="text-2xl text-default-400"
                            icon={faLink}
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-default-500 text-sm font-medium">
                            暂无实例
                          </p>
                          <p className="text-default-400 text-xs">
                            请先创建实例后再绑定分组
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                startContent={<FontAwesomeIcon icon={faTimes} />}
                variant="light"
                onPress={onClose}
              >
                取消
              </Button>
              <Button
                color="primary"
                isDisabled={loading}
                isLoading={saving}
                startContent={<FontAwesomeIcon icon={faCheck} />}
                onPress={handleSave}
              >
                保存设置
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
