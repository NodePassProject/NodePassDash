"use client";

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

  // 测试连接功能
  const testConnection = async () => {
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

      // 使用新的 SSE 测试主控
      const response = await fetch("/api/sse/test", {
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
        throw new Error(result.error || t("toast.testFailed"));
      }

      addToast({
        title: t("toast.testSuccess"),
        description: t("toast.testSuccessDesc"),
        color: "success",
      });
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formDataObj = new FormData(event.target as HTMLFormElement);
    const formEntries = Object.fromEntries(formDataObj.entries()) as any;

    // 从URL中分离出基础URL和API前缀
    const { baseUrl, apiPath } = parseUrl(formEntries.url);

    // 构造包含API前缀的数据对象，保持原有接口兼容
    const data: EndpointFormData = {
      name: formEntries.name,
      url: baseUrl,
      apiPath: apiPath,
      apiKey: formEntries.apiKey,
    };

    if (onAdd) {
      await onAdd(data);
    }

    // 重置表单
    setFormData({
      name: "",
      url: "",
      apiKey: "",
    });

    onOpenChange(); // 关闭模态框
  };

  return (
    <Modal
      isOpen={isOpen}
      placement="center"
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

              <Form validationBehavior="native" onSubmit={handleSubmit}>
                <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-1">
                  {/* 主控名称 */}
                  <Input
                    isRequired
                    label={t("addModal.name")}
                    labelPlacement="outside"
                    maxLength={30}
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
                      variant="bordered"
                      onPress={testConnection}
                    >
                      {isTestingConnection ? t("addModal.testing") : t("addModal.testConnection")}
                    </Button>
                    <Button color="primary" radius="full" type="submit">
                      {t("addModal.submit")}
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
                                    name: "导入的主控",
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
              </Form>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
