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
  faCalendar,
  faPlus,
  faSync,
  faCheckCircle,
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
        return "无TLS";
      case "1":
        return "自签名证书";
      case "2":
        return "自定义证书";
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
      return `${days}天`;
    }

    // 小于1天的情况
    const parts = [];

    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && parts.length === 0) parts.push(`${secs}s`); // 只有在没有小时和分钟时才显示秒数

    return parts.join("") || "0s";
  };

  // 获取实例状态指示器
  const getInstanceStatusIndicator = (status: string) => {
    const statusConfig = {
      running: {
        color: "bg-green-500",
        label: "运行中",
        animate: false,
      },
      stopped: {
        color: "bg-red-500",
        label: "已停止",
        animate: false,
      },
      error: {
        color: "bg-red-500",
        label: "错误",
        animate: true,
      },
      starting: {
        color: "bg-yellow-500",
        label: "启动中",
        animate: true,
      },
      stopping: {
        color: "bg-orange-500",
        label: "停止中",
        animate: true,
      },
      unknown: {
        color: "bg-gray-400",
        label: "未知",
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
        color: "danger",
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
      const res = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/stats`),
      );

      if (!res.ok) throw new Error("获取统计信息失败");
      const data = await res.json();

      if (data.success && data.data) {
        setEndpointStats(data.data);
      }
    } catch (err) {
      console.error("获取统计信息失败:", err);
      addToast({
        title: "获取统计信息失败",
        description: err instanceof Error ? err.message : "未知错误",
        color: "warning",
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
      const res = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/instances`),
      );

      if (!res.ok) throw new Error("获取实例列表失败");
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
        title: "获取实例失败",
        description: e instanceof Error ? e.message : "未知错误",
        color: "danger",
      });
    } finally {
      setInstancesLoading(false);
    }
  }, [endpointId]);

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

        throw new Error(errorData.error || "连接失败");
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

        throw new Error(errorData.error || "断开连接失败");
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
        throw new Error(data.error || "刷新失败");
      }
      addToast({
        title: "刷新成功",
        description: data.message || "隧道信息已刷新",
        color: "success",
      });
      await fetchInstances();
    } catch (error) {
      addToast({
        title: "刷新失败",
        description: error instanceof Error ? error.message : "刷新请求失败",
        color: "danger",
      });
    }
  };

  const handleCopyConfig = () => {
    if (!endpointDetail) return;
    const config = `API URL: ${endpointDetail.url}${endpointDetail.apiPath}\nAPI KEY: ${endpointDetail.apiKey}`;

    navigator.clipboard.writeText(config).then(() => {
      addToast({
        title: "已复制",
        description: "配置信息已复制到剪贴板",
        color: "success",
      });
    });
  };

  const handleResetApiKey = async () => {
    if (!endpointId) return;

    try {
      addToast({
        title: "开始重置密钥",
        description: "正在断开当前连接...",
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

        throw new Error(errorData.error || "重置密钥失败");
      }

      const result = await response.json();

      addToast({
        title: "密钥重置成功",
        description: "新密钥已生成，正在重新连接...",
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
        title: "密钥重置失败",
        description: error instanceof Error ? error.message : "重置失败",
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

        throw new Error(error.message || "删除失败");
      }

      addToast({
        title: "删除成功",
        description: "主控已删除",
        color: "success",
      });

      onDeleteEndpointOpenChange();

      // 返回主控列表页
      navigate("/endpoints");
    } catch (error) {
      addToast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "删除失败",
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
        title: "请输入 URL",
        description: "隧道 URL 不能为空",
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
        throw new Error(data.error || "创建隧道失败");
      }
      addToast({
        title: "创建成功",
        description: data.message || "隧道已创建",
        color: "success",
      });
      onAddTunnelOpenChange();
      await fetchInstances();
    } catch (err) {
      addToast({
        title: "创建失败",
        description: err instanceof Error ? err.message : "无法创建隧道",
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
    });
    onEditConfigOpen();
  };

  const handleSubmitEditConfig = async () => {
    if (!endpointId) return;

    // 验证必填字段
    if (!configForm.name.trim() || !configForm.url.trim()) {
      addToast({
        title: "请填写完整信息",
        description: "名称和URL地址不能为空",
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
        title: "没有变更",
        description: "未检测到任何配置变更",
        color: "warning",
      });

      return;
    }

    // 立即关闭模态窗
    onEditConfigOpenChange();

    // 显示开始处理的 toast
    addToast({
      title: "开始更新配置",
      description: "正在处理配置更新...",
      color: "primary",
    });

    // 在后台异步处理更新流程
    (async () => {
      try {
        // 如果有URL或密钥变更，需要先断开连接
        if (hasUrlChange || hasApiKeyChange) {
          addToast({
            title: "断开连接中",
            description: "正在断开当前连接...",
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
        };

        // 只有当填写了新密钥时才传送
        if (hasApiKeyChange) {
          updateData.apiKey = configForm.apiKey.trim();
        }

        addToast({
          title: "更新配置中",
          description: "正在提交配置更新...",
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

          throw new Error(errorData.error || "配置更新失败");
        }

        addToast({
          title: "配置更新成功",
          description: "配置已更新，正在刷新数据...",
          color: "success",
        });

        // 刷新端点详情
        await fetchEndpointDetail();

        // 如果有URL或密钥变更，延迟重新连接
        if (hasUrlChange || hasApiKeyChange) {
          addToast({
            title: "重新连接中",
            description: "正在尝试重新连接...",
            color: "primary",
          });

          setTimeout(async () => {
            await handleConnect();
          }, 1500);
        }
      } catch (error) {
        addToast({
          title: "配置更新失败",
          description: error instanceof Error ? error.message : "更新失败",
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
        title: "刷新成功",
        description: "所有数据已刷新",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "刷新失败",
        description: error instanceof Error ? error.message : "刷新失败",
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
      console.error("生成二维码失败:", error);
      addToast({
        title: "生成二维码失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  }, [endpointDetail, onQrCodeOpen]);

  return (
    <div className="space-y-4 p-4 md:p-6">
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
                startContent={
                  <div
                    className={`ml-2 w-2 h-2 rounded-full ${endpointDetail.status === "ONLINE"
                        ? "bg-green-500 animate-pulse"
                        : endpointDetail.status === "FAIL"
                          ? "bg-red-500"
                          : endpointDetail.status === "DISCONNECT"
                            ? "bg-gray-400"
                            : "bg-yellow-500"
                      }`}
                  />
                }
              >
                {endpointDetail.status === "ONLINE"
                  ? "在线"
                  : endpointDetail.status === "FAIL"
                    ? "异常"
                    : endpointDetail.status === "DISCONNECT"
                      ? "断开"
                      : "离线"}
              </Chip>
            </div>
          ) : (
            <h1 className="text-lg md:text-2xl font-bold truncate">主控详情</h1>
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
            刷新
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
            SSE调试
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

      {/* 系统监控统计图 */}
      <SystemStatsCharts
        endpointId={endpointId ? parseInt(endpointId) : null}
        endpointOS={endpointDetail?.os || null}
        endpointVersion={endpointDetail?.ver || null}
      />

      {/* 主布局：左侧主内容 + 右侧信息面板 */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* 左侧主内容区域 */}
        <div className="xl:col-span-3 space-y-2">
          {/* 统计信息标题 */}
          <div>
            <h3 className="text-base font-semibold mt-4">主控统计</h3>
          </div>

          {/* 统计信息卡片 - 无外层Card */}
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Card key={index} className="p-4">
                  <CardBody className="p-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <Skeleton className="h-3 w-16 mb-1" />
                        <Skeleton className="h-6 w-12 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="w-12 h-12 rounded-lg" />
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : endpointStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 实例总数量 */}
              <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <CardBody className="p-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-default-600 mb-1">实例总数量</p>
                      <p className="text-2xl font-bold text-primary mb-1">
                        {endpointStats.tunnelCount}
                      </p>
                      <p className="text-xs text-default-500">活跃实例</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                      <FontAwesomeIcon
                        className="text-primary text-xl"
                        icon={faLayerGroup}
                      />
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* 日志文件数 */}
              <Card className="p-4 bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20">
                <CardBody className="p-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-default-600 mb-1">日志文件数</p>
                      <p className="text-2xl font-bold text-secondary mb-1">
                        {endpointStats.fileLogCount}
                      </p>
                      <p className="text-xs text-default-500">日志文件</p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center">
                      <FontAwesomeIcon
                        className="text-secondary text-xl"
                        icon={faFileLines}
                      />
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* 总流量 */}
              <Card className="p-4 bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
                <CardBody className="p-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-default-600 mb-1">总流量</p>
                      <p className="text-lg font-bold text-success mb-0.5">
                        ↑{formatTraffic(endpointStats.totalTrafficOut)}
                      </p>
                      <p className="text-sm font-bold text-danger">
                        ↓{formatTraffic(endpointStats.totalTrafficIn)}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-success/20 flex items-center justify-center">
                      <FontAwesomeIcon
                        className="text-success text-xl"
                        icon={faWifi}
                      />
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-default-500">无法获取统计数据</p>
            </div>
          )}

          {/* 主控操作 */}
          {endpointDetail && (
            <>
              <div>
                <h3 className="text-base font-semibold mt-4">主控操作</h3>
              </div>
              <Card className="p-3 bg-gradient-to-br from-default/50 to-default/50">
                <CardBody className="p-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 添加实例 */}
                    <Button
                      size="sm"
                      color="primary"
                      startContent={<FontAwesomeIcon icon={faPlus} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={handleAddTunnel}
                    >
                      添加实例
                    </Button>

                    {/* 同步实例 */}
                    <Button
                      size="sm"
                      color="secondary"
                      startContent={<FontAwesomeIcon icon={faSync} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={handleRefreshTunnels}
                    >
                      同步实例
                    </Button>

                    {/* 网络调试 */}
                    <Button
                      size="sm"
                      color="primary"
                      isDisabled={endpointDetail.status !== "ONLINE"}
                      startContent={<FontAwesomeIcon icon={faNetworkWired} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={onNetworkDebugOpen}
                    >
                      网络调试
                    </Button>

                    {/* 连接/断开按钮 */}
                    {endpointDetail.status === "ONLINE" ? (
                      <Button
                        size="sm"
                        color="warning"
                        startContent={<FontAwesomeIcon icon={faPlugCircleXmark} className="hidden sm:inline" />}
                        variant="flat"
                        onPress={handleDisconnect}
                      >
                        断开连接
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        color="success"
                        startContent={<FontAwesomeIcon icon={faPlug} className="hidden sm:inline" />}
                        variant="flat"
                        onPress={handleConnect}
                      >
                        连接主控
                      </Button>
                    )}

                    {/* 复制配置 */}
                    <Button
                      size="sm"
                      color="default"
                      startContent={<FontAwesomeIcon icon={faCopy} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={handleCopyConfig}
                    >
                      复制配置
                    </Button>

                    {/* 修改配置 */}
                    <Button
                      size="sm"
                      color="primary"
                      startContent={<FontAwesomeIcon icon={faCog} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={handleEditConfig}
                    >
                      修改配置
                    </Button>

                    {/* 重置密钥 */}
                    <Button
                      size="sm"
                      color="success"
                      startContent={<FontAwesomeIcon icon={faKey} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={onResetApiKeyOpen}
                    >
                      重置密钥
                    </Button>

                    {/* 删除主控 */}
                    <Button
                      size="sm"
                      color="danger"
                      startContent={<FontAwesomeIcon icon={faTrash} className="hidden sm:inline" />}
                      variant="flat"
                      onPress={onDeleteEndpointOpen}
                    >
                      删除主控
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </>
          )}

          {/* 实例列表 */}
          <div>
            <h3 className="text-base font-semibold  mt-4">主控实例</h3>
          </div>

          {instancesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Card key={index} className="h-[100px]">
                  <CardBody className="p-3 flex flex-col">
                    <Skeleton className="h-3 w-16 mb-1" />
                    <Skeleton className="h-3 w-24 mb-1" />
                    <Skeleton className="h-5 w-12" />
                  </CardBody>
                </Card>
              ))}
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-default-500 text-sm">暂无实例数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {instances.map((ins) => {
                const statusConfig = {
                  running: { label: "运行中", color: "success" },
                  stopped: { label: "已停止", color: "danger" },
                  error: { label: "错误", color: "danger" },
                  starting: { label: "启动中", color: "warning" },
                  stopping: { label: "停止中", color: "warning" },
                  unknown: { label: "未知", color: "default" },
                };
                const status = statusConfig[ins.status as keyof typeof statusConfig] || statusConfig.unknown;

                return (
                  <Card
                    key={ins.instanceId}
                    className={`h-[100px] shadow-none relative overflow-hidden ${
                      ins.type === "server"
                        ? "bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20"
                        : "bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20"
                    }`}
                  >
                    <CardBody className="p-3 flex flex-col h-full relative">
                      {/* 第一行：状态点 + 名称 + 状态chip（同一行对齐） */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${ins.status === "running"
                                ? "bg-green-500"
                                : ins.status === "stopped"
                                  ? "bg-red-500"
                                  : ins.status === "error"
                                    ? "bg-red-500 animate-pulse"
                                    : ins.status === "starting" || ins.status === "stopping"
                                      ? "bg-yellow-500 animate-pulse"
                                      : "bg-gray-400"
                              }`}
                          />
                          <p
                            className="text-sm font-semibold truncate"
                            title={ins.alias || ins.instanceId}
                          >
                            {ins.alias || "未命名"}
                          </p>
                        </div>
                        <Chip
                          className="text-xs h-5 flex-shrink-0"
                          color={status.color as any}
                          size="sm"
                          variant="flat"
                        >
                          {status.label}
                        </Chip>
                      </div>

                      {/* 实例ID */}
                      <p
                        className="text-xs text-default-500 truncate mb-1"
                        title={ins.instanceId}
                      >
                        {ins.instanceId}
                      </p>

                      {/* 类型标签 */}
                      <Chip
                        className="text-xs h-5 w-fit"
                        color={ins.type === "server" ? "primary" : "secondary"}
                        size="sm"
                        variant="flat"
                      >
                        {ins.type === "server" ? "服务端" : "客户端"}
                      </Chip>

                      {/* 右下角：图标 */}
                      <div className="absolute bottom-3 right-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${ins.type === "server"
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary/10 text-secondary"
                            }`}
                        >
                          <FontAwesomeIcon
                            className="text-base"
                            icon={ins.type === "server" ? faServer : faDesktop}
                          />
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧主控信息面板 */}
        {endpointDetail && (
          <Card className="p-4 xl:sticky xl:top-6 xl:h-fit xl:col-span-1 bg-gradient-to-br from-default/50 to-default/10">
            <CardHeader className="flex items-center justify-between p-0 pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">主控信息</h3>
                <FontAwesomeIcon
                  icon={faQrcode}
                  className="text-primary cursor-pointer hover:text-primary-600 transition-colors"
                  title="显示二维码"
                  onClick={generateQRCode}
                />
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="space-y-3">
                {/* 服务地址 - 垂直布局 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faGlobe} />
                    <span>服务地址</span>
                  </div>
                  <p className="text-small font-mono truncate">
                    {formatUrlWithPrivacy(
                      endpointDetail.url,
                      endpointDetail.apiPath,
                      settings.isPrivacyMode,
                    )}
                  </p>
                </div>

                {(endpointDetail.uptime == null || endpointDetail.uptime == 0) && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faKey} />
                      <span>API Key</span>
                    </div>
                    <p className="text-small font-mono">••••••••</p>
                  </div>
                )}

                {/* 系统信息 - 左右布局 */}
                {endpointDetail.os && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faDesktop} />
                      <span>操作系统</span>
                    </div>
                    <Chip className="font-mono" color="primary" size="sm" variant="flat">
                      <div className="flex items-center gap-2">
                        <OSIcon className="w-3 h-3" os={endpointDetail.os} />
                        {endpointDetail.os}
                      </div>
                    </Chip>
                  </div>
                )}

                {endpointDetail.arch && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faCode} />
                      <span>架构</span>
                    </div>
                    <Chip className="font-mono" color="secondary" size="sm" variant="flat">
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faFileLines} />
                      <span>日志级别</span>
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faLock} />
                      <span>TLS配置</span>
                    </div>
                    <Chip
                      color={endpointDetail.tls === "0" ? "default" : "success"}
                      size="sm"
                      variant="flat"
                    >
                      {getTlsDescription(endpointDetail.tls)}
                    </Chip>
                  </div>
                )}

                {/* 在线时长 */}
                {endpointDetail.uptime != null && endpointDetail.uptime > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faClock} />
                      <span>在线时长</span>
                    </div>
                    <Chip className="font-mono" color="success" size="sm" variant="flat">
                      {formatUptime(endpointDetail.uptime)}
                    </Chip>
                  </div>
                )}

                {/* 证书配置 - 仅当TLS=2时显示 */}
                {endpointDetail.tls === "2" && endpointDetail.crt && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faCertificate} />
                      <span>证书路径</span>
                    </div>
                    <p className="text-small font-mono truncate">{endpointDetail.crt}</p>
                  </div>
                )}

                {endpointDetail.tls === "2" && endpointDetail.keyPath && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-small text-default-500">
                      <FontAwesomeIcon icon={faKey} />
                      <span>密钥路径</span>
                    </div>
                    <p className="text-small font-mono truncate">{endpointDetail.keyPath}</p>
                  </div>
                )}

                {/* 时间信息 - 左右布局 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faCalendar} />
                    <span>创建时间</span>
                  </div>
                  <span className="text-xs text-default-600">
                    {new Date(endpointDetail.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faSync} />
                    <span>更新时间</span>
                  </div>
                  <span className="text-xs text-default-600">
                    {new Date(endpointDetail.updatedAt).toLocaleString("zh-CN")}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-small text-default-500">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    <span>最后检查</span>
                  </div>
                  <span className="text-xs text-default-600">
                    {new Date(endpointDetail.lastCheck).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* 提取模态框 */}
      <Modal
        isOpen={extractOpen}
        size="lg"
        onClose={() => setExtractOpen(false)}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>实例URL提取</ModalHeader>
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
                    addToast({ title: "已复制", color: "success" });
                  }}
                >
                  复制全部
                </Button>
                <Button onPress={() => setExtractOpen(false)}>关闭</Button>
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
                    isRequired
                    label="隧道URL"
                    placeholder="例如：server://0.0.0.0:8080/127.0.0.1:3000"
                    value={tunnelUrl}
                    onValueChange={setTunnelUrl}
                  />
                  <p className="text-tiny text-default-500">
                    格式：server://bind_addr:bind_port/target_host:target_port
                    或 client://server_host:server_port/local_host:local_port
                  </p>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="primary" onPress={handleSubmitAddTunnel}>
                  添加
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
              <ModalHeader>修改主控配置</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-sm text-warning-600">
                    ⚠️ 修改URL地址或密钥将会断开当前连接并使用新配置重新连接
                  </p>

                  <Input
                    isRequired
                    endContent={
                      <span className="text-xs text-default-500">
                        {configForm.name.length}/25
                      </span>
                    }
                    label="主控名称"
                    maxLength={25}
                    placeholder="请输入主控名称"
                    value={configForm.name}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, name: value }))
                    }
                  />

                  <Input
                    isRequired
                    label="URL 地址"
                    placeholder="http(s)://example.com:9090/api/v1"
                    type="url"
                    value={configForm.url}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, url: value }))
                    }
                  />

                  <Input
                    description="留空表示不修改密钥"
                    label="API密钥"
                    placeholder="留空表示不修改密钥"
                    type="password"
                    value={configForm.apiKey}
                    onValueChange={(value) =>
                      setConfigForm((prev) => ({ ...prev, apiKey: value }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="warning" onPress={handleSubmitEditConfig}>
                  确定修改
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
              <ModalHeader>导入URL</ModalHeader>
              <ModalBody>
                <Textarea
                  minRows={10}
                  placeholder="在此粘贴 URL，每行一个..."
                />
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" onPress={() => setImportOpen(false)}>
                  确定
                </Button>
                <Button onPress={() => setImportOpen(false)}>取消</Button>
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
                <span>重置API密钥</span>
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
                          ⚠️ 重要提醒
                        </h4>
                        <p className="text-sm text-warning-700">
                          重置API密钥后，当前连接将断开，需要使用新密钥重新连接主控。
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-default-600">
                    您确定要重置此主控的API密钥吗？此操作将：
                  </p>
                  <ul className="text-sm text-default-600 list-disc list-inside space-y-1 ml-4">
                    <li>生成新的API密钥</li>
                    <li>断开当前连接</li>
                    <li>需要使用新密钥重新连接</li>
                  </ul>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="warning" onPress={handleResetApiKey}>
                  确认重置
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
                <span>删除主控</span>
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
                          ⚠️ 危险操作
                        </h4>
                        <p className="text-sm text-danger-700">
                          删除主控后，所有相关的实例和配置信息将永久丢失，无法恢复。
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-default-600">
                    您确定要删除主控 <strong>{endpointDetail?.name}</strong>{" "}
                    吗？此操作将：
                  </p>
                  <ul className="text-sm text-default-600 list-disc list-inside space-y-1 ml-4">
                    <li>永久删除主控配置</li>
                    <li>删除所有关联的实例</li>
                    <li>清除所有历史数据</li>
                    <li>此操作不可撤销</li>
                  </ul>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="danger" onPress={handleDeleteEndpoint}>
                  确认删除
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
                <span>主控配置二维码</span>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col items-center space-y-6 pb-4">
                  {qrCodeDataUrl ? (
                    <>
                      <div className="p-4 bg-white rounded-lg border">
                        <img
                          alt="主控配置二维码"
                          className="w-64 h-64"
                          src={qrCodeDataUrl}
                        />
                      </div>
                      <p className="text-sm text-default-500 text-center">
                        扫描此二维码可快速配置主控连接
                      </p>

                      {/* 应用下载链接 */}
                      <div className="w-full">
                        <p className="text-sm font-medium text-default-700 mb-3 text-center">
                          下载移动端应用
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
                              iOS 版本
                            </span>
                          </a>

                          {/* Android 应用 */}
                          <button
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
                            onClick={() => {
                              addToast({
                                title: "正在开发中",
                                description:
                                  "Android 版本正在开发中，敬请期待！",
                                color: "warning",
                              });
                            }}
                          >
                            <Icon
                              className="w-5 h-5 text-white"
                              icon="simple-icons:android"
                            />
                            <span className="text-sm font-medium">
                              Android 版本
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
