import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Select,
  SelectItem,
  Card,
  CardBody,
  cn,
  VisuallyHidden,
  useSwitch,
  Tooltip,
  Textarea,
  NumberInput,
  Divider,
  Tabs,
  Tab,
} from "@heroui/react";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExchangeAlt,
  faArrowRight,
  faShield,
  faDice,
  faCirclePlus,
  faCircleQuestion,
  faLock,
  faLockOpen,
} from "@fortawesome/free-solid-svg-icons";

import { buildApiUrl } from "@/lib/utils";

// TLS 开关图标
const LockIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
  >
    <path
      d="M12.0011 1.99902C9.23662 1.99902 7.00098 4.23466 7.00098 6.99902V9.99902H6.00098C4.89641 9.99902 4.00098 10.8944 4.00098 11.999V19.999C4.00098 21.1036 4.89641 21.999 6.00098 21.999H18.001C19.1055 21.999 20.001 21.1036 20.001 19.999V11.999C20.001 10.8944 19.1055 9.99902 18.001 9.99902H17.001V6.99902C17.001 4.23466 14.7653 1.99902 12.0011 1.99902ZM15.001 9.99902H9.00098V6.99902C9.00098 5.33916 10.3411 3.99902 12.0011 3.99902C13.661 3.99902 15.001 5.33916 15.001 6.99902V9.99902Z"
      fill="currentColor"
    />
  </svg>
);

const UnlockIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
  >
    <path
      d="M7.00098 9.99902V6.99902C7.00098 4.23466 9.23662 1.99902 12.0011 1.99902C14.1444 1.99902 15.9637 3.33904 16.6787 5.21674C16.8937 5.78024 17.5219 6.07959 18.0854 5.86459C18.6489 5.64959 18.9483 5.02135 18.7333 4.45785C17.7456 1.88345 15.1129 -0.000976562 12.0011 -0.000976562C8.13188 -0.000976562 5.00098 3.13 5.00098 6.99902V9.99902H4.00098C2.89641 9.99902 2.00098 10.8944 2.00098 11.999V19.999C2.00098 21.1036 2.89641 21.999 4.00098 21.999H16.001C17.1055 21.999 18.001 21.1036 18.001 19.999V11.999C18.001 10.8944 17.1055 9.99902 16.001 9.99902H7.00098Z"
      fill="currentColor"
    />
  </svg>
);

// 本地/外部切换图标
const ExternalIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
  >
    <path
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
      fill="currentColor"
    />
  </svg>
);

const LocalIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    focusable="false"
    height="1em"
    role="presentation"
    viewBox="0 0 24 24"
    width="1em"
  >
    <path
      d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
      fill="currentColor"
      opacity="0.3"
    />
  </svg>
);

// 自定义 Switch 组件（仅图标，内联版本）
const InlineSwitch = ({
  isSelected,
  onValueChange,
  onIcon,
  offIcon,
  color = "default",
}: {
  isSelected: boolean;
  onValueChange: (selected: boolean) => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  color?: "default" | "success" | "warning";
}) => {
  const { Component, getBaseProps, getInputProps, getWrapperProps } =
    useSwitch({
      isSelected,
      onValueChange,
    });

  const getColorClasses = () => {
    if (!isSelected) {
      return "bg-default-100 hover:bg-default-200 text-default-500";
    }
    switch (color) {
      case "success":
        return "bg-success text-success-foreground hover:bg-success/90";
      case "warning":
        return "bg-warning text-warning-foreground hover:bg-warning/90";
      default:
        return "bg-primary text-primary-foreground hover:bg-primary/90";
    }
  };

  return (
    <Component {...getBaseProps()}>
      <VisuallyHidden>
        <input {...getInputProps()} />
      </VisuallyHidden>
      <div
        {...getWrapperProps()}
        className={cn(
          "w-6 h-6",
          "flex items-center justify-center",
          "rounded-md transition-colors",
          "text-[14px]",
          getColorClasses()
        )}
      >
        {isSelected ? onIcon : offIcon}
      </div>
    </Component>
  );
};

// 从 URL 中提取主机地址的辅助函数
const extractHostFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);

    return urlObj.hostname;
  } catch {
    return url; // 如果解析失败，返回原始字符串
  }
};

interface EndpointSimple {
  id: string;
  name: string;
  version: string;
  tls: string;
  log: string;
  crt: string;
  keyPath: string;
  url?: string;
}

interface TemplateCreateRequest {
  log: string;
  listen_host?: string;
  listen_port: number;
  mode: string;
  tls?: number;
  cert_path?: string;
  key_path?: string;
  tunnel_name?: string;
  service_type?: number; // 服务类型 0-7
  listen_type?: string; // 监听类型 TCP/UDP/ALL
  extend_target_address?: string[]; // 扩展目标地址（负载均衡）
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

export type ScenarioType =
  | "single-forward"
  | "tunnel-forward"
  | "nat-penetration";

/**
 * 服务类型定义 (0-7)
 * 0: 通用单端转发
 * 1: 本地内网穿透
 * 2: 本地隧道转发
 * 3: 外部内网穿透
 * 4: 外部隧道转发
 * 5: 均衡单端转发
 * 6: 均衡内网穿透
 * 7: 均衡隧道转发
 */
export const SERVICE_TYPE_LABELS: Record<number, string> = {
  0: "通用单端转发",
  1: "本地内网穿透",
  2: "本地隧道转发",
  3: "外部内网穿透",
  4: "外部隧道转发",
  5: "均衡单端转发",
  6: "均衡内网穿透",
  7: "均衡隧道转发",
};

export const SERVICE_TYPE_COLORS: Record<number, "primary" | "success" | "secondary" | "warning" | "default"> = {
  0: "primary",    // 单端转发 - 蓝色
  1: "success",    // 内网穿透 - 绿色
  2: "secondary",  // 隧道转发 - 紫色
  3: "success",    // 外部内网穿透 - 绿色
  4: "secondary",  // 外部隧道转发 - 紫色
  5: "warning",    // 均衡单端转发 - 橙色
  6: "warning",    // 均衡内网穿透 - 橙色
  7: "warning",    // 均衡隧道转发 - 橙色
};

interface ScenarioCreateModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  scenarioType?: ScenarioType;
}

// 场景配置预设
const scenarioConfigs = {
  "single-forward": {
    title: "单端转发",
    icon: faArrowRight,
  },
  "tunnel-forward": {
    title: "隧道转发",
    icon: faExchangeAlt,
  },
  "nat-penetration": {
    title: "内网穿透",
    icon: faShield,
  },
} as const;

/**
 * 场景创建模态框组件
 */
export default function ScenarioCreateModal({
  isOpen,
  onOpenChange,
  onSaved,
  scenarioType,
}: ScenarioCreateModalProps) {
  const [endpoints, setEndpoints] = useState<EndpointSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const selectedScenario = scenarioType || null;
  const [isEnableExtendTargets, setEnableExtendTargets] = useState(false);
  const [isEnableExtendTargets2, setEnableExtendTargets2] = useState(false);
  const [isEnableExtendTargetsSingle, setEnableExtendTargetsSingle] = useState(false);

  // 表单数据 - 根据不同场景使用不同的字段结构
  const [formData, setFormData] = useState({
    // 通用字段
    tunnelName: "",
    listenType: "ALL", // ALL | TCP | UDP
    logLevel: "", // 空值表示继承，其他值：debug, info, warn, error, event, none

    // NAT穿透字段
    publicServerEndpoint: "",
    publicListenPort: "",
    publicTunnelPort: "",
    localServerEndpoint: "",
    localServicePort: "",
    localTargetHost: "",
    natTlsEnabled: false,
    natTargetExternal: false,
    extendTargetAddresses: "",

    // 单端转发字段
    relayServerEndpoint: "",
    relayListenPort: "",
    targetServerAddress: "",
    targetServicePort: "",
    singleTargetExternal: false,
    extendTargetAddressesSingle: "",

    // 双端转发字段
    relayServerEndpoint2: "",
    relayListenPort2: "",
    relayTunnelPort2: "",
    targetServerEndpoint2: "",
    targetServicePort2: "",
    targetAddress2: "",
    doubleTlsEnabled: false,
    doubleTargetExternal: false,
    extendTargetAddresses2: "",
  });

  // 加载端点数据
  useEffect(() => {
    if (!isOpen) return;

    const fetchEndpoints = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          buildApiUrl("/api/endpoints/simple?excludeFailed=true"),
        );
        const data = await res.json();

        setEndpoints(data);
        if (data.length) {
          // 为单端转发和双端转发场景设置默认主控，NAT穿透不设置默认值
          const defaultEndpoint = String(data[0].id);

          setFormData((prev) => ({
            ...prev,
            // publicServerEndpoint: "", // NAT穿透公网服务器不设默认值
            // localServerEndpoint: "", // NAT穿透本地服务器不设默认值
            // relayServerEndpoint: "", // 单端转发中转服务器不设默认值
            // relayServerEndpoint2: defaultEndpoint,  // 隧道转发公网服务器不设默认值
            // targetServerEndpoint2: defaultEndpoint,  // 隧道转发公网服务器不设默认值
          }));
        }
      } catch (err) {
        addToast({
          title: "获取主控失败",
          description: "无法获取主控列表",
          color: "danger",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchEndpoints();
  }, [isOpen]);

  const handleField = (field: string, value: string | boolean) => {
    console.log("handleField called:", field, value);
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };

      console.log("Updated formData:", newData);

      return newData;
    });
  };

  // 构建模板创建请求
  const buildTemplateRequest = (): TemplateCreateRequest | null => {
    const getEndpointIdByName = (endpointId: string): number => {
      return Number(endpointId);
    };

    switch (selectedScenario) {
      case "single-forward":
        // 单端转发场景
        if (
          !formData.relayServerEndpoint ||
          !formData.relayListenPort ||
          !formData.targetServicePort ||
          (formData.singleTargetExternal && !formData.targetServerAddress)
        ) {
          return null;
        }

        // 单端转发: 0=通用, 5=均衡
        const singleServiceType = isEnableExtendTargetsSingle ? 5 : 0;

        // 处理扩展目标地址
        const extendAddressesSingle = isEnableExtendTargetsSingle && formData.extendTargetAddressesSingle
          ? formData.extendTargetAddressesSingle.split("\n").filter(addr => addr.trim()).map(addr => addr.trim())
          : undefined;

        return {
          log: formData.logLevel || "debug",
          listen_host: "",
          listen_port: parseInt(formData.relayListenPort),
          mode: "single",
          tunnel_name: formData.tunnelName,
          service_type: singleServiceType,
          listen_type: formData.listenType && formData.listenType !== "ALL" ? formData.listenType : undefined,
          extend_target_address: extendAddressesSingle,
          inbounds: {
            target_host: formData.singleTargetExternal ? formData.targetServerAddress : "127.0.0.1",
            target_port: parseInt(formData.targetServicePort),
            master_id: getEndpointIdByName(formData.relayServerEndpoint),
            type: "client",
          },
        };

      case "tunnel-forward":
        // 双端转发场景
        if (
          !formData.relayServerEndpoint2 ||
          !formData.relayListenPort2 ||
          !formData.relayTunnelPort2 ||
          !formData.targetServerEndpoint2 ||
          !formData.targetServicePort2 ||
          (formData.doubleTargetExternal && !formData.targetAddress2)
        ) {
          return null;
        }

        // 隧道转发: 2=本地, 4=外部, 7=均衡
        const tunnelServiceType = isEnableExtendTargets2 ? 7 : (formData.doubleTargetExternal ? 4 : 2);

        // 处理扩展目标地址
        const extendAddresses2 = isEnableExtendTargets2 && formData.extendTargetAddresses2
          ? formData.extendTargetAddresses2.split("\n").filter(addr => addr.trim()).map(addr => addr.trim())
          : undefined;

        const doubleRequest: TemplateCreateRequest = {
          log: formData.logLevel || "debug",
          listen_port: parseInt(formData.relayTunnelPort2),
          mode: "bothway",
          tls: formData.doubleTlsEnabled ? 1 : 0,
          tunnel_name: formData.tunnelName,
          service_type: tunnelServiceType,
          listen_type: formData.listenType && formData.listenType !== "ALL" ? formData.listenType : undefined,
          extend_target_address: extendAddresses2,
          inbounds: {
            target_host: "",
            target_port: parseInt(formData.relayListenPort2),
            master_id: getEndpointIdByName(formData.targetServerEndpoint2),
            type: "client",
          },
          outbounds: {
            target_host: formData.doubleTargetExternal ? formData.targetAddress2 : "127.0.0.1",
            target_port: parseInt(formData.targetServicePort2),
            master_id: getEndpointIdByName(formData.relayServerEndpoint2),
            type: "server",
          },
        };

        return doubleRequest;

      case "nat-penetration":
        // NAT穿透场景
        if (
          !formData.publicServerEndpoint ||
          !formData.publicListenPort ||
          !formData.publicTunnelPort ||
          !formData.localServerEndpoint ||
          !formData.localServicePort ||
          (formData.natTargetExternal && !formData.localTargetHost)
        ) {
          return null;
        }

        // 内网穿透: 1=本地, 3=外部, 6=均衡
        const natServiceType = isEnableExtendTargets ? 6 : (formData.natTargetExternal ? 3 : 1);

        // 处理扩展目标地址
        const extendAddresses = isEnableExtendTargets && formData.extendTargetAddresses
          ? formData.extendTargetAddresses.split("\n").filter(addr => addr.trim()).map(addr => addr.trim())
          : undefined;

        const natRequest: TemplateCreateRequest = {
          log: formData.logLevel || "debug",
          listen_port: parseInt(formData.publicTunnelPort),
          mode: "intranet",
          tls: formData.natTlsEnabled ? 1 : 0,
          tunnel_name: formData.tunnelName,
          service_type: natServiceType,
          listen_type: formData.listenType && formData.listenType !== "ALL" ? formData.listenType : undefined,
          extend_target_address: extendAddresses,
          inbounds: {
            target_host: "",
            target_port: parseInt(formData.publicListenPort),
            master_id: getEndpointIdByName(formData.publicServerEndpoint),
            type: "server",
          },
          outbounds: {
            target_host: formData.natTargetExternal ? formData.localTargetHost : "127.0.0.1",
            target_port: parseInt(formData.localServicePort),
            master_id: getEndpointIdByName(formData.localServerEndpoint),
            type: "client",
          },
        };

        return natRequest;

      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    if (!selectedScenario) {
      addToast({
        title: "无效的场景类型",
        description: "请重新打开模态窗",
        color: "warning",
      });

      return;
    }

    const { tunnelName } = formData;

    if (!tunnelName.trim()) {
      addToast({
        title: "请填写实例名称",
        description: "实例名称不能为空",
        color: "warning",
      });

      return;
    }

    const requestData = buildTemplateRequest();

    if (!requestData) {
      addToast({
        title: "表单验证失败",
        description: "请填写所有必填字段",
        color: "warning",
      });

      return;
    }

    try {
      setSubmitting(true);

      const res = await fetch(buildApiUrl("/api/services"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "创建失败");
      }

      addToast({
        title: "创建成功",
        description: `${scenarioConfigs[selectedScenario].title}场景已创建`,
        color: "success",
      });

      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      addToast({
        title: "创建失败",
        description: err instanceof Error ? err.message : "未知错误",
        color: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // NAT穿透场景表单
  const renderNATForm = () => (
    <div className="space-y-2">
      <Input
        isRequired
        placeholder="服务名称"
        value={formData.tunnelName}
        onValueChange={(v) => handleField("tunnelName", v)}
      />

      {/* 公网服务器 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-default-700">
            入口(服务端)
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-default-500">TLS</span>
            <InlineSwitch
              isSelected={formData.natTlsEnabled}
              onValueChange={(v) => handleField("natTlsEnabled", v)}
              onIcon={<FontAwesomeIcon icon={faLock} className="text-white" />}
              offIcon={<FontAwesomeIcon icon={faLockOpen} className="text-white" />}
              color="success"
            />
          </div>
        </div>
        <div className="flex flex-row items-center gap-2">
          <Select
            isRequired
            placeholder="选择入口服务器"
            classNames={{
              trigger: "bg-primary-900/40"
            }}
            selectedKeys={
              formData.publicServerEndpoint
                ? [formData.publicServerEndpoint]
                : []
            }
            onSelectionChange={(keys) =>
              handleField("publicServerEndpoint", Array.from(keys)[0] as string)
            }
          >
            {endpoints.map((ep) => (
              <SelectItem
                key={ep.id}
                textValue={ep.name}
              >
                {ep.name}
                {ep.url && ` (${extractHostFromUrl(ep.url)})`}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm">访问端口</label>
            <Input
              isRequired
              placeholder="10022"
              type="number"
              value={formData.publicListenPort}
              onValueChange={(v) => handleField("publicListenPort", v ? String(v) : "")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">隧道端口</label>
            <Input
              isRequired
              placeholder="10101"
              type="number"
              value={formData.publicTunnelPort}
              onValueChange={(v) => handleField("publicTunnelPort", v ? String(v) : "")}
              endContent={
                <Tooltip content="随机生成端口号">
                  <button
                    type="button"
                    className="focus:outline-none cursor-pointer"
                    onClick={() => {
                      const randomPort = Math.floor(Math.random() * 65536);
                      handleField("publicTunnelPort", String(randomPort));
                    }}
                  >
                    <FontAwesomeIcon
                      className="w-4 h-4 text-default-400 hover:text-default-600 transition-colors"
                      icon={faDice}
                    />
                  </button>
                </Tooltip>
              }
            />
          </div>
        </div>
      </div>

      {/* 目标服务器 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-default-700">
            出口(客户端)
          </h4>
          <Tabs
            size="sm"
            classNames={{
              tabList: "h-6 rounded-md p-0.5 gap-0",
              tab: "min-h-5 h-5 px-2 py-0",
              tabContent: "text-xs leading-5",
              cursor: "h-full rounded-sm",
            }}
            selectedKey={formData.natTargetExternal ? "external" : "local"}
            onSelectionChange={(key) =>
              handleField("natTargetExternal", key === "external")
            }
          >
            <Tab key="local" title="本地地址" />
            <Tab key="external" title="外部地址" />
          </Tabs>
        </div>
        <div className="flex flex-row items-center gap-2">
          <Select
            isRequired
            placeholder="选择出口服务器"
            color="success"
            selectedKeys={
              formData.localServerEndpoint ? [formData.localServerEndpoint] : []
            }
            onSelectionChange={(keys) =>
              handleField("localServerEndpoint", Array.from(keys)[0] as string)
            }
          >
            {endpoints.map((ep) => (
              <SelectItem
                key={ep.id}
                textValue={ep.name}
              >
                {ep.name}
                {ep.url && ` (${extractHostFromUrl(ep.url)})`}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm">目标地址</label>
            <Input
              isRequired
              readOnly={!formData.natTargetExternal}
              placeholder={formData.natTargetExternal ? "192.168.1.100" : "127.0.0.1"}
              value={formData.natTargetExternal ? formData.localTargetHost : "127.0.0.1"}
              onValueChange={(v) => handleField("localTargetHost", v)}
              endContent={
                <Tooltip content={isEnableExtendTargets ? "关闭负载均衡" : "增加目标地址"}>
                  <button
                    type="button"
                    className="focus:outline-none cursor-pointer"
                    onClick={() => {
                      const newState = !isEnableExtendTargets;
                      setEnableExtendTargets(newState);
                      // 关闭负载均衡时清空扩展目标地址
                      if (!newState) {
                        handleField("extendTargetAddresses", "");
                      }
                    }}
                  >
                    <FontAwesomeIcon
                      className={`w-5 h-5 transition-colors ${isEnableExtendTargets
                        ? "text-warning-400"
                        : "text-default-400 hover:text-default-600"
                        }`}
                      icon={faCirclePlus}
                    />
                  </button>
                </Tooltip>
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">目标端口</label>
            <Input
              isRequired
              placeholder="22"
              type="number"
              value={formData.localServicePort}
              onValueChange={(v) => handleField("localServicePort", v ? String(v) : "")}
            />
          </div>
        </div>

        {/* 扩展目标地址 */}
        {isEnableExtendTargets && (
          <Textarea
            label={
              <div className="flex items-center gap-1">
                <span>附加目标地址</span>
                <Tooltip content="通过增加目标地址达到负载均衡的效果">
                  <FontAwesomeIcon
                    className="w-4 h-4 text-default-400 cursor-help"
                    icon={faCircleQuestion}
                  />
                </Tooltip>
              </div>
            }
            placeholder="192.168.1.1:80&#10;192.168.1.2:80"
            minRows={2}
            value={formData.extendTargetAddresses}
            onValueChange={(v) => handleField("extendTargetAddresses", v)}
          />
        )}
      </div>
      <Divider className="my-3" />
      {/* 可选配置 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 监听类型 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm">监听类型</label>
          <Tabs
            classNames={{
              tabContent: "group-data-[selected=true]:text-white text-xs",
            }}
            color="secondary"
            fullWidth
            selectedKey={formData.listenType}
            onSelectionChange={(key) =>
              handleField("listenType", key as string)
            }
          >
            <Tab key="ALL" title="ALL" />
            <Tab key="TCP" title="TCP" />
            <Tab key="UDP" title="UDP" />
          </Tabs>
        </div>

        {/* 日志级别 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm">日志级别</label>
          <Select
            selectedKeys={formData.logLevel ? [formData.logLevel] : ["inherit"]}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              handleField("logLevel", selectedKey === "inherit" ? "" : selectedKey);
            }}
          >
            <SelectItem key="inherit" textValue="继承主控">
              {endpoints.find((ep) => String(ep.id) === String(formData.publicServerEndpoint))?.log
                ? `继承 (${endpoints.find((ep) => String(ep.id) === String(formData.publicServerEndpoint))?.log.toUpperCase()})`
                : "继承主控"}
            </SelectItem>
            <SelectItem key="debug" textValue="Debug">Debug</SelectItem>
            <SelectItem key="info" textValue="Info">Info</SelectItem>
            <SelectItem key="warn" textValue="Warn">Warn</SelectItem>
            <SelectItem key="error" textValue="Error">Error</SelectItem>
            <SelectItem key="event" textValue="Event">Event</SelectItem>
            <SelectItem key="none" textValue="None">None</SelectItem>
          </Select>
        </div>
      </div>
    </div>
  );

  // 单端转发场景表单
  const renderSingleForwardForm = () => (
    <div className="space-y-2">
      <Input
        isRequired
        placeholder="服务名称"
        value={formData.tunnelName}
        onValueChange={(v) => handleField("tunnelName", v)}
      />

      {/* 中转服务器 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-default-700">中转(客户端)</h4>
          <Tabs
            size="sm"
            color="warning"
            classNames={{
              tabList: "h-6 rounded-md p-0.5 gap-0",
              tab: "min-h-5 h-5 px-2 py-0",
              tabContent: "text-xs leading-5",
              cursor: "h-full rounded-sm",
            }}
            selectedKey={formData.singleTargetExternal ? "external" : "local"}
            onSelectionChange={(key) =>
              handleField("singleTargetExternal", key === "external")
            }
          >
            <Tab key="local" title="本地地址" />
            <Tab key="external" title="外部地址" />
          </Tabs>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm">中转服务器</label>
            <Select
              isRequired
              placeholder="选择中转服务器"
              selectedKeys={
                formData.relayServerEndpoint ? [formData.relayServerEndpoint] : []
              }
              onSelectionChange={(keys) =>
                handleField("relayServerEndpoint", Array.from(keys)[0] as string)
              }
            >
              {endpoints.map((ep) => (
                <SelectItem
                  key={ep.id}
                  textValue={ep.name}
                >
                  {ep.name}
                  {ep.url && ` (${extractHostFromUrl(ep.url)})`}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">访问端口</label>
            <Input
              isRequired
              placeholder="1080"
              type="number"
              value={formData.relayListenPort}
              onValueChange={(v) => handleField("relayListenPort", v ? String(v) : "")}
            />
          </div>
        </div>
      </div>

      {/* 目标服务器 */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm">目标地址</label>
            <Input
              isRequired
              readOnly={!formData.singleTargetExternal}
              placeholder={formData.singleTargetExternal ? "192.168.1.100" : "127.0.0.1"}
              value={formData.singleTargetExternal ? formData.targetServerAddress : "127.0.0.1"}
              onValueChange={(v) => handleField("targetServerAddress", v)}
              endContent={
                <Tooltip content={isEnableExtendTargetsSingle ? "关闭负载均衡" : "增加目标地址"}>
                  <button
                    type="button"
                    className="focus:outline-none cursor-pointer"
                    onClick={() => {
                      const newState = !isEnableExtendTargetsSingle;
                      setEnableExtendTargetsSingle(newState);
                      // 关闭负载均衡时清空扩展目标地址
                      if (!newState) {
                        handleField("extendTargetAddressesSingle", "");
                      }
                    }}
                  >
                    <FontAwesomeIcon
                      className={`w-5 h-5 transition-colors ${isEnableExtendTargetsSingle
                        ? "text-warning-400"
                        : "text-default-400 hover:text-default-600"
                        }`}
                      icon={faCirclePlus}
                    />
                  </button>
                </Tooltip>
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">目标端口</label>
            <Input
              isRequired
              placeholder="3306"
              type="number"
              value={formData.targetServicePort}
              onValueChange={(v) => handleField("targetServicePort", v ? String(v) : "")}
            />
          </div>
        </div>

        {/* 扩展目标地址 */}
        {isEnableExtendTargetsSingle && (
          <Textarea
            label={
              <div className="flex items-center gap-1">
                <span>附加目标地址</span>
                <Tooltip content="通过增加目标地址达到负载均衡的效果">
                  <FontAwesomeIcon
                    className="w-4 h-4 text-default-400 cursor-help"
                    icon={faCircleQuestion}
                  />
                </Tooltip>
              </div>
            }
            placeholder="192.168.1.1:80&#10;192.168.1.2:80"
            minRows={2}
            value={formData.extendTargetAddressesSingle}
            onValueChange={(v) => handleField("extendTargetAddressesSingle", v)}
          />
        )}
      </div>

      <Divider className="my-3" />
      {/* 可选配置 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 监听类型 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm">监听类型</label>
          <Tabs
            classNames={{
              tabContent: "group-data-[selected=true]:text-white text-xs",
            }}
            color="secondary"
            fullWidth
            selectedKey={formData.listenType}
            onSelectionChange={(key) =>
              handleField("listenType", key as string)
            }
          >
            <Tab key="ALL" title="ALL" />
            <Tab key="TCP" title="TCP" />
            <Tab key="UDP" title="UDP" />
          </Tabs>
        </div>

        {/* 日志级别 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm">日志级别</label>
          <Select
            selectedKeys={formData.logLevel ? [formData.logLevel] : ["inherit"]}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              handleField("logLevel", selectedKey === "inherit" ? "" : selectedKey);
            }}
          >
            <SelectItem key="inherit" textValue="继承主控">
              {endpoints.find((ep) => String(ep.id) === String(formData.relayServerEndpoint))?.log
                ? `继承 (${endpoints.find((ep) => String(ep.id) === String(formData.relayServerEndpoint))?.log.toUpperCase()})`
                : "继承主控"}
            </SelectItem>
            <SelectItem key="debug" textValue="Debug">Debug</SelectItem>
            <SelectItem key="info" textValue="Info">Info</SelectItem>
            <SelectItem key="warn" textValue="Warn">Warn</SelectItem>
            <SelectItem key="error" textValue="Error">Error</SelectItem>
            <SelectItem key="event" textValue="Event">Event</SelectItem>
            <SelectItem key="none" textValue="None">None</SelectItem>
          </Select>
        </div>
      </div>
    </div>
  );

  // 双端转发场景表单
  const renderTunnelForwardForm = () => (
    <div className="space-y-2">
      <Input
        isRequired
        placeholder="服务名称"
        value={formData.tunnelName}
        onValueChange={(v) => handleField("tunnelName", v)}
      />

      {/* 入口服务器 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-default-700">入口(客户端)</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-default-500">TLS</span>
            <InlineSwitch
              isSelected={formData.doubleTlsEnabled}
              onValueChange={(v) => handleField("doubleTlsEnabled", v)}
              onIcon={<FontAwesomeIcon icon={faLock} className="text-white" />}
              offIcon={<FontAwesomeIcon icon={faLockOpen} className="text-white" />}
              color="success"
            />
          </div>
        </div>
        <div className="flex flex-row items-center gap-2">
          <Select
            isRequired
            placeholder="选择入口服务器"
            classNames={{
              trigger: "bg-primary-900/40"
            }}
            selectedKeys={
              formData.targetServerEndpoint2 ? [formData.targetServerEndpoint2] : []
            }
            onSelectionChange={(keys) =>
              handleField(
                "targetServerEndpoint2",
                Array.from(keys)[0] as string,
              )
            }
          >
            {endpoints.map((ep) => (
              <SelectItem
                key={ep.id}
                textValue={ep.name}
              >
                {ep.name}
                {ep.url && ` (${extractHostFromUrl(ep.url)})`}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm">访问端口</label>
            <Input
              fullWidth
              isRequired
              placeholder="10022"
              type="number"
              value={formData.relayListenPort2}
              onValueChange={(v) => handleField("relayListenPort2", v ? String(v) : "")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">隧道端口</label>
            <Input
              fullWidth
              isRequired
              placeholder="10101"
              type="number"
              value={formData.relayTunnelPort2}
              onValueChange={(v) => handleField("relayTunnelPort2", v ? String(v) : "")}
              endContent={
                <Tooltip content="随机生成端口号">
                  <button
                    type="button"
                    className="focus:outline-none cursor-pointer"
                    onClick={() => {
                      const randomPort = Math.floor(Math.random() * 65536);
                      handleField("relayTunnelPort2", String(randomPort));
                    }}
                  >
                    <FontAwesomeIcon
                      className="w-4 h-4 text-default-400 hover:text-default-600 transition-colors"
                      icon={faDice}
                    />
                  </button>
                </Tooltip>
              }
            />
          </div>
        </div>
      </div>

      {/* 出口服务器 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-default-700">
            出口(服户端)
          </h4>
          <Tabs
            size="sm"
            classNames={{
              tabList: "h-6 rounded-md p-0.5 gap-0",
              tab: "min-h-5 h-5 px-2 py-0",
              tabContent: "text-xs leading-5",
              cursor: "h-full rounded-sm",
            }}
            selectedKey={formData.doubleTargetExternal ? "external" : "local"}
            onSelectionChange={(key) =>
              handleField("doubleTargetExternal", key === "external")
            }
          >
            <Tab key="local" title="本地地址" />
            <Tab key="external" title="外部地址" />
          </Tabs>
        </div>
        <div className="flex flex-row items-center gap-2">
          <Select
            isRequired
            color="success"
            placeholder="选择出口服务器"
            selectedKeys={
              formData.relayServerEndpoint2
                ? [formData.relayServerEndpoint2]
                : []
            }
            onSelectionChange={(keys) =>
              handleField("relayServerEndpoint2", Array.from(keys)[0] as string)
            }
          >
            {endpoints.map((ep) => (
              <SelectItem
                key={ep.id}
                textValue={ep.name}
              >
                {ep.name}
                {ep.url && ` (${extractHostFromUrl(ep.url)})`}
              </SelectItem>
            ))}
          </Select>

        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm">目标地址</label>
            <Input
              isRequired
              readOnly={!formData.doubleTargetExternal}
              placeholder={formData.doubleTargetExternal ? "192.168.1.100" : "127.0.0.1"}
              value={formData.doubleTargetExternal ? formData.targetAddress2 : "127.0.0.1"}
              onValueChange={(v) => handleField("targetAddress2", v)}
              endContent={
                <Tooltip content={isEnableExtendTargets2 ? "关闭负载均衡" : "增加目标地址"}>
                  <button
                    type="button"
                    className="focus:outline-none cursor-pointer"
                    onClick={() => {
                      const newState = !isEnableExtendTargets2;
                      setEnableExtendTargets2(newState);
                      // 关闭负载均衡时清空扩展目标地址
                      if (!newState) {
                        handleField("extendTargetAddresses2", "");
                      }
                    }}
                  >
                    <FontAwesomeIcon
                      className={`w-5 h-5 transition-colors ${isEnableExtendTargets2
                        ? "text-warning-400"
                        : "text-default-400 hover:text-default-600"
                        }`}
                      icon={faCirclePlus}
                    />
                  </button>
                </Tooltip>
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm">目标端口</label>
            <Input
              fullWidth
              isRequired
              placeholder="1080"
              type="number"
              value={formData.targetServicePort2}
              onValueChange={(v) => handleField("targetServicePort2", v ? String(v) : "")}
            />
          </div>
        </div>

        {/* 扩展目标地址 */}
        {isEnableExtendTargets2 && (
          <Textarea
            label={
              <div className="flex items-center gap-1">
                <span>附加目标地址</span>
                <Tooltip content="通过增加目标地址达到负载均衡的效果">
                  <FontAwesomeIcon
                    className="w-4 h-4 text-default-400 cursor-help"
                    icon={faCircleQuestion}
                  />
                </Tooltip>
              </div>
            }
            placeholder="192.168.1.1:80&#10;192.168.1.2:80"
            minRows={2}
            value={formData.extendTargetAddresses2}
            onValueChange={(v) => handleField("extendTargetAddresses2", v)}
          />
        )}
      </div>

      <Divider className="my-3" />
      {/* 可选配置 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 监听类型 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm">监听类型</label>
          <Tabs
            classNames={{
              tabContent: "group-data-[selected=true]:text-white text-xs",
            }}
            color="secondary"
            fullWidth
            selectedKey={formData.listenType}
            onSelectionChange={(key) =>
              handleField("listenType", key as string)
            }
          >
            <Tab key="ALL" title="ALL" />
            <Tab key="TCP" title="TCP" />
            <Tab key="UDP" title="UDP" />
          </Tabs>
        </div>

        {/* 日志级别 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm">日志级别</label>
          <Select
            selectedKeys={formData.logLevel ? [formData.logLevel] : ["inherit"]}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              handleField("logLevel", selectedKey === "inherit" ? "" : selectedKey);
            }}
          >
            <SelectItem key="inherit" textValue="继承主控">
              {endpoints.find((ep) => String(ep.id) === String(formData.relayServerEndpoint2))?.log
                ? `继承 (${endpoints.find((ep) => String(ep.id) === String(formData.relayServerEndpoint2))?.log.toUpperCase()})`
                : "继承主控"}
            </SelectItem>
            <SelectItem key="debug" textValue="Debug">Debug</SelectItem>
            <SelectItem key="info" textValue="Info">Info</SelectItem>
            <SelectItem key="warn" textValue="Warn">Warn</SelectItem>
            <SelectItem key="error" textValue="Error">Error</SelectItem>
            <SelectItem key="event" textValue="Event">Event</SelectItem>
            <SelectItem key="none" textValue="None">None</SelectItem>
          </Select>
        </div>
      </div>
    </div>
  );

  // 单端转发架构图预览
  const renderSingleForwardPreview = () => {
    // 获取选中的主控信息用于显示IP
    const relayEndpoint = endpoints.find(
      (ep) => String(ep.id) === String(formData.relayServerEndpoint),
    );

    return (
      <div>
        <div className="flex items-center justify-between h-24 px-4">
          {/* 客户端/本地 */}
          <div className="flex flex-col items-center">
            <Icon
              className="text-4xl text-default-600"
              icon="solar:monitor-smartphone-bold-duotone"
            />
          </div>

          {/* 箭头 */}
          <Icon
            className="text-2xl text-default-400"
            icon="tabler:arrow-big-right-filled"
          />

          {/* 中转服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
              {/* {relayEndpoint
                ? relayEndpoint.url
                  ? extractHostFromUrl(relayEndpoint.url)
                  : relayEndpoint.name
                : "选择"} */}
              {
                relayEndpoint
                  ? relayEndpoint.name
                  : "选择"
              }
            </span>
            <Icon
              className="text-3xl text-primary"
              icon="ph:airplane-taxiing-fill"
            />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.relayListenPort || "1080"}
            </span>
          </div>

          {/* 箭头 */}
          <Icon
            className="text-2xl text-default-400"
            icon="tabler:arrow-big-right-filled"
          />

          {/* 目标服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1">
                            {formData.targetServerAddress || "192.168.1.100"}
            </span>
            <Icon
              className="text-3xl text-success"
              icon="ph:airplane-landing-fill"
            />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.targetServicePort || "3306"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // NAT穿透架构图预览
  const renderNATPreview = () => {
    const publicEndpoint = endpoints.find(
      (ep) => String(ep.id) === String(formData.publicServerEndpoint),
    );
    const localEndpoint = endpoints.find(
      (ep) => String(ep.id) === String(formData.localServerEndpoint),
    );

    // Debug info
    console.log("NAT Preview Debug:", {
      publicServerEndpoint: formData.publicServerEndpoint,
      localServerEndpoint: formData.localServerEndpoint,
      publicEndpoint,
      localEndpoint,
      endpoints: endpoints.map((ep) => ({
        id: ep.id,
        name: ep.name,
        url: ep.url,
      })),
    });

    return (
      <div>
        <div className="flex items-center justify-between h-24 px-4">
          {/* 本地客户端 */}
          <div className="flex flex-col items-center">
            <Icon
              className="text-4xl text-default-600"
              icon="solar:monitor-smartphone-bold-duotone"
            />
          </div>

          {/* 箭头 */}
          <Icon
            className="text-2xl text-default-400"
            icon="tabler:arrow-big-right-filled"
          />

          {/* 公网服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
              {publicEndpoint
                ? publicEndpoint.name
                : "选择"}
            </span>
            <Icon className="text-4xl text-primary" icon="solar:cloud-bold" />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.publicListenPort || "10022"}
            </span>
          </div>


          {/* 箭头 + TLS锁 */}
          <div className="relative flex flex-col items-center">
            {formData.natTlsEnabled && (
              <div className="absolute -top-6">
                <FontAwesomeIcon className="text-sm text-default-400" icon={faLock} />
              </div>
            )}
            <Icon
              className="text-2xl text-default-400"
              icon="tabler:arrow-big-right-filled"
            />
          </div>

          {/* 隧道端口节点 - 仅在外部地址模式下显示 */}
          {formData.natTargetExternal && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
                  {localEndpoint ? localEndpoint.name : "选择"}
                </span>
                <Icon
                  className="text-4xl text-success"
                  icon="fluent:home-16-filled"
                />
                <span className="text-xs text-default-600 font-medium mt-1">
                  {formData.publicTunnelPort || "10101"}
                </span>
              </div>

              {/* 箭头 */}
              <div className="relative flex flex-col items-center">
                <Icon
                  className="text-2xl text-default-400"
                  icon="tabler:arrow-big-right-filled"
                />
              </div>
            </>
          )}

          {/* 本地服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
              {formData.natTargetExternal
                ? formData.localTargetHost || "192.168.1.100"
                : (localEndpoint ? localEndpoint.name : "选择")}
            </span>
            <Icon
              className="text-4xl text-success"
              icon="fluent:home-16-filled"
            />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.localServicePort || "22"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // 双端转发架构图预览
  const renderTunnelForwardPreview = () => {
    const relayEndpoint = endpoints.find(
      (ep) => String(ep.id) === String(formData.relayServerEndpoint2),
    );
    const targetEndpoint = endpoints.find(
      (ep) => String(ep.id) === String(formData.targetServerEndpoint2),
    );

    return (
      <div>
        <div className="flex items-center justify-between h-24 px-4">
          {/* 客户端 */}
          <div className="flex flex-col items-center">
            <Icon
              className="text-4xl text-default-600"
              icon="solar:monitor-smartphone-bold-duotone"
            />
          </div>

          {/* 箭头 */}
          <Icon
            className="text-2xl text-default-400"
            icon="tabler:arrow-big-right-filled"
          />

          {/* 中转服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
              {targetEndpoint ? targetEndpoint.name : "选择"}
            </span>
            <Icon
              className="text-3xl text-primary"
              icon="ph:airplane-taxiing-fill"
            />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.relayListenPort2 || "10022"}
            </span>
          </div>

          {/* 箭头 */}

          <div className="relative flex flex-col items-center">
            {formData.doubleTlsEnabled && (
              <div className="absolute -top-6">
                <FontAwesomeIcon className="text-sm text-default-400" icon={faLock} />
              </div>
            )}
            <Icon
              className="text-2xl text-default-400"
              icon="tabler:arrow-big-right-filled"
            />
          </div>
          {/* 隧道端口节点 - 仅在外部地址模式下显示 */}
          {formData.doubleTargetExternal && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
                  {relayEndpoint ? relayEndpoint.name : "选择"}
                </span>
                <Icon
                  className="text-3xl text-primary"
                  icon="ph:airplane-taxiing-fill"
                />
                <span className="text-xs text-default-600 font-medium mt-1">
                  {formData.relayTunnelPort2 || "10101"}
                </span>
              </div>

              {/* 箭头 + TLS锁 */}
              <Icon
                className="text-2xl text-default-400"
                icon="tabler:arrow-big-right-filled"
              />
            </>
          )}

          {/* 目标服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1 max-w-[120px] text-center break-all leading-tight">
              {formData.doubleTargetExternal
                ? formData.targetAddress2 || "192.168.1.100"
                : (relayEndpoint ? relayEndpoint.name : "选择")}
            </span>
            <Icon
              className="text-3xl text-success"
              icon="ph:airplane-landing-fill"
            />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.targetServicePort2 || "1080"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // 预览区域
  const renderPreview = () => {
    // 计算入口和出口信息
    const getEntryExit = () => {
      // 构建出口地址列表（包含扩展目标地址）
      const buildExitList = (mainHost: string, port: string, extendAddresses: string) => {
        const exits = [`${mainHost}:${port}`];
        if (extendAddresses) {
          const extraHosts = extendAddresses.split("\n").filter((addr) => addr.trim());
          extraHosts.forEach((host) => {
            const trimmedHost = host.trim();
            // 如果地址已经包含端口（存在冒号），直接使用；否则添加主端口
            if (trimmedHost.includes(':')) {
              exits.push(trimmedHost);
            } else {
              exits.push(`${trimmedHost}:${port}`);
            }
          });
        }
        return exits;
      };

      if (selectedScenario === "nat-penetration") {
        const publicEndpoint = endpoints.find(
          (ep) => String(ep.id) === String(formData.publicServerEndpoint)
        );
        const entryHost = publicEndpoint?.url ? extractHostFromUrl(publicEndpoint.url) : "选择服务器";
        const entryPort = formData.publicListenPort || "10022";
        const exitHost = formData.natTargetExternal ? formData.localTargetHost || "192.168.1.100" : "127.0.0.1";
        const exitPort = formData.localServicePort || "22";
        const exitList = buildExitList(exitHost, exitPort, formData.extendTargetAddresses);
        return { entry: `${entryHost}:${entryPort}`, exit: exitList };
      } else if (selectedScenario === "single-forward") {
        const relayEndpoint = endpoints.find(
          (ep) => String(ep.id) === String(formData.relayServerEndpoint)
        );
        const entryHost = relayEndpoint?.url ? extractHostFromUrl(relayEndpoint.url) : "选择服务器";
        const entryPort = formData.relayListenPort || "1080";
        const exitHost = formData.singleTargetExternal ? formData.targetServerAddress || "192.168.1.100" : "127.0.0.1";
        const exitPort = formData.targetServicePort || "3306";
        const exitList = buildExitList(exitHost, exitPort, formData.extendTargetAddressesSingle);
        return { entry: `${entryHost}:${entryPort}`, exit: exitList };
      } else if (selectedScenario === "tunnel-forward") {
        const relayEndpoint = endpoints.find(
          (ep) => String(ep.id) === String(formData.relayServerEndpoint2)
        );
        const targetEndpoint = endpoints.find(
          (ep) => String(ep.id) === String(formData.targetServerEndpoint2),
        );
        // const entryHost = formData.targetServerEndpoint2?.url ? extractHostFromUrl(formData.targetServerEndpoint2.url) : "选择目标服务器"
        const entryHost = targetEndpoint ? targetEndpoint.url ? extractHostFromUrl(targetEndpoint.url) : targetEndpoint.name : "选择目标服务器";
        const entryPort = formData.relayListenPort2 || "10022";
        const exitHost = formData.doubleTargetExternal ? formData.targetAddress2 || "192.168.1.100" : "127.0.0.1";
        const exitPort = formData.targetServicePort2 || "1080";
        const exitList = buildExitList(exitHost, exitPort, formData.extendTargetAddresses2);
        return { entry: `${entryHost}:${entryPort}`, exit: exitList };
      }
      return { entry: "-", exit: ["-"] };
    };

    const { entry, exit } = getEntryExit();

    return (
      <div className="h-full flex flex-col">
        <Card className="flex-1">
          <CardBody className="bg-default-50">
            <h4 className="text-sm font-semibold text-default-700 mb-4">架构预览</h4>
            {selectedScenario === "single-forward" &&
              renderSingleForwardPreview()}
            {selectedScenario === "nat-penetration" && renderNATPreview()}
            {selectedScenario === "tunnel-forward" &&
              renderTunnelForwardPreview()}

            {/* 入口出口信息 */}
            <div className="mt-4 pt-4 border-t border-default-200 p-2" >
              <div className={`${selectedScenario === "single-forward" && !isEnableExtendTargetsSingle ? "grid grid-cols-2" : "flex flex-col"} gap-3`}>
                {/* 入口 */}
                <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="line-md:login" className="text-primary text-lg" />
                    <span className="text-xs font-medium text-primary">入口</span>
                  </div>
                  <div className="font-mono text-sm text-default-700 break-all">{entry}</div>
                </div>
                {/* 出口 */}
                <div className="bg-success-50 dark:bg-success-900/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon="line-md:logout" className="text-success text-lg" />
                    <span className="text-xs font-medium text-success">出口</span>
                    {exit.length > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400">
                        负载均衡
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {exit.map((addr, idx) => (
                      <div key={idx} className="font-mono text-sm text-default-700 break-all">{addr}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  };

  const renderConfigForm = () => {
    if (!selectedScenario) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左侧：表单 */}
        <div className="space-y-4">
          {selectedScenario === "nat-penetration" && renderNATForm()}
          {selectedScenario === "single-forward" && renderSingleForwardForm()}
          {selectedScenario === "tunnel-forward" && renderTunnelForwardForm()}
        </div>

        {/* 右侧：预览（移动端显示在下方） */}
        <div className="space-y-4">
          {renderPreview()}
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      placement="center"
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              {selectedScenario && (
                <>
                  <FontAwesomeIcon
                    fixedWidth
                    icon={scenarioConfigs[selectedScenario].icon}
                  />
                  {/* <Icon icon={scenarioConfigs[selectedScenario].icon} className="text-primary" /> */}
                  {(() => {
                    let prefix = "";
                    if (selectedScenario === "nat-penetration") {
                      if (isEnableExtendTargets) {
                        prefix = "均衡";
                      } else if (formData.natTargetExternal) {
                        prefix = "外部";
                      } else {
                        prefix = "本地";
                      }
                    } else if (selectedScenario === "tunnel-forward") {
                      if (isEnableExtendTargets2) {
                        prefix = "均衡";
                      } else if (formData.doubleTargetExternal) {
                        prefix = "外部";
                      } else {
                        prefix = "本地";
                      }
                    } else if (selectedScenario === "single-forward") {
                      if (isEnableExtendTargetsSingle) {
                        prefix = "均衡";
                      } else if (formData.singleTargetExternal) {
                        prefix = "外部";
                      } else {
                        prefix = "本地";
                      }
                    }
                    return prefix ? `${prefix}${scenarioConfigs[selectedScenario].title}` : scenarioConfigs[selectedScenario].title;
                  })()}
                </>
              )}
            </ModalHeader>
            <ModalBody className="space-y-4">
              {loading ? (
                <div className="flex justify-center items-center py-6">
                  <Spinner />
                </div>
              ) : (
                renderConfigForm()
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="primary"
                isDisabled={!selectedScenario}
                isLoading={submitting}
                onPress={handleSubmit}
              >
                创建
                {selectedScenario
                  ? scenarioConfigs[selectedScenario].title
                  : ""}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
