"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Chip,
  Divider
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faRotateRight, faTrash, faMagnifyingGlass, faServer, faKey, faGlobe, faDesktop, faCode, faLock, faCertificate } from "@fortawesome/free-solid-svg-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from "@/lib/utils";
import { LogViewer, LogEntry } from "@/components/ui/log-viewer";
import { OSIcon } from "@/components/ui/os-icon";

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

export default function EndpointDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const endpointId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [recycleCount, setRecycleCount] = useState<number>(0);
  const [endpointDetail, setEndpointDetail] = useState<EndpointDetail | null>(null);

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

  // 获取日志数据
  const fetchLogs = useCallback(async () => {
    if (!endpointId) return;

    try {
      setLoading(true);
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/logs?limit=1000`));
      if (!res.ok) throw new Error("获取日志失败");
      const data = await res.json();

      const list: LogEntry[] = (data.logs || data.data?.logs || []).map((item: any, idx: number) => ({
        id: idx + 1,
        message: item.message ?? "",
        isHtml: true,
        timestamp: item.timestamp ? new Date(item.timestamp) : null,
      }));

      logCounterRef.current = list.length;
      setLogs(list);

      // 页面更新后滚动底部
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error(err);
      addToast({ title: "加载失败", description: err instanceof Error ? err.message : "未知错误", color: "danger" });
    } finally {
      setLoading(false);
    }
  }, [endpointId, scrollToBottom]);

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

  useEffect(() => {
    fetchEndpointDetail();
  }, [fetchEndpointDetail]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchRecycleCount();
  }, [fetchRecycleCount]);

  // 滚动效果
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, scrollToBottom]);

  // 手动刷新
  const handleRefresh = useCallback(async () => {
    if (refreshLoading) return;
    setRefreshLoading(true);
    await fetchLogs();
    setRefreshLoading(false);
  }, [refreshLoading, fetchLogs]);

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
          <h3 className="text-lg font-semibold">日志输出</h3>
          <div className="flex items-center gap-2">
            <Button 
              variant="light"
              size="sm"
              isDisabled={refreshLoading}
              className="bg-default-100 hover:bg-default-200 dark:bg-default-100/10 dark:hover:bg-default-100/20"
              startContent={
                <FontAwesomeIcon 
                  icon={faRotateRight} 
                  className={refreshLoading ? "animate-spin" : ""}
                />
              }
              onPress={handleRefresh}
            >
              {refreshLoading ? "刷新中..." : "刷新"}
            </Button>
            {/* 日志查询按钮 */}
            <Button
              size="sm"
              isIconOnly
              color="primary"
              onPress={()=>router.push(`/endpoints/log?id=${endpointId}`)}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <LogViewer logs={logs} loading={loading} heightClass="h-[550px] md:h-[900px]" containerRef={logContainerRef} />
        </CardBody>
      </Card>
    </div>
  );
} 