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
  cn
} from "@heroui/react";
import React, { useState, useEffect } from "react";

import { Icon } from "@iconify/react";
import { FlowTrafficChart } from "@/components/ui/flow-traffic-chart";
import { useRouter } from "next/navigation";
import { useGlobalSSE } from '@/lib/hooks/use-sse';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { buildApiUrl } from '@/lib/utils';

// Prisma 已移除，定义本地 EndpointStatus 枚举
type EndpointStatus = 'ONLINE' | 'OFFLINE' | 'FAIL';

// 统计数据类型
interface TunnelStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
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
  hourTime: string;
  hourDisplay: string;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
  recordCount: number;
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

/**
 * 仪表盘页面 - 显示系统概览和状态信息
 */
export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<TunnelStats>({ total: 0, running: 0, stopped: 0, error: 0 });
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [trafficTrend, setTrafficTrend] = useState<TrafficTrendData[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(true);
  const [visibleUrls, setVisibleUrls] = useState<Set<number>>(new Set());
  // 处理IP地址隐藏的函数
  const maskIpAddress = (url: string): string => {
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
  };

  // 切换URL显示状态
  const toggleUrlVisibility = (endpointId: number) => {
    setVisibleUrls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(endpointId)) {
        newSet.delete(endpointId);
      } else {
        newSet.add(endpointId);
      }
      return newSet;
    });
  };

  const columns = [
    { key: "time", label: "时间" },
    { key: "action", label: "操作" },
    { key: "instance", label: "实例" },
    { key: "status", label: "状态" },
  ];

  // 获取实例统计数据
  const fetchTunnelStats = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/tunnels/simple'));
      if (!response.ok) throw new Error('获取实例数据失败');
      const tunnels: TunnelInstance[] = await response.json();
      
      const newStats = {
        total: tunnels.length,
        running: tunnels.filter(t => t.status.type === 'success').length,
        stopped: tunnels.filter(t => t.status.type === 'danger').length,
        error: tunnels.filter(t => t.status.type === 'warning').length,
      };
      
      setStats(newStats);
    } catch (error) {
      console.error('获取实例统计数据失败:', error);
    }
  };

  // 获取主控数据
  const fetchEndpoints = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/endpoints/simple'));
      if (!response.ok) throw new Error('获取主控数据失败');
      const data: Endpoint[] = await response.json();
      setEndpoints(data);
    } catch (error) {
      console.error('获取主控数据失败:', error);
    }
  };

  // 获取操作日志数据
  const fetchOperationLogs = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/dashboard/logs?limit=50'));
      if (!response.ok) throw new Error('获取操作日志失败');
      const data: OperationLog[] = await response.json();
      setOperationLogs(data);
    } catch (error) {
      console.error('获取操作日志失败:', error);
    }
  };

  // 获取流量趋势数据
  const fetchTrafficTrend = async () => {
    try {
      setTrafficLoading(true);
      const response = await fetch(buildApiUrl('/api/dashboard/traffic-trend'));
      if (!response.ok) throw new Error('获取流量趋势数据失败');
      
      const result = await response.json();
      if (result.success) {
        setTrafficTrend(result.data);
        console.log('[仪表盘前端] 流量趋势数据获取成功:', {
          数据条数: result.data.length,
          示例数据: result.data.slice(0, 3)
        });
      } else {
        throw new Error(result.error || '获取流量趋势数据失败');
      }
    } catch (error) {
      console.error('获取流量趋势数据失败:', error);
      setTrafficTrend([]); // 设置为空数组，显示无数据状态
    } finally {
      setTrafficLoading(false);
    }
  };

  // 使用全局SSE监听页面刷新事件
  // useGlobalSSE({
  //   onMessage: (data) => {
  //     // 处理页面刷新事件
  //     if (data.type === 'refresh' && data.route === '/dashboard') {
  //       router.refresh();
  //       return;
  //     }

  //     // 处理实例更新事件
  //     if (['create', 'update', 'delete'].includes(data.type)) {
  //       console.log('[仪表盘] 收到实例更新事件:', data);
  //       // 刷新实例统计数据
  //       fetchTunnelStats();
  //       // 如果是创建或删除事件，也刷新主控数据
  //       if (data.type === 'create' || data.type === 'delete') {
  //         fetchEndpoints();
  //       }
  //     }
  //   },
  //   onError: (error) => {
  //     console.error('[仪表盘] SSE连接错误:', error);
  //   }
  // });

  // 初始化数据
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 优先加载核心统计数据，快速显示基本信息
      try {
        await Promise.all([
          fetchTunnelStats(), 
          fetchEndpoints()
        ]);
      } catch (error) {
        console.error('加载核心数据失败:', error);
      } finally {
        setLoading(false);
      }
      
      // 异步加载次要数据，不阻塞页面渲染
      setTimeout(async () => {
        try {
          await Promise.all([
            fetchOperationLogs(),
            fetchTrafficTrend()
          ]);
        } catch (error) {
          console.error('加载扩展数据失败:', error);
        }
      }, 100);
    };
    
    fetchData();
  }, []);

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* 顶部统计卡片 - 响应式网格布局 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">总实例</span>
                <span className="text-xl md:text-2xl font-semibold">{loading ? "--" : stats.total}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 text-primary">
                <Icon icon="solar:server-2-bold" width={20} className="md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-success-50 to-success-100/50 dark:from-success-900/20 dark:to-success-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels?status=running")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">运行中</span>
                <span className="text-xl md:text-2xl font-semibold text-success">{loading ? "--" : stats.running}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-success/10 text-success">
                <Icon icon="solar:play-circle-bold" width={20} className="md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-danger-50 to-danger-100/50 dark:from-danger-900/20 dark:to-danger-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels?status=stopped")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">已停止</span>
                <span className="text-xl md:text-2xl font-semibold text-danger">{loading ? "--" : stats.stopped}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-danger/10 text-danger">
                <Icon icon="solar:stop-circle-bold" width={20} className="md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card 
          className="p-3 md:p-4 bg-gradient-to-br from-warning-50 to-warning-100/50 dark:from-warning-900/20 dark:to-warning-900/10 cursor-pointer transition-transform hover:scale-[1.02]"
          isPressable
          onPress={() => router.push("/tunnels?status=error")}
        >
          <CardBody className="p-0">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-default-600 text-xs md:text-sm">错误</span>
                <span className="text-xl md:text-2xl font-semibold text-warning">{loading ? "--" : stats.error}</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg bg-warning/10 text-warning">
                <Icon icon="solar:danger-triangle-bold" width={20} className="md:w-6 md:h-6" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 中间内容区域 - 响应式布局 */}
      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* 流量概览 - 在移动端占满宽度，桌面端占2列 */}
        <Card className="lg:col-span-2 min-h-[350px] lg:h-[400px]">
          <CardHeader className="font-bold text-sm md:text-base px-4 md:px-6 pb-3">流量趋势</CardHeader>
          <CardBody className="h-full px-4 md:px-6 pb-4 md:pb-6">
            <div className="h-[280px] lg:h-[300px]">
              {trafficLoading ? (
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
              ) : trafficTrend.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-default-500 text-base md:text-lg">暂无流量数据</p>
                    <p className="text-default-400 text-xs md:text-sm mt-2">当有实例运行时，流量趋势数据将在此显示</p>
                  </div>
                </div>
              ) : (
                <FlowTrafficChart 
                  data={(() => {
                    // 收集所有流量数据，找到最合适的统一单位
                    const allValues: number[] = [];
                    trafficTrend.forEach(item => {
                      allValues.push(item.tcpRx, item.tcpTx, item.udpRx, item.udpTx);
                    });
                    
                    const { unit: commonUnit, divisor } = getBestUnit(allValues);
                    
                    return [
                      {
                        id: `TCP接收`,
                        data: trafficTrend.map((item) => ({
                          x: item.hourDisplay,
                          y: parseFloat((item.tcpRx / divisor).toFixed(2))
                        }))
                      },
                      {
                        id: `TCP发送`,
                        data: trafficTrend.map((item) => ({
                          x: item.hourDisplay,
                          y: parseFloat((item.tcpTx / divisor).toFixed(2))
                        }))
                      },
                      {
                        id: `UDP接收`,
                        data: trafficTrend.map((item) => ({
                          x: item.hourDisplay,
                          y: parseFloat((item.udpRx / divisor).toFixed(2))
                        }))
                      },
                      {
                        id: `UDP发送`,
                        data: trafficTrend.map((item) => ({
                          x: item.hourDisplay,
                          y: parseFloat((item.udpTx / divisor).toFixed(2))
                        }))
                      }
                    ];
                  })()}
                  unit={(() => {
                    const allValues: number[] = [];
                    trafficTrend.forEach(item => {
                      allValues.push(item.tcpRx, item.tcpTx, item.udpRx, item.udpTx);
                    });
                    
                    const { unit } = getBestUnit(allValues);
                    return unit;
                  })()}
                />
              )}
            </div>
          </CardBody>
        </Card>

        {/* API 主控列表 - 在移动端独占一行，桌面端占1列 */}
        <Card className="min-h-[300px] lg:h-[400px]">
          <CardHeader className="font-bold text-sm md:text-base px-4 md:px-6 pb-3">API 主控</CardHeader>
          <CardBody className="pt-0 px-4 md:px-6 pb-4 md:pb-6">
            <div className="h-full max-h-[240px] lg:max-h-[320px] overflow-y-auto space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 rounded-lg border border-default-200 bg-default-50/50">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-default-300 animate-pulse" />
                          <div className="h-4 bg-default-300 rounded animate-pulse flex-1" />
                        </div>
                        <div className="h-3 bg-default-200 rounded animate-pulse w-3/4" />
                        <div className="h-3 bg-default-200 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : endpoints.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-default-500 text-xs md:text-sm">暂无主控数据</p>
                </div>
              ) : (
                endpoints.map((endpoint) => (
                  <div 
                    key={endpoint.id} 
                    className="p-3 rounded-lg border border-default-200 bg-gradient-to-r from-default-50/50 to-default-100/30 hover:from-default-100/70 hover:to-default-200/50 transition-all duration-200 hover:shadow-sm"
                  >
                    <div className="space-y-2">
                      {/* 状态和名称行 */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span 
                          className={cn(
                            "w-2 h-2 rounded-full inline-block flex-shrink-0",
                            endpoint.status === 'ONLINE' ? "bg-success-500" : "bg-danger-500"
                          )}
                        />
                        <h4 className="font-normal text-xs md:text-sm truncate flex-1">{endpoint.name}</h4>
                        <Badge 
                          content={endpoint.tunnelCount} 
                          color="default" 
                          size="sm"
                          classNames={{
                            badge: "text-[10px] min-w-4 h-4 px-1"
                          }}
                        >
                          <Icon icon="solar:server-2-bold" className="w-3.5 h-3.5 text-default-400" />
                        </Badge>
                      </div>
                      
                      {/* URL地址行 - 仿HTML效果 */}
                      <div className="flex items-center gap-2">
                        <div 
                          className={cn(
                            "text-xs text-default-600 font-mono cursor-pointer transition-all duration-300 flex-1 truncate",
                            !visibleUrls.has(endpoint.id) && "blur-[4px] hover:blur-none",
                            "hover:text-primary"
                          )}
                          onClick={() => toggleUrlVisibility(endpoint.id)}
                          title="点击切换显示完整地址"
                        >
                          {visibleUrls.has(endpoint.id) ? endpoint.url : maskIpAddress(endpoint.url)}
                        </div>
                        
                        {/* 眼睛按钮 */}
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          className="min-w-6 w-6 h-6 text-default-400 hover:text-primary"
                          onClick={() => toggleUrlVisibility(endpoint.id)}
                        >
                          <Icon 
                            icon={visibleUrls.has(endpoint.id) ? "solar:eye-bold" : "solar:eye-closed-bold"} 
                            className="w-3 h-3" 
                          />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 最近活动 - 响应式高度和滚动 */}
      <Card className="min-h-[300px] lg:h-[400px]">
        <CardHeader className="font-bold px-4 md:px-6 text-sm md:text-base">最近活动</CardHeader>
        <Divider />
        <CardBody className="p-0 overflow-hidden">
          <div className="h-[240px] lg:h-[320px] overflow-y-auto px-4 md:px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <Table 
              aria-label="最近活动列表"
              removeWrapper
              hideHeader
              classNames={{
                base: "overflow-visible",
                table: operationLogs.length === 0 ? "min-h-[120px]" : "", // 只在无数据时设置最小高度
                tbody: "[&>tr]:border-b [&>tr]:border-divider last:[&>tr]:border-0",
                tr: "hover:bg-default-50 transition-colors",
                td: "py-3 text-xs md:text-sm"
              }}
            >
              <TableHeader>
                {columns.map((column) => (
                  <TableColumn key={column.key}>
                    {column.label}
                  </TableColumn>
                ))}
              </TableHeader>
              <TableBody 
                emptyContent={
                  <div className="text-center py-8">
                    <span className="text-default-500 text-xs md:text-sm">
                      {loading ? "加载中..." : "暂无操作记录"}
                    </span>
                  </div>
                }
              >
                {operationLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="min-w-0">
                      <div className="text-xs md:text-sm">
                        {new Date(log.time).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <div className="truncate text-xs md:text-sm">{log.action}</div>
                    </TableCell>
                    <TableCell className="min-w-0">
                      <div className="truncate text-xs md:text-sm">{log.instance}</div>
                    </TableCell>
                    <TableCell className="min-w-0">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
} 