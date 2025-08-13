'use client';

import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Progress, Chip, Spinner } from '@heroui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faServer, faDatabase, faChartLine, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';

interface QueueStatus {
  timestamp: string;
  sse_service: {
    store_job_queue: {
      current: number;
      capacity: number;
      usage_pct: number;
    };
    batch_insert_queue: {
      current: number;
      capacity: number;
      usage_pct: number;
    };
    batch_insert_buffer: {
      current: number;
      capacity: number;
      usage_pct: number;
    };
    workers: number;
  };
}

export default function QueueMonitorPage() {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/sse/queue-status');
      const data = await response.json();
      
      if (data.success) {
        setQueueStatus(data.data);
        setError(null);
      } else {
        setError(data.error || '获取队列状态失败');
      }
    } catch (err) {
      setError('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueStatus();
    
    // 每5秒刷新一次
    const interval = setInterval(fetchQueueStatus, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const getUsageColor = (usage: number) => {
    if (usage < 50) return 'success';
    if (usage < 80) return 'warning';
    return 'danger';
  };

  const getUsageStatus = (usage: number) => {
    if (usage < 50) return '正常';
    if (usage < 80) return '警告';
    return '危险';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
        <span className="ml-2">加载队列状态中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 text-4xl mb-4" />
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">队列状态监控</h1>
        <p className="text-gray-600">
          最后更新: {queueStatus?.timestamp ? new Date(queueStatus.timestamp).toLocaleString('zh-CN') : '未知'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 存储任务队列 */}
        <Card className="w-full">
          <CardHeader className="flex gap-3">
            <FontAwesomeIcon icon={faDatabase} className="text-blue-500" />
            <div className="flex flex-col">
              <p className="text-md">存储任务队列</p>
              <p className="text-small text-default-500">事件持久化队列</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span>使用率</span>
                <Chip 
                  color={getUsageColor(queueStatus?.sse_service.store_job_queue.usage_pct || 0)}
                  variant="flat"
                  size="sm"
                >
                  {getUsageStatus(queueStatus?.sse_service.store_job_queue.usage_pct || 0)}
                </Chip>
              </div>
              <Progress 
                value={queueStatus?.sse_service.store_job_queue.usage_pct || 0}
                color={getUsageColor(queueStatus?.sse_service.store_job_queue.usage_pct || 0)}
                className="w-full"
              />
              <div className="text-sm text-gray-600">
                {queueStatus?.sse_service.store_job_queue.current || 0} / {queueStatus?.sse_service.store_job_queue.capacity || 0}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 批量插入队列 */}
        <Card className="w-full">
          <CardHeader className="flex gap-3">
            <FontAwesomeIcon icon={faChartLine} className="text-green-500" />
            <div className="flex flex-col">
              <p className="text-md">批量插入队列</p>
              <p className="text-small text-default-500">批量数据库写入队列</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span>使用率</span>
                <Chip 
                  color={getUsageColor(queueStatus?.sse_service.batch_insert_queue.usage_pct || 0)}
                  variant="flat"
                  size="sm"
                >
                  {getUsageStatus(queueStatus?.sse_service.batch_insert_queue.usage_pct || 0)}
                </Chip>
              </div>
              <Progress 
                value={queueStatus?.sse_service.batch_insert_queue.usage_pct || 0}
                color={getUsageColor(queueStatus?.sse_service.batch_insert_queue.usage_pct || 0)}
                className="w-full"
              />
              <div className="text-sm text-gray-600">
                {queueStatus?.sse_service.batch_insert_queue.current || 0} / {queueStatus?.sse_service.batch_insert_queue.capacity || 0}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 批量插入缓冲区 */}
        <Card className="w-full">
          <CardHeader className="flex gap-3">
            <FontAwesomeIcon icon={faServer} className="text-purple-500" />
            <div className="flex flex-col">
              <p className="text-md">批量插入缓冲区</p>
              <p className="text-small text-default-500">内存缓冲区</p>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span>使用率</span>
                <Chip 
                  color={getUsageColor(queueStatus?.sse_service.batch_insert_buffer.usage_pct || 0)}
                  variant="flat"
                  size="sm"
                >
                  {getUsageStatus(queueStatus?.sse_service.batch_insert_buffer.usage_pct || 0)}
                </Chip>
              </div>
              <Progress 
                value={queueStatus?.sse_service.batch_insert_buffer.usage_pct || 0}
                color={getUsageColor(queueStatus?.sse_service.batch_insert_buffer.usage_pct || 0)}
                className="w-full"
              />
              <div className="text-sm text-gray-600">
                {queueStatus?.sse_service.batch_insert_buffer.current || 0} / {queueStatus?.sse_service.batch_insert_buffer.capacity || 0}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 系统信息 */}
      <Card className="mt-6">
        <CardHeader>
          <h3 className="text-lg font-semibold">系统信息</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="font-medium">存储Worker数量:</span>
              <span className="ml-2">{queueStatus?.sse_service.workers || 0}</span>
            </div>
            <div>
              <span className="font-medium">监控状态:</span>
              <Chip 
                color="success" 
                variant="flat" 
                size="sm" 
                className="ml-2"
              >
                正常
              </Chip>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 优化建议 */}
      {(queueStatus?.sse_service.store_job_queue.usage_pct || 0) > 80 && (
        <Card className="mt-6 border-orange-200 bg-orange-50">
          <CardHeader>
            <h3 className="text-lg font-semibold text-orange-800">⚠️ 优化建议</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-2 text-orange-700">
              <p>• 存储任务队列使用率过高，建议增加Worker数量或优化数据库写入性能</p>
              <p>• 检查数据库连接池配置和索引优化</p>
              <p>• 考虑启用批量写入模式减少数据库压力</p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
