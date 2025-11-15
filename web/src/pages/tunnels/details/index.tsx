import {
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
  Popover,
  PopoverTrigger,
  PopoverContent,
  Spinner,
  DatePicker,
  Divider,
} from "@heroui/react";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlay,
  faRotateRight,
  faTrash,
  faRefresh,
  faStop,
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
import { addToast } from "@heroui/toast";
import { useSearchParams } from "react-router-dom";
import { parseDate } from "@internationalized/date";
import { Icon } from "@iconify/react";

import { FullscreenChartModal } from "./fullscreen-chart-modal";
import CellValue from "./cell-value";
import OriginalCellValue from "./original-cell-value";

import { Snippet } from "@/components/ui/snippet";
// 引入 SimpleCreateTunnelModal 组件
import SimpleCreateTunnelModal from "@/components/tunnels/simple-create-tunnel-modal";
import RenameTunnelModal from "@/components/tunnels/rename-tunnel-modal";
import InstanceTagModal from "@/components/tunnels/instance-tag-modal";
import { TrafficStatsCard } from "@/components/tunnels/traffic-stats-card";
import { ConnectionsStatsCard } from "@/components/tunnels/connections-stats-card";
import { NetworkQualityCard } from "@/components/tunnels/network-quality-card";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { DetailedTrafficChart } from "@/components/ui/detailed-traffic-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { ConnectionsChart } from "@/components/ui/connections-chart";
import { LatencyChart } from "@/components/ui/latency-chart";
import { FileLogViewer } from "@/components/ui/file-log-viewer";
import { useTunnelSSE } from "@/lib/hooks/use-sse";
import { useMetricsTrend } from "@/lib/hooks/use-metrics-trend";
import TunnelStatsCharts from "@/components/ui/tunnel-stats-charts";
import { useSettings } from "@/components/providers/settings-provider";

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

interface TunnelInfo {
  id: number;
  instanceId: string;
  name: string;
  type: "server" | "client"; // 统一使用英文类型
  status: "success" | "danger" | "warning"; // 简化为字符串
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
  targetPort: number;
  tlsMode: string;
  commandLine: string;
  configLine: string; // 新增字段
  config: any; // 解析后的配置对象
  tags: { [key: string]: string }; // 改为对象形式
  tunnelAddress: string;
  targetAddress: string;
  // traffic 数据扁平化到根级别
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
  instanceTags?: { [key: string]: string }; // 兼容原有逻辑，改为对象形式
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
      console.log("[隧道详情] 接收到的数据:", data);
      setTunnelInfo({
        ...data,
        instanceTags: data.tags || {}, // 现在是map格式
      });

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
  const [showConfigLine, setShowConfigLine] = React.useState(false);
  // 实例标签模态控制
  const [isInstanceTagModalOpen, setIsInstanceTagModalOpen] =
    React.useState(false);

  // 是否移入回收站
  const [moveToRecycle, setMoveToRecycle] = React.useState(false);

  // 自动重启开关状态更新
  const [isUpdatingRestart, setIsUpdatingRestart] = React.useState(false);

  // 文件日志相关状态
  const [logDate, setLogDate] = React.useState<string>(""); // 改为logDate
  const [availableLogDates, setAvailableLogDates] = React.useState<string[]>(
    [],
  ); // 新增：可用日志日期列表
  const [logLoading, setLogLoading] = React.useState(false);
  const [logClearing, setLogClearing] = React.useState(false);
  const [logRefreshTrigger, setLogRefreshTrigger] = React.useState(0);
  const [clearPopoverOpen, setClearPopoverOpen] = React.useState(false);
  const [exportLoading, setExportLoading] = React.useState(false);
  const [resetModalOpen, setResetModalOpen] = React.useState(false);
  const [selectedStatsTab, setSelectedStatsTab] =
    React.useState<string>("traffic");
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
  const [selectedLogDate, setSelectedLogDate] = React.useState<string | null>(
    null,
  );

  // 打开全屏图表的函数
  const openFullscreenChart = (
    type: "traffic" | "speed" | "pool" | "connections" | "latency",
    title: string,
  ) => {
    setFullscreenChartType(type);
    setFullscreenChartTitle(title);
    setFullscreenModalOpen(true);
  };

  // 根据时间范围过滤数据 - 使用useMemo优化，避免每次渲染都重新创建
  const filterDataByTimeRange = React.useMemo(
    () =>
      (data: TrafficTrendData[], timeRange: "1h" | "6h" | "12h" | "24h") => {
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
    [],
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
    [],
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
    [],
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
      }),
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
      }),
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

  const transformLatencyData = React.useCallback((apiData: any) => {
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
        },
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
      const today = new Date().toISOString().split("T")[0];

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
    if (tunnelInfo?.endpoint?.id && tunnelInfo?.instanceId && !logDate) {
      initializeLogDate();
    }
  }, [
    tunnelInfo?.endpoint?.id,
    tunnelInfo?.instanceId,
    logDate,
    initializeLogDate,
  ]);

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
  const sseOnMessage = React.useCallback(
    (data: any) => {
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
                  status: data.status === "running" ? "success" : "danger",
                }
              : null,
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
                  // traffic 数据扁平化到根级别
                  tcpRx: data.tcpRx,
                  tcpTx: data.tcpTx,
                  udpRx: data.udpRx,
                  udpTx: data.udpTx,
                  pool: data.pool || prev.pool,
                  ping: data.ping || prev.ping,
                  tcps: data.tcps || prev.tcps,
                  udps: data.udps || prev.udps,
                }
              : null,
          );
        }
      }
    },
    [isRealtimeLogging],
  );

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

    const isRunning = tunnelInfo.status === "success";

    toggleStatus(isRunning, {
      tunnelId: tunnelInfo.id.toString(),
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                status: newStatus ? "success" : "danger",
              }
            : null,
        );
      },
    });
  };

  const handleRestart = () => {
    if (!tunnelInfo) return;

    restart({
      tunnelId: tunnelInfo.id.toString(),
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo((prev) =>
          prev
            ? {
                ...prev,
                status: "success",
              }
            : null,
        );
      },
    });
  };

  const handleDelete = () => {
    if (!tunnelInfo) return;

    deleteTunnel({
      tunnelId: tunnelInfo.id.toString(),
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      redirectAfterDelete: true,
      recycle: moveToRecycle,
    });
  };

  const handleDeleteClick = () => {
    onOpen();
  };

  // 处理实例标签模态框
  const handleInstanceTagClick = () => {
    setIsInstanceTagModalOpen(true);
  };

  const handleInstanceTagSaved = () => {
    // 刷新隧道信息以获取最新的标签数据
    if (tunnelInfo) {
      fetchTunnelDetails();
    }
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
                restart: newRestartValue,
              }
            : null,
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
    const targetAddress = `${tunnelInfo.targetAddress}:${tunnelInfo.targetPort}`;

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
  const handleRealtimeLoggingToggle = React.useCallback(
    async (enabled: boolean) => {
      setIsRealtimeLogging(enabled);

      if (enabled) {
        // 开启实时日志：直接清空日志显示，不调用清除接口
        if (
          (window as any).fileLogViewerRef &&
          (window as any).fileLogViewerRef.clearDisplay
        ) {
          (window as any).fileLogViewerRef.clearDisplay();
        }
        // 保持selectedLogDate不变，但显示为禁用状态
      } else {
        // 关闭实时日志：恢复到历史日志模式，默认选择今天
        const today = new Date().toISOString().split("T")[0];

        setLogDate(today);
        setSelectedLogDate(today);
        setLogRefreshTrigger((prev) => prev + 1);
      }
    },
    [],
  );

  // 处理日期选择变更（仅在非实时模式下有效）
  const handleLogDateChange = React.useCallback(
    async (date: string | null) => {
      if (isRealtimeLogging) return; // 实时模式下不允许选择日期

      setSelectedLogDate(date);

      // 触发FileLogViewer刷新以加载新日期的日志
      if (date) {
        setLogDate(date);
        setLogRefreshTrigger((prev) => prev + 1);
      }
    },
    [isRealtimeLogging],
  );

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
    setTunnelInfo((prev) => (prev ? { ...prev, name: newName } : null));
  };

  // 如果正在加载或没有数据，显示加载状态
  if (loading || !tunnelInfo) {
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
              {tunnelInfo.name}
            </h1>
            <Chip
              color={tunnelInfo.type === "server" ? "primary" : "secondary"}
              variant="flat"
            >
              {tunnelInfo.type === "server" ? "服务端" : "客户端"}
            </Chip>
            <Chip
              className="flex-shrink-0"
              color={tunnelInfo.status}
              variant="flat"
            >
              {getStatusText(tunnelInfo.status)}
            </Chip>
          </div>

          {/* 操作按钮组 - 桌面端显示 */}
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <Button
              className="flex-shrink-0"
              color={
                tunnelInfo.status === "success" ? "warning" : "success"
              }
              startContent={
                <FontAwesomeIcon
                  icon={tunnelInfo.status === "success" ? faStop : faPlay}
                />
              }
              variant="flat"
              onPress={handleToggleStatus}
            >
              {tunnelInfo.status === "success" ? "停止" : "启动"}
            </Button>
            <Button
              className="flex-shrink-0"
              color="primary"
              isDisabled={tunnelInfo.status !== "success"}
              startContent={<FontAwesomeIcon icon={faRotateRight} />}
              variant="flat"
              onPress={handleRestart}
            >
              重启
            </Button>
            <Button
              className="flex-shrink-0"
              color="danger"
              startContent={<FontAwesomeIcon icon={faTrash} />}
              variant="flat"
              onPress={handleDeleteClick}
            >
              删除
            </Button>
            <Button
              className="flex-shrink-0"
              color="secondary"
              isDisabled={resetLoading}
              startContent={<FontAwesomeIcon icon={faHammer} />}
              variant="flat"
              onPress={()=> setResetModalOpen(true)}
            >
              重置
            </Button>
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
              color={
                tunnelInfo.status === "success" ? "warning" : "success"
              }
              size="sm"
              startContent={
                <FontAwesomeIcon
                  icon={tunnelInfo.status === "success" ? faStop : faPlay}
                />
              }
              variant="flat"
              onClick={handleToggleStatus}
            >
              {tunnelInfo.status === "success" ? "停止" : "启动"}
            </Button>
            <Button
              className="flex-shrink-0"
              color="primary"
              isDisabled={tunnelInfo.status !== "success"}
              size="sm"
              startContent={<FontAwesomeIcon icon={faRotateRight} />}
              variant="flat"
              onClick={handleRestart}
            >
              重启
            </Button>
            <Button
              className="flex-shrink-0"
              color="danger"
              size="sm"
              startContent={<FontAwesomeIcon icon={faTrash} />}
              variant="flat"
              onClick={handleDeleteClick}
            >
              删除
            </Button>
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

        {/* 删除确认模态框 */}
        <Modal isOpen={isOpen} placement="center" onOpenChange={onOpenChange}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon className="text-danger" icon={faTrash} />
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
                    size="sm"
                    variant="light"
                    onPress={onClose}
                  >
                    取消
                  </Button>
                  <Button
                    color="danger"
                    size="sm"
                    startContent={<FontAwesomeIcon icon={faTrash} />}
                    onPress={() => {
                      handleDelete();
                      onClose();
                      setMoveToRecycle(false);
                    }}
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
          placement="center"
          onOpenChange={setResetModalOpen}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon
                      className="text-secondary"
                      icon={faRecycle}
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
                    size="sm"
                    variant="light"
                    onPress={onClose}
                  >
                    取消
                  </Button>

                  <Button
                    color="secondary"
                    isLoading={resetLoading}
                    size="sm"
                    startContent={<FontAwesomeIcon icon={faRecycle} />}
                    onPress={handleReset}
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
        {/* 新的流量统计卡片 - 非实验模式下显示 */}
        {!settings.isExperimentalMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TrafficStatsCard
              formatTrafficValue={formatTrafficValue}
              trafficData={{
                tcpRx: tunnelInfo.tcpRx,
                tcpTx: tunnelInfo.tcpTx,
                udpRx: tunnelInfo.udpRx,
                udpTx: tunnelInfo.udpTx,
                pool: tunnelInfo.pool,
                ping: tunnelInfo.ping,
                tcps: tunnelInfo.tcps,
                udps: tunnelInfo.udps,
              }}
            />
            <ConnectionsStatsCard
              connectionsData={{
                pool: tunnelInfo.pool,
                tcps: tunnelInfo.tcps,
                udps: tunnelInfo.udps,
              }}
            />
            <NetworkQualityCard
              networkData={{
                ping: tunnelInfo.ping,
                pool: tunnelInfo.pool,
              }}
            />
          </div>
        )}
        {/* 流量统计卡片 */}
        {false && (
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
                        tunnelInfo.tcpRx,
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
                        tunnelInfo.tcpTx,
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
                        tunnelInfo.udpRx,
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
                        tunnelInfo.udpTx,
                      );

                      return `${value} ${unit}`;
                    })()}
                  </p>
                </div>
              </CardBody>
            </Card>

            {tunnelInfo.ping !== null && (
              <Card className="p-1 md:p-2 bg-pink-50 dark:bg-pink-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-pink-600 dark:text-pink-400 mb-1">
                      端内延迟
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-pink-700 dark:text-pink-300">
                      {tunnelInfo.ping}ms
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {tunnelInfo.pool !== null && (
              <Card className="p-1 md:p-2 bg-cyan-50 dark:bg-cyan-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-1">
                      池连接数
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-cyan-700 dark:text-cyan-300">
                      {tunnelInfo.pool}
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {tunnelInfo.tcps !== null && (
              <Card className="p-1 md:p-2 bg-amber-50 dark:bg-amber-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                      TCP连接数
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-amber-700 dark:text-amber-300">
                      {tunnelInfo.tcps}
                    </p>
                  </div>
                </CardBody>
              </Card>
            )}

            {tunnelInfo.udps !== null && (
              <Card className="p-1 md:p-2 bg-teal-50 dark:bg-teal-950/30 shadow-none">
                <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-xs text-teal-600 dark:text-teal-400 mb-1">
                      UDP连接数
                    </p>
                    <p className="text-xs md:text-sm lg:text-lg font-bold text-teal-700 dark:text-teal-300">
                      {tunnelInfo.udps}
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
                color="default"
                size="sm"
                startContent={
                  <FontAwesomeIcon className="text-xs" icon={faPen} />
                }
                variant="light"
                onClick={() => setEditModalOpen(true)}
              />
            </Tooltip>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {/* 基本信息 */}
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:hash"
                      width={18}
                    />
                  }
                  label="实例ID"
                  value={tunnelInfo.instanceId}
                />

                {tunnelInfo.mode != null && (
                  <CellValue
                    icon={
                      <Icon
                        className="text-default-600"
                        height={18}
                        icon="tabler:adjustments"
                        width={18}
                      />
                    }
                    label="模式"
                    value={
                      <Chip color="primary" size="sm" variant="flat">
                        {getTunnelModeText(
                          tunnelInfo.type,
                          tunnelInfo.mode,
                        )}
                      </Chip>
                    }
                  />
                )}

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:server"
                      width={18}
                    />
                  }
                  label="主控"
                  value={tunnelInfo.endpoint.name}
                />

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:git-branch"
                      width={18}
                    />
                  }
                  label="版本号"
                  value={
                    <Chip color="secondary" size="sm" variant="flat">
                      {tunnelInfo.endpoint.version || "< v1.4.0"}
                    </Chip>
                  }
                />

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:link"
                      width={18}
                    />
                  }
                  label="隧道地址"
                  value={
                    <span className="font-mono text-sm">
                      {tunnelInfo.tunnelAddress}:{tunnelInfo.listenPort}
                    </span>
                  }
                />
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:target"
                      width={18}
                    />
                  }
                  label="目标地址"
                  value={
                    <span className="font-mono text-sm">
                      {tunnelInfo.targetAddress}:{tunnelInfo.targetPort}
                    </span>
                  }
                />

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:file-text"
                      width={18}
                    />
                  }
                  label="日志级别"
                  value={
                    <div className="flex items-center gap-2">
                      <Chip
                        color={
                          tunnelInfo.logLevel === "inherit"
                            ? "primary"
                            : tunnelInfo.logLevel === "none"
                              ? "warning"
                              : "default"
                        }
                        size="sm"
                        variant="flat"
                      >
                        {tunnelInfo.logLevel === "inherit" ||
                        tunnelInfo.logLevel === ""
                          ? tunnelInfo.endpoint.log
                            ? `继承主控 [${tunnelInfo.endpoint.log.toUpperCase()}]`
                            : "继承主控"
                          : tunnelInfo.logLevel === "none"
                            ? "无日志 [NONE]"
                            : tunnelInfo.logLevel.toUpperCase()}
                      </Chip>
                    </div>
                  }
                />
                {/* 配置信息字段 */}
                {/* 仅客户端模式下显示 min/max */}
                {tunnelInfo.type === "client" && (
                  <CellValue
                    icon={
                      <Icon
                        className="text-default-600"
                        height={18}
                        icon="lucide:layers"
                        width={18}
                      />
                    }
                    label="池最小值"
                    value={(() => {
                      const hasValue = tunnelInfo.min !== undefined && tunnelInfo.min !== null;
                      const configValue = tunnelInfo.config?.min;
                      const displayValue = hasValue
                        ? tunnelInfo.min
                        : configValue
                          ? configValue
                          : 64;

                      return (
                        <span className="font-mono text-sm">
                          {displayValue}
                          <span className="text-default-400 text-xs ml-1">
                            (min)
                          </span>
                          {!hasValue && configValue && (
                            <span className="text-default-400 text-xs ml-1">
                              (默认)
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  />
                )}
                {tunnelInfo.type === "server" && (
                  <CellValue
                    icon={
                      <Icon
                        className="text-default-600"
                        height={18}
                        icon="lucide:layers"
                        width={18}
                      />
                    }
                    label="池最大值"
                    value={(() => {
                      const hasValue = tunnelInfo.max !== undefined && tunnelInfo.max !== null;
                      const configValue = tunnelInfo.config?.max;
                      const displayValue = hasValue
                        ? tunnelInfo.max
                        : configValue
                          ? configValue
                          : 1024;

                      return (
                        <span className="font-mono text-sm">
                          {displayValue}
                          <span className="text-default-400 text-xs ml-1">
                            (max)
                          </span>
                          {!hasValue && configValue && (
                            <span className="text-default-400 text-xs ml-1">
                              (默认)
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  />
                )}

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:link-2"
                      width={18}
                    />
                  }
                  label="最大连接数限制"
                  value={
                    <span className="font-mono text-sm">
                      {tunnelInfo.slot !== undefined && tunnelInfo.slot !== null
                        ? tunnelInfo.slot
                        : tunnelInfo.config?.slot
                          ? (
                              <>
                                {tunnelInfo.config.slot}
                                <span className="text-default-400 text-xs ml-1">
                                  (默认)
                                </span>
                              </>
                            )
                          : "未设置"}
                    </span>
                  }
                />
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:rotate-ccw"
                      width={18}
                    />
                  }
                  label="自动重启"
                  value={
                    <span className="font-mono text-sm text-default-600">
                      {tunnelInfo.restart ? "开启" : "禁用"}
                    </span>
                  }
                  onPress={() =>
                    handleRestartToggle(!tunnelInfo.restart)
                  }
                  isInteractive={true}
                />
                {/* 仅服务端模式显示TLS设置 */}
                {tunnelInfo.type === "server" && (
                  <>
                    <CellValue
                      icon={
                        <Icon
                          className="text-default-600"
                          height={18}
                          icon="lucide:shield"
                          width={18}
                        />
                      }
                      label="TLS 设置"
                      value={
                        <div className="flex items-center">
                          <Chip
                            color={
                              tunnelInfo.tlsMode === "inherit" || tunnelInfo.tlsMode === ""
                                ? "default"
                                : tunnelInfo.tlsMode === "0"
                                  ? "primary"
                                  : "success"
                            }
                            size="sm"
                            variant="flat"
                          >
                            {tunnelInfo.tlsMode === "inherit" || tunnelInfo.tlsMode === ""
                              ? (
                                  <>
                                    继承主控
                                  </>
                                )
                              : tunnelInfo.tlsMode === "0"
                                ? "无 TLS 加密"
                                : tunnelInfo.tlsMode === "1"
                                  ? "自签名证书"
                                  : "自定义证书"}
                          </Chip>
                            {(tunnelInfo.tlsMode === "inherit" || tunnelInfo.tlsMode === "") && tunnelInfo.endpoint.tls && (
                              <span className="text-default-400 text-xs ml-1">
                                ({getTLSModeText(tunnelInfo.endpoint.tls)})
                              </span>
                            )}
                        </div>
                      }
                    />
                    {/* server模式下显示证书路径和密钥路径 */}
                    <CellValue
                      icon={
                        <Icon
                          className="text-default-600"
                          height={18}
                          icon="lucide:award"
                          width={18}
                        />
                      }
                      label="证书路径"
                      value={
                        (tunnelInfo.tlsMode === "2"&&tunnelInfo.certPath) ? tunnelInfo.certPath
                          : tunnelInfo.config?.certPath
                            ? (
                                <>
                                  {tunnelInfo.config.certPath}
                                  <span className="text-default-400 text-xs ml-1">
                                    (默认)
                                  </span>
                                </>
                              )
                            : "-"
                      }
                    />
                    <CellValue
                      icon={
                        <Icon
                          className="text-default-600"
                          height={18}
                          icon="lucide:key"
                          width={18}
                        />
                      }
                      label="密钥路径"
                      value={
                        (tunnelInfo.tlsMode === "2"&&tunnelInfo.keyPath)
                          ? tunnelInfo.keyPath
                          : tunnelInfo.config?.keyPath
                            ? (
                                <>
                                  {tunnelInfo.config.keyPath}
                                  <span className="text-default-400 text-xs ml-1">
                                    (默认)
                                  </span>
                                </>
                              )
                            : "-"
                      }
                    />
                  </>
                )}
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:lock"
                      width={18}
                    />
                  }
                  label="隧道密码"
                  value={
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs md:text-sm break-all text-default-500">
                        {tunnelInfo.type === "client" && tunnelInfo.mode === 1
                          ? "-"
                          : tunnelInfo.password
                            ? (isPasswordVisible ? tunnelInfo.password : "••••••••")
                            : tunnelInfo.config?.password
                              ? (
                                  <>
                                    {isPasswordVisible ? tunnelInfo.config.password : "••••••••"}
                                    <span className="text-default-400 text-xs ml-1">
                                      (默认)
                                    </span>
                                  </>
                                )
                              : "未设置"}
                      </span>
                      {(tunnelInfo.password || tunnelInfo.config?.password) &&
                       !(tunnelInfo.type === "client" && tunnelInfo.mode === 1) && (
                        <FontAwesomeIcon
                          className="text-xs cursor-pointer hover:text-primary w-4 text-default-500"
                          icon={isPasswordVisible ? faEyeSlash : faEye}
                          onClick={() =>
                            setIsPasswordVisible(!isPasswordVisible)
                          }
                        />
                      )}
                    </div>
                  }
                />

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:clock"
                      width={18}
                    />
                  }
                  label="读取超时"
                  value={
                    <span className="font-mono text-sm text-default-600">
                      {tunnelInfo.read
                        ? tunnelInfo.read
                        : tunnelInfo.config?.read
                          ? (
                              <>
                                {tunnelInfo.config.read}
                                <span className="text-default-400 text-xs ml-1">
                                  (默认)
                                </span>
                              </>
                            )
                          : "未设置"}
                    </span>
                  }
                />

                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:gauge"
                      width={18}
                    />
                  }
                  label="速率限制"
                  value={
                    <span className="font-mono text-sm text-default-600">
                      {(() => {
                        const rateValue = tunnelInfo.rate !== undefined && tunnelInfo.rate !== null
                          ? tunnelInfo.rate
                          : tunnelInfo.config?.rate;
                        const isFromConfig = tunnelInfo.rate === undefined || tunnelInfo.rate === null;

                        if (rateValue === undefined || rateValue === null) {
                          return "未设置";
                        }

                        const numValue = typeof rateValue === 'string' ? parseFloat(rateValue) : rateValue;

                        if (numValue === 0) {
                          return (
                            <>
                              不限制
                              {isFromConfig && tunnelInfo.config?.rate !== undefined && (
                                <span className="text-default-400 text-xs ml-1">
                                  (默认)
                                </span>
                              )}
                            </>
                          );
                        } else {
                          return (
                            <>
                              {rateValue}
                              <span className="text-default-400 text-xs ml-1">Mbps</span>
                              {isFromConfig && tunnelInfo.config?.rate !== undefined && (
                                <span className="text-default-400 text-xs ml-1">
                                  (默认)
                                </span>
                              )}
                            </>
                          );
                        }
                      })()}
                    </span>
                  }
                />
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:shuffle"
                      width={18}
                    />
                  }
                  label="Proxy Protocol"
                  value={
                    tunnelInfo.proxyProtocol === true ? "开启" : "关闭"
                  }
                />
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:tag"
                      width={18}
                    />
                  }
                  label="标签"
                  value={
                    tunnelInfo?.instanceTags &&
                    typeof tunnelInfo.instanceTags === 'object' &&
                    Object.keys(tunnelInfo.instanceTags).length > 0
                      ? "已设置"
                      : "未设置"
                  }
                  onPress={handleInstanceTagClick}
                  isInteractive={true}
                />
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="lucide:bug"
                      width={18}
                    />
                  }
                  label="测试网络"
                  value={"点击测试连通性"}
                  onPress={() => setTcpingModalOpen(true)}
                  isInteractive={true}
                />
              </div>
              {/* 分隔线和命令行信息 */}
              <Divider className="my-4" />

              {/* 命令行信息 */}
              <div className="flex gap-2 items-center">
                {tunnelInfo.configLine && (
                  <Tooltip
                    content={showConfigLine ? "切换显示命令URL" : "切换显示配置URL"}
                    placement="top"
                  >
                    <Button
                      isIconOnly
                      color={showConfigLine ? "primary" : "default"}
                      startContent={
                        <Icon
                          className={showConfigLine ? "text-primary-foreground" : "text-default-600"}
                          height={18}
                          icon="lucide:terminal"
                          width={18}
                        />
                      }
                      variant="flat"
                      onPress={() => setShowConfigLine(!showConfigLine)}
                    />
                  </Tooltip>
                )}
                <Snippet
                  className="xs:text-xs"
                  color={showConfigLine && tunnelInfo.configLine ? "primary" : "default"}
                  hideCopyButton={false}
                  hideSymbol={true}
                >
                  {showConfigLine && tunnelInfo.configLine
                    ? tunnelInfo.configLine
                    : tunnelInfo.commandLine}
                </Snippet>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 标准字段信息 */}
        {(() => {
          // 解析标签数据
          const parseTagsData = () => {
            if (
              !tunnelInfo?.instanceTags ||
              typeof tunnelInfo.instanceTags !== 'object'
            ) {
              return {};
            }

            // 现在instanceTags直接是map格式，不需要转换
            return tunnelInfo.instanceTags as Record<string, string>;
          };

          const tagsData = parseTagsData();
          const standardFields = [
            "startDate",
            "endDate",
            "amount",
            "bandwidth",
            "trafficVol",
            "trafficType",
            "IPv4",
            "IPv6",
            "networkRoute",
            "extra",
          ];
          const hasStandardFields = standardFields.some(
            (field) => tagsData[field],
          );

          // 计算剩余天数
          const calculateRemainingDays = () => {
            if (
              !tagsData.endDate ||
              tagsData.endDate === "0000-00-00T23:59:59+08:00"
            ) {
              return { days: Infinity, isUnlimited: true };
            }

            const endDate = new Date(tagsData.endDate);
            const now = new Date();
            const diffTime = endDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            return { days: Math.max(0, diffDays), isUnlimited: false };
          };

          const { days: remainingDays, isUnlimited } = calculateRemainingDays();

          // 获取剩余天数的颜色
          const getDaysColor = (days: number, unlimited: boolean) => {
            if (unlimited) return "success";
            if (days <= 3) return "danger";
            if (days <= 7) return "warning";
            if (days <= 30) return "primary";

            return "success";
          };

          if (!hasStandardFields) return null;

          return (
            <Card className="p-2">
              <CardBody>
                <div className="flex flex-wrap gap-4">
                  {/* 价格信息 */}
                  {tagsData.amount && (
                    <div className="flex items-center gap-1">
                      <Icon
                        className="text-default-600"
                        height={16}
                        icon="material-symbols-light:money-bag"
                        width={16}
                      />
                      <span className="text-sm text-default-600">价格:</span>
                      <Chip color="primary" size="sm" variant="flat">
                        {tagsData.amount}
                      </Chip>
                    </div>
                  )}

                  {/* 剩余时间 */}
                  {(tagsData.startDate || tagsData.endDate) && (
                    <div className="flex items-center gap-1">
                      <Icon
                        className="text-default-600"
                        height={16}
                        icon="lucide:clock"
                        width={16}
                      />
                      <span className="text-sm text-default-600">
                        剩余时间:
                      </span>
                      <Chip
                        color={getDaysColor(remainingDays, isUnlimited)}
                        size="sm"
                        variant="flat"
                      >
                        {isUnlimited ? "无限期" : `${remainingDays} 天`}
                      </Chip>
                    </div>
                  )}

                  {/* 带宽信息 */}
                  {tagsData.bandwidth && (
                    <div className="flex items-center gap-1">
                      <Icon
                        className="text-default-600"
                        height={16}
                        icon="lucide:gauge"
                        width={16}
                      />
                      <span className="text-sm text-default-600">带宽:</span>
                      <Chip color="primary" size="sm" variant="flat">
                        {tagsData.bandwidth}
                      </Chip>
                    </div>
                  )}

                  {/* 流量信息 */}
                  {tagsData.trafficVol && (
                    <div className="flex items-center gap-1">
                      <Icon
                        className="text-default-600"
                        height={16}
                        icon="lucide:activity"
                        width={16}
                      />
                      <span className="text-sm text-default-600">流量:</span>
                      <Chip color="success" size="sm" variant="flat">
                        {tagsData.trafficVol}
                      </Chip>
                    </div>
                  )}

                  {/* 路由信息 */}
                  {tagsData.networkRoute && (
                    <div className="flex items-center gap-1">
                      <Icon
                        className="text-default-600"
                        height={16}
                        icon="lucide:route"
                        width={16}
                      />
                      <span className="text-sm text-default-600">路由:</span>
                      <Chip color="default" size="sm" variant="flat">
                        {tagsData.networkRoute}
                      </Chip>
                    </div>
                  )}

                  {/* 额外信息 */}
                  {tagsData.extra && (
                    <div className="flex items-center gap-1">
                      <Icon
                        className="text-default-600"
                        height={16}
                        icon="lucide:info"
                        width={16}
                      />
                      <span className="text-sm text-default-600">其他:</span>
                      <div className="flex gap-1">
                        {tagsData.extra.split(",").map((item, index) => (
                          <Chip
                            key={index}
                            color="default"
                            size="sm"
                            variant="flat"
                          >
                            {item.trim()}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* 实例操作 */}
        {false && (
          <Card className="p-2">
            <CardHeader className="flex items-center justify-between pb-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">实例操作</h3>
              </div>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* <Button
                className="h-16 flex flex-col items-center justify-center gap-1 p-2"
                color="danger"
                isDisabled={resetLoading}
                size="md"
                variant="flat"
                onClick={() => setResetModalOpen(true)}
              >
                <FontAwesomeIcon className="w-5 h-5" icon={faHammer} />
                <span className="text-xs">重置实例</span>
              </Button> */}
                <Button
                  className="h-16 flex flex-col items-center justify-center gap-1 p-2"
                  color="warning"
                  size="md"
                  variant="flat"
                  onClick={() => setTcpingModalOpen(true)}
                >
                  <FontAwesomeIcon className="w-5 h-5" icon={faBug} />
                  <span className="text-xs">网络诊断</span>
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* 实例设置 - 临时隐藏 */}
        {false && (
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
                  {tunnelInfo.endpoint.version && (
                    <OriginalCellValue
                      label="自动重启"
                      value={
                        <div className="flex items-center justify-center">
                          <Switch
                            classNames={{
                              base: cn(
                                "inline-flex flex-row-reverse w-full max-w-md items-center",
                                "justify-between",
                              ),
                              wrapper: "p-0 h-6 w-14 overflow-visible",
                              thumb: cn(
                                "w-6 h-6 border-2 shadow-lg",
                                "group-data-[hover=true]:border-primary",
                                //selected
                                "group-data-[selected=true]:ms-8",
                                // pressed
                                "group-data-[pressed=true]:w-16",
                                "group-data-[selected]:group-data-[pressed]:ms-4",
                              ),
                            }}
                            endContent={
                              <span className="text-xs text-default-600">
                                禁用
                              </span>
                            }
                            isDisabled={isUpdatingRestart}
                            isSelected={tunnelInfo.restart}
                            size="sm"
                            startContent={
                              <span className="text-xs text-default-600">
                                启用
                              </span>
                            }
                            onValueChange={handleRestartToggle}
                          />
                        </div>
                      }
                    />
                  )}

                  {/* 图表自动刷新 */}
                  <OriginalCellValue
                    label="图表刷新"
                    value={
                      <div className="flex items-center justify-center">
                        <Switch
                          classNames={{
                            base: cn(
                              "inline-flex flex-row-reverse w-full max-w-md items-center",
                              "justify-between",
                            ),
                            wrapper: "p-0 h-6 w-14 overflow-visible",
                            thumb: cn(
                              "w-6 h-6 border-2 shadow-lg",
                              "group-data-[hover=true]:border-primary",
                              //selected
                              "group-data-[selected=true]:ms-8",
                              // pressed
                              "group-data-[pressed=true]:w-16",
                              "group-data-[selected]:group-data-[pressed]:ms-4",
                            ),
                          }}
                          endContent={
                            <span className="text-xs text-default-600">
                              关闭
                            </span>
                          }
                          isSelected={isMetricsAutoRefreshEnabled}
                          size="sm"
                          startContent={
                            <span className="text-xs text-default-600">
                              开启
                            </span>
                          }
                          onValueChange={toggleMetricsAutoRefresh}
                        />
                      </div>
                    }
                  />

                  {/* 保存Log日志 */}
                  <OriginalCellValue
                    label="保存Log日志"
                    value={
                      <div className="flex items-center justify-center">
                        <Switch
                          classNames={{
                            base: cn(
                              "inline-flex flex-row-reverse w-full max-w-md items-center",
                              "justify-between",
                            ),
                            wrapper: "p-0 h-6 w-14 overflow-visible",
                            thumb: cn(
                              "w-6 h-6 border-2 shadow-lg",
                              "group-data-[hover=true]:border-primary",
                              //selected
                              "group-data-[selected=true]:ms-8",
                              // pressed
                              "group-data-[pressed=true]:w-16",
                              "group-data-[selected]:group-data-[pressed]:ms-4",
                            ),
                          }}
                          endContent={
                            <span className="text-xs text-default-600">
                              关闭
                            </span>
                          }
                          isDisabled={true}
                          isSelected={true}
                          size="sm"
                          startContent={
                            <span className="text-xs text-default-600">
                              开启
                            </span>
                          }
                        />
                      </div>
                    }
                  />
                </div>

                {/* 右侧：操作按钮 */}
                <div>
                  <div className="flex flex-col gap-3">
                    <Button
                      className="w-full h-7"
                      color="secondary"
                      isDisabled={resetLoading}
                      size="sm"
                      startContent={<FontAwesomeIcon icon={faHammer} />}
                      variant="flat"
                      onClick={() => setResetModalOpen(true)}
                    >
                      重置实例
                    </Button>

                    <Button
                      className="w-full  h-7"
                      color="default"
                      size="sm"
                      startContent={<FontAwesomeIcon icon={faPen} />}
                      variant="flat"
                      onClick={handleRenameClick}
                    >
                      重命名
                    </Button>
                    <Button
                      className="w-full  h-7"
                      color="warning"
                      size="sm"
                      startContent={<FontAwesomeIcon icon={faBug} />}
                      variant="flat"
                      onClick={() => setTcpingModalOpen(true)}
                    >
                      诊断测试
                    </Button>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* 命令行信息 */}
        {false && (
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
        )}

        {/* 统计图表 - Tab 切换卡片 */}
        <Card className="p-4">
          {/* Tab 标题行：左侧Tabs，右侧图例和放大按钮 */}
          <div className="flex items-center justify-between mb-4">
            <Tabs
              classNames={
                {
                  // base: "w-auto",
                  // tabList: "gap-6 relative rounded-none p-0 border-b-0",
                  // cursor: "w-full bg-primary",
                  // tab: "max-w-fit px-0 h-12",
                  // tabContent: "group-data-[selected=true]:text-primary"
                }
              }
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

          {/* Tab 内容区域 - 只显示图表，不再显示图例和按钮 */}
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
                  color="primary"
                  isSelected={isRealtimeLogging}
                  size="sm"
                  onValueChange={handleRealtimeLoggingToggle}
                />
              </div>
            </div>

            {/* 第二行：剩余控件 */}
            <div className="flex items-center justify-start sm:justify-end gap-2 overflow-x-auto">
              {/* 实时日志开关 - 桌面端显示 */}
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <span className="text-sm text-default-600">实时输出</span>
                <Switch
                  color="primary"
                  isSelected={isRealtimeLogging}
                  size="sm"
                  onValueChange={handleRealtimeLoggingToggle}
                />
              </div>

              {/* 日期选择 */}
              <DatePicker
                showMonthAndYearPickers
                className="w-40 flex-shrink-0"
                granularity="day"
                isDateUnavailable={(date) => {
                  // 允许选择任何日期，让FileLogViewer来处理日志获取
                  return false;
                }}
                isDisabled={isRealtimeLogging}
                size="sm"
                value={selectedLogDate ? (parseDate(selectedLogDate) as any) : null}
                onChange={(date) => {
                  if (!isRealtimeLogging && date) {
                    const newDate = date.toString();

                    handleLogDateChange(newDate);
                  }
                }}
              />

              {/* 操作按钮组 */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* 刷新按钮 */}
                <Tooltip content="刷新日志" placement="top">
                  <Button
                    isIconOnly
                    className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                    isDisabled={isRealtimeLogging}
                    isLoading={logLoading}
                    size="sm"
                    variant="flat"
                    onPress={handleLogRefresh}
                  >
                    <FontAwesomeIcon className="text-xs" icon={faRefresh} />
                  </Button>
                </Tooltip>

                {/* 滚动到底部按钮 */}
                <Tooltip content="滚动到底部" placement="top">
                  <Button
                    isIconOnly
                    className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                    size="sm"
                    variant="flat"
                    onPress={() => {
                      if ((window as any).fileLogViewerRef) {
                        (window as any).fileLogViewerRef.scrollToBottom();
                      }
                    }}
                  >
                    <FontAwesomeIcon className="text-xs" icon={faArrowDown} />
                  </Button>
                </Tooltip>

                {/* 导出按钮 */}
                <Tooltip content="导出日志文件" placement="top">
                  <Button
                    isIconOnly
                    className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                    color="primary"
                    isDisabled={exportLoading || isRealtimeLogging}
                    isLoading={exportLoading}
                    size="sm"
                    variant="flat"
                    onPress={handleExport}
                  >
                    <FontAwesomeIcon className="text-xs" icon={faDownload} />
                  </Button>
                </Tooltip>

                {/* 清空按钮 */}
                <Popover
                  isOpen={clearPopoverOpen}
                  placement="bottom"
                  onOpenChange={setClearPopoverOpen}
                >
                  <PopoverTrigger>
                    <Button
                      isIconOnly
                      className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                      color="danger"
                      isLoading={logClearing}
                      size="sm"
                      variant="flat"
                    >
                      <FontAwesomeIcon className="text-xs" icon={faTrash} />
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
                          className="flex-1"
                          color="danger"
                          size="sm"
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
                        >
                          确认清空
                        </Button>
                        <Button
                          className="flex-1"
                          size="sm"
                          variant="flat"
                          onPress={() => setClearPopoverOpen(false)} // 关闭Popover
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
              date={logDate}
              endpointId={String(tunnelInfo?.endpoint?.id || "")}
              instanceId={String(tunnelInfo?.instanceId || "")}
              isRealtimeMode={isRealtimeLogging}
              triggerRefresh={logRefreshTrigger}
              onClearLogs={handleLogClear}
              onClearingChange={setLogClearing}
              onDateChange={setLogDate}
              onLoadingChange={setLogLoading}
            />
          </CardBody>
        </Card>
      </div>

      {/* 编辑实例模态框 */}
      {editModalOpen && tunnelInfo && (
        <SimpleCreateTunnelModal
          editData={{
            // SimpleCreateTunnelModal 需要的字段整理
            id: tunnelInfo.id,
            endpointId: tunnelInfo.endpoint.id,
            type: tunnelInfo.type, // 已经是英文类型，直接使用
            name: tunnelInfo.name,
            tunnelAddress: tunnelInfo.tunnelAddress,
            tunnelPort: String(tunnelInfo.listenPort),
            targetAddress: tunnelInfo.targetAddress,
            targetPort: String(tunnelInfo.targetPort),
            tlsMode: tunnelInfo.tlsMode,
            logLevel: tunnelInfo.logLevel,
            password: tunnelInfo.password,
            min: tunnelInfo.min,
            max: tunnelInfo.max,
            slot: tunnelInfo.slot,
            certPath: tunnelInfo.certPath,
            keyPath: tunnelInfo.keyPath,
            // 新增字段
            read: tunnelInfo.read,
            rate: tunnelInfo.rate,
            mode: tunnelInfo.mode,
            proxyProtocol: tunnelInfo.proxyProtocol,
          }}
          isOpen={editModalOpen}
          mode="edit"
          onOpenChange={setEditModalOpen}
          onSaved={() => {
            setEditModalOpen(false);
            fetchTunnelDetails();
          }}
        />
      )}

      {/* 重命名模态框 */}
      <RenameTunnelModal
        currentName={tunnelInfo?.name || ""}
        isOpen={isRenameModalOpen}
        tunnelId={tunnelInfo?.id?.toString() || ""}
        onOpenChange={setIsRenameModalOpen}
        onRenamed={handleRenameSuccess}
      />
      {/* 实例标签模态框 */}
      <InstanceTagModal
        currentTags={tunnelInfo?.instanceTags || {}}
        isOpen={isInstanceTagModalOpen}
        tunnelId={tunnelInfo?.id?.toString() || ""}
        onOpenChange={setIsInstanceTagModalOpen}
        onSaved={handleInstanceTagSaved}
      />

      {/* 全屏图表模态 */}
      <FullscreenChartModal
        chartType={fullscreenChartType}
        connectionsData={transformConnectionsData(metricsData?.data)}
        error={metricsError || undefined}
        isOpen={fullscreenModalOpen}
        latencyData={transformLatencyData(metricsData?.data)}
        loading={metricsLoading}
        poolData={transformPoolData(metricsData?.data)}
        speedData={transformSpeedData(metricsData?.data)}
        title={fullscreenChartTitle}
        trafficData={transformTrafficData(metricsData?.data)}
        onOpenChange={setFullscreenModalOpen}
        onRefresh={refreshMetrics}
      />

      {/* TCPing诊断测试模态框 */}
      <Modal
        hideCloseButton={tcpingLoading}
        isDismissable={!tcpingLoading}
        isOpen={tcpingModalOpen}
        placement="center"
        size="lg"
        onOpenChange={(open) => {
          setTcpingModalOpen(open);
          if (!open) {
            setTcpingTarget("");
            setTcpingResult(null);
            setTcpingLoading(false);
          }
        }}
      >
        <ModalContent className="min-h-[400px]">
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
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
                // 结果显示状态
                <ModalBody className="py-6">
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

                    {/* 重新测试按钮 */}
                    <div className="flex gap-2">
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
                        onPress={onClose}
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
                    <Spinner color="primary" size="lg" />
                    <p className="text-default-600 animate-pulse">
                      正在进行连通性测试...
                    </p>
                    <p className="text-xs text-default-400">
                      目标地址: {tunnelInfo.targetAddress}:
                      {tunnelInfo.config.targetPort}
                    </p>
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
