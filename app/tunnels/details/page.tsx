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
  Snippet,
  Switch
} from "@heroui/react";
import React, { useEffect } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlay, faPause, faRotateRight, faTrash, faRefresh,faStop, faQuestionCircle, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { addToast } from "@heroui/toast";
import CellValue from "./cell-value";
import { useTunnelSSE } from '@/lib/hooks/use-sse';
import { useGlobalSSE } from '@/lib/hooks/use-sse';
import { FlowTrafficChart } from "@/components/ui/flow-traffic-chart";
import { useSearchParams } from 'next/navigation';
import { processAnsiColors } from "@/lib/utils/ansi";

interface TunnelInfo {
  id: string;
  instanceId: string;
  name: string;
  type: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  endpoint: string;
  endpointId: string;
  password?: string;
  config: {
    listenPort: number;
    targetPort: number;
    tls: boolean;
    logLevel: string;
    tlsMode?: string;  // 添加 tlsMode 字段
    endpointTLS?: string; // 主控的TLS配置
    endpointLog?: string; // 主控的Log配置
    min?: number | null;
    max?: number | null;
    restart: boolean; // 添加 restart 字段
  };
  traffic: {
    tcpRx: number;
    tcpTx: number;
    udpRx: number;
    udpTx: number;
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

interface LogEntry {
  id: number;
  message: string;
  isHtml: boolean;
  traffic: {
    tcpRx: number;
    tcpTx: number;
    udpRx: number;
    udpTx: number;
  };
  timestamp: Date;
}

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
}

// 添加流量单位转换函数
const formatTrafficValue = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(bytes);
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return {
    value: value.toFixed(2),
    unit: units[unitIndex]
  };
};

// 根据数据选择最合适的统一单位
const getBestUnit = (values: number[]) => {
  if (values.length === 0) return { unit: 'B', divisor: 1 };
  
  const maxValue = Math.max(...values);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const divisors = [1, 1024, 1024*1024, 1024*1024*1024, 1024*1024*1024*1024];
  
  let unitIndex = 0;
  let testValue = maxValue;
  
  while (testValue >= 1024 && unitIndex < units.length - 1) {
    testValue /= 1024;
    unitIndex++;
  }
  
  return {
    unit: units[unitIndex],
    divisor: divisors[unitIndex]
  };
};

// 将主控的TLS数字转换为对应的模式文案
const getTLSModeText = (tlsValue: string): string => {
  switch (tlsValue) {
    case '0':
      return '无 TLS 加密';
    case '1':
      return '自签名证书';
    case '2':
      return '自定义证书';
    default:
      return tlsValue; // 如果不是数字，直接返回原值
  }
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

export default function TunnelDetailPage({ params }: { params: Promise<PageParams> }) {
  // const resolvedParams = React.use(params);
  const router = useRouter();
  const [selectedTab, setSelectedTab] = React.useState<string>("日志");
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
  const [tunnelInfo, setTunnelInfo] = React.useState<TunnelInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [trafficData, setTrafficData] = React.useState<FlowTrafficData[]>([]);
  const [trafficTrend, setTrafficTrend] = React.useState<TrafficTrendData[]>([]);
  const [initialDataLoaded, setInitialDataLoaded] = React.useState(false);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
  const [trafficRefreshLoading, setTrafficRefreshLoading] = React.useState(false);
  const [trafficTimeRange, setTrafficTimeRange] = React.useState<"1h" | "6h" | "12h" | "24h">("24h");
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const searchParams = useSearchParams();
  const resolvedId = searchParams.get('id');

  // 是否移入回收站
  const [moveToRecycle, setMoveToRecycle] = React.useState(false);

  // 自动重启开关状态更新
  const [isUpdatingRestart, setIsUpdatingRestart] = React.useState(false);

  // 日志计数器，确保每个日志都有唯一的ID
  const logCounterRef = React.useRef(0);

  // 添加日志容器的引用
  const logContainerRef = React.useRef<HTMLDivElement>(null);

  // 添加延迟更新的引用，避免频繁调用API
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // 滚动到日志底部的函数
  const scrollToBottom = React.useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  // 处理Tab切换时的滚动
  const handleTabChange = React.useCallback((key: React.Key) => {
    const keyStr = key.toString();
    setSelectedTab(keyStr);
    // 如果切换到日志Tab，延迟滚动到底部确保DOM更新完成
    if (keyStr === "日志") {
      setTimeout(scrollToBottom, 100);
    }
  }, [scrollToBottom]);

  // 根据时间范围过滤数据
  const filterDataByTimeRange = React.useCallback((data: TrafficTrendData[], timeRange: "1h" | "6h" | "12h" | "24h") => {
    if (data.length === 0) return data;
    
    // 获取当前时间
    const now = new Date();
    const hoursAgo = timeRange === "1h" ? 1 : timeRange === "6h" ? 6 : timeRange === "12h" ? 12 : 24;
    const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    

    
    // 过滤数据
    const filteredData = data.filter((item, index) => {
      const timeStr = item.eventTime;
      if (!timeStr) return false;
      
      try {
        const [datePart, timePart] = timeStr.split(' ');
        if (datePart && timePart) {
          const [year, month, day] = datePart.split('-').map(Number);
          const [hour, minute] = timePart.split(':').map(Number);
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
  }, []);

  // 延迟更新页面数据的函数
  const scheduleDataUpdate = React.useCallback(() => {
    // 清除之前的定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // 设置2秒后更新数据
    updateTimeoutRef.current = setTimeout(async () => {
      
      setRefreshLoading(true);
      
      try {
        // 获取基本信息
        const detailsResponse = await fetch(`/api/tunnels/${resolvedId}/details`);
        if (!detailsResponse.ok) {
          throw new Error('获取实例详情失败');
        }
        
        const detailsData = await detailsResponse.json();
        
        // 更新实例信息
        if (detailsData.tunnelInfo) {
          setTunnelInfo(detailsData.tunnelInfo);
        }

        // 获取流量趋势数据
        const trafficResponse = await fetch(`/api/tunnels/${resolvedId}/traffic-trend`);
        if (trafficResponse.ok) {
          const trafficData = await trafficResponse.json();
          if (trafficData.trafficTrend && Array.isArray(trafficData.trafficTrend)) {
            setTrafficTrend(trafficData.trafficTrend);
          }
        }
        

      } catch (error) {
        console.error('[前端SSE] 延迟更新数据失败:', error);
      } finally {
        setRefreshLoading(false);
      }
      
      updateTimeoutRef.current = null;
    }, 2000);
    
    
  }, [resolvedId]);

  // 手动刷新页面数据的函数
  const handleRefresh = React.useCallback(async () => {
    if (refreshLoading) return; // 防抖：如果正在loading则直接返回
    
    
    setRefreshLoading(true);
    
    try {
      // 获取基本信息
      const detailsResponse = await fetch(`/api/tunnels/${resolvedId}/details`);
      if (!detailsResponse.ok) {
        throw new Error('获取实例详情失败');
      }
      
      const detailsData = await detailsResponse.json();
      
      // 更新实例信息
      if (detailsData.tunnelInfo) {
        setTunnelInfo(detailsData.tunnelInfo);
      }

      // 获取流量趋势数据
      const trafficResponse = await fetch(`/api/tunnels/${resolvedId}/traffic-trend`);
      if (trafficResponse.ok) {
        const trafficData = await trafficResponse.json();
        if (trafficData.trafficTrend && Array.isArray(trafficData.trafficTrend)) {
          setTrafficTrend(trafficData.trafficTrend);
        }
      }
      

    } catch (error) {
      console.error('[前端手动刷新] 刷新数据失败:', error);
      addToast({
        title: "刷新失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setRefreshLoading(false);
    }
  }, [resolvedId]);

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
    udp_out_rates: []
  });

  // 获取实例详情（不包含流量趋势）
  const fetchTunnelDetails = React.useCallback(async () => {
    try {
      setLoading(true);
      
      // 获取实例基本信息和历史数据
      const response = await fetch(`/api/tunnels/${resolvedId}/details`);
      if (!response.ok) {
        throw new Error('获取实例详情失败');
      }
      
      const data = await response.json();
      
      // 设置基本信息
      setTunnelInfo(data.tunnelInfo);
      

      
      // 设置历史日志 - 处理带时间信息的日志对象
      if (data.logs && Array.isArray(data.logs)) {
        // 初始化计数器为历史日志的数量，确保新日志ID不会与历史日志冲突
        logCounterRef.current = data.logs.length;
        
        // 检查日志数据格式
        if (data.logs.length > 0 && typeof data.logs[0] === 'object') {
          // 新格式：对象数组，包含时间信息 - 需要处理ANSI颜色
          const processedLogs = data.logs.map((log: any) => ({
            ...log,
            message: processAnsiColors(log.message), // 应用ANSI颜色处理
            isHtml: true // 启用HTML渲染
          }));
          setLogs(processedLogs);
        } else {
          // 旧格式：字符串数组，需要转换
          const formattedLogs = data.logs.map((message: string, index: number) => ({
            id: index + 1,
            message: processAnsiColors(message), // 应用ANSI颜色处理
            isHtml: true, // 启用HTML渲染
            traffic: {
              tcpRx: 0,
              tcpTx: 0,
              udpRx: 0,
              udpTx: 0
            },
            timestamp: new Date() // 使用当前时间作为占位符
          }));
          setLogs(formattedLogs);
        }
        
        // 稍微延迟滚动，确保DOM更新完成
        setTimeout(scrollToBottom, 100);
      }

      setInitialDataLoaded(true);
    } catch (error) {
      console.error('获取实例详情失败:', error);
      addToast({
        title: "获取实例详情失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  }, [resolvedId]);

  // 获取流量趋势数据
  const fetchTrafficTrend = React.useCallback(async () => {
    try {
      setTrafficRefreshLoading(true);
      
      const response = await fetch(`/api/tunnels/${resolvedId}/traffic-trend`);
      if (!response.ok) {
        throw new Error('获取流量趋势失败');
      }
      
      const data = await response.json();
      
      // 设置流量趋势数据
      if (data.trafficTrend && Array.isArray(data.trafficTrend)) {
        setTrafficTrend(data.trafficTrend);
        console.log('[流量趋势] 数据获取成功', {
          数据点数: data.trafficTrend.length,
          最新数据: data.trafficTrend[data.trafficTrend.length - 1] || null
        });
      } else {
        console.log('[流量趋势] 数据为空或格式错误', { trafficTrend: data.trafficTrend });
        setTrafficTrend([]);
      }
    } catch (error) {
      console.error('获取流量趋势失败:', error);
      addToast({
        title: "获取流量趋势失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setTrafficRefreshLoading(false);
    }
  }, [resolvedId]);

  // 初始加载数据
  React.useEffect(() => {
    fetchTunnelDetails();
    fetchTrafficTrend();
  }, [fetchTunnelDetails, fetchTrafficTrend]);

  // 监听日志变化，自动滚动到底部
  React.useEffect(() => {
    if (logs.length > 0 && selectedTab === "日志") {
      // 延迟滚动，确保DOM更新完成
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, selectedTab, scrollToBottom]);

  // 使用全局SSE监听页面刷新事件
  // useGlobalSSE({
  //   onMessage: (data) => {
  //     if (data.type === 'refresh' && data.route === `/tunnels/${resolvedId}`) {
  //       router.refresh();
  //     }
  //   }
  // });
  
  // 使用实例SSE监听更新 - 使用统一的SSE hook
  
  useTunnelSSE(tunnelInfo?.instanceId || '', {
    onMessage: (data) => {
      try {
        // 处理log类型的事件
        if (data.eventType === 'log' && data.logs) {
          
          // 使用递增计数器确保唯一ID
          logCounterRef.current += 1;
          const newLog = {
            id: logCounterRef.current,
            message: processAnsiColors(data.logs), // 恢复ANSI颜色处理
            isHtml: true, // 启用HTML渲染
            traffic: {
              tcpRx: data.instance?.tcprx || 0,
              tcpTx: data.instance?.tcptx || 0,
              udpRx: data.instance?.udprx || 0,
              udpTx: data.instance?.udptx || 0
            },
            timestamp: new Date(data.eventTime || Date.now())
          };
          

          
          // 将新日志追加到控制台
          setLogs(prev => {
            const newLogs = [newLog, ...prev].slice(0, 100);
            return newLogs;
          });
          
          // 滚动到底部显示最新日志
          setTimeout(scrollToBottom, 50);
          
        }
      } catch (error) {
        console.error('💥 [前端SSE] 处理消息时发生错误:', error);
      }
    },
    onError: (error) => {
      console.error('💥 [前端SSE] SSE连接错误:', error);
    },
    onConnected: () => {
      // SSE连接成功
    }
  });

  const handleToggleStatus = () => {
    if (!tunnelInfo) return;
    
    const isRunning = tunnelInfo.status.type === "success";
    toggleStatus(isRunning, {
      tunnelId: tunnelInfo.id,
      instanceId: tunnelInfo.instanceId,
      tunnelName: tunnelInfo.name,
      onStatusChange: (tunnelId, newStatus) => {
        setTunnelInfo(prev => prev ? {
          ...prev,
          status: {
            type: newStatus ? "success" : "danger",
            text: newStatus ? "运行中" : "已停止"
          }
        } : null);
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
        setTunnelInfo(prev => prev ? {
          ...prev,
          status: {
            type: "success",
            text: "运行中"
          }
        } : null);
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restart: newRestartValue }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        // 更新本地状态
        setTunnelInfo(prev => prev ? {
          ...prev,
          config: {
            ...prev.config,
            restart: newRestartValue
          }
        } : null);
        
        addToast({
          title: "配置更新成功",
          description: data.message || `自动重启已${newRestartValue ? '开启' : '关闭'}`,
          color: "success",
        });
      } else {
        throw new Error(data.error || '更新失败');
      }
    } catch (error) {
      console.error('更新重启配置失败:', error);
      
      // 检查是否为404错误或不支持错误，表示当前实例不支持自动重启功能
      let errorMessage = "未知错误";
      if (error instanceof Error) {
        errorMessage = error.message;
        // 检查错误信息中是否包含不支持相关内容
        if (errorMessage.includes('404') || errorMessage.includes('Not Found') || 
            errorMessage.includes('不支持') || errorMessage.includes('unsupported') ||
            errorMessage.includes('当前实例不支持自动重启功能')) {
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

  // 如果正在加载或没有数据，显示加载状态
  if (loading || !tunnelInfo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
            </div>
          </div>
          <p className="text-default-500 animate-pulse">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* 顶部操作区 - 响应式布局 */}
      <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:justify-between md:items-center">
        <div className="flex items-center gap-3 md:gap-4">
          <Button
            isIconOnly
            variant="flat"
            onClick={() => router.back()}
            className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <h1 className="text-lg md:text-2xl font-bold truncate">{tunnelInfo.name}</h1>
          <Chip 
            variant="flat"
            color={tunnelInfo.status.type}
            className="flex-shrink-0"
          >
            {tunnelInfo.status.text}
          </Chip>
        </div>
        
        {/* 操作按钮组 - 移动端优化 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
          <Button
            variant="flat"
            color={tunnelInfo.status.type === "success" ? "warning" : "success"}
            startContent={<FontAwesomeIcon icon={tunnelInfo.status.type === "success" ? faStop : faPlay} />}
            onClick={handleToggleStatus}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">{tunnelInfo.status.type === "success" ? "停止" : "启动"}</span>
          </Button>
          <Button
            variant="flat"
            color="primary"
            startContent={<FontAwesomeIcon icon={faRotateRight} />}
            onClick={handleRestart}
            isDisabled={tunnelInfo.status.type !== "success"}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">重启</span>
          </Button>
          <Button
            variant="flat"
            color="danger"
            startContent={<FontAwesomeIcon icon={faTrash} />}
            onClick={handleDeleteClick}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">删除</span>
          </Button>
          <Button
            variant="flat"
            color="default"
            startContent={<FontAwesomeIcon icon={faRefresh} />}
            onClick={handleRefresh}
            isLoading={refreshLoading}
            isDisabled={refreshLoading}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">刷新</span>
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
                  您确定要删除实例 <span className="font-semibold text-foreground">"{tunnelInfo.name}"</span> 吗？
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
                <Button color="default" variant="light" onPress={onClose} size="sm">
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

      {/* 实例信息 - 响应式网格布局 */}
      <Card className="p-2">
        <CardHeader className="font-bold text-sm md:text-base">实例信息</CardHeader>
        <CardBody>
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-4 lg:gap-12">
            {/* 左侧：基本信息 */}
            <Card className="border shadow-none">
              <CardBody className="flex flex-col justify-between h-full gap-3 md:gap-4">
                <CellValue label="实例ID" value={tunnelInfo.instanceId} />
                <CellValue 
                  label="主控" 
                  value={<Chip variant="bordered" color="default" size="sm">{tunnelInfo.endpoint}</Chip>} 
                />
                <CellValue 
                  label="类型" 
                  value={<Chip variant="flat" color={tunnelInfo.type === '服务器' ? "primary" : "secondary"} size="sm">
                    {tunnelInfo.type}
                  </Chip>} 
                />
                <CellValue 
                  label="实例地址" 
                  value={<span className="font-mono text-sm">{tunnelInfo.tunnelAddress}:{tunnelInfo.config.listenPort}</span>} 
                />
                <CellValue 
                  label="目标地址" 
                  value={<span className="font-mono text-sm">{tunnelInfo.targetAddress}:{tunnelInfo.config.targetPort}</span>} 
                />
                {/* 密码显示 - 仅在有密码时显示 */}
                {tunnelInfo.password && (
                  <CellValue 
                    label="密码" 
                    value={
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs md:text-sm break-all text-default-500">
                          {isPasswordVisible ? tunnelInfo.password : '••••••••'}
                        </span>
                        <FontAwesomeIcon 
                          icon={isPasswordVisible ? faEyeSlash : faEye}
                          className="text-xs cursor-pointer hover:text-primary w-4 text-default-500"
                          onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                        />
                      </div>
                    }
                  />
                )}
              </CardBody>
            </Card>
            
            {/* 右侧：流量统计卡片 - 响应式网格 */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 h-full">
              <Card className="p-2 bg-blue-50 dark:bg-blue-950/30 shadow-none h-full">
                <CardBody className="p-2 md:p-3 flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">TCP 接收</p>
                    <p className="text-sm md:text-lg font-bold text-blue-700 dark:text-blue-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.tcpRx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
              
              <Card className="p-2 bg-green-50 dark:bg-green-950/30 shadow-none h-full">
                <CardBody className="p-2 md:p-3 flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-xs text-green-600 dark:text-green-400 mb-1">TCP 发送</p>
                    <p className="text-sm md:text-lg font-bold text-green-700 dark:text-green-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.tcpTx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
              
              <Card className="p-2 bg-purple-50 dark:bg-purple-950/30 shadow-none h-full">
                <CardBody className="p-2 md:p-3 flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">UDP 接收</p>
                    <p className="text-sm md:text-lg font-bold text-purple-700 dark:text-purple-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.udpRx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
              
              <Card className="p-2 bg-orange-50 dark:bg-orange-950/30 shadow-none h-full">
                <CardBody className="p-2 md:p-3 flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">UDP 发送</p>
                    <p className="text-sm md:text-lg font-bold text-orange-700 dark:text-orange-300">
                      {(() => {
                        const { value, unit } = formatTrafficValue(tunnelInfo.traffic.udpTx);
                        return `${value} ${unit}`;
                      })()}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 命令行信息 */}
      <Accordion variant="shadow">
        <AccordionItem 
          key="command" 
          aria-label="命令行" 
          title={
            <span className="font-bold text-sm md:text-base">命令行</span>
          }
        >
          <div className="pb-4">
            <Snippet 
              hideCopyButton={false}
              hideSymbol={true}
              classNames={{
                base: "w-full",
                content: "text-xs font-mono break-all whitespace-pre-wrap"
              }}
            >
              {tunnelInfo.commandLine}
            </Snippet>
          </div>
        </AccordionItem>
      </Accordion>

      {/* 流量趋势图 - 响应式高度 */}
      <Card className="p-2">
        <CardHeader className="font-bold text-sm md:text-base justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              流量趋势
              <Tooltip content="需要日志级别设为debug才会有流量变化推送" placement="top">
                <FontAwesomeIcon 
                  icon={faQuestionCircle} 
                  className="text-default-400 hover:text-default-600 cursor-help text-xs"
                />
              </Tooltip>
            </div>
            
           
            
          </div>
          <div className="flex items-center gap-2">
           {/* 刷新按钮 */}
           <Button
              size="sm"
              variant="flat"
              isIconOnly
              onPress={fetchTrafficTrend}
              isLoading={trafficRefreshLoading}
              className="h-7 w-7 min-w-0"
            >
                <FontAwesomeIcon icon={faRefresh} className="text-xs" />
            </Button>
           {/* 时间范围选择 */}
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
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="space-y-4 text-center">
                  <div className="flex justify-center">
                    <div className="relative w-8 h-8">
                      <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
                    </div>
                  </div>
                  <p className="text-default-500 animate-pulse text-sm md:text-base">加载流量数据中...</p>
                </div>
              </div>
            ) : (() => {
              // 检查原始数据是否为空
              if (!trafficTrend || !Array.isArray(trafficTrend) || trafficTrend.length === 0) {
                return true; // 显示占位符
              }
              
              // 检查过滤后的数据是否为空
              const filteredData = filterDataByTimeRange(trafficTrend, trafficTimeRange);
              return filteredData.length === 0;
            })() ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-default-500 text-base md:text-lg">暂无流量数据</p>
                  <p className="text-default-400 text-xs md:text-sm mt-2">
                    {!trafficTrend || trafficTrend.length === 0 
                      ? "当实例运行时，流量趋势数据将在此显示" 
                      : `在过去${trafficTimeRange === "1h" ? "1小时" : trafficTimeRange === "6h" ? "6小时" : trafficTimeRange === "12h" ? "12小时" : "24小时"}内暂无流量数据`
                    }
                  </p>
                </div>
              </div>
            ) : (
              <FlowTrafficChart 
                key={`${trafficTimeRange}-${trafficTrend?.length || 0}`} // 强制重新渲染
                timeRange={trafficTimeRange}
                data={(() => {
                  // 安全检查
                  if (!trafficTrend || !Array.isArray(trafficTrend) || trafficTrend.length === 0) {
                    return [];
                  }
                  
                  // 首先根据时间范围过滤数据 - 后端已经返回差值数据
                  const filteredData = filterDataByTimeRange(trafficTrend, trafficTimeRange);
                  
                  if (filteredData.length === 0) return [];
                  
                  // 收集所有差值数据，找到最合适的统一单位
                  const allValues: number[] = [];
                  filteredData.forEach((item: TrafficTrendData) => {
                    // 安全检查数据字段
                    const tcpRxDiff = Number(item.tcpRxDiff) || 0;
                    const tcpTxDiff = Number(item.tcpTxDiff) || 0;
                    const udpRxDiff = Number(item.udpRxDiff) || 0;
                    const udpTxDiff = Number(item.udpTxDiff) || 0;
                    
                    allValues.push(tcpRxDiff, tcpTxDiff, udpRxDiff, udpTxDiff);
                  });
                  
                  const { unit: commonUnit, divisor } = getBestUnit(allValues);
                  
                  const chartData = [
                    {
                      id: `TCP接收`,
                      data: filteredData.map((item: TrafficTrendData) => ({
                        x: item.eventTime || '', // 直接使用后端返回的格式 "2025-06-26 18:40"
                        y: parseFloat(((Number(item.tcpRxDiff) || 0) / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    },
                    {
                      id: `TCP发送`,
                      data: filteredData.map((item: TrafficTrendData) => ({
                        x: item.eventTime || '', // 直接使用后端返回的格式 "2025-06-26 18:40"
                        y: parseFloat(((Number(item.tcpTxDiff) || 0) / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    },
                    {
                      id: `UDP接收`,
                      data: filteredData.map((item: TrafficTrendData) => ({
                        x: item.eventTime || '', // 直接使用后端返回的格式 "2025-06-26 18:40"
                        y: parseFloat(((Number(item.udpRxDiff) || 0) / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    },
                    {
                      id: `UDP发送`,
                      data: filteredData.map((item: TrafficTrendData) => ({
                        x: item.eventTime || '', // 直接使用后端返回的格式 "2025-06-26 18:40"
                        y: parseFloat(((Number(item.udpTxDiff) || 0) / divisor).toFixed(2)),
                        unit: commonUnit
                      }))
                    }
                  ];
                  
                  return chartData;
                })()}
                unit={(() => {
                  // 使用过滤后的数据计算单位 - 后端已经返回差值数据
                  if (!trafficTrend || !Array.isArray(trafficTrend) || trafficTrend.length === 0) {
                    return 'B';
                  }
                  
                  const filteredData = filterDataByTimeRange(trafficTrend, trafficTimeRange);
                  if (filteredData.length === 0) return 'B';
                  
                  const allValues: number[] = [];
                  filteredData.forEach((item: TrafficTrendData) => {
                    const tcpRxDiff = Number(item.tcpRxDiff) || 0;
                    const tcpTxDiff = Number(item.tcpTxDiff) || 0;
                    const udpRxDiff = Number(item.udpRxDiff) || 0;
                    const udpTxDiff = Number(item.udpTxDiff) || 0;
                    allValues.push(tcpRxDiff, tcpTxDiff, udpRxDiff, udpTxDiff);
                  });
                  
                  const { unit } = getBestUnit(allValues);
                  return unit;
                })()}
              />
            )}
          </div>
        </CardBody>
      </Card>

      {/* 详细信息 - Tab 内容响应式优化 */}
      <Card className="p-2">
        <CardBody>
          <Tabs 
            selectedKey={selectedTab}
            onSelectionChange={handleTabChange}
            size="sm"
            classNames={{
              tabList: "gap-2 md:gap-4",
              tab: "text-xs md:text-sm",
              tabContent: "text-xs md:text-sm"
            }}
          >
            <Tab key="日志" title="日志">
              <div 
                ref={logContainerRef}
                className="h-[300px] md:h-[400px] bg-zinc-900 rounded-lg p-3 md:p-4 font-mono text-xs md:text-sm overflow-auto scrollbar-thin"
              >
                {loading ? (
                  <div className="animate-pulse">
                    <span className="text-blue-400 ml-2">INFO:</span> 
                    <span className="text-gray-300 ml-1">加载日志中...</span>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-gray-400 animate-pulse">
                    等待日志输出...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {/* 反转数组顺序，让最新的日志显示在底部 */}
                    {logs.slice().reverse().map((log) => (
                      <div key={log.id.toString()} className="text-gray-300 leading-5">
                        {log.isHtml ? (
                          <span 
                            className="ml-2" 
                            dangerouslySetInnerHTML={{ __html: log.message }}
                          />
                        ) : (
                          <span className="ml-2 break-all">{log.message}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Tab>
            
            <Tab key="配置" title="配置">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-3 text-sm md:text-base">实例配置</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <CellValue 
                      label="TLS 设置" 
                      value={
                        <div className="flex items-center gap-2">
                          {tunnelInfo.type === '客户端' ? (
                            <span className="text-default-500">-</span>
                          ) : (
                            <Chip 
                              variant="flat" 
                              color={tunnelInfo.config.tlsMode === 'inherit' ? "primary" : 
                                    tunnelInfo.config.tlsMode === 'mode0' ? "default" : "success"} 
                              size="sm"
                            >
                              {tunnelInfo.config.tlsMode === 'inherit' ? 
                                (tunnelInfo.config.endpointTLS ? `继承主控 [${getTLSModeText(tunnelInfo.config.endpointTLS)}]` : '继承主控设置') :
                               tunnelInfo.config.tlsMode === 'mode0' ? '无 TLS 加密' :
                               tunnelInfo.config.tlsMode === 'mode1' ? '自签名证书' : '自定义证书'}
                            </Chip>
                          )}
                        </div>
                      }
                    />
                  
                    <CellValue 
                      label="日志级别" 
                      value={
                        <div className="flex items-center gap-2">
                          <Chip 
                            variant="flat" 
                            color={tunnelInfo.config.logLevel === 'inherit' ? "primary" : "default"} 
                            size="sm"
                          >
                            {tunnelInfo.config.logLevel === 'inherit' ? 
                              (tunnelInfo.config.endpointLog ? `继承主控 [${tunnelInfo.config.endpointLog.toUpperCase()}]` : '继承主控设置') : 
                              tunnelInfo.config.logLevel.toUpperCase()}
                          </Chip>
                        </div>
                      } 
                    />

                    {/* 仅客户端模式下显示 min/max */}
                    {tunnelInfo.type === '客户端' && (
                      <>
                        <CellValue
                          label="最小值 (min)"
                          value={tunnelInfo.config.min !== undefined && tunnelInfo.config.min !== null ? tunnelInfo.config.min.toString() : ' - '}
                        />
                        <CellValue
                          label="最大值 (max)"
                          value={tunnelInfo.config.max !== undefined && tunnelInfo.config.max !== null ? tunnelInfo.config.max.toString() : ' - '}
                        />
                      </>
                    )}

                    {/* 自动重启配置 */}
                    <CellValue 
                      label="自动重启" 
                      value={
                          <Switch
                            size="sm"
                            isSelected={tunnelInfo.config.restart}
                            onValueChange={handleRestartToggle}
                            isDisabled={isUpdatingRestart}
                            endContent={<span className="text-xs text-default-600">off</span>}
                            startContent={<span className="text-xs text-default-600">on</span>}
                            color="success"
                          />
                      } 
                    />
                  </div>
                </div>
              </div>
            </Tab>
          </Tabs>
        </CardBody>
      </Card>
    </div>
  );
} 