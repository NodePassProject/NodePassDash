import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Skeleton,
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
import {
  faArrowLeft,
  faRotateRight,
  faBug,
  faTrash,
  faWifi,
  faServer,
  faKey,
  faGlobe,
  faDesktop,
  faCode,
  faLock,
  faCertificate,
  faLayerGroup,
  faFileLines,
  faHardDrive,
  faClock,
  faPlus,
  faSync,
  faCopy,
  faPlug,
  faPlugCircleXmark,
  faNetworkWired,
  faCog,
  faQrcode,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { addToast } from "@heroui/toast";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";

import { buildApiUrl, formatUrlWithPrivacy } from "@/lib/utils";
import { OSIcon } from "@/components/ui/os-icon";
import { useSettings } from "@/components/providers/settings-provider";
import SystemStatsCharts from "@/components/ui/system-stats-charts";
import NetworkDebugModal from "@/components/ui/network-debug-modal";

// 主控详情接口定义
interface EndpointDetail {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
  hostname?: string;
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
  const { t } = useTranslation("endpoints");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const endpointId = searchParams.get("id");
  const { settings } = useSettings();

  const [detailLoading, setDetailLoading] = useState(true);
  const [recycleCount, setRecycleCount] = useState<number>(0);
  const [endpointDetail, setEndpointDetail] = useState<EndpointDetail | null>(
    null,
  );
  const [endpointStats, setEndpointStats] = useState<EndpointStats | null>(
    null,
  );
  const [statsLoading, setStatsLoading] = useState(true);
  const [instances, setInstances] = useState<
    Array<{
      instanceId: string;
      commandLine: string;
      type: string;
      status: string;
      alias: string;
    }>
  >([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // 模态框状态管理
  const {
    isOpen: isAddTunnelOpen,
    onOpen: onAddTunnelOpen,
    onOpenChange: onAddTunnelOpenChange,
  } = useDisclosure();
  const {
    isOpen: isEditConfigOpen,
    onOpen: onEditConfigOpen,
    onOpenChange: onEditConfigOpenChange,
  } = useDisclosure();
  const {
    isOpen: isNetworkDebugOpen,
    onOpen: onNetworkDebugOpen,
    onOpenChange: onNetworkDebugOpenChange,
  } = useDisclosure();
  const {
    isOpen: isResetApiKeyOpen,
    onOpen: onResetApiKeyOpen,
    onOpenChange: onResetApiKeyOpenChange,
  } = useDisclosure();
  const {
    isOpen: isDeleteEndpointOpen,
    onOpen: onDeleteEndpointOpen,
    onOpenChange: onDeleteEndpointOpenChange,
  } = useDisclosure();
  const {
    isOpen: isQrCodeOpen,
    onOpen: onQrCodeOpen,
    onOpenChange: onQrCodeOpenChange,
  } = useDisclosure();

  // 表单状态
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelName, setTunnelName] = useState("");
  const [configForm, setConfigForm] = useState({
    name: "", // 主控名称，留空表示不修改
    url: "", // 完整URL（包含API路径），留空表示不修改
    apiKey: "", // API密钥，留空表示不修改
    hostname: "", // 连接IP
  });

  // 二维码状态
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");

  // 获取日志级别的颜色
  const getLogLevelColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "debug":
        return "primary";
      case "info":
        return "success";
      case "warn":
      case "warning":
        return "warning";
      case "error":
        return "danger";
      default:
        return "default";
    }
  };

  // 获取TLS配置说明
  const getTlsDescription = (tls: string) => {
    switch (tls) {
      case "0":
        return t("details.tlsConfig.none");
      case "1":
        return t("details.tlsConfig.selfSigned");
      case "2":
        return t("details.tlsConfig.custom");
      default:
        return tls;
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 格式化流量数据
  const formatTraffic = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 格式化在线时长
  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds || seconds <= 0) return "";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    // 如果大于等于1天，只显示天数
    if (days >= 1) {
      return `${days}${t("details.uptimeUnit.days")}`;
    }

    // 小于1天的情况
    const parts = [];

    if (hours > 0) parts.push(`${hours}${t("details.uptimeUnit.hours")}`);
    if (minutes > 0) parts.push(`${minutes}${t("details.uptimeUnit.minutes")}`);
    if (secs > 0 && parts.length === 0) parts.push(`${secs}${t("details.uptimeUnit.seconds")}`); // 只有在没有小时和分钟时才显示秒数

    return parts.join("") || `0${t("details.uptimeUnit.seconds")}`;
  };

  // 获取实例状态指示器
  const getInstanceStatusIndicator = (status: string) => {
    const statusConfig = {
      running: {
        color: "bg-green-500",
        label: t("details.instanceStatus.running"),
        animate: false,
      },
      stopped: {
        color: "bg-red-500",
        label: t("details.instanceStatus.stopped"),
        animate: false,
      },
      error: {
        color: "bg-red-500",
        label: t("details.instanceStatus.error"),
        animate: true,
      },
      starting: {
        color: "bg-yellow-500",
        label: t("details.instanceStatus.starting"),
        animate: true,
      },
      stopping: {
        color: "bg-orange-500",
        label: t("details.instanceStatus.stopping"),
        animate: true,
      },
      unknown: {
        color: "bg-gray-400",
        label: t("details.instanceStatus.unknown"),
        animate: false,
      },
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown;

    return (
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div
          className={`w-2 h-2 rounded-full ${config.color} ${config.animate ? "animate-pulse" : ""}`}
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
      const res = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/detail`),
      );

      if (!res.ok) throw new Error(t("details.toasts.fetchDetailFailed"));
      const data = await res.json();

      if (data.success && data.endpoint) {
        setEndpointDetail(data.endpoint);
      }
    } catch (err) {
      console.error(err);
      addToast({
        title: t("details.toasts.loadFailed"),
        description: err instanceof Error ? err.message : t("details.toasts.qrCodeFailedDesc"),
        color: "danger",
      });
    } finally {
      setDetailLoading(false);
    }
  }, [endpointId, t]);

  // 获取端点统计信息
  const fetchEndpointStats = useCallback(async () => {
    if (!endpointId) return;

    try {
      setStatsLoading(true);
      const res = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/stats`),
      );

      if (!res.ok) throw new Error(t("details.toasts.fetchStatsFailed"));
      const data = await res.json();

      if (data.success && data.data) {
        setEndpointStats(data.data);
      }
    } catch (err) {
      console.error(t("details.toasts.fetchStatsFailed"), err);
      addToast({
        title: t("details.toasts.fetchStatsFailed"),
        description: err instanceof Error ? err.message : t("details.toasts.qrCodeFailedDesc"),
        color: "warning",
      });
    } finally {
      setStatsLoading(false);
    }
  }, [endpointId, t]);

  // 获取实例列表
  const fetchInstances = useCallback(async () => {
    if (!endpointId) return;
    try {
      setInstancesLoading(true);
      const res = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/instances`),
      );

      if (!res.ok) throw new Error(t("details.toasts.fetchInstancesFailed"));
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        const list = data.data
          .map((item: any) => {
            const cmd = item.commandLine || item.url || "";
            let ty = item.type || item.mode || "";

            if (!ty && typeof cmd === "string") {
              ty = cmd.includes("client://") ? "client" : "server";
            }

            return {
              instanceId: item.id || item.instanceId || "",
              commandLine: cmd,
              type: ty,
              status: item.status || "unknown",
              alias: item.alias || item.name || "",
            };
          })
          .filter(
            (x: any) => x.type && x.instanceId && x.instanceId !== "********",
          );

        setInstances(list);
      } else {
        console.warn("获取实例数据格式错误:", data);
        setInstances([]);
      }
    } catch (e) {
      console.error(e);
      addToast({
        title: t("details.toasts.fetchInstancesFailed"),
        description: e instanceof Error ? e.message : t("details.toasts.qrCodeFailedDesc"),
        color: "danger",
      });
    } finally {
      setInstancesLoading(false);
    }
  }, [endpointId, t]);

  // 使用useCallback优化函数引用，添加正确的依赖项
  const memoizedFetchEndpointDetail = useCallback(fetchEndpointDetail, [
    endpointId,
  ]);
  const memoizedFetchEndpointStats = useCallback(fetchEndpointStats, [
    endpointId,
  ]);
  const memoizedFetchInstances = useCallback(fetchInstances, [endpointId]);

  // 主控操作函数
  const handleConnect = async () => {
    if (!endpointId) return;
    try {
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: Number(endpointId),
          action: "reconnect",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || t("details.toasts.connectFailed"));
      }

      const result = await response.json();

      addToast({
        title: t("details.toasts.connectSuccess"),
        description: result.message || t("details.toasts.connectSuccessDesc"),
        color: "success",
      });

      // 刷新主控详情
      await fetchEndpointDetail();
    } catch (error) {
      addToast({
        title: t("details.toasts.connectFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.connectFailedDesc"),
        color: "danger",
      });
    }
  };

  const handleDisconnect = async () => {
    if (!endpointId) return;
    try {
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: Number(endpointId),
          action: "disconnect",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || t("details.toasts.disconnectFailed"));
      }

      const result = await response.json();

      addToast({
        title: t("details.toasts.disconnectSuccess"),
        description: result.message || t("details.toasts.disconnectSuccessDesc"),
        color: "success",
      });

      // 刷新主控详情
      await fetchEndpointDetail();
    } catch (error) {
      addToast({
        title: t("details.toasts.disconnectFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.disconnectFailedDesc"),
        color: "danger",
      });
    }
  };

  const handleRefreshTunnels = async () => {
    if (!endpointId) return;
    try {
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Number(endpointId),
          action: "refresTunnel",
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t("details.toasts.refreshFailed"));
      }
      addToast({
        title: t("details.toasts.refreshSuccess"),
        description: data.message || t("details.toasts.refreshSuccessDesc"),
        color: "success",
      });
      await fetchInstances();
    } catch (error) {
      addToast({
        title: t("details.toasts.refreshFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.refreshFailedDesc"),
        color: "danger",
      });
    }
  };

  const handleCopyConfig = () => {
    if (!endpointDetail) return;
    const config = `API URL: ${endpointDetail.url}${endpointDetail.apiPath}\nAPI KEY: ${endpointDetail.apiKey}`;

    navigator.clipboard.writeText(config).then(() => {
      addToast({
        title: t("details.toasts.configCopied"),
        description: t("details.toasts.configCopiedDesc"),
        color: "success",
      });
    });
  };

  const handleResetApiKey = async () => {
    if (!endpointId) return;

    try {
      addToast({
        title: t("details.toasts.resetKeyStart"),
        description: t("details.toasts.resetKeyDisconnecting"),
        color: "primary",
      });

      // 1. 先断开连接
      await handleDisconnect();

      // 2. 调用重置密钥接口
      const response = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/reset-key`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || t("details.toasts.resetKeyFailed"));
      }

      const result = await response.json();

      addToast({
        title: t("details.toasts.resetKeySuccess"),
        description: t("details.toasts.resetKeySuccessDesc"),
        color: "success",
      });

      onResetApiKeyOpenChange();

      // 3. 刷新端点详情
      await fetchEndpointDetail();

      // 4. 延迟重新连接
      setTimeout(async () => {
        await handleConnect();
      }, 1500);
    } catch (error) {
      addToast({
        title: t("details.toasts.resetKeyFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.resetKeyFailedDesc"),
        color: "danger",
      });
    }
  };

  const handleDeleteEndpoint = async () => {
    if (!endpointId) return;

    try {
      const response = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}`),
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || t("details.toasts.deleteFailed"));
      }

      addToast({
        title: t("details.toasts.deleteSuccess"),
        description: t("details.toasts.deleteSuccessDesc"),
        color: "success",
      });

      onDeleteEndpointOpenChange();

      // 返回主控列表页
      navigate("/endpoints");
    } catch (error) {
      addToast({
        title: t("details.toasts.deleteFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.deleteFailedDesc"),
        color: "danger",
      });
    }
  };

  // 添加实例
  const handleAddTunnel = () => {
    setTunnelUrl("");
    setTunnelName("");
    onAddTunnelOpen();
  };

  const handleSubmitAddTunnel = async () => {
    if (!endpointId) return;
    if (!tunnelUrl.trim()) {
      addToast({
        title: t("details.toasts.addInstanceUrlRequired"),
        description: t("details.toasts.addInstanceUrlRequiredDesc"),
        color: "warning",
      });

      return;
    }
    try {
      const res = await fetch(buildApiUrl("/api/tunnels/create_by_url"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpointId: Number(endpointId),
          url: tunnelUrl.trim(),
          name: tunnelName.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t("details.toasts.addInstanceFailed"));
      }
      addToast({
        title: t("details.toasts.addInstanceSuccess"),
        description: data.message || t("details.toasts.addInstanceSuccessDesc"),
        color: "success",
      });
      onAddTunnelOpenChange();
      await fetchInstances();
    } catch (err) {
      addToast({
        title: t("details.toasts.addInstanceFailed"),
        description: err instanceof Error ? err.message : t("details.toasts.addInstanceFailedDesc"),
        color: "danger",
      });
    }
  };

  // 从 URL 中提取基础 URL 和 API 前缀的工具函数
  const parseUrl = (fullUrl: string) => {
    // 正则表达式匹配：协议://域名:端口/路径
    const urlRegex = /^(https?:\/\/[^\/]+)(\/.*)?$/;
    const match = fullUrl.match(urlRegex);

    if (match) {
      const baseUrl = match[1]; // 基础URL部分
      const apiPath = match[2] || "/api"; // API路径部分，默认为 /api

      return { baseUrl, apiPath };
    }

    // 如果不匹配，返回原URL和默认API路径
    return { baseUrl: fullUrl, apiPath: "/api" };
  };

  // 修改配置
  const handleEditConfig = () => {
    if (!endpointDetail) return;
    // 合并URL和APIPath为完整URL，预填充现有值
    const fullUrl = endpointDetail.url + endpointDetail.apiPath;

    setConfigForm({
      name: endpointDetail.name,
      url: fullUrl,
      apiKey: "", // API密钥留空，表示不修改
      hostname: endpointDetail.hostname || "", // 连接IP
    });
    onEditConfigOpen();
  };

  const handleSubmitEditConfig = async () => {
    if (!endpointId) return;

    // 验证必填字段
    if (!configForm.name.trim() || !configForm.url.trim()) {
      addToast({
        title: t("details.toasts.editConfigValidation"),
        description: t("details.toasts.editConfigValidationDesc"),
        color: "warning",
      });

      return;
    }

    // 从完整URL中分离出baseUrl和apiPath
    const { baseUrl, apiPath } = parseUrl(configForm.url.trim());

    // 检查是否有变更
    const hasNameChange = configForm.name.trim() !== endpointDetail?.name;
    const hasUrlChange =
      baseUrl !== endpointDetail?.url || apiPath !== endpointDetail?.apiPath;
    const hasApiKeyChange = configForm.apiKey.trim() !== "";

    if (!hasNameChange && !hasUrlChange && !hasApiKeyChange) {
      addToast({
        title: t("details.toasts.editConfigNoChange"),
        description: t("details.toasts.editConfigNoChangeDesc"),
        color: "warning",
      });

      return;
    }

    // 立即关闭模态窗
    onEditConfigOpenChange();

    // 显示开始处理的 toast
    addToast({
      title: t("details.toasts.editConfigStartUpdate"),
      description: t("details.toasts.editConfigStartUpdateDesc"),
      color: "primary",
    });

    // 在后台异步处理更新流程
    (async () => {
      try {
        // 如果有URL或密钥变更，需要先断开连接
        if (hasUrlChange || hasApiKeyChange) {
          addToast({
            title: t("details.toasts.editConfigDisconnecting"),
            description: t("details.toasts.editConfigDisconnectingDesc"),
            color: "primary",
          });

          // 1. 先断开连接
          await handleDisconnect();
        }

        // 构建请求数据
        const updateData: any = {
          id: Number(endpointId),
          action: "updateConfig",
          name: configForm.name.trim(),
          url: configForm.url.trim(),
          hostname: configForm.hostname.trim(), // 传递连接IP
        };

        // 只有当填写了新密钥时才传送
        if (hasApiKeyChange) {
          updateData.apiKey = configForm.apiKey.trim();
        }

        addToast({
          title: t("details.toasts.editConfigUpdating"),
          description: t("details.toasts.editConfigUpdatingDesc"),
          color: "primary",
        });

        const response = await fetch(buildApiUrl("/api/endpoints"), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const errorData = await response.json();

          throw new Error(errorData.error || t("details.toasts.editConfigFailed"));
        }

        addToast({
          title: t("details.toasts.editConfigSuccess"),
          description: t("details.toasts.editConfigSuccessDesc"),
          color: "success",
        });

        // 刷新端点详情
        await fetchEndpointDetail();

        // 如果有URL或密钥变更，延迟重新连接
        if (hasUrlChange || hasApiKeyChange) {
          addToast({
            title: t("details.toasts.editConfigReconnecting"),
            description: t("details.toasts.editConfigReconnectingDesc"),
            color: "primary",
          });

          setTimeout(async () => {
            await handleConnect();
          }, 1500);
        }
      } catch (error) {
        addToast({
          title: t("details.toasts.editConfigFailed"),
          description: error instanceof Error ? error.message : t("details.toasts.editConfigFailedDesc"),
          color: "danger",
        });
      }
    })();
  };

  // 刷新所有数据
  const handleRefreshAll = async () => {
    try {
      // 并行刷新所有数据
      await Promise.all([
        fetchEndpointDetail(),
        fetchEndpointStats(),
        fetchInstances(),
      ]);

      addToast({
        title: t("details.toasts.refreshAllSuccess"),
        description: t("details.toasts.refreshAllSuccessDesc"),
        color: "success",
      });
    } catch (error) {
      addToast({
        title: t("details.toasts.refreshAllFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.refreshAllFailedDesc"),
        color: "danger",
      });
    }
  };

  // 初始化数据加载 - 只在组件挂载时执行一次，使用ref避免重复执行
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      console.log("[Endpoint Detail] 组件初始化，加载数据");
      hasInitializedRef.current = true;
      memoizedFetchEndpointDetail();
      memoizedFetchEndpointStats();
      memoizedFetchInstances();
    }
  }, [
    memoizedFetchEndpointDetail,
    memoizedFetchEndpointStats,
    memoizedFetchInstances,
  ]);

  // LogViewer组件会自动处理滚动

  // 生成二维码
  const generateQRCode = useCallback(async () => {
    if (!endpointDetail) return;

    try {
      // 构建二维码内容：np://master?url=base64(url)&key=base64(key)
      const fullUrl = endpointDetail.url + endpointDetail.apiPath;
      const encodedUrl = btoa(fullUrl);
      const encodedKey = btoa(endpointDetail.apiKey);
      const qrContent = `np://master?url=${encodedUrl}&key=${encodedKey}`;

      // 生成二维码
      const dataUrl = await QRCode.toDataURL(qrContent, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      setQrCodeDataUrl(dataUrl);
      onQrCodeOpen();
    } catch (error) {
      console.error(t("details.toasts.qrCodeFailed"), error);
      addToast({
        title: t("details.toasts.qrCodeFailed"),
        description: error instanceof Error ? error.message : t("details.toasts.qrCodeFailedDesc"),
        color: "danger",
      });
    }
  }, [endpointDetail, onQrCodeOpen, t]);

  return (
    <div className="space-y-6 ">
      {/* 顶部返回按钮和主控信息 */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
        <div className="flex items-center gap-3">
          <Button
            isIconOnly
            className="bg-default-100 hover:bg-default-200"
            variant="flat"
            onClick={() => navigate(-1)}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          {endpointDetail ? (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg md:text-2xl font-bold truncate max-w-[200px] md:max-w-none">
                {endpointDetail.name}
              </h1>
              {endpointDetail.ver && (
                <Chip color="secondary" variant="flat">
                  {endpointDetail.ver}
                </Chip>
              )}
              <Chip
                color={
                  endpointDetail.status === "ONLINE"
                    ? "success"
                    : endpointDetail.status === "FAIL"
                      ? "danger"
                      : endpointDetail.status === "DISCONNECT"
                        ? "default"
                        : "warning"
                }
                variant="flat"
              >
                {endpointDetail.status === "ONLINE"
                  ? t("status.online")
                  : endpointDetail.status === "FAIL"
                    ? t("status.fail")
                    : endpointDetail.status === "DISCONNECT"
                      ? t("status.disconnect")
                      : t("status.offline")}
              </Chip>
            </div>
          ) : (
            <h1 className="text-lg md:text-2xl font-bold truncate">{t("details.pageTitle")}</h1>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
          <Button
            className="hidden md:flex"
            color="default"
            isLoading={detailLoading || statsLoading || instancesLoading}
            startContent={<FontAwesomeIcon icon={faRotateRight} />}
            variant="flat"
            onPress={handleRefreshAll}
          >
            {t("details.refresh")}
          </Button>
          <Button
            isIconOnly
            className="md:hidden"
            color="default"
            isLoading={detailLoading || statsLoading || instancesLoading}
            variant="flat"
            onPress={handleRefreshAll}
          >
            <FontAwesomeIcon icon={faRotateRight} />
          </Button>
          <Button
            className="hidden md:flex"
            color="warning"
            startContent={<FontAwesomeIcon icon={faBug} />}
            variant="flat"
            onPress={() => navigate(`/endpoints/sse-debug?id=${endpointId}`)}
          >
            {t("details.sseDebug.button")}
          </Button>
          <Button
            isIconOnly
            className="md:hidden"
            color="warning"
            variant="flat"
            onPress={() => navigate(`/endpoints/sse-debug?id=${endpointId}`)}
          >
            <FontAwesomeIcon icon={faBug} />
          </Button>
        </div>
      </div>

      {/* 系统监控统计图 - 仅在实验模式下显示 */}
      <SystemStatsCharts
        endpointId={endpointId ? parseInt(endpointId) : null}
        endpointOS={endpointDetail?.os || null}
        endpointVersion={endpointDetail?.ver || null}
      />

      {/* 统计信息卡片 */}
      <Card className="p-2">
        <CardHeader>
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">{t("details.stats.title")}</p>
            <p className="text-sm text-default-500">{t("details.stats.description")}</p>
          </div>
        </CardHeader>
        <CardBody>
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-4 bg-default/10 rounded-lg"
                >
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
              <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border border-primary/20">
                <FontAwesomeIcon
                  className="text-primary text-xl"
                  icon={faLayerGroup}
                />
                <div>
                  <p className="text-xs text-default-600">{t("details.stats.tunnelCount")}</p>
                  <p className="text-xl font-bold text-primary">
                    {endpointStats.tunnelCount}
                  </p>
                  <p className="text-xs text-default-500">{t("details.stats.activeTunnels")}</p>
                </div>
              </div>

              {/* 日志文件数 */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-secondary/20 via-secondary/10 to-secondary/5 border border-secondary/20">
                <FontAwesomeIcon
                  className="text-secondary text-xl"
                  icon={faFileLines}
                />
                <div>
                  <p className="text-xs text-default-600">{t("details.stats.logFileCount")}</p>
                  <p className="text-xl font-bold text-secondary">
                    {endpointStats.fileLogCount}
                  </p>
                  <p className="text-xs text-default-500">{t("details.stats.logFiles")}</p>
                </div>
              </div>

              {/* 日志文件大小 */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-success/20 via-success/10 to-success/5 border border-success/20">
                <FontAwesomeIcon
                  className="text-success text-xl"
                  icon={faHardDrive}
                />
                <div>
                  <p className="text-xs text-default-600">{t("details.stats.logFileSize")}</p>
                  <p className="text-xl font-bold text-success">
                    {formatFileSize(endpointStats.fileLogSize)}
                  </p>
                  <p className="text-xs text-default-500">{t("details.stats.diskUsage")}</p>
                </div>
              </div>

              {/* 总流量 */}
              <div className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-warning/20 via-warning/10 to-warning/5 border border-warning/20">
                <FontAwesomeIcon
                  className="text-warning text-xl"
                  icon={faWifi}
                />
                <div>
                  <p className="text-xs text-default-600">{t("details.stats.totalTraffic")}</p>
                  <p className="text-lg font-bold text-warning">
                    ↑{formatTraffic(endpointStats.totalTrafficOut)}
                  </p>
                  <p className="text-sm font-bold text-danger">
                    ↓{formatTraffic(endpointStats.totalTrafficIn)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">{t("details.stats.noData")}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 主控操作 */}
      {endpointDetail && (
        <Card className="p-2">
          <CardHeader>
            <h3 className="text-lg font-semibold">{t("details.actions.title")}</h3>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              {/* 添加实例 */}
              <Button
                color="primary"
                startContent={<FontAwesomeIcon icon={faPlus} />}
                variant="flat"
                onPress={handleAddTunnel}
              >
                {t("details.actions.addInstance")}
              </Button>

              {/* 同步实例 */}
              <Button
                color="secondary"
                startContent={<FontAwesomeIcon icon={faSync} />}
                variant="flat"
                onPress={handleRefreshTunnels}
              >
                {t("details.actions.syncInstances")}
              </Button>

              {/* 分隔线 */}
              <Divider className="h-8 hidden md:block" orientation="vertical" />

              {/* 网络调试 */}
              <Button
                color="primary"
                isDisabled={endpointDetail.status !== "ONLINE"}
                startContent={<FontAwesomeIcon icon={faNetworkWired} />}
                variant="flat"
                onPress={onNetworkDebugOpen}
              >
                {t("details.actions.networkDebug")}
              </Button>

              {/* 连接/断开按钮 */}
              {endpointDetail.status === "ONLINE" ? (
                <Button
                  color="warning"
                  startContent={<FontAwesomeIcon icon={faPlugCircleXmark} />}
                  variant="flat"
                  onPress={handleDisconnect}
                >
                  {t("details.actions.disconnect")}
                </Button>
              ) : (
                <Button
                  color="success"
                  startContent={<FontAwesomeIcon icon={faPlug} />}
                  variant="flat"
                  onPress={handleConnect}
                >
                  {t("details.actions.connect")}
                </Button>
              )}

              {/* 分隔线 */}
              <Divider className="h-8 hidden md:block" orientation="vertical" />

              {/* 复制配置 */}
              <Button
                color="default"
                startContent={<FontAwesomeIcon icon={faCopy} />}
                variant="flat"
                onPress={handleCopyConfig}
              >
                {t("details.actions.copyConfig")}
              </Button>

              {/* 修改配置 */}
              <Button
                color="primary"
                startContent={<FontAwesomeIcon icon={faCog} />}
                variant="flat"
                onPress={handleEditConfig}
              >
                {t("details.actions.editConfig")}
              </Button>

              {/* 重置密钥 */}
              <Button
                color="success"
                startContent={<FontAwesomeIcon icon={faKey} />}
                variant="flat"
                onPress={onResetApiKeyOpen}
              >
                {t("details.actions.resetKey")}
              </Button>

              {/* 删除主控 */}
              <Button
                color="danger"
                startContent={<FontAwesomeIcon icon={faTrash} />}
                variant="flat"
                onPress={onDeleteEndpointOpen}
              >
                {t("details.actions.delete")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* 主控详情信息 */}
      {endpointDetail && (
        <Card className="p-2">
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{t("details.info.title")}</h3>
              <Button
                isIconOnly
                color="primary"
                size="sm"
                title={t("details.info.qrCodeTitle")}
                variant="flat"
                onPress={generateQRCode}
              >
                <FontAwesomeIcon icon={faQrcode} />
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {/* 详细信息网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 连接信息 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faServer} />
                    <span>{t("details.info.serverAddress")}</span>
                  </div>
                  <p className="text-small font-mono truncate">
                    {formatUrlWithPrivacy(
                      endpointDetail.url,
                      endpointDetail.apiPath,
                      settings.isPrivacyMode,
                    )}
                  </p>
                </div>

                {(endpointDetail.uptime == null ||
                  endpointDetail.uptime == 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faKey} />
                      <span>{t("details.info.apiKey")}</span>
                    </div>
                    <p className="text-small font-mono truncate">
                      ••••••••••••••••••••••••••••••••
                    </p>
                  </div>
                )}

                {/* 系统信息 */}
                {endpointDetail.os && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faDesktop} />
                      <span>{t("details.info.os")}</span>
                    </div>
                    <Chip
                      className="font-mono"
                      color="primary"
                      size="sm"
                      variant="flat"
                    >
                      <div className="flex items-center gap-2">
                        <OSIcon className="w-3 h-3" os={endpointDetail.os} />
                        {endpointDetail.os}
                      </div>
                    </Chip>
                  </div>
                )}

                {endpointDetail.arch && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faCode} />
                      <span>{t("details.info.arch")}</span>
                    </div>
                    <Chip
                      className="font-mono"
                      color="secondary"
                      size="sm"
                      variant="flat"
                    >
                      <div className="flex items-center gap-2">
                        <OSIcon
                          arch={endpointDetail.arch}
                          className="w-3 h-3"
                          type="arch"
                        />
                        {endpointDetail.arch}
                      </div>
                    </Chip>
                  </div>
                )}

                {endpointDetail.log && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faGlobe} />
                      <span>{t("details.info.logLevel")}</span>
                    </div>
                    <Chip
                      className="font-mono"
                      color={getLogLevelColor(endpointDetail.log)}
                      size="sm"
                      variant="flat"
                    >
                      {endpointDetail.log.toUpperCase()}
                    </Chip>
                  </div>
                )}

                {endpointDetail.tls && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faLock} />
                      <span>{t("details.info.tlsConfig")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip
                        color={
                          endpointDetail.tls === "0" ? "default" : "success"
                        }
                        size="sm"
                        variant="flat"
                      >
                        {getTlsDescription(endpointDetail.tls)}
                      </Chip>
                    </div>
                  </div>
                )}

                {/* 在线时长 */}
                {endpointDetail.uptime != null && endpointDetail.uptime > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faClock} />
                      <span>{t("details.info.uptime")}</span>
                    </div>
                    <Chip
                      className="font-mono"
                      color="success"
                      size="sm"
                      variant="flat"
                    >
                      {formatUptime(endpointDetail.uptime)}
                    </Chip>
                  </div>
                )}

                {/* 证书配置 - 仅当TLS=2时显示 */}
                {endpointDetail.tls === "2" && endpointDetail.crt && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faCertificate} />
                      <span>{t("details.info.certPath")}</span>
                    </div>
                    <p className="text-small font-mono truncate">
                      {endpointDetail.crt}
                    </p>
                  </div>
                )}

                {endpointDetail.tls === "2" && endpointDetail.keyPath && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faKey} />
                      <span>{t("details.info.keyPath")}</span>
                    </div>
                    <p className="text-small font-mono truncate">
                      {endpointDetail.keyPath}
                    </p>
                  </div>
                )}
              </div>

              {/* 时间信息 */}
              <Divider />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-small text-default-500">
                <div>
                  <span className="font-medium">{t("details.info.createdAt")}</span>
                  {new Date(endpointDetail.createdAt).toLocaleString("zh-CN")}
                </div>
                <div>
                  <span className="font-medium">{t("details.info.updatedAt")}</span>
                  {new Date(endpointDetail.updatedAt).toLocaleString("zh-CN")}
                </div>
                <div>
                  <span className="font-medium">{t("details.info.lastCheck")}</span>
                  {new Date(endpointDetail.lastCheck).toLocaleString("zh-CN")}
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
            <h3 className="text-lg font-semibold">{t("details.instances.title")}</h3>
            {/* <span className="text-sm text-default-500">({instances.length} 个实例)</span> */}
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
            {/* <Button size="sm" color="primary" variant="flat" onPress={() => setExtractOpen(true)}>提取</Button>
            <Button size="sm" color="secondary" variant="flat" onPress={() => setImportOpen(true)}>导入</Button> */}
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
              <p className="text-default-500 text-sm">{t("details.instances.noData")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[324px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {instances.map((ins) => (
                <Card
                  key={ins.instanceId}
                  className={`h-[100px] shadow-none border-1 transition-all relative ${
                    ins.type === "server"
                      ? "bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700"
                      : "bg-secondary-50 border-secondary-200"
                  }`}
                >
                  {/* 状态指示器 */}
                  {getInstanceStatusIndicator(ins.status)}

                  <CardBody className="p-3 flex flex-col h-full relative">
                    {/* 顶部区域：左上角图标 + 右侧文字 */}
                    <div className="flex items-start gap-2 flex-1">
                      {/* 实例类型图标 */}
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          ins.type === "server"
                            ? "bg-primary-100 text-primary dark:bg-primary-600/20"
                            : "bg-secondary-100 text-secondary"
                        }`}
                      >
                        <FontAwesomeIcon
                          className="text-xs"
                          icon={ins.type === "server" ? faServer : faDesktop}
                        />
                      </div>

                      {/* 右侧文字区域 */}
                      <div className="flex-1 min-w-0">
                        {/* 第一行：alias */}
                        <p
                          className="text-xs font-medium truncate"
                          title={ins.alias || ins.instanceId}
                        >
                          {ins.alias || t("details.instances.unnamed")}
                        </p>
                        {/* 第二行：实例ID */}
                        <p
                          className="text-xs text-default-500 truncate mt-0.5"
                          title={ins.instanceId}
                        >
                          {ins.instanceId}
                        </p>
                      </div>
                    </div>

                    {/* 左下角类型标签 */}
                    <div className="absolute bottom-2 left-2">
                      <Chip
                        className="text-xs h-4 px-2"
                        color={ins.type === "server" ? "primary" : "secondary"}
                        size="sm"
                        variant="flat"
                      >
                        {ins.type === "server" ? t("details.instances.server") : t("details.instances.client")}
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
      <Modal
        isOpen={extractOpen}
        size="lg"
        onClose={() => setExtractOpen(false)}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t("details.modals.extractInstances.title")}</ModalHeader>
              <ModalBody>
                <Textarea
                  readOnly
                  minRows={10}
                  value={instances.map((i) => i.commandLine).join("\n")}
                />
              </ModalBody>
              <ModalFooter>
                <Button
                  color="primary"
                  onPress={() => {
                    navigator.clipboard.writeText(
                      instances.map((i) => i.commandLine).join("\n"),
                    );
                    addToast({ title: t("details.modals.extractInstances.copied"), color: "success" });
                  }}
                >
                  {t("details.modals.extractInstances.copyAll")}
                </Button>
                <Button onPress={() => setExtractOpen(false)}>{t("details.modals.extractInstances.close")}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 添加实例模态框 */}
      <Modal
        isOpen={isAddTunnelOpen}
        placement="center"
        onOpenChange={onAddTunnelOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("details.modals.addInstance.title")}</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Input
                    label={t("details.modals.addInstance.nameLabel")}
                    placeholder={t("details.modals.addInstance.namePlaceholder")}
                    value={tunnelName}
                    onValueChange={setTunnelName}
                  />
                  <Input
                    isRequired
                    label={t("details.modals.addInstance.urlLabel")}
                    placeholder={t("details.modals.addInstance.urlPlaceholder")}
                    value={tunnelUrl}
                    onValueChange={setTunnelUrl}
                  />
                  <p className="text-tiny text-default-500">
                    {t("details.modals.addInstance.formatHint")}
                  </p>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("details.modals.addInstance.cancel")}
                </Button>
                <Button color="primary" onPress={handleSubmitAddTunnel}>
                  {t("details.modals.addInstance.add")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 修改配置模态框 */}
      <Modal
        isOpen={isEditConfigOpen}
        placement="center"
        size="lg"
        onOpenChange={onEditConfigOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("details.modals.editConfig.title")}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-sm text-warning-600">
                    {t("details.modals.editConfig.warning")}
                  </p>

                  <Input
                    isRequired
                    endContent={
                      <span className="text-xs text-default-500">
                        {configForm.name.length}/25
                      </span>
                    }
                    label={t("details.modals.editConfig.nameLabel")}
                    maxLength={25}
                    placeholder={t("details.modals.editConfig.namePlaceholder")}
                    value={configForm.name}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, name: value }))
                    }
                  />

                  <Input
                    isRequired
                    label={t("details.modals.editConfig.urlLabel")}
                    placeholder={t("details.modals.editConfig.urlPlaceholder")}
                    type="url"
                    value={configForm.url}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, url: value }))
                    }
                  />

                  <Input
                    description={t("details.modals.editConfig.apiKeyDescription")}
                    label={t("details.modals.editConfig.apiKeyLabel")}
                    placeholder={t("details.modals.editConfig.apiKeyPlaceholder")}
                    type="password"
                    value={configForm.apiKey}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, apiKey: value }))
                    }
                  />

                  <Input
                    description={t("details.modals.editConfig.hostnameDescription")}
                    label={t("details.modals.editConfig.hostnameLabel")}
                    placeholder={t("details.modals.editConfig.hostnamePlaceholder")}
                    value={configForm.hostname}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, hostname: value }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("details.modals.editConfig.cancel")}
                </Button>
                <Button color="warning" onPress={handleSubmitEditConfig}>
                  {t("details.modals.editConfig.confirm")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 导入模态框 */}
      <Modal isOpen={importOpen} size="lg" onClose={() => setImportOpen(false)}>
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t("details.modals.importUrl.title")}</ModalHeader>
              <ModalBody>
                <Textarea
                  minRows={10}
                  placeholder={t("details.modals.importUrl.placeholder")}
                />
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" onPress={() => setImportOpen(false)}>
                  {t("details.modals.importUrl.confirm")}
                </Button>
                <Button onPress={() => setImportOpen(false)}>{t("details.modals.importUrl.cancel")}</Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 网络调试模态框 */}
      {endpointId && (
        <NetworkDebugModal
          endpointId={parseInt(endpointId)}
          isOpen={isNetworkDebugOpen}
          onOpenChange={onNetworkDebugOpenChange}
        />
      )}

      {/* 重置密钥确认模态框 */}
      <Modal
        isOpen={isResetApiKeyOpen}
        placement="center"
        onOpenChange={onResetApiKeyOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <FontAwesomeIcon className="text-warning" icon={faKey} />
                <span>{t("details.modals.resetApiKey.title")}</span>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon
                        className="text-warning text-lg mt-0.5"
                        icon={faKey}
                      />
                      <div>
                        <h4 className="font-semibold text-warning-800 mb-1">
                          {t("details.modals.resetApiKey.warningTitle")}
                        </h4>
                        <p className="text-sm text-warning-700">
                          {t("details.modals.resetApiKey.warningMessage")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-default-600">
                    {t("details.modals.resetApiKey.confirmMessage")}
                  </p>
                  <ul className="text-sm text-default-600 list-disc list-inside space-y-1 ml-4">
                    <li>{t("details.modals.resetApiKey.consequences.newKey")}</li>
                    <li>{t("details.modals.resetApiKey.consequences.disconnect")}</li>
                    <li>{t("details.modals.resetApiKey.consequences.reconnect")}</li>
                  </ul>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("details.modals.resetApiKey.cancel")}
                </Button>
                <Button color="warning" onPress={handleResetApiKey}>
                  {t("details.modals.resetApiKey.confirm")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 删除主控确认模态框 */}
      <Modal
        isOpen={isDeleteEndpointOpen}
        placement="center"
        onOpenChange={onDeleteEndpointOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <FontAwesomeIcon className="text-danger" icon={faTrash} />
                <span>{t("details.modals.deleteEndpoint.title")}</span>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <FontAwesomeIcon
                        className="text-danger text-lg mt-0.5"
                        icon={faTrash}
                      />
                      <div>
                        <h4 className="font-semibold text-danger-800 mb-1">
                          {t("details.modals.deleteEndpoint.warningTitle")}
                        </h4>
                        <p className="text-sm text-danger-700">
                          {t("details.modals.deleteEndpoint.warningMessage")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-default-600">
                    {t("details.modals.deleteEndpoint.confirmMessage")}{" "}
                    <strong>{endpointDetail?.name}</strong>{" "}
                    {t("details.modals.deleteEndpoint.confirmMessageEnd")}
                  </p>
                  <ul className="text-sm text-default-600 list-disc list-inside space-y-1 ml-4">
                    <li>{t("details.modals.deleteEndpoint.consequences.deleteConfig")}</li>
                    <li>{t("details.modals.deleteEndpoint.consequences.deleteInstances")}</li>
                    <li>{t("details.modals.deleteEndpoint.consequences.clearHistory")}</li>
                    <li>{t("details.modals.deleteEndpoint.consequences.irreversible")}</li>
                  </ul>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("details.modals.deleteEndpoint.cancel")}
                </Button>
                <Button color="danger" onPress={handleDeleteEndpoint}>
                  {t("details.modals.deleteEndpoint.confirm")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 二维码模态框 */}
      <Modal
        isOpen={isQrCodeOpen}
        placement="center"
        size="lg"
        onOpenChange={onQrCodeOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faQrcode} />
                <span>{t("details.modals.qrCode.title")}</span>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col items-center space-y-6 pb-4">
                  {qrCodeDataUrl ? (
                    <>
                      <div className="p-4 bg-white rounded-lg border">
                        <img
                          alt={t("details.modals.qrCode.title")}
                          className="w-64 h-64"
                          src={qrCodeDataUrl}
                        />
                      </div>
                      <p className="text-sm text-default-500 text-center">
                        {t("details.modals.qrCode.description")}
                      </p>

                      {/* 应用下载链接 */}
                      <div className="w-full">
                        <p className="text-sm font-medium text-default-700 mb-3 text-center">
                          {t("details.modals.qrCode.downloadApp")}
                        </p>
                        <div className="flex items-center justify-center gap-4">
                          {/* iOS 应用 */}
                          <a
                            className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                            href="https://apps.apple.com/us/app/nodepass/id6747930492"
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <Icon
                              className="w-5 h-5 text-white"
                              icon="simple-icons:apple"
                            />
                            <span className="text-sm font-medium">
                              {t("details.modals.qrCode.iosVersion")}
                            </span>
                          </a>

                          {/* Android 应用 */}
                          <button
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
                            onClick={() => {
                              addToast({
                                title: t("details.modals.qrCode.androidInDevelopment"),
                                description: t("details.modals.qrCode.androidDescription"),
                                color: "warning",
                              });
                            }}
                          >
                            <Icon
                              className="w-5 h-5 text-white"
                              icon="simple-icons:android"
                            />
                            <span className="text-sm font-medium">
                              {t("details.modals.qrCode.androidVersion")}
                            </span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <Skeleton className="w-64 h-64 rounded-lg" />
                    </div>
                  )}
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
