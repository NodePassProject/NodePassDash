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
  Listbox,
  ListboxItem,
  Alert,
  cn,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGlobe,
  faRefresh,
  faArrowRight,
  faArrowLeft,
  faSignInAlt,
  faSignOutAlt,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

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
  clientEndpointHost?: string; // 新增：server 的 endpoint host
  serverListenPort?: number; // 新增：server 的监听端口
  serverTargetAddress?: string;
  serverTargetPort?: number;
  clientExtendTargetAddress?: string[]; // 扩展目标地址（负载均衡）
  serverExtendTargetAddress?: string[]; // 扩展目标地址（负载均衡）
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
  clientEndpointHost,
  serverListenPort,
  serverTargetAddress,
  serverTargetPort,
  clientExtendTargetAddress = [],
  serverExtendTargetAddress = [],
}) => {
  const { t } = useTranslation("common");
  const { t: ts } = useTranslation("services");
  const [tcpingTarget, setTcpingTarget] = React.useState("");
  const [tcpingLoading, setTcpingLoading] = React.useState(false);
  const [tcpingResult, setTcpingResult] = React.useState<TcpingResult | null>(null);

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
          throw new Error(data.error || ts("tcpingModal.toast.testFailed"));
        }
      } catch (error) {
        console.error("TCPing test failed:", error);
        addToast({
          title: ts("tcpingModal.toast.testFailed"),
          description: error instanceof Error ? error.message : ts("tcpingModal.toast.unknownError"),
          color: "danger",
        });
      } finally {
        setTcpingLoading(false);
      }
    },
    [ts],
  );

  // 判断延迟是否优秀的函数
  const getLatencyQuality = (latency: number) => {
    if (latency < 50) return { text: t("latencyQuality.excellent"), color: "success" } as const;
    if (latency < 100) return { text: t("latencyQuality.good"), color: "primary" } as const;
    if (latency < 200) return { text: t("latencyQuality.fair"), color: "warning" } as const;

    return { text: t("latencyQuality.poor"), color: "danger" } as const;
  };

  // 获取所有地址选项列表（包含入口和出口）
  const getAllAddressOptions = React.useMemo(() => {
    const addresses: Array<{
      key: string;
      type: "entry" | "exit";
      label: string;
      address: string;
      instanceId: string;
    }> = [];

    // 添加入口地址
    let entryAddr = "";
    let entryPort = 0;
    let entryInstanceId = "";
    let exitAddr = "";
    let exitPort = 0;
    let exitInstanceId = "";
    let extendTargetAddress: string[] = [];

    if (serviceType === "0" || serviceType === "5") {
      // type=0,5: 单端转发/均衡单端转发 - 使用 client 的 tunnelAddress，如果为空则使用 endpoint.host
      entryAddr = clientTunnelAddress || clientEndpointHost || "";
      entryPort = clientListenPort || 0;
      entryInstanceId = clientInstanceId || "";
      exitAddr = clientTargetAddress || "";
      exitPort = clientTargetPort || 0;
      exitInstanceId = clientInstanceId || "";
      extendTargetAddress = clientExtendTargetAddress
    } else if (serviceType === "1" || serviceType === "3" || serviceType === "6") {
      // type=1,3,6: 内网穿透 - 使用 server 的 tunnelAddress，如果为空则使用 server 的 endpoint.host
      entryAddr = serverTunnelAddress || serverEndpointHost || "";
      entryPort = serverTargetPort || 0;
      entryInstanceId = serverInstanceId || "";
      exitAddr = clientTargetAddress || "";
      exitPort = clientTargetPort || 0;
      exitInstanceId = clientInstanceId || "";
      extendTargetAddress = clientExtendTargetAddress

    } else {
      // type=2,4,7: 隧道转发 - 使用 server 的 tunnelAddress，如果为空则使用 server 的 endpoint.host
      entryAddr = clientTargetAddress || clientEndpointHost || "";
      entryPort = clientTargetPort || 0;
      entryInstanceId = clientInstanceId || "";

      exitAddr = serverTargetAddress || "";
      exitPort = serverTargetPort || 0;
      exitInstanceId = serverInstanceId || "";
      extendTargetAddress = serverExtendTargetAddress

    }

    const entryFullAddr = `${entryAddr}:${entryPort}`;
    addresses.push({
      key: "entry",
      type: "entry",
      label: ts("tcpingModal.addressList.entryAddress"),
      address: entryFullAddr,
      instanceId: entryInstanceId,
    });

    // Add exit address (main target address)
    const mainAddr = `${exitAddr}:${exitPort}`;
    addresses.push({
      key: "exit-main",
      type: "exit",
      label: ts("tcpingModal.addressList.exitAddress"),
      address: mainAddr,
      instanceId: exitInstanceId || "",
    });

    // Add extended target addresses
    if (extendTargetAddress && extendTargetAddress.length > 0) {
      extendTargetAddress.forEach((addr, index) => {
        addresses.push({
          key: `exit-${index}`,
          type: "exit",
          label: ts("tcpingModal.addressList.exitAddressN", { n: index + 1 }),
          address: typeof addr === "string" ? addr : JSON.stringify(addr),
          instanceId: clientInstanceId || "",
        });
      });
    }

    return addresses;
  }, [
    ts,
    serviceType,
    clientTunnelAddress,
    clientListenPort,
    serverTunnelAddress,
    serverEndpointHost,
    serverListenPort,
    clientTargetAddress,
    clientTargetPort,
    clientExtendTargetAddress,
    serverExtendTargetAddress,
    clientInstanceId,
    serverInstanceId,
  ]);

  // 处理模态框关闭
  const handleClose = () => {
    setTcpingTarget("");
    setTcpingResult(null);
    setTcpingLoading(false);
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
            <ModalHeader className="flex flex-col gap-1 pb-0">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faGlobe} />
                {ts("tcpingModal.title")}
              </div>
            </ModalHeader>

            {tcpingLoading ? (
              // 加载状态 - 充斥整个模态窗内容
              <ModalBody className="flex-1 flex items-center justify-center py-12">
                <div className="flex flex-col items-center space-y-4">
                  <Spinner color="primary" size="lg" />
                  <p className="text-default-600 animate-pulse">
                    {ts("tcpingModal.loading.testing")}
                  </p>
                  <p className="text-xs text-default-400">
                    {ts("tcpingModal.loading.targetAddress")}: {tcpingTarget}
                  </p>
                </div>
              </ModalBody>
            ) : tcpingResult ? (
              <>
                {/* 结果显示状态 */}
                <ModalBody className="px-8 pt-8">
                  {/* 顶部信息：两列布局 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-2">
                    {/* 左列 */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">{ts("tcpingModal.result.targetAddress")}</p>
                        <p className="text-sm font-semibold font-mono">{tcpingResult.target}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">{ts("tcpingModal.result.connectionStatus")}</p>
                        <Chip
                          className="text-xs uppercase tracking-wider"
                          color={
                            tcpingResult.connected ? "success" : "danger"
                          }
                          variant="flat"
                        >
                          {tcpingResult.connected
                            ? ts("tcpingModal.result.connected")
                            : ts("tcpingModal.result.disconnected")}
                        </Chip>
                      </div>
                    </div>

                    {/* 右列 */}
                    <div className="space-y-4 ">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-default-500">{ts("tcpingModal.result.packetLoss")}</p>
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
                        <p className="text-sm font-medium text-default-500">{ts("tcpingModal.result.networkQuality")}</p>
                        <Chip
                          className="text-xs uppercase tracking-wider"
                          color={tcpingResult.avgLatency != null ? getLatencyQuality(tcpingResult.avgLatency).color : "default"}
                          variant="flat"
                        >
                          {tcpingResult.avgLatency != null ? getLatencyQuality(tcpingResult.avgLatency).text : "-"}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Response Time Analysis Card */}
                  <div className="bg-default-100 dark:bg-default-50/5 border border-default-200 rounded-lg p-6 mb-4">
                    <h3 className="text-base font-semibold mb-6">{ts("tcpingModal.analysis.title")}</h3>

                    {/* Three-column latency statistics */}
                    <div className="grid grid-cols-3 gap-6 mb-6">
                      <div className="text-center">
                        <p className="text-sm text-default-500 mb-1">{ts("tcpingModal.analysis.fastest")}</p>
                        <p className="text-2xl font-bold text-success">
                          {tcpingResult.minLatency || 0}{" "}
                          <span className="text-base font-medium text-default-500 ml-0.5">ms</span>
                        </p>
                      </div>
                      <div className="text-center border-x border-default-200">
                        <p className="text-sm text-default-500 mb-1">{ts("tcpingModal.analysis.average")}</p>
                        <p className="text-2xl font-bold text-primary">
                          {tcpingResult.avgLatency?.toFixed(1) || 0}{" "}
                          <span className="text-base font-medium text-default-500 ml-0.5">ms</span>
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-default-500 mb-1">{ts("tcpingModal.analysis.slowest")}</p>
                        <p className="text-2xl font-bold text-warning">
                          {tcpingResult.maxLatency || 0}{" "}
                          <span className="text-base font-medium text-default-500 ml-0.5">ms</span>
                        </p>
                      </div>
                    </div>

                    {/* 延迟质量指示器 */}
                    {tcpingResult.avgLatency != null && (
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

                {/* Result footer */}
                <ModalFooter className="pt-0">
                  <Button variant="flat" onPress={handleClose}>
                    {ts("tcpingModal.actions.close")}
                  </Button>
                  <Button
                    color="primary"
                    startContent={
                      <FontAwesomeIcon icon={faRefresh} className="text-base" />
                    }
                    onPress={() => {
                      setTcpingResult(null);
                    }}
                  >
                    {ts("tcpingModal.actions.retest")}
                  </Button>
                </ModalFooter>
              </>
            ) : (
              // Address selection state
              <>
                <ModalBody className="p-6">
                  <div className="space-y-4">
                    {/* Hint */}
                    <Alert
                      color="secondary"
                      description={ts("tcpingModal.addressList.selectHint")}
                      title={serviceType === "0" ? ts("tcpingModal.modes.singleForward") : serviceType === "1" ? ts("tcpingModal.modes.natPenetration") : ts("tcpingModal.modes.tunnelForward")}
                      variant="faded"
                    />

                    {/* Address list */}
                    <div className="border border-default-200 rounded-lg overflow-hidden">
                      <Listbox
                        aria-label={ts("tcpingModal.addressList.selectHint")}
                        classNames={{
                          base: "max-w-full",
                          list: "max-h-[400px] overflow-auto",
                        }}
                        disabledKeys={["entry"]}
                        onAction={(key) => {
                          const option = getAllAddressOptions.find((opt) => opt.key === key);
                          if (option) {
                            performTcpingTest(option.address, option.instanceId);
                          }
                        }}
                      >
                        {getAllAddressOptions.map((option) => (
                          <ListboxItem
                            key={option.key}
                            classNames={{
                              base: "py-3 px-4 hover:bg-default-100 cursor-pointer transition-colors",
                            }}
                            showDivider={option.type === "entry"}
                            startContent={
                              <div
                                className={`flex items-center justify-center w-10 h-10 rounded-lg ${option.type === "entry"
                                  ? "bg-success/10 text-success"
                                  : "bg-primary/10 text-primary"
                                  }`}
                              >
                                <FontAwesomeIcon
                                  icon={option.type === "entry" ? faSignInAlt : faSignOutAlt}
                                  className="text-lg"
                                />
                              </div>
                            }
                            textValue={option.label}
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">{option.label}</span>
                              <span className="text-xs font-mono text-default-500">
                                {option.address}
                              </span>
                            </div>
                          </ListboxItem>
                        ))}
                      </Listbox>
                    </div>
                  </div>
                </ModalBody>
                {/* Address selection footer */}
                <ModalFooter className="pt-0">
                  <Button color="default" variant="flat" onPress={handleClose}>
                    {ts("tcpingModal.actions.close")}
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
