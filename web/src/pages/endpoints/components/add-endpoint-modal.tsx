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
import { motion, AnimatePresence } from "framer-motion";

// 表单数据接口
interface FormData {
  name: string;
  url: string;
  apiKey: string;
  connectionIP: string;
}

// API提交数据接口
interface EndpointFormData extends Omit<FormData, 'connectionIP'> {
  apiPath: string;
  hostname?: string;
}

interface AddEndpointModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  onAdd?: (data: EndpointFormData) => Promise<void>;
}

type ModalStep = "form" | "import";

export default function AddEndpointModal({
  isOpen,
  onOpenChange,
  onAdd,
}: AddEndpointModalProps) {
  const { t } = useTranslation("endpoints");
  const [step, setStep] = useState<ModalStep>("form");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
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
    connectionIP: "",
  });

  // 从 URL 中提取主机名/IP 地址（类似后端 extractIPFromURL 逻辑）
  const extractIPFromURL = (urlStr: string): string => {
    if (!urlStr) return "";

    try {
      const parsedURL = new URL(urlStr);
      const hostname = parsedURL.hostname;

      if (!hostname) return "";

      // 检查是否为 IPv6 地址（包含冒号）
      if (hostname.includes(":") && !hostname.startsWith("[")) {
        return `[${hostname}]`;
      }

      return hostname;
    } catch {
      // 如果 URL 解析失败，尝试手动提取
      return extractIPFromString(urlStr);
    }
  };

  // 从字符串中手动提取 host 部分（备用方法）
  const extractIPFromString = (input: string): string => {
    let result = input;

    // 去除协议部分
    const protocolIdx = result.indexOf("://");
    if (protocolIdx !== -1) {
      result = result.substring(protocolIdx + 3);
    }

    // 去除用户认证信息
    const atIdx = result.indexOf("@");
    if (atIdx !== -1) {
      result = result.substring(atIdx + 1);
    }

    // 去除路径部分
    const slashIdx = result.indexOf("/");
    if (slashIdx !== -1) {
      result = result.substring(0, slashIdx);
    }

    // 去除查询参数
    const queryIdx = result.indexOf("?");
    if (queryIdx !== -1) {
      result = result.substring(0, queryIdx);
    }

    // 去除端口号（保留主机名）
    const colonIdx = result.lastIndexOf(":");
    if (colonIdx !== -1 && !result.includes("[")) {
      // 检查冒号后面是否是数字（端口）
      const afterColon = result.substring(colonIdx + 1);
      if (/^\d+$/.test(afterColon)) {
        result = result.substring(0, colonIdx);
      }
    }

    return result;
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        [field]: value,
      };

      // 当 URL 改变且 connectionIP 为空时，自动解析并填充
      if (field === "url") {
        const extractedIP = extractIPFromURL(value);
        if (!prev.connectionIP || prev.connectionIP === extractIPFromURL(prev.url)) {
          updated.connectionIP = extractedIP;
        }
      }

      return updated;
    });
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
      hostname: formData.connectionIP || undefined, // 添加连接IP字段
    };

    if (onAdd) {
      await onAdd(data);
    }

    // 重置表单和状态
    setFormData({
      name: "",
      url: "",
      apiKey: "",
      connectionIP: "",
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

  // 处理导入配置的解析
  const handleParseImportConfig = () => {
    // 解析配置文本
    const urlMatch = importText.match(/API URL:\s*(http[s]?:\/\/[^\s]+)/i);
    const keyMatch = importText.match(/API KEY:\s*([^\s]+)/i);

    if (urlMatch && keyMatch) {
      const url = urlMatch[1];
      const extractedIP = extractIPFromURL(url);

      setFormData({
        name: t("addModal.importedName"),
        url: url,
        apiKey: keyMatch[1],
        connectionIP: extractedIP,
      });
      setStep("form"); // 切换回表单视图
      setImportText(""); // 清空导入文本
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
  };

  // 重置模态窗状态
  const handleModalClose = () => {
    setStep("form");
    setImportText("");
    onOpenChange();
  };

  return (
    <Modal
      isOpen={isOpen}
      placement="top-center"
      scrollBehavior="inside"
      size="2xl"
      onOpenChange={handleModalClose}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {step === "form" ? t("addModal.title") : t("addModal.importModalTitle")}
            </ModalHeader>
            <ModalBody className="px-6 pb-6 pt-0">
              <div className="relative">
                <AnimatePresence mode="wait" initial={false}>
                  {step === "form" && (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.25,
                        ease: "easeInOut"
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <div
                          className="flex gap-4 pb-6 cursor-pointer"
                          onClick={() => setStep("import")}
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
                        {/* 连接 IP（仅在 URL 有效时显示） */}
                        {formData.url  && (
                          <Input
                            className="md:col-span-1"
                            label={t("addModal.connectionIPLabel")}
                            labelPlacement="outside"
                            name="connectionIP"
                            placeholder={t("addModal.connectionIPHint")}
                            value={formData.connectionIP}
                            onValueChange={(value) =>
                              handleInputChange("connectionIP", value)
                            }
                          />
                        )}
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
                    </motion.div>
                  )}

                  {step === "import" && (
                    <motion.div
                      key="import"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.25,
                        ease: "easeInOut"
                      }}
                    >
                      <Textarea
                        label={t("addModal.importContent")}
                        minRows={3}
                        placeholder={t("addModal.importPlaceholder")}
                        value={importText}
                        onValueChange={setImportText}
                      />
                      <div className="mt-6 flex justify-end gap-2">
                        <Button
                          radius="full"
                          variant="bordered"
                          onPress={() => {
                            setStep("form");
                            setImportText("");
                          }}
                        >
                          {t("addModal.cancel")}
                        </Button>
                        <Button
                          color="primary"
                          radius="full"
                          onPress={handleParseImportConfig}
                        >
                          {t("addModal.parseConfig")}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

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
