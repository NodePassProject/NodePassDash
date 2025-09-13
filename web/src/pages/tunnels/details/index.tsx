
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
  useDisclosure,
  Tooltip,
  Accordion,
  AccordionItem,
  Switch,
  cn,
  Select,
  SelectItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Spinner,
  Input,
  DatePicker,
} from "@heroui/react";
import { Snippet } from "@/components/ui/snippet";
import React, { useEffect } from "react";
// 引入 SimpleCreateTunnelModal 组件
import SimpleCreateTunnelModal from "@/components/tunnels/simple-create-tunnel-modal";
import RenameTunnelModal from "@/components/tunnels/rename-tunnel-modal";
import { FullscreenChartModal } from "./fullscreen-chart-modal";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlay,
  faPause,
  faRotateRight,
  faTrash,
  faRefresh,
  faStop,
  faQuestionCircle,
  faEye,
  faEyeSlash,
  faArrowDown,
  faDownload,
  faPen,
  faRecycle,
  faExpand,
  faHammer,
  faBug,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { addToast } from "@heroui/toast";
import CellValue from "./cell-value";
import { EnhancedMetricsChart } from "@/components/ui/enhanced-metrics-chart";
import { TrafficUsageChart } from "@/components/ui/traffic-usage-chart";
import { DetailedTrafficChart } from "@/components/ui/detailed-traffic-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { PoolChart } from "@/components/ui/pool-chart";
import { ConnectionsChart } from "@/components/ui/connections-chart";
import { LatencyChart } from "@/components/ui/latency-chart";
import { useSearchParams } from "react-router-dom";
import { FileLogViewer } from "@/components/ui/file-log-viewer";
import { useTunnelSSE } from "@/lib/hooks/use-sse";
import { useMetricsTrend } from "@/lib/hooks/use-metrics-trend";
import {parseDate, getLocalTimeZone} from "@internationalized/date";
import TunnelStatsCharts from "@/components/ui/tunnel-stats-charts";
import { useSettings } from "@/components/providers/settings-provider";

interface TunnelInfo {
  id: number;
  instanceId: string;
  name: string;
  type: "server" | "client"; // 统一使用英文类型
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  endpoint: string;
  endpointId: string;
  endpointVersion?: string;
  password?: string;
  config: {
    listenPort: number;
    targetPort: number;
    tls: boolean;
    logLevel: string;
    tlsMode?: string; // 添加 tlsMode 字段
    endpointTLS?: string; // 主控的TLS配置
    endpointLog?: string; // 主控的Log配置
    min?: number | null;
    max?: number | null;
    slot?: number | null; // 最大连接数限制
    restart: boolean; // 添加 restart 字段
    certPath?: string; // TLS证书路径
    keyPath?: string; // TLS密钥路径
    mode?: number | null; // 隧道模式 (0, 1, 2)
    read?: string; // 读取配置
    rate?: string; // 速率限制配置
  };
  traffic: {
    tcpRx: number;
    tcpTx: number;
    udpRx: number;
    udpTx: number;
    pool: number | null;
    ping: number | null;
    tcps: number | null;
    udps: number | null;
  };
  nodepassInfo: any;
  error?: string;
  tunnelAddress: string;
  targetAddress: string;
  commandLine: string;
}

interface PageParams {
  id: string;
}

// 移除LogEntry接口，使用FileLogViewer内部的类型

interface RawTrafficData {
  timestamp: Date;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
}

interface FlowTrafficData {
  id: string;
  data: Array<{
    x: string;
    y: number;
    unit: string;
  }>;
}

// 添加流量趋势数据类型 - 后端返回的是差值数据
interface TrafficTrendData {
  eventTime: string;
  tcpRxDiff: number;
  tcpTxDiff: number;
  udpRxDiff: number;
  udpTxDiff: number;
  poolDiff: number | null;
  pingDiff: number | null;
}

// 添加延迟趋势数据类型 - 后端返回的是绝对值数据
interface PingTrendData {
  eventTime: string;
  ping: number;
}

// 添加连接池趋势数据类型 - 后端返回的是绝对值数据
interface PoolTrendData {
  eventTime: string;
  pool: number;
}

// 添加流量单位转换函数
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

// 根据数据选择最合适的统一单位
const getBestUnit = (values: number[]) => {
  if (values.length === 0) return { unit: "B", divisor: 1 };

  const maxValue = Math.max(...values);
  const units = ["B", "KB", "MB", "GB", "TB"];
  const divisors = [
    1,
    1024,
    1024 * 1024,
    1024 * 1024 * 1024,
    1024 * 1024 * 1024 * 1024,
  ];

  let unitIndex = 0;
  let testValue = maxValue;

  while (testValue >= 1024 && unitIndex < units.length - 1) {
    testValue /= 1024;
    unitIndex++;
  }

  return {
    unit: units[unitIndex],
    divisor: divisors[unitIndex],
  };
};

// 将主控的TLS数字转换为对应的模式文案
const getTLSModeText = (tlsValue: string): string => {
  switch (tlsValue) {
    case "0":
      return "无 TLS 加密";
    case "1":
      return "自签名证书";
    case "2":
      return "自定义证书";
    default:
      return tlsValue; // 如果不是数字，直接返回原值
  }
};

// 将隧道模式数字转换为对应的模式文案
const getTunnelModeText = (type: string, modeValue?: number | null): string => {
  if (modeValue == null) return "未设置";
  
  if (type === "client") {
    switch (modeValue) {
      case 0:
        return "自动模式";
      case 1:
        return "单端转发";
      case 2:
        return "双端转发";
      default:
        return `未知模式(${modeValue})`;
    }
  } else if (type === "server") {
    switch (modeValue) {
      case 0:
        return "自动检测";
      case 1:
        return "反向转发";
      case 2:
        return "正向转发";
      default:
        return `未知模式(${modeValue})`;
    }
  }
  return `未知模式(${modeValue})`;
};

// 添加流量历史记录类型
interface TrafficMetrics {
  timestamp: number;
  tcp_in_rate: number;
  tcp_out_rate: number;
  udp_in_rate: number;
  udp_out_rate: number;
}

interface TrafficHistory {
  timestamps: number[];
  tcp_in_rates: number[];
  tcp_out_rates: number[];
  udp_in_rates: number[];
  udp_out_rates: number[];
}

export default function TunnelDetailPage() {
  // const resolvedParams = React.use(params);
  const navigate = useNavigate();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { settings } = useSettings();
  const [tunnelInfo, setTunnelInfo] = React.useState<TunnelInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [trafficData, setTrafficData] = React.useState<FlowTrafficData[]>([]);
  const [initialDataLoaded, setInitialDataLoaded] = React.useState(false);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
  const [trafficTimeRange, setTrafficTimeRange] = React.useState<
    "1h" | "6h" | "12h" | "24h"
  >("24h");
  const [pingTimeRange, setPingTimeRange] = React.useState<
    "1h" | "6h" | "12h" | "24h"
  >("24h");
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);

  // 获取隧道ID参数
  const [searchParams] = useSearchParams();
  const resolvedId = searchParams.get("id");

  // 获取实例详情（不包含流量趋势和日志）- 提前定义
  const fetchTunnelDetails = React.useCallback(async () => {
    try {
      setLoading(true);

      // 获取实例基本信息
      const response = await fetch(`/api/tunnels/${resolvedId}/details`);
      if (!response.ok) {
        throw new Error("获取实例详情失败");
      }

      const data = await response.json();

      // 设置基本信息
      console.log("[隧道详情] 接收到的数据:", data.tunnelInfo);
      setTunnelInfo(data.tunnelInfo);

      setInitialDataLoaded(true);
    } catch (error) {
      console.error("获取实例详情失败:", error);
      addToast({
        title: "获取实例详情失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  }, [resolvedId]);

  // 使用统一的 metrics 趋势 hook (15秒轮询)
  const {
    data: metricsData,
    loading: metricsLoading,
    error: metricsError,
    refresh: refreshMetrics,
    isAutoRefreshEnabled: isMetricsAutoRefreshEnabled,
    toggleAutoRefresh: toggleMetricsAutoRefresh,
  } = useMetricsTrend({
    tunnelId: tunnelInfo?.instanceId || "", // 使用instanceId作为参数，传递给后端
    autoRefresh: !!tunnelInfo?.instanceId, // 只有当有有效 instanceId 时才启用自动刷新
    refreshInterval: 15000, // 15秒轮询，后端固定返回24小时数据
  });

  // 编辑实例模态控制
  const [editModalOpen, setEditModalOpen] = React.useState(false);

  // 重命名模态控制
  const [isRenameModalOpen, setIsRenameModalOpen] = React.useState(false);

  // 是否移入回收站
  const [moveToRecycle, setMoveToRecycle] = React.useState(false);

  // 自动重启开关状态更新
  const [isUpdatingRestart, setIsUpdatingRestart] = React.useState(false);

  // 文件日志相关状态
  const [logDate, setLogDate] = React.useState<string>(""); // 改为logDate
  const [availableLogDates, setAvailableLogDates] = React.useState<string[]>([]); // 新增：可用日志日期列表
  const [logLoading, setLogLoading] = React.useState(false);
  const [logClearing, setLogClearing] = React.useState(false);
  const [logRefreshTrigger, setLogRefreshTrigger] = React.useState(0);
  const [clearPopoverOpen, setClearPopoverOpen] = React.useState(false);
  const [exportLoading, setExportLoading] = React.useState(false);
  const [resetModalOpen, setResetModalOpen] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);

  // 全屏图表模态状态
  const [fullscreenModalOpen, setFullscreenModalOpen] = React.useState(false);
  const [fullscreenChartType, setFullscreenChartType] = React.useState<
    "traffic" | "speed" | "pool" | "connections" | "latency"
  >("traffic");
  const [fullscreenChartTitle, setFullscreenChartTitle] = React.useState("");

  // TCPing诊断测试状态
  const [tcpingModalOpen, setTcpingModalOpen] = React.useState(false);
  const [tcpingTarget, setTcpingTarget] = React.useState("");
  const [tcpingLoading, setTcpingLoading] = React.useState(false);
  const [tcpingResult, setTcpingResult] = React.useState<{
    target: string;
    connected: boolean;
    latency: number;
    error: string;
    // 新增字段
    minLatency?: number;
    maxLatency?: number;
    avgLatency?: number;
    packetLoss?: number;
    totalTests?: number;
    successfulTests?: number;
  } | null>(null);

  // 日志实时输出状态
  const [isRealtimeLogging, setIsRealtimeLogging] = React.useState(false);
  const [selectedLogDate, setSelectedLogDate] = React.useState<string | null>(null);

  // 打开全屏图表的函数
  const openFullscreenChart = (
    type: "traffic" | "speed" | "pool" | "connections" | "latency",
    title: string
  ) => {
    setFullscreenChartType(type);
    setFullscreenChartTitle(title);
    setFullscreenModalOpen(true);
  };

  // 根据时间范围过滤数据 - 使用useMemo优化，避免每次渲染都重新创建
  const filterDataByTimeRange = React.useMemo(
    () => (data: TrafficTrendData[], timeRange: "1h" | "6h" | "12h" | "24h") => {
      if (data.length === 0) return data;

      // 获取当前时间
      const now = new Date();
      const hoursAgo =
        timeRange === "1h"
          ? 1
          : timeRange === "6h"
            ? 6
            : timeRange === "12h"
              ? 12
              : 24;
      const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

      // 过滤数据
      const filteredData = data.filter((item, index) => {
        const timeStr = item.eventTime;
        if (!timeStr) return false;

        try {
          const [datePart, timePart] = timeStr.split(" ");
          if (datePart && timePart) {
            const [year, month, day] = datePart.split("-").map(Number);
            const [hour, minute] = timePart.split(":").map(Number);
            const itemTime = new Date(year, month - 1, day, hour, minute);
            const isValid = !isNaN(itemTime.getTime());
            const isInRange = isValid && itemTime >= cutoffTime;

            return isInRange;
          }
          return false;
        } catch (error) {
          console.error(`时间解析错误: ${timeStr}`, error);
          return false;
        }
      });

      return filteredData;
    },
    []
  );

  // 根据时间范围过滤ping数据 - 优化为useMemo
  const filterPingDataByTimeRange = React.useMemo(
    () => (data: PingTrendData[], timeRange: "1h" | "6h" | "12h" | "24h") => {
      if (data.length === 0) return data;

      // 获取当前时间
      const now = new Date();
      const hoursAgo =
        timeRange === "1h"
          ? 1
          : timeRange === "6h"
            ? 6
            : timeRange === "12h"
              ? 12
              : 24;
      const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

      // 过滤数据
      const filteredData = data.filter((item) => {
        const timeStr = item.eventTime;
        if (!timeStr) return false;

        try {
          const [datePart, timePart] = timeStr.split(" ");
          if (datePart && timePart) {
            const [year, month, day] = datePart.split("-").map(Number);
            const [hour, minute] = timePart.split(":").map(Number);
            const itemTime = new Date(year, month - 1, day, hour, minute);
            const isValid = !isNaN(itemTime.getTime());
            const isInRange = isValid && itemTime >= cutoffTime;

            return isInRange;
          }
          return false;
        } catch (error) {
          console.error(`ping数据时间解析错误: ${timeStr}`, error);
          return false;
        }
      });

      return filteredData;
    },
    []
  );

  // 根据时间范围过滤连接池数据 - 优化为useMemo
  const filterPoolDataByTimeRange = React.useMemo(
    () => (data: PoolTrendData[], timeRange: "1h" | "6h" | "12h" | "24h") => {
      if (data.length === 0) return data;

      // 获取当前时间
      const now = new Date();
      const hoursAgo =
        timeRange === "1h"
          ? 1
          : timeRange === "6h"
            ? 6
            : timeRange === "12h"
              ? 12
              : 24;
      const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

      // 过滤数据
      const filteredData = data.filter((item) => {
        const timeStr = item.eventTime;
        if (!timeStr) return false;

        try {
          const [datePart, timePart] = timeStr.split(" ");
          if (datePart && timePart) {
            const [year, month, day] = datePart.split("-").map(Number);
            const [hour, minute] = timePart.split(":").map(Number);
            const itemTime = new Date(year, month - 1, day, hour, minute);
            const isValid = !isNaN(itemTime.getTime());
            const isInRange = isValid && itemTime >= cutoffTime;

            return isInRange;
          }
          return false;
        } catch (error) {
          console.error(`连接池数据时间解析错误: ${timeStr}`, error);
          return false;
        }
      });

      return filteredData;
    },
    []
  );

  // 数据转换函数 - 将API数据转换为新图表组件需要的格式
  const transformTrafficData = React.useCallback((apiData: any) => {
    if (!apiData?.traffic?.created_at || !apiData?.traffic?.avg_delay) {
      return [];
    }

    const result = apiData.traffic.created_at.map(
      (timestamp: number, index: number) => ({
        timeStamp: new Date(timestamp).toISOString(),
        traffic: apiData.traffic.avg_delay[index] || 0,
      })
    );

    return result;
  }, []);

  const transformSpeedData = React.useCallback((apiData: any) => {
    const speedInTimestamps = apiData?.speed_in?.created_at || [];
    const speedInValues = apiData?.speed_in?.avg_delay || [];
    const speedOutTimestamps = apiData?.speed_out?.created_at || [];
    const speedOutValues = apiData?.speed_out?.avg_delay || [];

    // 合并时间戳
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

  const transformPoolData = React.useCallback((apiData: any) => {
    if (!apiData?.pool?.created_at || !apiData?.pool?.avg_delay) {
      return [];
    }

    const result = apiData.pool.created_at.map(
      (timestamp: number, index: number) => ({
        timeStamp: new Date(timestamp).toISOString(),
        pool: Math.round(apiData.pool.avg_delay[index] || 0),
      })
    );

    return result;
  }, []);

  const transformConnectionsData = React.useCallback((apiData: any) => {
    // 合并所有时间戳
    const poolTimestamps = apiData?.pool?.created_at || [];
    const tcpsTimestamps = apiData?.tcps?.created_at || [];
    const udpsTimestamps = apiData?.udps?.created_at || [];
    
    const poolValues = apiData?.pool?.avg_delay || [];
    const tcpsValues = apiData?.tcps?.avg_delay || [];
    const udpsValues = apiData?.udps?.avg_delay || [];

    const allTimestamps = [
      ...new Set([...poolTimestamps, ...tcpsTimestamps, ...udpsTimestamps])
    ].sort((a, b) => a - b);

    const result = allTimestamps.map((timestamp: number) => {
      const poolIndex = poolTimestamps.indexOf(timestamp);
      const tcpsIndex = tcpsTimestamps.indexOf(timestamp);
      const udpsIndex = udpsTimestamps.indexOf(timestamp);

      return {
        timeStamp: new Date(timestamp).toISOString(),
        pool: poolIndex >= 0 ? Math.round(poolValues[poolIndex] || 0) : undefined,
        tcps: tcpsIndex >= 0 ? Math.round(tcpsValues[tcpsIndex] || 0) : undefined,
        udps: udpsIndex >= 0 ? Math.round(udpsValues[udpsIndex] || 0) : undefined,
      };
    });

    return result;
  }, []);

  const transformLatencyData = React.useCallback((apiData: any) => {
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

  // 新增：详细流量数据转换函数 - 转换为四条线格式
  const transformDetailedTrafficData = React.useCallback((apiData: any) => {
    // 获取所有相关数据流
    const tcpInTimestamps = apiData?.tcp_in?.created_at || [];
    const tcpInValues = apiData?.tcp_in?.avg_delay || [];
    const tcpOutTimestamps = apiData?.tcp_out?.created_at || [];
    const tcpOutValues = apiData?.tcp_out?.avg_delay || [];
    const udpInTimestamps = apiData?.udp_in?.created_at || [];
    const udpInValues = apiData?.udp_in?.avg_delay || [];
    const udpOutTimestamps = apiData?.udp_out?.created_at || [];
    const udpOutValues = apiData?.udp_out?.avg_delay || [];

    // 合并所有时间戳并去重
    const allTimestamps = [
      ...new Set([
        ...tcpInTimestamps,
        ...tcpOutTimestamps,
        ...udpInTimestamps,
        ...udpOutTimestamps
      ])
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

  // 文件日志控制函数 - 使用稳定的回调，减少重新渲染
  const handleLogRefresh = React.useCallback(() => {
    setLogRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleLogClear = React.useCallback(() => {
    // 清空完成后的回调
    console.log("文件日志已清空");
  }, []);

  // 导出日志和SSE记录的函数
  const handleExport = React.useCallback(async () => {
    if (exportLoading || !tunnelInfo) return;

    setExportLoading(true);

    // 声明清理变量
    let tempAnchor: HTMLAnchorElement | null = null;
    let objectUrl: string | null = null;

    try {
      // 调用后端API获取zip文件
      const response = await fetch(
        `/api/tunnels/${tunnelInfo.id}/export-logs`,
        {
          method: "GET",
          headers: {
            Accept: "application/zip",
          },
        }
      );

      if (!response.ok) {
        throw new Error("导出失败");
      }

      // 获取文件名，默认使用实例名称
      const filename = `${tunnelInfo.name}_logs_${new Date().toISOString().split("T")[0]}.zip`;

      // 创建blob并下载
      const blob = await response.blob();
      objectUrl = window.URL.createObjectURL(blob);
      tempAnchor = document.createElement("a");
      tempAnchor.style.display = "none";
      tempAnchor.href = objectUrl;
      tempAnchor.download = filename;
      document.body.appendChild(tempAnchor);
      tempAnchor.click();

      addToast({
        title: "导出成功",
        description: `日志文件已导出为 ${filename}`,
        color: "success",
      });
    } catch (error) {
      console.error("导出日志失败:", error);
      addToast({
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      // 确保清理资源，防止内存泄漏
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
      if (tempAnchor && tempAnchor.parentNode) {
        tempAnchor.parentNode.removeChild(tempAnchor);
      }
      setExportLoading(false);
    }
  }, [exportLoading, tunnelInfo]);

  // 手动刷新页面数据的函数 - 优化防抖和依赖
  const handleRefresh = React.useCallback(async () => {
    if (refreshLoading) return; // 防抖：如果正在loading则直接返回

    setRefreshLoading(true);

    try {
      // 使用已有的fetchTunnelDetails方法，避免重复代码
      await fetchTunnelDetails();

      // 手动刷新metrics数据
      refreshMetrics();

      // 刷新文件日志 - 直接更新trigger而不依赖handleLogRefresh
      setLogRefreshTrigger((prev) => prev + 1);
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
  }, [refreshLoading, refreshMetrics, fetchTunnelDetails]);

  // 使用共用的实例操作 hook
  const { toggleStatus, restart, deleteTunnel } = useTunnelActions();

  const previousStatsRef = React.useRef<{
    timestamp: number;
    tcp_in: number;
    tcp_out: number;
    udp_in: number;
    udp_out: number;
  } | null>(null);

  const trafficHistoryRef = React.useRef<TrafficHistory>({
    timestamps: [],
    tcp_in_rates: [],
    tcp_out_rates: [],
    udp_in_rates: [],
    udp_out_rates: [],
  });

  // 初始化日志日期 - 直接设置为今天
  const initializeLogDate = React.useCallback(() => {
    if (!logDate) {
      const today = new Date().toISOString().split('T')[0];
      setLogDate(today);
      setSelectedLogDate(today);
    }
  }, [logDate]);

  // 初始加载数据
  React.useEffect(() => {
    fetchTunnelDetails();
  }, [fetchTunnelDetails]);

  // 当隧道信息加载完成后，初始化日志日期
  React.useEffect(() => {
    if (tunnelInfo?.endpointId && tunnelInfo?.instanceId && !logDate) {
      initializeLogDate();
    }
  }, [tunnelInfo?.endpointId, tunnelInfo?.instanceId, logDate, initializeLogDate]);

  // 组件卸载时清理全局变量引用和useRef数据
  React.useEffect(() => {
    return () => {
      // 清理全局引用，防止内存泄漏
      if ((window as any).fileLogViewerRef) {
        delete (window as any).fileLogViewerRef;
      }
      
      // 清理useRef中的大数据，释放内存
      if (previousStatsRef.current) {
        previousStatsRef.current = null;
      }
      
      // 清理流量历史数据数组
      if (trafficHistoryRef.current) {
        trafficHistoryRef.current = {
          timestamps: [],
          tcp_in_rates: [],
          tcp_out_rates: [],
          udp_in_rates: [],
          udp_out_rates: [],
        };
      }
    };
  }, []);

  // SSE事件处理器 - 使用useMemo优化
  const sseOnMessage = React.useCallback((data: any) => {
    console.log("[隧道详情] 收到SSE事件:", data);

    // 处理log事件 - 拼接到日志末尾
    if (data.type === "log" && data.logs) {
      console.log("[隧道详情] 收到日志事件，追加到日志末尾:", data.logs);
      // 通过window对象调用FileLogViewer的方法追加日志
      if (
        (window as any).fileLogViewerRef &&
        (window as any).fileLogViewerRef.appendLog
      ) {
        (window as any).fileLogViewerRef.appendLog(data.logs);
      } else {
        console.warn("[隧道详情] FileLogViewer引用不存在，无法追加日志");
      }
    }

    // 处理update事件 - 优化：只更新必要的状态，避免重复API调用
    if (data.type === "update") {
      console.log("[隧道详情] 收到update事件，更新本地状态");

      // 只在非实时模式下刷新日志（通过触发器），避免重复调用fetchTunnelDetails
      if (!isRealtimeLogging) {
        setLogRefreshTrigger((prev) => prev + 1);
      }
      // 注意：metrics数据通过15秒轮询自动更新，无需手动刷新
      // 注意：基本信息很少变化，避免频繁调用API

      // 如果数据中包含状态更新，立即更新本地状态
      if (data.status) {
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                status: {
                  type: data.status === "running" ? "success" : "danger",
                  text: data.status === "running" ? "运行中" : "已停止",
                },
              }
            : null
        );
      }

      // 如果数据中包含流量更新，立即更新本地状态
      if (
        data.tcpRx !== undefined &&
        data.tcpTx !== undefined &&
        data.udpRx !== undefined &&
        data.udpTx !== undefined
      ) {
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                traffic: {
                  tcpRx: data.tcpRx,
                  tcpTx: data.tcpTx,
                  udpRx: data.udpRx,
                  udpTx: data.udpTx,
                  pool: data.pool || prev.traffic.pool,
                  ping: data.ping || prev.traffic.ping,
                  tcps: data.tcps || prev.traffic.tcps,
                  udps: data.udps || prev.traffic.udps,
                },
              }
            : null
        );
      }
    }
  }, [isRealtimeLogging]);

  const sseOnError = React.useCallback((error: any) => {
    console.error("[隧道详情] SSE连接错误:", error);
  }, []);

  // SSE监听逻辑 - 使用优化的事件处理器，只有在实时日志开启时才连接
  useTunnelSSE(tunnelInfo?.instanceId || "", {
    onMessage: sseOnMessage,
    onError: sseOnError,
    enabled: isRealtimeLogging, // 控制是否连接SSE
  });

  const handleToggleStatus = () => {
    if (!tunnelInfo) return;

    const isRunning = tunnelInfo.status.type === "success";
    toggleStatus(isRunning, {
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                status: {
                  type: newStatus ? "success" : "danger",
                  text: newStatus ? "运行中" : "已停止",
                },
              }
            : null
        );
      },
    });
  };

  const handleRestart = () => {
    if (!tunnelInfo) return;

    restart({
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                status: {
                  type: "success",
                  text: "运行中",
                },
              }
            : null
        );
      },
    });
  };

  const handleDelete = () => {
    if (!tunnelInfo) return;

    deleteTunnel({
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      redirectAfterDelete: true,
      recycle: moveToRecycle,
    });
  };

  const handleDeleteClick = () => {
    onOpen();
  };

  // 处理重启开关状态变更
  const handleRestartToggle = async (newRestartValue: boolean) => {
    if (!tunnelInfo || isUpdatingRestart) return;

    setIsUpdatingRestart(true);

    try {
      // 调用新的重启策略专用接口
      const response = await fetch(`/api/tunnels/${tunnelInfo.id}/restart`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restart: newRestartValue }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 更新本地状态
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                config: {
                  ...prev.config,
                  restart: newRestartValue,
                },
              }
            : null
        );

        addToast({
          title: "配置更新成功",
          description:
            data.message || `自动重启已${newRestartValue ? "开启" : "关闭"}`,
          color: "success",
        });
      } else {
        throw new Error(data.error || "更新失败");
      }
    } catch (error) {
      console.error("更新重启配置失败:", error);

      // 检查是否为404错误或不支持错误，表示当前实例不支持自动重启功能
      let errorMessage = "未知错误";
      if (error instanceof Error) {
        errorMessage = error.message;
        // 检查错误信息中是否包含不支持相关内容
        if (
          errorMessage.includes("404") ||
          errorMessage.includes("Not Found") ||
          errorMessage.includes("不支持") ||
          errorMessage.includes("unsupported") ||
          errorMessage.includes("当前实例不支持自动重启功能")
        ) {
          errorMessage = "当前实例不支持自动重启功能";
        }
      }

      addToast({
        title: "配置更新失败",
        description: errorMessage,
        color: "danger",
      });
    } finally {
      setIsUpdatingRestart(false);
    }
  };

  // TCPing诊断测试处理函数
  const handleTcpingTest = async () => {
    if (!tunnelInfo || tcpingLoading) return;

    // 直接使用当前实例的目标地址和端口
    const targetAddress = `${tunnelInfo.targetAddress}:${tunnelInfo.config.targetPort}`;
    setTcpingTarget(targetAddress);
    setTcpingLoading(true);
    setTcpingResult(null);

    try {
      const response = await fetch(
        `/api/tunnels/${tunnelInfo.instanceId}/tcping`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: targetAddress }),
        }
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
  };

  // 判断延迟是否优秀的函数
  const getLatencyQuality = (latency: number) => {
    if (latency < 50) return { text: "优秀", color: "success" };
    if (latency < 100) return { text: "良好", color: "primary" };
    if (latency < 200) return { text: "一般", color: "warning" };
    return { text: "较差", color: "danger" };
  };

  // 当模态框打开时自动开始TCPing测试
  React.useEffect(() => {
    if (tcpingModalOpen && !tcpingLoading && !tcpingResult) {
      // 直接开始测试，无需延迟
      handleTcpingTest();
    }
  }, [tcpingModalOpen]);

  // 处理实时日志开关切换
  const handleRealtimeLoggingToggle = React.useCallback(async (enabled: boolean) => {
    setIsRealtimeLogging(enabled);
    
    if (enabled) {
      // 开启实时日志：直接清空日志显示，不调用清除接口
      if ((window as any).fileLogViewerRef && (window as any).fileLogViewerRef.clearDisplay) {
        (window as any).fileLogViewerRef.clearDisplay();
      }
      // 保持selectedLogDate不变，但显示为禁用状态
    } else {
      // 关闭实时日志：恢复到历史日志模式，默认选择今天
      const today = new Date().toISOString().split('T')[0];
      
      setLogDate(today);
      setSelectedLogDate(today);
      setLogRefreshTrigger((prev) => prev + 1);
    }
  }, []);

  // 处理日期选择变更（仅在非实时模式下有效）
  const handleLogDateChange = React.useCallback(async (date: string | null) => {
    if (isRealtimeLogging) return; // 实时模式下不允许选择日期
    
    setSelectedLogDate(date);
    
    // 触发FileLogViewer刷新以加载新日期的日志
    if (date) {
      setLogDate(date);
      setLogRefreshTrigger((prev) => prev + 1);
    }
  }, [isRealtimeLogging]);

  const handleReset = async () => {
    if (!tunnelInfo) return;
    setResetLoading(true);
    try {
      const response = await fetch(`/api/tunnels/${tunnelInfo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          instanceId: tunnelInfo.instanceId,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast({
          title: "重置成功",
          description: "实例流量信息已重置",
          color: "success",
        });
        fetchTunnelDetails();
      } else {
        throw new Error(data.error || "重置失败");
      }
    } catch (error) {
      addToast({
        title: "重置失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setResetLoading(false);
      setResetModalOpen(false);
    }
  };

  // 重命名处理函数
  const handleRenameClick = () => {
    setIsRenameModalOpen(true);
  };

  // 重命名成功回调
  const handleRenameSuccess = (newName: string) => {
    // 更新本地状态
    setTunnelInfo((prev) =>
      prev ? { ...prev, name: newName } : null
    );
  };

  // 如果正在加载或没有数据，显示加载状态
  if (loading || !tunnelInfo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Spinner size="lg" color="primary" />
          </div>
          <p className="text-default-500 animate-pulse">加载中...</p>
        </div>
      </div>
    );
  }

  // 整页loading状态 - 当点击刷新按钮时显示
  if (refreshLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Spinner size="lg" color="primary" />
          </div>
          <p className="text-default-500 animate-pulse">刷新数据中...</p>
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
              variant="flat"
              onClick={() => navigate(-1)}
              className="bg-default-100 hover:bg-default-200 "
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </Button>
            <h1 className="text-lg md:text-2xl font-bold truncate">
              {tunnelInfo.name}
            </h1>
            <Chip
              variant="flat"
              color={tunnelInfo.type === "server" ? "primary" : "secondary"}
            >
              {tunnelInfo.type === "server" ? "服务端" : "客户端"}
            </Chip>
            <Chip
              variant="flat"
              color={tunnelInfo.status.type}
              className="flex-shrink-0"
            >
              {tunnelInfo.status.text}
            </Chip>
          </div>

          {/* 操作按钮组 - 桌面端显示 */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <Button
              variant="flat"
              color={
                tunnelInfo.status.type === "success" ? "warning" : "success"
              }
              startContent={
                <FontAwesomeIcon
                  icon={tunnelInfo.status.type === "success" ? faStop : faPlay}
                />
              }
              onClick={handleToggleStatus}
              className="flex-shrink-0"
            >
              {tunnelInfo.status.type === "success" ? "停止" : "启动"}
            </Button>
            <Button
              variant="flat"
              color="primary"
              startContent={<FontAwesomeIcon icon={faRotateRight} />}
              onClick={handleRestart}
              isDisabled={tunnelInfo.status.type !== "success"}
              className="flex-shrink-0"
            >
              重启
            </Button>
            <Button
              variant="flat"
              color="danger"
              startContent={<FontAwesomeIcon icon={faTrash} />}
              onClick={handleDeleteClick}
              className="flex-shrink-0"
            >
              删除
            </Button>
            <Button
              variant="flat"
              color="default"
              startContent={<FontAwesomeIcon icon={faRefresh} />}
              onClick={handleRefresh}
              isDisabled={refreshLoading}
              className="flex-shrink-0"
            >
              刷新
            </Button>
          </div>
          {/* 操作按钮组 - 移动端显示 */}
          <div className="sm:hidden flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <Button
              variant="flat"
              color={
                tunnelInfo.status.type === "success" ? "warning" : "success"
              }
              startContent={
                <FontAwesomeIcon
                  icon={tunnelInfo.status.type === "success" ? faStop : faPlay}
                />
              }
              onClick={handleToggleStatus}
              className="flex-shrink-0"
              size="sm"
            >
              {tunnelInfo.status.type === "success" ? "停止" : "启动"}
            </Button>
            <Button
              variant="flat"
              color="primary"
              startContent={<FontAwesomeIcon icon={faRotateRight} />}
              onClick={handleRestart}
              isDisabled={tunnelInfo.status.type !== "success"}
              className="flex-shrink-0"
              size="sm"
            >
              重启
            </Button>
            <Button
              variant="flat"
              color="danger"
              startContent={<FontAwesomeIcon icon={faTrash} />}
              onClick={handleDeleteClick}
              className="flex-shrink-0"
              size="sm"
            >
              删除
            </Button>
            <Button
              variant="flat"
              color="default"
              startContent={<FontAwesomeIcon icon={faRefresh} />}
              onClick={handleRefresh}
              isDisabled={refreshLoading}
              className="flex-shrink-0"
              size="sm"
            >
              刷新
            </Button>
          </div>
        </div>

        {/* 删除确认模态框 */}
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center">
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faTrash} className="text-danger" />
                    确认删除
                  </div>
                </ModalHeader>
                <ModalBody>
                  <p className="text-default-600 text-sm md:text-base">
                    您确定要删除实例{" "}
                    <span className="font-semibold text-foreground">
                      "{tunnelInfo.name}"
                    </span>{" "}
                    吗？
                  </p>
                  <p className="text-xs md:text-small text-warning">
                    ⚠️ 此操作不可撤销，实例的所有配置和数据都将被永久删除。
                  </p>
                </ModalBody>
                <ModalFooter>
                  <Button
                    color="default"
                    variant="light"
                    onPress={onClose}
                    size="sm"
                  >
                    取消
                  </Button>
                  <Button
                    color="danger"
                    size="sm"
                    onPress={() => {
                      handleDelete();
                      onClose();
                      setMoveToRecycle(false);
                    }}
                    startContent={<FontAwesomeIcon icon={faTrash} />}
                  >
                    确认删除
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 重置确认模态框 */}
        <Modal
          isOpen={resetModalOpen}
          onOpenChange={setResetModalOpen}
          placement="center"
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon
                      icon={faRecycle}
                      className="text-secondary"
                    />
                    确认重置
                  </div>
                </ModalHeader>
                <ModalBody>
                  <p className="text-default-600 text-sm md:text-base">
                    您确定要重置实例{" "}
                    <span className="font-semibold text-foreground">
                      "{tunnelInfo.name}"
                    </span>{" "}
                    的流量信息吗？
                  </p>
                  <p className="text-xs md:text-small text-warning">
                    ⚠️ 此操作仅重置流量统计，不影响其他配置。
                  </p>
                </ModalBody>
                <ModalFooter>
                  <Button
                    color="default"
                    variant="light"
                    onPress={onClose}
                    size="sm"
                  >
                    取消
                  </Button>

                  <Button
                    color="secondary"
                    size="sm"
                    isLoading={resetLoading}
                    onPress={handleReset}
                    startContent={<FontAwesomeIcon icon={faRecycle} />}
                  >
                    确认重置
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 隧道监控统计图 - 仅在实验模式下显示 */}
        {settings.isExperimentalMode && (
          <div className="mb-4">
            <TunnelStatsCharts 
              instanceId={tunnelInfo.instanceId}
              isExperimentalMode={settings.isExperimentalMode}
            />
          </div>
        )}

        {/* 流量统计卡片 - 非实验模式下显示 */}
        {!settings.isExperimentalMode && (
          <div
            className="grid gap-2 md:gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              maxWidth: "100%",
            }}
          >
            <Card className="p-1 md:p-2 bg-blue-50 dark:bg-blue-950/30 shadow-none">
              <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">
                    TCP 接收
                  </p>
                  <p className="text-xs md:text-sm lg:text-lg font-bold text-blue-700 dark:text-blue-300">
                    {(() => {
                      const { value, unit } = formatTrafficValue(
                        tunnelInfo.traffic.tcpRx
                      );
                      return `${value} ${unit}`;
                    })()}
                  </p>
                </div>
              </CardBody>
            </Card>

            <Card className="p-1 md:p-2 bg-green-50 dark:bg-green-950/30 shadow-none">
              <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">
                    TCP 发送
                  </p>
                  <p className="text-xs md:text-sm lg:text-lg font-bold text-green-700 dark:text-green-300">
                    {(() => {
                      const { value, unit } = formatTrafficValue(
                        tunnelInfo.traffic.tcpTx
                      );
                      return `${value} ${unit}`;
                    })()}
                  </p>
                </div>
              </CardBody>
            </Card>

            <Card className="p-1 md:p-2 bg-purple-50 dark:bg-purple-950/30 shadow-none">
              <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">
                    UDP 接收
                  </p>
                  <p className="text-xs md:text-sm lg:text-lg font-bold text-purple-700 dark:text-purple-300">
                    {(() => {
                      const { value, unit } = formatTrafficValue(
                        tunnelInfo.traffic.udpRx
                      );
                      return `${value} ${unit}`;
                    })()}
                  </p>
                </div>
              </CardBody>
            </Card>

            <Card className="p-1 md:p-2 bg-orange-50 dark:bg-orange-950/30 shadow-none">
              <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">
                    UDP 发送
                  </p>
                  <p className="text-xs md:text-sm lg:text-lg font-bold text-orange-700 dark:text-orange-300">
                    {(() => {
                      const { value, unit } = formatTrafficValue(
                        tunnelInfo.traffic.udpTx
                      );
                      return `${value} ${unit}`;
                    })()}
                  </p>
                </div>
              </CardBody>
            </Card>

            {tunnelInfo.traffic.ping !== null && (
              <Card className="p-1 md:p-2 bg-pink-50 dark:bg-pink-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-pink-600 dark:text-pink-400 mb-1">
                      端内延迟
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-pink-700 dark:text-pink-300">
                      {tunnelInfo.traffic.ping}ms
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {tunnelInfo.traffic.pool !== null && (
              <Card className="p-1 md:p-2 bg-cyan-50 dark:bg-cyan-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-1">
                      池连接数
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-cyan-700 dark:text-cyan-300">
                      {tunnelInfo.traffic.pool}
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

           

            {tunnelInfo.traffic.tcps !== null && (
              <Card className="p-1 md:p-2 bg-amber-50 dark:bg-amber-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                      TCP连接数
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-amber-700 dark:text-amber-300">
                      {tunnelInfo.traffic.tcps}
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {tunnelInfo.traffic.udps !== null && (
              <Card className="p-1 md:p-2 bg-teal-50 dark:bg-teal-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-teal-600 dark:text-teal-400 mb-1">
                      UDP连接数
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-teal-700 dark:text-teal-300">
                      {tunnelInfo.traffic.udps}
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        )}

        {/* 实例信息 - 合并配置信息 */}
        <Card className="p-2">
          <CardHeader className="flex items-center  justify-between pb-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">实例信息</h3>
            </div>
            <Tooltip content="编辑实例" placement="top">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                color="default"
                onClick={() => setEditModalOpen(true)}
                startContent={
                  <FontAwesomeIcon icon={faPen} className="text-xs" />
                }
              />
            </Tooltip>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {/* 基本信息 */}
                <CellValue
                  label="实例ID"
                  value={
                    <>
                      <div className="flex items-center gap-2">
                        {tunnelInfo.instanceId}
                        {/* 新增字段显示 */}
                        {tunnelInfo.config.mode != null && (
                          <Chip variant="flat" color="secondary" size="sm">
                            {getTunnelModeText(
                              tunnelInfo.type,
                              tunnelInfo.config.mode
                            )}
                          </Chip>
                        )}
                      </div>
                    </>
                  }
                />

                <CellValue
                  label="主控"
                  value={
                    <div className="flex items-center gap-2">
                      <Chip variant="bordered" color="default" size="sm">
                        {tunnelInfo.endpoint}
                      </Chip>
                      <Chip variant="flat" color="secondary" size="sm">
                        {tunnelInfo.endpointVersion || "< v1.4.0"}
                      </Chip>
                    </div>
                  }
                />

                <CellValue
                  label="隧道地址"
                  value={
                    <span className="font-mono text-sm">
                      {tunnelInfo.tunnelAddress}:{tunnelInfo.config.listenPort}
                    </span>
                  }
                />
                <CellValue
                  label="目标地址"
                  value={
                    <span className="font-mono text-sm">
                      {tunnelInfo.targetAddress}:{tunnelInfo.config.targetPort}
                    </span>
                  }
                />

                <CellValue
                  label="日志级别"
                  value={
                    <div className="flex items-center gap-2">
                      <Chip
                        variant="flat"
                        color={
                          tunnelInfo.config.logLevel === "inherit"
                            ? "primary"
                            : tunnelInfo.config.logLevel === "none"
                              ? "warning"
                              : "default"
                        }
                        size="sm"
                      >
                        {tunnelInfo.config.logLevel === "inherit"
                          ? tunnelInfo.config.endpointLog
                            ? `继承主控 [${tunnelInfo.config.endpointLog.toUpperCase()}]`
                            : "继承主控设置"
                          : tunnelInfo.config.logLevel === "none"
                            ? "无日志 [NONE]"
                            : tunnelInfo.config.logLevel.toUpperCase()}
                      </Chip>
                    </div>
                  }
                />
                {/* 配置信息字段 */}
                            {/* 仅客户端模式下显示 min/max */}
            {tunnelInfo.type === "client" && (
                  <CellValue
                    label="池最小值"
                    value={(() => {
                      const min =
                        tunnelInfo.config.min !== undefined &&
                        tunnelInfo.config.min !== null
                          ? tunnelInfo.config.min
                          : 64;
                      const max =
                        tunnelInfo.config.max !== undefined &&
                        tunnelInfo.config.max !== null
                          ? tunnelInfo.config.max
                          : 1024;
                      
                      return (
                        <span className="font-mono text-sm">
                          {min}
                          <span className="text-default-400 text-xs">
                            (min)
                          </span>
                        </span>
                      );
                    })()}
                  />
                )}
            {tunnelInfo.type === "server" && (
                  <CellValue
                    label="池最大值"
                    value={(() => {
                      const min =
                        tunnelInfo.config.min !== undefined &&
                        tunnelInfo.config.min !== null
                          ? tunnelInfo.config.min
                          : 64;
                      const max =
                        tunnelInfo.config.max !== undefined &&
                        tunnelInfo.config.max !== null
                          ? tunnelInfo.config.max
                          : 1024;
                      
                      return (
                        <span className="font-mono text-sm">
                          {max}
                          <span className="text-default-400 text-xs">
                            (max)
                          </span>
                        </span>
                      );
                    })()}
                  />
                )}
                
            {tunnelInfo.config.slot !== undefined && tunnelInfo.config.slot !== null && (
              <CellValue
                label="最大连接数限制"
                value={
                  <span className="font-mono text-sm">
                    {tunnelInfo.config.slot}
                  </span>
                }
              />
            )}
            
                            {/* 仅服务端模式显示TLS设置 */}
            {tunnelInfo.type === "server" && (
                  <>
                    <CellValue
                      label="TLS 设置"
                      value={
                        <div className="flex items-center gap-2">
                          <Chip
                            variant="flat"
                            color={
                              tunnelInfo.config.tlsMode === "inherit"
                                ? "primary"
                                : tunnelInfo.config.tlsMode === "0"
                                  ? "default"
                                  : "success"
                            }
                            size="sm"
                          >
                            {tunnelInfo.config.tlsMode === "inherit"
                              ? tunnelInfo.config.endpointTLS
                                ? `继承主控 [${getTLSModeText(tunnelInfo.config.endpointTLS)}]`
                                : "继承主控设置"
                              : tunnelInfo.config.tlsMode === "0"
                                ? "无 TLS 加密"
                                : tunnelInfo.config.tlsMode === "1"
                                  ? "自签名证书"
                                  : "自定义证书"}
                          </Chip>
                        </div>
                      }
                    />
                    {/* 当TLS模式为2时显示证书路径 */}
                    {tunnelInfo.config.tlsMode === "2" && (
                      <>
                        <CellValue
                          label="证书路径"
                          value={tunnelInfo.config.certPath || "未设置"}
                        />
                        <CellValue
                          label="密钥路径"
                          value={tunnelInfo.config.keyPath || "未设置"}
                        />
                      </>
                    )}
                  </>
                )}
                {/* 密码显示 - 仅在有密码时显示 */}
                {tunnelInfo.password && (
                  <CellValue
                    label="隧道密码"
                    value={
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs md:text-sm break-all text-default-500">
                          {isPasswordVisible ? tunnelInfo.password : "••••••••"}
                        </span>
                        <FontAwesomeIcon
                          icon={isPasswordVisible ? faEyeSlash : faEye}
                          className="text-xs cursor-pointer hover:text-primary w-4 text-default-500"
                          onClick={() =>
                            setIsPasswordVisible(!isPasswordVisible)
                          }
                        />
                      </div>
                    }
                  />
                )}

                {tunnelInfo.config.read && (
                  <CellValue
                    label="读取超时"
                    value={
                      <span className="font-mono text-sm text-default-600">
                        {tunnelInfo.config.read}
                      </span>
                    }
                  />
                )}

                {tunnelInfo.config.rate && (
                  <CellValue
                    label="速率限制"
                    value={
                      <span className="font-mono text-sm text-default-600">
                        {tunnelInfo.config.rate} 
                        <span className="text-default-400 text-xs">
                        Mbps
                        </span>
                      </span>
                    }
                  />
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 实例设置 */}
        <Card className="p-2">
          <CardHeader className="flex items-center justify-between pb-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">实例设置</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 左侧：开关设置项 */}
              <div className="space-y-4">
                {/* 自动重启配置 */}
                {tunnelInfo.endpointVersion && (
                  <CellValue
                    label="自动重启"
                    value={
                      <div className="flex items-center justify-center">
                        <Switch
                          size="sm"
                          isSelected={tunnelInfo.config.restart}
                          onValueChange={handleRestartToggle}
                          isDisabled={isUpdatingRestart}
                          endContent={
                            <span className="text-xs text-default-600">
                              禁用
                            </span>
                          }
                          startContent={
                            <span className="text-xs text-default-600">
                              启用
                            </span>
                          }
                          classNames={{
                            base: cn(
                              "inline-flex flex-row-reverse w-full max-w-md items-center",
                              "justify-between"
                            ),
                            wrapper: "p-0 h-6 w-14 overflow-visible",
                            thumb: cn(
                              "w-6 h-6 border-2 shadow-lg",
                              "group-data-[hover=true]:border-primary",
                              //selected
                              "group-data-[selected=true]:ms-8",
                              // pressed
                              "group-data-[pressed=true]:w-16",
                              "group-data-[selected]:group-data-[pressed]:ms-4"
                            ),
                          }}
                        />
                      </div>
                    }
                  />
                )}

                {/* 图表自动刷新 */}
                <CellValue
                  label="图表刷新"
                  value={
                    <div className="flex items-center justify-center">
                      <Switch
                        size="sm"
                        isSelected={isMetricsAutoRefreshEnabled}
                        onValueChange={toggleMetricsAutoRefresh}
                        endContent={
                          <span className="text-xs text-default-600">关闭</span>
                        }
                        startContent={
                          <span className="text-xs text-default-600">开启</span>
                        }
                        classNames={{
                          base: cn(
                            "inline-flex flex-row-reverse w-full max-w-md items-center",
                            "justify-between"
                          ),
                          wrapper: "p-0 h-6 w-14 overflow-visible",
                          thumb: cn(
                            "w-6 h-6 border-2 shadow-lg",
                            "group-data-[hover=true]:border-primary",
                            //selected
                            "group-data-[selected=true]:ms-8",
                            // pressed
                            "group-data-[pressed=true]:w-16",
                            "group-data-[selected]:group-data-[pressed]:ms-4"
                          ),
                        }}
                      />
                    </div>
                  }
                />

                {/* 保存Log日志 */}
                <CellValue
                  label="保存Log日志"
                  value={
                    <div className="flex items-center justify-center">
                      <Switch
                        size="sm"
                        isSelected={true}
                        isDisabled={true}
                        endContent={
                          <span className="text-xs text-default-600">关闭</span>
                        }
                        startContent={
                          <span className="text-xs text-default-600">开启</span>
                        }
                        classNames={{
                          base: cn(
                            "inline-flex flex-row-reverse w-full max-w-md items-center",
                            "justify-between"
                          ),
                          wrapper: "p-0 h-6 w-14 overflow-visible",
                          thumb: cn(
                            "w-6 h-6 border-2 shadow-lg",
                            "group-data-[hover=true]:border-primary",
                            //selected
                            "group-data-[selected=true]:ms-8",
                            // pressed
                            "group-data-[pressed=true]:w-16",
                            "group-data-[selected]:group-data-[pressed]:ms-4"
                          ),
                        }}
                      />
                    </div>
                  }
                />
              </div>

              {/* 右侧：操作按钮 */}
              <div>
                <div className="flex flex-col gap-3">
                  <Button
                    variant="flat"
                    color="secondary"
                    startContent={<FontAwesomeIcon icon={faHammer} />}
                    onClick={() => setResetModalOpen(true)}
                    isDisabled={resetLoading}
                    className="w-full h-7"
                    size="sm"
                  >
                    重置实例
                  </Button>
                  
                  <Button
                    variant="flat"
                    color="default"
                    startContent={<FontAwesomeIcon icon={faPen} />}
                    onClick={handleRenameClick}
                    className="w-full  h-7"
                    size="sm"
                  >
                    重命名
                  </Button>
                  <Button
                    variant="flat"
                    color="warning"
                    startContent={<FontAwesomeIcon icon={faBug} />}
                    className="w-full  h-7"
                    size="sm"
                    onClick={() => setTcpingModalOpen(true)}
                  >
                    诊断测试
                  </Button>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 命令行信息 */}
        <Accordion variant="shadow">
          <AccordionItem
            key="command"
            aria-label="命令行"
            title={<h3 className="text-lg font-semibold ps-1">命令行</h3>}
          >
            <div className="pb-4">
              <Snippet hideCopyButton={false} hideSymbol={true}>
                {tunnelInfo.commandLine}
              </Snippet>
            </div>
          </AccordionItem>
        </Accordion>

        {/* 迷你指标图表 - 两行布局 */}
        <div className="space-y-3">
          {/* 实验性功能：只显示流量累计和端内延迟 */}
          {settings.isExperimentalMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 流量累计 */}
              <Card className="p-2">
                <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-semibold">流量累计</h4>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: "hsl(217 91% 60%)" }}
                        ></div>
                        <span className="text-xs text-default-600">TCP入</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: "hsl(142 76% 36%)" }}
                        ></div>
                        <span className="text-xs text-default-600">TCP出</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: "hsl(262 83% 58%)" }}
                        ></div>
                        <span className="text-xs text-default-600">UDP入</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: "hsl(25 95% 53%)" }}
                        ></div>
                        <span className="text-xs text-default-600">UDP出</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onPress={() => openFullscreenChart("traffic", "流量累计")}
                    className="h-6 w-6 min-w-0"
                  >
                    <FontAwesomeIcon icon={faExpand} className="text-xs" />
                  </Button>
                </CardHeader>
                <CardBody className="pt-0 px-2 pb-2">
                  <div className="h-[140px]">
                    <DetailedTrafficChart
                      data={transformDetailedTrafficData(metricsData?.data)}
                      height={140}
                      loading={metricsLoading && !metricsData}
                      error={metricsError || undefined}
                      className="h-full w-full"
                    />
                  </div>
                </CardBody>
              </Card>

              {/* 端内延迟 */}
              <Card className="p-2">
                <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">端内延迟</h4>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onPress={() => openFullscreenChart("latency", "端内延迟")}
                    className="h-6 w-6 min-w-0"
                  >
                    <FontAwesomeIcon icon={faExpand} className="text-xs" />
                  </Button>
                </CardHeader>
                <CardBody className="pt-0 px-2 pb-2">
                  <div className="h-[140px]">
                    <LatencyChart
                      data={transformLatencyData(metricsData?.data)}
                      height={140}
                      loading={metricsLoading && !metricsData}
                      error={metricsError || undefined}
                      className="h-full w-full"
                    />
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : (
            <>
              {/* 第一行：流量用量和速率 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 详细流量趋势 - 四条线 */}
                <Card className="p-2">
                  <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-semibold">流量累计</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(217 91% 60%)" }}
                          ></div>
                          <span className="text-xs text-default-600">TCP入</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(142 76% 36%)" }}
                          ></div>
                          <span className="text-xs text-default-600">TCP出</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(262 83% 58%)" }}
                          ></div>
                          <span className="text-xs text-default-600">UDP入</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(25 95% 53%)" }}
                          ></div>
                          <span className="text-xs text-default-600">UDP出</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => openFullscreenChart("traffic", "流量累计")}
                      className="h-6 w-6 min-w-0"
                    >
                      <FontAwesomeIcon icon={faExpand} className="text-xs" />
                    </Button>
                  </CardHeader>
                  <CardBody className="pt-0 px-2 pb-2">
                    <div className="h-[140px]">
                      <DetailedTrafficChart
                        data={transformDetailedTrafficData(metricsData?.data)}
                        height={140}
                        loading={metricsLoading && !metricsData}
                        error={metricsError || undefined}
                        className="h-full w-full"
                      />
                    </div>
                  </CardBody>
                </Card>

                {/* 速度趋势 */}
                <Card className="p-2">
                  <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-semibold">传输速率</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(220 70% 50%)" }}
                          ></div>
                          <span className="text-xs text-default-600">上传</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(280 65% 60%)" }}
                          ></div>
                          <span className="text-xs text-default-600">下载</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => openFullscreenChart("speed", "传输速率")}
                      className="h-6 w-6 min-w-0"
                    >
                      <FontAwesomeIcon icon={faExpand} className="text-xs" />
                    </Button>
                  </CardHeader>
                  <CardBody className="pt-0 px-2 pb-2">
                    <div className="h-[140px]">
                      <SpeedChart
                        data={transformSpeedData(metricsData?.data)}
                        height={140}
                        loading={metricsLoading && !metricsData}
                        error={metricsError || undefined}
                        className="h-full w-full"
                      />
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* 第二行：延迟和连接池 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 延迟 */}
                <Card className="p-2">
                  <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">端内延迟</h4>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => openFullscreenChart("latency", "端内延迟")}
                      className="h-6 w-6 min-w-0"
                    >
                      <FontAwesomeIcon icon={faExpand} className="text-xs" />
                    </Button>
                  </CardHeader>
                  <CardBody className="pt-0 px-2 pb-2">
                    <div className="h-[140px]">
                      <LatencyChart
                        data={transformLatencyData(metricsData?.data)}
                        height={140}
                        loading={metricsLoading && !metricsData}
                        error={metricsError || undefined}
                        className="h-full w-full"
                      />
                    </div>
                  </CardBody>
                </Card>
                {/* 连接数趋势 */}
                <Card className="p-2">
                  <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-semibold">连接数量</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(340 75% 55%)" }}
                          ></div>
                          <span className="text-xs text-default-600">池</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(24 70% 50%)" }}
                          ></div>
                          <span className="text-xs text-default-600">TCP</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: "hsl(173 58% 39%)" }}
                          ></div>
                          <span className="text-xs text-default-600">UDP</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      isIconOnly
                      onPress={() => openFullscreenChart("connections", "连接数")}
                      className="h-6 w-6 min-w-0"
                    >
                      <FontAwesomeIcon icon={faExpand} className="text-xs" />
                    </Button>
                  </CardHeader>
                  <CardBody className="pt-0 px-2 pb-2">
                    <div className="h-[140px]">
                      <ConnectionsChart
                        data={transformConnectionsData(metricsData?.data)}
                        height={140}
                        loading={metricsLoading && !metricsData}
                        error={metricsError || undefined}
                        className="h-full w-full"
                      />
                    </div>
                  </CardBody>
                </Card>
              </div>
            </>
          )}
        </div>

        {/* 流量趋势图 - 暂时隐藏 */}
        {/* <Card className="p-2">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">流量趋势</h3>              
              <Tooltip content="基于 Nezha 风格分钟级聚合数据，每15秒自动刷新" placement="right">
                <FontAwesomeIcon 
                  icon={faQuestionCircle} 
                  className="text-default-400 hover:text-default-600 cursor-help text-xs"
                />
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-2">
           <Button
              size="sm"
              variant="flat"
              isIconOnly
              onPress={refreshMetrics}
              isLoading={metricsLoading}
              className="h-7 w-7 min-w-0"
            >
                <FontAwesomeIcon icon={faRefresh} className="text-xs" />
            </Button>
            
           <Tabs 
              selectedKey={trafficTimeRange}
              onSelectionChange={(key) => setTrafficTimeRange(key as "1h" | "6h" | "12h" | "24h")}
              size="sm"
              variant="light"
              classNames={{
                tabList: "gap-1",
                tab: "text-xs px-2 py-1 min-w-0 h-7",
                tabContent: "text-xs"
              }}
            >
              <Tab key="1h" title="1小时" />
              <Tab key="6h" title="6小时" />
              <Tab key="12h" title="12小时" />
              <Tab key="24h" title="24小时" />
            </Tabs>
          </div>
        </CardHeader>
        <CardBody>
          <div className="h-[250px] md:h-[300px]">
            <EnhancedMetricsChart
              apiData={metricsData?.data || null}
              type="traffic"
              height={0}
              timeRange={trafficTimeRange}
              showLegend={true}
              loading={metricsLoading && !metricsData}
              error={metricsError || undefined}
              className="h-full w-full"
              maxDataPoints={500}
            />
          </div>
        </CardBody>
      </Card> */}

        {/* 端内延迟 - 使用 Nezha 风格图表 - 暂时隐藏 */}
        {/* <LatencyChart
        apiData={metricsData?.data || null}
        loading={metricsLoading && !metricsData}
        error={metricsError || undefined}
        height={250}
        title="延迟"
        className="w-full"
        onRefresh={refreshMetrics}
        refreshLoading={metricsLoading}
        timeRange={pingTimeRange}
        onTimeRangeChange={setPingTimeRange}
      /> */}

        {/* 日志 - 独立Card */}
        <Card className="p-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 sm:pb-0 gap-2 sm:gap-0">
            {/* 第一行：标题和实时开关 */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">日志</h3>
                {/* <Chip variant="flat" color="primary" size="sm">
                  {logCount} 条记录 {logDate ? `(${logDate})` : ''}
                </Chip> */}
              </div>
              
              {/* 实时日志开关 - 移动端第一行，桌面端第二行 */}
              <div className="flex items-center gap-2 sm:hidden">
                <span className="text-xs text-default-600">实时</span>
                <Switch
                  size="sm"
                  isSelected={isRealtimeLogging}
                  onValueChange={handleRealtimeLoggingToggle}
                  color="primary"
                />
              </div>
            </div>
            
            {/* 第二行：剩余控件 */}
            <div className="flex items-center justify-start sm:justify-end gap-2 overflow-x-auto">
              {/* 实时日志开关 - 桌面端显示 */}
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <span className="text-sm text-default-600">实时输出</span>
                <Switch
                  size="sm"
                  isSelected={isRealtimeLogging}
                  onValueChange={handleRealtimeLoggingToggle}
                  color="primary"
                />
              </div>
              
              {/* 日期选择 */}
              <DatePicker
                size="sm"
                className="w-40 flex-shrink-0"
                isDisabled={isRealtimeLogging}
                value={selectedLogDate ? parseDate(selectedLogDate) : null}
                onChange={(date) => {
                  if (!isRealtimeLogging && date) {
                    const newDate = date.toString();
                    handleLogDateChange(newDate);
                  }
                }}
                isDateUnavailable={(date) => {
                  // 允许选择任何日期，让FileLogViewer来处理日志获取
                  return false;
                }}
                showMonthAndYearPickers
                granularity="day"
              />

              {/* 操作按钮组 */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* 刷新按钮 */}
                <Tooltip content="刷新日志" placement="top">
                  <Button
                    size="sm"
                    variant="flat"
                    isIconOnly
                    onPress={handleLogRefresh}
                    isLoading={logLoading}
                    isDisabled={isRealtimeLogging}
                    className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                  >
                    <FontAwesomeIcon icon={faRefresh} className="text-xs" />
                  </Button>
                </Tooltip>

                {/* 滚动到底部按钮 */}
                <Tooltip content="滚动到底部" placement="top">
                  <Button
                    size="sm"
                    variant="flat"
                    isIconOnly
                    onPress={() => {
                      if ((window as any).fileLogViewerRef) {
                        (window as any).fileLogViewerRef.scrollToBottom();
                      }
                    }}
                    className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                  >
                    <FontAwesomeIcon icon={faArrowDown} className="text-xs" />
                  </Button>
                </Tooltip>

                {/* 导出按钮 */}
                <Tooltip content="导出日志文件" placement="top">
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    isIconOnly
                    onPress={handleExport}
                    isLoading={exportLoading}
                    isDisabled={exportLoading || isRealtimeLogging}
                    className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                  >
                    <FontAwesomeIcon icon={faDownload} className="text-xs" />
                  </Button>
                </Tooltip>

                {/* 清空按钮 */}
                <Popover
                  placement="bottom"
                  isOpen={clearPopoverOpen}
                  onOpenChange={setClearPopoverOpen}
                >
                  <PopoverTrigger>
                    <Button
                      size="sm"
                      variant="flat"
                      color="danger"
                      isIconOnly
                      isLoading={logClearing}
                      className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-3">
                    <div className="space-y-3">
                      <p className="text-sm font-medium">确认清空日志</p>
                      <p className="text-xs text-default-500">
                        {isRealtimeLogging 
                          ? "此操作将清空当前实时输出的内容。" 
                          : "此操作将清空页面显示和所有已保存的日志文件，且不可撤销。"}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          color="danger"
                          onPress={() => {
                            if ((window as any).fileLogViewerRef) {
                              if (isRealtimeLogging) {
                                // 实时模式：只清空显示内容
                                (window as any).fileLogViewerRef.clearDisplay();
                              } else {
                                // 非实时模式：调用清除接口
                                (window as any).fileLogViewerRef.clear();
                              }
                            }
                            setClearPopoverOpen(false); // 关闭Popover
                          }}
                          className="flex-1"
                        >
                          确认清空
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => setClearPopoverOpen(false)} // 关闭Popover
                          className="flex-1"
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <FileLogViewer
              endpointId={tunnelInfo?.endpointId || ""}
              instanceId={tunnelInfo?.instanceId || ""}
              date={logDate}
              onDateChange={setLogDate}
              onLoadingChange={setLogLoading}
              onClearingChange={setLogClearing}
              triggerRefresh={logRefreshTrigger}
              onClearLogs={handleLogClear}
              isRealtimeMode={isRealtimeLogging}
            />
          </CardBody>
        </Card>
      </div>

      {/* 编辑实例模态框 */}
      {editModalOpen && tunnelInfo && (
        <SimpleCreateTunnelModal
          isOpen={editModalOpen}
          onOpenChange={setEditModalOpen}
          mode="edit"
          editData={{
            // SimpleCreateTunnelModal 需要的字段整理
            id: tunnelInfo.id,
            endpointId: tunnelInfo.endpointId,
            type: tunnelInfo.type, // 已经是英文类型，直接使用
            name: tunnelInfo.name,
            tunnelAddress: tunnelInfo.tunnelAddress,
            tunnelPort: String(tunnelInfo.config.listenPort),
            targetAddress: tunnelInfo.targetAddress,
            targetPort: String(tunnelInfo.config.targetPort),
            tlsMode: tunnelInfo.config.tlsMode,
            logLevel: tunnelInfo.config.logLevel,
            password: tunnelInfo.password,
            min: tunnelInfo.config.min,
            max: tunnelInfo.config.max,
            slot: tunnelInfo.config.slot,
            certPath: tunnelInfo.config.certPath,
            keyPath: tunnelInfo.config.keyPath,
            // 新增字段
            read: tunnelInfo.config.read,
            rate: tunnelInfo.config.rate,
            mode: tunnelInfo.config.mode,
          }}
          onSaved={() => {
            setEditModalOpen(false);
            fetchTunnelDetails();
          }}
        />
      )}

      {/* 重命名模态框 */}
      <RenameTunnelModal
        isOpen={isRenameModalOpen}
        onOpenChange={setIsRenameModalOpen}
        tunnelId={tunnelInfo?.id || 0}
        currentName={tunnelInfo?.name || ""}
        onRenamed={handleRenameSuccess}
      />

      {/* 全屏图表模态 */}
      <FullscreenChartModal
        isOpen={fullscreenModalOpen}
        onOpenChange={setFullscreenModalOpen}
        chartType={fullscreenChartType}
        title={fullscreenChartTitle}
        trafficData={transformTrafficData(metricsData?.data)}
        speedData={transformSpeedData(metricsData?.data)}
        poolData={transformPoolData(metricsData?.data)}
        connectionsData={transformConnectionsData(metricsData?.data)}
        latencyData={transformLatencyData(metricsData?.data)}
        loading={metricsLoading}
        error={metricsError || undefined}
        onRefresh={refreshMetrics}
      />

      {/* TCPing诊断测试模态框 */}
      <Modal
        isOpen={tcpingModalOpen}
        onOpenChange={(open) => {
          setTcpingModalOpen(open);
          if (!open) {
            setTcpingTarget("");
            setTcpingResult(null);
            setTcpingLoading(false);
          }
        }}
        placement="center"
        size="lg"
        hideCloseButton={tcpingLoading}
        isDismissable={!tcpingLoading}
      >
        <ModalContent className="min-h-[400px]">
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faBug} className="text-primary" />
                  网络诊断测试
                </div>
              </ModalHeader>
              
              {tcpingLoading ? (
                // 加载状态 - 充斥整个模态窗内容
                <ModalBody className="flex-1 flex items-center justify-center py-12">
                  <div className="flex flex-col items-center space-y-4">
                    <Spinner size="lg" color="primary" />
                    <p className="text-default-600 animate-pulse">正在进行连通性测试...</p>
                    <p className="text-xs text-default-400">目标地址: {tcpingTarget}</p>
                  </div>
                </ModalBody>
              ) : tcpingResult ? (
                // 结果显示状态
                <ModalBody className="py-6">
                  <div className="space-y-6">
                    {/* 测试结果卡片 */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg p-6 border border-default-200">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-3 h-3 rounded-full ${tcpingResult.connected ? 'bg-success animate-pulse' : 'bg-danger'}`}></div>
                        <h3 className="text-lg font-semibold">测试结果</h3>
                      </div>
                      
                      {/* 目标地址 */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-default-500 mb-1">目标地址</p>
                          <p className="font-mono text-sm text-primary">{tcpingResult.target}</p>
                        </div>
                        <div>
                          <p className="text-xs text-default-500 mb-1">连接状态</p>
                          <Chip
                            variant="flat"
                            color={tcpingResult.connected ? "success" : "danger"}
                            className="text-xs"
                          >
                            {tcpingResult.connected ? "✓ 连接成功" : "✗ 连接失败"}
                          </Chip>
                        </div>
                      </div>

                      {/* 始终显示统计信息，无论成功还是失败 */}
                      <div className="space-y-4">
                          {/* 丢包率和网络质量评估 */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-default-500 mb-1">丢包率</p>
                              <div className="flex items-center gap-2">
                                <span className={`text-lg font-bold ${(tcpingResult.packetLoss || 0) === 0 ? 'text-success' : (tcpingResult.packetLoss || 0) < 20 ? 'text-warning' : 'text-danger'}`}>
                                  {tcpingResult.packetLoss?.toFixed(1) || '0.0'}
                                </span>
                                <span className="text-sm text-default-600">%</span>
                              </div>
                            </div>
                            {tcpingResult.avgLatency && (
                              <div>
                                <p className="text-xs text-default-500 mb-1">网络质量</p>
                                <Chip
                                  variant="flat"
                                  color={getLatencyQuality(tcpingResult.avgLatency).color as any}
                                  className="text-xs"
                                >
                                  {getLatencyQuality(tcpingResult.avgLatency).text}
                                </Chip>
                              </div>
                            )}
                          </div>

                          {/* 延迟统计 - 始终显示，空值显示为 - */}
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-default-500 mb-1">最快响应</p>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-bold text-success">
                                  {tcpingResult.minLatency ? tcpingResult.minLatency : '-'}
                                </span>
                                {tcpingResult.minLatency && <span className="text-xs text-default-600">ms</span>}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-default-500 mb-1">平均响应</p>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-bold text-primary">
                                  {tcpingResult.avgLatency ? tcpingResult.avgLatency.toFixed(1) : '-'}
                                </span>
                                {tcpingResult.avgLatency && <span className="text-xs text-default-600">ms</span>}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-default-500 mb-1">最慢响应</p>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-bold text-warning">
                                  {tcpingResult.maxLatency ? tcpingResult.maxLatency : '-'}
                                </span>
                                {tcpingResult.maxLatency && <span className="text-xs text-default-600">ms</span>}
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
                                    transform: 'translateX(-50%)'
                                  }}
                                >
                                  <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                                </div>
                              </div>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* 重新测试按钮 */}
                    <div className="flex gap-2">
                      <Button
                        color="primary"
                        onPress={() => {
                          setTcpingResult(null);
                          handleTcpingTest();
                        }}
                        className="flex-1"
                      >
                        重新测试
                      </Button>
                      <Button
                        variant="flat"
                        onPress={onClose}
                        className="flex-1"
                      >
                        关闭
                      </Button>
                    </div>
                  </div>
                </ModalBody>
              ) : (
                // 空状态 - 正在启动
                <ModalBody className="flex-1 flex items-center justify-center py-12">
                  <div className="flex flex-col items-center space-y-4">
                    <Spinner size="lg" color="primary" />
                    <p className="text-default-600 animate-pulse">正在进行连通性测试...</p>
                    <p className="text-xs text-default-400">目标地址: {tunnelInfo.targetAddress}:{tunnelInfo.config.targetPort}</p>
                  </div>
                </ModalBody>
              )}
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
