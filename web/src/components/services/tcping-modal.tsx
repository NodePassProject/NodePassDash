import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
  Chip,
  RadioGroup,
  Radio,
  cn,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

interface TcpingTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceType?: string; // 服务类型：0=单端转发，1=NAT穿透，2=隧道转发
  // Client 端数据
  clientInstanceId?: string;
  clientTunnelAddress?: string;
  clientListenPort?: number;
  clientTargetAddress?: string;
  clientTargetPort?: number;
  // Server 端数据（type=1,2 时使用）
  serverInstanceId?: string;
  serverTunnelAddress?: string; // 新增：server 的隧道地址
  serverEndpointHost?: string; // 新增：server 的 endpoint host
  serverListenPort?: number; // 新增：server 的监听端口
  serverTargetAddress?: string;
  serverTargetPort?: number;
  extendTargetAddress?: string[]; // 扩展目标地址（负载均衡）
}

interface TcpingResult {
  target: string;
  connected: boolean;
  latency: number;
  error: string;
  minLatency?: number;
  maxLatency?: number;
  avgLatency?: number;
  packetLoss?: number;
  totalTests?: number;
  successfulTests?: number;
}

export const TcpingTestModal: React.FC<TcpingTestModalProps> = ({
  isOpen,
  onClose,
  serviceType,
  clientInstanceId,
  clientTunnelAddress,
  clientListenPort,
  clientTargetAddress,
  clientTargetPort,
  serverInstanceId,
  serverTunnelAddress,
  serverEndpointHost,
  serverListenPort,
  serverTargetAddress,
  serverTargetPort,
  extendTargetAddress = [],
}) => {
  const [tcpingTarget, setTcpingTarget] = React.useState("");
  const [tcpingLoading, setTcpingLoading] = React.useState(false);
  const [tcpingSelectedAddress, setTcpingSelectedAddress] = React.useState<string | null>(null);
  const [tcpingResult, setTcpingResult] = React.useState<TcpingResult | null>(null);
  // 测试类型：只有 "entry" | "exit" 两种
  const [testType, setTestType] = React.useState<"entry" | "exit">("exit");

  // 执行TCPing测试的函数
  const performTcpingTest = React.useCallback(
    async (target: string, useInstanceId: string) => {
      if (!useInstanceId) return;

      setTcpingTarget(target);
      setTcpingLoading(true);
      setTcpingResult(null);

      try {
        const response = await fetch(
          `/api/tunnels/${useInstanceId}/tcping`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target }),
          },
        );

        const data = await response.json();

        if (response.ok && data.success) {
          setTcpingResult(data.result);
        } else {
          throw new Error(data.error || "诊断测试失败");
        }
      } catch (error) {
        console.error("TCPing诊断测试失败:", error);
        addToast({
          title: "诊断测试失败",
          description: error instanceof Error ? error.message : "未知错误",
          color: "danger",
        });
      } finally {
        setTcpingLoading(false);
      }
    },
    [],
  );

  // TCPing诊断测试处理函数（用户点击按钮时调用）
  const handleTcpingTest = async () => {
    if (tcpingLoading) return;

    // 如果没有选择地址，返回
    if (!tcpingSelectedAddress) {
      addToast({
        title: "请选择目标地址",
        description: "请先选择一个目标地址后再进行测试",
        color: "warning",
      });
      return;
    }

    // 根据测试类型选择 instanceId
    let useInstanceId = "";

    if (serviceType === "0") {
      // type=0: 只使用 client
      useInstanceId = clientInstanceId || "";
    } else {
      // type=1,2: 根据测试类型选择
      if (testType === "exit") {
        useInstanceId = clientInstanceId || "";
      } else if (testType === "entry") {
        useInstanceId = serverInstanceId || "";
      }
    }

    if (!useInstanceId) {
      addToast({
        title: "实例ID不存在",
        description: "无法找到对应的实例ID",
        color: "danger",
      });
      return;
    }

    // 使用选中的地址进行测试
    performTcpingTest(tcpingSelectedAddress, useInstanceId);
  };

  // 判断延迟是否优秀的函数
  const getLatencyQuality = (latency: number) => {
    if (latency < 50) return { text: "优秀", color: "success" };
    if (latency < 100) return { text: "良好", color: "primary" };
    if (latency < 200) return { text: "一般", color: "warning" };

    return { text: "较差", color: "danger" };
  };

  // 根据测试类型获取地址选项列表
  const getAddressOptions = React.useMemo(() => {
    const addresses: Array<{ value: string; label: string; description: string }> = [];

    if (testType === "entry") {
      // 入口测试
      let entryAddr = "";
      let entryPort = 0;

      if (serviceType === "0") {
        // type=0: 使用 client 的 tunnelAddress，如果为空则使用 client 的 endpoint.host
        entryAddr = clientTunnelAddress || serverEndpointHost || "";
        entryPort = clientListenPort || 0;
      } else {
        // type=1,2: 使用 server 的 tunnelAddress，如果为空则使用 server 的 endpoint.host
        entryAddr = serverTunnelAddress || serverEndpointHost || "";
        entryPort = serverListenPort || 0;
      }

      const fullAddr = `${entryAddr}:${entryPort}`;

      addresses.push({
        value: fullAddr,
        label: fullAddr,
        description: "入口地址",
      });
    } else if (testType === "exit") {
      // 出口测试：使用 clientTargetAddress 和可能的 extendTargetAddress
      const mainAddr = `${clientTargetAddress}:${clientTargetPort}`;

      addresses.push({
        value: mainAddr,
        label: mainAddr,
        description: "主目标地址",
      });

      // 如果有扩展目标地址，添加到列表
      if (extendTargetAddress && extendTargetAddress.length > 0) {
        extendTargetAddress.forEach((addr, index) => {
          addresses.push({
            value: addr,
            label: typeof addr === "string" ? addr : JSON.stringify(addr),
            description: `扩展地址 #${index + 1}`,
          });
        });
      }
    }

    return addresses;
  }, [
    testType,
    serviceType,
    clientTunnelAddress,
    clientListenPort,
    serverTunnelAddress,
    serverEndpointHost,
    serverListenPort,
    clientTargetAddress,
    clientTargetPort,
    extendTargetAddress,
  ]);

  // 当模态框打开或测试类型改变时，更新选中的地址
  React.useEffect(() => {
    if (isOpen && !tcpingLoading && !tcpingResult) {
      const addressOptions = getAddressOptions;

      if (addressOptions.length > 0) {
        // 默认选择第一个地址
        setTcpingSelectedAddress(addressOptions[0].value);
      }
    }
  }, [isOpen, tcpingLoading, tcpingResult, testType, getAddressOptions]);

  // 处理模态框关闭
  const handleClose = () => {
    setTcpingTarget("");
    setTcpingResult(null);
    setTcpingLoading(false);
    setTcpingSelectedAddress(null);
    setTestType("exit"); // 重置为默认出口
    onClose();
  };

  return (
    <Modal
      hideCloseButton={tcpingLoading || (!tcpingResult && !tcpingLoading)}
      isDismissable={!tcpingLoading && !!tcpingResult}
      isOpen={isOpen}
      placement="center"
      size="2xl"
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <ModalContent className="min-h-[400px]">
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 ">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faGlobe} />
                网络诊断测试
              </div>
            </ModalHeader>

            {tcpingLoading ? (
              // 加载状态 - 充斥整个模态窗内容
              <ModalBody className="flex-1 flex items-center justify-center py-12">
                <div className="flex flex-col items-center space-y-4">
                  <Spinner color="primary" size="lg" />
                  <p className="text-default-600 animate-pulse">
                    正在进行连通性测试...
                  </p>
                  <p className="text-xs text-default-400">
                    目标地址: {tcpingTarget}
                  </p>
                </div>
              </ModalBody>
            ) : tcpingResult ? (
              <>
                {/* 结果显示状态 */}
                <ModalBody className="px-8">
                  {/* 顶部信息：两列布局 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-2">
                    {/* 左列 */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">目标地址</p>
                        <p className="text-sm font-semibold font-mono">{tcpingResult.target}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">连接状态</p>
                        <Chip
                          className="text-xs uppercase tracking-wider"
                          color={
                            tcpingResult.connected ? "success" : "danger"
                          }
                          variant="flat"
                        >
                          {tcpingResult.connected
                            ? "✓ 连接成功"
                            : "✗ 连接失败"}
                        </Chip>
                      </div>
                    </div>

                    {/* 右列 */}
                    <div className="space-y-4 ">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">丢包率</p>
                        <p
                          className={`text-sm font-semibold ${(tcpingResult.packetLoss || 0) === 0
                            ? "text-success"
                            : (tcpingResult.packetLoss || 0) < 20
                              ? "text-warning"
                              : "text-danger"
                            }`}
                        >
                          {tcpingResult.packetLoss?.toFixed(1) || "0.0"}%
                        </p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">网络质量</p>
                        <Chip
                          className="text-xs uppercase tracking-wider"
                          color={
                            getLatencyQuality(tcpingResult.avgLatency).color
                          }
                          variant="flat"
                        >
                          {tcpingResult.avgLatency ? getLatencyQuality(tcpingResult.avgLatency).text : "-"}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Response Time Analysis 卡片 */}
                  <div className="bg-default-100 dark:bg-default-50/5 border border-default-200 rounded-lg p-6 mb-4">
                    <h3 className="text-base font-semibold mb-6">响应时间分析</h3>

                    {/* 三列延迟统计 */}
                    <div className="grid grid-cols-3 gap-6 mb-6">
                      <div className="text-center">
                        <p className="text-sm text-default-500 mb-1">最快响应</p>
                        <p className="text-2xl font-bold text-success">
                          {tcpingResult.minLatency || 0}{" "}
                          <span className="text-base font-medium text-default-500 ml-0.5">ms</span>
                        </p>
                      </div>
                      <div className="text-center border-x border-default-200">
                        <p className="text-sm text-default-500 mb-1">平均响应</p>
                        <p className="text-2xl font-bold text-primary">
                          {tcpingResult.avgLatency?.toFixed(1) || 0}{" "}
                          <span className="text-base font-medium text-default-500 ml-0.5">ms</span>
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-default-500 mb-1">最慢响应</p>
                        <p className="text-2xl font-bold text-warning">
                          {tcpingResult.maxLatency || 0}{" "}
                          <span className="text-base font-medium text-default-500 ml-0.5">ms</span>
                        </p>
                      </div>
                    </div>

                    {/* 延迟质量指示器 */}
                    {tcpingResult.avgLatency !== undefined && (
                      <div className="relative pt-2">
                        {/* 渐变进度条 */}
                        <div className="relative h-2 w-full rounded-full bg-default-200 overflow-hidden">
                          <div
                            className="absolute h-full bg-gradient-to-r from-success via-warning to-danger"
                            style={{ width: "100%" }}
                          />
                        </div>

                        {/* 位置标记 */}
                        <div
                          className="absolute -top-1 transform -translate-x-1/2"
                          style={{
                            left: `${Math.min((tcpingResult.avgLatency / 200) * 100, 100)}%`,
                          }}
                        >
                          <div className="relative flex flex-col items-center">
                            {/* 数值标签 */}
                            <div className="absolute -top-8 bg-default-900 dark:bg-default-100 text-default-100 dark:text-default-900 text-xs font-semibold px-2 py-1 rounded whitespace-nowrap">
                              {tcpingResult.avgLatency.toFixed(1)} ms
                            </div>
                            {/* 小三角 */}
                            <div className="w-2 h-2 -mt-1.5 bg-default-900 dark:bg-default-100 rotate-45 transform" />
                            {/* 圆形标记 */}
                            <div className="w-4 h-4 rounded-full bg-white dark:bg-default-900 border-2 border-primary shadow-lg" />
                          </div>
                        </div>

                        {/* 刻度标签 */}
                        <div className="flex justify-between text-xs text-default-500 mt-3 px-1">
                          <span>0ms</span>
                          <span>50ms</span>
                          <span>100ms</span>
                          <span>200ms+</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ModalBody>

                {/* 结果显示时的Footer */}
                <ModalFooter className="bg-default-50 dark:bg-default-100/5 border-t border-default-200">
                  <Button variant="flat" onPress={handleClose}>
                    关闭
                  </Button>
                  <Button
                    color="primary"
                    startContent={
                      <FontAwesomeIcon icon={faRefresh} className="text-base" />
                    }
                    onPress={() => {
                      setTcpingResult(null);
                      handleTcpingTest();
                    }}
                  >
                    重新测试
                  </Button>
                </ModalFooter>
              </>
            ) : (
              // 地址选择状态
              <>
                <ModalBody className="py-0">
                  <div className="space-y-6">
                    {/* 测试类型选择 */}
                    <div className="space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                          ℹ️ {serviceType === "0" ? "单端转发模式" : serviceType === "1" ? "NAT穿透模式" : "隧道转发模式"}
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-200">
                          请选择测试入口还是出口连通性
                        </p>
                      </div>

                      <div className="border border-default-200 p-4 rounded-lg">
                        <p className="text-sm font-medium mb-3">测试类型</p>
                        <RadioGroup
                          value={testType}
                          onValueChange={(value) => {
                            setTestType(value as "entry" | "exit");
                            setTcpingResult(null); // 清除之前的测试结果
                          }}
                        >
                          <Radio
                            classNames={{
                              base: cn(
                                "inline-flex max-w-md w-full bg-content1 m-0 mb-2",
                                "hover:bg-content2 items-center justify-start",
                                "cursor-pointer rounded-lg gap-2 p-4 border-2 border-transparent",
                                "data-[selected=true]:border-primary",
                              ),
                            }}
                            value="entry"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-semibold">测试入口</span>
                              <span className="text-xs text-default-500">
                                {serviceType === "0" ? "Client 端测试监听地址" : "Server 端测试隧道入口"}
                              </span>
                              <span className="text-xs text-default-400 font-mono">
                                {serviceType === "0"
                                  ? `${clientTunnelAddress || serverEndpointHost}:${clientListenPort || 0}`
                                  : `${serverTunnelAddress || serverEndpointHost || ""}:${serverListenPort || 0}`
                                }
                              </span>
                            </div>
                          </Radio>
                          <Radio
                            classNames={{
                              base: cn(
                                "inline-flex max-w-md w-full bg-content1 m-0",
                                "hover:bg-content2 items-center justify-start",
                                "cursor-pointer rounded-lg gap-2 p-4 border-2 border-transparent",
                                "data-[selected=true]:border-primary",
                              ),
                            }}
                            value="exit"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-semibold">测试出口</span>
                              <span className="text-xs text-default-500">
                                Client 端测试目标地址
                              </span>
                              <span className="text-xs text-default-400 font-mono">
                                {clientTargetAddress || ""}:{clientTargetPort || 0}
                                {extendTargetAddress && extendTargetAddress.length > 0 && ` (+${extendTargetAddress.length})`}
                              </span>
                            </div>
                          </Radio>
                        </RadioGroup>
                      </div>
                    </div>

                    {/* 地址选择区域 - 始终显示 */}
                    {getAddressOptions.length > 0 && (
                      <div className="space-y-4">
                        {/* 如果有多个地址，显示提示 */}
                        {testType === "exit" && getAddressOptions.length > 1 && (
                          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                              ℹ️ 检测到多个目标地址
                            </p>
                            <p className="text-xs text-blue-800 dark:text-blue-200">
                              此服务配置了负载均衡，请选择要测试的目标地址
                            </p>
                          </div>
                        )}

                        <div className="border border-default-200 p-4 rounded-lg">
                          <p className="text-sm font-medium mb-3">
                            {getAddressOptions.length > 1 ? "选择目标地址" : "目标地址"}
                          </p>
                          <RadioGroup
                            value={tcpingSelectedAddress || ""}
                            onValueChange={setTcpingSelectedAddress}
                          >
                            {getAddressOptions.map((option) => (
                              <Radio
                                key={option.value}
                                classNames={{
                                  base: cn(
                                    "inline-flex max-w-md w-full bg-content1 m-0 mb-2 last:mb-0",
                                    "hover:bg-content2 items-center justify-start",
                                    "cursor-pointer rounded-lg gap-2 p-4 border-2 border-transparent",
                                    "data-[selected=true]:border-primary",
                                  ),
                                }}
                                value={option.value}
                              >
                                <div className="flex flex-col gap-1">
                                  <span className="font-mono text-sm">{option.label}</span>
                                  <span className="text-xs text-default-400">{option.description}</span>
                                </div>
                              </Radio>
                            ))}
                          </RadioGroup>
                        </div>
                      </div>
                    )}
                  </div>
                </ModalBody>
                {/* 地址选择时的Footer */}
                <ModalFooter>
                  <Button
                    color="default"
                    variant="light"
                    onPress={handleClose}
                  >
                    关闭
                  </Button>
                  <Button
                    color="primary"
                    isDisabled={!tcpingSelectedAddress}
                    onPress={() => {
                      handleTcpingTest();
                    }}
                  >
                    开始测试
                  </Button>
                </ModalFooter>
              </>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
