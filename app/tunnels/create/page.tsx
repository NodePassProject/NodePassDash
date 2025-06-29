"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
  Radio,
  RadioGroup,
  Select,
  SelectItem,
  Skeleton,
  Snippet,
  Spinner
} from "@heroui/react";
import { useState, useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faArrowLeft,
  faServer, 
  faDesktop,
  faCheck,
  faXmark,
  faExclamationTriangle,
  faBars,
  faTableCells,
  faEye,
  faEyeSlash
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';

type EndpointStatus = 'ONLINE' | 'OFFLINE' | 'FAIL';

// 添加 Toast 组件
const Toast = ({ 
  message, 
  type = "success", 
  onClose 
}: { 
  message: string; 
  type?: "success" | "error" | "warning"; 
  onClose: () => void;
}) => {
  const colors = {
    success: "bg-success-50 border-success-200 text-success-800",
    error: "bg-danger-50 border-danger-200 text-danger-800", 
    warning: "bg-warning-50 border-warning-200 text-warning-800"
  };

  const icons = {
    success: faCheck,
    error: faXmark,
    warning: faExclamationTriangle
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
      <Card className={`p-3 border-2 shadow-lg ${colors[type]} max-w-md`}>
        <CardBody className="flex flex-row items-center gap-3 p-0">
          <FontAwesomeIcon 
            icon={icons[type]} 
            className={`text-lg ${type === 'success' ? 'text-success' : type === 'error' ? 'text-danger' : 'text-warning'}`}
          />
          <span className="flex-1">{message}</span>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onClick={onClose}
            className="min-w-6 w-6 h-6"
          >
            <FontAwesomeIcon icon={faXmark} className="text-xs" />
          </Button>
        </CardBody>
      </Card>
    </div>
  );
};

interface ApiEndpoint {
  id: string;
  name: string;
  url: string;
  apiPath: string;
  status: EndpointStatus;
  tunnelCount: number;
  version: string;
  tls: string;
  log: string;
  crt: string;
  keyPath: string;
}

// 版本比较函数
const compareVersions = (version1: string, version2: string): number => {
  if (!version1 || !version2) return 0;
  
  const v1Parts = version1.replace(/^v/, '').split('.').map(Number);
  const v2Parts = version2.replace(/^v/, '').split('.').map(Number);
  
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
  if (!version || version.trim() === '') {
    return false; // 版本为空表示不支持
  }
  return compareVersions(version, '1.4.0') >= 0;
};

export default function CreateTunnelPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    apiEndpoint: "",
    mode: "server",
    tunnelName: "",
    tunnelAddress: "",
    tunnelPort: "",
    targetAddress: "",
    targetPort: "",
    tlsMode: "inherit",
    certPath: "",
    keyPath: "",
    logLevel: "inherit",
    password: "",
    min: "",
    max: ""
  });

  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [layout, setLayout] = useState<"card" | "list">("card");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);

  // 显示 toast 的辅助函数
  const showToast = (message: string, type: "success" | "error" | "warning" = "success") => {
    setToast({ message, type });
  };

  // 获取主控列表
  useEffect(() => {
    const fetchEndpoints = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/endpoints/simple?excludeFailed=true'));
        if (!response.ok) throw new Error('获取主控列表失败');
        const data = await response.json();
        console.log('获取到的主控数据:', data);
        setEndpoints(data);
      } catch (error) {
        console.error('获取主控列表失败:', error);
        showToast('获取主控列表失败', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchEndpoints();
  }, []);

  const handleInputChange = (field: string, value: string) => {
    // 对于端口字段添加特殊处理
    if (field === "tunnelPort" || field === "targetPort") {
      // 只允许数字
      if (!/^\d*$/.test(value)) {
        return;
      }
      // 限制长度为5
      if (value.length > 5) {
        return;
      }
    }

    // 对 min/max 仅允许数字
    if (field === "min" || field === "max") {
      if (!/^\d*$/.test(value)) return;
    }

    // 当切换主控时，清除密码字段并重置密码可见性
    if (field === "apiEndpoint") {
      setFormData((prev) => ({ ...prev, [field]: value, password: "" }));
      setIsPasswordVisible(false);
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSubmit = async () => {
    // 验证必填字段
    if (!formData.apiEndpoint || !formData.tunnelName || !formData.tunnelPort || !formData.targetPort) {
      showToast('请填写所有必填字段', 'warning');
      return;
    }

    // 验证端口范围
    const tunnelPortNum = parseInt(formData.tunnelPort);
    const targetPortNum = parseInt(formData.targetPort);
    if (tunnelPortNum < 0 || tunnelPortNum > 65535 || targetPortNum < 0 || targetPortNum > 65535) {
      showToast('端口号必须在0到65535之间', 'warning');
      return;
    }

    // 如果是服务端模式且TLS模式为mode2，验证证书路径
    if (formData.mode === 'server' && formData.tlsMode === 'mode2') {
      if (!formData.certPath || !formData.keyPath) {
        showToast('TLS模式2需要提供证书和密钥文件路径', 'warning');
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch(buildApiUrl('/api/tunnels'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.tunnelName,
          endpointId: formData.apiEndpoint,
          mode: formData.mode,
          tunnelAddress: formData.tunnelAddress,
          tunnelPort: formData.tunnelPort,
          targetAddress: formData.targetAddress,
          targetPort: formData.targetPort,
          tlsMode: formData.mode === 'server' ? formData.tlsMode : undefined,
          certPath: formData.mode === 'server' && formData.certPath && formData.tlsMode === 'mode2' ? formData.certPath : undefined,
          keyPath: formData.mode === 'server' && formData.keyPath && formData.tlsMode === 'mode2' ? formData.keyPath : undefined,
          logLevel: formData.logLevel,
          password: (() => {
            const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
            const supportsPassword = selectedEndpoint ? isVersionSupportsPassword(selectedEndpoint.version) : false;
            return supportsPassword && formData.password ? formData.password : undefined;
          })(),
          min: formData.mode === 'client' && formData.min ? formData.min : undefined,
          max: formData.mode === 'client' && formData.max ? formData.max : undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        showToast('实例实例创建成功！', 'success');
        // 延迟跳转，让用户看到成功提示
        setTimeout(() => {
          router.push('/tunnels');
        }, 1500);
      } else {
        throw new Error(result.error || '创建失败');
      }
    } catch (error) {
      console.error('创建实例实例失败:', error);
      showToast(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Toast 组件 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex items-center gap-3 md:gap-4">
        <Button
            isIconOnly
            variant="flat"
            size="sm"
            onClick={() => router.back()}
            className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
        </Button>
        <h1 className="text-2xl font-bold">创建实例</h1>
      </div>

      <Card className="p-2 shadow-none border-2 border-default-200">
        <CardHeader className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">选择 API 主控</h2>
          <Button
            isIconOnly
            variant="light"
            className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
            size="sm"
            onClick={() => setLayout(layout === "card" ? "list" : "card")}
          >
            <FontAwesomeIcon
              icon={layout === "card" ? faBars : faTableCells}
              className="text-sm"
            />
          </Button>
        </CardHeader>
        <Divider />
        <CardBody className="p-6">
          {loading ? (
            <div className="overflow-x-auto scrollbar-hide">
              <div className="flex gap-4 pb-2" style={{ minWidth: 'max-content' }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card
                    key={i}
                    className="min-w-[280px] flex-shrink-0 shadow-none border-2 border-default-200"
                  >
                    <CardBody className="space-y-2 p-4">
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-2 h-2 rounded-full" />
                        <Skeleton className="w-24 h-4 rounded-lg" />
                      </div>
                      <Skeleton className="w-full h-4 rounded-lg" />
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-16 h-3 rounded-lg" />
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          ) : endpoints.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-default-500">暂无可用的 API 主控</p>
              <Button 
                color="primary" 
                variant="flat"
                size="sm"
                className="mt-2"
                onClick={() => router.push('/endpoints')}
              >
                去添加主控
              </Button>
            </div>
          ) : (
            layout === "card" ? (
              <div className="overflow-x-auto scrollbar-hide">
                <div className="flex gap-4 pb-2" style={{ minWidth: 'max-content' }}>
                  {endpoints.map((endpoint) => (
                    <Card
                      key={endpoint.id}
                      isPressable
                      isHoverable
                      className={`w-[230px] flex-shrink-0 shadow-none border-2 ${formData.apiEndpoint === endpoint.id ? "border-primary bg-primary-50 dark:bg-primary-900/30" : "border-default-200"}`}
                      onClick={() => handleInputChange("apiEndpoint", endpoint.id)}
                    >
                      <CardBody className="space-y-2 p-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className={cn(
                              "w-2 h-2 rounded-full inline-block flex-shrink-0",
                              endpoint.status === 'ONLINE' ? "bg-success" : "bg-danger"
                            )}
                          />
                          <h3 className="font-semibold text-sm truncate">{endpoint.name}</h3>
                        </div>
                        <p className="text-small text-default-500 truncate" title={endpoint.url}>{endpoint.url}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-tiny text-default-400">{endpoint.tunnelCount || 0} 个实例</p>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {endpoints.map((endpoint) => (
                  <Card
                    key={endpoint.id}
                    isPressable
                    isHoverable
                    className={`shadow-none border-2 ${formData.apiEndpoint === endpoint.id ? "border-primary bg-primary-50 dark:bg-primary-900/30" : "border-default-200"}`}
                    onClick={() => handleInputChange("apiEndpoint", endpoint.id)}
                  >
                    <CardBody className="flex items-center gap-2 p-4 overflow-hidden">
                      <div className="flex items-center gap-2 min-w-0 w-full">
                        {/* 状态点 */}
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            endpoint.status === 'ONLINE' ? "bg-success" : "bg-danger"
                          )}
                        />
                        {/* 名称与 URL  */}
                        <h3 className="font-semibold text-sm truncate max-w-[6rem]">{endpoint.name}</h3>
                        <p className="text-small text-default-500 truncate flex-1">{endpoint.url}</p>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )
          )}
        </CardBody>
      </Card>

      <Card className="p-2 shadow-none border-2 border-default-200">
        <CardHeader>
          <h2 className="text-xl font-semibold">实例模式</h2>
        </CardHeader>
        <Divider />
        <CardBody className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              isPressable
              isHoverable
              className={`shadow-none border-2 ${formData.mode === "server" ? "border-primary bg-primary-50 dark:bg-primary-900/30" : "border-default-200"}`}
              onClick={() => handleInputChange("mode", "server")}
            >
              <CardBody className="flex items-center p-6">
                <div className="w-8 h-8 flex items-center justify-center transition-all duration-300">
                  <FontAwesomeIcon 
                    icon={faServer} 
                    className="text-2xl"
                    style={{ width: "1.5rem", height: "1.5rem" }}
                  />
                </div>
                <div className="text-center w-full">
                  <h3 className="font-semibold">服务端模式</h3>
                  <p className="text-small text-default-500">隧道监听端，提供目标服务出口或入口，需双端握手</p>
                </div>
              </CardBody>
            </Card>
            <Card
              isPressable
              isHoverable
              className={`shadow-none border-2 ${formData.mode === "client" ? "border-primary bg-primary-50 dark:bg-primary-900/30" : "border-default-200"}`}
              onClick={() => handleInputChange("mode", "client")}
            >
              <CardBody className="flex items-center p-6">
                <div className="w-8 h-8 flex items-center justify-center transition-all duration-300">
                  <FontAwesomeIcon 
                    icon={faDesktop} 
                    className="text-2xl"
                    style={{ width: "1.5rem", height: "1.5rem" }}
                  />
                </div>
                <div className="text-center w-full">
                  <h3 className="font-semibold">客户端模式</h3>
                  <p className="text-small text-default-500">隧道拨号端，提供目标服务入口或出口，可单端转发</p>
                </div>
              </CardBody>
            </Card>
          </div>
        </CardBody>
      </Card>

      <Card className="p-2 shadow-none border-2 border-default-200">
        <CardHeader>
          <h2 className="text-xl font-semibold">网络配置</h2>
        </CardHeader>
        <Divider />
        <CardBody className="p-6 space-y-6">
          {/* 基本信息行 */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3">
              <Input
                label="实例名称"
                placeholder="web-server-tunnel"
                value={formData.tunnelName}
                onChange={(e) => handleInputChange("tunnelName", e.target.value)}
              />
            </div>
            <div className="lg:col-span-1">
              <Select
                label="日志级别"
                placeholder="选择日志级别"
                selectedKeys={[formData.logLevel]}
                onChange={(e) => handleInputChange("logLevel", e.target.value)}
                renderValue={(items) => {
                  return <div>{items[0]?.textValue}</div>;
                }}
              >
                <SelectItem key="inherit" textValue={(() => {
                  const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
                  const masterLog = selectedEndpoint?.log;
                  return masterLog ? `Inherit (${masterLog.toUpperCase()})` : "Inherit";
                })()}>
                  {(() => {
                    const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
                    const masterLog = selectedEndpoint?.log;
                    return masterLog ? `Inherit (${masterLog.toUpperCase()})` : "Inherit";
                  })()}
                  <div className="text-tiny text-default-400">使用主控配置的日志级别</div>
                </SelectItem>
                <SelectItem key="debug" textValue="Debug">
                  Debug
                  <div className="text-tiny text-default-400">详细调试信息</div>
                </SelectItem>
                <SelectItem key="info" textValue="Info">
                  Info
                  <div className="text-tiny text-default-400">一般操作信息</div>
                </SelectItem>
                <SelectItem key="warn" textValue="Warn">
                  Warn
                  <div className="text-tiny text-default-400">警告条件</div>
                </SelectItem>
                <SelectItem key="error" textValue="Error">
                  Error
                  <div className="text-tiny text-default-400">错误条件</div>
                </SelectItem>
                <SelectItem key="event" textValue="Event">
                  Event
                  <div className="text-tiny text-default-400">事件信息</div>
                </SelectItem>
              </Select>
            </div>
          </div>

          {/* 实例配置和目标配置 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* 实例端配置 */}
            <Card className="shadow-none border-2 border-primary-200 bg-primary-50/30 dark:border-primary-800 dark:bg-primary-900/20">
              <CardHeader className="pb-3">
                <h3 className="text-lg font-semibold text-primary">实例配置</h3>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="隧道地址"
                    placeholder="0.0.0.0/[2001:db8::1]"
                    value={formData.tunnelAddress}
                    onChange={(e) => handleInputChange("tunnelAddress", e.target.value)}
                  />
                  <Input
                    label="隧道端口"
                    placeholder="10101"
                    type="number"
                    min={0}
                    max={65535}
                    maxLength={5}
                    value={formData.tunnelPort}
                    onChange={(e) => handleInputChange("tunnelPort", e.target.value)}
                    onKeyDown={(e) => {
                      // 阻止输入非数字字符
                      if (!/^\d$/.test(e.key) && !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>
              </CardBody>
            </Card>

            {/* 目标端配置 */}
            <Card className="shadow-none border-2 border-secondary-200 bg-secondary-50/30 dark:border-secondary-800 dark:bg-secondary-900/20">
              <CardHeader className="pb-3">
                <h3 className="text-lg font-semibold text-secondary">目标配置</h3>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="目标地址"
                    placeholder="0.0.0.0/[2001:db8::1]"
                    value={formData.targetAddress}
                    onChange={(e) => handleInputChange("targetAddress", e.target.value)}
                  />
                  <Input
                    label="目标端口"
                    placeholder="8080"
                    type="number"
                    min={0}
                    max={65535}
                    maxLength={5}
                    value={formData.targetPort}
                    onChange={(e) => handleInputChange("targetPort", e.target.value)}
                    onKeyDown={(e) => {
                      // 阻止输入非数字字符
                      if (!/^\d$/.test(e.key) && !["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </CardBody>
      </Card>



      <Card className="p-2 shadow-none border-2 border-default-200">
        <CardHeader>
          <h2 className="text-xl font-semibold">安全设置</h2>
        </CardHeader>
        <Divider />
        <CardBody className="p-6 space-y-4">
          {/* 隧道密码 - 仅在选中主控版本>=1.4.0时显示 */}
          {(() => {
            const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
            const supportsPassword = selectedEndpoint ? isVersionSupportsPassword(selectedEndpoint.version) : false;
            
            if (supportsPassword) {
              return (
                <Input
                  label="隧道密码（可选）"
                  placeholder="设置后，隧道连接需要提供此密码进行认证"
                  type={isPasswordVisible ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  endContent={
                    <button
                      className="focus:outline-none"
                      type="button"
                      onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    >
                      <FontAwesomeIcon
                        icon={isPasswordVisible ? faEyeSlash : faEye}
                        className="text-sm text-default-400 pointer-events-none"
                      />
                    </button>
                  }
                />
              );
            }
            return null;
          })()}
          
          {/* TLS设置 - 仅在服务端模式时显示 */}
          {formData.mode === "server" && (
            <>
              <RadioGroup
                label="TLS 安全级别"
                value={formData.tlsMode}
                onValueChange={(value: string) => handleInputChange("tlsMode", value)}
              >
                <Radio value="inherit">
                  {(() => {
                    const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
                    const masterTls = selectedEndpoint?.tls;
                    const tlsText = masterTls ? ` (模式${masterTls.toUpperCase()})` : '';
                    return `继承主控${tlsText}: 使用主控配置的 TLS 设置`;
                  })()}
                </Radio>
                <Radio value="mode0">模式 0: 无 TLS 加密（明文 TCP/UDP）</Radio>
                <Radio value="mode1">模式 1: 自签名证书（自动生成）</Radio>
                <Radio value="mode2">模式 2: 自定义证书（需要 crt 和 key 参数）</Radio>
              </RadioGroup>
              
              {formData.tlsMode === "mode2" && (
                <>
                  <Input
                    label="证书文件路径"
                    placeholder="/path/to/cert.pem"
                    value={formData.certPath}
                    onChange={(e) => handleInputChange("certPath", e.target.value)}
                  />
                  <Input
                    label="密钥文件路径"
                    placeholder="/path/to/key.pem"
                    value={formData.keyPath}
                    onChange={(e) => handleInputChange("keyPath", e.target.value)}
                  />
                </>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {/* 客户端专用设置 */}
      {formData.mode === 'client' && (
        <Card className="p-2 shadow-none border-2 border-default-200">
          <CardHeader>
            <h2 className="text-xl font-semibold">客户端参数</h2>
          </CardHeader>
          <Divider />
          <CardBody className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="连接池的最小容量"
                placeholder="64"
                value={formData.min}
                onChange={(e) => handleInputChange('min', e.target.value)}
              />
              <Input
                label="连接池的最大容量"
                placeholder="8192"
                value={formData.max}
                onChange={(e) => handleInputChange('max', e.target.value)}
              />
            </div>
          </CardBody>
        </Card>
      )}
      <Card className="p-2 shadow-none border-2 border-default-200">
        <CardHeader>
          <h2 className="text-xl font-semibold">配置摘要</h2>
        </CardHeader>
        <Divider />
        <CardBody className="p-6">
          <Card className="p-4 bg-success-50 border-2 border-success-200 shadow-none mb-4">
            <CardBody>
              <h3 className="text-lg font-semibold mb-4">请确认以下实例配置：</h3>
              <div className="space-y-2 text-sm">
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">API 主控：</span> {endpoints.find(e => e.id === formData.apiEndpoint)?.name} ({endpoints.find(e => e.id === formData.apiEndpoint)?.url})</p>
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">实例模式：</span> {formData.mode === "server" ? "服务端模式" : "客户端模式"}</p>
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">实例名称：</span> {formData.tunnelName}</p>
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">隧道地址：</span> {formData.tunnelAddress}:{formData.tunnelPort}</p>
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">目标地址：</span> {formData.targetAddress}:{formData.targetPort}</p>
                {formData.mode === "server" &&
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">TLS 安全级别：</span> {(() => {
                  if (formData.tlsMode === "inherit") {
                    const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
                    const masterTls = selectedEndpoint?.tls;
                    return masterTls ? `继承主控设置 (${masterTls.toUpperCase()})` : "继承主控设置";
                  }
                  return formData.tlsMode === "mode0" ? "模式 0 (无 TLS 加密)" : formData.tlsMode === "mode1" ? "模式 1 (自签名证书)" : "模式 2 (自定义证书)";
                })()}</p>
                }
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">日志级别：</span> {(() => {
                  if (formData.logLevel === "inherit") {
                    const selectedEndpoint = endpoints.find(e => e.id === formData.apiEndpoint);
                    const masterLog = selectedEndpoint?.log;
                    return masterLog ? `继承主控设置 (${masterLog.toUpperCase()})` : "继承主控设置";
                  }
                  return formData.logLevel.toUpperCase();
                })()}</p>
                {formData.password && (
                  <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">隧道密码：</span> 已设置密码保护</p>
                )}
                {formData.mode === "client" && (formData.min || formData.max) && (
                  <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-2"></span><span className="font-semibold">连接池容量：</span> {formData.min || '默认(64)'} ~ {formData.max || '默认(8192)'}</p>
                )}
              </div>
            </CardBody>
          </Card>
          <Card className="p-2 bg-default-50 border-2 border-default-200 shadow-none">
            <CardBody>
              <h3 className="text-lg font-semibold mb-4">等效命令行</h3>
              <Snippet>
                {(() => {
                  let base = formData.mode + "://";
                  if (formData.password) {
                    base += `${formData.password}@`;
                  }
                  base += `${formData.tunnelAddress}:${formData.tunnelPort}/${formData.targetAddress}:${formData.targetPort}`;
                  
                  if (formData.mode === "server") {
                    const params: string[] = [];
                    if (formData.logLevel !== "inherit") params.push(`log=${formData.logLevel}`);
                    if (formData.tlsMode !== "inherit") {
                      params.push(`tls=${formData.tlsMode === "mode0" ? "0" : formData.tlsMode === "mode1" ? "1" : "2"}`);
                      if (formData.tlsMode === "mode2") {
                        params.push(`crt=${formData.certPath}`);
                        params.push(`key=${formData.keyPath}`);
                      }
                    }
                    return params.length ? `${base}?${params.join("&")}` : base;
                  } else {
                    const params: string[] = [];
                    if (formData.logLevel !== "inherit") params.push(`log=${formData.logLevel}`);
                    if (formData.min) params.push(`min=${formData.min}`);
                    if (formData.max) params.push(`max=${formData.max}`);
                    return params.length ? `${base}?${params.join("&")}` : base;
                  }
                })()}
              </Snippet>
            </CardBody>
          </Card>
        </CardBody>
      </Card>


      <div className="flex justify-end gap-3">
        <Button
          variant="flat"
          onClick={() => router.back()}
        >
          取消
        </Button>
        <Button
          color="primary"
          onClick={handleSubmit}
          isDisabled={submitting}
        >
          {submitting ? "创建中..." : "创建实例"}
        </Button>
      </div>
    </div>
  );
} 