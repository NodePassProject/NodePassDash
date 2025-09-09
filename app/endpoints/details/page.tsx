"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Chip,
  Divider,
  Skeleton,
  Code,
  Modal,
  ModalContent,
  ModalBody,
  ModalHeader,
  ModalFooter,
  Textarea,
  Input,
  useDisclosure,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faRotateRight, faTrash,faWifi, faServer, faKey, faGlobe, faDesktop, faCode, faLock, faCertificate, faLayerGroup, faFileLines, faHardDrive, faClock, faPlus, faSync, faPen, faCopy, faPlug, faPlugCircleXmark, faEdit, faNetworkWired, faCog } from "@fortawesome/free-solid-svg-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { addToast } from "@heroui/toast";
import { buildApiUrl } from "@/lib/utils";
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
  uptime?: number | null;
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
  const [recycleCount, setRecycleCount] = useState<number>(0);
  const [endpointDetail, setEndpointDetail] = useState<EndpointDetail | null>(null);
  const [endpointStats, setEndpointStats] = useState<EndpointStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [instances, setInstances] = useState<Array<{instanceId: string; commandLine: string; type: string; status: string; alias: string;}>>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // 模态框状态管理
  const {isOpen: isAddTunnelOpen, onOpen: onAddTunnelOpen, onOpenChange: onAddTunnelOpenChange} = useDisclosure();
  const {isOpen: isRenameOpen, onOpen: onRenameOpen, onOpenChange: onRenameOpenChange} = useDisclosure();
  const {isOpen: isEditApiKeyOpen, onOpen: onEditApiKeyOpen, onOpenChange: onEditApiKeyOpenChange} = useDisclosure();
  
  // 表单状态
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [tunnelName, setTunnelName] = useState('');
  const [newName, setNewName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');


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

  // 格式化在线时长
  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return '';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    // 如果大于等于1天，只显示天数
    if (days >= 1) {
      return `${days}天`;
    }

    // 小于1天的情况
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && parts.length === 0) parts.push(`${secs}s`); // 只有在没有小时和分钟时才显示秒数

    return parts.join('') || '0s';
  };

  // 获取实例状态指示器
  const getInstanceStatusIndicator = (status: string) => {
    const statusConfig = {
      running: {
        color: 'bg-green-500',
        label: '运行中',
        animate: false
      },
      stopped: {
        color: 'bg-red-500', 
        label: '已停止',
        animate: false
      },
      error: {
        color: 'bg-red-500',
        label: '错误',
        animate: true
      },
      starting: {
        color: 'bg-yellow-500',
        label: '启动中',
        animate: true
      },
      stopping: {
        color: 'bg-orange-500',
        label: '停止中', 
        animate: true
      },
      unknown: {
        color: 'bg-gray-400',
        label: '未知',
        animate: false
      }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;
    
    return (
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div 
          className={`w-2 h-2 rounded-full ${config.color} ${config.animate ? 'animate-pulse' : ''}`}
          title={config.label}
        />
      </div>
    );
  };


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

  // 获取实例列表
  const fetchInstances = useCallback(async () => {
    if (!endpointId) return;
    try {
      setInstancesLoading(true);
      const res = await fetch(buildApiUrl(`/api/endpoints/${endpointId}/instances`));
      if (!res.ok) throw new Error('获取实例列表失败');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const list = data.data
          .map((item: any) => {
            const cmd = item.commandLine || item.url || '';
            let ty = item.type || item.mode || '';
            if (!ty && typeof cmd === 'string') {
              ty = cmd.includes('client://') ? 'client' : 'server';
            }
            return {
              instanceId: item.id || item.instanceId || '',
              commandLine: cmd,
              type: ty,
              status: item.status || 'unknown',
              alias: item.alias || item.name || '',
            };
          })
          .filter((x: any) => x.type && x.instanceId && x.instanceId !== '********');
        setInstances(list);
      } else {
        console.warn('获取实例数据格式错误:', data);
        setInstances([]);
      }
    } catch (e) {
      console.error(e);
      addToast({ title: '获取实例失败', description: e instanceof Error ? e.message : '未知错误', color: 'danger' });
    } finally {
      setInstancesLoading(false);
    }
  }, [endpointId]);


  // 使用useCallback优化函数引用，添加正确的依赖项
  const memoizedFetchEndpointDetail = useCallback(fetchEndpointDetail, [endpointId]);
  const memoizedFetchEndpointStats = useCallback(fetchEndpointStats, [endpointId]);
  const memoizedFetchInstances = useCallback(fetchInstances, [endpointId]);

  // 主控操作函数
  const handleConnect = async () => {
    if (!endpointId) return;
    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: Number(endpointId),
          action: 'reconnect'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '连接失败');
      }

      const result = await response.json();
      addToast({
        title: "连接成功",
        description: result.message || "主控连接请求已发送",
        color: "success",
      });

      // 刷新主控详情
      await fetchEndpointDetail();
    } catch (error) {
      addToast({
        title: "连接失败",
        description: error instanceof Error ? error.message : "连接请求失败",
        color: "danger",
      });
    }
  };

  const handleDisconnect = async () => {
    if (!endpointId) return;
    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: Number(endpointId),
          action: 'disconnect'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '断开连接失败');
      }

      const result = await response.json();
      addToast({
        title: "断开连接成功",
        description: result.message || "主控连接已断开",
        color: "success",
      });

      // 刷新主控详情
      await fetchEndpointDetail();
    } catch (error) {
      addToast({
        title: "断开连接失败",
        description: error instanceof Error ? error.message : "断开连接失败",
        color: "danger",
      });
    }
  };

  const handleRefreshTunnels = async () => {
    if (!endpointId) return;
    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(endpointId), action: 'refresTunnel' })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '刷新失败');
      }
      addToast({ title: '刷新成功', description: data.message || '隧道信息已刷新', color: 'success' });
      await fetchInstances();
    } catch (error) {
      addToast({ title: '刷新失败', description: error instanceof Error ? error.message : '刷新请求失败', color: 'danger' });
    }
  };

  const handleCopyConfig = () => {
    if (!endpointDetail) return;
    const config = `API URL: ${endpointDetail.url}${endpointDetail.apiPath}\nAPI KEY: ${endpointDetail.apiKey}`;
    navigator.clipboard.writeText(config).then(() => {
      addToast({
        title: "已复制",
        description: "配置信息已复制到剪贴板",
        color: "success"
      });
    });
  };

  const handleDeleteEndpoint = async () => {
    if (!endpointId) return;
    if (!confirm('确定要删除这个主控吗？此操作不可撤销。')) return;
    
    try {
      const response = await fetch(buildApiUrl(`/api/endpoints/${endpointId}`), {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '删除失败');
      }

      addToast({
        title: '删除成功',
        description: '主控已删除',
        color: 'success'
      });

      // 返回主控列表页
      router.push('/endpoints');
    } catch (error) {
      addToast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除失败',
        color: 'danger'
      });
    }
  };

  // 添加实例
  const handleAddTunnel = () => {
    setTunnelUrl('');
    setTunnelName('');
    onAddTunnelOpen();
  };

  const handleSubmitAddTunnel = async () => {
    if (!endpointId) return;
    if (!tunnelUrl.trim()) {
      addToast({title: '请输入 URL', description: '隧道 URL 不能为空', color: 'warning'});
      return;
    }
    try {
      const res = await fetch(buildApiUrl('/api/tunnels/create_by_url'), {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({endpointId: Number(endpointId), url: tunnelUrl.trim(), name: tunnelName.trim()})
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '创建隧道失败');
      }
      addToast({title: '创建成功', description: data.message || '隧道已创建', color: 'success'});
      onAddTunnelOpenChange();
      await fetchInstances();
    } catch (err) {
      addToast({title: '创建失败', description: err instanceof Error ? err.message : '无法创建隧道', color: 'danger'});
    }
  };

  // 重命名主控
  const handleRename = () => {
    if (!endpointDetail) return;
    setNewName(endpointDetail.name);
    onRenameOpen();
  };

  const handleSubmitRename = async () => {
    if (!endpointId) return;
    if (!newName.trim()) {
      addToast({title: '请输入名称', description: '主控名称不能为空', color: 'warning'});
      return;
    }

    try {
      const response = await fetch(buildApiUrl('/api/endpoints'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          id: Number(endpointId),
          action: 'rename',
          name: newName.trim()
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '重命名失败');
      }

      addToast({
        title: "重命名成功",
        description: `主控名称已更新为 "${newName.trim()}"`,
        color: "success",
      });

      onRenameOpenChange();
      await fetchEndpointDetail();
    } catch (error) {
      addToast({
        title: "重命名失败",
        description: error instanceof Error ? error.message : "重命名失败",
        color: "danger",
      });
    }
  };

  // 修改密钥
  const handleEditApiKey = () => {
    setNewApiKey('');
    onEditApiKeyOpen();
  };

  const handleSubmitEditApiKey = async () => {
    if (!endpointId) return;
    if (!newApiKey.trim()) {
      addToast({title: '请输入API Key', description: 'API Key不能为空', color: 'warning'});
      return;
    }

    try {
      // 1. 先断开连接
      await handleDisconnect();
      
      // 2. 更新密钥
      const response = await fetch(buildApiUrl(`/api/endpoints/${endpointId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: newApiKey.trim(),
          action: 'editApiKey'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '修改密钥失败');
      }

      addToast({
        title: "密钥修改成功",
        description: "API Key 已更新，正在重新连接...",
        color: "success",
      });

      onEditApiKeyOpenChange();
      
      // 3. 刷新主控详情
      await fetchEndpointDetail();
      
      // 4. 重新连接
      setTimeout(() => {
        handleConnect();
      }, 1000);

    } catch (error) {
      addToast({
        title: "修改密钥失败",
        description: error instanceof Error ? error.message : "修改失败",
        color: "danger",
      });
    }
  };

  // 初始化数据加载 - 只在组件挂载时执行一次，使用ref避免重复执行
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      console.log('[Endpoint Detail] 组件初始化，加载数据');
      hasInitializedRef.current = true;
      memoizedFetchEndpointDetail();
      memoizedFetchEndpointStats();
      memoizedFetchInstances();
    }
  }, [memoizedFetchEndpointDetail,   memoizedFetchEndpointStats, memoizedFetchInstances]);


  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 顶部返回按钮和主控信息 */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <Button isIconOnly variant="flat" onClick={() => router.back()} className="bg-default-100 hover:bg-default-200">
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
        <div className="flex items-center gap-4">
          <Button
            variant="flat"
            color="secondary"
            onPress={() => router.push(`/endpoints/sse-debug?id=${endpointId}`)}
            startContent={<FontAwesomeIcon icon={faCog} />}
          >
            SSE调试
          </Button>
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
                  <p className="text-xs text-default-600">隧道总数量</p>
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

      {/* 主控操作 */}
      {endpointDetail && (
        <Card className="p-2">
          <CardHeader>
            <h3 className="text-lg font-semibold">主控操作</h3>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              {/* 连接/断开按钮 */}
              {endpointDetail.status === 'ONLINE' ? (
                <Button
                  color="warning"
                  variant="flat"
                  startContent={<FontAwesomeIcon icon={faPlugCircleXmark} />}
                  onPress={handleDisconnect}
                >
                  断开连接
                </Button>
              ) : (
                <Button
                  color="success"
                  variant="flat"
                  startContent={<FontAwesomeIcon icon={faPlug} />}
                  onPress={handleConnect}
                >
                  连接主控
                </Button>
              )}

              {/* 添加实例 */}
              <Button
                color="primary"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faPlus} />}
                onPress={handleAddTunnel}
              >
                添加实例
              </Button>

              {/* 同步实例 */}
              <Button
                color="secondary"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faSync} />}
                onPress={handleRefreshTunnels}
              >
                同步实例
              </Button>

              {/* 重命名 */}
              <Button
                color="warning"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faPen} />}
                onPress={handleRename}
              >
                重命名
              </Button>

              {/* 修改密钥 */}
              <Button
                color="warning"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faKey} />}
                onPress={handleEditApiKey}
              >
                修改密钥
              </Button>

              {/* 复制配置 */}
              <Button
                color="default"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faCopy} />}
                onPress={handleCopyConfig}
              >
                复制配置
              </Button>

              {/* 分隔线 */}
              <Divider orientation="vertical" className="h-8" />

              {/* 暂时禁用的功能按钮 */}
              <Button
                color="default"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faKey} />}
                isDisabled
              >
                重置密钥
              </Button>

              <Button
                color="default"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faNetworkWired} />}
                isDisabled
              >
                网络调试
              </Button>

              {/* 分隔线 */}
              <Divider orientation="vertical" className="h-8" />

              {/* 删除主控 */}
              <Button
                color="danger"
                variant="flat"
                startContent={<FontAwesomeIcon icon={faTrash} />}
                onPress={handleDeleteEndpoint}
              >
                删除主控
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

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

                {(endpointDetail.uptime == null || endpointDetail.uptime == 0) &&(<div className="space-y-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faKey} />
                    <span>API Key</span>
                  </div>
                  <p className="text-small font-mono truncate">••••••••••••••••••••••••••••••••</p>
                </div>)}

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

                {/* 在线时长 */}
                {endpointDetail.uptime != null && endpointDetail.uptime > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faClock} />
                      <span>在线时长</span>
                    </div>
                    <Chip size="sm" variant="flat" color="success" className="font-mono">
                      {formatUptime(endpointDetail.uptime)}
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

      {/* 实例列表 */}
      <Card className="p-2">
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold">主控实例</h3>
            <span className="text-sm text-default-500">({instances.length} 个实例)</span>
            {/* 类型和状态提示 */}
            {/* <div className="flex items-center gap-3 text-tiny">
              <div className="flex items-center gap-1 text-default-500">
                <span className="w-2 h-2 rounded-full bg-primary inline-block"></span> 服务端
              </div>
              <div className="flex items-center gap-1 text-default-500">
                <span className="w-2 h-2 rounded-full bg-secondary inline-block"></span> 客户端
              </div>
              <div className="border-l border-default-200 pl-3 flex items-center gap-3">
                <div className="flex items-center gap-1 text-default-500">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> 运行中
                </div>
                <div className="flex items-center gap-1 text-default-500">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span> 已停止
                </div>
                <div className="flex items-center gap-1 text-default-500">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse inline-block"></span> 状态变化中
                </div>
              </div>
            </div> */}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" color="primary" variant="flat" onPress={() => setExtractOpen(true)}>提取</Button>
            <Button size="sm" color="secondary" variant="flat" onPress={() => setImportOpen(true)}>导入</Button>
          </div>
        </CardHeader>
        <CardBody>
          {instancesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Card key={index} className="h-[100px]">
                  <CardBody className="p-3 flex flex-col items-center justify-center">
                    <Skeleton className="w-8 h-8 rounded-full mb-2" />
                    <Skeleton className="h-3 w-16 mb-1" />
                    <Skeleton className="h-2 w-12" />
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-default-500 text-sm">暂无实例数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[324px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {instances.map((ins) => (
                <Card 
                  key={ins.instanceId} 
                  className={`h-[100px] shadow-none border-1 transition-all cursor-pointer relative ${
                    ins.type === 'server' 
                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700' 
                      : 'bg-secondary-50 border-secondary-200'
                  }`}
                  isPressable
                  onPress={() => {
                    // 复制实例ID到剪贴板
                    navigator.clipboard.writeText(ins.instanceId);
                    addToast({
                      title: "已复制",
                      description: `实例ID: ${ins.instanceId}`,
                      color: "success"
                    });
                  }}
                >
                  {/* 状态指示器 */}
                  {getInstanceStatusIndicator(ins.status)}
                  
                  <CardBody className="p-3 flex flex-col h-full relative">
                    {/* 顶部区域：左上角图标 + 右侧文字 */}
                    <div className="flex items-start gap-2 flex-1">
                      {/* 实例类型图标 */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        ins.type === 'server' ? 'bg-primary-100 text-primary dark:bg-primary-600/20' : 'bg-secondary-100 text-secondary'
                      }`}>
                        <FontAwesomeIcon 
                          icon={ins.type === 'server' ? faServer : faDesktop} 
                          className="text-xs" 
                        />
                      </div>
                      
                      {/* 右侧文字区域 */}
                      <div className="flex-1 min-w-0">
                        {/* 第一行：alias */}
                        <p className="text-xs font-medium truncate" title={ins.alias || ins.instanceId}>
                          {ins.alias || '未命名'}
                        </p>
                        {/* 第二行：实例ID */}
                        <p className="text-xs text-default-500 truncate mt-0.5" title={ins.instanceId}>
                          {ins.instanceId}
                        </p>
                      </div>
                    </div>
                    
                    {/* 左下角类型标签 */}
                    <div className="absolute bottom-2 left-2">
                      <Chip 
                        size="sm" 
                        variant="flat" 
                        color={ins.type === 'server' ? 'primary' : 'secondary'}
                        className="text-xs h-4 px-2"
                      >
                        {ins.type === 'server' ? '服务端' : '客户端'}
                      </Chip>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </CardBody>
      </Card>


      {/* 提取模态框 */}
      <Modal isOpen={extractOpen} onClose={() => setExtractOpen(false)} size="lg">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>实例URL提取</ModalHeader>
              <ModalBody>
                <Textarea readOnly minRows={10} value={instances.map(i => i.commandLine).join("\n")} />
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={() => {navigator.clipboard.writeText(instances.map(i=>i.commandLine).join("\n")); addToast({title:'已复制',color:'success'});}}>复制全部</Button>
                <Button onPress={() => setExtractOpen(false)}>关闭</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 添加实例模态框 */}
      <Modal isOpen={isAddTunnelOpen} onOpenChange={onAddTunnelOpenChange} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>添加实例</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Input
                    label="实例名称"
                    placeholder="请输入实例名称（可选）"
                    value={tunnelName}
                    onValueChange={setTunnelName}
                  />
                  <Input
                    label="隧道URL"
                    placeholder="例如：server://0.0.0.0:8080/127.0.0.1:3000"
                    value={tunnelUrl}
                    onValueChange={setTunnelUrl}
                    isRequired
                  />
                  <p className="text-tiny text-default-500">
                    格式：server://bind_addr:bind_port/target_host:target_port 或 client://server_host:server_port/local_host:local_port
                  </p>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="primary" onPress={handleSubmitAddTunnel}>添加</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 重命名模态框 */}
      <Modal isOpen={isRenameOpen} onOpenChange={onRenameOpenChange} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>重命名主控</ModalHeader>
              <ModalBody>
                <Input
                  label="主控名称"
                  placeholder="请输入新的主控名称"
                  value={newName}
                  onValueChange={setNewName}
                  isRequired
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="primary" onPress={handleSubmitRename}>确定</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 修改密钥模态框 */}
      <Modal isOpen={isEditApiKeyOpen} onOpenChange={onEditApiKeyOpenChange} placement="center">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>修改API密钥</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <p className="text-sm text-warning-600">
                    ⚠️ 修改API密钥将会断开当前连接并使用新密钥重新连接
                  </p>
                  <Input
                    label="新的API Key"
                    placeholder="请输入新的API密钥"
                    value={newApiKey}
                    onValueChange={setNewApiKey}
                    type="password"
                    isRequired
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button color="warning" onPress={handleSubmitEditApiKey}>确定修改</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 导入模态框 */}
      <Modal isOpen={importOpen} onClose={() => setImportOpen(false)} size="lg">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>导入URL</ModalHeader>
              <ModalBody>
                <Textarea placeholder="在此粘贴 URL，每行一个..." minRows={10} />
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" onPress={() => setImportOpen(false)}>确定</Button>
                <Button onPress={() => setImportOpen(false)}>取消</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
} 