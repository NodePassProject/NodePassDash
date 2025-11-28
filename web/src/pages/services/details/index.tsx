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
import React, { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";

// 导入 Swiper 样式
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "./swiper-custom.css";
import {
  faPen,
  faArrowLeft,
  faRefresh,
  faPlay,
  faRotateRight,
  faTrash,
  faStop,
  faBug,
  faGlobe,
  faPaperPlane,
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
    host?: string; // 主控的 host 地址
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

  // 格式化地址显示（处理脱敏逻辑）
  const formatAddress = (address: string | undefined) => {
    if (!address) return "[::]";

    // 如果隐私模式关闭，显示完整地址
    if (!settings.isPrivacyMode) {
      return address;
    }

    // 隐私模式开启时进行脱敏
    // 尝试解析地址（可能是 host:port 格式）
    const parts = address.split(":");
    if (parts.length >= 2) {
      const host = parts.slice(0, -1).join(":"); // 处理 IPv6 的情况
      const port = parts[parts.length - 1];

      // 检测IPv4地址
      const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const ipv4Match = host.match(ipv4Regex);

      if (ipv4Match) {
        // IPv4地址：只保留前两段
        return `${ipv4Match[1]}.${ipv4Match[2]}.***.***:${port}`;
      }

      // 检测IPv6地址
      const ipv6Regex = /^\[?([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})/;
      const ipv6Match = host.match(ipv6Regex);

      if (ipv6Match) {
        // IPv6地址：只保留前两段
        return `${ipv6Match[1]}:${ipv6Match[2]}:***:***:***:***:***:***:${port}`;
      }

      // 域名：完全脱敏
      return `********:${port}`;
    }

    // 如果没有端口，直接对整个地址进行脱敏
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = address.match(ipv4Regex);

    if (ipv4Match) {
      return `${ipv4Match[1]}.${ipv4Match[2]}.***.***`;
    }

    const ipv6Regex = /^([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})/;
    const ipv6Match = address.match(ipv6Regex);

    if (ipv6Match) {
      return `${ipv6Match[1]}:${ipv6Match[2]}:***:***:***:***:***:***`;
    }

    // 域名或其他格式：完全脱敏
    return "********";
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

  // Swiper 相关状态（右侧内容区 - 已弃用）
  const swiperRef = useRef<SwiperType | null>(null);
  const [isBeginning, setIsBeginning] = useState(true);
  const [isEnd, setIsEnd] = useState(false);

  // 整页 Swiper 相关状态
  const pageSwiperRef = useRef<SwiperType | null>(null);
  const [pageIsBeginning, setPageIsBeginning] = useState(true);
  const [pageIsEnd, setPageIsEnd] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0); // 保存当前页面索引

  // 根据 type 获取模式文案
  // 0: 通用单端转发, 1: 本地内网穿透, 2: 本地隧道转发
  // 3: 外部内网穿透, 4: 外部隧道转发, 5: 均衡单端转发
  // 6: 均衡内网穿透, 7: 均衡隧道转发
  const getTypeLabel = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "通用单端转发";
      case "1":
        return "本地内网穿透";
      case "2":
        return "本地隧道转发";
      case "3":
        return "外部内网穿透";
      case "4":
        return "外部隧道转发";
      case "5":
        return "均衡单端转发";
      case "6":
        return "均衡内网穿透";
      case "7":
        return "均衡隧道转发";
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
        return "Local NAT Traversal";
      case "2":
        return "Local Tunnel Forwarding";
      case "3":
        return "External NAT Traversal";
      case "4":
        return "External Tunnel Forwarding";
      case "5":
        return "Load-balanced Single-end";
      case "6":
        return "Load-balanced NAT Traversal";
      case "7":
        return "Load-balanced Tunnel";
      default:
        return typeValue;
    }
  };

  // 根据类型获取图标
  const getTypeIcon = (typeValue: string) => {
    switch (typeValue) {
      case "0":
      case "5":
        return faArrowRight;  // 单端转发
      case "1":
      case "3":
      case "6":
        return faShield;      // 内网穿透
      case "2":
      case "4":
      case "7":
        return faExchangeAlt; // 隧道转发
      default:
        return faServer;
    }
  };

  // 根据类型获取颜色
  // 单端转发=primary(蓝), 内网穿透=success(绿), 隧道转发=secondary(紫), 均衡=warning(橙)
  const getTypeColor = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "primary";     // 通用单端转发 - 蓝色
      case "1":
        return "success";     // 本地内网穿透 - 绿色
      case "2":
        return "secondary";   // 本地隧道转发 - 紫色
      case "3":
        return "success";     // 外部内网穿透 - 绿色
      case "4":
        return "secondary";   // 外部隧道转发 - 紫色
      case "5":
        return "warning";     // 均衡单端转发 - 橙色
      case "6":
        return "warning";     // 均衡内网穿透 - 橙色
      case "7":
        return "warning";     // 均衡隧道转发 - 橙色
      default:
        return "default";
    }
  };

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
  const formatDateTime = (value?: string) => {
    if (!value) return "-";

    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
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
      // 恢复到之前的 Swiper 页面
      setTimeout(() => {
        if (pageSwiperRef.current && currentSlideIndex > 0) {
          pageSwiperRef.current.slideTo(currentSlideIndex, 0);
        }
      }, 50);
    }
  }, [refreshLoading, fetchServiceDetails, fetchTunnelDetails, service, currentSlideIndex]);

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

  // 判断是否为单端转发类型（type=0 通用单端转发, type=5 均衡单端转发）
  const isSingleEndForwarding = service?.type === "0" || service?.type === "5";

  // 获取当前显示的隧道实例ID
  // 单端转发使用 client 数据，内网穿透和隧道转发使用 server 数据
  const currentTunnelInstanceId = service
    ? isSingleEndForwarding
      ? clientTunnel?.instanceId
      : serverTunnel?.instanceId
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
      {/* 整页 Swiper 容器 */}
      <div className="relative group">
        {/* 左侧导航按钮 - 桌面端 hover 显示 */}
        {!pageIsBeginning && (
          <Button
            isIconOnly
            className="fixed left-4 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 transition-opacity hidden lg:flex shadow-lg"
            color="primary"
            radius="full"
            size="lg"
            variant="solid"
            onPress={() => pageSwiperRef.current?.slidePrev()}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
        )}

        {/* 右侧导航按钮 - 桌面端 hover 显示 */}
        {!pageIsEnd && (
          <Button
            isIconOnly
            className="fixed right-4 top-1/2 -translate-y-1/2 z-50 opacity-0 group-hover:opacity-100 transition-opacity hidden lg:flex shadow-lg"
            color="primary"
            radius="full"
            size="lg"
            variant="solid"
            onPress={() => pageSwiperRef.current?.slideNext()}
          >
            <FontAwesomeIcon icon={faArrowRight} />
          </Button>
        )}

        <Swiper
          modules={[Navigation, Pagination]}
          initialSlide={currentSlideIndex}
          onSlideChange={(swiper) => {
            setPageIsBeginning(swiper.isBeginning);
            setPageIsEnd(swiper.isEnd);
            setCurrentSlideIndex(swiper.activeIndex); // 保存当前索引
          }}
          onSwiper={(swiper) => {
            pageSwiperRef.current = swiper;
            setPageIsBeginning(swiper.isBeginning);
            setPageIsEnd(swiper.isEnd);
          }}
          pagination={{
            clickable: true,
            dynamicBullets: true,
          }}
          slidesPerView={1}
          spaceBetween={0}
        >
          {/* 第一页：原始内容 */}
          <SwiperSlide>
            <div className="space-y-4 md:space-y-6 px-8 md:p-0">
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

              {/* 主内容区 - 左右分栏布局 */}
              <div className="grid grid-cols-12 gap-4 md:gap-6 items-start">
                {/* 左侧栏 - 3列 - 使用 sticky 让左侧卡片在滚动时固定 */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 md:gap-6 lg:sticky lg:top-4">
                  {/* 服务信息 */}
                  <Card className="p-2  h-[332px]">
                    <CardHeader className="flex items-center justify-between pb-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">服务信息</h3>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <div className="space-y-5">
                        {/* 服务 SID */}
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <p className="text-xs text-default-500">服务 SID</p>
                            <Button
                              isIconOnly
                              className="h-4 w-4 min-w-0"
                              size="sm"
                              variant="light"
                              onPress={() => {
                                navigator.clipboard.writeText(service.sid);
                                addToast({
                                  title: "已复制",
                                  description: "服务 SID 已复制到剪贴板",
                                  color: "success",
                                });
                              }}
                            >
                              <Icon
                                className="text-default-400 hover:text-default-600"
                                height={12}
                                icon="lucide:copy"
                                width={12}
                              />
                            </Button>
                          </div>
                          <p className="font-mono text-sm break-all">
                            {service.sid}
                          </p>
                        </div>

                        {/* 服务别名 */}
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <p className="text-xs text-default-500">服务别名</p>
                            <Button
                              isIconOnly
                              className="h-4 w-4 min-w-0"
                              size="sm"
                              variant="light"
                              onPress={() => setRenameModalOpen(true)}
                            >
                              <Icon
                                className="text-default-400 hover:text-primary"
                                height={12}
                                icon="lucide:pencil"
                                width={12}
                              />
                            </Button>
                          </div>
                          <p className="font-medium">
                            {service.alias || "-"}
                          </p>
                        </div>

                        {/* Client 实例 */}
                        {service.clientInstanceId && (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <p className="text-xs text-default-500">Client 实例</p>
                              <Button
                                isIconOnly
                                className="h-4 w-4 min-w-0"
                                size="sm"
                                variant="light"
                                onPress={() => navigate(`/tunnels/details?id=${service.clientInstanceId}`)}
                              >
                                <Icon
                                  className="text-default-400 hover:text-primary"
                                  height={12}
                                  icon="lucide:external-link"
                                  width={12}
                                />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-sm">{service.clientInstanceId}</p>
                              {clientTunnel && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-default-100">
                                  <span
                                    className={`w-2 h-2 rounded-full ${clientTunnel.status === "success"
                                      ? "bg-success animate-pulse"
                                      : clientTunnel.status === "warning"
                                        ? "bg-warning"
                                        : "bg-danger"
                                      }`}
                                  />
                                  <span className="text-xs font-medium text-default-700">
                                    {clientTunnel.status === "success"
                                      ? "运行中"
                                      : clientTunnel.status === "warning"
                                        ? "警告"
                                        : "已停止"}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Server 实例 */}
                        {service.serverInstanceId && (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <p className="text-xs text-default-500">Server 实例</p>
                              <Button
                                isIconOnly
                                className="h-4 w-4 min-w-0"
                                size="sm"
                                variant="light"
                                onPress={() => navigate(`/tunnels/details?id=${service.serverInstanceId}`)}
                              >
                                <Icon
                                  className="text-default-400 hover:text-primary"
                                  height={12}
                                  icon="lucide:external-link"
                                  width={12}
                                />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-sm">{service.serverInstanceId}</p>
                              {serverTunnel && (
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-default-100">
                                  <span
                                    className={`w-2 h-2 rounded-full ${serverTunnel.status === "success"
                                      ? "bg-success animate-pulse"
                                      : serverTunnel.status === "warning"
                                        ? "bg-warning"
                                        : "bg-danger"
                                      }`}
                                  />
                                  <span className="text-xs font-medium text-default-700">
                                    {serverTunnel.status === "success"
                                      ? "运行中"
                                      : serverTunnel.status === "warning"
                                        ? "警告"
                                        : "已停止"}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </Card>

                  {/* 操作按钮 */}
                  <Card className="p-2">
                    <CardHeader className="flex items-center justify-between pb-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">操作</h3>
                      </div>
                    </CardHeader>
                    <CardBody>
                      <div className="grid grid-cols-2 gap-3">
                        {/* 启动 */}
                        <Button
                          className="flex items-center justify-center gap-2"
                          color="success"
                          variant="flat"
                          onPress={() => handleServiceAction("start")}
                        >
                          <FontAwesomeIcon icon={faPlay} />
                          <span>启动</span>
                        </Button>

                        {/* 停止 */}
                        <Button
                          className="flex items-center justify-center gap-2"
                          color="warning"
                          variant="flat"
                          onPress={() => handleServiceAction("stop")}
                        >
                          <FontAwesomeIcon icon={faStop} />
                          <span>停止</span>
                        </Button>

                        {/* 重启 */}
                        <Button
                          className="flex items-center justify-center gap-2"
                          color="secondary"
                          variant="flat"
                          onPress={() => handleServiceAction("restart")}
                        >
                          <FontAwesomeIcon icon={faRotateRight} />
                          <span>重启</span>
                        </Button>

                        {/* 调试 */}
                        <Button
                          className="flex items-center justify-center gap-2"
                          color="default"
                          variant="flat"
                          onPress={() => setTcpingModalOpen(true)}
                        >
                          <FontAwesomeIcon icon={faGlobe} />
                          <span>测试</span>
                        </Button>

                        {/* 同步 */}
                        <Button
                          className="flex items-center justify-center gap-2"
                          color="default"
                          variant="flat"
                          onPress={() => handleSyncService()}
                        >
                          <FontAwesomeIcon icon={faSync} />
                          <span>同步</span>
                        </Button>

                        {/* 删除 */}
                        <Button
                          className="flex items-center justify-center gap-2"
                          color="danger"
                          variant="flat"
                          onPress={() => {
                            setConfirmAction({ type: "delete" });
                            setConfirmModalOpen(true);
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          <span>删除</span>
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                </div>

                {/* 右侧主内容区 - 9列 */}
                <div className="col-span-12 lg:col-span-9">
                  {/* 隧道详情区域 */}
                  {tunnelLoading ? (
                    <div className="flex items-center justify-center min-h-[200px]">
                      <Spinner color="primary" size="lg" />
                    </div>
                  ) : (
                    <>
                      {/* 根据 type 决定显示哪个实例：单端转发(0,5)显示客户端，其他显示服务端 */}
                      {((isSingleEndForwarding && clientTunnel) || (!isSingleEndForwarding && serverTunnel)) && (
                        <div className="flex flex-col gap-4 md:gap-6">
                          {/* 数据统计卡片 - 参考 code.html 布局 */}
                          { (() => {
                            const tunnel = isSingleEndForwarding ? clientTunnel : serverTunnel;
                            const tcpRx = tunnel?.tcpRx || 0;
                            const tcpTx = tunnel?.tcpTx || 0;
                            const udpRx = tunnel?.udpRx || 0;
                            const udpTx = tunnel?.udpTx || 0;
                            const ping = tunnel?.ping;
                            const tcps = tunnel?.tcps;
                            const udps = tunnel?.udps;

                            const tcpRxFormatted = formatTrafficValue(tcpRx);
                            const tcpTxFormatted = formatTrafficValue(tcpTx);
                            const udpRxFormatted = formatTrafficValue(udpRx);
                            const udpTxFormatted = formatTrafficValue(udpTx);

                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* TCP 流量 (发送 / 接收) */}
                                <Card className="rounded-lg bg-gradient-to-tr from-blue-500/20 dark:from-blue-500/30 to-transparent border-none shadow-sm h-[148px]">
                                  <CardBody className="p-4">
                                    <p className="text-sm font-medium text-blue-500 dark:text-blue-400 mb-2">
                                      TCP 流量 (发送 / 接收)
                                    </p>
                                    <div className="flex items-baseline gap-4">
                                      <p className="text-2xl font-semibold">
                                        {tcpTxFormatted.value}{" "}
                                        <span className="text-sm font-normal">{tcpTxFormatted.unit}</span>
                                      </p>
                                      <p className="text-2xl font-semibold">
                                        {tcpRxFormatted.value}{" "}
                                        <span className="text-sm font-normal">{tcpRxFormatted.unit}</span>
                                      </p>
                                    </div>
                                  </CardBody>
                                </Card>

                                {/* UDP 流量 (发送 / 接收) */}
                                <Card className="rounded-lg bg-gradient-to-tr from-purple-500/20 dark:from-purple-500/30 to-transparent border-none shadow-sm h-[148px]">
                                  <CardBody className="p-4">
                                    <p className="text-sm font-medium text-purple-500 dark:text-purple-400 mb-2">
                                      UDP 流量 (发送 / 接收)
                                    </p>
                                    <div className="flex items-baseline gap-4">
                                      <p className="text-2xl font-semibold">
                                        {udpTxFormatted.value}{" "}
                                        <span className="text-sm font-normal">{udpTxFormatted.unit}</span>
                                      </p>
                                      <p className="text-2xl font-semibold">
                                        {udpRxFormatted.value}{" "}
                                        <span className="text-sm font-normal">{udpRxFormatted.unit}</span>
                                      </p>
                                    </div>
                                  </CardBody>
                                </Card>

                                {/* 端内延迟 */}
                                <Card className="rounded-lg bg-gradient-to-tr from-red-500/20 dark:from-red-500/30 to-transparent border-none shadow-sm h-[148px]">
                                  <CardBody className="p-4">
                                    <p className="text-sm font-medium text-red-500 dark:text-red-400 mb-2">端内延迟</p>
                                    <p className="text-3xl font-bold text-red-500 dark:text-red-400">
                                      {ping !== null && ping !== undefined ? ping : 0}{" "}
                                      <span className="text-base font-medium">ms</span>
                                    </p>
                                  </CardBody>
                                </Card>

                                {/* 连接数 (TCP/UDP) */}
                                <Card className="rounded-lg bg-gradient-to-tr from-green-500/20 dark:from-green-500/30 to-transparent border-none shadow-sm h-[148px]">
                                  <CardBody className="p-4">
                                    <p className="text-sm font-medium text-green-500 dark:text-green-400 mb-2">
                                      连接数 (TCP/UDP)
                                    </p>
                                    <div className="flex items-baseline gap-4">
                                      <p className="text-3xl font-bold text-green-500 dark:text-green-400">
                                        {tcps !== null && tcps !== undefined ? tcps : 0}
                                      </p>
                                      <p className="text-3xl font-bold text-green-400">
                                        {udps !== null && udps !== undefined ? udps : 0}
                                      </p>
                                    </div>
                                  </CardBody>
                                </Card>
                              </div>
                            );
                          })()}

                          {/* 统计图表 - Tab 切换卡片 */}
                          <Card className="p-4">
                            {/* Tab 标题行：左侧Tabs，右侧图例和放大按钮 */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                              <Tabs
                                selectedKey={selectedStatsTab}
                                variant="underlined"
                                onSelectionChange={(key) => setSelectedStatsTab(key as string)}
                              >
                                <Tab key="traffic" title="流量累计" />
                                <Tab key="speed" title="传输速率" />
                                <Tab key="latency" title="端内延迟" />
                                <Tab key="connections" title="连接数量" />
                              </Tabs>

                              <div className="flex items-center justify-between sm:justify-start">
                                {/* 根据选中的 tab 显示对应的图例 */}
                                <div className="flex items-center gap-4 text-xs">
                                  {selectedStatsTab === "traffic" && (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                                        TCP入
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-green-500" />
                                        TCP出
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                                        UDP入
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                                        UDP出
                                      </div>
                                    </>
                                  )}
                                  {selectedStatsTab === "speed" && (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                                        上传
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                                        下载
                                      </div>
                                    </>
                                  )}
                                  {selectedStatsTab === "connections" && (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-pink-500" />
                                        池
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                                        TCP
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-teal-500" />
                                        UDP
                                      </div>
                                    </>
                                  )}
                                  {/* 端内延迟无需图例 */}
                                </div>

                                {/* 放大按钮 */}
                                <Button
                                  isIconOnly
                                  className="ml-4"
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
                                  <FontAwesomeIcon className="text-lg" icon={faExpand} />
                                </Button>
                              </div>
                            </div>

                            {/* Tab 内容区域 - 图表 */}
                            <div className="h-80 w-full">
                              {selectedStatsTab === "traffic" && (
                                <DetailedTrafficChart
                                  className="h-full w-full"
                                  data={transformDetailedTrafficData(metricsData?.data)}
                                  error={metricsError || undefined}
                                  height={320}
                                  loading={metricsLoading && !metricsData}
                                />
                              )}
                              {selectedStatsTab === "speed" && (
                                <SpeedChart
                                  className="h-full w-full"
                                  data={transformSpeedData(metricsData?.data)}
                                  error={metricsError || undefined}
                                  height={320}
                                  loading={metricsLoading && !metricsData}
                                />
                              )}
                              {selectedStatsTab === "latency" && (
                                <LatencyChart
                                  className="h-full w-full"
                                  data={transformLatencyData(metricsData?.data)}
                                  error={metricsError || undefined}
                                  height={320}
                                  loading={metricsLoading && !metricsData}
                                />
                              )}
                              {selectedStatsTab === "connections" && (
                                <ConnectionsChart
                                  className="h-full w-full"
                                  data={transformConnectionsData(metricsData?.data)}
                                  error={metricsError || undefined}
                                  height={320}
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
              </div>
            </div>
          </SwiperSlide>

          {/* 第二页：Card 填充页面 */}
          <SwiperSlide>
            <div className="flex flex-col gap-6">
              {/* 顶部服务信息卡片 */}
              <Card className="relative overflow-hidden border-none bg-gradient-to-br from-primary-50 via-primary-100 to-secondary-100 dark:from-primary-950/60 dark:via-primary-900/30 dark:to-secondary-900/40">
                <CardBody className="relative z-10 flex flex-col gap-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 p-4">
                    <div className="space-y-3">
                      {/* <Chip
                        className="w-fit"
                        color={getTypeColor(service.type) as any}
                        size="sm"
                        variant="shadow"
                      >
                        {getTypeLabel(service.type)}
                      </Chip> */}
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
                          {service.alias || "未命名"}
                        </h1>
                        <Chip size="sm" variant="flat" className="font-mono">
                          {service.sid}
                        </Chip>
                        <FontAwesomeIcon
                          className="text-default-400 hover:text-primary cursor-pointer transition-colors"
                          icon={faPen}
                          size="sm"
                          onClick={() => setRenameModalOpen(true)}
                        />
                      </div>
                      <p className="text-sm text-default-600 dark:text-default-400">
                        {getTypeEnglishLabel(service.type)}
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

                    <div className="flex flex-wrap items-center gap-3 ">
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
                        isDisabled={refreshLoading}
                        startContent={<FontAwesomeIcon icon={faRefresh} />}
                        variant="bordered"
                        onPress={handleRefresh}
                      >
                        刷新数据
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3 ">
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
                                ? service.clientInstanceId
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
                                    ? service.serverInstanceId
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
                <div className={`grid gap-4 md:grid-cols-${serverTunnel ? 2 : 1}`}>
                  {/* Client 实例卡片 */}
                  {clientTunnel && (
                    <Card className="border border-default-100/60 hover:shadow-lg transition-shadow">
                      <CardHeader className="flex items-center justify-between pb-2 pt-4 pl-4 pr-4">
                        <div className="flex items-center gap-2">
                          <Icon
                            className="text-secondary"
                            icon="lucide:arrow-up-right"
                            width={20}
                          />
                          <h3 className="text-lg font-semibold">Client 实例</h3>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-default-100">
                            <span
                              className={`w-2 h-2 rounded-full ${clientTunnel.status === "success"
                                ? "bg-success animate-pulse"
                                : clientTunnel.status === "warning"
                                  ? "bg-warning"
                                  : "bg-danger"
                                }`}
                            />
                            <span className="text-xs font-medium text-default-700">
                              {getStatusText(clientTunnel.status)}
                            </span>
                          </div>
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
                      <CardBody className="pt-0 space-y-3 pl-4 pb-4 pr-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-default-500">实例 ID</span>
                          <Tooltip content={clientTunnel.instanceId}>
                            <span className="font-mono text-sm">
                              {clientTunnel.instanceId}
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
                            {formatAddress(clientTunnel.tunnelAddress)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-default-500">目标地址</span>
                          <span className="text-sm font-mono">
                            {formatAddress(clientTunnel.targetAddress)}
                          </span>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {/* Server 实例卡片 (仅在 type !== "0" 时显示) */}
                  {serverTunnel && (
                    <Card className="border border-default-100/60 hover:shadow-lg transition-shadow">
                      <CardHeader className="flex items-center justify-between pb-2 pt-4 pl-4 pr-4">
                        <div className="flex items-center gap-2">
                          <Icon
                            className="text-primary"
                            icon="lucide:arrow-down-left"
                            width={20}
                          />
                          <h3 className="text-lg font-semibold">Server 实例</h3>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-default-100">
                            <span
                              className={`w-2 h-2 rounded-full ${serverTunnel.status === "success"
                                ? "bg-success animate-pulse"
                                : serverTunnel.status === "warning"
                                  ? "bg-warning"
                                  : "bg-danger"
                                }`}
                            />
                            <span className="text-xs font-medium text-default-700">
                              {getStatusText(serverTunnel.status)}
                            </span>
                          </div>
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
                      <CardBody className="pt-0 space-y-3 pl-4 pb-4 pr-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-default-500">实例 ID</span>
                          <Tooltip content={serverTunnel.instanceId}>
                            <span className="font-mono text-sm">
                              {serverTunnel.instanceId}
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
                            {formatAddress(serverTunnel.tunnelAddress)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-default-500">目标地址</span>
                          <span className="text-sm font-mono">
                            {formatAddress(serverTunnel.targetAddress)}
                          </span>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                </div>
              )}

              {/* 快捷操作区域 */}
              <Card className="border border-default-100/60 shadow-lg shadow-primary-500/5">
                <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-0 pt-4 pl-4 pr-4">
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      即时操作
                    </h2>
                    <p className="text-tiny uppercase text-default-400">控制台</p>
                  </div>
                </CardHeader>
                <CardBody className="pt-2 pl-4 pr-4 pb-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Button
                      className="h-28 w-full flex-col items-start justify-between rounded-2xl border border-default-100/70 bg-content2/50 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg"
                      color="default"
                      variant="flat"
                      onPress={() => navigate(`/services/sse?sid=${service.sid}`)}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FontAwesomeIcon icon={faBug} />
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
                        <FontAwesomeIcon icon={faGlobe} />
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
            </div>
          </SwiperSlide>
        </Swiper>
      </div >

      {/* 重命名服务模态框 */}
      < RenameServiceModal
        isOpen={renameModalOpen}
        service={service ? { sid: service.sid, alias: service.alias } : null
        }
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
        chartType={fullscreenChart.type as any}
        connectionsData={transformConnectionsData(metricsData?.data)}
        error={metricsError || undefined}
        isOpen={fullscreenChart.isOpen}
        latencyData={transformLatencyData(metricsData?.data)}
        loading={metricsLoading}
        speedData={transformSpeedData(metricsData?.data)}
        title={fullscreenChart.title}
        trafficData={transformDetailedTrafficData(metricsData?.data)}
        onOpenChange={(isOpen) =>
          !isOpen && setFullscreenChart({ isOpen: false, type: "", title: "" })
        }
      />

      {/* TCPing 网络诊断模态框 */}
      {
        (() => {
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
              serverExtendTargetAddress={serverTunnel?.extendTargetAddress || []}
              isOpen={tcpingModalOpen}
              serverInstanceId={service.serverInstanceId}
              serverTunnelAddress={serverTunnel?.tunnelAddress || ""}
              serverEndpointHost={serverTunnel?.endpoint?.host || ""}
              clientEndpointHost={clientTunnel.endpoint?.host || ""}
              serverListenPort={serverTunnel?.listenPort || 0}
              serverTargetAddress={serverTunnel?.targetAddress || ""}
              serverTargetPort={serverTunnel?.targetPort || 0}
              serviceType={service.type}
              onClose={() => setTcpingModalOpen(false)}
            />
          );
        })()
      }
    </>
  );
}
