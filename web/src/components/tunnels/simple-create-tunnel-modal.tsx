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
  Textarea,
  Tooltip,
  RadioGroup,
  Radio
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
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { motion, AnimatePresence } from "framer-motion";

import { buildApiUrl } from "@/lib/utils";

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
  editData?: Partial<Record<string, any>> & { id?: number };
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
  editData,
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
    listenType: "0",
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
  });

  // 当打开时加载端点，并在 edit 时填充表单
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
          let defaultEp = String(data[0].id);

          if (editData && editData.endpointId) {
            const epFound = data.find(
              (e: EndpointSimple) =>
                String(e.id) === String(editData.endpointId),
            );

            if (epFound) defaultEp = String(epFound.id);
          }
          setFormData((prev) => ({ ...prev, apiEndpoint: defaultEp }));
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

    // 填充编辑数据
    if (modalMode === "edit" && editData) {
      setFormData((prev) => ({
        ...prev,
        type: editData.type || prev.type,
        tunnelName: editData.name || "",
        tunnelAddress: editData.tunnelAddress || "",
        tunnelPort: String(editData.tunnelPort || ""),
        targetAddress: editData.targetAddress || "",
        targetPort: String(editData.targetPort || ""),
        tlsMode: editData.tlsMode ?? prev.tlsMode,
        logLevel: editData.logLevel ?? prev.logLevel,
        password: editData.password || "",
        min: editData.min != null ? String(editData.min) : "",
        max: editData.max != null ? String(editData.max) : "",
        slot: editData.slot != null ? String(editData.slot) : "",
        certPath: editData.certPath || "",
        keyPath: editData.keyPath || "",
        apiEndpoint: String(editData.endpointId || prev.apiEndpoint),
        // 新增字段
        mode:
          editData.mode != null
            ? editData.mode
            : editData.type === "server"
              ? 0
              : 1,
        read: editData.read || "",
        rate: editData.rate || "",
        proxyProtocol:
          editData.proxyProtocol != null
            ? editData.proxyProtocol
              ? "true"
              : "false"
            : "",
        enableLoadBalancing: editData.enableLoadBalancing || false,
        loadBalancingIPs: editData.loadBalancingIPs || "",
      }));
    }
  }, [isOpen]);

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
          ? buildApiUrl(`/api/tunnels/${editData?.id}`)
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

  // 缓存密码输入框渲染结果
  const passwordInput = useMemo(() => {
    // 尝试不同的匹配方式
    const selectedEndpoint1 = endpoints.find(
      (ep) => ep.id === formData.apiEndpoint,
    );
    const selectedEndpoint2 = endpoints.find(
      (ep) => String(ep.id) === String(formData.apiEndpoint),
    );
    const selectedEndpoint3 = endpoints.find(
      (ep) => Number(ep.id) === Number(formData.apiEndpoint),
    );

    // 使用最安全的匹配方式
    const selectedEndpoint =
      selectedEndpoint2 || selectedEndpoint1 || selectedEndpoint3;
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
  }, [endpoints, formData.apiEndpoint, formData.password, isPasswordVisible, handleField]);

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
                        <Input
                          placeholder="xxx-tunnel"
                          value={formData.tunnelName}
                          onValueChange={(v) => handleField("tunnelName", v)}
                        />
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
                            <Tab key="0" title="自动" disabled={formData.type === "client"} />
                            <Tab key="1" title={formData.type === "server" ? "反向" : "单端"} />
                            <Tab key="2" title={formData.type === "server" ? "正向" : "双端"} />
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
                            selectedKey={String(formData.listenType)}
                            onSelectionChange={(key) =>
                              handleField("listenType", key as string)
                            }
                          >
                            <Tab key="0" title="ALL" />
                            <Tab key="1" title="TCP" />
                            <Tab key="2" title="UDP" />
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
                        <Input
                          placeholder="0-65535"
                          type="number"
                          value={formData.tunnelPort}
                          onValueChange={(v) => handleField("tunnelPort", v)}
                          endContent={
                            formData.type === "server" ? (
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
                                  setEnableLoadBalancing(!isEnableLoadBalancing)
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
                        <Input
                          placeholder="0-65535"
                          type="number"
                          value={formData.targetPort}
                          onValueChange={(v) => handleField("targetPort", v)}
                        />
                      </div>

                      {/* TLS 下拉 - server */}
                      {formData.type === "server" && (
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
                                {(() => {
                                  // 使用相同的匹配逻辑
                                  const selectedEndpoint1 = endpoints.find(
                                    (ep) => ep.id === formData.apiEndpoint,
                                  );
                                  const selectedEndpoint2 = endpoints.find(
                                    (ep) =>
                                      String(ep.id) === String(formData.apiEndpoint),
                                  );
                                  const selectedEndpoint3 = endpoints.find(
                                    (ep) =>
                                      Number(ep.id) === Number(formData.apiEndpoint),
                                  );
                                  const selectedEndpoint =
                                    selectedEndpoint2 ||
                                    selectedEndpoint1 ||
                                    selectedEndpoint3;
                                  const masterLog = selectedEndpoint?.log;

                                  return masterLog
                                    ? `继承 (${masterLog.toUpperCase()})`
                                    : "继承主控";
                                })()}
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
                                  // 使用相同的匹配逻辑
                                  const selectedEndpoint1 = endpoints.find(
                                    (ep) => ep.id === formData.apiEndpoint,
                                  );
                                  const selectedEndpoint2 = endpoints.find(
                                    (ep) =>
                                      String(ep.id) === String(formData.apiEndpoint),
                                  );
                                  const selectedEndpoint3 = endpoints.find(
                                    (ep) =>
                                      Number(ep.id) === Number(formData.apiEndpoint),
                                  );
                                  const selectedEndpoint =
                                    selectedEndpoint2 ||
                                    selectedEndpoint1 ||
                                    selectedEndpoint3;
                                  const masterTls = selectedEndpoint?.tls;

                                  // TLS模式转换
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
                      {formData.type === "server" && formData.tlsMode === "2" && (
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
                    {formData.type === "client" && (
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
                            {(() => {
                              // 使用相同的匹配逻辑
                              const selectedEndpoint1 = endpoints.find(
                                (ep) => ep.id === formData.apiEndpoint,
                              );
                              const selectedEndpoint2 = endpoints.find(
                                (ep) =>
                                  String(ep.id) === String(formData.apiEndpoint),
                              );
                              const selectedEndpoint3 = endpoints.find(
                                (ep) =>
                                  Number(ep.id) === Number(formData.apiEndpoint),
                              );
                              const selectedEndpoint =
                                selectedEndpoint2 ||
                                selectedEndpoint1 ||
                                selectedEndpoint3;
                              const masterLog = selectedEndpoint?.log;

                              return masterLog
                                ? `继承 (${masterLog.toUpperCase()})`
                                : "继承主控";
                            })()}
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
                          <div className={`grid grid-cols-${((formData.type === "client" && formData.mode === 2) || formData.type === "server") ? 3 : 1} gap-2`}
                          >

                            {formData.type === "client" &&
                              formData.mode !== 1 && (
                                <>
                                  {passwordInput}
                                  <Input
                                    label="连接池最小容量"
                                    placeholder="64(默认值)"
                                    type="number"
                                    value={formData.min}
                                    onValueChange={(v) => handleField("min", v)}
                                  />
                                  {proxyProtocolSelect}
                                </>
                              )}
                            {formData.type === "client" &&
                              formData.mode === 1 && (
                                <>
                                  {proxyProtocolSelect}
                                </>
                              )}
                            {formData.type === "server" && (
                              <>
                                {passwordInput}
                                <Input
                                  label="连接池最大容量"
                                  placeholder="1024(默认值)"
                                  type="number"
                                  value={formData.max}
                                  onValueChange={(v) => handleField("max", v)}
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
                              onValueChange={(v) => handleField("rate", v)}
                            />
                            <Input
                              label="最大连接数限制"
                              placeholder="100"
                              type="number"
                              value={formData.slot}
                              onValueChange={(v) => handleField("slot", v)}
                            />
                          </div>

                          {/* 负载均衡IP地址 */}
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
                                placeholder="逗号分隔如：192.168.1.1,192.168.1.2,192.168.1.3"
                                minRows={3}
                                value={formData.loadBalancingIPs}
                                onValueChange={(v) => handleField("loadBalancingIPs", v)}
                                className="flex-1"
                              />
                            )}
                          </div>
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
    </Modal>
  );
}
