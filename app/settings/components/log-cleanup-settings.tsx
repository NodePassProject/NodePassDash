'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Switch,
  Divider,
  Chip,
  Progress,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from '@heroui/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrashCan,
  faGears,
  faChartLine,
  faPlay,
  faDatabase,
  faCloudArrowDown,
  faCheck,
  faExclamationTriangle,
  faRefresh,
  faBroadcastTower,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { addToast } from '@heroui/toast';

interface LogCleanupStats {
  totalLogRecords: number; // 数据库中的非日志事件数量
  retentionDays: number;
  cleanupInterval: string;
  maxRecordsPerDay: number;
  cleanupEnabled: boolean;
  oldestDbEventAge?: string;
  fileLogStats?: {
    totalFiles: number;
    totalSize: number;
    retentionDays: number;
    oldestLogAge?: string;
    newestLogAge?: string;
  };
  logStorageMode?: string;
}

interface EndpointSSEStats {
  totalEvents: number;
  oldestEvent?: string;
  newestEvent?: string;
  lastUpdated: string;
}

interface LogCleanupConfig {
  retentionDays: number;
  cleanupInterval: string;
  maxRecordsPerDay: number;
  cleanupEnabled: boolean;
}

export default function LogCleanupSettings() {
  const [stats, setStats] = useState<LogCleanupStats | null>(null);
  const [config, setConfig] = useState<LogCleanupConfig | null>(null);
  const [endpointSSEStats, setEndpointSSEStats] = useState<EndpointSSEStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clearingSSE, setClearingSSE] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isClearSSEOpen, onOpen: onClearSSEOpen, onClose: onClearSSEClose } = useDisclosure();

  // 表单状态
  const [formConfig, setFormConfig] = useState<LogCleanupConfig>({
    retentionDays: 7,
    cleanupInterval: "24h",
    maxRecordsPerDay: 10000,
    cleanupEnabled: true,
  });

  // 获取统计信息
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/sse/log-cleanup/stats');
      const data = await response.json();
      if (data.success && data.data) {
        setStats(data.data);
      } else {
        console.error('获取日志统计失败:', data.error);
        addToast({
          title: "获取统计失败",
          description: data.error || "无法获取日志统计信息",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('获取日志统计失败:', error);
      addToast({
        title: "网络错误",
        description: "获取日志统计信息失败，请检查网络连接",
        color: "danger",
      });
    }
  };

  // 获取配置信息
  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/sse/log-cleanup/config');
      const data = await response.json();
      if (data.success && data.data) {
        setConfig(data.data);
        setFormConfig(data.data);
      } else {
        console.error('获取配置失败:', data.error);
        addToast({
          title: "获取配置失败",
          description: data.error || "无法获取清理配置",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('获取配置失败:', error);
      addToast({
        title: "网络错误",
        description: "获取清理配置失败，请检查网络连接",
        color: "danger",
      });
    }
  };

  // 获取EndpointSSE统计信息
  const fetchEndpointSSEStats = async () => {
    try {
      const response = await fetch('/api/sse/endpoint-stats');
      const data = await response.json();
      if (data.success && data.data) {
        setEndpointSSEStats(data.data);
      } else {
        console.error('获取EndpointSSE统计失败:', data.error);
        addToast({
          title: "获取EndpointSSE统计失败",
          description: data.error || "无法获取EndpointSSE统计信息",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('获取EndpointSSE统计失败:', error);
      addToast({
        title: "网络错误",
        description: "获取EndpointSSE统计信息失败，请检查网络连接",
        color: "danger",
      });
    }
  };

  // 清空EndpointSSE数据
  const handleClearEndpointSSE = async () => {
    setClearingSSE(true);
    try {
      const response = await fetch('/api/sse/endpoint-clear', {
        method: 'DELETE',
      });
      
      const data = await response.json();
      if (data.success) {
        await fetchEndpointSSEStats(); // 刷新统计信息
        onClearSSEClose();
        addToast({
          title: "清空成功",
          description: `已清空 ${data.deletedCount} 条EndpointSSE记录`,
          color: "success",
        });
      } else {
        addToast({
          title: "清空失败",
          description: data.error || "清空EndpointSSE失败",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('清空EndpointSSE失败:', error);
      addToast({
        title: "网络错误",
        description: "清空EndpointSSE失败，请检查网络连接",
        color: "danger",
      });
    }
    setClearingSSE(false);
  };

  // 刷新数据
  const refreshData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchConfig(), fetchEndpointSSEStats()]);
      addToast({
        title: "刷新成功",
        description: "统计数据已更新",
        color: "success",
      });
    } catch (error) {
      console.error('刷新数据失败:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // 初始化数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchConfig(), fetchEndpointSSEStats()]);
      setLoading(false);
    };
    loadData();
    
    // 定期刷新统计信息
    const interval = setInterval(() => {
      fetchStats();
      fetchEndpointSSEStats();
    }, 60000); // 每60秒刷新一次
    return () => clearInterval(interval);
  }, []);

  // 更新配置
  const handleUpdateConfig = async () => {
    setUpdating(true);
    try {
      const response = await fetch('/api/sse/log-cleanup/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formConfig),
      });
      
      const data = await response.json();
      if (data.success) {
        setConfig(data.data);
        await fetchStats(); // 刷新统计信息
        onClose();
        addToast({
          title: "配置更新成功",
          description: "日志清理配置已保存",
          color: "success",
        });
      } else {
        addToast({
          title: "更新失败",
          description: data.error || "配置更新失败",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('更新配置失败:', error);
      addToast({
        title: "网络错误",
        description: "配置更新失败，请检查网络连接",
        color: "danger",
      });
    }
    setUpdating(false);
  };

  // 手动触发清理
  const handleTriggerCleanup = async () => {
    setTriggering(true);
    try {
      const response = await fetch('/api/sse/log-cleanup/trigger', {
        method: 'POST',
      });
      
      const data = await response.json();
      if (data.success) {
        addToast({
          title: "清理任务已启动",
          description: "日志清理将在后台执行，请稍候查看统计数据",
          color: "success",
        });
        // 延迟刷新统计信息，等待清理完成
        setTimeout(fetchStats, 5000);
      } else {
        addToast({
          title: "启动清理失败",
          description: data.error || "无法启动清理任务",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('触发清理失败:', error);
      addToast({
        title: "网络错误",
        description: "启动清理任务失败，请检查网络连接",
        color: "danger",
      });
    }
    setTriggering(false);
  };

  // 格式化数字
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  // 计算文件大小格式化
  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    } else if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else if (bytes >= 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return bytes + ' B';
  };

  // 获取状态颜色
  const getStatusColor = (enabled: boolean) => {
    return enabled ? 'success' : 'warning';
  };

  if (loading) {
    return (
      <Card className="mt-5 p-2">
        <CardBody className="flex items-center justify-center h-48">
          <Progress
            isIndeterminate
            size="sm"
            className="max-w-md"
            label="加载日志清理设置..."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 统计信息卡片 */}
      <Card className="mt-5 p-2">
        <CardHeader className="flex gap-3">
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">日志存储统计</p>
            <p className="text-sm text-default-500">当前日志数据库使用情况</p>
          </div>
          <Button
            color="default"
            variant="ghost"
            size="sm"
            isLoading={refreshing}
            startContent={<FontAwesomeIcon icon={faRefresh} />}
            onPress={refreshData}
          >
            刷新数据
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          {stats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg">
                <FontAwesomeIcon icon={faBroadcastTower} className="text-primary text-xl" />
                <div>
                  <p className="text-xs text-default-600">推送事件总数</p>
                  <p className="text-xl font-bold text-primary">
                    {endpointSSEStats ? formatNumber(endpointSSEStats.totalEvents) : formatNumber(stats.totalLogRecords || 0)}
                  </p>
                  <p className="text-xs text-default-500">SSE记录</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-lg">
                <FontAwesomeIcon icon={faCloudArrowDown} className="text-secondary text-xl" />
                <div>
                  <p className="text-xs text-default-600">文件日志数量</p>
                  <p className="text-xl font-bold text-secondary">
                    {stats.fileLogStats ? formatNumber(stats.fileLogStats.totalFiles) : '0'}
                  </p>
                  <p className="text-xs text-default-500">日志文件</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg">
                <FontAwesomeIcon icon={faChartLine} className="text-warning text-xl" />
                <div>
                  <p className="text-xs text-default-600">文件日志大小</p>
                  <p className="text-xl font-bold text-warning">
                    {stats.fileLogStats ? formatFileSize(stats.fileLogStats.totalSize) : '0 B'}
                  </p>
                  <p className="text-xs text-default-500">磁盘占用</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-success/10 rounded-lg">
                <FontAwesomeIcon 
                  icon={stats.cleanupEnabled ? faCheck : faExclamationTriangle} 
                  className={`text-xl ${stats.cleanupEnabled ? 'text-success' : 'text-warning'}`} 
                />
                <div>
                  <p className="text-xs text-default-600">存储模式</p>
                  <Chip 
                    color="success"
                    variant="flat"
                    size="sm"
                  >
                    {stats.logStorageMode === 'hybrid' ? '混合存储' : '数据库存储'}
                  </Chip>
                  <p className="text-xs text-default-500">
                    {stats.cleanupEnabled ? '自动清理已启用' : '自动清理已禁用'}
                  </p>
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



      {/* 配置信息卡片 */}
      <Card className="p-2">
        <CardHeader className="flex gap-3">
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">日志清理配置</p>
            <p className="text-sm text-default-500">管理日志自动清理规则</p>
          </div>
          <div className="flex gap-2">
            <Button
              color="primary"
              variant="ghost"
              startContent={<FontAwesomeIcon icon={faGears} />}
              onPress={onOpen}
            >
              配置清理规则
            </Button>
            <Button
              color="danger"
              variant="ghost"
              isLoading={clearingSSE}
              startContent={<FontAwesomeIcon icon={faTrash} />}
              onPress={onClearSSEOpen}
            >
              清空SSE记录
            </Button>
            <Button
              color="secondary"
              isLoading={triggering}
              startContent={<FontAwesomeIcon icon={faPlay} />}
              onPress={handleTriggerCleanup}
            >
              清理日志
            </Button>

          </div>
        </CardHeader>
        <Divider />
        <CardBody>
          {config ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-default-700 mb-3">数据库配置</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">事件保留天数</span>
                  <Chip color="primary" variant="flat">{config.retentionDays} 天</Chip>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">清理间隔</span>
                  <Chip color="secondary" variant="flat">{config.cleanupInterval}</Chip>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">每日最大事件数</span>
                  <Chip color="warning" variant="flat">
                    {config.maxRecordsPerDay === 0 ? '无限制' : formatNumber(config.maxRecordsPerDay)}
                  </Chip>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-default-700 mb-3">文件日志配置</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">文件日志保留</span>
                  <Chip color="success" variant="flat">
                    {stats?.fileLogStats?.retentionDays || 7} 天
                  </Chip>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">自动清理状态</span>
                  <Chip 
                    color={getStatusColor(config.cleanupEnabled)}
                    variant="flat"
                  >
                    {config.cleanupEnabled ? '已启用' : '已禁用'}
                  </Chip>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">存储方式</span>
                  <Chip color="default" variant="flat">
                    事件→数据库 | 日志→文件
                  </Chip>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">无法获取配置数据</p>
            </div>
          )}
          
          {stats && (
            <div className="mt-6 pt-4 border-t border-divider">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-default-600">
                {stats.oldestDbEventAge && (
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faDatabase} />
                    <span>最早数据库事件: {stats.oldestDbEventAge} 前</span>
                  </div>
                )}
                {stats.fileLogStats?.oldestLogAge && (
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faChartLine} />
                    <span>最早文件日志: {stats.fileLogStats.oldestLogAge} 前</span>
                  </div>
                )}
              </div>
              
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  💡 <strong>混合存储模式说明：</strong> 
                  系统自动将日志内容存储到文件系统中（按端点/实例/日期分类），
                  其他事件（创建、更新、删除等）存储在数据库中。
                  这样可以提高日志查询性能，同时减少数据库大小。
                </p>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 清空EndpointSSE确认对话框 */}
      <Modal isOpen={isClearSSEOpen} onClose={onClearSSEClose}>
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning" />
              确认清空EndpointSSE数据
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-sm">
                您即将清空所有的EndpointSSE推送事件记录。此操作将删除数据库中的所有EndpointSSE数据。
              </p>
              
              {endpointSSEStats && (
                <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
                  <p className="text-xs text-warning-600 dark:text-warning-400">
                    <strong>即将删除：</strong> {formatNumber(endpointSSEStats.totalEvents)} 条EndpointSSE记录
                  </p>
                </div>
              )}
              
              <div className="p-3 bg-danger-50 dark:bg-danger-900/20 rounded-lg">
                <p className="text-xs text-danger-600 dark:text-danger-400">
                  ⚠️ <strong>注意：</strong>
                  此操作不可撤销，清空后的数据无法恢复。
                  请确认您真的要执行这个操作。
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="default" variant="light" onPress={onClearSSEClose}>
              取消
            </Button>
            <Button 
              color="danger" 
              onPress={handleClearEndpointSSE}
              isLoading={clearingSSE}
              startContent={<FontAwesomeIcon icon={faTrash} />}
            >
              确认清空
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 配置模态框 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faGears} />
              配置日志清理规则
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">启用自动清理</p>
                  <p className="text-xs text-default-500">开启后将按照配置规则定期清理过期日志</p>
                </div>
                <Switch
                  isSelected={formConfig.cleanupEnabled}
                  onValueChange={(value) => 
                    setFormConfig(prev => ({ ...prev, cleanupEnabled: value }))
                  }
                />
              </div>
              
              <Input
                label="日志保留天数"
                description="超过此天数的数据库事件将被删除"
                type="number"
                value={formConfig.retentionDays.toString()}
                onChange={(e) => 
                  setFormConfig(prev => ({ 
                    ...prev, 
                    retentionDays: parseInt(e.target.value) || 7 
                  }))
                }
                min={1}
                max={365}
              />
              
              <Input
                label="清理间隔"
                description="清理任务执行间隔，格式如: 24h, 12h, 6h"
                value={formConfig.cleanupInterval}
                onChange={(e) => 
                  setFormConfig(prev => ({ 
                    ...prev, 
                    cleanupInterval: e.target.value 
                  }))
                }
                placeholder="24h"
              />
              
              <Input
                label="每日最大记录数"
                description="每个端点每天保留的最大数据库事件记录数，0表示无限制"
                type="number"
                value={formConfig.maxRecordsPerDay.toString()}
                onChange={(e) => 
                  setFormConfig(prev => ({ 
                    ...prev, 
                    maxRecordsPerDay: parseInt(e.target.value) || 0 
                  }))
                }
                min={0}
              />
              
              <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
                <p className="text-xs text-warning-600 dark:text-warning-400">
                  ⚠️ <strong>注意：</strong>
                  文件日志由文件日志管理器自动管理，保留天数固定为7天。
                  这里的配置仅影响数据库中的事件记录清理。
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={onClose}>
              取消
            </Button>
            <Button 
              color="primary" 
              onPress={handleUpdateConfig}
              isLoading={updating}
            >
              保存配置
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
} 