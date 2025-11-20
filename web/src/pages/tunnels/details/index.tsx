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
  Badge,
  RadioGroup,
  Radio,
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
import { TcpingTestModal } from "@/components/tunnels/tcping-test-modal";
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
  quic?: boolean | null;
  dial?: string | null;
  dns?: string | null;
  targetPort: number;
  tlsMode: string;
  commandLine: string;
  configLine: string; // 新增字段
  config: any; // 解析后的配置对象
  tags: { [key: string]: string }; // 改为对象形式
  peer?: {
    sid?: string;
    type?: string;
    alias?: string;
  } | null; // 对端信息
  tunnelAddress: string;
  targetAddress: string;
  extendTargetAddress: string[]; // 扩展目标地址（负载均衡）
  listenType: "ALL" | "TCP" | "UDP";
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
  const [showConfigLine, setShowConfigLine] = React.useState(true);
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
              onPress={() => setResetModalOpen(true)}
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
                      icon="lucide:chevrons-left-right-ellipsis"
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
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {tunnelInfo.targetAddress}:{tunnelInfo.targetPort}
                      </span>
                      {tunnelInfo.extendTargetAddress && tunnelInfo.extendTargetAddress.length > 0 && (
                        <Tooltip
                          content={
                            <div className="space-y-2">
                              <p className="text-sm font-semibold">扩展目标地址</p>
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {tunnelInfo.extendTargetAddress.map((addr, index) => (
                                  <div key={index} className="font-mono text-xs break-all">
                                    {typeof addr === 'string' ? addr : JSON.stringify(addr)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          }
                          placement="right"
                        >
                          <Chip
                            color="default"
                            size="sm"
                            variant="flat"
                            className="cursor-help"
                          >
                            +{tunnelInfo.extendTargetAddress.length}
                          </Chip>
                        </Tooltip>
                      )}
                    </div>
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
                        icon="lucide:cylinder"
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
                        icon="lucide:cylinder"
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
                      icon="lucide:link"
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
                    <svg
                      className="text-default-600"
                      width={20}
                      height={20}
                      viewBox="0 0 122.879 122.881"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fill="currentColor"
                        d="M109.467,89.505c0.182,0,0.359,0.019,0.531,0.053c1.146-1.998,2.191-4.095,3.137-6.287 c0.018-0.043,0.037-0.085,0.059-0.127c1.418-3.346,2.488-6.819,3.209-10.42c0.193-0.961,0.359-1.931,0.5-2.908 c0.639-3.953,0.803-7.97,0.482-12.052c-0.16-2.591-0.488-5.126-0.982-7.605c-0.73-3.646-1.818-7.165-3.266-10.549l-0.002,0.002 l-3.107-6.233l0,0l-0.283-0.336H13.047l-0.195,0.336c-1.136,1.982-2.17,4.061-3.105,6.234c-0.019,0.043-0.039,0.086-0.059,0.127 c-0.878,2.071-1.622,4.19-2.233,6.358c-2.572,8.448-2.972,16.895-1.217,25.342c0.076,0.43,0.155,0.858,0.241,1.285 c0.729,3.646,1.818,7.164,3.264,10.549l0.004-0.001c0.935,2.172,1.969,4.251,3.105,6.233l0,0 C45.088,89.505,77.277,89.505,109.467,89.505L109.467,89.505L109.467,89.505z M32.269,45.816c4.548,0,8.039,1.233,10.472,3.697 c2.432,2.464,3.649,6.019,3.649,10.663c0,5.502-1.416,9.732-4.246,12.69c-2.831,2.957-6.885,4.437-12.166,4.437 c-3.308,0-7.188-0.144-11.64-0.43l0.477-9.064l-0.477-21.803L32.269,45.816L32.269,45.816z M31.791,70.195 c1.496,0,2.633-0.598,3.412-1.789c0.779-1.193,1.169-3.157,1.169-5.893c0-2.321-0.16-4.15-0.477-5.486 c-0.319-1.336-0.829-2.297-1.527-2.885c-0.7-0.589-1.67-0.883-2.91-0.883c-1.209,0-2.402,0.063-3.579,0.19l-0.333,13.406 l0.095,2.958C29.549,70.068,30.933,70.195,31.791,70.195L31.791,70.195z M76.807,66.808l0.381,10.066h-10.4l-8.682-16.506h-0.573 l-0.047,5.342l0.382,11.164h-8.683l0.477-9.064l-0.477-21.803h10.4l8.682,16.507h0.572l-0.285-16.172l8.777-0.525L76.807,66.808 L76.807,66.808z M95,45.435c3.02,0,6.012,0.556,8.969,1.67l-1.527,7.776l-1.336,0.573c-1.336-0.828-2.656-1.48-3.959-1.957 c-1.303-0.476-2.355-0.716-3.148-0.716c-0.732,0-1.313,0.144-1.742,0.43s-0.645,0.668-0.645,1.146c0,0.604,0.328,1.122,0.979,1.55 c0.65,0.429,1.738,1.003,3.268,1.693c1.777,0.803,3.244,1.535,4.391,2.218c1.143,0.683,2.146,1.624,3.004,2.814 c0.857,1.192,1.289,2.664,1.289,4.413c0,1.94-0.533,3.697-1.6,5.272c-1.064,1.574-2.584,2.824-4.555,3.745 s-4.262,1.383-6.871,1.383c-3.242,0-6.646-0.604-10.209-1.813l1.385-8.302l0.953-0.572c1.463,1.113,3.029,1.996,4.699,2.647 c1.67,0.652,3.061,0.979,4.174,0.979c0.891,0,1.537-0.152,1.934-0.453c0.395-0.302,0.596-0.676,0.596-1.12 c0-0.669-0.342-1.235-1.025-1.694c-0.684-0.461-1.791-1.027-3.316-1.693c-1.748-0.764-3.188-1.488-4.316-2.172 c-1.131-0.683-2.109-1.623-2.934-2.814c-0.826-1.192-1.242-2.664-1.242-4.413c0-2.004,0.543-3.81,1.623-5.415 c1.08-1.605,2.592-2.872,4.531-3.792C90.307,45.897,92.518,45.435,95,45.435L95,45.435z M106.521,94.891H89.508 c-5.166,7.481-12.123,14.87-20.84,22.167c1.367-0.169,2.719-0.388,4.057-0.654c3.646-0.729,7.164-1.817,10.549-3.265l-0.002-0.004 c3.441-1.48,6.646-3.212,9.609-5.199c2.969-1.992,5.721-4.255,8.25-6.795l0.01-0.01l0,0 C103.098,99.182,104.891,97.101,106.521,94.891L106.521,94.891L106.521,94.891z M54.21,117.058 c-8.716-7.297-15.673-14.686-20.838-22.167H16.361c1.631,2.21,3.423,4.291,5.379,6.24l0.01,0.011v-0.001 c2.53,2.54,5.282,4.804,8.25,6.795c2.962,1.987,6.167,3.719,9.61,5.199c0.042,0.019,0.085,0.039,0.127,0.059 c3.345,1.42,6.819,2.488,10.42,3.209C51.493,116.67,52.843,116.889,54.21,117.058L54.21,117.058L54.21,117.058z M16.361,27.991 h17.938c5.108-7.361,11.862-14.765,20.29-22.212c-1.495,0.175-2.973,0.409-4.431,0.7c-3.647,0.729-7.164,1.818-10.549,3.265 l0,0.003c-3.442,1.481-6.647,3.211-9.609,5.2c-2.969,1.992-5.72,4.255-8.25,6.794L21.74,21.75l0,0 C19.784,23.701,17.992,25.78,16.361,27.991L16.361,27.991L16.361,27.991z M68.291,5.778c8.428,7.447,15.182,14.851,20.291,22.212 h17.939c-1.633-2.21-3.426-4.292-5.383-6.241l-0.01-0.009l0,0c-2.527-2.54-5.279-4.802-8.25-6.794 c-2.963-1.988-6.168-3.719-9.609-5.2c-0.043-0.019-0.086-0.039-0.127-0.059c-3.346-1.418-6.82-2.488-10.42-3.208 C71.266,6.187,69.785,5.954,68.291,5.778L68.291,5.778L68.291,5.778z M49.107,1.198C53.099,0.399,57.211,0,61.44,0 s8.341,0.399,12.333,1.198c3.936,0.788,7.758,1.969,11.475,3.547c0.049,0.018,0.1,0.038,0.146,0.058 c3.703,1.594,7.197,3.485,10.473,5.685c3.268,2.192,6.291,4.677,9.064,7.461c2.785,2.775,5.271,5.799,7.463,9.065 c2.197,3.275,4.09,6.769,5.684,10.474l-0.004,0.001l0.004,0.009c1.607,3.758,2.809,7.627,3.605,11.609 c0.799,3.992,1.195,8.104,1.195,12.334c0,4.229-0.396,8.343-1.195,12.335c-0.787,3.932-1.973,7.758-3.547,11.472 c-0.02,0.05-0.037,0.099-0.061,0.147c-1.594,3.705-3.484,7.196-5.684,10.472c-2.191,3.268-4.676,6.29-7.461,9.065 c-2.775,2.785-5.799,5.271-9.066,7.462c-3.273,2.198-6.768,4.091-10.471,5.684l-0.002-0.004l-0.01,0.004 c-3.758,1.606-7.629,2.809-11.609,3.604c-3.992,0.8-8.105,1.198-12.333,1.198c-4.229,0-8.343-0.398-12.334-1.198 c-3.933-0.787-7.758-1.97-11.474-3.546c-0.049-0.019-0.098-0.037-0.147-0.06c-3.705-1.593-7.197-3.484-10.472-5.684 c-3.266-2.19-6.291-4.677-9.065-7.462c-2.785-2.775-5.27-5.799-7.461-9.064c-2.198-3.274-4.09-6.768-5.684-10.473l0.004-0.002 l-0.004-0.009c-1.606-3.758-2.808-7.628-3.604-11.609C0.4,69.783,0,65.671,0,61.44c0-4.229,0.4-8.342,1.198-12.334 c0.787-3.933,1.97-7.757,3.546-11.473c0.019-0.049,0.038-0.1,0.058-0.147c1.594-3.705,3.485-7.198,5.684-10.474 c2.192-3.266,4.677-6.29,7.461-9.065c2.774-2.785,5.799-5.27,9.065-7.461c3.275-2.199,6.769-4.09,10.472-5.685l0.001,0.004 l0.009-0.004C41.255,3.197,45.126,1.995,49.107,1.198L49.107,1.198L49.107,1.198z M64.135,9.268v18.723h17.826 C77.275,21.815,71.34,15.575,64.135,9.268L64.135,9.268L64.135,9.268z M64.135,94.891v18.952 c7.645-6.283,13.9-12.601,18.746-18.952H64.135L64.135,94.891L64.135,94.891z M58.748,113.845V94.891H40 C44.843,101.241,51.101,107.562,58.748,113.845L58.748,113.845L58.748,113.845z M58.748,27.991V9.266 c-7.207,6.307-13.143,12.549-17.827,18.725H58.748L58.748,27.991L58.748,27.991z"
                      />
                    </svg>
                  }
                  label="DNS"
                  value={(() => {
                    const hasValue = tunnelInfo.dns !== undefined && tunnelInfo.dns !== null;
                    const configValue = tunnelInfo.config?.dns;
                    return (
                      <span className="font-mono text-sm">
                        {hasValue ? tunnelInfo.dns : configValue}
                        {!hasValue && configValue && (
                          <span className="text-default-400 text-xs ml-1">
                            (默认)
                          </span>
                        )}
                      </span>
                    );
                  })()
                  }
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
                        (tunnelInfo.tlsMode === "2" && tunnelInfo.certPath) ? (
                          <div className="overflow-hidden">
                            <Tooltip
                              content={tunnelInfo.certPath}
                              placement="top"
                            >
                              <span className="font-mono text-sm truncate block">
                                {tunnelInfo.certPath}
                              </span>
                            </Tooltip>
                          </div>
                        )
                          : tunnelInfo.config?.certPath
                            ? (
                              <div className="overflow-hidden">
                                <Tooltip
                                  content={tunnelInfo.config.certPath}
                                  placement="top"
                                >
                                  <span className="font-mono text-sm truncate block">
                                    {tunnelInfo.config.certPath}
                                    <span className="text-default-400 text-xs ml-1">
                                      (默认)
                                    </span>
                                  </span>
                                </Tooltip>
                              </div>
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
                        (tunnelInfo.tlsMode === "2" && tunnelInfo.keyPath)
                          ? (
                            <div className="overflow-hidden">
                              <Tooltip
                                content={tunnelInfo.keyPath}
                                placement="top"
                              >
                                <span className="font-mono text-sm truncate block">
                                  {tunnelInfo.keyPath}
                                </span>
                              </Tooltip>
                            </div>
                          )
                          : tunnelInfo.config?.keyPath
                            ? (
                              <div className="overflow-hidden">
                                <Tooltip
                                  content={tunnelInfo.config.keyPath}
                                  placement="top"
                                >
                                  <span className="font-mono text-sm truncate block">
                                    {tunnelInfo.config.keyPath}
                                    <span className="text-default-400 text-xs ml-1">
                                      (默认)
                                    </span>
                                  </span>
                                </Tooltip>
                              </div>
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
                      icon="lucide:radio-tower"
                      width={18}
                    />
                  }
                  label="监听类型"
                  value={
                    (() => {
                      const listenType = tunnelInfo?.listenType || "ALL";
                      if (listenType === "ALL") {
                        return (
                          <div className="flex items-center gap-2">
                            <Chip color="primary" size="sm" variant="flat">
                              TCP
                            </Chip>
                            <Chip color="success" size="sm" variant="flat">
                              UDP
                            </Chip>
                          </div>
                        );
                      } else if (listenType === "TCP") {
                        return (
                          <Chip color="primary" size="sm" variant="flat">
                            TCP
                          </Chip>
                        );
                      } else if (listenType === "UDP") {
                        return (
                          <Chip color="success" size="sm" variant="flat">
                            UDP
                          </Chip>
                        );
                      }
                      return listenType;
                    })()
                  }
                />
                {tunnelInfo?.type === "server" && (
                  <CellValue
                    icon={
                      <Icon
                        className="text-default-600"
                        height={18}
                        icon="lucide:zap"
                        width={18}
                      />
                    }
                    label="启用 QUIC"
                    value={
                      tunnelInfo?.quic ? "启用" : "关闭"
                    }
                  />
                )}
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={20}
                      icon="oui:ip"
                      width={20}
                    />
                  }
                  label="出站源IP"
                  value={
                    (() => {
                    const hasValue = tunnelInfo.dial !== undefined && tunnelInfo.dial !== null;
                    const configValue = tunnelInfo.config?.dial;
                    return (
                      <span className="font-mono text-sm">
                        {hasValue ? tunnelInfo.dial : configValue}
                        {!hasValue && configValue && (
                          <span className="text-default-400 text-xs ml-1">
                            (默认)
                          </span>
                        )}
                      </span>
                    );
                  })()
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
                <CellValue
                  icon={
                    <Icon
                      className="text-default-600"
                      height={18}
                      icon="solar:widget-2-bold"
                      width={18}
                    />
                  }
                  isInteractive={true}
                  onPress={() => {
                    navigate(`/services/details?sid=${tunnelInfo.peer?.sid}&type=${tunnelInfo.peer?.type}`);
                  }}
                  label="绑定服务"
                  value={
                    tunnelInfo?.peer && tunnelInfo?.peer?.sid != ""
                      ? (() => {
                        const peer = tunnelInfo.peer;
                        const displayText = peer?.alias || peer?.sid || "未知服务";
                        return (
                          <div className="overflow-hidden">
                            <Tooltip
                              content={<div className="space-y-1 max-h-48 overflow-y-auto">
                                <div className="font-mono text-xs break-all">
                                  sid: {peer?.sid}
                                </div>
                                <div className="font-mono text-xs break-all">
                                  type: {peer?.type}
                                </div>
                              </div>}
                              placement="top"
                            >
                              <span className="font-mono text-sm truncate block">
                                {displayText}
                              </span>
                            </Tooltip>
                          </div>
                        );
                      })()
                      : "-"
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
          isOpen={editModalOpen}
          mode="edit"
          instanceId={tunnelInfo.instanceId}
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
      {tunnelInfo && (
        <TcpingTestModal
          isOpen={tcpingModalOpen}
          onClose={() => setTcpingModalOpen(false)}
          instanceId={tunnelInfo.instanceId}
          targetAddress={tunnelInfo.targetAddress}
          targetPort={tunnelInfo.targetPort}
          extendTargetAddress={tunnelInfo.extendTargetAddress}
        />
      )}
    </>
  );
}
