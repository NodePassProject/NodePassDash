import React from "react";
import {
  Card,
  CardBody,
  Button,
  Radio,
  RadioGroup,
  Tooltip,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import {
  faLayerGroup,
  faPlus,
  faArrowRight,
  faArrowLeft,
  faRotateLeft,
  faServer,
  faArrowsLeftRight,
  faGear,
  faUser,
  faBullseye,
  faExchangeAlt,
  faGlobe,
} from "@fortawesome/free-solid-svg-icons";

import { buildApiUrl } from "@/lib/utils";

interface SimpleEndpoint {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  status: "ONLINE" | "OFFLINE" | "FAIL";
  tunnelCount: number;
}

interface TunnelMode {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
}

interface FormData {
  userPort: string;
  masterServer: string;
  listenType: string; // 监听类型：local/external
  protocolType: string; // 协议类型：all/tcp/udp
  targetIp: string;
  targetPort: string;
  targetMaster: string;
  targetMasterPort: string;
  tlsLevel: string;
  logLevel: string;
  connectionPort: string;
  accessInfo: string;
  intranetTargetMaster: string; // 内网穿透的目标服务器
  intranetTargetPort: string; // 内网穿透的目标端口
  intranetExitIp: string; // 内网穿透的出口IP
  certPath: string; // TLS 2 证书路径
  keyPath: string; // TLS 2 密钥路径
  exitIp: string; // 出口IP
  exitPort: string; // 出口端口
  targetListenType: string; // 目标监听类型：local/external
  minPool: string; // 最小池容量
  maxPool: string; // 最大池容量
  userListenType: string; // 用户监听策略：local/external
  userListenAddress: string; // 用户监听地址
}

interface TemplateCreateRequest {
  log: string;
  listen_host?: string;
  listen_port: number;
  mode: string;
  tls?: number;
  cert_path?: string;
  key_path?: string;
  inbounds?: {
    target_host: string;
    target_port: number;
    master_id: number;
    type: string;
  };
  outbounds?: {
    target_host: string;
    target_port: number;
    master_id: number;
    type: string;
  };
}

interface FormField {
  label: string;
  key: keyof FormData;
  placeholder: string;
  value: string;
  type?: string;
  hint?: string;
  options?: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
}

interface NodeConfig {
  label: string;
  type: "user" | "relay" | "target" | "destination";
  formFields: FormField[];
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState<string>("single");
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [endpoints, setEndpoints] = useState<SimpleEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // 服务端口模式控制
  const [servicePortMode, setServicePortMode] = useState<"random" | "custom">(
    "custom",
  );

  // 生成随机端口（40000-65535）
  const generateRandomPort = (): string => {
    const min = 40000;
    const max = 65535;

    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  };

  // 处理端口模式切换
  const handleServicePortModeChange = (mode: "random" | "custom") => {
    setServicePortMode(mode);
    if (mode === "random") {
      // 如果选择随机模式，立即生成一个随机端口
      updateField("connectionPort", generateRandomPort());
    } else {
      // 如果选择自定义模式，清空端口字段
      updateField("connectionPort", "");
    }
  };

  // 获取端点列表
  const fetchEndpoints = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        buildApiUrl("/api/endpoints/simple?excludeFailed=true"),
      );

      if (!response.ok) throw new Error("获取端点列表失败");
      const data = await response.json();

      setEndpoints(data || []);
    } catch (error) {
      console.error("获取端点列表失败:", error);
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const tlsLevels = [
    {
      value: "0",
      label: "0不加密",
      description: "暂不应用加密（即明文TCP/UDP）",
    },
    {
      value: "1",
      label: "1自签名证书",
      description: "内存自签加密（自动生成）",
    },
    {
      value: "2",
      label: "2自定义证书",
      description: "域名证书加密（需要crt和key参数）",
    },
  ];

  const logLevels = [
    { value: "error", label: "Error" },
    { value: "warn", label: "Warning" },
    { value: "info", label: "Info" },
    { value: "debug", label: "Debug" },
  ];

  // 根据模式动态生成用户监听策略选项
  const getUserListenTypes = () => {
    if (selectedMode === "single") {
      return [
        { value: "all", label: "全部IP" },
        { value: "assign", label: "指定IP" },
      ];
    } else {
      return [
        { value: "all", label: "全部入口" },
        { value: "assign", label: "指定入口" },
      ];
    }
  };

  // 根据模式动态生成目标访问策略选项
  const getTargetAccessTypes = () => {
    if (selectedMode === "single") {
      return [
        { value: "external", label: "外部服务" },
        { value: "local", label: "本地中转" },
      ];
    } else {
      return [
        { value: "external", label: "外部服务" },
        { value: "local", label: "本地出口" },
      ];
    }
  };

  const [formData, setFormData] = useState<FormData>({
    userPort: "",
    masterServer: "",
    listenType: "external", // 默认对外监听
    protocolType: "all", // 默认全部协议
    targetIp: "",
    targetPort: "",
    targetMaster: "",
    targetMasterPort: "",
    tlsLevel: "1",
    logLevel: "debug", // 默认debug级别
    connectionPort: "",
    accessInfo: "",
    intranetTargetMaster: "",
    intranetTargetPort: "",
    intranetExitIp: "",
    certPath: "",
    keyPath: "",
    exitIp: "",
    exitPort: "",
    targetListenType: "external", // 默认对外监听
    minPool: "",
    maxPool: "",
    userListenType: "all", // 默认全部IP访问
    userListenAddress: "", // 用户监听地址
  });

  // 当监听类型改变时，自动设置目标IP
  useEffect(() => {
    if (formData.listenType === "local") {
      setFormData((prev) => ({ ...prev, targetIp: "127.0.0.1" }));
    } else if (
      formData.listenType === "external" &&
      formData.targetIp === "127.0.0.1"
    ) {
      setFormData((prev) => ({ ...prev, targetIp: "" }));
    }
  }, [formData.listenType]);

  // 当目标监听类型改变时，自动设置出口IP
  useEffect(() => {
    if (formData.targetListenType === "local") {
      setFormData((prev) => ({ ...prev, exitIp: "127.0.0.1" }));
    } else if (
      formData.targetListenType === "external" &&
      formData.exitIp === "127.0.0.1"
    ) {
      setFormData((prev) => ({ ...prev, exitIp: "" }));
    }
  }, [formData.targetListenType]);

  // 当用户监听策略改变时，自动设置监听地址
  useEffect(() => {
    if (formData.userListenType === "all") {
      setFormData((prev) => ({ ...prev, userListenAddress: "0.0.0.0" }));
    } else if (formData.userListenType === "assign") {
      setFormData((prev) => ({ ...prev, userListenAddress: "" }));
    }
  }, [formData.userListenType]);

  const updateField = (field: keyof FormData, value: string) => {
    // 对于池容量字段添加数字验证
    if (field === "minPool" || field === "maxPool") {
      // 只允许数字
      if (!/^\d*$/.test(value)) {
        return;
      }
      // 限制最大长度
      if (value.length > 6) {
        return;
      }
    }

    // 用户监听策略切换时的特殊处理
    if (field === "userListenType") {
      if (value === "all") {
        // 选择全部IP时，清空监听地址字段
        setFormData((prev) => ({
          ...prev,
          [field]: value,
          userListenAddress: "",
        }));

        return;
      }
    }

    // 目标访问策略切换时的特殊处理
    if (field === "targetListenType") {
      if (value === "local") {
        // 选择本地时，清空目标地址字段
        setFormData((prev) => ({
          ...prev,
          [field]: value,
          exitIp: "",
        }));

        return;
      }
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 清空表单数据的函数
  const resetFormData = () => {
    setFormData({
      userPort: "",
      masterServer: "",
      listenType: "external", // 保持默认值
      protocolType: "all", // 保持默认值
      targetIp: "",
      targetPort: "",
      targetMaster: "",
      targetMasterPort: "",
      tlsLevel: "1", // 保持默认值
      logLevel: "debug", // 保持默认值
      connectionPort: "",
      accessInfo: "",
      intranetTargetMaster: "",
      intranetTargetPort: "",
      intranetExitIp: "",
      certPath: "",
      keyPath: "",
      exitIp: "",
      exitPort: "",
      targetListenType: "external", // 保持默认值
      minPool: "",
      maxPool: "",
      userListenType: "all", // 保持默认值
      userListenAddress: "", // 用户监听地址
    });
    // 重置端口模式
    setServicePortMode("custom");
  };

  // 切换隧道模式时清空表单数据
  const handleModeChange = (mode: string) => {
    setSelectedMode(mode);
    resetFormData();
  };

  // 从URL中提取IP/域名
  const extractHostFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);

      return urlObj.hostname;
    } catch (error) {
      // 如果URL解析失败，尝试手动提取
      const match = url.match(/:\/\/([^\/\:]+)/);

      return match ? match[1] : url;
    }
  };

  // 生成单端转发模式的动态场景说明
  const generateSingleModeDescription = (): string => {
    // 用户部分：根据监听策略生成
    const userPart =
      formData.userListenType === "assign"
        ? `只有可以访问${formData.userListenAddress}的用户 才可以`
        : "所有用户都可以 ";

    // 服务器IP：从选择的服务器中提取
    const selectedEndpoint = endpoints.find(
      (ep) => ep.name === formData.masterServer,
    );
    const serverIp = selectedEndpoint
      ? extractHostFromUrl(selectedEndpoint.url)
      : "";

    // 目标部分：根据访问策略生成
    const targetPart =
      formData.targetListenType === "external"
        ? `${formData.exitIp}:${formData.exitPort}`
        : `127.0.0.1:${formData.exitPort}`;

    return `${userPart}通过访问 ${serverIp}:${formData.userPort} 来达到目标地址 ${targetPart}`;
  };

  // 生成双端转发模式的动态场景说明
  const generateDoubleModeDescription = (): string => {
    // 用户部分：根据监听策略生成
    const userPart =
      formData.userListenType === "assign"
        ? `只有可以访问${formData.userListenAddress}的用户才可以`
        : "所有用户都可以";

    // 客户端服务器IP：从选择的客户端服务器中提取
    const clientEndpoint = endpoints.find(
      (ep) => ep.name === formData.targetMaster,
    );
    const clientServerIp = clientEndpoint
      ? extractHostFromUrl(clientEndpoint.url)
      : "";

    // 服务端服务器IP：从选择的服务端服务器中提取
    const serverEndpoint = endpoints.find(
      (ep) => ep.name === formData.masterServer,
    );
    const serverIp = serverEndpoint
      ? extractHostFromUrl(serverEndpoint.url)
      : "";

    // 目标部分：根据访问策略生成
    const targetPart =
      formData.targetListenType === "external"
        ? `${formData.exitIp}:${formData.exitPort}`
        : `127.0.0.1:${formData.exitPort}`;

    return `${userPart} 通过访问${clientServerIp}:${formData.userPort} (由${serverIp}进行转发) 来到达目标地址 ${targetPart}`;
  };

  // 生成内网穿透模式的动态场景说明
  const generateIntranetModeDescription = (): string => {
    // 用户部分：根据监听策略生成
    const userPart =
      formData.userListenType === "assign"
        ? `只有可以访问${formData.userListenAddress}的用户才可以`
        : "所有用户都可以";

    // 服务端服务器IP：从选择的服务端服务器中提取
    const serverEndpoint = endpoints.find(
      (ep) => ep.name === formData.masterServer,
    );
    const serverIp = serverEndpoint
      ? extractHostFromUrl(serverEndpoint.url)
      : "";

    // 客户端服务器IP：从选择的客户端服务器中提取（内网穿透模式使用 intranetTargetMaster）
    const clientEndpoint = endpoints.find(
      (ep) => ep.name === formData.intranetTargetMaster,
    );
    const clientIp = clientEndpoint
      ? extractHostFromUrl(clientEndpoint.url)
      : "";

    // 目标部分：根据访问策略生成
    const targetPart =
      formData.targetListenType === "external"
        ? `${formData.exitIp}:${formData.exitPort}`
        : `127.0.0.1:${formData.exitPort}`;

    return `${userPart} 通过访问${serverIp}:${formData.userPort} (由${clientIp}进行转发) 来到达目标地址 ${targetPart}`;
  };

  const tunnelModes: TunnelMode[] = [
    {
      id: "single",
      title: "单端转发",
      description: "端口转发，轻量连接池系统加速",
      icon: faArrowRight,
      color: "primary",
    },
    {
      id: "double",
      title: "双端转发",
      description: "加密中转，完整连接池系统加速",
      icon: faExchangeAlt,
      color: "success",
    },
    {
      id: "intranet",
      title: "内网穿透",
      description: "加密穿透，完整连接池系统加速",
      icon: faGlobe,
      color: "secondary",
    },
  ];

  const renderModeSelector = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon
            className="text-2xl text-primary"
            icon={faLayerGroup}
          />
          <h2 className="text-2xl font-bold">选择应用场景</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            startContent={<FontAwesomeIcon icon={faArrowLeft} />}
            variant="flat"
            onClick={() => navigate(-1)}
          >
            返回
          </Button>
          {selectedMode && (
            <>
              <Button
                startContent={<FontAwesomeIcon icon={faRotateLeft} />}
                variant="flat"
                onClick={resetFormData}
              >
                重置
              </Button>
              <Button
                color="primary"
                isDisabled={creating}
                isLoading={creating}
                startContent={
                  creating ? undefined : <FontAwesomeIcon icon={faPlus} />
                }
                onClick={handleCreateApplication}
              >
                {creating ? "创建中..." : "创建"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tunnelModes.map((mode) => (
          <Card
            key={mode.id}
            isHoverable
            isPressable
            className={`cursor-pointer transition-all duration-200 shadow-none border-2 ${
              selectedMode === mode.id
                ? "border-primary bg-primary-50 dark:bg-primary-900/30"
                : "border-default-200"
            }`}
            onPress={() => handleModeChange(mode.id)}
          >
            <CardBody className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    mode.color === "primary"
                      ? "bg-primary bg-opacity-10"
                      : mode.color === "success"
                        ? "bg-success bg-opacity-10"
                        : mode.color === "secondary"
                          ? "bg-secondary bg-opacity-10"
                          : "bg-default bg-opacity-10"
                  }`}
                >
                  <FontAwesomeIcon icon={mode.icon} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-1">{mode.title}</h3>
                  <p className="text-default-500 text-sm">{mode.description}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );

  const getFlowConfig = (): NodeConfig[] => {
    switch (selectedMode) {
      case "single":
        return [
          {
            label: "用户",
            type: "user",
            formFields: [
              {
                label: "监听策略",
                key: "userListenType",
                type: "radio",
                placeholder: "选择监听策略",
                value: formData.userListenType,
                options: getUserListenTypes().map((type) => ({
                  value: type.value,
                  label: type.label,
                })),
              },
              // 只有对外监听时才显示监听地址字段
              ...(formData.userListenType === "assign"
                ? [
                    {
                      label: "监听地址",
                      key: "userListenAddress" as keyof FormData,
                      placeholder: "0.0.0.0/[2001:db8::1]",
                      value: formData.userListenAddress,
                    },
                  ]
                : []),
              {
                label: "访问端口",
                key: "userPort",
                placeholder: "8080",
                value: formData.userPort,
              },
              {
                label: "监听类型",
                key: "protocolType",
                type: "select",
                placeholder: "选择监听类型",
                value: formData.protocolType,
                options: [
                  {
                    value: "all",
                    label: "全部",
                  },
                  {
                    value: "tcp",
                    label: "TCP",
                  },
                  {
                    value: "udp",
                    label: "UDP",
                  },
                ],
              }
            ],
          },
          {
            label: "中转(客户端)",
            type: "relay",
            formFields: [
              {
                label: "连接服务器",
                key: "masterServer",
                type: "select",
                placeholder: "下拉选择",
                value: formData.masterServer,
                options: endpoints.map((endpoint) => ({
                  value: endpoint.name,
                  label: `${endpoint.name} ${extractHostFromUrl(endpoint.url)}`,
                  disabled: endpoint.status === "FAIL",
                })),
              },
              // {
              //   label: '最小池容量',
              //   key: 'minPool',
              //   placeholder: '可选，默认64',
              //   value: formData.minPool,
              //   type: 'hint',
              //   hint: ''
              // },
              // {
              //   label: '最大池容量',
              //   key: 'maxPool',
              //   placeholder: '可选，默认8192',
              //   value: formData.maxPool,
              //   type: 'hint',
              //   hint: ''
              // }
            ],
          },
          {
            label: "目标",
            type: "destination",
            formFields: [
              {
                label: "访问策略",
                key: "targetListenType",
                type: "radio",
                placeholder: "选择访问类型",
                value: formData.targetListenType,
                options: getTargetAccessTypes().map((type) => ({
                  value: type.value,
                  label: type.label,
                })),
              },
              // 只有对外监听时才显示目标IP字段
              ...(formData.targetListenType === "external"
                ? [
                    {
                      label: "目标地址",
                      key: "exitIp" as keyof FormData,
                      placeholder: "0.0.0.0/[2001:db8::1]",
                      value: formData.exitIp,
                    },
                  ]
                : []),
              {
                label:
                  formData.targetListenType === "local"
                    ? "本地端口"
                    : "目标端口",
                key: "exitPort",
                placeholder: "3306",
                value: formData.exitPort,
              },
            ],
          },
        ];

      case "double":
        return [
          {
            label: "用户",
            type: "user",
            formFields: [
              {
                label: "监听策略",
                key: "userListenType",
                type: "radio",
                placeholder: "选择监听策略",
                value: formData.userListenType,
                options: getUserListenTypes().map((type) => ({
                  value: type.value,
                  label: type.label,
                })),
              },
              // 只有对外监听时才显示监听地址字段
              ...(formData.userListenType === "assign"
                ? [
                    {
                      label: "监听地址",
                      key: "userListenAddress" as keyof FormData,
                      placeholder: "0.0.0.0/[2001:db8::1]",
                      value: formData.userListenAddress,
                    },
                  ]
                : []),
              {
                label: "访问端口",
                key: "userPort",
                placeholder: "8080",
                value: formData.userPort,
              },
              {
                label: "监听类型",
                key: "protocolType",
                type: "select",
                placeholder: "选择监听类型",
                value: formData.protocolType,
                options: [
                  {
                    value: "all",
                    label: "全部",
                  },
                  {
                    value: "tcp",
                    label: "TCP",
                  },
                  {
                    value: "udp",
                    label: "UDP",
                  },
                ],
              }
            ],
          },
          {
            label: "入口(客户端)",
            type: "target",
            formFields: [
              {
                label: "连接服务器",
                key: "targetMaster",
                type: "select",
                placeholder: "下拉选择",
                value: formData.targetMaster,
                options: endpoints.map((endpoint) => ({
                  value: endpoint.name,
                  label: `${endpoint.name} ${extractHostFromUrl(endpoint.url)}`,
                  disabled: endpoint.status === "FAIL",
                })),
              },
              // {
              //   label: '最小池容量',
              //   key: 'minPool',
              //   placeholder: '可选，默认64',
              //   value: formData.minPool,
              //   type: 'hint',
              //   hint: ''
              // },
              // {
              //   label: '最大池容量',
              //   key: 'maxPool',
              //   placeholder: '可选，默认8192',
              //   value: formData.maxPool,
              //   type: 'hint',
              //   hint: ''
              // }
            ],
          },
          {
            label: "出口(服务端)",
            type: "relay",
            formFields: [
              {
                label: "连接服务器",
                key: "masterServer",
                type: "select",
                placeholder: "下拉选择",
                value: formData.masterServer,
                options: endpoints.map((endpoint) => ({
                  value: endpoint.name,
                  label: `${endpoint.name} ${extractHostFromUrl(endpoint.url)}`,
                  disabled: endpoint.status === "FAIL",
                })),
              },
            ],
          },
          {
            label: "目标",
            type: "destination",
            formFields: [
              {
                label: "访问策略",
                key: "targetListenType",
                type: "radio",
                placeholder: "选择访问策略类型",
                value: formData.targetListenType,
                options: getTargetAccessTypes().map((type) => ({
                  value: type.value,
                  label: type.label,
                })),
              },
              // 只有对外监听时才显示目标IP字段
              ...(formData.targetListenType === "external"
                ? [
                    {
                      label: "目标地址",
                      key: "exitIp" as keyof FormData,
                      placeholder: "0.0.0.0/[2001:db8::1]",
                      value: formData.exitIp,
                    },
                  ]
                : []),
              {
                label:
                  formData.targetListenType === "local"
                    ? "本地端口"
                    : "目标端口",
                key: "exitPort",
                placeholder: "3306",
                value: formData.exitPort,
              },
            ],
          },
        ];

      case "intranet":
        return [
          {
            label: "用户",
            type: "user",
            formFields: [
              {
                label: "监听策略",
                key: "userListenType",
                type: "radio",
                placeholder: "选择监听策略",
                value: formData.userListenType,
                options: getUserListenTypes().map((type) => ({
                  value: type.value,
                  label: type.label,
                })),
              },
              // 只有对外监听时才显示监听地址字段
              ...(formData.userListenType === "assign"
                ? [
                    {
                      label: "监听地址",
                      key: "userListenAddress" as keyof FormData,
                      placeholder: "0.0.0.0/[2001:db8::1]",
                      value: formData.userListenAddress,
                    },
                  ]
                : []),
              {
                label: "访问端口",
                key: "userPort",
                placeholder: "8080",
                value: formData.userPort,
              },
              {
                label: "监听类型",
                key: "protocolType",
                type: "select",
                placeholder: "选择监听类型",
                value: formData.protocolType,
                options: [
                  {
                    value: "all",
                    label: "全部",
                  },
                  {
                    value: "tcp",
                    label: "TCP",
                  },
                  {
                    value: "udp",
                    label: "UDP",
                  },
                ],
              }
            ],
          },
          {
            label: "入口(服务端)",
            type: "relay",
            formFields: [
              {
                label: "连接服务器",
                key: "masterServer",
                type: "select",
                placeholder: "下拉选择",
                value: formData.masterServer,
                options: endpoints.map((endpoint) => ({
                  value: endpoint.name,
                  label: `${endpoint.name} ${extractHostFromUrl(endpoint.url)}`,
                  disabled: endpoint.status === "FAIL",
                })),
              },
            ],
          },
          {
            label: "出口(客户端)",
            type: "target",
            formFields: [
              {
                label: "连接服务器",
                key: "intranetTargetMaster",
                type: "select",
                placeholder: "下拉选择",
                value: formData.intranetTargetMaster,
                options: endpoints.map((endpoint) => ({
                  value: endpoint.name,
                  label: `${endpoint.name} ${extractHostFromUrl(endpoint.url)}`,
                  disabled: endpoint.status === "FAIL",
                })),
              },
              // {
              //   label: '最小池容量',
              //   key: 'minPool',
              //   placeholder: '可选，默认64',
              //   value: formData.minPool,
              //   type: 'hint',
              //   hint: ''
              // },
              // {
              //   label: '最大池容量',
              //   key: 'maxPool',
              //   placeholder: '可选，默认8192',
              //   value: formData.maxPool,
              //   type: 'hint',
              //   hint: ''
              // }
            ],
          },
          {
            label: "目标",
            type: "destination",
            formFields: [
              {
                label: "访问策略",
                key: "targetListenType",
                type: "radio",
                placeholder: "选择访问策略类型",
                value: formData.targetListenType,
                options: getTargetAccessTypes().map((type) => ({
                  value: type.value,
                  label: type.label,
                })),
              },
              // 只有对外监听时才显示目标IP字段
              ...(formData.targetListenType === "external"
                ? [
                    {
                      label: "目标地址",
                      key: "exitIp" as keyof FormData,
                      placeholder: "0.0.0.0/[2001:db8::1]",
                      value: formData.exitIp,
                    },
                  ]
                : []),
              {
                label:
                  formData.targetListenType === "local"
                    ? "本地端口"
                    : "目标端口",
                key: "exitPort",
                placeholder: "3306",
                value: formData.exitPort,
              },
            ],
          },
        ];

      default:
        return [];
    }
  };

  const renderNodeWithForm = (
    nodeConfig: NodeConfig,
    index: number,
    isLast: boolean,
  ) => {
    const { label, type, formFields } = nodeConfig;

    const getNodeColor = () => {
      switch (type) {
        case "user":
          return "primary";
        case "relay":
          return "warning";
        case "target":
          return "success";
        case "destination":
          return "default";
        default:
          return "default";
      }
    };

    const getNodeBgClass = () => {
      switch (type) {
        case "user":
          return "bg-blue-100 border-blue-300";
        case "relay":
          // 单端转发时使用绿色，其他模式使用黄色
          return selectedMode === "single"
            ? "bg-green-100 border-green-300"
            : "bg-yellow-100 border-yellow-300";
        case "target":
          return "bg-green-100 border-green-300";
        case "destination":
          return "bg-gray-100 border-gray-300";
        default:
          return "bg-gray-100 border-gray-300";
      }
    };

    const getNodeTextClass = () => {
      switch (type) {
        case "user":
          return "text-blue-600";
        case "relay":
          // 单端转发时使用绿色，其他模式使用黄色
          return selectedMode === "single"
            ? "text-green-600"
            : "text-yellow-600";
        case "target":
          return "text-green-600";
        case "destination":
          return "text-gray-600";
        default:
          return "text-gray-600";
      }
    };

    const getNodeIcon = () => {
      // 用户端使用用户图标
      if (type === "user") {
        return faUser;
      }
      // 目标节点使用目标图标
      if (type === "destination") {
        return faBullseye;
      }

      // 所有机器（relay和target）都使用服务器图标
      return faServer;
    };

    return (
      <div className="flex flex-col items-center w-full">
        {/* 节点图标 - 顶部对齐 */}
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-md border-2 ${getNodeBgClass()}`}
        >
          <FontAwesomeIcon
            className={`text-xl ${getNodeTextClass()}`}
            icon={getNodeIcon()}
          />
        </div>

        {/* 节点标题 - 居中对齐icon */}
        <div className="mt-2 mb-4 text-center">
          <div
            className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap ${
              type === "user"
                ? "bg-blue-500 text-white"
                : type === "relay"
                  ? selectedMode === "single"
                    ? "bg-green-500 text-white"
                    : "bg-yellow-500 text-white"
                  : type === "target"
                    ? "bg-green-500 text-white"
                    : type === "destination"
                      ? "bg-gray-500 text-white"
                      : "bg-gray-500 text-white"
            }`}
          >
            {label}
          </div>
        </div>

        {/* 节点表单 - 垂直居中对齐icon，宽度相等，顶部对齐 */}
        <div className="w-full max-w-[280px] bg-default-50/80 dark:bg-default-100/20 border border-default-200 dark:border-default-300/30 rounded-lg shadow-sm p-3">
          <div className="space-y-3">
            {formFields.map((field, fieldIndex) => (
              <div key={fieldIndex}>
                <label className="block text-xs font-medium text-default-700 dark:text-default-700 mb-1">
                  {field.label}
                </label>

                {field.type === "select" ? (
                  <select
                    className="w-full px-2 py-1.5 text-sm border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-700 dark:text-black focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={field.value}
                    onChange={(e) => updateField(field.key, e.target.value)}
                  >
                    <option value="">{field.placeholder}</option>
                    {field.options?.map((option) => (
                      <option
                        key={option.value}
                        disabled={option.disabled}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "radio" ? (
                  <RadioGroup
                    orientation="horizontal"
                    size="sm"
                    value={field.value}
                    onValueChange={(value) => updateField(field.key, value)}
                  >
                    {field.options?.map((option) => (
                      <Radio
                        key={option.value}
                        classNames={{
                          label: "text-xs text-default-700 dark:text-white",
                        }}
                        isDisabled={option.disabled}
                        value={option.value}
                      >
                        {option.label}
                      </Radio>
                    ))}
                  </RadioGroup>
                ) : (
                  <div>
                    <input
                      className={`w-full px-2 py-1.5 text-sm border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-700 dark:text-black placeholder-default-400 dark:placeholder-default-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        field.key === "accessInfo" || field.type === "readonly"
                          ? "bg-default-100 dark:bg-default-800/50 cursor-not-allowed"
                          : ""
                      }`}
                      placeholder={field.placeholder}
                      readOnly={
                        field.key === "accessInfo" || field.type === "readonly"
                      }
                      type={
                        field.type === "readonly"
                          ? "text"
                          : field.type === "hint"
                            ? "text"
                            : field.type || "text"
                      }
                      value={field.value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                    />
                    {field.hint && (
                      <div className="text-xs text-default-400 dark:text-default-500 mt-1">
                        {field.hint}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderFlowDiagram = () => {
    const flowConfig = getFlowConfig();
    const isExtendedMode =
      selectedMode === "double" || selectedMode === "intranet";
    const gridCols = isExtendedMode ? "grid-cols-7" : "grid-cols-5";

    return (
      <Card className="bg-gradient-to-br from-default-50 to-default-100/50">
        <CardBody className="p-4 md:p-8">
          {/* 重新设计的布局 */}
          <div className="w-full max-w-6xl mx-auto">
            {/* 主要容器：动态网格布局 */}
            <div className={`grid ${gridCols} gap-0 items-start`}>
              {/* 第一个节点 */}
              <div className="col-span-1 flex flex-col items-center">
                {renderNodeWithForm(flowConfig[0], 0, false)}
              </div>

              {/* 第一个箭头 */}
              <div className="col-span-1 flex flex-col items-center pt-8">
                <div className="text-xs text-default-500 mb-2">
                  {selectedMode === "single"
                    ? "访问"
                    : selectedMode === "double"
                      ? "访问"
                      : selectedMode === "intranet"
                        ? "访问"
                        : "连接"}
                </div>
                <svg
                  className="text-blue-600"
                  height="14"
                  viewBox="0 0 120 14"
                  width="120"
                >
                  {/* 双向箭头横线 */}
                  <line
                    stroke="currentColor"
                    strokeWidth="2"
                    x1="10"
                    x2="110"
                    y1="7"
                    y2="7"
                  />

                  {/* 左箭头 */}
                  <polygon fill="currentColor" points="10,7 18,4 18,10" />

                  {/* 右箭头 */}
                  <polygon fill="currentColor" points="110,7 102,4 102,10" />
                </svg>
              </div>

              {/* 第二个节点 */}
              <div className="col-span-1 flex flex-col items-center">
                {renderNodeWithForm(flowConfig[1], 1, false)}
              </div>

              {/* 第二个箭头 */}
              <div className="col-span-1 flex flex-col items-center pt-8">
                <div className="text-xs text-default-500 mb-2">
                  {selectedMode === "single"
                    ? "转发"
                    : selectedMode === "double"
                      ? "连接池"
                      : selectedMode === "intranet"
                        ? "连接池"
                        : "连接"}
                </div>
                {/* 根据模式显示不同的连接方式 */}
                {selectedMode === "single" ? (
                  // 单端转发：普通双向箭头
                  <svg
                    className="text-blue-600"
                    height="14"
                    viewBox="0 0 120 14"
                    width="120"
                  >
                    {/* 双向箭头横线 */}
                    <line
                      stroke="currentColor"
                      strokeWidth="2"
                      x1="10"
                      x2="110"
                      y1="7"
                      y2="7"
                    />

                    {/* 左箭头 */}
                    <polygon fill="currentColor" points="10,7 18,4 18,10" />

                    {/* 右箭头 */}
                    <polygon fill="currentColor" points="110,7 102,4 102,10" />
                  </svg>
                ) : (
                  // 双端转发和内网穿透：管道连接效果
                  <div className="relative">
                    <svg
                      className="text-blue-600"
                      height="14"
                      viewBox="0 0 120 14"
                      width="120"
                    >
                      {/* 管道外框 */}
                      <rect
                        fill="none"
                        height="6"
                        rx="3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        width="104"
                        x="8"
                        y="4"
                      />

                      {/* 管道内部流动效果 */}
                      <g className="animate-pulse">
                        {/* 流动的数据包 */}
                        <circle
                          className="opacity-80"
                          fill="currentColor"
                          r="1.5"
                        >
                          <animateMotion
                            dur="2s"
                            path="M 12 7 L 108 7"
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle
                          className="opacity-60"
                          fill="currentColor"
                          r="1"
                        >
                          <animateMotion
                            begin="0.5s"
                            dur="2s"
                            path="M 12 7 L 108 7"
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle
                          className="opacity-80"
                          fill="currentColor"
                          r="1.5"
                        >
                          <animateMotion
                            begin="1s"
                            dur="2s"
                            path="M 108 7 L 12 7"
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle
                          className="opacity-60"
                          fill="currentColor"
                          r="1"
                        >
                          <animateMotion
                            begin="1.5s"
                            dur="2s"
                            path="M 108 7 L 12 7"
                            repeatCount="indefinite"
                          />
                        </circle>
                      </g>

                      {/* 连接端点 */}
                      <circle
                        className="opacity-90"
                        cx="8"
                        cy="7"
                        fill="currentColor"
                        r="3"
                      />
                      <circle
                        className="opacity-90"
                        cx="112"
                        cy="7"
                        fill="currentColor"
                        r="3"
                      />

                      {/* 端点内部小圆 */}
                      <circle cx="8" cy="7" fill="white" r="1.5" />
                      <circle cx="112" cy="7" fill="white" r="1.5" />
                    </svg>

                    {/* 连接指示器 */}
                    <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                      <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full" />
                    </div>
                  </div>
                )}

                {/* 双端转发和内网穿透的连接池配置 */}
                {(selectedMode === "double" || selectedMode === "intranet") && (
                  <div
                    className="bg-primary-50 dark:bg-primary-100/20 border-2 border-primary-200 dark:border-primary-300/30 rounded-lg p-2 shadow-sm mt-2"
                    style={{ width: "120px" }}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      <FontAwesomeIcon
                        className="text-primary-600 dark:text-primary-400 text-xs"
                        icon={faGear}
                      />
                      <span className="text-xs font-medium text-primary-800 dark:text-primary-300">
                        {selectedMode === "double"
                          ? "连接池配置"
                          : "连接池配置"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <label className="block text-xs text-default-700 dark:text-white mb-1">
                          {selectedMode === "double" ? "服务端口" : "服务端口"}
                        </label>
                        <div className="space-y-1">
                          {/* 端口模式选择和输入框 */}
                          <RadioGroup
                            className="gap-1"
                            orientation="vertical"
                            size="sm"
                            value={servicePortMode}
                            onValueChange={(value: string) =>
                              handleServicePortModeChange(
                                value as "random" | "custom",
                              )
                            }
                          >
                            {/* 随机选项 */}
                            <Radio className="text-xs" size="sm" value="random">
                              随机
                            </Radio>

                            {/* 自定义选项 - 用input框替代文字 */}
                            <div className="flex items-center gap">
                              <Radio
                                className="text-xs flex-shrink-0"
                                size="sm"
                                value="custom"
                              />
                              <input
                                className={`flex-1 px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded text-default-900 dark:text-black placeholder-default-400 dark:placeholder-default-500 ${
                                  servicePortMode === "random"
                                    ? "bg-default-100 dark:bg-default-800/50 cursor-not-allowed"
                                    : "bg-white dark:bg-default-900"
                                }`}
                                disabled={servicePortMode === "random"}
                                placeholder={
                                  servicePortMode === "random"
                                    ? "随机生成"
                                    : "10101"
                                }
                                style={{ minWidth: "60px", maxWidth: "80px" }}
                                type="text"
                                value={formData.connectionPort}
                                onChange={(e) => {
                                  // 只允许数字
                                  const value = e.target.value;

                                  if (
                                    /^\d*$/.test(value) &&
                                    value.length <= 5
                                  ) {
                                    updateField("connectionPort", value);
                                  }
                                }}
                              />
                            </div>
                          </RadioGroup>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-default-700 dark:text-white mb-1">
                          TLS
                        </label>
                        <RadioGroup
                          className="gap-2"
                          orientation="horizontal"
                          size="sm"
                          value={formData.tlsLevel}
                          onValueChange={(value) =>
                            updateField("tlsLevel", value)
                          }
                        >
                          {tlsLevels.map((level) => (
                            <Tooltip
                              key={level.value}
                              content={level.description}
                              placement="right"
                              size="sm"
                            >
                              <Radio className="text-xs" value={level.value}>
                                {level.label}
                              </Radio>
                            </Tooltip>
                          ))}
                        </RadioGroup>
                      </div>

                      {/* TLS 2 的证书配置 */}
                      {formData.tlsLevel === "2" && (
                        <>
                          <div>
                            <label className="block text-xs text-default-700 dark:text-white mb-1">
                              服务端证书路径
                            </label>
                            <input
                              className="w-full px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-900 dark:text-black placeholder-default-400 dark:placeholder-default-500"
                              placeholder="/path/to/cert.pem"
                              type="text"
                              value={formData.certPath}
                              onChange={(e) =>
                                updateField("certPath", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-default-700 dark:text-white mb-1">
                              服务端密钥路径
                            </label>
                            <input
                              className="w-full px-1 py-1 text-xs border border-default-300 dark:border-default-600 rounded bg-white dark:bg-default-900 text-default-900 dark:text-black placeholder-default-400 dark:placeholder-default-500"
                              placeholder="/path/to/key.pem"
                              type="text"
                              value={formData.keyPath}
                              onChange={(e) =>
                                updateField("keyPath", e.target.value)
                              }
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 第三个节点 */}
              <div className="col-span-1 flex flex-col items-center">
                {renderNodeWithForm(flowConfig[2], 2, !isExtendedMode)}
              </div>

              {/* 扩展模式下的额外箭头和节点 */}
              {isExtendedMode && (
                <>
                  {/* 第三个箭头 */}
                  <div className="col-span-1 flex flex-col items-center pt-8">
                    <div className="text-xs text-default-500 mb-2">转发</div>
                    <svg
                      className="text-blue-600"
                      height="14"
                      viewBox="0 0 120 14"
                      width="120"
                    >
                      {/* 双向箭头横线 */}
                      <line
                        stroke="currentColor"
                        strokeWidth="2"
                        x1="10"
                        x2="110"
                        y1="7"
                        y2="7"
                      />

                      {/* 左箭头 */}
                      <polygon fill="currentColor" points="10,7 18,4 18,10" />
                      {/* 右箭头 */}
                      <polygon
                        fill="currentColor"
                        points="110,7 102,4 102,10"
                      />
                    </svg>
                  </div>

                  {/* 第四个节点 */}
                  <div className="col-span-1 flex flex-col items-center">
                    {renderNodeWithForm(flowConfig[3], 3, true)}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 场景说明 */}
          <div className="mt-6 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 rounded-full text-sm text-default-600">
              <FontAwesomeIcon
                className="text-primary"
                icon={faArrowsLeftRight}
              />
              {selectedMode === "single" && generateSingleModeDescription()}
              {selectedMode === "double" && generateDoubleModeDescription()}
              {selectedMode === "intranet" && generateIntranetModeDescription()}
            </div>
          </div>
        </CardBody>
      </Card>
    );
  };

  const renderAdditionalInfo = () => {
    const infoConfig = {
      single: {
        color: "primary",
        title: "单端转发说明",
        content:
          "单端转发模式适用于简单的端口转发需求，用户连接到客户端指定端口，流量通过轻量连接池转发至目标服务",
      },
      double: {
        color: "success",
        title: "双端转发说明",
        content:
          "双端转发模式适用于安全要求的中转需求，用户连接到客户端指定端口，流量通过完整连接池转发至目标服务",
      },
      intranet: {
        color: "secondary",
        title: "内网穿透说明",
        content:
          "内网穿透模式适用于安全要求的穿透需求，用户连接到服务端指定端口，流量通过完整连接池转发至目标服务",
      },
    };

    const info = infoConfig[selectedMode as keyof typeof infoConfig];

    if (!info) return null;

    return (
      <Card>
        <CardBody className="p-4">
          <h4
            className={`font-bold mb-2 ${
              info.color === "primary"
                ? "text-primary"
                : info.color === "success"
                  ? "text-success"
                  : info.color === "secondary"
                    ? "text-secondary"
                    : "text-default"
            }`}
          >
            {info.title}
          </h4>
          <p className="text-default-600 text-sm">{info.content}</p>
        </CardBody>
      </Card>
    );
  };

  const generateCommand = () => {
    switch (selectedMode) {
      case "single":
        // 根据目标监听类型使用不同的目标IP
        const targetIp =
          formData.targetListenType === "local"
            ? "127.0.0.1"
            : formData.exitIp || "127.0.0.1";

        return `nodepass "server://:${formData.userPort}/${targetIp}:${formData.exitPort}?log=${formData.logLevel}&tls=${formData.tlsLevel}"`;
      case "double":
        return `nodepass "server://:${formData.userPort}?log=${formData.logLevel}&tls=${formData.tlsLevel}" && nodepass "client://${formData.masterServer}:${formData.connectionPort}/${formData.targetMaster}:${formData.exitPort}"`;
      case "intranet":
        return `nodepass "client://${formData.masterServer}:10101/127.0.0.1:${formData.userPort}?log=${formData.logLevel}&tls=${formData.tlsLevel}"`;
      default:
        return "";
    }
  };

  // 构建模板创建请求
  const buildTemplateRequest = (): TemplateCreateRequest | null => {
    const getEndpointIdByName = (name: string): number => {
      const endpoint = endpoints.find((ep) => ep.name === name);

      return endpoint ? endpoint.id : 0;
    };

    // 用户监听地址逻辑：全部IP为空字符串，指定IP为具体地址
    const getUserListenHost = (): string => {
      return formData.userListenType === "all"
        ? ""
        : formData.userListenAddress;
    };

    // 目标地址逻辑：本地为127.0.0.1，外部为具体地址
    const getTargetHost = (): string => {
      return formData.targetListenType === "local"
        ? "127.0.0.1"
        : formData.exitIp;
    };

    switch (selectedMode) {
      case "single":
        // 验证必填字段
        const singleNeedExitIp = formData.targetListenType === "external";
        const singleNeedListenAddress = formData.userListenType === "assign";

        if (
          !formData.userPort ||
          !formData.masterServer ||
          !formData.exitPort ||
          (singleNeedExitIp && !formData.exitIp) ||
          (singleNeedListenAddress && !formData.userListenAddress)
        ) {
          return null;
        }

        return {
          log: formData.logLevel,
          listen_host: getUserListenHost(),
          listen_port: parseInt(formData.userPort),
          mode: "single",
          inbounds: {
            target_host: getTargetHost(),
            target_port: parseInt(formData.exitPort),
            master_id: getEndpointIdByName(formData.masterServer),
            type: "client",
          },
        };

      case "double":
        // 验证必填字段
        const doubleNeedExitIp = formData.targetListenType === "external";
        const doubleNeedListenAddress = formData.userListenType === "assign";

        if (
          !formData.userPort ||
          !formData.masterServer ||
          !formData.targetMaster ||
          !formData.connectionPort ||
          !formData.exitPort ||
          (doubleNeedExitIp && !formData.exitIp) ||
          (doubleNeedListenAddress && !formData.userListenAddress)
        ) {
          return null;
        }

        const doubleRequest: TemplateCreateRequest = {
          log: formData.logLevel,
          listen_port: parseInt(formData.connectionPort), // 连接配置的监听端口
          mode: "bothway",
          tls: parseInt(formData.tlsLevel),
          inbounds: {
            target_host: getUserListenHost(), // 用户节点的访问策略，空字符串表示全部IP
            target_port: parseInt(formData.userPort), // 用户节点的访问端口
            master_id: getEndpointIdByName(formData.targetMaster), // 客户端
            type: "client",
          },
          outbounds: {
            target_host: getTargetHost(), // 目标节点的访问策略
            target_port: parseInt(formData.exitPort), // 目标节点的目标端口
            master_id: getEndpointIdByName(formData.masterServer), // 服务端
            type: "server",
          },
        };

        // 如果是TLS 2，添加证书路径
        if (formData.tlsLevel === "2") {
          doubleRequest.cert_path = formData.certPath;
          doubleRequest.key_path = formData.keyPath;
        }

        return doubleRequest;

      case "intranet":
        // 验证必填字段
        const intranetNeedExitIp = formData.targetListenType === "external";

        if (
          !formData.connectionPort ||
          !formData.masterServer ||
          !formData.intranetTargetMaster ||
          !formData.exitPort ||
          (intranetNeedExitIp && !formData.exitIp)
        ) {
          return null;
        }

        const intranetRequest: TemplateCreateRequest = {
          log: formData.logLevel,
          listen_port: parseInt(formData.connectionPort), // 连接配置的监听端口
          mode: "intranet",
          tls: parseInt(formData.tlsLevel),
          inbounds: {
            target_host: getUserListenHost(), // 用户节点的访问策略，空字符串表示全部IP
            target_port: parseInt(formData.userPort), // 用户节点的访问端口
            master_id: getEndpointIdByName(formData.masterServer), // 服务端
            type: "server",
          },
          outbounds: {
            target_host: getTargetHost(), // 目标节点的访问策略
            target_port: parseInt(formData.exitPort), // 目标节点的目标端口
            master_id: getEndpointIdByName(formData.intranetTargetMaster), // 客户端
            type: "client",
          },
        };

        // 如果是TLS 2，添加证书路径
        if (formData.tlsLevel === "2") {
          intranetRequest.cert_path = formData.certPath;
          intranetRequest.key_path = formData.keyPath;
        }

        return intranetRequest;

      default:
        return null;
    }
  };

  // 移除了前端的分组创建逻辑，现在由后端自动处理

  // 处理创建应用
  const handleCreateApplication = async () => {
    const requestData = buildTemplateRequest();

    if (!requestData) {
      addToast({
        title: "表单验证失败",
        description: "请填写完整的表单信息",
        color: "warning",
      });

      return;
    }

    setCreating(true);

    // 显示进度提示
    addToast({
      timeout: 1,
      title: "正在创建场景中...",
      description: "正在创建隧道，请稍候",
      color: "primary",
    });

    try {
      // 第一步：创建隧道
      const response = await fetch(buildApiUrl("/api/tunnels/template"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "创建隧道失败");
      }

      addToast({
        title: "创建成功！",
        description: `${result.message || "隧道已成功创建"}`,
        color: "success",
      });

      // 延迟跳转到分组页面
      setTimeout(() => {
        navigate("/tunnels");
      }, 1500);
    } catch (error) {
      console.error("创建失败:", error);
      addToast({
        title: "创建失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-4">
          <div>
            <h1 className="text-2xl font-bold">NodePass 隧道模板创建器</h1>
            <p className="text-default-500 text-sm">使用预定义模板快速创建和配置NodePass隧道连接</p>
          </div>
        </div>
      </div> */}

      {renderModeSelector()}

      {selectedMode && (
        <div className="space-y-6">
          {renderFlowDiagram()}

          {renderAdditionalInfo()}

          {showPreview && (
            <Card className="bg-default-900 dark:bg-default-100/10">
              <CardBody className="p-4">
                <div className="text-default-400 dark:text-default-500 text-sm mb-2">
                  # 生成的NodePass命令:
                </div>
                <div className="text-success-400 dark:text-success-300 font-mono text-sm break-all">
                  {generateCommand()}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
