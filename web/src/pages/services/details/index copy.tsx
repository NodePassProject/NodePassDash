import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
  Tooltip,
  Tab,
  Tabs,
} from "@heroui/react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faRefresh,
  faPlay,
  faRotateRight,
  faTrash,
  faStop,
  faBug,
  faRecycle,
  faSync,
  faExpand,
  faArrowRight,
  faShield,
  faExchangeAlt,
  faServer,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { Icon } from "@iconify/react";

import { buildApiUrl } from "@/lib/utils";
import { useSettings } from "@/components/providers/settings-provider";
import CellValue from "@/pages/tunnels/details/cell-value";
import RenameServiceModal from "@/components/services/rename-service-modal";
import { TcpingTestModal } from "@/components/services/tcping-modal";
import { DetailedTrafficChart } from "@/components/ui/detailed-traffic-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { ConnectionsChart } from "@/components/ui/connections-chart";
import { LatencyChart } from "@/components/ui/latency-chart";
import { useMetricsTrend } from "@/lib/hooks/use-metrics-trend";
import { FullscreenChartModal } from "@/pages/tunnels/details/fullscreen-chart-modal";

// 定义隧道详情类型(从tunnels/details复制)
interface TunnelInfo {
  id: number;
  instanceId: string;
  name: string;
  type: "server" | "client";
  status: "success" | "danger" | "warning";
  endpoint: {
    name: string;
    id: number;
    version: string;
    tls: string;
    log: string;
  };
  password?: string;
  certPath?: string;
  keyPath?: string;
  listenPort: number;
  logLevel: string;
  max?: number | null;
  min?: number | null;
  mode?: number | null;
  proxyProtocol?: boolean | null;
  rate?: number | null;
  read?: string;
  restart: boolean;
  slot?: number | null;
  quic?: boolean | null;
  targetPort: number;
  tlsMode: string;
  commandLine: string;
  configLine: string;
  config: any;
  tags: { [key: string]: string };
  peer?: {
    sid?: string;
    type?: string;
    alias?: string;
  } | null;
  tunnelAddress: string;
  targetAddress: string;
  extendTargetAddress: string[];
  listenType: "ALL" | "TCP" | "UDP";
  ping: number | null;
  pool: number | null;
  tcpRx: number;
  tcpTx: number;
  tcps: number | null;
  udpRx: number;
  udpTx: number;
  udps: number | null;
  nodepassInfo: any;
  error?: string;
  instanceTags?: { [key: string]: string };
}

// 定义服务详情类型
interface ServiceDetails {
  sid: string;
  type: string;
  alias?: string;
  serverInstanceId?: string;
  clientInstanceId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ServiceDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sid = searchParams.get("sid");
  const [service, setService] = useState<ServiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { settings } = useSettings();

  // 流量格式化函数
  const formatTrafficValue = (bytes: number) => {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = Math.abs(bytes);
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return {
      value: value.toFixed(2),
      unit: units[unitIndex],
    };
  };

  // 隧道详情相关状态
  const [clientTunnel, setClientTunnel] = useState<TunnelInfo | null>(null);
  const [serverTunnel, setServerTunnel] = useState<TunnelInfo | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);

  // 重命名模态框状态
  const [renameModalOpen, setRenameModalOpen] = useState(false);

  // TCPing 模态框状态
  const [tcpingModalOpen, setTcpingModalOpen] = useState(false);

  // 确认对话框状态
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "dissolve" | "delete";
  } | null>(null);

  // 统计图表相关状态
  const [selectedStatsTab, setSelectedStatsTab] = useState<string>("traffic");
  const [fullscreenChart, setFullscreenChart] = useState<{
    isOpen: boolean;
    type: string;
    title: string;
  }>({
    isOpen: false,
    type: "",
    title: "",
  });

  // 根据 type 获取模式文案
  const getTypeLabel = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "单端转发";
      case "1":
        return "NAT穿透";
      case "2":
        return "隧道转发";
      default:
        return typeValue;
    }
  };

  // 根据 type 获取英文模式名称
  const getTypeEnglishLabel = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "Single-end Forwarding";
      case "1":
        return "NAT Traversal";
      case "2":
        return "Tunnel Forwarding";
      default:
        return typeValue;
    }
  };

  // 根据类型获取图标
  const getTypeIcon = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return faArrowRight;
      case "1":
        return faShield;
      case "2":
        return faExchangeAlt;
      default:
        return faServer;
    }
  };

  // 根据类型获取颜色
  const getTypeColor = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "primary";
      case "1":
        return "success";
      case "2":
        return "secondary";
      default:
        return "default";
    }
  };

  // 获取服务详情
  const fetchServiceDetails = useCallback(async () => {
    if (!sid) {
      navigate("/services");

      return;
    }

    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(`/api/services/${sid}`));

      if (!response.ok) {
        throw new Error("获取服务详情失败");
      }

      const data = await response.json();

      setService(data.service);
    } catch (error) {
      console.error("获取服务详情失败:", error);
      addToast({
        title: "获取服务详情失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
      navigate("/services");
    } finally {
      setLoading(false);
    }
  }, [sid, navigate]);

  // 获取隧道详情
  const fetchTunnelDetails = useCallback(async (instanceId: string, type: "client" | "server") => {
    try {
      setTunnelLoading(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${instanceId}/details`));

      if (!response.ok) {
        throw new Error(`获取${type}隧道详情失败`);
      }

      const data = await response.json();

      if (type === "client") {
        setClientTunnel(data);
      } else {
        setServerTunnel(data);
      }
    } catch (error) {
      console.error(`获取${type}隧道详情失败:`, error);
      addToast({
        title: `获取${type}隧道详情失败`,
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setTunnelLoading(false);
    }
  }, []);

  // 手动刷新页面数据的函数
  const handleRefresh = useCallback(async () => {
    if (refreshLoading) return;

    setRefreshLoading(true);
    try {
      await fetchServiceDetails();
      // 刷新隧道详情
      if (service?.clientInstanceId) {
        await fetchTunnelDetails(service.clientInstanceId, "client");
      }
      if (service?.serverInstanceId) {
        await fetchTunnelDetails(service.serverInstanceId, "server");
      }
    } catch (error) {
      console.error("[前端手动刷新] 刷新数据失败:", error);
      addToast({
        title: "刷新失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setRefreshLoading(false);
    }
  }, [refreshLoading, fetchServiceDetails, fetchTunnelDetails, service]);

  // 数据转换函数 - 详细流量图表
  const transformDetailedTrafficData = useCallback((apiData: any) => {
    const tcpInTimestamps = apiData?.tcp_in?.created_at || [];
    const tcpInValues = apiData?.tcp_in?.avg_delay || [];
    const tcpOutTimestamps = apiData?.tcp_out?.created_at || [];
    const tcpOutValues = apiData?.tcp_out?.avg_delay || [];
    const udpInTimestamps = apiData?.udp_in?.created_at || [];
    const udpInValues = apiData?.udp_in?.avg_delay || [];
    const udpOutTimestamps = apiData?.udp_out?.created_at || [];
    const udpOutValues = apiData?.udp_out?.avg_delay || [];

    const allTimestamps = [
      ...new Set([
        ...tcpInTimestamps,
        ...tcpOutTimestamps,
        ...udpInTimestamps,
        ...udpOutTimestamps,
      ]),
    ].sort((a, b) => a - b);

    const result = allTimestamps.map((timestamp: number) => {
      const tcpInIndex = tcpInTimestamps.indexOf(timestamp);
      const tcpOutIndex = tcpOutTimestamps.indexOf(timestamp);
      const udpInIndex = udpInTimestamps.indexOf(timestamp);
      const udpOutIndex = udpOutTimestamps.indexOf(timestamp);

      return {
        timeStamp: new Date(timestamp).toISOString(),
        tcpIn: tcpInIndex >= 0 ? tcpInValues[tcpInIndex] || 0 : 0,
        tcpOut: tcpOutIndex >= 0 ? tcpOutValues[tcpOutIndex] || 0 : 0,
        udpIn: udpInIndex >= 0 ? udpInValues[udpInIndex] || 0 : 0,
        udpOut: udpOutIndex >= 0 ? udpOutValues[udpOutIndex] || 0 : 0,
      };
    });

    return result;
  }, []);

  // 数据转换函数 - 传输速率
  const transformSpeedData = useCallback((apiData: any) => {
    const speedInTimestamps = apiData?.speed_in?.created_at || [];
    const speedInValues = apiData?.speed_in?.avg_delay || [];
    const speedOutTimestamps = apiData?.speed_out?.created_at || [];
    const speedOutValues = apiData?.speed_out?.avg_delay || [];

    const allTimestamps = [
      ...new Set([...speedInTimestamps, ...speedOutTimestamps]),
    ].sort();

    const result = allTimestamps.map((timestamp: number) => {
      const speedInIndex = speedInTimestamps.indexOf(timestamp);
      const speedOutIndex = speedOutTimestamps.indexOf(timestamp);

      return {
        timeStamp: new Date(timestamp).toISOString(),
        speed_in: speedInIndex >= 0 ? speedInValues[speedInIndex] || 0 : 0,
        speed_out: speedOutIndex >= 0 ? speedOutValues[speedOutIndex] || 0 : 0,
      };
    });

    return result;
  }, []);

  // 数据转换函数 - 端内延迟
  const transformLatencyData = useCallback((apiData: any) => {
    if (!apiData?.ping?.created_at || !apiData?.ping?.avg_delay) {
      return [];
    }

    const result = apiData.ping.created_at.map(
      (timestamp: number, index: number) => ({
        timeStamp: new Date(timestamp).toISOString(),
        latency: apiData.ping.avg_delay[index] || 0,
      }),
    );

    return result;
  }, []);

  // 数据转换函数 - 连接数
  const transformConnectionsData = useCallback((apiData: any) => {
    const poolTimestamps = apiData?.pool?.created_at || [];
    const tcpsTimestamps = apiData?.tcps?.created_at || [];
    const udpsTimestamps = apiData?.udps?.created_at || [];

    const poolValues = apiData?.pool?.avg_delay || [];
    const tcpsValues = apiData?.tcps?.avg_delay || [];
    const udpsValues = apiData?.udps?.avg_delay || [];

    const allTimestamps = [
      ...new Set([...poolTimestamps, ...tcpsTimestamps, ...udpsTimestamps]),
    ].sort((a, b) => a - b);

    const result = allTimestamps.map((timestamp: number) => {
      const poolIndex = poolTimestamps.indexOf(timestamp);
      const tcpsIndex = tcpsTimestamps.indexOf(timestamp);
      const udpsIndex = udpsTimestamps.indexOf(timestamp);

      return {
        timeStamp: new Date(timestamp).toISOString(),
        pool:
          poolIndex >= 0 ? Math.round(poolValues[poolIndex] || 0) : undefined,
        tcps:
          tcpsIndex >= 0 ? Math.round(tcpsValues[tcpsIndex] || 0) : undefined,
        udps:
          udpsIndex >= 0 ? Math.round(udpsValues[udpsIndex] || 0) : undefined,
      };
    });

    return result;
  }, []);

  // 打开全屏图表
  const openFullscreenChart = (type: string, title: string) => {
    setFullscreenChart({ isOpen: true, type, title });
  };

  // 获取当前显示的隧道实例ID
  const currentTunnelInstanceId = service
    ? service.type !== "0"
      ? serverTunnel?.instanceId
      : clientTunnel?.instanceId
    : undefined;

  // 使用metrics趋势hook
  const {
    data: metricsData,
    loading: metricsLoading,
    error: metricsError,
  } = useMetricsTrend({
    tunnelId: currentTunnelInstanceId || "",
    autoRefresh: !!currentTunnelInstanceId,
    refreshInterval: 15000,
  });

  // 处理服务操作(启动、停止、重启)
  const handleServiceAction = async (
    action: "start" | "stop" | "restart",
  ) => {
    if (!service) return;

    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/${action}`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "操作失败");
      }

      const actionText =
        action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
      addToast({
        title: `${actionText}成功`,
        description: `服务 ${service.alias || service.sid} 已${actionText}`,
        color: "success",
      });

      // 刷新页面数据
      await handleRefresh();
    } catch (error) {
      console.error("操作失败:", error);
      const actionText =
        action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
      addToast({
        title: `${actionText}失败`,
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 处理同步服务
  const handleSyncService = async () => {
    if (!service) return;

    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/sync`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "同步失败");
      }

      addToast({
        title: "同步成功",
        description: `服务 ${service.alias || service.sid} 已同步`,
        color: "success",
      });

      // 刷新页面数据
      await handleRefresh();
    } catch (error) {
      console.error("同步失败:", error);
      addToast({
        title: "同步失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 处理确认操作
  const handleConfirmedAction = async () => {
    if (!confirmAction || !service) return;

    const { type } = confirmAction;

    try {
      const endpoint =
        type === "dissolve"
          ? `/api/services/${service.sid}/dissolve`
          : `/api/services/${service.sid}`;
      const method = type === "dissolve" ? "POST" : "DELETE";

      const response = await fetch(buildApiUrl(endpoint), {
        method,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "操作失败");
      }

      addToast({
        title: type === "dissolve" ? "解散成功" : "删除成功",
        description: `服务 ${service.alias || service.sid} 已${type === "dissolve" ? "解散" : "删除"}`,
        color: "success",
      });

      // 删除操作成功后返回服务列表页
      if (type === "delete") {
        navigate("/services");
      } else {
        // 解散操作后刷新页面
        await handleRefresh();
      }
    } catch (error) {
      console.error("操作失败:", error);
      addToast({
        title: type === "dissolve" ? "解散失败" : "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }

    setConfirmModalOpen(false);
    setConfirmAction(null);
  };

  useEffect(() => {
    fetchServiceDetails();
  }, [fetchServiceDetails]);

  // 当服务加载完成后,获取隧道详情
  useEffect(() => {
    if (service) {
      // 获取客户端隧道详情
      if (service.clientInstanceId) {
        fetchTunnelDetails(service.clientInstanceId, "client");
      }
      // 获取服务端隧道详情
      if (service.serverInstanceId) {
        fetchTunnelDetails(service.serverInstanceId, "server");
      }
    }
  }, [service, fetchTunnelDetails]);

  // 整页loading状态 - 当点击刷新按钮时显示
  if (refreshLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Spinner color="primary" size="lg" />
          </div>
          <p className="text-default-500 animate-pulse">刷新数据中...</p>
        </div>
      </div>
    );
  }

  if (loading || !service) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Spinner color="primary" size="lg" />
          </div>
          <p className="text-default-500 animate-pulse">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 md:space-y-6 p-4 md:p-0">
        {/* 顶部操作区 - 响应式布局 */}
        <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:justify-between md:items-center">
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              isIconOnly
              className="bg-default-100 hover:bg-default-200 "
              variant="flat"
              onClick={() => navigate(-1)}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </Button>
            <h1 className="text-lg md:text-2xl font-bold truncate">
              {service.alias || service.sid}
            </h1>
            <Chip
              color={getTypeColor(service.type) as any}
              variant="flat"
            >
              {getTypeLabel(service.type)}
            </Chip>
          </div>

          {/* 操作按钮组 - 桌面端显示 */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <Button
              className="flex-shrink-0"
              color="default"
              isDisabled={refreshLoading}
              startContent={<FontAwesomeIcon icon={faRefresh} />}
              variant="flat"
              onPress={handleRefresh}
            >
              刷新
            </Button>
          </div>
          {/* 操作按钮组 - 移动端显示 */}
          <div className="sm:hidden flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <Button
              className="flex-shrink-0"
              color="default"
              isDisabled={refreshLoading}
              size="sm"
              startContent={<FontAwesomeIcon icon={faRefresh} />}
              variant="flat"
              onClick={handleRefresh}
            >
              刷新
            </Button>
          </div>
        </div>

        {/* 服务信息 - 使用 CellValue 组件 */}
        <Card className="p-2">
          <CardHeader className="flex items-center  justify-between pb-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">服务信息</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {/* 服务 SID */}
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:hash"
                      width={18}
                    />
                  }
                  label="服务 SID"
                  value={
                    <div className="overflow-hidden">
                      <Tooltip
                        content={service.sid}
                        placement="top"
                      >
                        <span className="font-mono text-sm truncate block">
                          {service.sid}
                        </span>
                      </Tooltip>
                    </div>
                  }
                />

                {/* 别名 */}
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:tag"
                      width={18}
                    />
                  }
                  isInteractive={true}
                  label="服务别名"
                  value={service.alias || "-"}
                  onPress={() => setRenameModalOpen(true)}
                />

                {/* Server 实例 */}
                {service.serverInstanceId && (
                  <CellValue
                    icon={
                      <Icon
                        className="text-default-600"
                        height={18}
                        icon="lucide:server"
                        width={18}
                      />
                    }
                    isInteractive={true}
                    onPress={() => {
                      navigate(`/tunnels/details?id=${service.serverInstanceId}`);
                    }}
                    label="Server 实例"
                    value={service.serverInstanceId}
                  />
                )}

                {/* Client 实例 */}
                {service.clientInstanceId && (
                  <CellValue
                    icon={
                      <Icon
                        className="text-default-600"
                        height={18}
                        icon="lucide:monitor"
                        width={18}
                      />
                    }
                    isInteractive={true}
                    onPress={() => {
                      navigate(`/tunnels/details?id=${service.clientInstanceId}`);
                    }}
                    label="Client 实例"
                    value={service.clientInstanceId}
                  />
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 快捷操作 */}
        <Card className="p-2">
          <CardBody>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {/* SSE调试 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="default"
                variant="flat"
                onPress={() => {
                  navigate(`/services/sse?sid=${service.sid}`);
                }}
              >
                <Icon className="text-xl" height={18} icon="lucide:mouse-pointer" width={18} />
                <span className="text-xs">SSE调试</span>
              </Button>

              {/* 网络调试 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="default"
                variant="flat"
                onPress={() => setTcpingModalOpen(true)}
              >
                <FontAwesomeIcon className="text-xl" icon={faBug} />
                <span className="text-xs">网络测试</span>
              </Button>

              {/* 一键启动 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="success"
                variant="flat"
                onPress={() => handleServiceAction("start")}
              >
                <FontAwesomeIcon className="text-xl" icon={faPlay} />
                <span className="text-xs">一键启动</span>
              </Button>

              {/* 一键停止 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="warning"
                variant="flat"
                onPress={() => handleServiceAction("stop")}
              >
                <FontAwesomeIcon className="text-xl" icon={faStop} />
                <span className="text-xs">一键停止</span>
              </Button>

              {/* 一键重启 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="secondary"
                variant="flat"
                onPress={() => handleServiceAction("restart")}
              >
                <FontAwesomeIcon className="text-xl" icon={faRotateRight} />
                <span className="text-xs">一键重启</span>
              </Button>

              {/* 删除服务 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="danger"
                variant="flat"
                onPress={() => {
                  setConfirmAction({ type: "delete" });
                  setConfirmModalOpen(true);
                }}
              >
                <FontAwesomeIcon className="text-xl" icon={faTrash} />
                <span className="text-xs">删除服务</span>
              </Button>

              {/* 同步实例 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="default"
                variant="flat"
                onPress={() => handleSyncService()}
              >
                <FontAwesomeIcon className="text-xl" icon={faSync} />
                <span className="text-xs">同步实例</span>
              </Button>

              {/* 解散服务 */}
              <Button
                className="h-20 w-full flex-col gap-2 rounded-xl"
                color="warning"
                variant="flat"
                onPress={() => {
                  setConfirmAction({ type: "dissolve" });
                  setConfirmModalOpen(true);
                }}
              >
                <Icon className="text-xl" height={18} icon="lucide:link-2-off" width={18} />
                <span className="text-xs">解散服务</span>
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* 隧道详情区域 */}
        {tunnelLoading ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <Spinner color="primary" size="lg" />
          </div>
        ) : (
          <>
            {/* 根据 type 决定显示哪个实例：type != 0 时显示服务端，type = 0 时显示客户端 */}
            {((service.type !== "0" && serverTunnel) || (service.type === "0" && clientTunnel)) && (
              <div className="space-y-4">
                {/* 数据统计卡片 - 正方形圆角布局 */}
                {!settings.isExperimentalMode && (() => {
                  const tunnel = service.type !== "0" ? serverTunnel : clientTunnel;
                  const tcpRx = tunnel?.tcpRx || 0;
                  const tcpTx = tunnel?.tcpTx || 0;
                  const udpRx = tunnel?.udpRx || 0;
                  const udpTx = tunnel?.udpTx || 0;
                  const pool = tunnel?.pool;
                  const ping = tunnel?.ping;
                  const tcps = tunnel?.tcps;
                  const udps = tunnel?.udps;

                  const tcpRxFormatted = formatTrafficValue(tcpRx);
                  const tcpTxFormatted = formatTrafficValue(tcpTx);
                  const udpRxFormatted = formatTrafficValue(udpRx);
                  const udpTxFormatted = formatTrafficValue(udpTx);

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {/* TCP流量 */}
                      <Card className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 border-none shadow-sm hover:shadow-md transition-shadow">
                        <CardBody className="flex flex-col items-center justify-center p-3">
                          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">
                            TCP 流量
                          </div>
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                            <div className="flex flex-col items-center">
                              <div className="text-[10px] opacity-60">↑发送</div>
                              <div className="text-base font-bold">
                                {tcpTxFormatted.value}
                                <span className="text-[10px] ml-0.5">{tcpTxFormatted.unit}</span>
                              </div>
                            </div>
                            <div className="w-px h-8 bg-blue-300 dark:bg-blue-700" />
                            <div className="flex flex-col items-center">
                              <div className="text-[10px] opacity-60">↓接收</div>
                              <div className="text-base font-bold">
                                {tcpRxFormatted.value}
                                <span className="text-[10px] ml-0.5">{tcpRxFormatted.unit}</span>
                              </div>
                            </div>
                          </div>
                        </CardBody>
                      </Card>

                      {/* UDP流量 */}
                      <Card className="rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20 border-none shadow-sm hover:shadow-md transition-shadow">
                        <CardBody className="flex flex-col items-center justify-center p-3">
                          <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-2">
                            UDP 流量
                          </div>
                          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                            <div className="flex flex-col items-center">
                              <div className="text-[10px] opacity-60">↑发送</div>
                              <div className="text-base font-bold">
                                {udpTxFormatted.value}
                                <span className="text-[10px] ml-0.5">{udpTxFormatted.unit}</span>
                              </div>
                            </div>
                            <div className="w-px h-8 bg-purple-300 dark:bg-purple-700" />
                            <div className="flex flex-col items-center">
                              <div className="text-[10px] opacity-60">↓接收</div>
                              <div className="text-base font-bold">
                                {udpRxFormatted.value}
                                <span className="text-[10px] ml-0.5">{udpRxFormatted.unit}</span>
                              </div>
                            </div>
                          </div>
                        </CardBody>
                      </Card>

                      {/* 端内延迟 */}
                      {ping !== null && ping !== undefined && (
                        <Card className="rounded-xl bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950/30 dark:to-pink-900/20 border-none shadow-sm hover:shadow-md transition-shadow">
                          <CardBody className="flex flex-col items-center justify-center p-3">
                            <div className="text-xs font-medium text-pink-600 dark:text-pink-400 mb-1">
                              端内延迟
                            </div>
                            <div className="text-xl font-bold text-pink-700 dark:text-pink-300">
                              {ping}
                              <span className="text-xs ml-1">ms</span>
                            </div>
                          </CardBody>
                        </Card>
                      )}

                      {/* 池连接数 */}
                      {pool !== null && pool !== undefined && (
                        <Card className="rounded-xl bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/20 border-none shadow-sm hover:shadow-md transition-shadow">
                          <CardBody className="flex flex-col items-center justify-center p-3">
                            <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-1">
                              池连接数
                            </div>
                            <div className="text-xl font-bold text-cyan-700 dark:text-cyan-300">
                              {pool}
                              <span className="text-xs ml-1">个</span>
                            </div>
                          </CardBody>
                        </Card>
                      )}

                      {/* TCP连接数 */}
                      {tcps !== null && tcps !== undefined && (
                        <Card className="rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 border-none shadow-sm hover:shadow-md transition-shadow">
                          <CardBody className="flex flex-col items-center justify-center p-3">
                            <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">
                              TCP连接数
                            </div>
                            <div className="text-xl font-bold text-amber-700 dark:text-amber-300">
                              {tcps}
                              <span className="text-xs ml-1">个</span>
                            </div>
                          </CardBody>
                        </Card>
                      )}

                      {/* UDP连接数 */}
                      {udps !== null && udps !== undefined && (
                        <Card className="rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/30 dark:to-teal-900/20 border-none shadow-sm hover:shadow-md transition-shadow">
                          <CardBody className="flex flex-col items-center justify-center p-3">
                            <div className="text-xs font-medium text-teal-600 dark:text-teal-400 mb-1">
                              UDP连接数
                            </div>
                            <div className="text-xl font-bold text-teal-700 dark:text-teal-300">
                              {udps}
                              <span className="text-xs ml-1">个</span>
                            </div>
                          </CardBody>
                        </Card>
                      )}
                    </div>
                  );
                })()}

                {/* 统计图表 - Tab 切换卡片 */}
                <Card className="p-4">
                  {/* Tab 标题行：左侧Tabs，右侧图例和放大按钮 */}
                  <div className="flex items-center justify-between mb-4">
                    <Tabs
                      selectedKey={selectedStatsTab}
                      variant="solid"
                      onSelectionChange={(key) => setSelectedStatsTab(key as string)}
                    >
                      <Tab key="traffic" title="流量累计" />
                      <Tab key="speed" title="传输速率" />
                      <Tab key="latency" title="端内延迟" />
                      <Tab key="connections" title="连接数量" />
                    </Tabs>

                    <div className="flex items-center gap-3">
                      {/* 根据选中的 tab 显示对应的图例 */}
                      <div className="flex items-center gap-2">
                        {selectedStatsTab === "traffic" && (
                          <>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(217 91% 60%)" }}
                              />
                              <span className="text-xs text-default-600">TCP入</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(142 76% 36%)" }}
                              />
                              <span className="text-xs text-default-600">TCP出</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(262 83% 58%)" }}
                              />
                              <span className="text-xs text-default-600">UDP入</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(25 95% 53%)" }}
                              />
                              <span className="text-xs text-default-600">UDP出</span>
                            </div>
                          </>
                        )}
                        {selectedStatsTab === "speed" && (
                          <>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(220 70% 50%)" }}
                              />
                              <span className="text-xs text-default-600">上传</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(280 65% 60%)" }}
                              />
                              <span className="text-xs text-default-600">下载</span>
                            </div>
                          </>
                        )}
                        {selectedStatsTab === "connections" && (
                          <>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(340 75% 55%)" }}
                              />
                              <span className="text-xs text-default-600">池</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(24 70% 50%)" }}
                              />
                              <span className="text-xs text-default-600">TCP</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "hsl(173 58% 39%)" }}
                              />
                              <span className="text-xs text-default-600">UDP</span>
                            </div>
                          </>
                        )}
                        {/* 端内延迟无需图例 */}
                      </div>

                      {/* 放大按钮 - 根据当前选中的 tab 切换不同的 action */}
                      <Button
                        isIconOnly
                        className="h-6 w-6 min-w-0"
                        size="sm"
                        variant="light"
                        onPress={() => {
                          const actionMap = {
                            traffic: () => openFullscreenChart("traffic", "流量累计"),
                            speed: () => openFullscreenChart("speed", "传输速率"),
                            latency: () => openFullscreenChart("latency", "端内延迟"),
                            connections: () =>
                              openFullscreenChart("connections", "连接数"),
                          };

                          actionMap[selectedStatsTab as keyof typeof actionMap]?.();
                        }}
                      >
                        <FontAwesomeIcon className="text-xs" icon={faExpand} />
                      </Button>
                    </div>
                  </div>

                  {/* Tab 内容区域 - 只显示图表 */}
                  <div className="h-[200px]">
                    {selectedStatsTab === "traffic" && (
                      <DetailedTrafficChart
                        className="h-full w-full"
                        data={transformDetailedTrafficData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={200}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                    {selectedStatsTab === "speed" && (
                      <SpeedChart
                        className="h-full w-full"
                        data={transformSpeedData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={200}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                    {selectedStatsTab === "latency" && (
                      <LatencyChart
                        className="h-full w-full"
                        data={transformLatencyData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={200}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                    {selectedStatsTab === "connections" && (
                      <ConnectionsChart
                        className="h-full w-full"
                        data={transformConnectionsData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={200}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* 重命名服务模态框 */}
      <RenameServiceModal
        isOpen={renameModalOpen}
        service={service ? { sid: service.sid, alias: service.alias } : null}
        onOpenChange={setRenameModalOpen}
        onRenamed={() => {
          setRenameModalOpen(false);
          fetchServiceDetails();
        }}
      />

      {/* 确认操作对话框 */}
      <Modal
        isOpen={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {confirmAction?.type === "dissolve" ? "确认解散服务" : "确认删除服务"}
              </ModalHeader>
              <ModalBody>
                <p>
                  {confirmAction?.type === "dissolve"
                    ? `确定要解散服务 "${service?.alias || service?.sid}" 吗？`
                    : `确定要删除服务 "${service?.alias || service?.sid}" 吗？此操作不可撤销！`
                  }
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color={confirmAction?.type === "dissolve" ? "warning" : "danger"}
                  onPress={() => {
                    handleConfirmedAction();
                    onClose();
                  }}
                >
                  {confirmAction?.type === "dissolve" ? "解散" : "删除"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 全屏图表模态框 */}
      <FullscreenChartModal
        isOpen={fullscreenChart.isOpen}
        metricsData={metricsData}
        metricsError={metricsError}
        metricsLoading={metricsLoading}
        title={fullscreenChart.title}
        transformConnectionsData={transformConnectionsData}
        transformDetailedTrafficData={transformDetailedTrafficData}
        transformLatencyData={transformLatencyData}
        transformSpeedData={transformSpeedData}
        type={fullscreenChart.type}
        onClose={() =>
          setFullscreenChart({ isOpen: false, type: "", title: "" })
        }
      />

      {/* TCPing 网络诊断模态框 */}
      {(() => {
        // 确保至少有 client 端数据
        if (!clientTunnel) return null;

        return (
          <TcpingTestModal
            clientInstanceId={service.clientInstanceId}
            clientListenPort={clientTunnel.listenPort}
            clientTargetAddress={clientTunnel.targetAddress || ""}
            clientTargetPort={clientTunnel.targetPort || 0}
            clientTunnelAddress={clientTunnel.tunnelAddress || ""}
            clientExtendTargetAddress={clientTunnel.extendTargetAddress || []}
            isOpen={tcpingModalOpen}
            serverInstanceId={service.serverInstanceId}
            serverTargetAddress={serverTunnel?.targetAddress || ""}
            serverTargetPort={serverTunnel?.targetPort || 0}
            serviceType={service.type}
            onClose={() => setTcpingModalOpen(false)}
          />
        );
      })()}
    </>
  );
}
