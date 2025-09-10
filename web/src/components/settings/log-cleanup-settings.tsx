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
import { Icon } from '@iconify/react';
import { addToast } from '@heroui/toast';
import { buildApiUrl } from '@/lib/utils';

interface LogCleanupStats {
  enabled: boolean;
  retention_days: number;
  cleanup_interval: string;
  max_records_per_day: number;
  last_cleanup_time: string;
  log_file_count: number;
  log_file_size: number;
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
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

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
      const response = await fetch(buildApiUrl('/api/sse/log-cleanup/stats'));
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
      const response = await fetch(buildApiUrl('/api/sse/log-cleanup/config'));
      const data = await response.json();
      if (data.success && data.data) {
        const configData = data.data;
        setConfig(configData);
        // 根据API返回的字段名设置表单配置
        setFormConfig({
          retentionDays: configData.retentionDays || configData.retention_days || 7,
          cleanupInterval: configData.cleanupInterval || configData.cleanup_interval || "24h",
          maxRecordsPerDay: configData.maxRecordsPerDay || configData.max_records_per_day || 10000,
          cleanupEnabled: configData.cleanupEnabled !== undefined ? configData.cleanupEnabled : 
                         configData.enabled !== undefined ? configData.enabled : true,
        });
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

  // 刷新数据
  const refreshData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchStats(), fetchConfig()]);
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
      await Promise.all([fetchStats(), fetchConfig()]);
      setLoading(false);
    };
    loadData();
    
    // 定期刷新统计信息
    const interval = setInterval(() => {
      fetchStats();
    }, 60000); // 每60秒刷新一次
    return () => clearInterval(interval);
  }, []);

  // 更新配置
  const handleUpdateConfig = async () => {
    setUpdating(true);
    try {
      const response = await fetch(buildApiUrl('/api/sse/log-cleanup/config'), {
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
      const response = await fetch(buildApiUrl('/api/sse/log-cleanup/trigger'), {
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
  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(num)) {
      return '0';
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  // 计算文件大小格式化
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined || isNaN(bytes)) {
      return '0 B';
    }
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
            <p className="text-lg font-semibold">日志清理统计</p>
            <p className="text-sm text-default-500">当前日志清理系统状态</p>
          </div>
          <Button
            color="default"
            variant="ghost"
            size="sm"
            isLoading={refreshing}
            startContent={<Icon icon="solar:refresh-bold" width={18} />}
            onPress={refreshData}
          >
            刷新数据
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          {stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg">
                <Icon 
                  icon={stats.enabled ? "solar:check-circle-bold" : "solar:danger-triangle-bold"} 
                  className={`text-xl ${stats.enabled ? 'text-success' : 'text-warning'}`} 
                />
                <div>
                  <p className="text-xs text-default-600">清理状态</p>
                  <p className="text-xl font-bold text-primary">
                    {stats.enabled ? '已启用' : '已禁用'}
                  </p>
                  <p className="text-xs text-default-500">自动清理</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-lg">
                <Icon icon="solar:document-text-bold" className="text-secondary text-xl" />
                <div>
                  <p className="text-xs text-default-600">日志文件数</p>
                  <p className="text-xl font-bold text-secondary">
                    {formatNumber(stats.log_file_count || 0)}
                  </p>
                  <p className="text-xs text-default-500">文件数量</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-success/10 rounded-lg">
                <Icon icon="solar:database-bold" className="text-success text-xl" />
                <div>
                  <p className="text-xs text-default-600">日志文件大小</p>
                  <p className="text-xl font-bold text-success">
                    {formatFileSize(stats.log_file_size || 0)}
                  </p>
                  <p className="text-xs text-default-500">磁盘占用</p>
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
        <CardHeader className="flex flex-col sm:flex-row gap-3 sm:gap-3">
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">日志清理配置</p>
            <p className="text-sm text-default-500">管理日志自动清理规则</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              color="primary"
              variant="ghost"
              size="sm"
              className="sm:size-md"
              startContent={<Icon icon="solar:settings-bold" width={18} />}
              onPress={onOpen}
            >
              <span className="hidden sm:inline">配置清理规则</span>
              <span className="sm:hidden">配置</span>
            </Button>
            <Button
              color="secondary"
              size="sm"
              className="sm:size-md"
              isLoading={triggering}
              startContent={<Icon icon="solar:play-bold" width={18} />}
              onPress={handleTriggerCleanup}
            >
              <span className="hidden sm:inline">手动清理</span>
              <span className="sm:hidden">清理</span>
            </Button>
          </div>
        </CardHeader>
        <Divider />
        <CardBody>
          {config ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">保留天数</span>
                  <Chip color="primary" variant="flat">
                    {config.retentionDays || stats?.retention_days || 7} 天
                  </Chip>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">清理间隔</span>
                  <Chip color="secondary" variant="flat">
                    {config.cleanupInterval || stats?.cleanup_interval || '24h'}
                  </Chip>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">每日最大记录数</span>
                  <Chip color="warning" variant="flat">
                    {(config.maxRecordsPerDay || stats?.max_records_per_day) === 0 ? '无限制' : 
                     formatNumber(config.maxRecordsPerDay || stats?.max_records_per_day || 10000)}
                  </Chip>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">自动清理状态</span>
                  <Chip 
                    color={getStatusColor(config.cleanupEnabled ?? stats?.enabled ?? true)}
                    variant="flat"
                  >
                    {(config.cleanupEnabled ?? stats?.enabled ?? true) ? '已启用' : '已禁用'}
                  </Chip>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  💡 <strong>日志清理说明：</strong> 
                  系统会定期清理超过保留天数的日志记录，保持数据库性能。
                  清理任务会自动在后台执行，也可以手动触发清理。
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">无法获取配置数据</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 配置模态框 */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon icon="solar:settings-bold" width={20} />
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
                  isSelected={formConfig.cleanupEnabled || false}
                  onValueChange={(value) => 
                    setFormConfig(prev => ({ ...prev, cleanupEnabled: value }))
                  }
                />
              </div>
              
              <Input
                label="日志保留天数"
                description="超过此天数的数据库事件将被删除"
                type="number"
                value={(formConfig.retentionDays || 7).toString()}
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
                value={formConfig.cleanupInterval || "24h"}
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
                value={(formConfig.maxRecordsPerDay || 0).toString()}
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
                  日志清理功能会影响系统日志的保留时间，清理后的日志无法恢复。
                  建议根据实际需要合理设置保留天数。
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