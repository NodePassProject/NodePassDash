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
  faSync,
  faExpand,
  faArrowRight,
  faShield,
  faExchangeAlt,
  faServer,
  faPen,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { Icon } from "@iconify/react";

import { buildApiUrl } from "@/lib/utils";
import { useSettings } from "@/components/providers/settings-provider";
import RenameServiceModal from "@/components/services/rename-service-modal";
import { TcpingTestModal } from "@/components/services/tcping-modal";
import { DetailedTrafficChart } from "@/components/ui/detailed-traffic-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { ConnectionsChart } from "@/components/ui/connections-chart";
import { LatencyChart } from "@/components/ui/latency-chart";
import { useMetricsTrend } from "@/lib/hooks/use-metrics-trend";
import { FullscreenChartModal } from "@/pages/tunnels/details/fullscreen-chart-modal";

// 定义隧道详情类型（简化版，只需要基本信息）
interface TunnelInfo {
  instanceId: string;
  name: string;
  type: "server" | "client";
  status: "success" | "danger" | "warning";
  endpoint: {
    name: string;
    version: string;
  };
  listenPort: number;
  targetPort: number;
  tunnelAddress: string;
  targetAddress: string;
  ping: number | null;
  pool: number | null;
  tcpRx: number;
  tcpTx: number;
  tcps: number | null;
  udpRx: number;
  udpTx: number;
  udps: number | null;
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

// 状态映射函数
const getStatusText = (status: string): string => {
  switch (status) {
    case "success":
      return "运行中";
    case "warning":
      return "有错误";
    case "danger":
      return "已停止";
    case "default":
      return "已离线";
    default:
      return "未知";
  }
};

export default function ServicesDetailsDemoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sid = searchParams.get("sid");
  const [service, setService] = useState<ServiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
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

  const formatDateTime = (value?: string) => {
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
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
      case "3":
        return "隧道转发(外部)";
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
      case "3":
        return "Tunnel Forwarding (External)";
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
  const fetchTunnelDetails = useCallback(
    async (instanceId: string, type: "client" | "server") => {
      try {
        setTunnelLoading(true);
        const response = await fetch(
          buildApiUrl(`/api/tunnels/${instanceId}/details`)
        );

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
    },
    []
  );

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
      })
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
  const handleServiceAction = async (action: "start" | "stop" | "restart") => {
    if (!service) return;

    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/${action}`),
        {
          method: "POST",
        }
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
        }
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
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {/* 顶部服务信息卡片 */}
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary-50 via-primary-100 to-secondary-100 dark:from-primary-950/60 dark:via-primary-900/30 dark:to-secondary-900/40">
          <CardBody className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <Chip
                  className="w-fit"
                  color={getTypeColor(service.type) as any}
                  size="sm"
                  variant="shadow"
                >
                  {getTypeLabel(service.type)}
                </Chip>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                    {service.alias || service.sid}
                  </h1>
                  {service.alias && (
                    <Chip size="sm" variant="flat" className="font-mono">
                      {service.sid}
                    </Chip>
                  )}
                </div>
                <p className="text-sm text-default-600 dark:text-default-400">
                  {getTypeEnglishLabel(service.type)} · 智能路由编排服务
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-default-600">
                  <Chip
                    size="sm"
                    variant="flat"
                    className="bg-white/60 text-default-700 dark:bg-white/10 dark:text-default-300"
                  >
                    创建于 {formatDateTime(service.createdAt)}
                  </Chip>
                  <Chip
                    size="sm"
                    variant="flat"
                    className="bg-white/60 text-default-700 dark:bg-white/10 dark:text-default-300"
                  >
                    最近更新 {formatDateTime(service.updatedAt)}
                  </Chip>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  className="min-w-[110px]"
                  color="secondary"
                  startContent={<FontAwesomeIcon icon={faPen} />}
                  variant="flat"
                  onPress={() => setRenameModalOpen(true)}
                >
                  重命名
                </Button>
                <Button
                  className="min-w-[110px]"
                  startContent={<FontAwesomeIcon icon={faArrowLeft} />}
                  variant="bordered"
                  onPress={() => navigate(-1)}
                >
                  返回
                </Button>
                <Button
                  className="min-w-[110px]"
                  color="primary"
                  isDisabled={refreshLoading}
                  startContent={<FontAwesomeIcon icon={faRefresh} />}
                  variant="solid"
                  onPress={handleRefresh}
                >
                  刷新数据
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/40">
                <p className="text-xs uppercase tracking-wide text-default-500">
                  服务 ID
                </p>
                <Tooltip content={service.sid} placement="top">
                  <p className="mt-1 font-mono text-base text-foreground truncate">
                    {service.sid}
                  </p>
                </Tooltip>
                <span className="text-xs text-default-500">节点唯一标识</span>
              </div>
              <div className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/40">
                <p className="text-xs uppercase tracking-wide text-default-500">
                  转发模式
                </p>
                <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <FontAwesomeIcon icon={getTypeIcon(service.type)} />
                  {getTypeEnglishLabel(service.type)}
                </div>
                <span className="text-xs text-default-500">
                  {getTypeLabel(service.type)} · 模式代码 {service.type}
                </span>
              </div>
              <div className="rounded-2xl border border-white/40 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-black/40">
                <p className="text-xs uppercase tracking-wide text-default-500">
                  关联实例
                </p>
                <div className="mt-2 flex flex-col gap-2 text-sm text-default-600">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-default-500">Client</span>
                    <Tooltip content={service.clientInstanceId || "暂无实例"}>
                      <span className="font-mono text-base text-foreground truncate">
                        {service.clientInstanceId
                          ? service.clientInstanceId.substring(0, 8) + "..."
                          : "-"}
                      </span>
                    </Tooltip>
                  </div>
                  <span className="text-xs text-default-500">
                    {clientTunnel
                      ? `${clientTunnel.listenPort} → ${clientTunnel.targetPort}`
                      : "等待激活"}
                  </span>
                  {service.type !== "0" && (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-default-500">Server</span>
                        <Tooltip
                          content={service.serverInstanceId || "暂无实例"}
                        >
                          <span className="font-mono text-base text-foreground truncate">
                            {service.serverInstanceId
                              ? service.serverInstanceId.substring(0, 8) +
                                "..."
                              : "-"}
                          </span>
                        </Tooltip>
                      </div>
                      <span className="text-xs text-default-500">
                        {serverTunnel
                          ? `${serverTunnel.listenPort} → ${serverTunnel.targetPort}`
                          : "等待激活"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 简化的实例关联信息卡片 */}
        {(clientTunnel || serverTunnel) && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Client 实例卡片 */}
            {clientTunnel && (
              <Card className="border border-default-100/60 hover:shadow-lg transition-shadow">
                <CardHeader className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      className="text-secondary"
                      icon="lucide:arrow-up-right"
                      width={20}
                    />
                    <h3 className="text-lg font-semibold">Client 实例</h3>
                    <Chip
                      color={
                        clientTunnel.status === "success"
                          ? "success"
                          : clientTunnel.status === "warning"
                            ? "warning"
                            : "danger"
                      }
                      size="sm"
                      variant="dot"
                    >
                      {getStatusText(clientTunnel.status)}
                    </Chip>
                  </div>
                  <Button
                    isIconOnly
                    color="default"
                    size="sm"
                    variant="light"
                    onPress={() =>
                      navigate(`/tunnels/details?id=${clientTunnel.instanceId}`)
                    }
                  >
                    <Icon icon="lucide:external-link" width={16} />
                  </Button>
                </CardHeader>
                <CardBody className="pt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">实例 ID</span>
                    <Tooltip content={clientTunnel.instanceId}>
                      <span className="font-mono text-sm">
                        {clientTunnel.instanceId.substring(0, 12)}...
                      </span>
                    </Tooltip>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">主控</span>
                    <Chip size="sm" variant="flat">
                      {clientTunnel.endpoint.name}
                    </Chip>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">版本</span>
                    <span className="text-sm font-mono">
                      {clientTunnel.endpoint.version || "< v1.4.0"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">端口映射</span>
                    <span className="text-sm font-mono font-semibold">
                      {clientTunnel.listenPort} → {clientTunnel.targetPort}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">隧道地址</span>
                    <span className="text-sm font-mono">
                      {clientTunnel.tunnelAddress}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">目标地址</span>
                    <span className="text-sm font-mono">
                      {clientTunnel.targetAddress}
                    </span>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Server 实例卡片 (仅在 type !== "0" 时显示) */}
            {service.type !== "0" && serverTunnel && (
              <Card className="border border-default-100/60 hover:shadow-lg transition-shadow">
                <CardHeader className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      className="text-primary"
                      icon="lucide:arrow-down-left"
                      width={20}
                    />
                    <h3 className="text-lg font-semibold">Server 实例</h3>
                    <Chip
                      color={
                        serverTunnel.status === "success"
                          ? "success"
                          : serverTunnel.status === "warning"
                            ? "warning"
                            : "danger"
                      }
                      size="sm"
                      variant="dot"
                    >
                      {getStatusText(serverTunnel.status)}
                    </Chip>
                  </div>
                  <Button
                    isIconOnly
                    color="default"
                    size="sm"
                    variant="light"
                    onPress={() =>
                      navigate(`/tunnels/details?id=${serverTunnel.instanceId}`)
                    }
                  >
                    <Icon icon="lucide:external-link" width={16} />
                  </Button>
                </CardHeader>
                <CardBody className="pt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">实例 ID</span>
                    <Tooltip content={serverTunnel.instanceId}>
                      <span className="font-mono text-sm">
                        {serverTunnel.instanceId.substring(0, 12)}...
                      </span>
                    </Tooltip>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">主控</span>
                    <Chip size="sm" variant="flat">
                      {serverTunnel.endpoint.name}
                    </Chip>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">版本</span>
                    <span className="text-sm font-mono">
                      {serverTunnel.endpoint.version || "< v1.4.0"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">端口映射</span>
                    <span className="text-sm font-mono font-semibold">
                      {serverTunnel.listenPort} → {serverTunnel.targetPort}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">隧道地址</span>
                    <span className="text-sm font-mono">
                      {serverTunnel.tunnelAddress}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-default-500">目标地址</span>
                    <span className="text-sm font-mono">
                      {serverTunnel.targetAddress}
                    </span>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        )}

        {/* 快捷操作区域 */}
        <Card className="border border-default-100/60 shadow-lg shadow-primary-500/5">
          <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-0">
            <div>
              <p className="text-tiny uppercase text-default-400">控制台</p>
              <h2 className="text-xl font-semibold text-foreground">
                即时操作
              </h2>
              <p className="text-sm text-default-500">
                通过 Hero UI 交互快速维护服务、同步实例以及排查网络
              </p>
            </div>
          </CardHeader>
          <CardBody className="pt-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/50 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                color="default"
                variant="flat"
                onPress={() => navigate(`/services/sse?sid=${service.sid}`)}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="text-base" icon="lucide:mouse-pointer" />
                  SSE 调试
                </div>
                <p className="text-xs text-default-500">实时事件追踪与诊断</p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/50 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                color="default"
                variant="flat"
                onPress={() => setTcpingModalOpen(true)}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FontAwesomeIcon icon={faBug} />
                  网络测试
                </div>
                <p className="text-xs text-default-500">
                  Tcping 端到端链路验证
                </p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-success/40 hover:shadow-lg"
                color="success"
                variant="flat"
                onPress={() => handleServiceAction("start")}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FontAwesomeIcon icon={faPlay} />
                  一键启动
                </div>
                <p className="text-xs text-default-500">启用全部隧道实例</p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-warning/40 hover:shadow-lg"
                color="warning"
                variant="flat"
                onPress={() => handleServiceAction("stop")}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FontAwesomeIcon icon={faStop} />
                  一键停止
                </div>
                <p className="text-xs text-default-500">立即停止当前服务</p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-secondary/40 hover:shadow-lg"
                color="secondary"
                variant="flat"
                onPress={() => handleServiceAction("restart")}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FontAwesomeIcon icon={faRotateRight} />
                  一键重启
                </div>
                <p className="text-xs text-default-500">安全重载配置并恢复</p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-left text-danger transition hover:-translate-y-0.5 hover:border-danger hover:bg-danger/10 hover:shadow-lg"
                color="danger"
                variant="flat"
                onPress={() => {
                  setConfirmAction({ type: "delete" });
                  setConfirmModalOpen(true);
                }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FontAwesomeIcon icon={faTrash} />
                  删除服务
                </div>
                <p className="text-xs text-danger/80">危险操作，谨慎执行</p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/50 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                color="default"
                variant="flat"
                onPress={() => handleSyncService()}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <FontAwesomeIcon icon={faSync} />
                  同步实例
                </div>
                <p className="text-xs text-default-500">刷新节点配置与状态</p>
              </Button>

              <Button
                className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-left text-warning-600 transition hover:-translate-y-0.5 hover:border-warning hover:shadow-lg"
                color="warning"
                variant="flat"
                onPress={() => {
                  setConfirmAction({ type: "dissolve" });
                  setConfirmModalOpen(true);
                }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="text-base" icon="lucide:link-2-off" />
                  解散服务
                </div>
                <p className="text-xs text-warning-600/80">解绑两端实例关系</p>
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* 流量统计卡片和图表 */}
        {tunnelLoading ? (
          <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-default-100/60 bg-content1/70">
            <Spinner color="primary" size="lg" />
          </div>
        ) : (
          ((service.type !== "0" && serverTunnel) ||
            (service.type === "0" && clientTunnel)) && (
            <Card className="border border-default-100/60">
              <CardHeader className="flex flex-wrap items-center justify-between gap-4 pb-0">
                <div>
                  <p className="text-tiny uppercase text-default-400">
                    实时指标
                  </p>
                  <h2 className="text-xl font-semibold text-foreground">
                    隧道运行态
                  </h2>
                  <p className="text-sm text-default-500">
                    {service.type !== "0" ? "服务端" : "客户端"} 实例 ·{" "}
                    {currentTunnelInstanceId || "未激活"}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-default-500">
                  {metricsLoading && <Spinner size="sm" color="primary" />}
                  <span>
                    {metricsLoading ? "数据刷新中..." : "15s 自动刷新"}
                  </span>
                </div>
              </CardHeader>
              <CardBody className="space-y-6">
                {!settings.isExperimentalMode &&
                  (() => {
                    const tunnel =
                      service.type !== "0" ? serverTunnel : clientTunnel;
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
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                        <Card className="rounded-2xl border-none bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/20 shadow-sm hover:shadow-md transition">
                          <CardBody className="flex flex-col items-center justify-center p-3">
                            <div className="mb-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                              TCP 流量
                            </div>
                            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                              <div className="flex flex-col items-center">
                                <div className="text-[10px] opacity-60">
                                  ↑发送
                                </div>
                                <div className="text-base font-bold">
                                  {tcpTxFormatted.value}
                                  <span className="ml-0.5 text-[10px]">
                                    {tcpTxFormatted.unit}
                                  </span>
                                </div>
                              </div>
                              <div className="h-8 w-px bg-blue-300 dark:bg-blue-700" />
                              <div className="flex flex-col items-center">
                                <div className="text-[10px] opacity-60">
                                  ↓接收
                                </div>
                                <div className="text-base font-bold">
                                  {tcpRxFormatted.value}
                                  <span className="ml-0.5 text-[10px]">
                                    {tcpRxFormatted.unit}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardBody>
                        </Card>

                        <Card className="rounded-2xl border-none bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/20 shadow-sm hover:shadow-md transition">
                          <CardBody className="flex flex-col items-center justify-center p-3">
                            <div className="mb-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                              UDP 流量
                            </div>
                            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                              <div className="flex flex-col items-center">
                                <div className="text-[10px] opacity-60">
                                  ↑发送
                                </div>
                                <div className="text-base font-bold">
                                  {udpTxFormatted.value}
                                  <span className="ml-0.5 text-[10px]">
                                    {udpTxFormatted.unit}
                                  </span>
                                </div>
                              </div>
                              <div className="h-8 w-px bg-purple-300 dark:bg-purple-700" />
                              <div className="flex flex-col items-center">
                                <div className="text-[10px] opacity-60">
                                  ↓接收
                                </div>
                                <div className="text-base font-bold">
                                  {udpRxFormatted.value}
                                  <span className="ml-0.5 text-[10px]">
                                    {udpRxFormatted.unit}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardBody>
                        </Card>

                        {ping !== null && ping !== undefined && (
                          <Card className="rounded-2xl border-none bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950/30 dark:to-pink-900/20 shadow-sm hover:shadow-md transition">
                            <CardBody className="flex flex-col items-center justify-center p-3">
                              <div className="text-xs font-medium text-pink-600 dark:text-pink-400">
                                端内延迟
                              </div>
                              <div className="text-xl font-bold text-pink-700 dark:text-pink-300">
                                {ping}
                                <span className="ml-1 text-xs">ms</span>
                              </div>
                            </CardBody>
                          </Card>
                        )}

                        {pool !== null && pool !== undefined && (
                          <Card className="rounded-2xl border-none bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/30 dark:to-cyan-900/20 shadow-sm hover:shadow-md transition">
                            <CardBody className="flex flex-col items-center justify-center p-3">
                              <div className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
                                池连接数
                              </div>
                              <div className="text-xl font-bold text-cyan-700 dark:text-cyan-300">
                                {pool}
                                <span className="ml-1 text-xs">个</span>
                              </div>
                            </CardBody>
                          </Card>
                        )}

                        {tcps !== null && tcps !== undefined && (
                          <Card className="rounded-2xl border-none bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/30 dark:to-amber-900/20 shadow-sm hover:shadow-md transition">
                            <CardBody className="flex flex-col items-center justify-center p-3">
                              <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                TCP 连接数
                              </div>
                              <div className="text-xl font-bold text-amber-700 dark:text-amber-300">
                                {tcps}
                                <span className="ml-1 text-xs">个</span>
                              </div>
                            </CardBody>
                          </Card>
                        )}

                        {udps !== null && udps !== undefined && (
                          <Card className="rounded-2xl border-none bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/30 dark:to-teal-900/20 shadow-sm hover:shadow-md transition">
                            <CardBody className="flex flex-col items-center justify-center p-3">
                              <div className="text-xs font-medium text-teal-600 dark:text-teal-400">
                                UDP 连接数
                              </div>
                              <div className="text-xl font-bold text-teal-700 dark:text-teal-300">
                                {udps}
                                <span className="ml-1 text-xs">个</span>
                              </div>
                            </CardBody>
                          </Card>
                        )}
                      </div>
                    );
                  })()}

                <div className="rounded-2xl border border-default-100/60 bg-content1/70 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Tabs
                      selectedKey={selectedStatsTab}
                      variant="underlined"
                      onSelectionChange={(key) =>
                        setSelectedStatsTab(key as string)
                      }
                    >
                      <Tab key="traffic" title="流量累计" />
                      <Tab key="speed" title="传输速率" />
                      <Tab key="latency" title="网络延迟" />
                      <Tab key="connections" title="连接监控" />
                    </Tabs>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {selectedStatsTab === "traffic" && (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(217_91%_60%)]" />
                              <span className="text-xs text-default-600">
                                TCP 入
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(142_76%_36%)]" />
                              <span className="text-xs text-default-600">
                                TCP 出
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(262_83%_58%)]" />
                              <span className="text-xs text-default-600">
                                UDP 入
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(25_95%_53%)]" />
                              <span className="text-xs text-default-600">
                                UDP 出
                              </span>
                            </div>
                          </>
                        )}
                        {selectedStatsTab === "speed" && (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(220_70%_50%)]" />
                              <span className="text-xs text-default-600">
                                上传
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(280_65%_60%)]" />
                              <span className="text-xs text-default-600">
                                下载
                              </span>
                            </div>
                          </>
                        )}
                        {selectedStatsTab === "connections" && (
                          <>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(340_75%_55%)]" />
                              <span className="text-xs text-default-600">池</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(24_70%_50%)]" />
                              <span className="text-xs text-default-600">
                                TCP
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full bg-[hsl(173_58%_39%)]" />
                              <span className="text-xs text-default-600">
                                UDP
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      <Button
                        isIconOnly
                        className="h-7 w-7 min-w-0 rounded-full border border-default-100/80"
                        size="sm"
                        variant="light"
                        onPress={() => {
                          const actionMap = {
                            traffic: () =>
                              openFullscreenChart("traffic", "流量累计"),
                            speed: () =>
                              openFullscreenChart("speed", "传输速率"),
                            latency: () =>
                              openFullscreenChart("latency", "网络延迟"),
                            connections: () =>
                              openFullscreenChart("connections", "连接监控"),
                          };

                          actionMap[
                            selectedStatsTab as keyof typeof actionMap
                          ]?.();
                        }}
                      >
                        <FontAwesomeIcon className="text-xs" icon={faExpand} />
                      </Button>
                    </div>
                  </div>

                  <div className="h-[220px]">
                    {selectedStatsTab === "traffic" && (
                      <DetailedTrafficChart
                        className="h-full w-full"
                        data={transformDetailedTrafficData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={220}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                    {selectedStatsTab === "speed" && (
                      <SpeedChart
                        className="h-full w-full"
                        data={transformSpeedData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={220}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                    {selectedStatsTab === "latency" && (
                      <LatencyChart
                        className="h-full w-full"
                        data={transformLatencyData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={220}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                    {selectedStatsTab === "connections" && (
                      <ConnectionsChart
                        className="h-full w-full"
                        data={transformConnectionsData(metricsData?.data)}
                        error={metricsError || undefined}
                        height={220}
                        loading={metricsLoading && !metricsData}
                      />
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          )
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
      <Modal isOpen={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {confirmAction?.type === "dissolve"
                  ? "确认解散服务"
                  : "确认删除服务"}
              </ModalHeader>
              <ModalBody>
                <p>
                  {confirmAction?.type === "dissolve"
                    ? `确定要解散服务 "${service?.alias || service?.sid}" 吗？`
                    : `确定要删除服务 "${service?.alias || service?.sid}" 吗？此操作不可撤销！`}
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color={
                    confirmAction?.type === "dissolve" ? "warning" : "danger"
                  }
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
            extendTargetAddress={[]}
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
