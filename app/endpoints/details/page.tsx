"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Chip,
  Divider,
  Skeleton
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faRotateRight, faTrash,faWifi, faServer, faKey, faGlobe, faDesktop, faCode, faLock, faCertificate, faLayerGroup, faFileLines, faHardDrive, faArrowUp, faArrowDown } from "@fortawesome/free-solid-svg-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from "@/lib/utils";
import { LogViewer, LogEntry } from "@/components/ui/log-viewer";
import { OSIcon } from "@/components/ui/os-icon";
import { useNodePassSSE } from "@/lib/hooks/use-nodepass-sse";

// 主控详情接口定义
interface EndpointDetail {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
  status: string;
  color?: string;
  os?: string;
  arch?: string;
  ver?: string;
  log?: string;
  tls?: string;
  crt?: string;
  keyPath?: string;
  lastCheck: string;
  createdAt: string;
  updatedAt: string;
}

// 端点统计信息接口定义
interface EndpointStats {
  tunnelCount: number;
  fileLogCount: number;
  fileLogSize: number;
  totalTrafficIn: number;
  totalTrafficOut: number;
  tcpTrafficIn: number;
  tcpTrafficOut: number;
  udpTrafficIn: number;
  udpTrafficOut: number;
}

export default function EndpointDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const endpointId = searchParams.get("id");

  const [detailLoading, setDetailLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [recycleCount, setRecycleCount] = useState<number>(0);
  const [endpointDetail, setEndpointDetail] = useState<EndpointDetail | null>(null);
  const [endpointStats, setEndpointStats] = useState<EndpointStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const logCounterRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 获取日志级别的颜色
  const getLogLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case 'debug': return 'primary';
      case 'info': return 'success';
      case 'warn': case 'warning': return 'warning';
      case 'error': return 'danger';
      default: return 'default';
    }
  };

  // 获取TLS配置说明
  const getTlsDescription = (tls: string) => {
    switch (tls) {
      case '0': return '无TLS';
      case '1': return '自签名证书';
      case '2': return '自定义证书';
      default: return tls;
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 格式化流量数据
  const formatTraffic = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  // 获取主控详情数据
  const fetchEndpointDetail = useCallback(async () => {
    if (!endpointId) return;

    try {
      setDetailLoading(true);
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/detail`));
      if (!res.ok) throw new Error("获取主控详情失败");
      const data = await res.json();
      
      if (data.success && data.endpoint) {
        setEndpointDetail(data.endpoint);
      }
    } catch (err) {
      console.error(err);
      addToast({ 
        title: "加载失败", 
        description: err instanceof Error ? err.message : "未知错误", 
        color: "danger" 
      });
    } finally {
      setDetailLoading(false);
    }
  }, [endpointId]);

  // 初始化清空日志（仅用于SSE实时日志）
  const initializeLogs = useCallback(() => {
    setLogs([]);
    logCounterRef.current = 0;
    addToast({ 
      title: "日志已清空", 
      description: "等待NodePass实时日志...", 
      color: "primary" 
    });
  }, []);

  // 获取回收站数量
  const fetchRecycleCount = useCallback(async()=>{
    if(!endpointId) return;
    try{
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/recycle/count`));
      if(!res.ok) throw new Error("获取回收站数量失败");
      const data = await res.json();
      setRecycleCount(data.count || 0);
    }catch(e){ console.error(e); }
  },[endpointId]);

  // 获取端点统计信息
  const fetchEndpointStats = useCallback(async () => {
    if (!endpointId) return;
    
    try {
      setStatsLoading(true);
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/stats`));
      if (!res.ok) throw new Error("获取统计信息失败");
      const data = await res.json();
      
      if (data.success && data.data) {
        setEndpointStats(data.data);
      }
    } catch (err) {
      console.error('获取统计信息失败:', err);
      addToast({ 
        title: "获取统计信息失败", 
        description: err instanceof Error ? err.message : "未知错误", 
        color: "warning" 
      });
    } finally {
      setStatsLoading(false);
    }
  }, [endpointId]);

  // NodePass SSE监听
  const { isConnected, isConnecting, error, reconnect } = useNodePassSSE(
    endpointDetail ? {
      url: endpointDetail.url,
      apiPath: endpointDetail.apiPath,
      apiKey: endpointDetail.apiKey
    } : null,
    {
      onConnected: () => {
        console.log('[Endpoint SSE] 连接到NodePass成功');
        addToast({
          title: "实时连接已建立",
          description: "正在监听NodePass实时日志",
          color: "success",
        });
      },
      onMessage: (data) => {
        console.log('[Endpoint SSE] 收到消息:', data);
        
        // NodePass SSE原始数据格式解析
        let logMessage = '';
        
        // 尝试多种数据格式解析
        if (typeof data === 'string') {
          logMessage = data;
        } else if (data.message) {
          logMessage = data.message;
        } else if (data.data) {
          logMessage = data.data;
        } else if (data.type === 'log' || data.log) {
          logMessage = data.log || data.content || JSON.stringify(data);
        } else {
          // 如果都不是，可能是NodePass的原始日志格式
          logMessage = JSON.stringify(data);
        }
        
        // 如果有有效的日志消息，添加到日志列表
        if (logMessage && logMessage.trim()) {
          const newLogEntry: LogEntry = {
            id: ++logCounterRef.current,
            message: logMessage,
            isHtml: true
          };
          
          setLogs(prevLogs => {
            const updatedLogs = [...prevLogs, newLogEntry];
            // 保持日志数量在1000条以内
            if (updatedLogs.length > 1000) {
              return updatedLogs.slice(-1000);
            }
            return updatedLogs;
          });
          
          // 自动滚动到底部
          setTimeout(scrollToBottom, 50);
        }
      },
      onError: (error) => {
        console.error('[Endpoint SSE] 连接错误:', error);
        addToast({
          title: "实时连接失败",
          description: "无法连接到NodePass，请检查主控状态",
          color: "danger",
        });
      },
      onDisconnected: () => {
        console.log('[Endpoint SSE] 连接已断开');
      }
    }
  );

  useEffect(() => {
    fetchEndpointDetail();
  }, [fetchEndpointDetail]);

  useEffect(() => {
    fetchRecycleCount();
  }, [fetchRecycleCount]);

  useEffect(() => {
    fetchEndpointStats();
  }, [fetchEndpointStats]);

  // 滚动效果
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, scrollToBottom]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 顶部返回按钮和主控信息 */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Button isIconOnly variant="flat" size="sm" onClick={() => router.back()} className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20">
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          {endpointDetail ? (
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-2xl font-bold truncate">{endpointDetail.name}</h1>
              {endpointDetail.ver && (
                <Chip variant="flat" color="secondary">
                  {endpointDetail.ver}
                </Chip>
              )}
              <Chip 
                variant="flat" 
                color={
                  endpointDetail.status === 'ONLINE' ? 'success' : 
                  endpointDetail.status === 'FAIL' ? 'danger' : 
                  endpointDetail.status === 'DISCONNECT' ? 'default' : 'warning'
                }
              >
                {endpointDetail.status === 'ONLINE' ? '在线' : 
                 endpointDetail.status === 'FAIL' ? '异常' : 
                 endpointDetail.status === 'DISCONNECT' ? '断开' : '离线'}
              </Chip>
            </div>
          ) : (
            <h1 className="text-lg md:text-2xl font-bold truncate">主控详情</h1>
          )}
        </div>
        <div className="flex items-center gap-2"> 
        </div>
      </div>

      {/* 统计信息卡片 */}
      {/* 统计信息卡片 */}
      <Card className="p-2">
        <CardHeader>
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">主控统计</p>
            <p className="text-sm text-default-500">当前主控的数据统计概览</p>
          </div>
        </CardHeader>
        <CardBody>
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 p-4 bg-default/10 rounded-lg">
                  <Skeleton className="w-6 h-6 rounded" />
                  <div className="flex-1">
                    <Skeleton className="h-3 w-16 mb-1" />
                    <Skeleton className="h-5 w-12 mb-1" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : endpointStats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* 隧道数量 */}
              <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg">
                <FontAwesomeIcon icon={faLayerGroup} className="text-primary text-xl" />
                <div>
                  <p className="text-xs text-default-600">隧道数量</p>
                  <p className="text-xl font-bold text-primary">{endpointStats.tunnelCount}</p>
                  <p className="text-xs text-default-500">活跃实例</p>
                </div>
              </div>

              {/* 日志文件数 */}
              <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-lg">
                <FontAwesomeIcon icon={faFileLines} className="text-secondary text-xl" />
                <div>
                  <p className="text-xs text-default-600">日志文件数</p>
                  <p className="text-xl font-bold text-secondary">{endpointStats.fileLogCount}</p>
                  <p className="text-xs text-default-500">日志文件</p>
                </div>
              </div>

              {/* 日志文件大小 */}
              <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                <FontAwesomeIcon icon={faHardDrive} className="text-warning text-xl" />
                <div>
                  <p className="text-xs text-default-600">日志文件大小</p>
                  <p className="text-xl font-bold text-warning">{formatFileSize(endpointStats.fileLogSize)}</p>
                  <p className="text-xs text-default-500">磁盘占用</p>
                </div>
              </div>

              {/* 总流量 */}
              <div className="flex items-center gap-3 p-4 bg-success/10 rounded-lg">
                <FontAwesomeIcon icon={faWifi} className="text-success text-xl" />
                <div>
                  <p className="text-xs text-default-600">总流量</p>
                  <p className="text-lg font-bold text-success">↑{formatTraffic(endpointStats.totalTrafficOut)}</p>
                  <p className="text-sm font-bold text-danger">↓{formatTraffic(endpointStats.totalTrafficIn)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">无法获取统计数据</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 主控详情信息 */}
      {endpointDetail && (
        <Card className="p-2">
          <CardHeader>
            <h3 className="text-lg font-semibold">主控信息</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {/* 详细信息网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 连接信息 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faServer} />
                    <span>服务地址</span>
                  </div>
                  <p className="text-small font-mono truncate">{endpointDetail.url}{endpointDetail.apiPath}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faKey} />
                    <span>API Key</span>
                  </div>
                  <p className="text-small font-mono truncate">••••••••••••••••••••••••••••••••</p>
                </div>

                {/* 系统信息 */}
                {endpointDetail.os && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faDesktop} />
                      <span>操作系统</span>
                    </div>
                    <Chip size="sm" variant="flat" color="primary" className="font-mono">
                      <div className="flex items-center gap-2">
                        <OSIcon os={endpointDetail.os} className="w-3 h-3" />
                        {endpointDetail.os}
                      </div>
                    </Chip>
                  </div>
                )}

                {endpointDetail.arch && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faCode} />
                      <span>架构</span>
                    </div>
                    <Chip size="sm" variant="flat" color="secondary" className="font-mono">
                      <div className="flex items-center gap-2">
                        <OSIcon arch={endpointDetail.arch} type="arch" className="w-3 h-3" />
                        {endpointDetail.arch}
                      </div>
                    </Chip>
                  </div>
                )}

                {endpointDetail.log && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faGlobe} />
                      <span>日志级别</span>
                    </div>
                    <Chip 
                      size="sm" 
                      variant="flat" 
                      color={getLogLevelColor(endpointDetail.log)}
                      className="font-mono"
                    >
                      {endpointDetail.log.toUpperCase()}
                    </Chip>
                  </div>
                )}

                {endpointDetail.tls && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faLock} />
                      <span>TLS配置</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip 
                        size="sm" 
                        variant="flat" 
                        color={endpointDetail.tls === '0' ? 'default' : 'success'}
                      >
                        {getTlsDescription(endpointDetail.tls)}
                      </Chip>
                      <span className="text-tiny text-default-400">
                        (Level {endpointDetail.tls})
                      </span>
                    </div>
                  </div>
                )}

                {/* 证书配置 - 仅当TLS=2时显示 */}
                {endpointDetail.tls === '2' && endpointDetail.crt && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faCertificate} />
                      <span>证书路径</span>
                    </div>
                    <p className="text-small font-mono truncate">{endpointDetail.crt}</p>
                  </div>
                )}

                {endpointDetail.tls === '2' && endpointDetail.keyPath && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faKey} />
                      <span>密钥路径</span>
                    </div>
                    <p className="text-small font-mono truncate">{endpointDetail.keyPath}</p>
                  </div>
                )}
              </div>

              {/* 时间信息 */}
              <Divider />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-small text-default-500">
                <div>
                  <span className="font-medium">创建时间：</span>
                  {new Date(endpointDetail.createdAt).toLocaleString('zh-CN')}
                </div>
                <div>
                  <span className="font-medium">更新时间：</span>
                  {new Date(endpointDetail.updatedAt).toLocaleString('zh-CN')}
                </div>
                <div>
                  <span className="font-medium">最后检查：</span>
                  {new Date(endpointDetail.lastCheck).toLocaleString('zh-CN')}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 日志区域 */}
      <Card className="p-2">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">实时日志</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 
                isConnecting ? 'bg-yellow-500 animate-pulse' : 
                'bg-red-500'
              }`}></div>
              <span className="text-sm text-default-500">
                {isConnected ? '已连接' : 
                 isConnecting ? '连接中...' : 
                 error ? '连接失败' : '未连接'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 重连按钮 */}
            {!isConnected && !isConnecting && (
              <Button
                size="sm"
                color="secondary"
                variant="ghost"
                isDisabled={!endpointDetail}
                onPress={reconnect}
                startContent={
                  <FontAwesomeIcon icon={faRotateRight} />
                }
              >
                重连
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <LogViewer logs={logs} loading={false} heightClass="h-[550px] md:h-[900px]" containerRef={logContainerRef} />
        </CardBody>
      </Card>
    </div>
  );
} 