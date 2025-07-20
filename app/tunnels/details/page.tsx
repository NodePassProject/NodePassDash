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
  Switch, 
  cn,
  Select,
  SelectItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Spinner
} from "@heroui/react";
import React, { useEffect } from "react";
// 引入 QuickCreateTunnelModal 组件
import QuickCreateTunnelModal from "../components/quick-create-tunnel-modal";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlay, faPause, faRotateRight, faTrash, faRefresh,faStop, faQuestionCircle, faEye, faEyeSlash, faArrowDown, faDownload, faPen, faRecycle } from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { addToast } from "@heroui/toast";
import CellValue from "./cell-value";
import { FlowTrafficChart } from "@/components/ui/flow-traffic-chart";
import { useSearchParams } from 'next/navigation';
import { FileLogViewer } from "@/components/ui/file-log-viewer";
import { useTunnelSSE } from "@/lib/hooks/use-sse";

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
  endpointVersion?: string;
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
    certPath?: string; // TLS证书路径
    keyPath?: string;  // TLS密钥路径
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
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
  const [tunnelInfo, setTunnelInfo] = React.useState<TunnelInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [trafficData, setTrafficData] = React.useState<FlowTrafficData[]>([]);
  const [trafficTrend, setTrafficTrend] = React.useState<TrafficTrendData[]>([]);
  const [initialDataLoaded, setInitialDataLoaded] = React.useState(false);
  const [refreshLoading, setRefreshLoading] = React.useState(false);
  const [trafficRefreshLoading, setTrafficRefreshLoading] = React.useState(false);
  const [trafficTimeRange, setTrafficTimeRange] = React.useState<"1h" | "6h" | "12h" | "24h">("24h");
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  // 编辑实例模态控制
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const searchParams = useSearchParams();
  const resolvedId = searchParams.get('id');

  // 是否移入回收站
  const [moveToRecycle, setMoveToRecycle] = React.useState(false);

  // 自动重启开关状态更新
  const [isUpdatingRestart, setIsUpdatingRestart] = React.useState(false);

  // 文件日志相关状态
  const [logDays, setLogDays] = React.useState<string>("1");
  const [logLoading, setLogLoading] = React.useState(false);
  const [logClearing, setLogClearing] = React.useState(false);
  const [logCount, setLogCount] = React.useState(0);
  const [logRefreshTrigger, setLogRefreshTrigger] = React.useState(0);
  const [clearPopoverOpen, setClearPopoverOpen] = React.useState(false);
  const [exportLoading, setExportLoading] = React.useState(false);
  const [resetModalOpen, setResetModalOpen] = React.useState(false);
  const [resetLoading, setResetLoading] = React.useState(false);


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

  // 文件日志控制函数
  const handleLogRefresh = React.useCallback(() => {
    setLogRefreshTrigger(prev => prev + 1);
  }, []);

  const handleLogClear = React.useCallback(() => {
    // 清空完成后的回调
    console.log('文件日志已清空');
  }, []);

  // 导出日志和SSE记录的函数
  const handleExport = React.useCallback(async () => {
    if (exportLoading || !tunnelInfo) return;
    
    setExportLoading(true);
    
    try {
      // 调用后端API获取zip文件
      const response = await fetch(`/api/tunnels/${tunnelInfo.id}/export-logs`, {
        method: 'GET',
        headers: {
          'Accept': 'application/zip',
        },
      });

      if (!response.ok) {
        throw new Error('导出失败');
      }

      // 获取文件名，默认使用实例名称
      const filename = `${tunnelInfo.name}_logs_${new Date().toISOString().split('T')[0]}.zip`;
      
      // 创建blob并下载
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        title: "导出成功",
        description: `日志文件已导出为 ${filename}`,
        color: "success",
      });
    } catch (error) {
      console.error('导出日志失败:', error);
      addToast({
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setExportLoading(false);
    }
  }, [exportLoading, tunnelInfo]);

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
      
      // 刷新文件日志 - 直接更新trigger而不依赖handleLogRefresh
      setLogRefreshTrigger(prev => prev + 1);

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

  // 获取实例详情（不包含流量趋势和日志）
  const fetchTunnelDetails = React.useCallback(async () => {
    try {
      setLoading(true);
      
      // 获取实例基本信息
      const response = await fetch(`/api/tunnels/${resolvedId}/details`);
      if (!response.ok) {
        throw new Error('获取实例详情失败');
      }
      
      const data = await response.json();
      
      // 设置基本信息
      console.log('[隧道详情] 接收到的数据:', data.tunnelInfo);
      setTunnelInfo(data.tunnelInfo);

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

  // SSE监听逻辑
  useTunnelSSE(tunnelInfo?.instanceId || "", {
    onMessage: (data) => {
      console.log('[隧道详情] 收到SSE事件:', data);
      
      // 处理log事件 - 拼接到日志末尾
        if (data.eventType === 'log' && data.logs) {
        console.log('[隧道详情] 收到日志事件，追加到日志末尾:', data.logs);
        // 通过window对象调用FileLogViewer的方法追加日志
        if ((window as any).fileLogViewerRef && (window as any).fileLogViewerRef.appendLog) {
          (window as any).fileLogViewerRef.appendLog(data.logs);
        } else {
          console.warn('[隧道详情] FileLogViewer引用不存在，无法追加日志');
        }
      }
      
      // 处理update事件 - 刷新页面数据
      if (data.eventType === 'update') {
        console.log('[隧道详情] 收到update事件，刷新数据');
        // 刷新隧道详情
        fetchTunnelDetails();
        // 刷新流量趋势
        fetchTrafficTrend();
        // 刷新日志（通过触发器）
        setLogRefreshTrigger(prev => prev + 1);
        
        // 如果数据中包含状态更新，立即更新本地状态
        if (data.status && tunnelInfo) {
          setTunnelInfo(prev => prev ? {
            ...prev,
            status: {
              type: data.status === "running" ? "success" : "danger",
              text: data.status === "running" ? "运行中" : "已停止"
            }
          } : null);
        }
        
        // 如果数据中包含流量更新，立即更新本地状态
        if (data.tcpRx !== undefined && data.tcpTx !== undefined && 
            data.udpRx !== undefined && data.udpTx !== undefined && tunnelInfo) {
          setTunnelInfo(prev => prev ? {
            ...prev,
            traffic: {
              tcpRx: data.tcpRx,
              tcpTx: data.tcpTx,
              udpRx: data.udpRx,
              udpTx: data.udpTx,
              pool: data.pool || 0,
              ping: data.ping || 0
        }
          } : null);
        }
      }
    },
    onError: (error) => {
      console.error('[隧道详情] SSE连接错误:', error);
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

  const handleReset = async () => {
    if (!tunnelInfo) return;
    setResetLoading(true);
    try {
      const response = await fetch(`/api/tunnels/${tunnelInfo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reset',
          instanceId: tunnelInfo.instanceId 
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
        throw new Error(data.error || '重置失败');
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
          <h1 className="text-lg md:text-2xl font-bold truncate">{tunnelInfo.name}</h1>
          <Chip variant="flat" color={tunnelInfo.type === '服务器' ? "primary" : "secondary"} >
              {tunnelInfo.type}
          </Chip>
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
            isDisabled={refreshLoading}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">刷新</span>
          </Button>
          <Button
            variant="flat"
            color="secondary"
            startContent={<FontAwesomeIcon icon={faRecycle} />}
            onClick={() => setResetModalOpen(true)}
            isDisabled={resetLoading}
            className="flex-shrink-0"
          >
            <span className="hidden sm:inline">重置</span>
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

      {/* 重置确认模态框 */}
      <Modal isOpen={resetModalOpen} onOpenChange={setResetModalOpen} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faRecycle} className="text-secondary" />
                  确认重置
                </div>
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600 text-sm md:text-base">
                  您确定要重置实例 <span className="font-semibold text-foreground">"{tunnelInfo.name}"</span> 的流量信息吗？
                </p>
                <p className="text-xs md:text-small text-warning">
                  ⚠️ 此操作仅重置流量统计，不影响其他配置。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose} size="sm">
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
      <div className="grid gap-2 md:gap-3 mb-4" style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        maxWidth: '100%'
      }}>
        <Card className="p-1 md:p-2 bg-blue-50 dark:bg-blue-950/30 shadow-none">
          <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">TCP 接收</p>
              <p className="text-xs md:text-sm lg:text-lg font-bold text-blue-700 dark:text-blue-300">
                {(() => {
                  const { value, unit } = formatTrafficValue(tunnelInfo.traffic.tcpRx);
                  return `${value} ${unit}`;
                })()}
              </p>
            </div>
          </CardBody>
        </Card>
        
        <Card className="p-1 md:p-2 bg-green-50 dark:bg-green-950/30 shadow-none">
          <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-green-600 dark:text-green-400 mb-1">TCP 发送</p>
              <p className="text-xs md:text-sm lg:text-lg font-bold text-green-700 dark:text-green-300">
                {(() => {
                  const { value, unit } = formatTrafficValue(tunnelInfo.traffic.tcpTx);
                  return `${value} ${unit}`;
                })()}
              </p>
            </div>
          </CardBody>
        </Card>
        
        <Card className="p-1 md:p-2 bg-purple-50 dark:bg-purple-950/30 shadow-none">
          <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">UDP 接收</p>
              <p className="text-xs md:text-sm lg:text-lg font-bold text-purple-700 dark:text-purple-300">
                {(() => {
                  const { value, unit } = formatTrafficValue(tunnelInfo.traffic.udpRx);
                  return `${value} ${unit}`;
                })()}
              </p>
            </div>
          </CardBody>
        </Card>
        
        <Card className="p-1 md:p-2 bg-orange-50 dark:bg-orange-950/30 shadow-none">
          <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">UDP 发送</p>
              <p className="text-xs md:text-sm lg:text-lg font-bold text-orange-700 dark:text-orange-300">
                {(() => {
                  const { value, unit } = formatTrafficValue(tunnelInfo.traffic.udpTx);
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
                <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-1">连接池</p>
                <p className="text-xs md:text-sm lg:text-lg font-bold text-cyan-700 dark:text-cyan-300">
                  {tunnelInfo.traffic.pool}
                </p>
              </div>
            </CardBody>
          </Card>
        )}
        
        {tunnelInfo.traffic.ping !== null && tunnelInfo.type === '服务端' && (
          <Card className="p-1 md:p-2 bg-pink-50 dark:bg-pink-950/30 shadow-none">
            <CardBody className="p-1 md:p-2 lg:p-3 flex items-center justify-center">
              <div className="text-center">
                <p className="text-xs text-pink-600 dark:text-pink-400 mb-1">延迟</p>
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
        <CardHeader className="flex items-center  justify-between">
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
              startContent={<FontAwesomeIcon icon={faPen} className="text-xs" />}
            />
          </Tooltip>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {/* 基本信息 */}
              <CellValue label="实例ID" value={tunnelInfo.instanceId} />
              <CellValue 
                label="主控" 
                value={<Chip variant="bordered" color="default" size="sm">{tunnelInfo.endpoint}</Chip>} 
              />

              <CellValue 
                label="隧道地址" 
                value={<span className="font-mono text-sm">{tunnelInfo.tunnelAddress}:{tunnelInfo.config.listenPort}</span>} 
              />
              <CellValue 
                label="目标地址" 
                value={<span className="font-mono text-sm">{tunnelInfo.targetAddress}:{tunnelInfo.config.targetPort}</span>} 
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
              {/* 配置信息字段 */}
              {/* 仅客户端模式下显示 min/max */}
              {tunnelInfo.type === '客户端' && (
                <CellValue
                  label="连接池大小"
                  value={
                    <span className="font-mono text-sm">
                      {tunnelInfo.config.min !== undefined && tunnelInfo.config.min !== null ? tunnelInfo.config.min.toString() : '64'}<span className="text-default-400 text-xs">(min)</span>~
                      {tunnelInfo.config.max !== undefined && tunnelInfo.config.max !== null ? tunnelInfo.config.max.toString() : '8192'}<span className="text-default-400 text-xs">(max)</span>
                    </span>
                  }
                />
              )}
              {/* 仅服务端模式显示TLS设置 */}
              {tunnelInfo.type === '服务端' && (
                <>
                  <CellValue 
                    label="TLS 设置" 
                    value={
                      <div className="flex items-center gap-2">
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
                      </div>
                    }
                  />
                  {/* 当TLS模式为mode2时显示证书路径 */}
                  {tunnelInfo.config.tlsMode === 'mode2' && (
                    <>
                      <CellValue 
                        label="证书路径" 
                        value={tunnelInfo.config.certPath || '未设置'}
                      />
                      <CellValue 
                        label="密钥路径" 
                        value={tunnelInfo.config.keyPath || '未设置'}
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
              

              {/* 自动重启配置 */}
              {tunnelInfo.endpointVersion && 
                <CellValue 
                  label="自动重启" 
                  value={
                    <Switch
                      size="sm"
                      isSelected={tunnelInfo.config.restart}
                      onValueChange={handleRestartToggle}
                      isDisabled={isUpdatingRestart}
                      endContent={<span className="text-xs text-default-600">禁用</span>}
                      startContent={<span className="text-xs text-default-600">启用</span>}
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
                          "group-data-[selected]:group-data-[pressed]:ms-4",
                        ),
                      }}
                    />
                  } 
                />
              }
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
            <h3 className="text-lg font-semibold">命令行</h3>              
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
        <CardHeader className="flex items-center  justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">流量趋势</h3>              
              <Tooltip content="需要日志级别设为debug才会有流量变化推送" placement="right">
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
                    },


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

      {/* 延迟趋势图表 - 仅服务端隧道显示 */}
      {tunnelInfo.type === '服务端' && (
        <Card className="p-2">
          <CardHeader className="font-bold text-sm md:text-base justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                延迟趋势
                <Tooltip content="仅服务端隧道显示延迟数据" placement="top">
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
            <div className="h-64">
              {(() => {
                // 使用过滤后的数据计算单位
                if (!trafficTrend || !Array.isArray(trafficTrend) || trafficTrend.length === 0) {
                  return <div className="flex items-center justify-center h-full text-default-400">暂无延迟数据</div>;
                }
                
                const filteredData = filterDataByTimeRange(trafficTrend, trafficTimeRange);
                if (filteredData.length === 0) {
                  return <div className="flex items-center justify-center h-full text-default-400">所选时间范围内暂无延迟数据</div>;
                }

                // 检查是否有延迟数据
                const hasPingData = filteredData.some((item: TrafficTrendData) => item.pingDiff !== null && item.pingDiff !== undefined);
                if (!hasPingData) {
                  return <div className="flex items-center justify-center h-full text-default-400">暂无延迟数据</div>;
                }

                return (
                  <FlowTrafficChart
                    data={[{
                      id: `延迟`,
                      data: filteredData.map((item: TrafficTrendData) => ({
                        x: item.eventTime || '',
                        y: Number(item.pingDiff) || 0,
                        unit: 'ms'
                      }))
                    }]}
                    unit="ms"
                  />
                );
              })()}
            </div>
          </CardBody>
        </Card>
      )}

      {/* 日志 - 独立Card */}
      <Card className="p-2">
      <CardHeader className="flex items-center  justify-between">
           <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">日志</h3>              

              <Chip variant="flat" color="primary" size="sm">
                {logCount} 条记录
              </Chip>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 天数选择 */}
            <Select
            size="sm"
              placeholder="选择天数"
              selectedKeys={[logDays]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) setLogDays(selected);
              }}
              className="w-20"
            classNames={{
                trigger: "min-h-unit-8 h-8",
                value: "text-xs"
              }}
            >
              <SelectItem key="1">1天</SelectItem>
              <SelectItem key="3">3天</SelectItem>
              <SelectItem key="7">7天</SelectItem>
            </Select>
            
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
            <Tooltip content="导出日志文件和SSE记录" placement="top">
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
              <Popover placement="bottom" isOpen={clearPopoverOpen} onOpenChange={setClearPopoverOpen}>
                <PopoverTrigger>
                    <Button
                      size="sm"
                      variant="flat"
                      color="danger"
                      isIconOnly
                      isLoading={logClearing}
                      isDisabled={logCount === 0}
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
            days={logDays}
            onDaysChange={setLogDays}
            onLogsChange={(logs) => setLogCount(logs.length)}
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
      <QuickCreateTunnelModal
        isOpen={editModalOpen}
        onOpenChange={setEditModalOpen}
        mode="edit"
        editData={{
          // QuickCreateTunnelModal 需要的字段整理
          id: tunnelInfo.id,
          endpointId: tunnelInfo.endpointId,
          mode: tunnelInfo.type === '服务端' ? 'server' : 'client',
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
          keyPath: tunnelInfo.config.keyPath
        }}
        onSaved={() => {
          setEditModalOpen(false);
          fetchTunnelDetails();
        }}
      />
    )}
    </>
  );
} 