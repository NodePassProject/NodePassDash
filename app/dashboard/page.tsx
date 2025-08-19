"use client";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Spacer,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
  cn
} from "@heroui/react";
import React, { useState, useEffect, useCallback, useRef } from "react";

import { Icon } from "@iconify/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faRocket,
  faPlay,
  faStop,
  faExclamationTriangle,
  faRecycle
} from "@fortawesome/free-solid-svg-icons";
import { TrafficOverviewChart } from "@/components/ui/traffic-overview-chart";
import { TodayTrafficChart } from "../../components/ui/today-traffic-chart";
import { ServerIcon } from "@/components/ui/server-icon";
import { ServerIconRed } from "@/components/ui/server-red-icon";
import { QuickEntryCard } from "@/components/ui/quick-entry-card";
import { FlexBox } from "@/components";
import { useRouter } from "next/navigation";


import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { buildApiUrl } from '@/lib/utils';
import { addToast } from "@heroui/toast";
import { useSettings } from '@/components/providers/settings-provider';

// Prisma 已移除，定义本地 EndpointStatus 枚举
type EndpointStatus = 'ONLINE' | 'OFFLINE' | 'FAIL';

// 统计数据类型
interface TunnelStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
  offline: number;
}

// 实例实例类型（用于统计）
interface TunnelInstance {
  id: number;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
}

// 主控类型
interface Endpoint {
  id: number;
  name: string;
  url: string;
  status: EndpointStatus;
  tunnelCount: number;
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

// 添加流量趋势数据类型
interface TrafficTrendData {
  hourTime: number; // Unix时间戳（秒）
  hourDisplay: string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
  recordCount: number;
}

/**
 * 仪表盘页面 - 显示系统概览和状态信息
 */
export default function DashboardPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [overallStats, setOverallStats] = useState({
    total_endpoints: 0,
    total_tunnels: 0,
    total_traffic: 0,
    current_speed: 0
  });
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [trafficTrend, setTrafficTrend] = useState<TrafficTrendData[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(true);
  
  // 添加tunnel统计数据状态
  const [tunnelStats, setTunnelStats] = useState<TunnelStats>({ total: 0, running: 0, stopped: 0, error: 0, offline: 0 });

  // 今日流量数据状态
  const [todayTrafficData, setTodayTrafficData] = useState<{
    tcpIn: number;
    tcpOut: number;
    udpIn: number;
    udpOut: number;
    total: number;
  }>({ tcpIn: 0, tcpOut: 0, udpIn: 0, udpOut: 0, total: 0 });

  // 清空日志确认模态框控制
  const { isOpen: isClearOpen, onOpen: onClearOpen, onClose: onClearClose } = useDisclosure();
  const [clearingLogs, setClearingLogs] = useState(false);

  // 主控显示控制
  const [showAllEndpoints, setShowAllEndpoints] = useState(false);
  const maxVisibleEndpoints = 4; // 默认显示的主控数量

  // 添加组件挂载状态检查
  const isMountedRef = useRef(true);
  const mountCountRef = useRef(0);

  // 组件挂载/卸载管理
  useEffect(() => {
    mountCountRef.current += 1;
    isMountedRef.current = true; // 重置挂载状态
    console.log(`[仪表盘] 组件挂载，第${mountCountRef.current}次`);
    
    return () => {
      console.log(`[仪表盘] 组件卸载，第${mountCountRef.current}次`);
      isMountedRef.current = false;
      
      // 清理所有状态数据，释放内存
      setOverallStats({ total_endpoints: 0, total_tunnels: 0, total_traffic: 0, current_speed: 0 });
      setEndpoints([]);
      setOperationLogs([]);
      setTrafficTrend([]);
      setTunnelStats({ total: 0, running: 0, stopped: 0, error: 0, offline: 0 });
      setTodayTrafficData({ tcpIn: 0, tcpOut: 0, udpIn: 0, udpOut: 0, total: 0 });
      
      console.log('[仪表盘] 资源清理完成');
    };
  }, []);



  // 确认清空日志
  const confirmClearLogs = useCallback(async () => {
    if (operationLogs.length === 0) return;
    setClearingLogs(true);
    try {
      const response = await fetch(buildApiUrl('/api/dashboard/operate_logs'), {
        method: 'DELETE',
      });
      const data = await response.json();

      if (response.ok && data.success && isMountedRef.current) {
        setOperationLogs([]);
        addToast({
          title: '清空成功',
          description: `已清空 ${data.deletedCount ?? 0} 条记录`,
          color: 'success',
        });
        onClearClose();
      } else if (isMountedRef.current) {
        addToast({
          title: '清空失败',
          description: data.error || '无法清空日志',
          color: 'danger',
        });
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('清空操作日志失败:', error);
        addToast({
          title: '清空失败',
          description: '网络错误，请稍后重试',
          color: 'danger',
        });
      }
    } finally {
      if (isMountedRef.current) {
        setClearingLogs(false);
      }
    }
  }, [operationLogs.length, onClearClose]);

  // 处理IP地址隐藏的函数
  const maskIpAddress = useCallback((url: string): string => {
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
      maskedUrl = maskedUrl.replace(ipv4Regex, '$1***.***');
      
      // 处理IPv6地址 - 隐藏最后几段
      maskedUrl = maskedUrl.replace(ipv6Regex, (match, start, ipv6, end) => {
        const segments = ipv6.split(':');
        if (segments.length >= 4) {
          // 保留前面几段，隐藏后面的段
          const visibleSegments = segments.slice(0, Math.max(2, segments.length - 2));
          const hiddenCount = segments.length - visibleSegments.length;
          return `${start}${visibleSegments.join(':')}${hiddenCount > 0 ? ':***' : ''}${end}`;
        }
        return match;
      });
      
      return maskedUrl;
    } catch (error) {
      // 如果处理失败，返回原始URL
      return url;
    }
  }, [settings.isPrivacyMode]);



  const columns = [
    { key: "time", label: "时间" },
    { key: "action", label: "操作" },
    { key: "instance", label: "实例" },
    { key: "status", label: "状态" },
  ];

  // 获取主控数据
  const fetchEndpoints = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/api/endpoints/simple'));
      
      if (!response.ok) throw new Error('获取主控数据失败');
      const data: Endpoint[] = await response.json();
      
      if (isMountedRef.current) {
        setEndpoints(data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('获取主控数据失败:', error);
      }
    }
  }, []);

  // 获取操作日志数据
  const fetchOperationLogs = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/api/dashboard/operate_logs?limit=1000'));
      
      if (!response.ok) throw new Error('获取操作日志失败');
      const data: OperationLog[] = await response.json();
      
      if (isMountedRef.current) {
        setOperationLogs(data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('获取操作日志失败:', error);
      }
    }
  }, []);

  // 获取流量趋势数据
  const fetchTrafficTrend = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/api/dashboard/traffic-trend'));
      
      if (!response.ok) throw new Error('获取流量趋势数据失败');
      
      const result = await response.json();
      if (result.success && isMountedRef.current) {
        setTrafficTrend(result.data);
        // 处理今日流量数据
        processTodayTrafficData(result.data);
        console.log('[仪表盘前端] 流量趋势数据获取成功:', {
          数据条数: result.data.length,
          示例数据: result.data.slice(0, 3)
        });
      } else if (isMountedRef.current) {
        throw new Error(result.error || '获取流量趋势数据失败');
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('获取流量趋势数据失败:', error);
        setTrafficTrend([]); // 设置为空数组，显示无数据状态
      }
    }
  }, []);

  // 获取tunnel统计数据
  const fetchTunnelStats = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/api/dashboard/tunnel-stats'));
      
      if (!response.ok) throw new Error('获取tunnel统计数据失败');
      const result = await response.json();
      
      if (result.success && result.data && isMountedRef.current) {
        setTunnelStats(result.data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error('获取tunnel统计数据失败:', error);
        addToast({
          title: '错误',
          description: '获取tunnel统计数据失败',
          color: 'danger'
        });
      }
    }
  }, []);

  // 格式化字节数
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }, []);

  // 处理今日流量数据 - 通过最早和最晚时间的差值计算今日消耗流量
  const processTodayTrafficData = useCallback((trafficData: TrafficTrendData[]) => {
    if (!isMountedRef.current || !trafficData?.length) return;
    
    const today = new Date();
    const todayStartTimestamp = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000);
    
    // 筛选出今天的数据
    const todayData = trafficData.filter(item => item.hourTime >= todayStartTimestamp);
    
    if (todayData.length === 0) {
      // 如果没有今天的数据，设置为0
      if (isMountedRef.current) {
        setTodayTrafficData({ tcpIn: 0, tcpOut: 0, udpIn: 0, udpOut: 0, total: 0 });
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
      total: 0
    };
    
    // 计算总流量
    todayTraffic.total = todayTraffic.tcpIn + todayTraffic.tcpOut + todayTraffic.udpIn + todayTraffic.udpOut;
    
    if (isMountedRef.current) {
      setTodayTrafficData(todayTraffic);
    }
  }, []);

  // 初始化数据 - 添加AbortController支持
  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchData = async () => {
      if (!isMountedRef.current) return;
      
      console.log('[仪表盘] 开始加载数据');
      setLoading(true);
      setTrafficLoading(true);
      
      try {
        await Promise.all([
          fetchEndpoints(),
          fetchTunnelStats(),
          fetchOperationLogs(),
          fetchTrafficTrend()
        ]);
        
        if (isMountedRef.current) {
          console.log('[仪表盘] 所有数据加载完成');
        }
      } catch (error) {
        if (!abortController.signal.aborted && isMountedRef.current) {
          console.error('加载数据失败:', error);
        }
      } finally {
        if (isMountedRef.current) {
          console.log('[仪表盘] 设置加载状态为false');
          setLoading(false);
          setTrafficLoading(false);
        }
      }
    };
    
    fetchData();
    
    return () => {
      abortController.abort();
    };
  }, [  fetchEndpoints, fetchTunnelStats, fetchOperationLogs, fetchTrafficTrend]);

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* 顶部统计卡片 - 从tunnels页面移过来的5个统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">总实例</span>
                <span className="text-xl md:text-2xl font-semibold text-primary">{loading ? "--" : tunnelStats.total}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 text-primary">
                <FontAwesomeIcon icon={faRocket} className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-success-50 to-success-100/50 dark:from-success-900/20 dark:to-success-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">运行中</span>
                <span className="text-xl md:text-2xl font-semibold text-success">{loading ? "--" : tunnelStats.running}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-success/10 text-success">
                <FontAwesomeIcon icon={faPlay} className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-danger-50 to-danger-100/50 dark:from-danger-900/20 dark:to-danger-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">已停止</span>
                <span className="text-xl md:text-2xl font-semibold text-danger">{loading ? "--" : tunnelStats.stopped}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-danger/10 text-danger">
                <FontAwesomeIcon icon={faStop} className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-warning-50 to-warning-100/50 dark:from-warning-900/20 dark:to-warning-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">有错误</span>
                <span className="text-xl md:text-2xl font-semibold text-warning">{loading ? "--" : tunnelStats.error}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-warning/10 text-warning">
                <FontAwesomeIcon icon={faExclamationTriangle} className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-default-50 to-default-100/50 dark:from-default-900/20 dark:to-default-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">已离线</span>
                <span className="text-xl md:text-2xl font-semibold text-default-600">{loading ? "--" : tunnelStats.offline}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-default/10 text-default-600">
                <FontAwesomeIcon icon={faRecycle} className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 中间内容区域 - 响应式布局 */}
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6" style={{ minHeight: '400px' }}>
        {/* 流量概览 - 在移动端占满宽度，桌面端占2列 */}
        <div className="lg:col-span-2 lg:h-full">
          <TrafficOverviewChart 
            data={trafficTrend.map(item => ({
              time: new Date(item.hourTime * 1000).toISOString(), // 将时间戳转换为ISO字符串
              tcpIn: item.tcpRx,
              tcpOut: item.tcpTx,
              udpIn: item.udpRx,
              udpOut: item.udpTx,
            }))}
            loading={trafficLoading}
            timeRange="24Hours"
            onTimeRangeChange={(range) => {
              console.log('时间范围变化:', range);
              // 这里可以根据时间范围重新获取数据
              // fetchTrafficTrend(range);
            }}
          />
        </div>

        {/* 右侧卡片区域 - 快捷按钮和今日统计 */}
        <div className="flex flex-col gap-4 md:gap-6 lg:h-full">
          {/* 快捷操作组件 */}
          {/* <QuickActions /> */}
          <div className="lg:flex-shrink-0">
            <QuickEntryCard />
          </div>
          {/* 今日流量统计图表 */}
          <div className="lg:flex-1 lg:min-h-0">
            <TodayTrafficChart
              title="今日统计"
              value={formatBytes(todayTrafficData.total)}
              unit="总流量"
              color="primary"
              categories={["TCP入站", "TCP出站", "UDP入站", "UDP出站"]}
              chartData={[
                { name: "tcp入站", value: todayTrafficData.tcpIn },
                { name: "tcp出站", value: todayTrafficData.tcpOut },
                { name: "udp入站", value: todayTrafficData.udpIn },
                { name: "udp出站", value: todayTrafficData.udpOut },
              ]}
              loading={trafficLoading}
            />
          </div>
        </div>
      </div>

      {/* 主控状态卡片行 - 横向滚动 */}
      <div className="space-y-3">
        {/* <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">主控状态</h3>
          <Button
            size="sm"
            variant="light"
            onPress={() => router.push("/endpoints")}
            startContent={<FontAwesomeIcon icon={faServer} className="w-4 h-4" />}
          >
            管理主控
          </Button>
        </div> */}
        <div className="scrollbar-hide bg-transparent">
          {/* 桌面端：水平滚动布局 */}
          <div className="hidden md:flex gap-4 pb-2" style={{ minWidth: 'max-content' }}>
            {loading ? (
              // 加载状态骨架屏
              [1, 2, 3, 4].map((i) => (
                <Card key={i} className="w-[260px] h-[80px] flex-shrink-0 bg-white dark:bg-default-50">
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
            ) : (
              <>
                {/* 主控卡片 - 只显示前4个 */}
                {endpoints.slice(0, 4).map((endpoint) => (
                  <Card 
                    key={endpoint.id} 
                    className="w-[260px] h-[80px] flex-shrink-0 "
                  >
                    <CardBody className="p-4">
                      <div className="flex items-center h-full">
                        {/* 左侧：大号服务器图标 */}
                        <div className="flex-shrink-0 -ml-1">
                          {endpoint.status === 'ONLINE' ? (
                            <ServerIcon size={64} className="text-default-400" />
                          ) : (
                            <ServerIconRed size={64} className="text-default-400" />
                          )}
                        </div>
                        
                        {/* 右侧：主控信息 */}
                        <div className="flex flex-col justify-center gap-1 flex-1 min-w-0">
                          {/* 主控名称和实例数量 */}
                          <div className="flex items-center gap-1 min-w-0">
                            <h4 className="font-medium text-sm text-foreground truncate">{endpoint.name}</h4>
                            <Chip 
                              size="sm" 
                              variant="flat" 
                              color="default"
                              classNames={{
                                base: "text-xs",
                                content: "text-xs"
                              }}
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
                ))}
                
                {/* 省略号按钮 - 超过4个时显示 */}
                {endpoints.length > 4 && (
                  <Card 
                    className="w-[120px] h-[80px] flex-shrink-0 shadow-none border-2 border-dashed border-default-300 bg-transparent hover:border-primary-300 cursor-pointer transition-colors"
                    isPressable
                    onPress={() => router.push("/endpoints")}
                  >
                    <CardBody className="p-4 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-xl text-default-400 ">···</div>
                        <div className="text-xs text-default-500">
                          还有 {endpoints.length - 4} 个
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )}
              </>
            )}
          </div>
          
          {/* 移动端：垂直堆叠布局 */}
          <div className="md:hidden flex flex-col gap-3 pb-2">
            {loading ? (
              // 移动端加载状态骨架屏
              [1, 2, 3, 4].map((i) => (
                <Card key={i} className="w-full h-[80px] bg-white dark:bg-default-50">
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
            ) : (
              <>
                {/* 移动端主控卡片 - 只显示前4个，撑满宽度 */}
                {endpoints.slice(0, 4).map((endpoint) => (
                  <Card 
                    key={endpoint.id} 
                    className="w-full h-[80px] shadow-none border-2 border-default-200 bg-white dark:bg-default-50"
                  >
                    <CardBody className="p-4">
                      <div className="flex items-center h-full">
                        {/* 左侧：大号服务器图标 */}
                        <div className="flex-shrink-0 -ml-1">
                          {endpoint.status === 'ONLINE' ? (
                            <ServerIcon size={64} className="text-default-400" />
                          ) : (
                            <ServerIconRed size={64} className="text-default-400" />
                          )}
                        </div>
                        
                        {/* 右侧：主控信息 */}
                        <div className="flex flex-col justify-center gap-1 flex-1 min-w-0">
                          {/* 主控名称和实例数量 */}
                          <div className="flex items-center gap-1 min-w-0">
                            <h4 className="font-medium text-sm text-foreground truncate">{endpoint.name}</h4>
                            <Chip 
                              size="sm" 
                              variant="flat" 
                              color="default"
                              classNames={{
                                base: "text-xs",
                                content: "text-xs"
                              }}
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
                ))}
                
                {/* 移动端省略号按钮 - 超过4个时显示 */}
                {endpoints.length > 4 && (
                  <Card 
                    className="w-full h-[80px] shadow-none border-2 border-dashed border-default-300 bg-transparent hover:border-primary-300 cursor-pointer transition-colors"
                    isPressable
                    onPress={() => router.push("/endpoints")}
                  >
                    <CardBody className="p-4 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-2xl text-default-400 mb-1">···</div>
                        <div className="text-xs text-default-500">
                          还有 {endpoints.length - 4} 个主控
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 最近活动 - 完全按照data-table.tsx的样式 */}
      <Card isHoverable className="min-h-[400px]">
        <CardHeader className="p-5">
          <div className="flex flex-col items-start gap-1 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col items-start gap-0">
                  <span className="text-base font-semibold text-foreground">最近活动</span>
                  <span className="text-sm text-default-500">
                    {loading ? "加载中..." : `筛选最近1000条记录`}
                  </span>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                className="text-default-400 hover:text-danger"
                onPress={onClearOpen}
                title="清空最近活动"
              >
                <Icon icon="solar:trash-bin-minimalistic-bold" className="w-4 h-4" />
              </Button>
            </div>
            
          </div>
        </CardHeader>
        <CardBody className="p-4 pt-0">
          <div className="">
            <div className="h-[400px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <Table
                isHeaderSticky
                selectionMode="none"
                removeWrapper
                classNames={{
                  base: "overflow-visible",
                  table: operationLogs.length === 0 ? "min-h-[200px]" : "",
                  thead: "text-white border-none",
                  tbody: "",
                  tr: "",
                  td: "text-xs md:text-sm border-none"
                }}
              >
            <TableHeader columns={columns}>
              {(column) => (
                <TableColumn
                  key={column.key}
                  hideHeader={false}
                  align="start"
                  className="bg-primary text-white border-none"
                >
                  {column.label}
                </TableColumn>
              )}
            </TableHeader>
            <TableBody 
              items={operationLogs}
              emptyContent={
                <div className="text-center py-8">
                  <span className="text-default-400 text-xs md:text-sm">
                    {loading ? "加载中..." : "暂无操作记录"}
                  </span>
                </div>
              }
            >
              {(log) => (
                <TableRow>
                  {(columnKey) => (
                    <TableCell>
                      {columnKey === "time" && (
                        <div className="text-xs md:text-sm">
                          {new Date(log.time).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      )}
                      {columnKey === "action" && (
                        <div className="truncate text-xs md:text-sm">{log.action}</div>
                      )}
                      {columnKey === "instance" && (
                        <div className="truncate text-xs md:text-sm">{log.instance}</div>
                      )}
                      {columnKey === "status" && (
                        <Chip
                          color={log.status.type}
                          size="sm"
                          variant="flat"
                          startContent={<Icon icon={log.status.icon} width={12} className="md:w-3.5 md:h-3.5" />}
                          classNames={{
                            base: "text-xs max-w-full",
                            content: "truncate"
                          }}
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
          <ModalHeader className="flex flex-col gap-1">确认清空最近活动</ModalHeader>
          <ModalBody>
            <p className="text-sm">此操作将删除所有最近活动记录，且不可撤销。确定要继续吗？</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClearClose}>取消</Button>
            <Button color="danger" onPress={confirmClearLogs} isLoading={clearingLogs}>确认清空</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
} 