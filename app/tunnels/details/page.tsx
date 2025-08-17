"use client";

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
import SimpleCreateTunnelModal from "../components/simple-create-tunnel-modal";
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
  faSection,
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { addToast } from "@heroui/toast";
import CellValue from "./cell-value";
import { EnhancedMetricsChart } from "@/components/ui/enhanced-metrics-chart";
import { TrafficUsageChart } from "@/components/ui/traffic-usage-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { PoolChart } from "@/components/ui/pool-chart";
import { LatencyChart } from "@/components/ui/latency-chart";
import { useSearchParams } from "next/navigation";
import { FileLogViewer } from "@/components/ui/file-log-viewer";
import { useTunnelSSE } from "@/lib/hooks/use-sse";
import { useMetricsTrend } from "@/lib/hooks/use-metrics-trend";
import {parseDate, getLocalTimeZone} from "@internationalized/date";

interface TunnelInfo {
  id: string;
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
    restart: boolean; // 添加 restart 字段
    certPath?: string; // TLS证书路径
    keyPath?: string; // TLS密钥路径
    mode?: string; // 隧道模式 (0, 1, 2)
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
const getTunnelModeText = (type: string, modeValue: string): string => {
  if (type === "client") {
    switch (modeValue) {
      case "0":
        return "自动模式";
      case "1":
        return "单端转发";
      case "2":
        return "强制正向";
      default:
        return modeValue || "未设置";
    }
  } else if (type === "server") {
    switch (modeValue) {
      case "0":
        return "自动检测";
      case "1":
        return "强制反向";
      case "2":
        return "强制正向";
      default:
        return modeValue || "未设置";
    }
  }
  return modeValue || "未设置";
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

export default function TunnelDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  // const resolvedParams = React.use(params);
  const router = useRouter();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
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
  const searchParams = useSearchParams();
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
  const [newTunnelName, setNewTunnelName] = React.useState("");
  const [isRenameLoading, setIsRenameLoading] = React.useState(false);

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
    "traffic" | "speed" | "pool" | "latency"
  >("traffic");
  const [fullscreenChartTitle, setFullscreenChartTitle] = React.useState("");

  // 打开全屏图表的函数
  const openFullscreenChart = (
    type: "traffic" | "speed" | "pool" | "latency",
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
    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformTrafficData] API数据:", apiData);
    }

    if (!apiData?.traffic?.created_at || !apiData?.traffic?.avg_delay) {
      if (process.env.NODE_ENV === "development") {
        console.log("[transformTrafficData] 缺少流量数据");
      }
      return [];
    }

    const result = apiData.traffic.created_at.map(
      (timestamp: number, index: number) => ({
        timeStamp: new Date(timestamp).toISOString(),
        traffic: apiData.traffic.avg_delay[index] || 0,
      })
    );

    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformTrafficData] 转换结果:", result.length, "条记录");
    }

    return result;
  }, []);

  const transformSpeedData = React.useCallback((apiData: any) => {
    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformSpeedData] API数据:", apiData);
    }

    const speedInTimestamps = apiData?.speed_in?.created_at || [];
    const speedInValues = apiData?.speed_in?.avg_delay || []; // 使用正确的字段名
    const speedOutTimestamps = apiData?.speed_out?.created_at || [];
    const speedOutValues = apiData?.speed_out?.avg_delay || []; // 使用正确的字段名

    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformSpeedData] 入站数据:", {
        timestamps: speedInTimestamps.length,
        values: speedInValues.length,
        sampleValues: speedInValues.slice(0, 3), // 显示前3个值
      });
      console.log("[transformSpeedData] 出站数据:", {
        timestamps: speedOutTimestamps.length,
        values: speedOutValues.length,
        sampleValues: speedOutValues.slice(0, 3), // 显示前3个值
      });
    }

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

    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformSpeedData] 转换结果:", result.length, "条记录");
      if (result.length > 0) {
        console.log("[transformSpeedData] 样本数据:", result.slice(0, 2));
      }
    }

    return result;
  }, []);

  const transformPoolData = React.useCallback((apiData: any) => {
    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformPoolData] API数据:", apiData);
    }

    if (!apiData?.pool?.created_at || !apiData?.pool?.avg_delay) {
      if (process.env.NODE_ENV === "development") {
        console.log("[transformPoolData] 缺少连接池数据");
      }
      return [];
    }

    const result = apiData.pool.created_at.map(
      (timestamp: number, index: number) => ({
        timeStamp: new Date(timestamp).toISOString(),
        pool: Math.round(apiData.pool.avg_delay[index] || 0),
      })
    );

    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformPoolData] 转换结果:", result.length, "条记录");
    }

    return result;
  }, []);

  const transformLatencyData = React.useCallback((apiData: any) => {
    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformLatencyData] API数据:", apiData);
    }

    if (!apiData?.ping?.created_at || !apiData?.ping?.avg_delay) {
      if (process.env.NODE_ENV === "development") {
        console.log("[transformLatencyData] 缺少延迟数据");
      }
      return [];
    }

    const result = apiData.ping.created_at.map(
      (timestamp: number, index: number) => ({
        timeStamp: new Date(timestamp).toISOString(),
        latency: apiData.ping.avg_delay[index] || 0,
      })
    );

    // 调试信息
    if (process.env.NODE_ENV === "development") {
      console.log("[transformLatencyData] 转换结果:", result.length, "条记录");
    }

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

  // 获取可用的日志日期列表
  const fetchAvailableLogDates = React.useCallback(async () => {
    if (!tunnelInfo?.endpointId || !tunnelInfo?.instanceId) return;
    
    try {
      const response = await fetch(
        `/api/endpoints/${tunnelInfo.endpointId}/file-logs/dates?instanceId=${tunnelInfo.instanceId}`
      );
      
      if (!response.ok) {
        throw new Error('获取可用日志日期失败');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.dates)) {
        setAvailableLogDates(data.dates);
        
        // 如果没有选中日期，则默认选择最新的可用日期
        if (!logDate && data.dates.length > 0) {
          const latestDate = data.dates[0]; // 日期已经按最新排序
          setLogDate(latestDate);
        }
      } else {
        setAvailableLogDates([]);
      }
    } catch (error) {
      console.error('获取可用日志日期失败:', error);
      setAvailableLogDates([]);
    }
  }, [tunnelInfo?.endpointId, tunnelInfo?.instanceId, logDate]);

  // 初始加载数据
  React.useEffect(() => {
    fetchTunnelDetails();
  }, [fetchTunnelDetails]);

  // 当隧道信息加载完成后，获取可用的日志日期
  React.useEffect(() => {
    if (tunnelInfo?.endpointId && tunnelInfo?.instanceId) {
      fetchAvailableLogDates();
    }
  }, [tunnelInfo?.endpointId, tunnelInfo?.instanceId, fetchAvailableLogDates]);

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
    if (data.eventType === "log" && data.logs) {
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
    if (data.eventType === "update") {
      console.log("[隧道详情] 收到update事件，更新本地状态");

      // 只刷新日志（通过触发器），避免重复调用fetchTunnelDetails
      setLogRefreshTrigger((prev) => prev + 1);
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
                },
              }
            : null
        );
      }
    }
  }, []);

  const sseOnError = React.useCallback((error: any) => {
    console.error("[隧道详情] SSE连接错误:", error);
  }, []);

  // SSE监听逻辑 - 使用优化的事件处理器
  useTunnelSSE(tunnelInfo?.instanceId || "", {
    onMessage: sseOnMessage,
    onError: sseOnError,
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
    setNewTunnelName(tunnelInfo?.name || "");
    setIsRenameModalOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!tunnelInfo || !newTunnelName.trim()) return;

    try {
      setIsRenameLoading(true);
      const response = await fetch(`/api/tunnels/${tunnelInfo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename",
          name: newTunnelName.trim(),
        }),
      });

      if (!response.ok) throw new Error("修改名称失败");

      // 更新本地状态
      setTunnelInfo((prev) =>
        prev ? { ...prev, name: newTunnelName.trim() } : null
      );

      addToast({
        title: "修改成功",
        description: "实例名称已更新",
        color: "success",
      });

      setIsRenameModalOpen(false);
    } catch (error) {
      console.error("修改名称失败:", error);
      addToast({
        title: "修改失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsRenameLoading(false);
    }
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
              onClick={() => router.back()}
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
                  {/* 选择是否移入回收站 */}
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="checkbox"
                        className="form-checkbox h-4 w-4 text-primary"
                        checked={moveToRecycle}
                        onChange={(e) => setMoveToRecycle(e.target.checked)}
                      />
                      <span>删除后历史记录移至回收站</span>
                    </label>
                  </div>
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

        {/* 流量统计卡片 - 移到顶部 */}
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
        </div>

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
                        {tunnelInfo.config.mode && (
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
                    color="default"
                    startContent={<FontAwesomeIcon icon={faSection} />}
                    className="w-full  h-7"
                    size="sm"
                  >
                    功能开发中...
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
          {/* 第一行：流量用量和速率 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 流量趋势 */}
            <Card className="p-2">
              <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">流量累计</h4>
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
                  <TrafficUsageChart
                    data={transformTrafficData(metricsData?.data)}
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
            {/* 连接池趋势 */}
            <Card className="p-2">
              <CardHeader className="pb-1 pt-2 px-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">池连接数</h4>
                <Button
                  size="sm"
                  variant="light"
                  isIconOnly
                  onPress={() => openFullscreenChart("pool", "池连接数")}
                  className="h-6 w-6 min-w-0"
                >
                  <FontAwesomeIcon icon={faExpand} className="text-xs" />
                </Button>
              </CardHeader>
              <CardBody className="pt-0 px-2 pb-2">
                <div className="h-[140px]">
                  <PoolChart
                    data={transformPoolData(metricsData?.data)}
                    height={140}
                    loading={metricsLoading && !metricsData}
                    error={metricsError || undefined}
                    className="h-full w-full"
                  />
                </div>
              </CardBody>
            </Card>
          </div>
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
          <CardHeader className="flex items-center  justify-between pb-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">日志</h3>
                {/* <Chip variant="flat" color="primary" size="sm">
                  {logCount} 条记录 {logDate ? `(${logDate})` : ''}
                </Chip> */}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 日期选择 */}
              <DatePicker
                size="sm"
                className="w-40"
                isDisabled={availableLogDates.length === 0}
                value={logDate ? parseDate(logDate) : null}
                onChange={(date) => {
                  if (date) {
                    const newDate = date.toString();
                    setLogDate(newDate);
                    // 触发日志刷新以获取新日期的日志内容
                    setLogRefreshTrigger(prev => prev + 1);
                  }
                }}
                isDateUnavailable={(date) => {
                  // 如果availableLogDates为空，则禁用所有日期
                  if (availableLogDates.length === 0) return true;
                  
                  // 只允许选择可用日期列表中的日期
                  const dateString = date.toString();
                  return !availableLogDates.includes(dateString);
                }}
                showMonthAndYearPickers
                granularity="day"
              />

              {/* 刷新按钮 */}
              <Tooltip content="刷新日志" placement="top">
                <Button
                  size="sm"
                  variant="flat"
                  isIconOnly
                  onPress={handleLogRefresh}
                  isLoading={logLoading}
                  className="h-8 w-8 min-w-0"
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
                  className="h-8 w-8 min-w-0"
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
                  isDisabled={exportLoading}
                  className="h-8 w-8 min-w-0"
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
                    className="h-8 w-8 min-w-0"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-xs" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-3">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">确认清空日志</p>
                    <p className="text-xs text-default-500">
                      此操作将清空页面显示和所有已保存的日志文件，且不可撤销。
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        color="danger"
                        onPress={() => {
                          if ((window as any).fileLogViewerRef) {
                            (window as any).fileLogViewerRef.clear();
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
      <Modal
        isOpen={isRenameModalOpen}
        onOpenChange={setIsRenameModalOpen}
        placement="center"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faPen} className="text-primary" />
                  修改实例名称
                </div>
              </ModalHeader>
              <ModalBody>
                <Input
                  label="实例名称"
                  placeholder="请输入新的实例名称"
                  value={newTunnelName}
                  onValueChange={setNewTunnelName}
                  variant="bordered"
                  isDisabled={isRenameLoading}
                />
              </ModalBody>
              <ModalFooter>
                <Button
                  color="default"
                  variant="light"
                  onPress={onClose}
                  isDisabled={isRenameLoading}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  onPress={handleRenameSubmit}
                  isLoading={isRenameLoading}
                >
                  确认修改
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 全屏图表模态 */}
      <FullscreenChartModal
        isOpen={fullscreenModalOpen}
        onOpenChange={setFullscreenModalOpen}
        chartType={fullscreenChartType}
        title={fullscreenChartTitle}
        trafficData={transformTrafficData(metricsData?.data)}
        speedData={transformSpeedData(metricsData?.data)}
        poolData={transformPoolData(metricsData?.data)}
        latencyData={transformLatencyData(metricsData?.data)}
        loading={metricsLoading}
        error={metricsError || undefined}
        onRefresh={refreshMetrics}
      />
    </>
  );
}
