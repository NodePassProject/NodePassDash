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
  Tabs,
  Tab,
  Listbox,
  ListboxItem,
  Switch,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faTrash, faPlus } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import Editor from "@monaco-editor/react";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";

interface BatchCreateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface BatchItem {
  id: string;
  name: string;
  endpointId: string;
  targetAddress: string;
  targetPort: string;
  tunnelPort: string;
  type: string;
}

interface Endpoint {
  id: string;
  name: string;
}

// 转发规则接口
interface ForwardRule {
  id: string;
  name: string; // 隧道名称
  endpointId?: string; // 规则独立的入口服务器ID（当不统一时使用）
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
}

// 快速模式的规则项目
interface QuickRule {
  dest: string;
  listen_port: number;
  name: string;
}

// 批量创建请求项接口
interface BatchCreateItem {
  endpointId: number;
  inbounds_port: number;
  outbound_host: string;
  outbound_port: number;
  name: string;
}

export default function BatchCreateModal({
  isOpen,
  onOpenChange,
  onSaved,
}: BatchCreateModalProps) {
  const { t } = useTranslation("tunnels");
  const [loading, setLoading] = useState(false);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [activeTab, setActiveTab] = useState("standard");

  // 标准模式的表单状态
  const [standardConfig, setStandardConfig] = useState({
    endpointId: "",
    unifiedEndpoint: true, // 是否统一入口服务器
    rules: [] as ForwardRule[],
  });

  // 快速模式的表单状态
  const [quickConfig, setQuickConfig] = useState({
    endpointId: "",
    rulesJson: `[
  {
    "dest": "1.1.1.1:55495",
    "listen_port": 55495,
    "name": "美国"
  }
]`, // JSON格式的批量规则，设置默认内容
  });

  useEffect(() => {
    if (isOpen) {
      fetchEndpoints();
      resetForm();
    }
  }, [isOpen]);

  // 自动生成实例配置 - 只保留双端模式
  // 双端模式暂时不启用，删除相关逻辑

  const fetchEndpoints = async () => {
    try {
      const response = await fetch(buildApiUrl("/api/endpoints/simple"));

      if (!response.ok) throw new Error(t("batchCreate.toast.fetchEndpointsFailed"));
      const data = await response.json();

      setEndpoints(data);
    } catch (error) {
      console.error("获取主控列表失败:", error);
      addToast({
        title: t("toast.fetchError"),
        description: t("batchCreate.toast.fetchEndpointsFailed"),
        color: "danger",
      });
    }
  };

  const resetForm = () => {
    setStandardConfig({
      endpointId: "",
      unifiedEndpoint: true,
      rules: [],
    });
    setQuickConfig({
      endpointId: "",
      rulesJson: `[
  {
    "dest": "1.1.1.1:55495",
    "listen_port": 55495,
    "name": "美国"
  }
]`,
    });
    setBatchItems([]);
    setActiveTab("standard");
  };

  // 解析端口范围字符串
  const parsePorts = (portsStr: string): number[] => {
    const ports: number[] = [];
    const parts = portsStr
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);

    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map((p) => parseInt(p.trim()));

        if (start && end && start <= end) {
          for (let i = start; i <= end; i++) {
            ports.push(i);
          }
        }
      } else {
        const port = parseInt(part);

        if (port) {
          ports.push(port);
        }
      }
    }

    return [...new Set(ports)].sort((a, b) => a - b); // 去重并排序
  };

  const generateSingleEndItems = () => {
    try {
      const rules = standardConfig.rules;

      if (rules.length === 0) {
        setBatchItems([]);

        return;
      }

      const items: BatchItem[] = [];

      for (const rule of rules) {
        items.push({
          id: `single-${Date.now()}-${rule.id}`,
          name: `批量实例-${rule.tunnelPort}`,
          endpointId: standardConfig.endpointId,
          targetAddress: rule.targetAddress,
          targetPort: rule.targetPort,
          tunnelPort: rule.tunnelPort,
          type: "服务端",
        });
      }

      setBatchItems(items);
    } catch (error) {
      setBatchItems([]);
    }
  };

  const generateDoubleEndItems = () => {
    // 双端模式暂时不启用，删除相关逻辑
  };

  // 重置JSON内容
  const resetJsonContent = () => {
    setQuickConfig((prev) => ({
      ...prev,
      rulesJson: `[
  {
    "dest": "1.1.1.1:55495",
    "listen_port": 55495,
    "name": "美国"
  }
]`,
    }));
  };

  // 格式化JSON内容
  const formatJsonContent = () => {
    try {
      const content = quickConfig.rulesJson.trim();

      if (!content) return;

      // 尝试解析JSON数组
      const parsed = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        addToast({
          title: t("batchCreate.toast.formatFailed"),
          description: t("batchCreate.toast.formatFailedArray"),
          color: "danger",
        });

        return;
      }

      const formatted = JSON.stringify(parsed, null, 2);

      setQuickConfig((prev) => ({ ...prev, rulesJson: formatted }));
      addToast({
        title: t("batchCreate.toast.formatSuccess"),
        description: t("batchCreate.toast.formatSuccessDesc", { count: parsed.length }),
        color: "success",
      });
    } catch (error) {
      addToast({
        title: t("batchCreate.toast.formatFailed"),
        description: t("batchCreate.toast.formatFailedSyntax"),
        color: "danger",
      });
    }
  };

  // 添加新的示例规则
  const addExampleRule = () => {
    try {
      const currentContent = quickConfig.rulesJson.trim();
      let rules = [];

      if (currentContent) {
        rules = JSON.parse(currentContent);
        if (!Array.isArray(rules)) {
          rules = [];
        }
      }

      rules.push({
        dest: "127.0.0.1:3000",
        listen_port: 8080,
        name: "新规则",
      });

      const newContent = JSON.stringify(rules, null, 2);

      setQuickConfig((prev) => ({ ...prev, rulesJson: newContent }));
    } catch (error) {
      // 如果解析失败，重置为示例
      setQuickConfig((prev) => ({
        ...prev,
        rulesJson: `[
  {
    "dest": "127.0.0.1:3000",
    "listen_port": 8080,
    "name": "新规则"
  }
]`,
      }));
    }
  };

  const handleSubmit = async () => {
    if (activeTab === "standard") {
      // 标准模式验证
      if (standardConfig.rules.length === 0) {
        addToast({
          title: t("toast.fetchError"),
          description: t("batchCreate.toast.addRuleRequired"),
          color: "danger",
        });

        return;
      }

      // 统一入口服务器模式：检查是否选择了统一的入口服务器
      if (standardConfig.unifiedEndpoint && !standardConfig.endpointId) {
        addToast({
          title: t("toast.fetchError"),
          description: t("batchCreate.toast.selectUnifiedEndpoint"),
          color: "danger",
        });

        return;
      }

      // 非统一模式：检查每条规则是否都选择了入口服务器
      if (!standardConfig.unifiedEndpoint) {
        const missingEndpoint = standardConfig.rules.some(
          (rule) => !rule.endpointId,
        );

        if (missingEndpoint) {
          addToast({
            title: t("toast.fetchError"),
            description: t("batchCreate.toast.selectEndpointForEachRule"),
            color: "danger",
          });

          return;
        }
      }

      // 检查规则完整性（包括名称）
      const incompleteRule = standardConfig.rules.some(
        (rule) =>
          !rule.name ||
          !rule.tunnelPort ||
          !rule.targetAddress ||
          !rule.targetPort,
      );

      if (incompleteRule) {
        addToast({
          title: t("toast.fetchError"),
          description: t("batchCreate.toast.completeAllRules"),
          color: "danger",
        });

        return;
      }
    } else if (activeTab === "quick") {
      // 快速模式验证
      if (!quickConfig.endpointId) {
        addToast({
          title: t("toast.fetchError"),
          description: t("batchCreate.toast.selectMaster"),
          color: "danger",
        });

        return;
      }

      if (!quickConfig.rulesJson.trim()) {
        addToast({
          title: t("toast.fetchError"),
          description: t("batchCreate.toast.enterJsonRules"),
          color: "danger",
        });

        return;
      }

      // 验证JSON格式
      try {
        const rules = JSON.parse(quickConfig.rulesJson.trim());

        if (!Array.isArray(rules)) {
          addToast({
            title: t("toast.fetchError"),
            description: t("batchCreate.toast.jsonMustBeArray"),
            color: "danger",
          });

          return;
        }

        if (rules.length === 0) {
          addToast({
            title: t("toast.fetchError"),
            description: t("batchCreate.toast.atLeastOneRule"),
            color: "danger",
          });

          return;
        }

        // 验证每个规则的格式
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i];

          if (!rule.dest || !rule.listen_port || !rule.name) {
            addToast({
              title: t("toast.fetchError"),
              description: t("batchCreate.toast.ruleFormatError", { index: i + 1 }),
              color: "danger",
            });

            return;
          }
        }
      } catch (error) {
        addToast({
          title: t("toast.fetchError"),
          description: t("batchCreate.toast.jsonFormatError"),
          color: "danger",
        });

        return;
      }
    }

    setLoading(true);

    try {
      let requestBody: any;

      if (activeTab === "standard") {
        // 标准模式：构建新的请求格式
        const standardItems = standardConfig.rules.map((rule) => ({
          log: "debug", // 默认debug
          name: rule.name,
          endpointId: parseInt(
            standardConfig.unifiedEndpoint
              ? standardConfig.endpointId
              : rule.endpointId!,
          ),
          tunnel_port: parseInt(rule.tunnelPort),
          target_host: rule.targetAddress,
          target_port: parseInt(rule.targetPort),
        }));

        requestBody = {
          mode: "standard",
          standard: standardItems,
        };
      } else if (activeTab === "quick") {
        // 配置模式：构建新的请求格式
        const rules = JSON.parse(quickConfig.rulesJson.trim());
        const configItems = [
          {
            log: "debug", // 默认debug
            endpointId: parseInt(quickConfig.endpointId),
            config: rules.map((rule: QuickRule) => ({
              dest: rule.dest,
              listen_port: rule.listen_port,
              name: rule.name,
            })),
          },
        ];

        requestBody = {
          mode: "config",
          config: configItems,
        };
      }

      const response = await fetch(buildApiUrl("/api/tunnels/batch-new"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.success) {
          addToast({
            title: t("batchCreate.toast.createComplete"),
            description:
              result.message || t("batchCreate.toast.createSuccess", { count: result.successCount }),
            color: result.failCount > 0 ? "warning" : "success",
          });

          if (onSaved) onSaved();
          onOpenChange(false);
        } else {
          addToast({
            title: t("batchCreate.toast.createFailed"),
            description: result.error || t("batchCreate.toast.createFailedDesc"),
            color: "danger",
          });
        }
      } else {
        throw new Error(result.error || t("batchCreate.toast.networkError"));
      }
    } catch (error) {
      console.error("批量创建失败:", error);
      addToast({
        title: t("batchCreate.toast.createFailed"),
        description:
          error instanceof Error ? error.message : t("batchCreate.toast.networkError"),
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      classNames={{
        backdrop:
          "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
      }}
      isOpen={isOpen}
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{t("batchCreate.title")}</ModalHeader>

            <ModalBody>
              <Tabs
                aria-label={t("batchCreate.title")}
                classNames={{
                  tabList: "bg-default-100 p-1 rounded-lg",
                  cursor: "!bg-primary !text-primary-foreground shadow-sm",
                  tab: "data-[selected=true]:!text-primary-foreground px-4 py-2",
                }}
                color="primary"
                fullWidth={true}
                selectedKey={activeTab}
                variant="solid"
                onSelectionChange={(key) => setActiveTab(key as string)}
              >
                <Tab key="standard" title={t("batchCreate.tabs.standard")}>
                  <div className="space-y-6 py-4">
                    <div className="space-y-4">
                      {/* 转发规则区域 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <h5 className="text-sm font-medium text-foreground">
                              {t("batchCreate.standard.rules")}
                            </h5>
                            {standardConfig.unifiedEndpoint && (
                              <Select
                                isRequired
                                className="w-48"
                                placeholder={t("batchCreate.standard.selectEndpoint")}
                                selectedKeys={
                                  standardConfig.endpointId
                                    ? [standardConfig.endpointId]
                                    : []
                                }
                                size="sm"
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(
                                    keys,
                                  )[0] as string;

                                  setStandardConfig((prev) => ({
                                    ...prev,
                                    endpointId: selected,
                                  }));
                                }}
                              >
                                {endpoints.map((endpoint) => (
                                  <SelectItem key={endpoint.id}>
                                    {endpoint.name}
                                  </SelectItem>
                                ))}
                              </Select>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Switch
                                isSelected={standardConfig.unifiedEndpoint}
                                size="sm"
                                onValueChange={(checked) => {
                                  setStandardConfig((prev) => ({
                                    ...prev,
                                    unifiedEndpoint: checked,
                                    // 如果切换为非统一模式，清空统一的endpointId
                                    endpointId: checked ? prev.endpointId : "",
                                  }));
                                }}
                              />
                              <span className="text-sm text-default-600">
                                {t("batchCreate.standard.unifiedEndpoint")}
                              </span>
                            </div>
                            <Button
                              color="primary"
                              size="sm"
                              startContent={
                                <FontAwesomeIcon
                                  className="text-xs"
                                  icon={faPlus}
                                />
                              }
                              variant="flat"
                              onClick={() => {
                                const newRule = {
                                  id: `rule-${Date.now()}`,
                                  name: "", // 隧道名称，用户需要填写
                                  tunnelPort: "",
                                  targetAddress: "127.0.0.1",
                                  targetPort: "",
                                  ...(standardConfig.unifiedEndpoint
                                    ? {}
                                    : { endpointId: "" }),
                                };

                                setStandardConfig((prev) => ({
                                  ...prev,
                                  rules: [...prev.rules, newRule],
                                }));
                              }}
                            >
                              {t("batchCreate.standard.addRule")}
                            </Button>
                          </div>
                        </div>

                        {standardConfig.rules.length === 0 ? (
                          <div className="text-center py-8 border-2 border-dashed border-default-200 rounded-lg">
                            <p className="text-default-500 text-sm">
                              {t("batchCreate.standard.noRules")}
                            </p>
                          </div>
                        ) : (
                          <div className="max-h-80 overflow-y-auto border border-default-200 rounded-lg">
                            <Listbox
                              aria-label={t("batchCreate.standard.rules")}
                              className="p-0"
                              selectionMode="none"
                              variant="flat"
                            >
                              {standardConfig.rules.map((rule, index) => (
                                <ListboxItem
                                  key={rule.id}
                                  className="py-2"
                                  textValue={`规则 ${index + 1}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-default-600 min-w-fit">
                                      #{index + 1}
                                    </span>
                                    <div
                                      className={`flex-1 grid gap-3 ${standardConfig.unifiedEndpoint ? "grid-cols-4" : "grid-cols-5"}`}
                                    >
                                      {/* 非统一模式时显示入口服务器选择 */}
                                      {!standardConfig.unifiedEndpoint && (
                                        <Select
                                          isRequired
                                          placeholder={t("batchCreate.standard.selectEndpointServer")}
                                          selectedKeys={
                                            rule.endpointId
                                              ? [rule.endpointId]
                                              : []
                                          }
                                          size="sm"
                                          variant="bordered"
                                          onSelectionChange={(keys) => {
                                            const selected = Array.from(
                                              keys,
                                            )[0] as string;

                                            setStandardConfig((prev) => ({
                                              ...prev,
                                              rules: prev.rules.map((r) =>
                                                r.id === rule.id
                                                  ? {
                                                      ...r,
                                                      endpointId: selected,
                                                    }
                                                  : r,
                                              ),
                                            }));
                                          }}
                                        >
                                          {endpoints.map((endpoint) => (
                                            <SelectItem key={endpoint.id}>
                                              {endpoint.name}
                                            </SelectItem>
                                          ))}
                                        </Select>
                                      )}
                                      <Input
                                        placeholder={t("batchCreate.standard.tunnelName")}
                                        size="sm"
                                        value={rule.name}
                                        variant="bordered"
                                        onValueChange={(value) =>
                                          setStandardConfig((prev) => ({
                                            ...prev,
                                            rules: prev.rules.map((r) =>
                                              r.id === rule.id
                                                ? { ...r, name: value }
                                                : r,
                                            ),
                                          }))
                                        }
                                      />
                                      <Input
                                        placeholder={t("batchCreate.standard.tunnelPort")}
                                        size="sm"
                                        value={rule.tunnelPort}
                                        variant="bordered"
                                        onValueChange={(value) =>
                                          setStandardConfig((prev) => ({
                                            ...prev,
                                            rules: prev.rules.map((r) =>
                                              r.id === rule.id
                                                ? { ...r, tunnelPort: value }
                                                : r,
                                            ),
                                          }))
                                        }
                                      />
                                      <Input
                                        placeholder={t("batchCreate.standard.targetIP")}
                                        size="sm"
                                        value={rule.targetAddress}
                                        variant="bordered"
                                        onValueChange={(value) =>
                                          setStandardConfig((prev) => ({
                                            ...prev,
                                            rules: prev.rules.map((r) =>
                                              r.id === rule.id
                                                ? { ...r, targetAddress: value }
                                                : r,
                                            ),
                                          }))
                                        }
                                      />
                                      <Input
                                        placeholder={t("batchCreate.standard.targetPort")}
                                        size="sm"
                                        value={rule.targetPort}
                                        variant="bordered"
                                        onValueChange={(value) =>
                                          setStandardConfig((prev) => ({
                                            ...prev,
                                            rules: prev.rules.map((r) =>
                                              r.id === rule.id
                                                ? { ...r, targetPort: value }
                                                : r,
                                            ),
                                          }))
                                        }
                                      />
                                    </div>
                                    <Button
                                      isIconOnly
                                      color="danger"
                                      size="sm"
                                      variant="light"
                                      onClick={() =>
                                        setStandardConfig((prev) => ({
                                          ...prev,
                                          rules: prev.rules.filter(
                                            (r) => r.id !== rule.id,
                                          ),
                                        }))
                                      }
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
                  </div>
                </Tab>

                <Tab key="quick" title={t("batchCreate.tabs.quick")}>
                  <div className="space-y-6 py-4">
                    <div className="space-y-4">
                      {/* 主控选择器 */}
                      <div className="grid grid-cols-1 gap-4">
                        <Select
                          isRequired
                          label={t("batchCreate.quick.selectMaster")}
                          placeholder={t("batchCreate.quick.selectMasterPlaceholder")}
                          selectedKeys={
                            quickConfig.endpointId
                              ? [quickConfig.endpointId]
                              : []
                          }
                          onSelectionChange={(keys) => {
                            const selected = Array.from(keys)[0] as string;

                            setQuickConfig((prev) => ({
                              ...prev,
                              endpointId: selected,
                            }));
                          }}
                        >
                          {endpoints.map((endpoint) => (
                            <SelectItem key={endpoint.id}>
                              {endpoint.name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>

                      {/* JSON规则输入 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-foreground">
                            {t("batchCreate.quick.batchRules")}
                          </h5>
                          <div className="flex items-center gap-2">
                            <Button
                              className="text-xs h-6 px-2 min-w-unit-12"
                              size="sm"
                              variant="light"
                              onClick={resetJsonContent}
                            >
                              {t("batchCreate.quick.reset")}
                            </Button>
                            <Button
                              className="text-xs h-6 px-2 min-w-unit-12"
                              size="sm"
                              variant="light"
                              onClick={formatJsonContent}
                            >
                              {t("batchCreate.quick.format")}
                            </Button>
                            <Button
                              className="text-xs h-6 px-2 min-w-unit-12"
                              size="sm"
                              variant="light"
                              onClick={addExampleRule}
                            >
                              {t("batchCreate.quick.addExample")}
                            </Button>
                            <div className="text-xs text-default-500">
                              {t("batchCreate.quick.jsonFormat")}
                            </div>
                          </div>
                        </div>

                        <Editor
                          defaultLanguage="json"
                          height="300px"
                          options={{
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: "on",
                            formatOnType: true,
                            formatOnPaste: true,
                            tabSize: 2,
                            wordWrap: "on",
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            bracketPairColorization: { enabled: true },
                          }}
                          theme="vs-dark"
                          value={quickConfig.rulesJson}
                          onChange={(value) =>
                            setQuickConfig((prev) => ({
                              ...prev,
                              rulesJson: value || "",
                            }))
                          }
                        />

                        {/* 格式说明 */}
                        <div className="bg-default-50 rounded-lg p-4">
                          <h6 className="text-sm font-medium text-default-700 mb-2">
                            {t("batchCreate.quick.formatDescription")}
                          </h6>
                          <ul className="text-xs text-default-600 space-y-1">
                            <li>
                              •{" "}
                              <code className="bg-default-100 px-1 rounded">
                                dest
                              </code>
                              : {t("batchCreate.quick.destDesc")}
                            </li>
                            <li>
                              •{" "}
                              <code className="bg-default-100 px-1 rounded">
                                listen_port
                              </code>
                              : {t("batchCreate.quick.listenPortDesc")}
                            </li>
                            <li>
                              •{" "}
                              <code className="bg-default-100 px-1 rounded">
                                name
                              </code>
                              : {t("batchCreate.quick.nameDesc")}
                            </li>
                            <li>• {t("batchCreate.quick.arrayFormatDesc")}</li>
                          </ul>
                        </div>

                        {/* JSON验证提示 */}
                        {quickConfig.rulesJson && (
                          <div className="text-xs">
                            {(() => {
                              try {
                                const rules = JSON.parse(
                                  quickConfig.rulesJson.trim(),
                                );

                                if (!Array.isArray(rules)) {
                                  return (
                                    <div className="text-danger-600 flex items-center gap-1">
                                      <span>✗</span>
                                      <span>{t("batchCreate.quick.validationError")}</span>
                                    </div>
                                  );
                                }

                                const validCount = rules.filter(
                                  (rule: any) =>
                                    rule.dest && rule.listen_port && rule.name,
                                ).length;

                                if (
                                  validCount === rules.length &&
                                  rules.length > 0
                                ) {
                                  return (
                                    <div className="text-success-600 flex items-center gap-1">
                                      <span>✓</span>
                                      <span>
                                        {t("batchCreate.quick.validRules", { count: validCount })}
                                      </span>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="text-warning-600 flex items-center gap-1">
                                      <span>⚠</span>
                                      <span>
                                        {t("batchCreate.quick.partialValid", { valid: validCount, total: rules.length })}
                                      </span>
                                    </div>
                                  );
                                }
                              } catch {
                                return (
                                  <div className="text-danger-600 flex items-center gap-1">
                                    <span>✗</span>
                                    <span>{t("batchCreate.quick.jsonError")}</span>
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Tab>
              </Tabs>
            </ModalBody>

            <ModalFooter>
              <Button
                color="danger"
                isDisabled={loading}
                variant="light"
                onPress={onClose}
              >
                {t("batchCreate.buttons.cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={
                  activeTab === "standard"
                    ? standardConfig.rules.length === 0 ||
                      (standardConfig.unifiedEndpoint &&
                        !standardConfig.endpointId) ||
                      (!standardConfig.unifiedEndpoint &&
                        standardConfig.rules.some(
                          (rule) => !rule.endpointId,
                        )) ||
                      standardConfig.rules.some(
                        (rule) =>
                          !rule.name ||
                          !rule.tunnelPort ||
                          !rule.targetAddress ||
                          !rule.targetPort,
                      )
                    : activeTab === "quick"
                      ? !quickConfig.endpointId || !quickConfig.rulesJson.trim()
                      : true
                }
                isLoading={loading}
                startContent={
                  !loading ? <FontAwesomeIcon icon={faCopy} /> : null
                }
                onPress={handleSubmit}
              >
                {loading
                  ? t("batchCreate.buttons.creating")
                  : activeTab === "standard"
                    ? t("batchCreate.buttons.createWithCount", { count: standardConfig.rules.length })
                    : activeTab === "quick"
                      ? (() => {
                          try {
                            const rules = JSON.parse(
                              quickConfig.rulesJson.trim(),
                            );

                            return Array.isArray(rules)
                              ? t("batchCreate.buttons.createWithCount", { count: rules.length })
                              : t("batchCreate.buttons.create");
                          } catch {
                            return t("batchCreate.buttons.create");
                          }
                        })()
                      : t("batchCreate.buttons.create")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
