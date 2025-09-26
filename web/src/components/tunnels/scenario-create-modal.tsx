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
} from "@heroui/react";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExchangeAlt,
  faArrowRight,
  faShield,
} from "@fortawesome/free-solid-svg-icons";

import { buildApiUrl } from "@/lib/utils";
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
    title: "双端转发",
    icon: faExchangeAlt,
  },
  "nat-penetration": {
    title: "NAT穿透",
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

  // 表单数据 - 根据不同场景使用不同的字段结构
  const [formData, setFormData] = useState({
    // 通用字段
    tunnelName: "",

    // NAT穿透字段
    publicServerEndpoint: "",
    publicListenPort: "",
    publicTunnelPort: "",
    localServerEndpoint: "",
    localServicePort: "",
    natTlsType: "0",
    natCertPath: "",
    natKeyPath: "",

    // 单端转发字段
    relayServerEndpoint: "",
    relayListenPort: "",
    targetServerAddress: "",
    targetServicePort: "",

    // 双端转发字段
    relayServerEndpoint2: "",
    relayListenPort2: "",
    relayTunnelPort2: "",
    targetServerEndpoint2: "",
    targetServicePort2: "",
    doubleTlsType: "0",
    doubleCertPath: "",
    doubleKeyPath: "",
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
            relayServerEndpoint2: defaultEndpoint,
            targetServerEndpoint2: defaultEndpoint,
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

  const handleField = (field: string, value: string) => {
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
          !formData.targetServerAddress ||
          !formData.targetServicePort
        ) {
          return null;
        }

        return {
          log: "debug",
          listen_host: "",
          listen_port: parseInt(formData.relayListenPort),
          mode: "single",
          inbounds: {
            target_host: formData.targetServerAddress,
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
          !formData.targetServicePort2
        ) {
          return null;
        }

        const doubleRequest: TemplateCreateRequest = {
          log: "debug",
          listen_port: parseInt(formData.relayTunnelPort2),
          mode: "bothway",
          tls: parseInt(formData.doubleTlsType),
          inbounds: {
            target_host: "",
            target_port: parseInt(formData.relayListenPort2),
            master_id: getEndpointIdByName(formData.targetServerEndpoint2),
            type: "client",
          },
          outbounds: {
            target_host: "",
            target_port: parseInt(formData.targetServicePort2),
            master_id: getEndpointIdByName(formData.relayServerEndpoint2),
            type: "server",
          },
        };

        if (formData.doubleTlsType === "2") {
          doubleRequest.cert_path = formData.doubleCertPath;
          doubleRequest.key_path = formData.doubleKeyPath;
        }

        return doubleRequest;

      case "nat-penetration":
        // NAT穿透场景
        if (
          !formData.publicServerEndpoint ||
          !formData.publicListenPort ||
          !formData.publicTunnelPort ||
          !formData.localServerEndpoint ||
          !formData.localServicePort
        ) {
          return null;
        }

        const natRequest: TemplateCreateRequest = {
          log: "debug",
          listen_port: parseInt(formData.publicTunnelPort),
          mode: "intranet",
          tls: parseInt(formData.natTlsType),
          inbounds: {
            target_host: "",
            target_port: parseInt(formData.publicListenPort),
            master_id: getEndpointIdByName(formData.publicServerEndpoint),
            type: "server",
          },
          outbounds: {
            target_host: "127.0.0.1",
            target_port: parseInt(formData.localServicePort),
            master_id: getEndpointIdByName(formData.localServerEndpoint),
            type: "client",
          },
        };

        if (formData.natTlsType === "2") {
          natRequest.cert_path = formData.natCertPath;
          natRequest.key_path = formData.natKeyPath;
        }

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

      const res = await fetch(buildApiUrl("/api/tunnels/template"), {
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
    <div className="space-y-4">
      <Input
        isRequired
        placeholder="实例名称"
        value={formData.tunnelName}
        onValueChange={(v) => handleField("tunnelName", v)}
      />

      {/* 公网服务器 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">
          公网服务器（拥有公网IP）
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            isRequired
            label="服务器"
            placeholder="选择公网服务器"
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
              <SelectItem key={ep.id}>{ep.name}</SelectItem>
            ))}
          </Select>
          <Input
            isRequired
            label="监听端口"
            placeholder="10022"
            type="number"
            value={formData.publicListenPort}
            onValueChange={(v) => handleField("publicListenPort", v)}
          />
          <Input
            isRequired
            label="隧道端口"
            placeholder="10101"
            type="number"
            value={formData.publicTunnelPort}
            onValueChange={(v) => handleField("publicTunnelPort", v)}
          />
        </div>
      </div>

      {/* 本地服务器 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">
          本地服务器（受到NAT限制）
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            isRequired
            label="服务器"
            placeholder="选择本地服务器"
            selectedKeys={
              formData.localServerEndpoint ? [formData.localServerEndpoint] : []
            }
            onSelectionChange={(keys) =>
              handleField("localServerEndpoint", Array.from(keys)[0] as string)
            }
          >
            {endpoints.map((ep) => (
              <SelectItem key={ep.id}>{ep.name}</SelectItem>
            ))}
          </Select>
          <Input
            isRequired
            label="服务端口"
            placeholder="22"
            type="number"
            value={formData.localServicePort}
            onValueChange={(v) => handleField("localServicePort", v)}
          />
        </div>
      </div>

      {/* TLS配置 */}
      <div className="space-y-3">
        <Select
          label="TLS模式"
          selectedKeys={[formData.natTlsType]}
          onSelectionChange={(keys) =>
            handleField("natTlsType", Array.from(keys)[0] as string)
          }
        >
          <SelectItem key="0">不加密</SelectItem>
          <SelectItem key="1">自签名证书</SelectItem>
          <SelectItem key="2">自定义证书</SelectItem>
        </Select>

        {formData.natTlsType === "2" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Cert路径"
              placeholder="/path/to/cert.pem"
              value={formData.natCertPath}
              onValueChange={(v) => handleField("natCertPath", v)}
            />
            <Input
              label="Key路径"
              placeholder="/path/to/key.pem"
              value={formData.natKeyPath}
              onValueChange={(v) => handleField("natKeyPath", v)}
            />
          </div>
        )}
      </div>
    </div>
  );

  // 单端转发场景表单
  const renderSingleForwardForm = () => (
    <div className="space-y-4">
      <Input
        isRequired
        placeholder="实例名称"
        value={formData.tunnelName}
        onValueChange={(v) => handleField("tunnelName", v)}
      />

      {/* 中转服务器 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">中转服务器</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            isRequired
            label="服务器"
            placeholder="选择中转服务器"
            selectedKeys={
              formData.relayServerEndpoint ? [formData.relayServerEndpoint] : []
            }
            onSelectionChange={(keys) =>
              handleField("relayServerEndpoint", Array.from(keys)[0] as string)
            }
          >
            {endpoints.map((ep) => (
              <SelectItem key={ep.id}>{ep.name}</SelectItem>
            ))}
          </Select>
          <Input
            isRequired
            label="监听端口"
            placeholder="1080"
            type="number"
            value={formData.relayListenPort}
            onValueChange={(v) => handleField("relayListenPort", v)}
          />
        </div>
      </div>

      {/* 目标服务器 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">目标服务器</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            isRequired
            description="目标服务器的IP地址"
            label="目标地址"
            placeholder="192.168.1.100"
            value={formData.targetServerAddress}
            onValueChange={(v) => handleField("targetServerAddress", v)}
          />
          <Input
            isRequired
            label="目标端口"
            placeholder="3306"
            type="number"
            value={formData.targetServicePort}
            onValueChange={(v) => handleField("targetServicePort", v)}
          />
        </div>
      </div>
    </div>
  );

  // 双端转发场景表单
  const renderTunnelForwardForm = () => (
    <div className="space-y-4">
      <Input
        isRequired
        label="实例名称"
        placeholder="tunnel-forward-tunnel"
        value={formData.tunnelName}
        onValueChange={(v) => handleField("tunnelName", v)}
      />

      {/* 中转服务器 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">中转服务器</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            isRequired
            label="服务器"
            selectedKeys={[formData.relayServerEndpoint2]}
            onSelectionChange={(keys) =>
              handleField("relayServerEndpoint2", Array.from(keys)[0] as string)
            }
          >
            {endpoints.map((ep) => (
              <SelectItem key={ep.id}>{ep.name}</SelectItem>
            ))}
          </Select>
          <Input
            isRequired
            label="监听端口"
            placeholder="10022"
            type="number"
            value={formData.relayListenPort2}
            onValueChange={(v) => handleField("relayListenPort2", v)}
          />
          <Input
            isRequired
            label="隧道端口"
            placeholder="10101"
            type="number"
            value={formData.relayTunnelPort2}
            onValueChange={(v) => handleField("relayTunnelPort2", v)}
          />
        </div>
      </div>

      {/* 目标服务器 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-default-700">目标服务器</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            isRequired
            label="服务器"
            selectedKeys={[formData.targetServerEndpoint2]}
            onSelectionChange={(keys) =>
              handleField(
                "targetServerEndpoint2",
                Array.from(keys)[0] as string,
              )
            }
          >
            {endpoints.map((ep) => (
              <SelectItem key={ep.id}>{ep.name}</SelectItem>
            ))}
          </Select>
          <Input
            isRequired
            label="服务端口"
            placeholder="1080"
            type="number"
            value={formData.targetServicePort2}
            onValueChange={(v) => handleField("targetServicePort2", v)}
          />
        </div>
      </div>

      {/* TLS配置 */}
      <div className="space-y-3">
        <Select
          label="TLS Type"
          selectedKeys={[formData.doubleTlsType]}
          onSelectionChange={(keys) =>
            handleField("doubleTlsType", Array.from(keys)[0] as string)
          }
        >
          <SelectItem key="0">不加密</SelectItem>
          <SelectItem key="1">自签名证书</SelectItem>
          <SelectItem key="2">自定义证书</SelectItem>
        </Select>

        {formData.doubleTlsType === "2" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="CertKey"
              placeholder="/path/to/cert.pem"
              value={formData.doubleCertPath}
              onValueChange={(v) => handleField("doubleCertPath", v)}
            />
            <Input
              label="PathKey"
              placeholder="/path/to/key.pem"
              value={formData.doubleKeyPath}
              onValueChange={(v) => handleField("doubleKeyPath", v)}
            />
          </div>
        )}
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
      <div className="space-y-4">
        {/* 标题和实例名称 - 字体大小互换 */}
        <div className="text-left">
          <div className="text-xs text-default-500">单端转发</div>
          <div className="text-sm font-medium text-default-700">
            {formData.tunnelName || "未命名"}
          </div>
        </div>

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
            <span className="text-xs text-default-500 mb-1">
              {relayEndpoint
                ? relayEndpoint.url
                  ? extractHostFromUrl(relayEndpoint.url)
                  : relayEndpoint.name
                : "选择"}
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
              {formData.targetServerAddress || "地址"}
            </span>
            <Icon
              className="text-3xl text-success"
              icon="ph:airplane-landing-fill"
            />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.targetServicePort || "1080"}
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
      <div className="space-y-4">
        {/* 标题和实例名称 - 字体大小互换 */}
        <div className="text-left">
          <div className="text-xs text-default-500">NAT穿透</div>
          <div className="text-sm font-medium text-default-700">
            {formData.tunnelName || "未命名"}
          </div>
        </div>

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
            <span className="text-xs text-default-500 mb-1">
              {publicEndpoint
                ? publicEndpoint.url
                  ? extractHostFromUrl(publicEndpoint.url)
                  : publicEndpoint.name
                : "选择"}
            </span>
            <Icon className="text-4xl text-primary" icon="solar:cloud-bold" />
            <span className="text-xs text-default-600 font-medium mt-1">
              {formData.publicListenPort || "10022"}
            </span>
          </div>

          {/* 箭头 */}
          <Icon
            className="text-2xl text-default-400"
            icon="tabler:arrow-big-right-filled"
          />

          {/* 本地服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1">
              {localEndpoint
                ? localEndpoint.url
                  ? extractHostFromUrl(localEndpoint.url)
                  : localEndpoint.name
                : "选择"}
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
      <div className="space-y-4">
        {/* 标题和实例名称 - 字体大小互换 */}
        <div className="text-left">
          <div className="text-xs text-default-500">双端转发</div>
          <div className="text-sm font-medium text-default-700">
            {formData.tunnelName || "未命名"}
          </div>
        </div>

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
            <span className="text-xs text-default-500 mb-1">
              {relayEndpoint
                ? relayEndpoint.url
                  ? extractHostFromUrl(relayEndpoint.url)
                  : relayEndpoint.name
                : "选择中转服务器"}
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
          <Icon
            className="text-2xl text-default-400"
            icon="tabler:arrow-big-right-filled"
          />

          {/* 目标服务器 */}
          <div className="flex flex-col items-center">
            <span className="text-xs text-default-500 mb-1">
              {targetEndpoint
                ? targetEndpoint.url
                  ? extractHostFromUrl(targetEndpoint.url)
                  : targetEndpoint.name
                : "选择目标服务器"}
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
  const renderPreview = () => (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-default-700">预览</h4>
      <Card>
        <CardBody className="p-4 bg-default-50">
          {selectedScenario === "single-forward" &&
            renderSingleForwardPreview()}
          {selectedScenario === "nat-penetration" && renderNATPreview()}
          {selectedScenario === "tunnel-forward" &&
            renderTunnelForwardPreview()}
        </CardBody>
      </Card>
    </div>
  );

  const renderConfigForm = () => {
    if (!selectedScenario) return null;

    return (
      <div className="space-y-6">
        {selectedScenario === "nat-penetration" && renderNATForm()}
        {selectedScenario === "single-forward" && renderSingleForwardForm()}
        {selectedScenario === "tunnel-forward" && renderTunnelForwardForm()}

        {renderPreview()}
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      placement="center"
      scrollBehavior="inside"
      size="lg"
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
                  {scenarioConfigs[selectedScenario].title}
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
