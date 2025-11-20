import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tabs,
  Tab,
  Autocomplete,
  AutocompleteItem,
} from "@heroui/react";
import { useEffect, useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRefresh,
  faArrowRight,
  faShield,
  faExchangeAlt,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

interface AssembleServiceModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface AvailableInstance {
  instanceId: string;
  endpointId: number;
  endpointName: string;
  tunnelType: string; // "server" | "client"
  name: string;
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
}

// 生成 UUID v4
const generateServiceId = (): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 降级方案：手动实现 UUID v4
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;

    return v.toString(16);
  });
};

export default function AssembleServiceModal({
  isOpen,
  onOpenChange,
  onSaved,
}: AssembleServiceModalProps) {
  const [serviceId, setServiceId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [serviceType, setServiceType] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 实例选择
  const [clientInstances, setClientInstances] = useState<AvailableInstance[]>(
    [],
  );
  const [serverInstances, setServerInstances] = useState<AvailableInstance[]>(
    [],
  );
  const [selectedClientInstance, setSelectedClientInstance] = useState<
    string | undefined
  >();
  const [selectedServerInstance, setSelectedServerInstance] = useState<
    string | undefined
  >();

  // 打开模态窗时生成服务ID
  useEffect(() => {
    if (isOpen) {
      setServiceId(generateServiceId());
      setServiceName("");
      setServiceType("0");
      setSelectedClientInstance(undefined);
      setSelectedServerInstance(undefined);
      fetchAvailableInstances();
    }
  }, [isOpen]);

  // 重新生成服务ID
  const regenerateServiceId = () => {
    setServiceId(generateServiceId());
  };

  // 获取可用实例
  const fetchAvailableInstances = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        buildApiUrl("/api/services/available-instances"),
      );

      if (!response.ok) {
        throw new Error("获取可用实例失败");
      }

      const data = await response.json();

      setClientInstances(
        data.instances?.filter((i: AvailableInstance) => i.tunnelType === "client") || [],
      );
      setServerInstances(
        data.instances?.filter((i: AvailableInstance) => i.tunnelType === "server") || [],
      );
    } catch (error) {
      console.error("获取可用实例失败:", error);
      addToast({
        title: "获取可用实例失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
      setClientInstances([]);
      setServerInstances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 提交表单
  const handleSubmit = async () => {
    // 验证表单
    if (!serviceId || !serviceName) {
      addToast({
        title: "表单验证失败",
        description: "请填写服务ID和服务名称",
        color: "warning",
      });

      return;
    }

    if (!selectedClientInstance) {
      addToast({
        title: "表单验证失败",
        description: "请选择客户端实例",
        color: "warning",
      });

      return;
    }

    if (serviceType !== "0" && !selectedServerInstance) {
      addToast({
        title: "表单验证失败",
        description: "请选择服务端实例",
        color: "warning",
      });

      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        sid: serviceId,
        name: serviceName,
        type: serviceType,
        clientInstanceId: selectedClientInstance,
        serverInstanceId: serviceType !== "0" ? selectedServerInstance : undefined,
      };

      const response = await fetch(buildApiUrl("/api/services/assemble"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.error || "组装服务失败");
      }

      addToast({
        title: "组装服务成功",
        color: "success",
      });

      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error("组装服务失败:", error);
      addToast({
        title: "组装服务失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 获取类型对应的图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "0":
        return faArrowRight;
      case "1":
        return faShield;
      case "2":
        return faExchangeAlt;
      default:
        return faArrowRight;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      size="md"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              组装服务
            </ModalHeader>
            <ModalBody>
              {/* 服务ID */}
              <Input
                isReadOnly
                label="服务ID"
                className="flex-1"
                value={serviceId}
                endContent={
                  <Button
                  size="sm"
                    isIconOnly
                    color="default"
                    variant="flat"
                    onPress={regenerateServiceId}
                  >
                    <FontAwesomeIcon icon={faRefresh} />
                  </Button>
                }
              />
              {/* 服务名称 */}
              <Input
                label="服务名称"
                placeholder="请输入服务名称"
                value={serviceName}
                onValueChange={setServiceName}
              />

              {/* 服务类型 */}
              <div className="space-y-2">
                <Tabs
                  fullWidth
                  selectedKey={serviceType}
                  onSelectionChange={(key) => {
                    setServiceType(key as string);
                    setSelectedClientInstance(undefined);
                    setSelectedServerInstance(undefined);
                  }}
                >
                  <Tab
                    key="0"
                    title={
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faArrowRight} />
                        <span>单端转发</span>
                      </div>
                    }
                  />
                  <Tab
                    key="1"
                    title={
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faShield} />
                        <span>NAT穿透</span>
                      </div>
                    }
                  />
                  <Tab
                    key="2"
                    title={
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faExchangeAlt} />
                        <span>隧道转发</span>
                      </div>
                    }
                  />
                </Tabs>
              </div>
              {/* 选择服务端实例（仅当type!=0时显示） */}
              {serviceType !== "0" && (
                <div className="space-y-2">
                  <Autocomplete
                    label="服务端实例"
                    isLoading={loading}
                    placeholder="请选择或搜索服务端实例"
                    selectedKey={selectedServerInstance}
                    onSelectionChange={(key) => {
                      setSelectedServerInstance(key as string);
                    }}
                    allowsCustomValue={false}
                  >
                    {serverInstances.map((instance) => (
                      <AutocompleteItem
                        key={instance.instanceId}
                        textValue={`${instance.name} ${instance.endpointName} ${instance.tunnelAddress}:${instance.tunnelPort}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{instance.name}</span>
                          <span className="text-xs text-default-400">
                            {instance.endpointName} - {instance.tunnelAddress}:
                            {instance.tunnelPort}
                          </span>
                        </div>
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>
              )}
              {/* 选择客户端实例 */}
              <div className="space-y-2">
                <Autocomplete
                  label="客户端实例"
                  isLoading={loading}
                  placeholder="请选择或搜索客户端实例"
                  selectedKey={selectedClientInstance}
                  onSelectionChange={(key) => {
                    setSelectedClientInstance(key as string);
                  }}
                  allowsCustomValue={false}
                >
                  {clientInstances.map((instance) => (
                    <AutocompleteItem
                      key={instance.instanceId}
                      textValue={`${instance.name} ${instance.endpointName} ${instance.tunnelAddress}:${instance.tunnelPort}`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{instance.name}</span>
                        <span className="text-xs text-default-400">
                          {instance.endpointName} - {instance.tunnelAddress}:
                          {instance.tunnelPort}
                        </span>
                      </div>
                    </AutocompleteItem>
                  ))}
                </Autocomplete>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="flat" onPress={onClose}>
                取消
              </Button>
              <Button
                color="primary"
                isLoading={submitting}
                onPress={handleSubmit}
              >
                组装服务
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
