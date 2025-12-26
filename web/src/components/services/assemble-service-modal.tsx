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
import { useTranslation } from "react-i18next";

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
  extendTargetAddress?: string[];
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
  const { t } = useTranslation("services");
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
        throw new Error(t("assembleModal.messages.fetchInstancesFailed"));
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
        title: t("assembleModal.messages.fetchInstancesFailed"),
        description: error instanceof Error ? error.message : t("assembleModal.messages.unknownError"),
        color: "danger",
      });
      setClientInstances([]);
      setServerInstances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 根据类型和实例属性计算最终的服务类型
  const calculateFinalServiceType = (): string => {
    const clientInstance = clientInstances.find(
      (i) => i.instanceId === selectedClientInstance
    );
    const serverInstance = serverInstances.find(
      (i) => i.instanceId === selectedServerInstance
    );

    // 判断 extendTargetAddress 是否有效（数组不为空且至少有一个非空元素）
    const hasValidExtendTarget = (arr?: string[]) =>
      arr && arr.length > 0 && arr.some(addr => addr && addr.trim() !== "");

    switch (serviceType) {
      case "0": // 单端转发
        if (clientInstance && hasValidExtendTarget(clientInstance.extendTargetAddress)) {
          return "5"; // 均衡单端转发
        }
        return "0"; // 通用单端转发

      case "1": // 内网穿透
        if (clientInstance && hasValidExtendTarget(clientInstance.extendTargetAddress)) {
          return "6"; // 均衡内网穿透（优先级最高）
        }
        if (clientInstance?.targetAddress === "127.0.0.1") {
          return "1"; // 本地内网穿透
        }
        return "3"; // 外部内网穿透

      case "2": // 隧道转发
        if (serverInstance && hasValidExtendTarget(serverInstance.extendTargetAddress)) {
          return "7"; // 均衡隧道转发（优先级最高）
        }
        if (serverInstance?.targetAddress === "127.0.0.1") {
          return "2"; // 本地隧道转发
        }
        return "4"; // 外部隧道转发

      default:
        return serviceType;
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    // 验证表单
    if (!serviceId || !serviceName) {
      addToast({
        title: t("assembleModal.validation.formValidationFailed"),
        description: t("assembleModal.validation.fillServiceIdAndName"),
        color: "warning",
      });

      return;
    }

    if (!selectedClientInstance) {
      addToast({
        title: t("assembleModal.validation.formValidationFailed"),
        description: t("assembleModal.validation.selectClientInstance"),
        color: "warning",
      });

      return;
    }

    if (serviceType !== "0" && !selectedServerInstance) {
      addToast({
        title: t("assembleModal.validation.formValidationFailed"),
        description: t("assembleModal.validation.selectServerInstance"),
        color: "warning",
      });

      return;
    }

    try {
      setSubmitting(true);

      // 根据选择的实例属性计算最终的服务类型
      const finalType = calculateFinalServiceType();

      const payload = {
        sid: serviceId,
        name: serviceName,
        type: finalType,
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

        throw new Error(error.error || t("assembleModal.messages.assembleFailed"));
      }

      addToast({
        title: t("assembleModal.messages.assembleSuccess"),
        color: "success",
      });

      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error("组装服务失败:", error);
      addToast({
        title: t("assembleModal.messages.assembleFailed"),
        description: error instanceof Error ? error.message : t("assembleModal.messages.unknownError"),
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

  // 获取类型对应的颜色
  const getTypeColor = (type: string) => {
    switch (type) {
      case "0":
        return "primary";     // 单端转发 - 蓝色
      case "1":
        return "success";     // NAT穿透 - 绿色
      case "2":
        return "secondary";   // 隧道转发 - 紫色
      default:
        return "primary";
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
              {t("assembleModal.title")}
            </ModalHeader>
            <ModalBody>
              {/* 服务ID */}
              <Input
                isReadOnly
                label={t("assembleModal.fields.serviceId")}
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
                label={t("assembleModal.fields.serviceName")}
                placeholder={t("assembleModal.placeholders.serviceName")}
                value={serviceName}
                onValueChange={setServiceName}
              />

              {/* 服务类型 */}
              <div className="space-y-2">
                <Tabs
                  fullWidth
                  color={getTypeColor(serviceType) as any}
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
                        <span>{t("assembleModal.types.singleForward")}</span>
                      </div>
                    }
                  />
                  <Tab
                    key="1"
                    title={
                      <div className={`flex items-center gap-2 ${serviceType === "1" ? "text-white" : ""}`}>
                        <FontAwesomeIcon icon={faShield} />
                        <span>{t("assembleModal.types.natPenetration")}</span>
                      </div>
                    }
                  />
                  <Tab
                    key="2"
                    title={
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faExchangeAlt} />
                        <span>{t("assembleModal.types.tunnelForward")}</span>
                      </div>
                    }
                  />
                </Tabs>
              </div>
              {/* 选择服务端实例（仅当type!=0时显示） */}
              {serviceType !== "0" && (
                <div className="space-y-2">
                  <Autocomplete
                    label={t("assembleModal.fields.serverInstance")}
                    isLoading={loading}
                    placeholder={t("assembleModal.placeholders.selectServerInstance")}
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
                  label={t("assembleModal.fields.clientInstance")}
                  isLoading={loading}
                  placeholder={t("assembleModal.placeholders.selectClientInstance")}
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
                {t("assembleModal.actions.cancel")}
              </Button>
              <Button
                color="primary"
                isLoading={submitting}
                onPress={handleSubmit}
              >
                {t("assembleModal.actions.assemble")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
