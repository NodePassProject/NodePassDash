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
  Divider,
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
import { useTranslation } from "react-i18next";

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
  tag?: {
    id: number;
    name: string;
  };
}

// 标签类型定义
interface Tag {
  id: number;
  name: string;
  tunnelIds?: number[]; // 绑定的隧道ID列表
}

interface TagInstancesModalProps {
  isOpen: boolean;
  tag: Tag | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function TagInstancesModal({
  isOpen,
  tag,
  onOpenChange,
  onSaved,
}: TagInstancesModalProps) {
  const { t } = useTranslation("tunnels");
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTunnels, setSelectedTunnels] = useState<Selection>(new Set());

  // 获取所有实例列表
  const fetchTunnels = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl("/api/tunnels?page_size=1000"));

      if (!response.ok) throw new Error(t("tagInstancesModal.toast.fetchFailedDesc"));
      const result = await response.json();

      const tunnelList = result.data || [];
      setTunnels(tunnelList);

      // 设置当前标签下的实例为已选中状态
      if (tag && tag.tunnelIds) {
        // 使用后端返回的tunnelIds信息，转换为字符串格式（因为Select组件需要字符串key）
        const currentTaggedTunnels = tag.tunnelIds.map(id => String(id));
        setSelectedTunnels(new Set(currentTaggedTunnels));
      } else {
        setSelectedTunnels(new Set());
      }
    } catch (error) {
      console.error("获取实例列表失败:", error);
      addToast({
        title: t("tagInstancesModal.toast.fetchFailed"),
        description: t("tagInstancesModal.toast.fetchFailedDesc"),
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  // 保存标签设置
  const handleSave = async () => {
    if (!tag) return;

    try {
      setSaving(true);

      // 获取选中的实例ID列表
      let tunnelIds: string[] = [];
      if (selectedTunnels === "all") {
        tunnelIds = tunnels.map((tunnel) => tunnel.id);
      } else {
        tunnelIds = Array.from(selectedTunnels as Set<string>);
      }

      const response = await fetch(buildApiUrl(`/api/tags/${tag.id}/tunnels`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tunnel_ids: tunnelIds.map(id => parseInt(id)),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t("tagInstancesModal.toast.saveFailed"));
      }

      addToast({
        title: t("tagInstancesModal.toast.saveSuccess"),
        description: t("tagInstancesModal.toast.saveSuccessDesc", { count: tunnelIds.length, name: tag.name }),
        color: "success",
      });

      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("设置实例标签失败:", error);
      addToast({
        title: t("tagInstancesModal.toast.fetchFailed"),
        description: error instanceof Error ? error.message : t("tagInstancesModal.toast.saveFailed"),
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  // 获取类型显示文本
  const getTypeDisplayText = (type: "server" | "client"): string => {
    return type === "server" ? t("type.server") : t("type.client");
  };

  // 获取已选择的实例数量
  const getSelectedCount = () => {
    if (selectedTunnels === "all") return tunnels.length;
    if (selectedTunnels instanceof Set) return selectedTunnels.size;
    return 0;
  };

  // 模态框打开时获取数据
  useEffect(() => {
    if (isOpen && tag) {
      fetchTunnels();
    }
  }, [isOpen, tag]);

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
                  {tag && (
                    <>{t("tagInstancesModal.title", { name: tag.name })} <span className="text-sm">{t("tagInstancesModal.selectedCount", { selected: getSelectedCount(), total: tunnels.length })}</span></>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    onClick={() => {
                      // 确保使用字符串类型的ID，与Select组件的key保持一致
                      const allIds = tunnels.map(t => String(t.id));
                      setSelectedTunnels(new Set(allIds));
                    }}
                  >
                    {t("tagInstancesModal.selectAll")}
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    onClick={() => setSelectedTunnels(new Set())}
                  >
                    {t("tagInstancesModal.clearAll")}
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
                    aria-label={t("tagInstancesModal.selectAriaLabel")}
                    placeholder={t("tagInstancesModal.selectPlaceholder")}
                    selectedKeys={selectedTunnels}
                    selectionMode="multiple"
                    onSelectionChange={setSelectedTunnels}
                    classNames={{
                      trigger: "min-h-12",
                      listbox: "max-h-[400px] overflow-auto",
                    }}
                    scrollShadowProps={{
                      isEnabled: false
                    }}
                    disallowEmptySelection={false}
                  >
                    {tunnels.map((tunnel) => (
                      <SelectItem
                        key={tunnel.id}
                        textValue={tunnel.name}
                        className="py-2"
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{tunnel.name}</span>
                            <div className="flex items-center gap-2 text-xs text-default-500">
                              <Chip
                                color={tunnel.type === "server" ? "primary" : "secondary"}
                                size="sm"
                                variant="flat"
                              >
                                {getTypeDisplayText(tunnel.type)}
                              </Chip>
                              <span>{t("tagInstancesModal.endpoint")}: {tunnel.endpoint}</span>
                              {tunnel.tag && tunnel.tag.id !== tag?.id && (
                                <Chip
                                  color="warning"
                                  size="sm"
                                  variant="flat"
                                  startContent={<FontAwesomeIcon icon={faTag} />}
                                >
                                  {tunnel.tag.name}
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
                            {t("tagInstancesModal.empty.title")}
                          </p>
                          <p className="text-default-400 text-xs">
                            {t("tagInstancesModal.empty.description")}
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
                variant="light"
                onPress={onClose}
                startContent={<FontAwesomeIcon icon={faTimes} />}
              >
                {t("tagInstancesModal.buttons.cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={loading}
                isLoading={saving}
                onPress={handleSave}
                startContent={<FontAwesomeIcon icon={faCheck} />}
              >
                {t("tagInstancesModal.buttons.save")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}