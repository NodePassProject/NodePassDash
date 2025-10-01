"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
  cn,
} from "@heroui/react";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRocket,
  faPlay,
  faStop,
  faExclamationTriangle,
  faUnlink,
} from "@fortawesome/free-solid-svg-icons";
import { faTrash, faRotateRight } from "@fortawesome/free-solid-svg-icons";

import { fontSans } from "@/config/fonts";
import { buildApiUrl } from "@/lib/utils";
import { TrafficOverviewChart } from "@/components/ui/traffic-overview-chart";
import { DemoQuickEntryCard } from "@/components/ui/demo-quick-entry-card";
import { ServerIcon } from "@/components/ui/server-icon";
import { ServerIconRed } from "@/components/ui/server-red-icon";
import { useSettings } from "@/components/providers/settings-provider";
import { WeeklyStatsChart } from "@/components/ui/weekly-stats-chart";
import { DailyStatsChart } from "@/components/ui/daily-stats-chart";

// 统计数据类型
interface TunnelStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
  offline: number;
  total_endpoints: number;
}

// 操作日志类型
interface OperationLog {
  id: string;
  time: string;
  action: string;
  instance: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
    icon: string;
  };
  message?: string;
}

// 流量趋势数据类型
interface TrafficTrendData {
  hourTime: number; // Unix时间戳（秒）
  hourDisplay: string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
  recordCount: number;
}

// 常量定义 - 减少内存占用
const MAX_TRAFFIC_DATA_POINTS = 50; // 从200减少到50，减少75%内存占用
const MAX_OPERATION_LOGS = 20; // 从100减少到20，减少80%内存占用

// 主控状态类型
type EndpointStatus = "ONLINE" | "OFFLINE" | "FAIL";

// 主控类型
interface Endpoint {
  id: number;
  name: string;
  url: string;
  status: EndpointStatus;
  tunnelCount: number;
}

/**
 * 仪表盘页面 - 使用服务端事件 SSE 架构
 */
export default function DashboardPage() {
  const { settings } = useSettings();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [tunnelStats, setTunnelStats] = useState<TunnelStats>({
    total: 0,
    running: 0,
    stopped: 0,
    error: 0,
    offline: 0,
    total_endpoints: 0,
  });
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [trafficTrend, setTrafficTrend] = useState<TrafficTrendData[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [trafficLoading, setTrafficLoading] = useState(true);

  // 今日流量数据状态
  const [todayTrafficData, setTodayTrafficData] = useState<{
    tcpIn: number;
    tcpOut: number;
    udpIn: number;
    udpOut: number;
    total: number;
  }>({ tcpIn: 0, tcpOut: 0, udpIn: 0, udpOut: 0, total: 0 });

  // 每周流量数据状态
  const [weeklyStatsData, setWeeklyStatsData] = useState<
    Array<{
      weekday: string;
      "TCP In": number;
      "TCP Out": number;
      "UDP In": number;
      "UDP Out": number;
    }>
  >(() => {
    // 初始化时生成默认的7天0值数据
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return weekdays.map((weekday) => ({
      weekday,
      "TCP In": 0,
      "TCP Out": 0,
      "UDP In": 0,
      "UDP Out": 0,
    }));
  });

  // 生成默认的7天0值数据
  const generateDefaultWeeklyData = useCallback(() => {
    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return weekdays.map((weekday) => ({
      weekday,
      "TCP In": 0,
      "TCP Out": 0,
      "UDP In": 0,
      "UDP Out": 0,
    }));
  }, []);

  // 清空日志确认模态框控制
  const {
    isOpen: isClearOpen,
    onOpen: onClearOpen,
    onClose: onClearClose,
  } = useDisclosure();
  const [clearingLogs, setClearingLogs] = useState(false);

  // 添加组件挂载状态检查
  const isMountedRef = useRef(true);

  // 组件挂载/卸载管理
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // 立即清理所有大数据集状态，释放内存
      setTunnelStats({
        total: 0,
        running: 0,
        stopped: 0,
        error: 0,
        offline: 0,
        total_endpoints: 0,
      });
      setOperationLogs([]);
      setTrafficTrend([]);
      setEndpoints([]);
      setTodayTrafficData({
        tcpIn: 0,
        tcpOut: 0,
        udpIn: 0,
        udpOut: 0,
        total: 0,
      });
      setWeeklyStatsData([]);

      // 强制触发垃圾回收提示（开发环境）
      if (process.env.NODE_ENV === "development") {
        console.log("[Dashboard] 组件卸载，已清理所有数据状态");
      }
    };
  }, []);

  // 更新时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 获取tunnel统计数据
  const fetchTunnelStats = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/dashboard/tunnel-stats"));

      if (!response.ok) throw new Error("获取tunnel统计数据失败");
      const result = await response.json();

      if (result.success && result.data && isMountedRef.current) {
        setTunnelStats(result.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取tunnel统计数据失败:", error);
      }
    }
  }, []);

  // 获取操作日志数据
  const fetchOperationLogs = useCallback(async () => {
    try {
      // 直接从API层面限制数据量，减少网络传输和内存占用
      const response = await fetch(
        buildApiUrl(`/api/dashboard/operate_logs?limit=${MAX_OPERATION_LOGS}`),
      );

      if (!response.ok) throw new Error("获取操作日志失败");
      const data: OperationLog[] = await response.json();

      if (isMountedRef.current) {
        // API已经限制了数量，但仍进行客户端保护
        const limitedLogs =
          data.length > MAX_OPERATION_LOGS
            ? data.slice(-MAX_OPERATION_LOGS)
            : data;

        setOperationLogs(limitedLogs);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取操作日志失败:", error);
      }
    }
  }, []);

  // 处理IP地址隐藏的函数 - 优化依赖，避免不必要的重创建
  const maskIpAddress = useCallback(
    (url: string): string => {
      // 如果隐私模式关闭，直接返回原始URL
      if (!settings.isPrivacyMode) {
        return url;
      }

      try {
        // IPv4 正则表达式：匹配 x.x.x.x 格式
        const ipv4Regex = /(\d{1,3}\.\d{1,3}\.)(\d{1,3}\.\d{1,3})/g;

        // IPv6 正则表达式：匹配方括号内的IPv6地址
        const ipv6Regex = /(\[)([0-9a-fA-F:]+)(\])/g;

        let maskedUrl = url;

        // 处理IPv4地址 - 隐藏后两段
        maskedUrl = maskedUrl.replace(ipv4Regex, "$1***.***");

        // 处理IPv6地址 - 隐藏最后几段
        maskedUrl = maskedUrl.replace(ipv6Regex, (match, start, ipv6, end) => {
          const segments = ipv6.split(":");

          if (segments.length >= 4) {
            // 保留前面几段，隐藏后面的段
            const visibleSegments = segments.slice(
              0,
              Math.max(2, segments.length - 2),
            );
            const hiddenCount = segments.length - visibleSegments.length;

            return `${start}${visibleSegments.join(":")}${hiddenCount > 0 ? ":***" : ""}${end}`;
          }

          return match;
        });

        return maskedUrl;
      } catch (error) {
        // 如果处理失败，返回原始URL
        return url;
      }
    },
    [settings?.isPrivacyMode],
  ); // 使用可选链操作符，减少依赖变化

  // 格式化字节数 - 纯函数，不需要useCallback
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 处理今日流量数据 - 通过最早和最晚时间的差值计算今日消耗流量
  const processTodayTrafficData = useCallback(
    (trafficData: TrafficTrendData[]) => {
      if (!isMountedRef.current || !trafficData?.length) return;

      const today = new Date();
      const todayStartTimestamp = Math.floor(
        new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        ).getTime() / 1000,
      );

      // 筛选出今天的数据
      const todayData = trafficData.filter(
        (item) => item.hourTime >= todayStartTimestamp,
      );

      if (todayData.length === 0) {
        // 如果没有今天的数据，设置为0
        if (isMountedRef.current) {
          setTodayTrafficData({
            tcpIn: 0,
            tcpOut: 0,
            udpIn: 0,
            udpOut: 0,
            total: 0,
          });
        }

        return;
      }

      // 按时间排序，确保数据是按时间顺序的
      const sortedTodayData = todayData.sort((a, b) => a.hourTime - b.hourTime);

      // 获取最早和最晚的时间点数据
      const earliestData = sortedTodayData[0];
      const latestData = sortedTodayData[sortedTodayData.length - 1];

      // 计算差值（最晚 - 最早 = 今日消耗流量）
      const todayTraffic = {
        tcpIn: Math.max(0, latestData.tcpRx - earliestData.tcpRx),
        tcpOut: Math.max(0, latestData.tcpTx - earliestData.tcpTx),
        udpIn: Math.max(0, latestData.udpRx - earliestData.udpRx),
        udpOut: Math.max(0, latestData.udpTx - earliestData.udpTx),
        total: 0,
      };

      // 计算总流量
      todayTraffic.total =
        todayTraffic.tcpIn +
        todayTraffic.tcpOut +
        todayTraffic.udpIn +
        todayTraffic.udpOut;

      if (isMountedRef.current) {
        setTodayTrafficData(todayTraffic);
      }
    },
    [],
  );

  // 获取主控数据
  const fetchEndpoints = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/endpoints/simple"));

      if (!response.ok) throw new Error("获取主控数据失败");
      const data: Endpoint[] = await response.json();

      if (isMountedRef.current) {
        setEndpoints(data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取主控数据失败:", error);
      }
    }
  }, []);

  // 获取流量趋势数据
  const fetchTrafficTrend = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/dashboard/traffic-trend"));

      if (!response.ok) throw new Error("获取流量趋势数据失败");

      const result = await response.json();

      if (result.success && isMountedRef.current) {
        // 限制流量数据点数量，防止内存溢出 - 只保留最新的数据点
        const limitedData =
          result.data.length > MAX_TRAFFIC_DATA_POINTS
            ? result.data.slice(-MAX_TRAFFIC_DATA_POINTS)
            : result.data;

        setTrafficTrend(limitedData);
        // 处理今日流量数据
        processTodayTrafficData(limitedData);
        console.log("[仪表盘前端] 流量趋势数据获取成功:", {
          原始数据条数: result.data.length,
          限制后数据条数: limitedData.length,
          示例数据: limitedData.slice(0, 3),
        });
      } else if (isMountedRef.current) {
        throw new Error(result.error || "获取流量趋势数据失败");
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取流量趋势数据失败:", error);
        setTrafficTrend([]); // 设置为空数组，显示无数据状态
      }
    }
  }, []);

  // 获取每周统计数据
  const fetchWeeklyStats = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/dashboard/weekly-stats"));

      if (!response.ok) throw new Error("获取每周统计数据失败");

      const result = await response.json();

      if (result.success && isMountedRef.current) {
        // 转换后端数据格式为图表组件需要的格式
        let chartData = result.data.map((item: any) => ({
          weekday: item.weekday,
          "TCP In": Math.max(0, Number(item.tcp_in) || 0),
          "TCP Out": Math.max(0, Number(item.tcp_out) || 0),
          "UDP In": Math.max(0, Number(item.udp_in) || 0),
          "UDP Out": Math.max(0, Number(item.udp_out) || 0),
        }));

        // 如果后端没有返回数据或数据不足7天，生成默认的7天0值数据
        if (!chartData || chartData.length === 0) {
          chartData = generateDefaultWeeklyData();
        }

        setWeeklyStatsData(chartData);
        console.log("[仪表盘前端] 每周统计数据获取成功:", {
          数据条数: chartData.length,
          示例数据: chartData.slice(0, 3),
        });
      } else if (isMountedRef.current) {
        throw new Error(result.error || "获取每周统计数据失败");
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取每周统计数据失败:", error);
        // 出错时也设置默认的7天0值数据，而不是空数组
        setWeeklyStatsData(generateDefaultWeeklyData());
      }
    }
  }, [generateDefaultWeeklyData]);

  // 确认清空日志
  const confirmClearLogs = useCallback(async () => {
    if (operationLogs.length === 0) return;
    setClearingLogs(true);
    try {
      const response = await fetch(buildApiUrl("/api/dashboard/operate_logs"), {
        method: "DELETE",
      });
      const data = await response.json();

      if (response.ok && data.success && isMountedRef.current) {
        setOperationLogs([]);
        onClearClose();
      } else if (isMountedRef.current) {
        console.error("清空失败:", data.error || "无法清空日志");
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("清空操作日志失败:", error);
      }
    } finally {
      if (isMountedRef.current) {
        setClearingLogs(false);
      }
    }
  }, [operationLogs.length, onClearClose]);

  // 初始化数据 - 改为分批加载，减少同时加载的内存压力
  useEffect(() => {
    const fetchData = async () => {
      if (!isMountedRef.current) return;

      setLoading(true);
      setTrafficLoading(true);

      try {
        // 第一批：加载基础统计数据（优先级最高）
        console.log("[仪表盘] 加载第一批数据：基础统计");
        await fetchTunnelStats();
        await fetchEndpoints();

        if (!isMountedRef.current) return;

        // 第二批：加载流量相关数据
        console.log("[仪表盘] 加载第二批数据：流量统计");
        await fetchTrafficTrend();
        await fetchWeeklyStats();

        if (!isMountedRef.current) return;

        // 第三批：加载操作日志（优先级最低）
        console.log("[仪表盘] 加载第三批数据：操作日志");
        await fetchOperationLogs();

        console.log("[仪表盘] 所有数据加载完成");
      } catch (error) {
        if (isMountedRef.current) {
          console.error("加载数据失败:", error);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setTrafficLoading(false);
        }
      }
    };

    fetchData();
  }, [
    fetchTunnelStats,
    fetchOperationLogs,
    fetchTrafficTrend,
    fetchEndpoints,
    fetchWeeklyStats,
  ]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // 表格列定义
  const columns = [
    { key: "time", label: "时间" },
    { key: "action", label: "操作" },
    { key: "instance", label: "实例" },
    { key: "status", label: "状态" },
  ];

  // 根据操作类型获取图标和样式 - 纯函数，不需要useCallback
  const getActionIconAndColor = (action: string) => {
    const actionLower = action.toLowerCase();

    if (actionLower.includes("start") || actionLower.includes("启动")) {
      return {
        icon: faPlay,
        color: "success" as const,
        bgColor: "bg-success/10",
        textColor: "text-success",
      };
    } else if (actionLower.includes("stop") || actionLower.includes("停止")) {
      return {
        icon: faStop,
        color: "danger" as const,
        bgColor: "bg-danger/10",
        textColor: "text-danger",
      };
    } else if (actionLower.includes("create") || actionLower.includes("创建")) {
      return {
        icon: faRocket,
        color: "primary" as const,
        bgColor: "bg-primary/10",
        textColor: "text-primary",
      };
    } else if (actionLower.includes("delete") || actionLower.includes("删除")) {
      return {
        icon: faTrash,
        color: "danger" as const,
        bgColor: "bg-danger/10",
        textColor: "text-danger",
      };
    } else if (
      actionLower.includes("restart") ||
      actionLower.includes("重启")
    ) {
      return {
        icon: faRotateRight,
        color: "warning" as const,
        bgColor: "bg-warning/10",
        textColor: "text-warning",
      };
    } else {
      // 默认图标
      return {
        icon: faExclamationTriangle,
        color: "default" as const,
        bgColor: "bg-default/10",
        textColor: "text-default-600",
      };
    }
  };

  return (
    <div
      className={cn("space-y-4 md:space-y-6 p-4 md:p-0", fontSans.className)}
    >
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">👋 概览</h1>
          <p className="text-sm md:text-base text-default-500">
            当前时间 {formatTime(currentTime)}
          </p>
        </div>

        <div className="flex gap-4 md:gap-6">
          <div className="text-center">
            <div className="text-xl md:text-2xl font-bold text-primary">
              {loading ? "--" : tunnelStats.total}
            </div>
            <div className="text-xs md:text-sm text-default-500">实例数</div>
          </div>
          <div className="text-center">
            <div className="text-xl md:text-2xl font-bold text-secondary">
              {loading ? "--" : tunnelStats.total_endpoints}
            </div>
            <div className="text-xs md:text-sm text-default-500">主控数</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          isPressable
          className="p-3 md:p-4 bg-gradient-to-br from-success-50 to-success-100/50 dark:from-success-900/20 dark:to-success-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          classNames={{
            base: "bg-content1 outline-none transition-transform-background motion-reduce:transition-none",
          }}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">
                  运行
                </span>
                <span className="text-xl md:text-2xl font-semibold text-success">
                  {loading ? "--" : tunnelStats.running}
                </span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-success/10 text-success">
                <FontAwesomeIcon
                  className="!w-6 !h-6"
                  icon={faPlay}
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          className="p-3 md:p-4 bg-gradient-to-br from-danger-50 to-danger-100/50 dark:from-danger-900/20 dark:to-danger-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          classNames={{
            base: "bg-content1 outline-none transition-transform-background motion-reduce:transition-none",
          }}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">
                  停止
                </span>
                <span className="text-xl md:text-2xl font-semibold text-danger">
                  {loading ? "--" : tunnelStats.stopped}
                </span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-danger/10 text-danger">
                <FontAwesomeIcon
                  className="!w-6 !h-6"
                  icon={faStop}
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          className="p-3 md:p-4 bg-gradient-to-br from-warning-50 to-warning-100/50 dark:from-warning-900/20 dark:to-warning-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          classNames={{
            base: "bg-content1 outline-none transition-transform-background motion-reduce:transition-none",
          }}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">
                  错误
                </span>
                <span className="text-xl md:text-2xl font-semibold text-warning">
                  {loading ? "--" : tunnelStats.error}
                </span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-warning/10 text-warning">
                <FontAwesomeIcon
                  className="!w-6 !h-6"
                  icon={faExclamationTriangle}
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card
          isPressable
          className="p-3 md:p-4 bg-gradient-to-br from-default-50 to-default-100/50 dark:from-default-900/20 dark:to-default-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          classNames={{
            base: "bg-content1 outline-none transition-transform-background motion-reduce:transition-none",
          }}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">
                  离线
                </span>
                <span className="text-xl md:text-2xl font-semibold text-default-600">
                  {loading ? "--" : tunnelStats.offline}
                </span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-default/10 text-default-600">
                <FontAwesomeIcon
                  className="!w-6 !h-6"
                  icon={faUnlink}
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 流量概览和主控列表 - 响应式布局 */}
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* 流量概览 - 在移动端占满宽度，桌面端占2列 */}
        <div className="lg:col-span-2 lg:h-full">
          <TrafficOverviewChart
            data={trafficTrend.map((item) => ({
              time: new Date(item.hourTime * 1000).toISOString(), // 将时间戳转换为ISO字符串
              tcpIn: item.tcpRx,
              tcpOut: item.tcpTx,
              udpIn: item.udpRx,
              udpOut: item.udpTx,
            }))}
            loading={trafficLoading}
            timeRange="24Hours"
            onTimeRangeChange={(range) => {
              console.log("时间范围变化:", range);
              // 这里可以根据时间范围重新获取数据
            }}
          />
        </div>

        {/* 主控列表 - 右侧卡片 */}
        <div className="lg:h-full">
          <Card className=" h-[469px] dark:border-default-100 border border-transparent">
            <CardHeader className="p-5 pb-0">
              <div className="flex flex-col items-start gap-1 w-full">
                <span className="text-base font-semibold text-foreground">
                  主控列表
                </span>
              </div>
            </CardHeader>
            <CardBody className="p-5 pt-3 overflow-hidden">
              <div className="h-full overflow-y-auto scrollbar-hide">
                <div className="space-y-3 pb-5">
                {loading ? (
                  // 加载状态骨架屏
                  [1, 2, 3, 4].map((i) => (
                    <Card
                      key={i}
                      className="w-full h-[80px] bg-white dark:bg-default-50"
                    >
                      <CardBody className="p-4">
                        <div className="flex items-center gap-4 h-full">
                          {/* 左侧：SVG图标骨架 */}
                          <div className="w-8 h-8 bg-default-300 rounded animate-pulse flex-shrink-0" />

                          {/* 右侧：信息骨架 */}
                          <div className="flex flex-col justify-center gap-1 flex-1">
                            <div className="w-20 h-4 bg-default-300 rounded animate-pulse" />
                            <div className="w-32 h-3 bg-default-300 rounded animate-pulse" />
                            <div className="w-16 h-3 bg-default-200 rounded animate-pulse" />
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                ) : endpoints.length > 0 ? (
                  // 主控卡片列表 - 竖向排列
                  endpoints.map((endpoint) => (
                    <Card
                      key={endpoint.id}
                      className="w-full h-[80px]  bg-white dark:bg-default-100"
                    >
                      <CardBody className="p-4">
                        <div className="flex items-center h-full">
                          {/* 左侧：服务器图标 */}
                          <div className="flex-shrink-0 -ml-1">
                            {endpoint.status === "ONLINE" ? (
                              <ServerIcon
                                className="text-default-400"
                                size={64}
                              />
                            ) : (
                              <ServerIconRed
                                className="text-default-400"
                                size={64}
                              />
                            )}
                          </div>

                          {/* 右侧：主控信息 */}
                          <div className="flex flex-col justify-center gap-1 flex-1 min-w-0">
                            {/* 主控名称和实例数量 */}
                            <div className="flex items-center gap-1 min-w-0">
                              <h4 className="font-medium text-sm text-foreground truncate">
                                {endpoint.name}
                              </h4>
                              <Chip
                                classNames={{
                                  base: "text-xs",
                                  content: "text-xs",
                                }}
                                color="default"
                                size="sm"
                                variant="flat"
                              >
                                {endpoint.tunnelCount || 0} 个实例
                              </Chip>
                            </div>

                            {/* 主控地址 - 根据隐私模式显示 */}
                            <p className="text-xs text-default-500 truncate font-mono">
                              {maskIpAddress(endpoint.url)}
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))
                ) : (
                  // 无主控时的空状态
                  <div className="flex items-center justify-center h-32">
                    <div className="text-center">
                      <p className="text-default-500 text-sm">暂无主控</p>
                      <p className="text-default-400 text-xs mt-1">
                        请先添加主控服务器
                      </p>
                    </div>
                  </div>
                )}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 快捷操作和其他卡片 - 三列布局 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* 本周统计 - 中间占三分之一 */}
        <div className="w-full">
          <WeeklyStatsChart
            categories={["TCP In", "TCP Out", "UDP In", "UDP Out"]}
            chartData={weeklyStatsData}
            color="primary"
            formatBytes={formatBytes}
            loading={trafficLoading}
            title="本周统计"
          />
        </div>

        {/* 今日统计 - 右侧占三分之一 */}
        <div className="w-full">
          <DailyStatsChart
            categories={["TCP In", "TCP Out", "UDP In", "UDP Out"]}
            chartData={[
              {
                name: "TCP In",
                value: todayTrafficData.tcpIn,
                valueText: formatBytes(todayTrafficData.tcpIn),
              },
              {
                name: "TCP Out",
                value: todayTrafficData.tcpOut,
                valueText: formatBytes(todayTrafficData.tcpOut),
              },
              {
                name: "UDP In",
                value: todayTrafficData.udpIn,
                valueText: formatBytes(todayTrafficData.udpIn),
              },
              {
                name: "UDP Out",
                value: todayTrafficData.udpOut,
                valueText: formatBytes(todayTrafficData.udpOut),
              },
            ]}
            color="success"
            formatBytes={formatBytes}
            loading={trafficLoading}
            title="今日流量"
            total={todayTrafficData.total}
            unitTitle="Total"
          />
        </div>

        {/* 快捷操作按钮 - 左侧占三分之一 */}
        <div className="w-full">
          <DemoQuickEntryCard />
        </div>
      </div>

      {/* 最近活动 */}
      <Card isHoverable className="min-h-[400px]">
        <CardHeader className="p-5">
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col items-start gap-0">
                <span className="text-base font-semibold text-foreground">
                  最近活动
                </span>
                <span className="text-sm text-default-500">
                  {loading ? "加载中..." : `筛选最近100条记录`}
                </span>
              </div>
              <Button
                isIconOnly
                className="text-default-400 hover:text-danger"
                size="sm"
                title="清空最近活动"
                variant="light"
                onPress={onClearOpen}
              >
                <Icon
                  className="w-4 h-4"
                  icon="solar:trash-bin-minimalistic-bold"
                />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-4 pt-0">
          <div className="">
            <div className="h-[400px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <Table
                isHeaderSticky
                removeWrapper
                classNames={{
                  base: "overflow-visible",
                  table: operationLogs.length === 0 ? "min-h-[200px]" : "",
                  thead: "text-white border-none",
                  tbody: "",
                  tr: "",
                  td: "text-xs md:text-sm border-none",
                }}
                selectionMode="none"
              >
                <TableHeader columns={columns}>
                  {(column) => (
                    <TableColumn
                      key={column.key}
                      align="start"
                      className="bg-primary text-white border-none"
                      hideHeader={false}
                    >
                      {column.label}
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody
                  emptyContent={
                    <div className="text-center py-8">
                      <span className="text-default-400 text-xs md:text-sm">
                        {loading ? "加载中..." : "暂无操作记录"}
                      </span>
                    </div>
                  }
                  items={operationLogs}
                >
                  {(log) => (
                    <TableRow>
                      {(columnKey) => (
                        <TableCell>
                          {columnKey === "time" && (
                            <div className="text-xs md:text-sm">
                              {new Date(log.time).toLocaleString("zh-CN", {
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          )}
                          {columnKey === "action" && (
                            <div className="flex items-center gap-2">
                              <div
                                className={`flex items-center justify-center w-6 h-6 rounded-md ${getActionIconAndColor(log.action).bgColor}`}
                              >
                                <FontAwesomeIcon
                                  className={`!w-3 !h-3 ${getActionIconAndColor(log.action).textColor}`}
                                  icon={getActionIconAndColor(log.action).icon}
                                  style={{ width: "12px", height: "12px" }}
                                />
                              </div>
                              <span className="truncate text-xs md:text-sm">
                                {log.action}
                              </span>
                            </div>
                          )}
                          {columnKey === "instance" && (
                            <div className="truncate text-xs md:text-sm">
                              {log.instance}
                            </div>
                          )}
                          {columnKey === "status" && (
                            <Chip
                              classNames={{
                                base: "text-xs max-w-full",
                                content: "truncate",
                              }}
                              color={log.status.type}
                              size="sm"
                              startContent={
                                <Icon
                                  className="md:w-3.5 md:h-3.5"
                                  icon={log.status.icon}
                                  width={12}
                                />
                              }
                              variant="flat"
                            >
                              {log.status.text}
                            </Chip>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 清空操作日志确认模态框 */}
      <Modal isOpen={isClearOpen} onClose={onClearClose}>
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            确认清空最近活动
          </ModalHeader>
          <ModalBody>
            <p className="text-sm">
              此操作将删除所有最近活动记录，且不可撤销。确定要继续吗？
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClearClose}>
              取消
            </Button>
            <Button
              color="danger"
              isLoading={clearingLogs}
              onPress={confirmClearLogs}
            >
              确认清空
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
