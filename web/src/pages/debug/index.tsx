import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Chip,
  Spinner,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faServer,
  faNetworkWired,
  faPlay,
  faRefresh,
  faEthernet,
  faPingPongPaddleBall,
  faCode,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

// 系统环境信息类型
interface SystemInfo {
  platform: string;
  architecture: string;
  installType: "binary" | "docker" | "unknown";
  ipv6Supported: boolean;
  goVersion: string;
  nodeVersion?: string;
  dockerVersion?: string;
}

// SSE测试结果类型
interface SSETestResult {
  success: boolean;
  url: string;
  connected: boolean;
  message: string;
  responseTime: number;
  statusCode?: number;
  error?: string;
}

// Telnet测试结果类型
interface TelnetTestResult {
  success: boolean;
  host: string;
  port: number;
  connected: boolean;
  message: string;
  responseTime: number;
}

// Ping测试结果类型
interface PingTestResult {
  success: boolean;
  host: string;
  packetsSent: number;
  packetsRecv: number;
  packetLoss: number;
  minTime?: number;
  maxTime?: number;
  avgTime?: number;
  output: string;
  error?: string;
}

export default function DebugPage() {
  const navigate = useNavigate();

  // 系统信息状态
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);

  // SSE测试状态
  const [sseTesting, setSseTesting] = useState(false);
  const [sseResult, setSseResult] = useState<SSETestResult | null>(null);
  const [sseNodepassUrl, setSseNodepassUrl] = useState("");
  const [sseApiKey, setSseApiKey] = useState("");

  // Telnet测试状态
  const [telnetHost, setTelnetHost] = useState("");
  const [telnetPort, setTelnetPort] = useState("");
  const [telnetTesting, setTelnetTesting] = useState(false);
  const [telnetResult, setTelnetResult] = useState<TelnetTestResult | null>(
    null,
  );

  // Ping测试状态
  const [pingHost, setPingHost] = useState("");
  const [pingCount, setPingCount] = useState("4");
  const [pingTesting, setPingTesting] = useState(false);
  const [pingResult, setPingResult] = useState<PingTestResult | null>(null);

  // 模态框控制
  const {
    isOpen: isSSEModalOpen,
    onOpen: onSSEModalOpen,
    onOpenChange: onSSEModalChange,
  } = useDisclosure();
  const {
    isOpen: isTelnetModalOpen,
    onOpen: onTelnetModalOpen,
    onOpenChange: onTelnetModalChange,
  } = useDisclosure();
  const {
    isOpen: isPingModalOpen,
    onOpen: onPingModalOpen,
    onOpenChange: onPingModalChange,
  } = useDisclosure();

  // 获取系统环境信息
  const fetchSystemInfo = useCallback(async () => {
    try {
      setSystemLoading(true);
      const response = await fetch(buildApiUrl("/api/debug/system-info"));

      if (!response.ok) {
        throw new Error("获取系统信息失败");
      }

      const data = await response.json();

      if (data.success) {
        setSystemInfo(data.data);
      } else {
        throw new Error(data.error || "获取系统信息失败");
      }
    } catch (error) {
      console.error("获取系统信息失败:", error);
      addToast({
        title: "系统信息获取失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setSystemLoading(false);
    }
  }, []);

  // 执行SSE测试
  const runSSETest = useCallback(async () => {
    if (sseTesting || !sseNodepassUrl || !sseApiKey) return;

    setSseTesting(true);
    setSseResult(null);

    try {
      const response = await fetch(buildApiUrl("/api/debug/sse-test"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: sseNodepassUrl,
          apiKey: sseApiKey,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSseResult(data.data);
      } else {
        addToast({
          title: "SSE测试失败",
          description: data.error || "未知错误",
          color: "danger",
        });
      }
    } catch (error) {
      console.error("SSE测试失败:", error);
      addToast({
        title: "SSE测试失败",
        description: error instanceof Error ? error.message : "网络错误",
        color: "danger",
      });
    } finally {
      setSseTesting(false);
    }
  }, [sseNodepassUrl, sseApiKey, sseTesting]);

  // 执行Telnet测试
  const runTelnetTest = useCallback(async () => {
    if (telnetTesting || !telnetHost || !telnetPort) return;

    setTelnetTesting(true);
    setTelnetResult(null);

    try {
      const response = await fetch(buildApiUrl("/api/debug/telnet-test"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: telnetHost,
          port: parseInt(telnetPort, 10),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTelnetResult(data.data);
      } else {
        addToast({
          title: "Telnet测试失败",
          description: data.error || "未知错误",
          color: "danger",
        });
      }
    } catch (error) {
      console.error("Telnet测试失败:", error);
      addToast({
        title: "Telnet测试失败",
        description: error instanceof Error ? error.message : "网络错误",
        color: "danger",
      });
    } finally {
      setTelnetTesting(false);
    }
  }, [telnetHost, telnetPort, telnetTesting]);

  // 执行Ping测试
  const runPingTest = useCallback(async () => {
    if (pingTesting || !pingHost) return;

    setPingTesting(true);
    setPingResult(null);

    try {
      const response = await fetch(buildApiUrl("/api/debug/ping-test"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: pingHost,
          count: parseInt(pingCount, 10) || 4,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPingResult(data.data);
      } else {
        addToast({
          title: "Ping测试失败",
          description: data.error || "未知错误",
          color: "danger",
        });
      }
    } catch (error) {
      console.error("Ping测试失败:", error);
      addToast({
        title: "Ping测试失败",
        description: error instanceof Error ? error.message : "网络错误",
        color: "danger",
      });
    } finally {
      setPingTesting(false);
    }
  }, [pingHost, pingCount, pingTesting]);

  // 初始化数据
  useEffect(() => {
    fetchSystemInfo();
  }, [fetchSystemInfo]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 顶部返回按钮和标题 */}
      <div className="flex items-center gap-3">
        <Button
          isIconOnly
          className="bg-default-100 hover:bg-default-200"
          variant="flat"
          onClick={() => navigate(-1)}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">调试工具</h1>
          <p className="text-sm text-default-500">系统环境信息与SSE连接测试</p>
        </div>
      </div>

      {/* 系统环境信息 */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon className="text-primary" icon={faServer} />
            <h3 className="text-lg font-semibold">系统环境信息</h3>
          </div>
          <Button
            isIconOnly
            isLoading={systemLoading}
            size="sm"
            variant="flat"
            onPress={fetchSystemInfo}
          >
            <FontAwesomeIcon icon={faRefresh} />
          </Button>
        </CardHeader>
        <CardBody>
          {systemLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size="md" />
            </div>
          ) : systemInfo ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-default-600">操作系统</span>
                  <Chip color="default" size="sm" variant="flat">
                    {systemInfo.platform} ({systemInfo.architecture})
                  </Chip>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-default-600">安装方式</span>
                  <Chip
                    color={
                      systemInfo.installType === "docker"
                        ? "primary"
                        : "secondary"
                    }
                    size="sm"
                    variant="flat"
                  >
                    {systemInfo.installType === "docker"
                      ? "Docker 容器"
                      : systemInfo.installType === "binary"
                        ? "二进制文件"
                        : "未知"}
                  </Chip>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm text-default-600">IPv6 支持</span>
                  <Chip
                    color={systemInfo.ipv6Supported ? "success" : "danger"}
                    size="sm"
                    variant="flat"
                  >
                    {systemInfo.ipv6Supported ? "支持" : "不支持"}
                  </Chip>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-default-600">Go 版本</span>
                  <Chip color="primary" size="sm" variant="flat">
                    {systemInfo.goVersion}
                  </Chip>
                </div>

                {systemInfo.nodeVersion && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-default-600">
                      Node.js 版本
                    </span>
                    <Chip color="success" size="sm" variant="flat">
                      {systemInfo.nodeVersion}
                    </Chip>
                  </div>
                )}

                {systemInfo.dockerVersion && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-default-600">
                      Docker 版本
                    </span>
                    <Chip color="secondary" size="sm" variant="flat">
                      {systemInfo.dockerVersion}
                    </Chip>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-danger">
              <p>无法获取系统信息</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* SSE连接测试 */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon className="text-primary" icon={faNetworkWired} />
            <h3 className="text-lg font-semibold">SSE连接测试</h3>
          </div>
          <Button
            color="primary"
            size="sm"
            startContent={<FontAwesomeIcon icon={faPlay} />}
            variant="flat"
            onPress={onSSEModalOpen}
          >
            开始测试
          </Button>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            <p className="text-sm text-default-600">
              测试NodePass服务器SSE端点连通性和认证
            </p>

            {sseTesting && (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-3">
                  <Spinner size="md" />
                  <span className="text-default-500">正在测试SSE连接...</span>
                </div>
              </div>
            )}

            {!sseTesting && sseResult && (
              <div
                className={`p-3 rounded-lg border ${sseResult.connected ? "bg-success-50 border-success-200" : "bg-danger-50 border-danger-200"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{sseResult.url}/sse</span>
                  <Chip
                    color={sseResult.connected ? "success" : "danger"}
                    size="sm"
                    variant="flat"
                  >
                    {sseResult.connected ? "连接成功" : "连接失败"}
                  </Chip>
                </div>
                <p className="text-sm text-default-700">{sseResult.message}</p>
                {sseResult.connected && (
                  <div className="text-xs text-default-500 mt-1 flex items-center gap-4">
                    <span>响应时间: {sseResult.responseTime}ms</span>
                    {sseResult.statusCode && (
                      <span>状态码: {sseResult.statusCode}</span>
                    )}
                  </div>
                )}
                {sseResult.error && (
                  <p className="text-sm text-danger-700 mt-2">
                    {sseResult.error}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 网络工具 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Telnet测试 */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon className="text-primary" icon={faEthernet} />
              <h3 className="text-lg font-semibold">Telnet测试</h3>
            </div>
            <Button
              color="primary"
              isDisabled={telnetTesting}
              size="sm"
              startContent={<FontAwesomeIcon icon={faPlay} />}
              variant="flat"
              onPress={onTelnetModalOpen}
            >
              开始测试
            </Button>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <p className="text-sm text-default-600">
                测试TCP端口连通性，检查目标主机端口是否开放
              </p>

              {telnetTesting && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <Spinner size="md" />
                    <span className="text-default-500">
                      正在测试端口连通性...
                    </span>
                  </div>
                </div>
              )}

              {!telnetTesting && telnetResult && (
                <div
                  className={`p-3 rounded-lg border ${telnetResult.connected ? "bg-success-50 border-success-200" : "bg-danger-50 border-danger-200"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {telnetResult.host}:{telnetResult.port}
                    </span>
                    <Chip
                      color={telnetResult.connected ? "success" : "danger"}
                      size="sm"
                      variant="flat"
                    >
                      {telnetResult.connected ? "连接成功" : "连接失败"}
                    </Chip>
                  </div>
                  <p className="text-sm text-default-700">
                    {telnetResult.message}
                  </p>
                  {telnetResult.connected && (
                    <p className="text-xs text-default-500 mt-1">
                      响应时间: {telnetResult.responseTime}ms
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Ping测试 */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon
                className="text-primary"
                icon={faPingPongPaddleBall}
              />
              <h3 className="text-lg font-semibold">Ping测试</h3>
            </div>
            <Button
              color="primary"
              isDisabled={pingTesting}
              size="sm"
              startContent={<FontAwesomeIcon icon={faPlay} />}
              variant="flat"
              onPress={onPingModalOpen}
            >
              开始测试
            </Button>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <p className="text-sm text-default-600">
                测试网络连通性和延迟，检查目标主机是否可达
              </p>

              {pingTesting && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <Spinner size="md" />
                    <span className="text-default-500">
                      正在测试网络连通性...
                    </span>
                  </div>
                </div>
              )}

              {!pingTesting && pingResult && (
                <div
                  className={`p-3 rounded-lg border ${pingResult.success && pingResult.packetLoss < 100 ? "bg-success-50 border-success-200" : "bg-danger-50 border-danger-200"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{pingResult.host}</span>
                    <Chip
                      color={
                        pingResult.success && pingResult.packetLoss < 100
                          ? "success"
                          : "danger"
                      }
                      size="sm"
                      variant="flat"
                    >
                      {pingResult.success
                        ? `${pingResult.packetLoss}% 丢包`
                        : "测试失败"}
                    </Chip>
                  </div>

                  {pingResult.success && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-default-500">发送: </span>
                        <span>{pingResult.packetsSent}</span>
                      </div>
                      <div>
                        <span className="text-default-500">接收: </span>
                        <span>{pingResult.packetsRecv}</span>
                      </div>
                      {pingResult.avgTime && (
                        <>
                          <div>
                            <span className="text-default-500">平均: </span>
                            <span>{pingResult.avgTime.toFixed(1)}ms</span>
                          </div>
                          <div>
                            <span className="text-default-500">最大: </span>
                            <span>
                              {pingResult.maxTime?.toFixed(1) || "-"}ms
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {pingResult.error && (
                    <p className="text-sm text-danger-700 mt-2">
                      {pingResult.error}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* SSE测试模态框 */}
      <Modal
        isOpen={isSSEModalOpen}
        placement="center"
        onOpenChange={onSSEModalChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    className="text-primary"
                    icon={faNetworkWired}
                  />
                  NodePass SSE连接测试
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    isDisabled={sseTesting}
                    label="NodePass URL"
                    placeholder="https://your-nodepass.com"
                    startContent={
                      <FontAwesomeIcon
                        className="text-default-400"
                        icon={faServer}
                      />
                    }
                    value={sseNodepassUrl}
                    variant="bordered"
                    onValueChange={setSseNodepassUrl}
                  />
                  <Input
                    isDisabled={sseTesting}
                    label="API Key"
                    placeholder="请输入API密钥"
                    startContent={
                      <FontAwesomeIcon
                        className="text-default-400"
                        icon={faCode}
                      />
                    }
                    type="password"
                    value={sseApiKey}
                    variant="bordered"
                    onValueChange={setSseApiKey}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={sseTesting}
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={!sseNodepassUrl || !sseApiKey}
                  isLoading={sseTesting}
                  onPress={() => {
                    runSSETest();
                    onClose();
                  }}
                >
                  开始测试
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Telnet测试模态框 */}
      <Modal
        isOpen={isTelnetModalOpen}
        placement="center"
        onOpenChange={onTelnetModalChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="text-primary" icon={faEthernet} />
                  Telnet连通性测试
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    isDisabled={telnetTesting}
                    label="目标主机"
                    placeholder="例如: google.com 或 192.168.1.1"
                    value={telnetHost}
                    variant="bordered"
                    onValueChange={setTelnetHost}
                  />
                  <Input
                    isDisabled={telnetTesting}
                    label="端口号"
                    placeholder="例如: 80, 443, 22"
                    type="number"
                    value={telnetPort}
                    variant="bordered"
                    onValueChange={setTelnetPort}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={telnetTesting}
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={!telnetHost || !telnetPort}
                  isLoading={telnetTesting}
                  onPress={() => {
                    runTelnetTest();
                    onClose();
                  }}
                >
                  开始测试
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Ping测试模态框 */}
      <Modal
        isOpen={isPingModalOpen}
        placement="center"
        onOpenChange={onPingModalChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    className="text-primary"
                    icon={faPingPongPaddleBall}
                  />
                  Ping网络测试
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    isDisabled={pingTesting}
                    label="目标主机"
                    placeholder="例如: google.com 或 8.8.8.8"
                    value={pingHost}
                    variant="bordered"
                    onValueChange={setPingHost}
                  />
                  <Input
                    isDisabled={pingTesting}
                    label="测试次数"
                    placeholder="默认 4 次，最多 10 次"
                    type="number"
                    value={pingCount}
                    variant="bordered"
                    onValueChange={setPingCount}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={pingTesting}
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={!pingHost}
                  isLoading={pingTesting}
                  onPress={() => {
                    runPingTest();
                    onClose();
                  }}
                >
                  开始测试
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
