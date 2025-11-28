import React, { useState, useEffect } from "react";
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
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";

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
  const { t } = useTranslation("settings");
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
      const response = await fetch(buildApiUrl("/api/sse/log-cleanup/stats"));
      const data = await response.json();

      if (data.success && data.data) {
        setStats(data.data);
      } else {
        console.error("获取日志统计失败:", data.error);
        addToast({
          title: t("logs.toast.statsFailed"),
          description: data.error || t("logs.toast.statsFailedDesc"),
          color: "danger",
        });
      }
    } catch (error) {
      console.error("获取日志统计失败:", error);
      addToast({
        title: t("logs.toast.networkError"),
        description: t("logs.toast.statsNetworkError"),
        color: "danger",
      });
    }
  };

  // 获取配置信息
  const fetchConfig = async () => {
    try {
      const response = await fetch(buildApiUrl("/api/sse/log-cleanup/config"));
      const data = await response.json();

      if (data.success && data.data) {
        const configData = data.data;

        setConfig(configData);
        // 根据API返回的字段名设置表单配置
        setFormConfig({
          retentionDays:
            configData.retentionDays || configData.retention_days || 7,
          cleanupInterval:
            configData.cleanupInterval || configData.cleanup_interval || "24h",
          maxRecordsPerDay:
            configData.maxRecordsPerDay ||
            configData.max_records_per_day ||
            10000,
          cleanupEnabled:
            configData.cleanupEnabled !== undefined
              ? configData.cleanupEnabled
              : configData.enabled !== undefined
                ? configData.enabled
                : true,
        });
      } else {
        console.error("获取配置失败:", data.error);
        addToast({
          title: t("logs.toast.configFailed"),
          description: data.error || t("logs.toast.configFailedDesc"),
          color: "danger",
        });
      }
    } catch (error) {
      console.error("获取配置失败:", error);
      addToast({
        title: t("logs.toast.networkError"),
        description: t("logs.toast.configNetworkError"),
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
        title: t("logs.toast.refreshSuccess"),
        description: t("logs.toast.refreshSuccessDesc"),
        color: "success",
      });
    } catch (error) {
      console.error("刷新数据失败:", error);
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
      const response = await fetch(buildApiUrl("/api/sse/log-cleanup/config"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formConfig),
      });

      const data = await response.json();

      if (data.success) {
        setConfig(data.data);
        await fetchStats(); // 刷新统计信息
        onClose();
        addToast({
          title: t("logs.toast.updateSuccess"),
          description: t("logs.toast.updateSuccessDesc"),
          color: "success",
        });
      } else {
        addToast({
          title: t("logs.toast.updateFailed"),
          description: data.error || t("logs.toast.updateFailedDesc"),
          color: "danger",
        });
      }
    } catch (error) {
      console.error("更新配置失败:", error);
      addToast({
        title: t("logs.toast.networkError"),
        description: t("logs.toast.updateNetworkError"),
        color: "danger",
      });
    }
    setUpdating(false);
  };

  // 手动触发清理
  const handleTriggerCleanup = async () => {
    setTriggering(true);
    try {
      const response = await fetch(
        buildApiUrl("/api/sse/log-cleanup/trigger"),
        {
          method: "POST",
        },
      );

      const data = await response.json();

      if (data.success) {
        addToast({
          title: t("logs.toast.cleanupStarted"),
          description: t("logs.toast.cleanupStartedDesc"),
          color: "success",
        });
        // 延迟刷新统计信息，等待清理完成
        setTimeout(fetchStats, 5000);
      } else {
        addToast({
          title: t("logs.toast.cleanupFailed"),
          description: data.error || t("logs.toast.cleanupFailedDesc"),
          color: "danger",
        });
      }
    } catch (error) {
      console.error("触发清理失败:", error);
      addToast({
        title: t("logs.toast.networkError"),
        description: t("logs.toast.cleanupNetworkError"),
        color: "danger",
      });
    }
    setTriggering(false);
  };

  // 格式化数字
  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(num)) {
      return "0";
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }

    return num.toString();
  };

  // 计算文件大小格式化
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined || isNaN(bytes)) {
      return "0 B";
    }
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
    } else if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    } else if (bytes >= 1024) {
      return (bytes / 1024).toFixed(1) + " KB";
    }

    return bytes + " B";
  };

  // 获取状态颜色
  const getStatusColor = (enabled: boolean) => {
    return enabled ? "success" : "warning";
  };

  if (loading) {
    return (
      <Card className="mt-5 p-2">
        <CardBody className="flex items-center justify-center h-48">
          <Progress
            isIndeterminate
            className="max-w-md"
            label={t("logs.loading")}
            size="sm"
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
            <p className="text-lg font-semibold">{t("logs.stats.title")}</p>
            <p className="text-sm text-default-500">{t("logs.stats.description")}</p>
          </div>
          <Button
            color="default"
            isLoading={refreshing}
            size="sm"
            startContent={<Icon icon="solar:refresh-bold" width={18} />}
            variant="ghost"
            onPress={refreshData}
          >
            {t("logs.stats.refresh")}
          </Button>
        </CardHeader>
        <Divider />
        <CardBody>
          {stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-primary/10 rounded-lg">
                <Icon
                  className={`text-xl ${stats.enabled ? "text-success" : "text-warning"}`}
                  icon={
                    stats.enabled
                      ? "solar:check-circle-bold"
                      : "solar:danger-triangle-bold"
                  }
                />
                <div>
                  <p className="text-xs text-default-600">{t("logs.stats.status")}</p>
                  <p className="text-xl font-bold text-primary">
                    {stats.enabled ? t("logs.stats.enabled") : t("logs.stats.disabled")}
                  </p>
                  <p className="text-xs text-default-500">{t("logs.stats.autoCleanup")}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-lg">
                <Icon
                  className="text-secondary text-xl"
                  icon="solar:document-text-bold"
                />
                <div>
                  <p className="text-xs text-default-600">{t("logs.stats.fileCount")}</p>
                  <p className="text-xl font-bold text-secondary">
                    {formatNumber(stats.log_file_count || 0)}
                  </p>
                  <p className="text-xs text-default-500">{t("logs.stats.fileCountUnit")}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-success/10 rounded-lg">
                <Icon
                  className="text-success text-xl"
                  icon="solar:database-bold"
                />
                <div>
                  <p className="text-xs text-default-600">{t("logs.stats.fileSize")}</p>
                  <p className="text-xl font-bold text-success">
                    {formatFileSize(stats.log_file_size || 0)}
                  </p>
                  <p className="text-xs text-default-500">{t("logs.stats.diskUsage")}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">{t("logs.stats.noData")}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 配置信息卡片 */}
      <Card className="p-2">
        <CardHeader className="flex flex-col sm:flex-row gap-3 sm:gap-3">
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">{t("logs.config.title")}</p>
            <p className="text-sm text-default-500">{t("logs.config.description")}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              className="sm:size-md"
              color="primary"
              size="sm"
              startContent={<Icon icon="solar:settings-bold" width={18} />}
              variant="ghost"
              onPress={onOpen}
            >
              <span className="hidden sm:inline">{t("logs.config.configureButton")}</span>
              <span className="sm:hidden">{t("logs.config.configureShort")}</span>
            </Button>
            <Button
              className="sm:size-md"
              color="secondary"
              isLoading={triggering}
              size="sm"
              startContent={<Icon icon="solar:play-bold" width={18} />}
              onPress={handleTriggerCleanup}
            >
              <span className="hidden sm:inline">{t("logs.config.manualCleanup")}</span>
              <span className="sm:hidden">{t("logs.config.manualCleanupShort")}</span>
            </Button>
          </div>
        </CardHeader>
        <Divider />
        <CardBody>
          {config ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("logs.config.retentionDays")}</span>
                  <Chip color="primary" variant="flat">
                    {config.retentionDays || stats?.retention_days || 7} {t("logs.config.retentionDaysUnit")}
                  </Chip>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("logs.config.cleanupInterval")}</span>
                  <Chip color="secondary" variant="flat">
                    {config.cleanupInterval || stats?.cleanup_interval || "24h"}
                  </Chip>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("logs.config.maxRecordsPerDay")}</span>
                  <Chip color="warning" variant="flat">
                    {(config.maxRecordsPerDay || stats?.max_records_per_day) ===
                    0
                      ? t("logs.config.unlimited")
                      : formatNumber(
                          config.maxRecordsPerDay ||
                            stats?.max_records_per_day ||
                            10000,
                        )}
                  </Chip>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("logs.config.autoCleanupStatus")}</span>
                  <Chip
                    color={getStatusColor(
                      config.cleanupEnabled ?? stats?.enabled ?? true,
                    )}
                    variant="flat"
                  >
                    {(config.cleanupEnabled ?? stats?.enabled ?? true)
                      ? t("logs.config.enabled")
                      : t("logs.config.disabled")}
                  </Chip>
                </div>
              </div>

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  <strong>{t("logs.config.hint")}</strong>
                  {t("logs.config.hintDesc")}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">{t("logs.config.noData")}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 配置模态框 */}
      <Modal isOpen={isOpen} size="2xl" onClose={onClose}>
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon icon="solar:settings-bold" width={20} />
              {t("logs.modal.title")}
            </div>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("logs.modal.enableAutoCleanup")}</p>
                  <p className="text-xs text-default-500">
                    {t("logs.modal.enableAutoCleanupDesc")}
                  </p>
                </div>
                <Switch
                  isSelected={formConfig.cleanupEnabled || false}
                  onValueChange={(value) =>
                    setFormConfig((prev) => ({
                      ...prev,
                      cleanupEnabled: value,
                    }))
                  }
                />
              </div>

              <Input
                description={t("logs.modal.retentionDaysDesc")}
                label={t("logs.modal.retentionDays")}
                max={365}
                min={1}
                type="number"
                value={(formConfig.retentionDays || 7).toString()}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    retentionDays: parseInt(e.target.value) || 7,
                  }))
                }
              />

              <Input
                description={t("logs.modal.cleanupIntervalDesc")}
                label={t("logs.modal.cleanupInterval")}
                placeholder={t("logs.modal.cleanupIntervalPlaceholder")}
                value={formConfig.cleanupInterval || "24h"}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    cleanupInterval: e.target.value,
                  }))
                }
              />

              <Input
                description={t("logs.modal.maxRecordsPerDayDesc")}
                label={t("logs.modal.maxRecordsPerDay")}
                min={0}
                type="number"
                value={(formConfig.maxRecordsPerDay || 0).toString()}
                onChange={(e) =>
                  setFormConfig((prev) => ({
                    ...prev,
                    maxRecordsPerDay: parseInt(e.target.value) || 0,
                  }))
                }
              />

              <div className="p-3 bg-warning-50 dark:bg-warning-900/20 rounded-lg">
                <p className="text-xs text-warning-600 dark:text-warning-400">
                  <strong>{t("logs.modal.warning")}</strong>
                  {t("logs.modal.warningDesc")}
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={onClose}>
              {t("logs.modal.cancel")}
            </Button>
            <Button
              color="primary"
              isLoading={updating}
              onPress={handleUpdateConfig}
            >
              {t("logs.modal.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
