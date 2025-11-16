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
  Checkbox,
  Divider,
  Tabs,
  Tab,
  NumberInput,
  Textarea,
  Tooltip,
} from "@heroui/react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBolt,
  faEye,
  faEyeSlash,
  faChevronDown,
  faChevronUp,
  faCircleQuestion,
  faCirclePlus,
  faCircleCheck,
  faDice,
  faPen,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { motion, AnimatePresence } from "framer-motion";

import { buildApiUrl } from "@/lib/utils";
import RenameTunnelModal from "./rename-tunnel-modal";

interface EndpointSimple {
  id: string;
  name: string;
  version: string;
  tls: string;
  log: string;
  crt: string;
  keyPath: string;
}

interface SimpleCreateTunnelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  mode?: "create" | "edit";
  tunnelId?: string | number; // 编辑模式时传入隧道ID
}

// 版本比较函数
const compareVersions = (version1: string, version2: string): number => {
  if (!version1 || !version2) return 0;

  const v1Parts = version1.replace(/^v/, "").split(".").map(Number);
  const v2Parts = version2.replace(/^v/, "").split(".").map(Number);

  const maxLength = Math.max(v1Parts.length, v2Parts.length);

  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;

    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }

  return 0;
};

// 检查版本是否支持密码功能（1.4.0及以上）
const isVersionSupportsPassword = (version: string): boolean => {
  if (!version || version.trim() === "") {
    return false; // 版本为空表示不支持
  }

  return compareVersions(version, "1.4.0") >= 0;
};

/**
 * 简单创建实例模态框（简易表单）
 */
export default function SimpleCreateTunnelModal({
  isOpen,
  onOpenChange,
  onSaved,
  mode: modalMode = "create",
  tunnelId,
}: SimpleCreateTunnelModalProps) {
  // 响应式标签位置配置
  const [isMobile, setIsMobile] = useState(false);
  const LABEL_PLACEMENT = isMobile ? ("outside" as const) : ("outside-left" as const);

  // 响应式布局检测
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [endpoints, setEndpoints] = useState<EndpointSimple[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // 新增：重置流量checkbox，仅编辑模式下显示
  const [resetChecked, setResetChecked] = useState(false);
  // 可选配置展开状态
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);
  const [isEnableLoadBalancing, setEnableLoadBalancing] = useState(false);
  // 重命名modal状态
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // 表单数据
  const [formData, setFormData] = useState({
    apiEndpoint: "",
    type: "server", // server | client
    tunnelName: "",
    tunnelAddress: "",
    tunnelPort: "",
    targetAddress: "",
    targetPort: "",
    tlsMode: "0", // 空值表示继承，其他值：0 | 1 | 2
    logLevel: "", // 空值表示继承，其他值：debug, info, warn, error, event
    password: "",
    listenType: "ALL", // ALL | TCP | UDP
    min: "",
    max: "",
    slot: "", // 最大连接数限制
    certPath: "",
    keyPath: "",
    // 新增字段
    mode: 0, // 服务端/客户端模式：服务端默认0，客户端默认1
    read: "", // 数据读取超时
    rate: "", // 速率限制
    proxyProtocol: "", // Proxy Protocol 支持：开启/关闭
    loadBalancingIPs: "", // 负载均衡IP地址，一行一个
    extendTargetAddresses: "", // 扩展目标地址，一行一个
    quic: "", // QUIC 支持：启用/关闭
  });

  // 当打开时加载端点，并在 edit 时从API获取隧道详情
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // 获取主控列表
        const endpointsRes = await fetch(
          buildApiUrl("/api/endpoints/simple?excludeFailed=true"),
        );
        const endpointsData = await endpointsRes.json();
        setEndpoints(endpointsData);

        // 获取编辑数据（如果是编辑模式）
        if (modalMode === "edit" && tunnelId) {
          const tunnelRes = await fetch(
            buildApiUrl(`/api/tunnels/${tunnelId}/details`),
          );

          if (!tunnelRes.ok) {
            throw new Error("获取隧道详情失败");
          }

          const tunnel = await tunnelRes.json();

          // 检查是否有扩展目标地址
          const hasExtendTargetAddress = tunnel.extendTargetAddress &&
            (Array.isArray(tunnel.extendTargetAddress) ? tunnel.extendTargetAddress.length > 0 : tunnel.extendTargetAddress !== "");

          setFormData((prev) => ({
            ...prev,
            type: tunnel.type || prev.type,
            tunnelName: tunnel.name || "",
            tunnelAddress: tunnel.tunnelAddress || "",
            tunnelPort: String(tunnel.listenPort || ""),
            targetAddress: tunnel.targetAddress || "",
            targetPort: String(tunnel.targetPort || ""),
            tlsMode: tunnel.tlsMode ?? prev.tlsMode,
            logLevel: tunnel.logLevel ?? prev.logLevel,
            password: tunnel.password || "",
            min: tunnel.min != null ? String(tunnel.min) : "",
            max: tunnel.max != null ? String(tunnel.max) : "",
            slot: tunnel.slot != null ? String(tunnel.slot) : "",
            certPath: tunnel.certPath || "",
            keyPath: tunnel.keyPath || "",
            apiEndpoint: String(tunnel.endpoint?.id || prev.apiEndpoint),
            // 新增字段
            mode: tunnel.mode != null ? tunnel.mode : (tunnel.type === "server" ? 0 : 1),
            read: tunnel.read || "",
            rate: tunnel.rate != null ? String(tunnel.rate) : "",
            proxyProtocol:
              tunnel.proxyProtocol != null
                ? tunnel.proxyProtocol
                  ? "true"
                  : "false"
                : "",
            loadBalancingIPs: tunnel.loadBalancingIPs || "",
            // 扩展目标地址和监听类型
            listenType: tunnel.listenType || "ALL",
            extendTargetAddresses: tunnel.extendTargetAddress
              ? Array.isArray(tunnel.extendTargetAddress)
                ? tunnel.extendTargetAddress.join("\n")
                : tunnel.extendTargetAddress
              : "",
            quic:
              tunnel.quic != null
                ? tunnel.quic
                  ? "true"
                  : "false"
                : "",
          }));

          // 如果有扩展目标地址，自动展开可选配置
          if (hasExtendTargetAddress) {
            setIsOptionalExpanded(true);
            setEnableLoadBalancing(true);
          }
        } else if (endpointsData.length) {
          // 创建模式，设置默认主控
          setFormData((prev) => ({ ...prev, apiEndpoint: String(endpointsData[0].id) }));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "加载数据失败";
        addToast({
          title: modalMode === "edit" ? "获取隧道详情失败" : "获取主控失败",
          description: errorMsg,
          color: "danger",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, modalMode, tunnelId]);

  const handleSubmit = async () => {
    const {
      apiEndpoint,
      type,
      tunnelName,
      tunnelAddress,
      tunnelPort,
      targetAddress,
      targetPort,
      tlsMode,
      logLevel,
      password,
      min,
      max,
      slot,
      certPath,
      keyPath,
      mode,
      read,
      rate,
      proxyProtocol,
      loadBalancingIPs,
      listenType,
      extendTargetAddresses,
      quic,
    } = formData;

    // 基本校验
    if (!apiEndpoint || !tunnelName.trim() || !tunnelPort || !targetPort) {
      addToast({
        title: "请填写必填字段",
        description: "主控/名称/端口不能为空",
        color: "warning",
      });

      return;
    }

    // 客户端模式校验（由于有默认值，这里主要是确保值有效）
    if (type === "client" && ![1, 2].includes(Number(mode))) {
      addToast({
        title: "请选择有效的客户端模式",
        description: "客户端模式必须为模式1或模式2",
        color: "warning",
      });

      return;
    }

    const tp = parseInt(tunnelPort);
    const tp2 = parseInt(targetPort);

    if (tp < 0 || tp > 65535 || tp2 < 0 || tp2 > 65535) {
      addToast({
        title: "端口不合法",
        description: "端口需 0-65535",
        color: "warning",
      });

      return;
    }

    // server + 2 校验证书路径
    if (
      type === "server" &&
      tlsMode === "2" &&
      (!certPath.trim() || !keyPath.trim())
    ) {
      addToast({
        title: "缺少证书",
        description: "TLS 模式2 需填写证书与密钥路径",
        color: "warning",
      });

      return;
    }

    try {
      setSubmitting(true);
      const url =
        modalMode === "edit"
          ? buildApiUrl(`/api/tunnels/${tunnelId}`)
          : buildApiUrl("/api/tunnels");
      const method = modalMode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId: Number(apiEndpoint),
          name: tunnelName.trim(),
          type: type,
          tunnelAddress,
          tunnelPort,
          targetAddress,
          targetPort,
          tlsMode: type === "server" ? tlsMode || undefined : undefined,
          certPath:
            type === "server" && tlsMode === "2" ? certPath.trim() : undefined,
          keyPath:
            type === "server" && tlsMode === "2" ? keyPath.trim() : undefined,
          logLevel: logLevel || undefined,
          password: password || undefined,
          min: type === "client" && min !== "" ? parseInt(min) : undefined,
          max:
            (type === "client" && max !== "") ||
              (type === "server" && max !== "")
              ? parseInt(max)
              : undefined,
          slot: slot !== "" ? parseInt(slot) : undefined,
          // 新增字段
          mode: mode != null ? Number(mode) : undefined,
          read: read || undefined,
          rate: rate !== "" ? parseInt(rate) : undefined,
          proxyProtocol:
            proxyProtocol !== "" ? proxyProtocol === "true" : undefined,
          loadBalancingIPs: loadBalancingIPs ? loadBalancingIPs : undefined,
          // 扩展目标地址和监听类型
          listenType: listenType && listenType !== "ALL" ? listenType : undefined,
          extendTargetAddress: extendTargetAddresses
            ? extendTargetAddresses
              .split("\n")
              .map((addr) => addr.trim())
              .filter((addr) => addr.length > 0)
            : undefined,
          quic: quic !== "" ? quic === "true" : undefined,
          resetTraffic: modalMode === "edit" ? resetChecked : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success)
        throw new Error(
          data.error || (modalMode === "edit" ? "更新失败" : "创建失败"),
        );
      addToast({
        title: modalMode === "edit" ? "更新成功" : "创建成功",
        description: data.message || "",
        color: "success",
      });
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      addToast({
        title: modalMode === "edit" ? "更新失败" : "创建失败",
        description: err instanceof Error ? err.message : "未知错误",
        color: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleField = useCallback((field: string, value: string) => {
    if (field === "apiEndpoint") {
      // 切换主控时清空密码并重置可见性
      setFormData((prev) => ({ ...prev, [field]: value, password: "" }));
      setIsPasswordVisible(false);
    } else if (field === "type") {
      // 切换类型时自动设置默认模式
      const defaultMode = value === "server" ? 0 : 1;

      setFormData((prev) => ({ ...prev, [field]: value, mode: defaultMode }));
    } else if (field === "mode") {
      // mode字段需要转换为数字类型
      setFormData((prev) => ({ ...prev, [field]: parseInt(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  }, []);

  // 提取通用的 endpoint 获取逻辑
  const selectedEndpoint = useMemo(() => {
    const found1 = endpoints.find(
      (ep) => ep.id === formData.apiEndpoint,
    );
    const found2 = endpoints.find(
      (ep) => String(ep.id) === String(formData.apiEndpoint),
    );
    const found3 = endpoints.find(
      (ep) => Number(ep.id) === Number(formData.apiEndpoint),
    );
    return found2 || found1 || found3;
  }, [endpoints, formData.apiEndpoint]);

  // 缓存常用的条件判断
  const isServerType = useMemo(() => formData.type === "server", [formData.type]);
  const isClientType = useMemo(() => formData.type === "client", [formData.type]);
  const isShowClientPoolMin = useMemo(() => isClientType && formData.mode !== 1, [isClientType, formData.mode]);
  const isShowServerTLS = useMemo(() => isServerType && formData.tlsMode === "2", [isServerType, formData.tlsMode]);

  // 缓存密码输入框渲染结果
  const passwordInput = useMemo(() => {
    const hasVersion =
      selectedEndpoint &&
      selectedEndpoint.version &&
      selectedEndpoint.version.trim() !== "";

    if (!hasVersion) return null;

    return (
      <Input
        endContent={
          <button
            className="focus:outline-none"
            type="button"
            onClick={() => setIsPasswordVisible(!isPasswordVisible)}
          >
            <FontAwesomeIcon
              className="text-sm text-default-400 pointer-events-none"
              icon={isPasswordVisible ? faEyeSlash : faEye}
            />
          </button>
        }
        label="隧道密码"
        placeholder="连接密码认证"
        type={isPasswordVisible ? "text" : "password"}
        value={formData.password}
        onValueChange={(v) => handleField("password", v)}
      />
    );
  }, [selectedEndpoint, formData.password, isPasswordVisible, handleField]);

  // 缓存 Proxy Protocol 选择器渲染结果
  const proxyProtocolSelect = useMemo(() => {
    return (
      <Select
        label="Proxy Protocol"
        selectedKeys={
          formData.proxyProtocol ? [formData.proxyProtocol] : ["false"]
        }
        onSelectionChange={(keys) => {
          const selectedKey = Array.from(keys)[0] as string;

          handleField("proxyProtocol", selectedKey);
        }}
      >
        <SelectItem key="true">开启</SelectItem>
        <SelectItem key="false">关闭</SelectItem>
      </Select>
    );
  }, [formData.proxyProtocol, handleField]);

  return (
    <Modal
      isOpen={isOpen}
      placement="center"
      size="xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 pb-0">
              <FontAwesomeIcon className="text-warning" icon={faBolt} />
              {modalMode === "edit" ? "编辑实例" : "创建实例"}
            </ModalHeader>
            <ModalBody className="space-y-1">
              {loading ? (
                <div className="flex justify-center items-center py-6">
                  <Spinner />
                </div>
              ) : (
                <>
                  {/* 实例类型 Tabs */}
                  <Tabs
                    color="primary"
                    fullWidth
                    isDisabled={modalMode === "edit"}
                    selectedKey={formData.type}
                    onSelectionChange={(key) =>
                      handleField("type", key as string)
                    }
                  >
                    <Tab key="server" title="服务端" />
                    <Tab key="client" title="客户端" />
                  </Tabs>
                  <div>
                    <div className="grid grid-cols-2 gap-2 ">
                      {/* 主控 */}
                      <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>选择主控</label>
                        <Select
                          isDisabled={modalMode === "edit"}
                          selectedKeys={[formData.apiEndpoint]}
                          onSelectionChange={(keys) =>
                            handleField(
                              "apiEndpoint",
                              Array.from(keys)[0] as string,
                            )
                          }
                        >
                          {endpoints.map((ep) => (
                            <SelectItem key={ep.id}>{ep.name}</SelectItem>
                          ))}
                        </Select>
                      </div>
                      {/* 实例名称 */}
                      <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>实例名称</label>
                        {modalMode === "edit" ? (
                          <div
                            className="flex-1 px-3 py-2 rounded-lg bg-default-100 cursor-pointer hover:bg-default-200 transition-colors flex items-center justify-between"
                            onClick={() => setRenameModalOpen(true)}
                          >
                            <span className="text-sm text-foreground">{formData.tunnelName}</span>
                          </div>
                        ) : (
                          <Input
                            placeholder="xxx-tunnel"
                            value={formData.tunnelName}
                            onValueChange={(v) => handleField("tunnelName", v)}
                          />
                        )}
                      </div>

                      {/* 服务端模式选择 - col-2 布局，总高度 40px */}
                      <>
                        <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                          <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>运行模式</label>
                          <Tabs
                            className="text-xs"
                            size="sm"
                            color="secondary"
                            fullWidth
                            selectedKey={String(formData.mode)}
                            onSelectionChange={(key) =>
                              handleField("mode", key as string)
                            }
                          >
                            <Tab key="0" title="自动" disabled={isClientType} />
                            <Tab key="1" title={isServerType ? "反向" : "单端"} />
                            <Tab key="2" title={isServerType ? "正向" : "双端"} />
                          </Tabs>
                        </div>
                        <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                          <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>监听类型</label>
                          <Tabs
                            classNames={{
                              tabContent: "group-data-[selected=true]:text-white text-xs ",
                            }}
                            color="success"
                            size="sm"
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
                      </>

                      {/* 隧道地址端口 */}
                      <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>隧道地址</label>
                        <Input
                          placeholder="0.0.0.0/[2001:db8::1]"
                          value={formData.tunnelAddress}
                          onValueChange={(v) => handleField("tunnelAddress", v)}
                        />
                      </div>
                      <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>隧道端口</label>
                        <NumberInput
                          placeholder="0-65535"
                          type="number"
                          minValue={0}
                          maxValue={65535}
                          labelPlacement="outside-left"
                          value={formData.tunnelPort ? Number(formData.tunnelPort) : undefined}
                          onValueChange={(v) => handleField("tunnelPort", v ? String(v) : "")}
                          formatOptions={{
                            useGrouping: false,
                          }}
                          endContent={
                            isServerType ? (
                              <Tooltip content="随机生成端口号">
                                <button
                                  type="button"
                                  className="focus:outline-none cursor-pointer"
                                  onClick={() => {
                                    const randomPort = Math.floor(Math.random() * 65536);
                                    handleField("tunnelPort", String(randomPort));
                                  }}
                                >
                                  <FontAwesomeIcon
                                    className="w-4 h-4 text-default-400 hover:text-default-600 transition-colors"
                                    icon={faDice}
                                  />
                                </button>
                              </Tooltip>
                            ) : null
                          }
                        />
                      </div>

                      {/* 目标地址端口 */}
                      <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>目标地址</label>
                        <Input
                          placeholder="0.0.0.0/[2001:db8::1]"
                          value={formData.targetAddress}
                          onValueChange={(v) => handleField("targetAddress", v)}
                          endContent={
                            <Tooltip content={isEnableLoadBalancing ? "关闭负载均衡" : "增加目标地址"}>
                              <button
                                type="button"
                                className="focus:outline-none cursor-pointer"
                                onClick={() => {
                                  if (!isOptionalExpanded) {
                                    setIsOptionalExpanded(true)
                                  }
                                  const newState = !isEnableLoadBalancing;
                                  setEnableLoadBalancing(newState);
                                  // 关闭负载均衡时清空扩展目标地址
                                  if (!newState) {
                                    setFormData((prev) => ({ ...prev, extendTargetAddresses: "" }));
                                  }
                                }}
                              >
                                <FontAwesomeIcon
                                  className={`w-5 h-5 transition-colors ${isEnableLoadBalancing
                                    ? "text-warning-400"
                                    : "text-default-400 hover:text-default-600"
                                    }`}
                                  icon={isEnableLoadBalancing ? faCirclePlus : faCirclePlus}
                                />
                              </button>
                            </Tooltip>
                          }
                        />
                      </div>
                      <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>目标端口</label>
                        <NumberInput
                          placeholder="0-65535"
                          type="number"
                          minValue={0}
                          maxValue={65535}
                          labelPlacement="outside-left"
                          value={formData.targetPort ? Number(formData.targetPort) : undefined}
                          onValueChange={(v) => handleField("targetPort", v ? String(v) : "")}
                          formatOptions={{
                            useGrouping: false,
                          }}
                        />
                      </div>

                      {/* TLS 下拉 - server */}
                      {isServerType && (
                        <>
                          <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                            <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>日志级别</label>
                            <Select
                              selectedKeys={
                                formData.logLevel ? [formData.logLevel] : ["inherit"]
                              }
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;

                                handleField(
                                  "logLevel",
                                  selectedKey === "inherit" ? "" : selectedKey,
                                );
                              }}
                            >
                              <SelectItem key="inherit">
                                {selectedEndpoint?.log
                                  ? `继承 (${selectedEndpoint.log.toUpperCase()})`
                                  : "继承主控"}
                              </SelectItem>
                              <SelectItem key="debug">Debug</SelectItem>
                              <SelectItem key="info">Info</SelectItem>
                              <SelectItem key="warn">Warn</SelectItem>
                              <SelectItem key="error">Error</SelectItem>
                              <SelectItem key="event">Event</SelectItem>
                              <SelectItem key="none">None</SelectItem>
                            </Select>
                          </div>
                          <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                            <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>TLS 模式</label>
                            <Select
                              selectedKeys={
                                formData.tlsMode ? [formData.tlsMode] : ["inherit"]
                              }
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;

                                handleField(
                                  "tlsMode",
                                  selectedKey === "inherit" ? "" : selectedKey,
                                );
                              }}
                            >
                              <SelectItem key="inherit">
                                {(() => {
                                  const getTLSModeText = (mode: string) => {
                                    switch (mode) {
                                      case "0":
                                        return "无 TLS";
                                      case "1":
                                        return "自签名证书";
                                      case "2":
                                        return "自定义证书";
                                      default:
                                        return mode;
                                    }
                                  };
                                  const masterTls = selectedEndpoint?.tls;
                                  return masterTls
                                    ? `继承 (${getTLSModeText(masterTls)})`
                                    : "继承主控";
                                })()}
                              </SelectItem>
                              <SelectItem key="0">模式0：无 TLS</SelectItem>
                              <SelectItem key="1">模式1：自签名证书</SelectItem>
                              <SelectItem key="2">模式2：自定义证书</SelectItem>
                            </Select>
                          </div>
                        </>
                      )}
                      {/* 证书路径 - server & tls 2 */}
                      {isShowServerTLS && (
                        <>
                          <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                            <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>证书路径</label>
                            <Input
                              value={formData.certPath}
                              onValueChange={(v) => handleField("certPath", v)}
                            />
                          </div>
                          <div className={`flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                            <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>密钥路径</label>
                            <Input
                              value={formData.keyPath}
                              onValueChange={(v) => handleField("keyPath", v)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    {/* 日志级别 */}
                    {isClientType && (
                      <div className={`pt-2 flex ${LABEL_PLACEMENT === "outside" ? "flex-col" : "flex-row items-center gap-2"}`}>
                        <label className={`text-sm pl-2 ${LABEL_PLACEMENT === "outside" ? "" : "whitespace-nowrap flex-shrink-0"}`}>日志级别</label>
                        <Select
                          selectedKeys={
                            formData.logLevel ? [formData.logLevel] : ["inherit"]
                          }
                          onSelectionChange={(keys) => {
                            const selectedKey = Array.from(keys)[0] as string;

                            handleField(
                              "logLevel",
                              selectedKey === "inherit" ? "" : selectedKey,
                            );
                          }}
                        >
                          <SelectItem key="inherit">
                            {selectedEndpoint?.log
                              ? `继承 (${selectedEndpoint.log.toUpperCase()})`
                              : "继承主控"}
                          </SelectItem>
                          <SelectItem key="debug">Debug</SelectItem>
                          <SelectItem key="info">Info</SelectItem>
                          <SelectItem key="warn">Warn</SelectItem>
                          <SelectItem key="error">Error</SelectItem>
                          <SelectItem key="event">Event</SelectItem>
                          <SelectItem key="none">None</SelectItem>
                        </Select>
                      </div>
                    )}
                  </div>
                  {/* 可选区域 */}
                  <div className="relative ">
                    <Divider />
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-background dark:bg-[#18181B] px-4">
                      <button
                        className="flex items-center gap-2 text-sm text-default-600 hover:text-default-800 transition-colors"
                        type="button"
                        onClick={() =>
                          setIsOptionalExpanded(!isOptionalExpanded)
                        }
                      >
                        可选配置
                        <FontAwesomeIcon
                          className="text-xs"
                          icon={
                            isOptionalExpanded ? faChevronDown : faChevronUp
                          }
                        />
                      </button>
                    </div>
                  </div>

                  {/* 可选配置内容 */}
                  <AnimatePresence>
                    {isOptionalExpanded && (
                      <motion.div
                        animate={{ height: "auto", opacity: 1 }}
                        className="overflow-hidden"
                        exit={{ height: 0, opacity: 0 }}
                        initial={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: 0.3,
                          ease: "easeInOut",
                          height: { duration: 0.3, ease: "easeInOut" },
                        }}
                      >
                        <div className="space-y-2">
                          <div className={`grid grid-cols-${((isClientType && formData.mode === 2) || isServerType) ? 3 : 1} gap-2`}
                          >

                            {isShowClientPoolMin && (
                              <>
                                {passwordInput}
                                <Input
                                  label="连接池最小容量"
                                  placeholder="64(默认值)"
                                  type="number"
                                  value={formData.min}
                                  onValueChange={(v) => handleField("min", v ? String(v) : "")}
                                />
                                {proxyProtocolSelect}
                              </>
                            )}
                            {isClientType &&
                              formData.mode === 1 && (
                                <>
                                  {proxyProtocolSelect}
                                </>
                              )}
                            {isServerType && (
                              <>
                                {passwordInput}
                                <Input
                                  label="连接池最大容量"
                                  placeholder="1024(默认值)"
                                  type="number"
                                  value={formData.max}
                                  onValueChange={(v) => handleField("max", v ? String(v) : "")}
                                />
                                {proxyProtocolSelect}
                              </>
                            )}
                          </div>

                          {/* 数据读取超时、速率限制和最大连接数限制 */}
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              label="数据读取超时"
                              placeholder="1h0m0s"
                              value={formData.read}
                              onValueChange={(v) => handleField("read", v)}
                            />
                            <Input
                              endContent={
                                <div className="pointer-events-none flex items-center">
                                  <span className="text-default-400 text-small">
                                    Mbps
                                  </span>
                                </div>
                              }
                              label="速率限制"
                              type="number"
                              placeholder="100"
                              value={formData.rate}
                              onValueChange={(v) => handleField("rate", v ? String(v) : "")}
                            />
                            <Input
                              label="最大连接数限制"
                              placeholder="100"
                              type="number"
                              value={formData.slot}
                              onValueChange={(v) => handleField("slot", v ? String(v) : "")}
                            />
                          </div>

                          {/* 扩展目标地址 */}
                          <div className="flex items-start gap-2">
                            {isEnableLoadBalancing && (
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
                                placeholder="192.168.1.1&#10;192.168.1.2"
                                minRows={2}
                                value={formData.extendTargetAddresses}
                                onValueChange={(v) => handleField("extendTargetAddresses", v)}
                                className="flex-1"
                              />
                            )}
                          </div>

                          {/* 启用 QUIC */}
                          {formData.type=='server'&& <div>
                            <Select
                              label="启用 QUIC"
                              selectedKeys={
                                formData.quic ? [formData.quic] : ["false"]
                              }
                              onSelectionChange={(keys) => {
                                const selectedKey = Array.from(keys)[0] as string;
                                handleField("quic", selectedKey);
                              }}
                            >
                              <SelectItem key="false">关闭</SelectItem>
                              <SelectItem key="true">启用</SelectItem>
                            </Select>
                          </div>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </ModalBody>
            <ModalFooter className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* 重置流量checkbox，仅编辑模式下显示 */}
                {modalMode === "edit" && (
                  <Checkbox
                    id="reset-traffic"
                    isSelected={resetChecked}
                    size="sm"
                    onValueChange={setResetChecked}
                  >
                    保存后重置流量统计
                  </Checkbox>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={submitting}
                  onPress={handleSubmit}
                >
                  {modalMode === "edit" ? "更新" : "创建"}
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>

      {/* 重命名模态框 */}
      {modalMode === "edit" && tunnelId && (
        <RenameTunnelModal
          isOpen={renameModalOpen}
          tunnelId={String(tunnelId)}
          currentName={formData.tunnelName}
          onOpenChange={setRenameModalOpen}
          onRenamed={(newName) => {
            setFormData((prev) => ({ ...prev, tunnelName: newName }));
          }}
        />
      )}
    </Modal>
  );
}
