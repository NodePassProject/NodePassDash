"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faArrowLeft, 
  faWifi, 
  faTrash, 
  faRotateRight, 
  faArrowUp, 
  faArrowDown 
} from "@fortawesome/free-solid-svg-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from "@/lib/utils";
import { LogViewer, LogEntry } from "@/components/ui/log-viewer";
import { useNodePassSSE } from "@/lib/hooks/use-nodepass-sse";

// 主控详情接口定义
interface EndpointDetail {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
  status: string;
  ver?: string;
}

export default function SSEDebugPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const endpointId = searchParams.get("id");

  const [detailLoading, setDetailLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [endpointDetail, setEndpointDetail] = useState<EndpointDetail | null>(null);

  const logCounterRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  const scrollToTop = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
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

  // 使用useMemo稳定endpoint对象，避免频繁重新创建
  const endpoint = useMemo(() => {
    console.log('[SSE Debug] 构建endpoint对象:', endpointDetail);
    if (!endpointDetail) {
      console.log('[SSE Debug] endpointDetail为空，返回null');
      return null;
    }

    const endpointObj = {
      url: endpointDetail.url,
      apiPath: endpointDetail.apiPath,
      apiKey: endpointDetail.apiKey
    };

    console.log('[SSE Debug] 构建的endpoint对象:', endpointObj);
    return endpointObj;
  }, [endpointDetail?.url, endpointDetail?.apiPath, endpointDetail?.apiKey]);

  // NodePass SSE监听 - 手动模式
  const { isConnected, isConnecting, error, connect, disconnect, reconnect } = useNodePassSSE(
    endpoint,
    {
      autoReconnect: false, // 禁用自动重连，手动控制
      onConnected: () => {
        console.log('[SSE Debug] 连接成功');
        addToast({
          title: "实时连接成功",
          description: "已连接到NodePass主控，开始接收实时日志",
          color: "success",
        });
      },
      onMessage: (data) => {
        console.log('[SSE Debug] 收到消息:', data);
        
        // 处理所有类型的消息，不仅仅是log类型
        let logMessage = '';
        
        if (data.type === 'log') {
          // 直接日志消息
          logMessage = data.message;
        } else if (data.type === 'instance') {
          // 实例消息，格式化为可读的日志
          logMessage = `[实例] ${JSON.stringify(data, null, 2)}`;
        } else if (data.type === 'tunnel') {
          // 隧道消息
          logMessage = `[隧道] ${JSON.stringify(data, null, 2)}`;
        } else if (data.type === 'stats') {
          // 统计消息
          logMessage = `[统计] ${JSON.stringify(data, null, 2)}`;
        } else if (data.message) {
          // 其他有message字段的消息
          logMessage = data.message;
        } else if (typeof data === 'string') {
          // 纯字符串消息
          logMessage = data;
        } else {
          // 其他类型的消息，转换为JSON字符串
          logMessage = JSON.stringify(data, null, 2);
        }
        
        // 添加到日志列表
        if (logMessage) {
          const newLogEntry: LogEntry = {
            id: ++logCounterRef.current,
            message: logMessage,
            isHtml: true
          };
          
          console.log('[SSE Debug] 添加日志条目:', newLogEntry);
          
          setLogs(prevLogs => {
            const updatedLogs = [...prevLogs, newLogEntry];
            // 保持日志数量在1000条以内
            if (updatedLogs.length > 1000) {
              return updatedLogs.slice(-1000);
            }
            console.log('[SSE Debug] 更新日志列表，新长度:', updatedLogs.length);
            return updatedLogs;
          });
          
          // LogViewer组件会自动滚动到底部
        } else {
          console.log('[SSE Debug] 空消息，跳过');
        }
      },
      onError: (error) => {
        console.error('[SSE Debug] 连接错误:', error);
        addToast({
          title: "实时连接失败",
          description: "无法连接到NodePass，请检查主控状态。",
          color: "danger",
        });
      },
      onDisconnected: () => {
        console.log('[SSE Debug] 连接已断开');
        addToast({
          title: "连接已断开",
          description: "SSE连接已断开",
          color: "warning",
        });
      }
    }
  );

  // 使用useCallback优化函数引用，添加正确的依赖项
  const memoizedFetchEndpointDetail = useCallback(fetchEndpointDetail, [endpointId]);

  // 初始化数据加载 - 只在组件挂载时执行一次
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      console.log('[SSE Debug] 组件初始化，加载数据');
      hasInitializedRef.current = true;
      memoizedFetchEndpointDetail();
    }
  }, [memoizedFetchEndpointDetail]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 顶部返回按钮和主控信息 */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Button 
            isIconOnly 
            variant="flat" 
            onClick={() => router.back()} 
            className="bg-default-100 hover:bg-default-200"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          {endpointDetail ? (
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-2xl font-bold truncate">
                {endpointDetail.name} - SSE调试
              </h1>
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
            <h1 className="text-lg md:text-2xl font-bold truncate">SSE调试</h1>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button
            variant="flat"
            color="default"
            isLoading={detailLoading}
            onPress={fetchEndpointDetail}
            startContent={<FontAwesomeIcon icon={faRotateRight} />}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* SSE实时日志区域 */}
      <Card className="p-2">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">实时SSE推送调试</h3>
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
            {error && (
              <Chip color="danger" size="sm">
                错误: {error}
              </Chip>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 手动连接/断开按钮 */}
            {!isConnected && !isConnecting ? (
              <Button
                size="sm"
                color="success"
                variant="flat"
                isDisabled={!endpointDetail}
                onPress={connect}
                startContent={
                  <FontAwesomeIcon icon={faWifi} />
                }
              >
                连接
              </Button>
            ) : (
              <Button
                size="sm"
                color="danger"
                variant="flat"
                onPress={disconnect}
                startContent={
                  <FontAwesomeIcon icon={faTrash} />
                }
              >
                断开
              </Button>
            )}

            {/* 清空日志按钮 */}
            <Button
              size="sm"
              color="warning"
              variant="flat"
              onPress={() => {
                setLogs([]);
                logCounterRef.current = 0;
                addToast({
                  title: "日志已清空",
                  description: "SSE调试日志已清空",
                  color: "success"
                });
              }}
              startContent={
                <FontAwesomeIcon icon={faTrash} />
              }
            >
              清空日志
            </Button>

            {/* 重连按钮 - 仅在连接失败时显示 */}
            {error && !isConnecting && (
              <Button
                size="sm"
                color="secondary"
                variant="flat"
                isDisabled={!endpointDetail}
                onPress={reconnect}
                startContent={
                  <FontAwesomeIcon icon={faRotateRight} />
                }
              >
                重连
              </Button>
            )}

            {/* 滚动到顶部按钮 */}
            <Button
              size="sm"
              color="primary"
              variant="flat"
              onPress={scrollToTop}
              startContent={<FontAwesomeIcon icon={faArrowUp} />}
            >
              顶部
            </Button>

            {/* 滚动到底部按钮 */}
            <Button
              size="sm"
              color="primary"
              variant="flat"
              onPress={scrollToBottom}
              startContent={<FontAwesomeIcon icon={faArrowDown} />}
            >
              底部
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* 连接状态和统计信息 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-default-50 dark:bg-default-900/20 p-3 rounded-lg">
                <p className="text-sm text-default-600">连接状态</p>
                <p className="text-lg font-semibold">
                  {isConnected ? '已连接' : 
                   isConnecting ? '连接中...' : 
                   error ? '连接失败' : '未连接'}
                </p>
              </div>
              <div className="bg-default-50 dark:bg-default-900/20 p-3 rounded-lg">
                <p className="text-sm text-default-600">日志条数</p>
                <p className="text-lg font-semibold">{logs.length}</p>
              </div>
              <div className="bg-default-50 dark:bg-default-900/20 p-3 rounded-lg">
                <p className="text-sm text-default-600">端点状态</p>
                <p className="text-lg font-semibold">
                  {endpointDetail ? endpointDetail.status : '未知'}
                </p>
              </div>
            </div>
            
            {/* 日志查看器 */}
            <LogViewer 
              logs={logs} 
              loading={false} 
              heightClass="h-[600px]" 
              containerRef={logContainerRef} 
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}