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
        title: "参数不完整",
        description: "请先填写完整的 URL 和 API Key",
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
        throw new Error(result.error || "连接测试失败");
      }

      // 保存测试结果并显示模态窗
      setTestResult(result);
      setShowTestResultModal(true);
    } catch (error) {
      addToast({
        title: "连接测试失败",
        description:
          error instanceof Error
            ? error.message
            : "连接失败，请检查配置是否正确",
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
              添加 API 主控
            </ModalHeader>
            <ModalBody className="px-6 pb-6">
              <div className="flex flex-col items-start">
                <p className="text-large font-semibold">主控配置</p>
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
                    <p className="font-medium">导入主控配置</p>
                    <span className="text-small text-default-500">
                      点击导入已有的主控配置
                    </span>
                  </div>
                </div>
                <p className="text-small text-default-400 mb-6">
                  您可以手动填写配置信息，或者点击上方图标快速导入已有的主控配置。
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
                  label="主控名称"
                  labelPlacement="outside"
                  maxLength={25}
                  name="name"
                  placeholder="主服务器"
                  value={formData.name}
                  onValueChange={(value) => handleInputChange("name", value)}
                />
                {/* URL 地址（包含API前缀） */}
                <Input
                  isRequired
                  className="md:col-span-1"
                  label="URL 地址"
                  labelPlacement="outside"
                  name="url"
                  placeholder="http(s)://example.com:9090/api/v1"
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
                  label="API Key"
                  labelPlacement="outside"
                  maxLength={100}
                  name="apiKey"
                  placeholder="输入您的 API Key"
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
                    取消
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
                    {isTestingConnection ? "检测中..." : "检测连接并添加"}
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
                      <ModalHeader>导入配置</ModalHeader>
                      <ModalBody className="gap-4">
                        <Textarea
                          label="配置内容"
                          minRows={3}
                          placeholder={
                            "API URL: http(s)://xxx.xxx.xxx.xxx:10101/api/v1\nAPI KEY: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          }
                          value={importText}
                          onValueChange={setImportText}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            radius="full"
                            variant="bordered"
                            onPress={onClose}
                          >
                            取消
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
                                  title: "导入成功",
                                  description: "配置已成功导入到表单中",
                                  color: "success",
                                });
                              } else {
                                addToast({
                                  title: "导入失败",
                                  description:
                                    "无法识别配置格式，请检查内容是否正确",
                                  color: "danger",
                                });
                              }
                            }}
                          >
                            解析配置
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
                      <ModalHeader>连接检测结果</ModalHeader>
                      <ModalBody className="gap-4 pb-6">
                        {testResult && (
                          <>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  连接状态：
                                </span>
                                <span
                                  className={`text-sm ${testResult.connected ? "text-success" : "text-danger"}`}
                                >
                                  {testResult.connected ? "成功" : "失败"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  主控版本：
                                </span>
                                <span className="text-sm">
                                  {testResult.version}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">
                                  支持添加：
                                </span>
                                <span
                                  className={`text-sm ${testResult.canAdd ? "text-success" : "text-danger"}`}
                                >
                                  {testResult.canAdd ? "是" : "否"}
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
                                关闭
                              </Button>
                              <Button
                                color="primary"
                                isDisabled={!testResult.canAdd}
                                radius="full"
                                onPress={handleAddFromTestResult}
                              >
                                添加主控
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
