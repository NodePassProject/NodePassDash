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
import { faBug } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

interface TcpingTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  targetAddress: string;
  targetPort: number;
  extendTargetAddress?: string[];
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
  instanceId,
  targetAddress,
  targetPort,
  extendTargetAddress = [],
}) => {
  const [tcpingTarget, setTcpingTarget] = React.useState("");
  const [tcpingLoading, setTcpingLoading] = React.useState(false);
  const [tcpingSelectedAddress, setTcpingSelectedAddress] = React.useState<string | null>(null);
  const [tcpingResult, setTcpingResult] = React.useState<TcpingResult | null>(null);

  // 执行TCPing测试的函数
  const performTcpingTest = React.useCallback(
    async (target: string) => {
      if (!instanceId) return;

      setTcpingTarget(target);
      setTcpingLoading(true);
      setTcpingResult(null);

      try {
        const response = await fetch(
          `/api/tunnels/${instanceId}/tcping`,
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
    [instanceId],
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

    // 使用选中的地址进行测试
    performTcpingTest(tcpingSelectedAddress);
  };

  // 判断延迟是否优秀的函数
  const getLatencyQuality = (latency: number) => {
    if (latency < 50) return { text: "优秀", color: "success" };
    if (latency < 100) return { text: "良好", color: "primary" };
    if (latency < 200) return { text: "一般", color: "warning" };

    return { text: "较差", color: "danger" };
  };

  // 合并主目标地址和扩展地址的辅助函数
  const getAddressOptions = React.useMemo(() => {
    const addresses = [];
    const mainAddr = `${targetAddress}:${targetPort}`;

    // 添加主目标地址
    addresses.push({
      value: mainAddr,
      label: mainAddr,
      description: "主目标地址",
    });

    // 添加扩展目标地址
    if (extendTargetAddress && extendTargetAddress.length > 0) {
      extendTargetAddress.forEach((addr, index) => {
        addresses.push({
          value: addr,
          label: typeof addr === "string" ? addr : JSON.stringify(addr),
          description: `扩展地址 #${index + 1}`,
        });
      });
    }

    return addresses;
  }, [targetAddress, targetPort, extendTargetAddress]);

  // 当模态框打开时初始化选中的地址，如果只有一个地址则自动开始测试
  React.useEffect(() => {
    if (isOpen && !tcpingLoading && !tcpingResult) {
      const mainAddress = `${targetAddress}:${targetPort}`;
      const hasExtendAddresses = extendTargetAddress && extendTargetAddress.length > 0;

      if (hasExtendAddresses) {
        // 有多个地址，默认选择第一个，等待用户确认
        if (!tcpingSelectedAddress) {
          setTcpingSelectedAddress(extendTargetAddress[0]);
        }
      } else {
        // 只有一个地址，直接开始测试
        setTcpingSelectedAddress(mainAddress);
        // 延迟执行以确保状态已更新
        const timer = setTimeout(() => {
          performTcpingTest(mainAddress);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, targetAddress, targetPort, extendTargetAddress, tcpingLoading, tcpingResult, performTcpingTest]);

  // 处理模态框关闭
  const handleClose = () => {
    setTcpingTarget("");
    setTcpingResult(null);
    setTcpingLoading(false);
    setTcpingSelectedAddress(null);
    onClose();
  };

  return (
    <Modal
      hideCloseButton={tcpingLoading || (!tcpingResult && !tcpingLoading)}
      isDismissable={!tcpingLoading && !!tcpingResult}
      isOpen={isOpen}
      placement="center"
      size="lg"
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
                <FontAwesomeIcon className="text-primary" icon={faBug} />
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
                <ModalBody className="py-0">
                  <div className="space-y-6">
                    {/* 测试结果卡片 */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg p-6 border border-default-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className={`w-3 h-3 rounded-full ${tcpingResult.connected ? "bg-success animate-pulse" : "bg-danger"}`}
                        />
                        <h3 className="text-lg font-semibold">测试结果</h3>
                      </div>

                      {/* 目标地址 */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-default-500 mb-1">
                            目标地址
                          </p>
                          <p className="font-mono text-sm text-primary">
                            {tcpingResult.target}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-default-500 mb-1">
                            连接状态
                          </p>
                          <Chip
                            className="text-xs"
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

                      {/* 始终显示统计信息，无论成功还是失败 */}
                      <div className="space-y-4">
                        {/* 丢包率和网络质量评估 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-default-500 mb-1">
                              丢包率
                            </p>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-lg font-bold ${(tcpingResult.packetLoss || 0) === 0 ? "text-success" : (tcpingResult.packetLoss || 0) < 20 ? "text-warning" : "text-danger"}`}
                              >
                                {tcpingResult.packetLoss?.toFixed(1) || "0.0"}
                              </span>
                              <span className="text-sm text-default-600">
                                %
                              </span>
                            </div>
                          </div>
                          {tcpingResult.avgLatency && (
                            <div>
                              <p className="text-xs text-default-500 mb-1">
                                网络质量
                              </p>
                              <Chip
                                className="text-xs"
                                color={
                                  getLatencyQuality(tcpingResult.avgLatency)
                                    .color as any
                                }
                                variant="flat"
                              >
                                {
                                  getLatencyQuality(tcpingResult.avgLatency)
                                    .text
                                }
                              </Chip>
                            </div>
                          )}
                        </div>

                        {/* 延迟统计 - 始终显示，空值显示为 - */}
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-default-500 mb-1">
                              最快响应
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-bold text-success">
                                {tcpingResult.minLatency
                                  ? tcpingResult.minLatency
                                  : "-"}
                              </span>
                              {tcpingResult.minLatency && (
                                <span className="text-xs text-default-600">
                                  ms
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-default-500 mb-1">
                              平均响应
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-bold text-primary">
                                {tcpingResult.avgLatency
                                  ? tcpingResult.avgLatency.toFixed(1)
                                  : "-"}
                              </span>
                              {tcpingResult.avgLatency && (
                                <span className="text-xs text-default-600">
                                  ms
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-default-500 mb-1">
                              最慢响应
                            </p>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-bold text-warning">
                                {tcpingResult.maxLatency
                                  ? tcpingResult.maxLatency
                                  : "-"}
                              </span>
                              {tcpingResult.maxLatency && (
                                <span className="text-xs text-default-600">
                                  ms
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 延迟质量指示器 */}
                        {tcpingResult.avgLatency && (
                          <div className="mt-4">
                            <div className="flex justify-between text-xs text-default-500 mb-2">
                              <span>0ms</span>
                              <span>50ms</span>
                              <span>100ms</span>
                              <span>200ms+</span>
                            </div>
                            <div className="h-2 bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 rounded-full relative">
                              {/* 位置标记 - 使用圆形标记 */}
                              <div
                                className="absolute -top-1 w-4 h-4 bg-white rounded-full border-2 border-primary shadow-lg flex items-center justify-center"
                                style={{
                                  left: `${Math.min((tcpingResult.avgLatency / 200) * 100, 100)}%`,
                                  transform: "translateX(-50%)",
                                }}
                              >
                                <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ModalBody>
                {/* 结果显示时的Footer */}
                <ModalFooter>
                  <Button
                    className="flex-1"
                    color="primary"
                    onPress={() => {
                      setTcpingResult(null);
                      handleTcpingTest();
                    }}
                  >
                    重新测试
                  </Button>
                  <Button
                    className="flex-1"
                    variant="flat"
                    onPress={handleClose}
                  >
                    关闭
                  </Button>
                </ModalFooter>
              </>
            ) : (
              // 地址选择状态
              <>
                <ModalBody className="py-0">
                  <div className="space-y-6">
                    {/* 如果有扩展目标地址，显示RadioGroup */}
                    <div className="space-y-4">
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 border border-blue-200 dark:border-blue-900">
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                          ℹ️ 检测到多个目标地址
                        </p>
                        <p className="text-xs text-blue-800 dark:text-blue-200">
                          此隧道配置了负载均衡，请选择要测试的目标地址，然后点击测试按钮开始诊断。
                        </p>
                      </div>

                      <div className="border border-default-200 p-4">
                        <RadioGroup
                          value={tcpingSelectedAddress || ""}
                          onValueChange={setTcpingSelectedAddress}
                        >
                          {getAddressOptions.map((option) => (
                            <Radio
                              key={option.value}
                              classNames={{
                                base: cn(
                                  "inline-flex max-w-md w-full bg-content1 m-0",
                                  "hover:bg-content2 items-center justify-start",
                                  "cursor-pointer rounded-lg gap-2 p-4 border-2 border-transparent",
                                  "data-[selected=true]:border-primary",
                                ),
                              }}
                              value={option.value}
                            >
                              <span className="font-mono text-sm break-words ">
                                {option.label}
                              </span>
                            </Radio>
                          ))}
                        </RadioGroup>
                      </div>
                    </div>
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
