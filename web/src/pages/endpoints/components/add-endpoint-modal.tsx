import {
  Avatar,
  Badge,
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Textarea,
} from "@heroui/react";
import React, { useState } from "react";
import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPen,
  faWifi,
  faEye,
  faEyeSlash,
  faFileImport,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";

// 表单数据接口
interface FormData {
  name: string;
  url: string;
  apiKey: string;
}

// API提交数据接口
interface EndpointFormData extends FormData {
  apiPath: string;
}

interface AddEndpointModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  onAdd?: (data: EndpointFormData) => Promise<void>;
}

export default function AddEndpointModal({
  isOpen,
  onOpenChange,
  onAdd,
}: AddEndpointModalProps) {
  const { t } = useTranslation("endpoints");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [showTestResultModal, setShowTestResultModal] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    connected: boolean;
    version: string;
    canAdd: boolean;
    message: string;
  } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    url: "",
    apiKey: "",
  });

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 从URL中提取基础URL和API前缀的工具函数
  const parseUrl = (fullUrl: string) => {
    // 正则表达式匹配：协议://域名:端口/路径
    const urlRegex = /^(https?:\/\/[^\/]+)(\/.*)?$/;
    const match = fullUrl.match(urlRegex);

    if (match) {
      const baseUrl = match[1]; // 基础URL部分
      const apiPath = match[2] || "/api"; // API路径部分，默认为 /api

      return { baseUrl, apiPath };
    }

    // 如果不匹配，返回原URL和默认API路径
    return { baseUrl: fullUrl, apiPath: "/api" };
  };

  // 测试连接并检查版本
  const testConnectionAndVersion = async () => {
    if (!formData.url || !formData.apiKey) {
      addToast({
        title: t("toast.incompleteParams"),
        description: t("toast.incompleteParamsDesc"),
        color: "warning",
      });

      return;
    }

    setIsTestingConnection(true);

    try {
      const { baseUrl, apiPath } = parseUrl(formData.url);

      // 调用新的接口：测试连接并获取版本信息
      const response = await fetch("/api/sse/test-with-version", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: baseUrl,
          apiPath: apiPath,
          apiKey: formData.apiKey,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || t("toast.testFailedDesc"));
      }

      // 保存测试结果并显示模态窗
      setTestResult(result);
      setShowTestResultModal(true);
    } catch (error) {
      addToast({
        title: t("toast.testFailed"),
        description:
          error instanceof Error
            ? error.message
            : t("toast.testFailedDesc"),
        color: "danger",
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  // 从测试结果模态窗中点击"添加"按钮时调用
  const handleAddFromTestResult = async () => {
    const { baseUrl, apiPath } = parseUrl(formData.url);

    // 构造包含API前缀的数据对象，保持原有接口兼容
    const data: EndpointFormData = {
      name: formData.name,
      url: baseUrl,
      apiPath: apiPath,
      apiKey: formData.apiKey,
    };

    if (onAdd) {
      await onAdd(data);
    }

    // 重置表单和状态
    setFormData({
      name: "",
      url: "",
      apiKey: "",
    });
    setTestResult(null);
    setShowTestResultModal(false);
    onOpenChange(); // 关闭所有模态框
  };

  // 关闭测试结果模态窗
  const handleCloseTestResult = () => {
    setShowTestResultModal(false);
    setTestResult(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      placement="top-center"
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {t("addModal.title")}
            </ModalHeader>
            <ModalBody className="px-6 pb-6">
              <div className="flex flex-col items-start">
                <p className="text-large font-semibold">{t("addModal.configTitle")}</p>
                <div
                  className="flex gap-4 py-4 cursor-pointer"
                  onClick={() => setShowImportModal(true)}
                >
                  <Badge
                    showOutline
                    classNames={{
                      badge: "w-5 h-5",
                    }}
                    color="primary"
                    content={
                      <Button
                        isIconOnly
                        className="p-0 text-primary-foreground"
                        radius="full"
                        size="sm"
                        variant="light"
                      >
                        <FontAwesomeIcon className="text-xs" icon={faPen} />
                      </Button>
                    }
                    placement="bottom-right"
                    shape="circle"
                  >
                    <Avatar
                      className="h-14 w-14 bg-primary-100"
                      icon={
                        <FontAwesomeIcon
                          className="text-primary"
                          icon={faFileImport}
                        />
                      }
                    />
                  </Badge>
                  <div className="flex flex-col items-start justify-center">
                    <p className="font-medium">{t("addModal.importConfig")}</p>
                    <span className="text-small text-default-500">
                      {t("addModal.importDesc")}
                    </span>
                  </div>
                </div>
                <p className="text-small text-default-400 mb-6">
                  {t("addModal.helpText")}
                </p>
              </div>

              <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-1">
                {/* 主控名称 */}
                <Input
                  isRequired
                  endContent={
                    <span className="text-xs text-default-500">
                      {formData.name.length}/25
                    </span>
                  }
                  label={t("addModal.name")}
                  labelPlacement="outside"
                  maxLength={25}
                  name="name"
                  placeholder={t("addModal.namePlaceholder")}
                  value={formData.name}
                  onValueChange={(value) => handleInputChange("name", value)}
                />
                {/* URL 地址（包含API前缀） */}
                <Input
                  isRequired
                  className="md:col-span-1"
                  label={t("addModal.urlLabel")}
                  labelPlacement="outside"
                  name="url"
                  placeholder={t("addModal.urlPlaceholder")}
                  type="url"
                  value={formData.url}
                  onValueChange={(value) => handleInputChange("url", value)}
                />
                {/* API Key */}
                <Input
                  isRequired
                  className="md:col-span-1"
                  endContent={
                    <Button
                      isIconOnly
                      className="text-default-400 hover:text-primary"
                      size="sm"
                      variant="light"
                      onPress={() => setShowApiKey(!showApiKey)}
                    >
                      <FontAwesomeIcon
                        className="text-sm"
                        icon={showApiKey ? faEyeSlash : faEye}
                      />
                    </Button>
                  }
                  label={t("addModal.apiKeyLabel")}
                  labelPlacement="outside"
                  maxLength={100}
                  name="apiKey"
                  placeholder={t("addModal.apiKeyPlaceholder")}
                  type={showApiKey ? "text" : "password"}
                  value={formData.apiKey}
                  onValueChange={(value) =>
                    handleInputChange("apiKey", value)
                  }
                />
              </div>

              <div className="mt-6 flex w-full justify-end gap-2">
                <div className="flex gap-2">
                  <Button radius="full" variant="bordered" onPress={onClose}>
                    {t("addModal.cancel")}
                  </Button>
                  <Button
                    color="primary"
                    isLoading={isTestingConnection}
                    radius="full"
                    startContent={
                      !isTestingConnection && (
                        <FontAwesomeIcon icon={faWifi} />
                      )
                    }
                    onPress={testConnectionAndVersion}
                  >
                    {isTestingConnection ? t("addModal.testing") : t("addModal.testAndAdd")}
                  </Button>
                </div>
              </div>

              {/* 导入配置模态框 */}
              <Modal
                isOpen={showImportModal}
                size="lg"
                onOpenChange={() => {
                  setShowImportModal(false);
                  setImportText("");
                }}
              >
                <ModalContent>
                  {(onClose) => (
                    <>
                      <ModalHeader>{t("addModal.importModalTitle")}</ModalHeader>
                      <ModalBody className="gap-4">
                        <Textarea
                          label={t("addModal.importContent")}
                          minRows={3}
                          placeholder={t("addModal.importPlaceholder")}
                          value={importText}
                          onValueChange={setImportText}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            radius="full"
                            variant="bordered"
                            onPress={onClose}
                          >
                            {t("addModal.cancel")}
                          </Button>
                          <Button
                            color="primary"
                            radius="full"
                            onPress={() => {
                              // 解析配置文本
                              const urlMatch = importText.match(
                                /API URL:\s*(http[s]?:\/\/[^\s]+)/i,
                              );
                              const keyMatch =
                                importText.match(/API KEY:\s*([^\s]+)/i);

                              if (urlMatch && keyMatch) {
                                const { baseUrl } = parseUrl(urlMatch[1]);

                                setFormData({
                                  name: t("addModal.importedName"),
                                  url: urlMatch[1],
                                  apiKey: keyMatch[1],
                                });
                                onClose();
                                addToast({
                                  title: t("toast.importSuccess"),
                                  description: t("toast.importSuccessDesc"),
                                  color: "success",
                                });
                              } else {
                                addToast({
                                  title: t("toast.importFailed"),
                                  description: t("toast.importFailedDesc"),
                                  color: "danger",
                                });
                              }
                            }}
                          >
                            {t("addModal.parseConfig")}
                          </Button>
                        </div>
                      </ModalBody>
                    </>
                  )}
                </ModalContent>
              </Modal>

              {/* 测试结果模态框 */}
              <Modal
                isOpen={showTestResultModal}
                size="md"
                onOpenChange={handleCloseTestResult}
              >
                <ModalContent>
                  {(onClose) => (
                    <>
                      <ModalHeader>{t("addModal.testResultTitle")}</ModalHeader>
                      <ModalBody className="gap-4 pb-6">
                        {testResult && (
                          <>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {t("addModal.connectionStatus")}：
                                </span>
                                <span
                                  className={`text-sm ${testResult.connected ? "text-success" : "text-danger"}`}
                                >
                                  {testResult.connected ? t("addModal.statusSuccess") : t("addModal.statusFailed")}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {t("addModal.endpointVersion")}：
                                </span>
                                <span className="text-sm">
                                  {testResult.version}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  {t("addModal.canAdd")}：
                                </span>
                                <span
                                  className={`text-sm ${testResult.canAdd ? "text-success" : "text-danger"}`}
                                >
                                  {testResult.canAdd ? t("addModal.statusYes") : t("addModal.statusNo")}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                radius="full"
                                variant="bordered"
                                onPress={() => {
                                  handleCloseTestResult();
                                  onClose();
                                }}
                              >
                                {t("addModal.close")}
                              </Button>
                              <Button
                                color="primary"
                                isDisabled={!testResult.canAdd}
                                radius="full"
                                onPress={handleAddFromTestResult}
                              >
                                {t("addModal.addEndpoint")}
                              </Button>
                            </div>
                          </>
                        )}
                      </ModalBody>
                    </>
                  )}
                </ModalContent>
              </Modal>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
