import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  cn,
  useDisclosure,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tabs,
  Tab,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from "@heroui/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faServer,
  faBullseye,
  faEye,
  faEdit,
  faTrash,
  faLink,
  faTimesCircle,
  faRotateRight,
  faFileImport,
  faFileDownload,
  faPlug,
  faPlugCircleXmark,
  faPen,
  faCopy,
  faEllipsisVertical,
  faGrip,
  faTable,
  faSync,
  faKey,
} from "@fortawesome/free-solid-svg-icons";

import AddEndpointModal from "./components/add-endpoint-modal";
import RenameEndpointModal from "./components/rename-endpoint-modal";
import EditApiKeyModal from "./components/edit-apikey-modal";

import { buildApiUrl, formatUrlWithPrivacy } from "@/lib/utils";
import { copyToClipboard } from "@/lib/utils/clipboard";
import ManualCopyModal from "@/components/ui/manual-copy-modal";
import { useSettings } from "@/components/providers/settings-provider";
// 本地定义 EndpointStatus 枚举，后端通过 API 返回字符串
type EndpointStatus = "ONLINE" | "OFFLINE" | "FAIL" | "DISCONNECT";
// 后端返回的 Endpoint 基础结构
interface EndpointBase {
  id: number;
  name: string;
  url: string;
  status: EndpointStatus;
}

interface EndpointWithRelations extends EndpointBase {
  tunnelInstances: Array<{
    id: string;
    status: string;
  }>;
  responses: Array<{
    response: string;
  }>;
}

interface FormattedEndpoint extends EndpointWithRelations {
  apiPath: string;
  apiKey: string;
  tunnelCount: number;
  activeInstances: number;
  createdAt: Date;
  updatedAt: Date;
  lastCheck: Date;
  lastResponse: string | null;
  ver?: string; // 添加版本字段
}

interface EndpointFormData {
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
}

export default function EndpointsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检测是否是 beta 版本
  const isBetaVersion = (ver?: string) => {
    if (!ver) return false;
    return /-b\d+/i.test(ver);
  };

  // 组件挂载状态管理和定时器清理
  const isMountedRef = useRef(true);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const [endpoints, setEndpoints] = useState<FormattedEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [deleteModalEndpoint, setDeleteModalEndpoint] =
    useState<FormattedEndpoint | null>(null);

  // 使用全局设置Hook
  const { settings } = useSettings();
  const {
    isOpen: isImportOpen,
    onOpen: onImportOpen,
    onOpenChange: onImportOpenChange,
  } = useDisclosure();

  const {
    isOpen: isAddOpen,
    onOpen: onAddOpen,
    onOpenChange: onAddOpenChange,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onOpenChange: onDeleteOpenChange,
  } = useDisclosure();
  const {
    isOpen: isRenameOpen,
    onOpen: onRenameOpen,
    onOpenChange: onRenameOpenChange,
  } = useDisclosure();
  const {
    isOpen: isEditApiKeyOpen,
    onOpen: onEditApiKeyOpen,
    onOpenChange: onEditApiKeyOpenChange,
  } = useDisclosure();
  const [selectedEndpoint, setSelectedEndpoint] =
    useState<FormattedEndpoint | null>(null);
  // Next.js 路由
  const navigate = useNavigate();
  // 视图模式：card | table，初始化时从 localStorage 读取
  const [viewMode, setViewMode] = useState<"card" | "table">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("endpointsViewMode");

      if (saved === "card" || saved === "table") {
        return saved;
      }
    }

    return "card";
  });

  // 表格排序状态 - 默认不排序
  const [sortDescriptor, setSortDescriptor] = useState<{
    column: string | React.Key;
    direction: "ascending" | "descending";
  } | null>(null);

  // 组件挂载和卸载管理
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      // 清理所有定时器
      timeoutRefs.current.forEach((id) => clearTimeout(id));
      timeoutRefs.current = [];
    };
  }, []);

  // 安全的setTimeout函数
  const safeSetTimeout = (callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        callback();
      }
    }, delay);

    timeoutRefs.current.push(timeoutId);

    return timeoutId;
  };

  // 当 viewMode 变化时写入 localStorage，保持持久化
  useEffect(() => {
    if (typeof window !== "undefined" && isMountedRef.current) {
      localStorage.setItem("endpointsViewMode", viewMode);
    }
  }, [viewMode]);

  // 获取主控列表 - 使用useCallback避免依赖问题
  const fetchEndpoints = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      setLoading(true);
      const response = await fetch(buildApiUrl("/api/endpoints"));

      if (!response.ok) throw new Error("获取主控列表失败");
      const data = await response.json();

      if (isMountedRef.current) {
        setEndpoints(data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取主控列表失败:", error);
        addToast({
          title: "错误",
          description: "获取主控列表失败",
          color: "danger",
        });
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // 应用启动时执行主控列表获取
  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  // 格式化URL显示（处理脱敏逻辑）
  const formatUrl = (url: string, apiPath: string) => {
    return formatUrlWithPrivacy(url, apiPath, settings.isPrivacyMode);
  };

  // 获取排序后的端点列表 - 仅当有排序条件时才排序
  const sortedEndpoints = sortDescriptor
    ? endpoints.slice().sort((a, b) => {
        const key = sortDescriptor.column as keyof FormattedEndpoint;
        let aValue: any = a[key];
        let bValue: any = b[key];

        // 处理不同数据类型的比较
        if (typeof aValue === "string") {
          aValue = aValue.toLowerCase();
          bValue = (bValue as string).toLowerCase();
        }

        if (aValue < bValue) {
          return sortDescriptor.direction === "ascending" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortDescriptor.direction === "ascending" ? 1 : -1;
        }
        return 0;
      })
    : endpoints;

  const handleAddEndpoint = async (data: EndpointFormData) => {
    try {
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("添加主控失败");

      addToast({
        title: "主控添加成功",
        description: `${data.name} 已成功添加到主控列表`,
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: "添加主控失败",
        description: "请检查输入信息后重试",
        color: "danger",
      });
    }
  };

  const handleDeleteClick = (endpoint: FormattedEndpoint) => {
    setDeleteModalEndpoint(endpoint);
    onDeleteOpen();
  };

  const handleDeleteEndpoint = async () => {
    if (!deleteModalEndpoint) return;

    try {
      const response = await fetch(
        buildApiUrl(`/api/endpoints/${deleteModalEndpoint.id}`),
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "删除失败");
      }

      // 刷新主控列表
      await fetchEndpoints();

      addToast({
        title: "成功",
        description: "删除成功",
        color: "success",
      });
    } catch (error) {
      console.error("删除主控失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "删除失败",
        color: "danger",
      });
    }
    onDeleteOpenChange();
  };

  const toggleExpanded = (endpointId: number) => {
    setExpandedCard((prev) => (prev === endpointId ? null : endpointId));
  };

  const handleReconnect = async (endpointId: number) => {
    try {
      // 调用 PATCH API 进行重连
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

        throw new Error(errorData.error || "重连失败");
      }

      const result = await response.json();

      addToast({
        title: "重连成功",
        description:
          result.message || "主控重连请求已发送，正在尝试建立连接...",
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();
    } catch (error) {
      addToast({
        title: "重连失败",
        description:
          error instanceof Error ? error.message : "重连请求失败，请稍后重试",
        color: "danger",
      });
    }
  };

  const handleConnect = async (endpointId: number) => {
    try {
      // 调用 PATCH API 进行连接
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: Number(endpointId),
          action: "reconnect", // 使用reconnect来建立连接
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || "连接失败");
      }

      const result = await response.json();

      addToast({
        title: "连接成功",
        description:
          result.message || "主控连接请求已发送，正在尝试建立连接...",
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();
    } catch (error) {
      addToast({
        title: "连接失败",
        description:
          error instanceof Error ? error.message : "连接请求失败，请稍后重试",
        color: "danger",
      });
    }
  };

  const handleDisconnect = async (endpointId: number) => {
    try {
      // 调用 PATCH API 进行断开连接
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

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();
    } catch (error) {
      addToast({
        title: "断开连接失败",
        description:
          error instanceof Error ? error.message : "断开连接失败，请稍后重试",
        color: "danger",
      });
    }
  };
  const handleExportData = async () => {
    try {
      const response = await fetch("/api/data/export");

      if (!response.ok) {
        throw new Error("导出失败");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `nodepassdash-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        title: "导出成功",
        description: "数据已成功导出到文件",
        color: "success",
      });
    } catch (error) {
      console.error("导出数据失败:", error);
      addToast({
        title: "导出失败",
        description: "导出数据时发生错误",
        color: "danger",
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      if (file.type !== "application/json") {
        addToast({
          title: "文件格式错误",
          description: "请选择 JSON 格式的文件",
          color: "danger",
        });

        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImportData = async () => {
    if (!selectedFile) {
      addToast({
        title: "请选择文件",
        description: "请先选择要导入的端点配置文件",
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);
      const fileContent = await selectedFile.text();
      const importData = JSON.parse(fileContent);

      const response = await fetch("/api/data/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(importData),
      });

      const result = await response.json();

      if (response.ok) {
        addToast({
          title: "导入成功",
          description: result.message,
          color: "success",
        });
        onImportOpenChange();
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        // 添加延迟以确保 Toast 消息能够显示
        safeSetTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error(result.error || "导入失败");
      }
    } catch (error) {
      console.error("导入数据失败:", error);
      addToast({
        title: "导入失败",
        description:
          error instanceof Error ? error.message : "导入数据时发生错误",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  // 获取主控状态相关信息（直接从数据库数据）
  const getEndpointDisplayData = (endpoint: FormattedEndpoint) => {
    return {
      status: endpoint.status,
      tunnelCount: endpoint.tunnelCount || 0,
      canRetry: endpoint.status === "FAIL" || endpoint.status === "DISCONNECT",
    };
  };

  const getEndpointContent = (
    endpoint: FormattedEndpoint,
    isExpanded: boolean,
  ) => {
    const realTimeData = getEndpointDisplayData(endpoint);

    if (isExpanded) {
      return (
        <div className="h-full w-full items-start justify-center overflow-scroll px-4 pb-24 pt-8">
          <div className="space-y-4">
            <div>
              <label className="text-small text-default-500 mb-2 block">
                URL 地址
              </label>
              <Input
                isReadOnly
                size="sm"
                value={endpoint.url}
                variant="bordered"
              />
            </div>
            <div>
              <label className="text-small text-default-500 mb-2 block">
                API 前缀
              </label>
              <Input
                isReadOnly
                size="sm"
                value={endpoint.apiPath}
                variant="bordered"
              />
            </div>
            <div>
              <label className="text-small text-default-500 mb-2 block">
                API Key
              </label>
              <Input
                isReadOnly
                size="sm"
                type={settings.isPrivacyMode ? "password" : "text"}
                value={endpoint.apiKey}
                variant="bordered"
              />
            </div>

            {/* 连接状态和操作 */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-small text-default-500">连接状态:</span>
                <Chip
                  color={
                    realTimeData.status === "ONLINE"
                      ? "success"
                      : realTimeData.status === "FAIL"
                        ? "danger"
                        : realTimeData.status === "DISCONNECT"
                          ? "default"
                          : "warning"
                  }
                  size="sm"
                  startContent={
                    <FontAwesomeIcon
                      className="text-xs"
                      icon={
                        realTimeData.status === "ONLINE"
                          ? faLink
                          : realTimeData.status === "FAIL"
                            ? faPlugCircleXmark
                            : realTimeData.status === "DISCONNECT"
                              ? faPlugCircleXmark
                              : faTimesCircle
                      }
                    />
                  }
                  variant="flat"
                >
                  {realTimeData.status === "ONLINE"
                    ? "在线"
                    : realTimeData.status === "FAIL"
                      ? "异常"
                      : realTimeData.status === "DISCONNECT"
                        ? "断开"
                        : "离线"}
                </Chip>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-small text-default-500">实例数量:</span>
                <Chip color="primary" size="sm" variant="flat">
                  {realTimeData.tunnelCount} 个
                </Chip>
              </div>

              {/* 显示失败状态提示 */}
              {realTimeData.status === "FAIL" && (
                <div className="p-2 bg-danger-50 rounded-lg">
                  <p className="text-tiny text-danger-600">
                    主控连接失败，已停止重试
                  </p>
                </div>
              )}

              {/* 显示断开状态提示 */}
              {realTimeData.status === "DISCONNECT" && (
                <div className="p-2 bg-default-50 rounded-lg">
                  <p className="text-tiny text-default-600">主控已断开连接</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                startContent={<FontAwesomeIcon icon={faEdit} />}
                variant="bordered"
              >
                编辑
              </Button>
              <Button
                size="sm"
                startContent={<FontAwesomeIcon icon={faEye} />}
                variant="bordered"
              >
                查看实例
              </Button>
              {realTimeData.canRetry && (
                <Button
                  color="primary"
                  size="sm"
                  startContent={<FontAwesomeIcon icon={faRotateRight} />}
                  variant="bordered"
                  onPress={() => handleReconnect(endpoint.id)}
                >
                  重新连接
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between h-full w-full">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon
            className={
              realTimeData.status === "ONLINE"
                ? "text-success-600"
                : realTimeData.status === "FAIL"
                  ? "text-danger-600"
                  : realTimeData.status === "DISCONNECT"
                    ? "text-default-400"
                    : "text-warning-600"
            }
            icon={faBullseye}
          />
          <p className="text-small text-default-500">
            {realTimeData.tunnelCount
              ? `${realTimeData.tunnelCount} 个实例`
              : "0 个实例"}
          </p>
        </div>
        <div className="flex items-center">
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={(e) => {
                  (e as any).stopPropagation?.();
                }}
              >
                <FontAwesomeIcon icon={faEllipsisVertical} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Actions"
              onAction={(key) => {
                switch (key) {
                  case "toggle":
                    if (realTimeData.status === "ONLINE")
                      handleDisconnect(endpoint.id);
                    else handleConnect(endpoint.id);
                    break;
                  case "rename":
                    handleCardClick(endpoint);
                    break;
                  case "editApiKey":
                    handleEditApiKeyClick(endpoint);
                    break;
                  case "copy":
                    handleCopyConfig(endpoint);
                    break;
                  case "addTunnel":
                    handleAddTunnel(endpoint);
                    break;
                  case "refresTunnel":
                    handleRefreshTunnels(endpoint.id);
                    break;
                  case "delete":
                    handleDeleteClick(endpoint);
                    break;
                }
              }}
            >
              <DropdownItem
                key="addTunnel"
                className="text-primary"
                color="primary"
                startContent={<FontAwesomeIcon fixedWidth icon={faPlus} />}
              >
                添加实例
              </DropdownItem>
              <DropdownItem
                key="refresTunnel"
                className="text-secondary"
                color="secondary"
                startContent={<FontAwesomeIcon fixedWidth icon={faSync} />}
              >
                同步实例
              </DropdownItem>
              <DropdownItem
                key="rename"
                className="text-warning"
                color="warning"
                startContent={<FontAwesomeIcon fixedWidth icon={faPen} />}
              >
                重命名
              </DropdownItem>
              <DropdownItem
                key="editApiKey"
                className="text-warning"
                color="warning"
                startContent={<FontAwesomeIcon fixedWidth icon={faKey} />}
              >
                修改密钥
              </DropdownItem>
              <DropdownItem
                key="copy"
                className="text-success"
                color="success"
                startContent={<FontAwesomeIcon fixedWidth icon={faCopy} />}
              >
                复制配置
              </DropdownItem>
              <DropdownItem
                key="toggle"
                className={
                  realTimeData.status === "ONLINE"
                    ? "text-warning"
                    : "text-success"
                }
                color={realTimeData.status === "ONLINE" ? "warning" : "success"}
                startContent={
                  <FontAwesomeIcon
                    fixedWidth
                    icon={
                      realTimeData.status === "ONLINE"
                        ? faPlugCircleXmark
                        : faPlug
                    }
                  />
                }
              >
                {realTimeData.status === "ONLINE" ? "断开连接" : "连接主控"}
              </DropdownItem>
              <DropdownItem
                key="delete"
                className="text-danger"
                color="danger"
                startContent={<FontAwesomeIcon fixedWidth icon={faTrash} />}
              >
                删除主控
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    );
  };

  const handleCardClick = (endpoint: FormattedEndpoint) => {
    setSelectedEndpoint(endpoint);
    onRenameOpen();
  };

  const handleRename = async (newName: string) => {
    if (!selectedEndpoint?.id) return;

    try {
      const response = await fetch(
        buildApiUrl(`/api/endpoints/${selectedEndpoint.id}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: newName,
            action: "rename",
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || "重命名失败");
      }

      addToast({
        title: "重命名成功",
        description: `主控名称已更新为 "${newName}"`,
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: "重命名失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        color: "danger",
      });
    }
  };

  // 处理修改密钥
  const handleEditApiKey = async (newApiKey: string) => {
    if (!selectedEndpoint?.id) return;

    try {
      // 1. 先断开连接
      await handleDisconnect(selectedEndpoint.id);

      // 2. 更新密钥
      const response = await fetch(
        buildApiUrl(`/api/endpoints/${selectedEndpoint.id}`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiKey: newApiKey,
            action: "editApiKey",
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();

        throw new Error(errorData.error || "修改密钥失败");
      }

      addToast({
        title: "密钥修改成功",
        description: "API Key 已更新，正在重新连接...",
        color: "success",
      });

      // 3. 刷新主控列表
      await fetchEndpoints();

      // 4. 重新连接
      safeSetTimeout(async () => {
        await handleConnect(selectedEndpoint.id);
      }, 1000);
    } catch (error) {
      addToast({
        title: "修改密钥失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        color: "danger",
      });
      throw error; // 重新抛出错误以便模态框处理
    }
  };

  // 打开修改密钥弹窗
  const handleEditApiKeyClick = (endpoint: FormattedEndpoint) => {
    setSelectedEndpoint(endpoint);
    onEditApiKeyOpen();
  };

  // 打开添加隧道弹窗
  const {
    isOpen: isAddTunnelOpen,
    onOpen: onAddTunnelOpen,
    onOpenChange: onAddTunnelOpenChange,
  } = useDisclosure();
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [tunnelName, setTunnelName] = useState("");

  function handleAddTunnel(endpoint: FormattedEndpoint) {
    setSelectedEndpoint(endpoint);
    setTunnelUrl("");
    setTunnelName("");
    onAddTunnelOpen();
  }

  // 提交添加隧道
  const handleSubmitAddTunnel = async () => {
    if (!selectedEndpoint) return;
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
          endpointId: selectedEndpoint.id,
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
    } catch (err) {
      addToast({
        title: "创建失败",
        description: err instanceof Error ? err.message : "无法创建隧道",
        color: "danger",
      });
    }
  };

  // 复制配置到剪贴板
  function handleCopyConfig(endpoint: FormattedEndpoint) {
    const cfg = `API URL: ${endpoint.url}${endpoint.apiPath}\nAPI KEY: ${endpoint.apiKey}`;

    copyToClipboard(cfg, "配置已复制到剪贴板", showManualCopyModal);
  }

  // 手动复制模态框状态
  const [manualCopyText, setManualCopyText] = useState<string>("");
  const {
    isOpen: isManualCopyOpen,
    onOpen: onManualCopyOpen,
    onOpenChange: onManualCopyOpenChange,
  } = useDisclosure();

  const showManualCopyModal = (text: string) => {
    setManualCopyText(text);
    onManualCopyOpen();
  };

  // 复制安装脚本到剪贴板
  function handleCopyInstallScript() {
    const cmd = "bash <(wget -qO- https://run.nodepass.eu/np.sh)";

    copyToClipboard(cmd, "安装脚本已复制到剪贴板", showManualCopyModal);
  }

  // 刷新指定端点的隧道信息
  const handleRefreshTunnels = async (endpointId: number) => {
    try {
      const res = await fetch(buildApiUrl("/api/endpoints"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: endpointId, action: "refresTunnel" }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "刷新失败");
      }
      addToast({
        title: "刷新成功",
        description: data.message || "隧道信息已刷新",
        color: "success",
      });
      await fetchEndpoints();
    } catch (err) {
      addToast({
        title: "刷新失败",
        description: err instanceof Error ? err.message : "刷新请求失败",
        color: "danger",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-4">
          <h1 className="text-2xl font-bold">主控管理</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-0">
          <Button
            startContent={<FontAwesomeIcon icon={faFileDownload} />}
            variant="flat"
            onPress={handleExportData}
          >
            导出数据
          </Button>
          <Button
            startContent={<FontAwesomeIcon icon={faFileImport} />}
            variant="flat"
            onPress={onImportOpen}
          >
            导入数据
          </Button>
          <Button
            startContent={<FontAwesomeIcon icon={faCopy} />}
            variant="flat"
            onPress={handleCopyInstallScript}
          >
            安装脚本
          </Button>
          <Button
            startContent={<FontAwesomeIcon icon={faRotateRight} />}
            variant="flat"
            onPress={async () => {
              await fetchEndpoints();
            }}
          >
            刷新
          </Button>
          <Tabs
            aria-label="布局切换"
            className="w-auto"
            selectedKey={viewMode}
            onSelectionChange={(key) => setViewMode(key as "card" | "table")}
          >
            <Tab
              key="card"
              title={
                <Tooltip content="卡片视图">
                  <div>
                    <FontAwesomeIcon icon={faGrip} />
                  </div>
                </Tooltip>
              }
            />
            <Tab
              key="table"
              title={
                <Tooltip content="表格视图">
                  <div>
                    <FontAwesomeIcon icon={faTable} />
                  </div>
                </Tooltip>
              }
            />
          </Tabs>
        </div>
      </div>

      {/* 根据视图模式渲染不同内容 */}
      {loading ? (
        /* Skeleton 加载状态 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Card key={index} className="relative w-full h-[200px]">
              {/* 状态按钮 Skeleton */}
              <div className="absolute right-4 top-6 z-10">
                <Skeleton className="h-8 w-12 rounded-full" />
              </div>

              {/* 主要内容区域 Skeleton */}
              <CardBody className="relative h-[140px] bg-gradient-to-br from-content1 to-default-100/50 p-6">
                <div className="flex items-center gap-3 mb-2 pr-20">
                  <Skeleton className="h-8 w-32 rounded-lg" />
                  <Skeleton className="h-6 w-16 rounded-lg" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-48 rounded-lg" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-60 rounded-lg" />
                  </div>
                </div>
              </CardBody>

              {/* 底部详情区域 Skeleton */}
              <CardFooter className="absolute bottom-0 h-[60px] bg-content1 px-6 border-t-1 border-default-100">
                <div className="flex items-center justify-between h-full w-full">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <Skeleton className="h-4 w-16 rounded-lg" />
                  </div>
                  <Skeleton className="w-8 h-8 rounded" />
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : viewMode === "card" ? (
        /* 卡片布局 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {endpoints.map((endpoint) => {
            const isExpanded = expandedCard === endpoint.id;
            const realTimeData = getEndpointDisplayData(endpoint);

            return (
              <Card
                key={endpoint.id}
                isPressable
                as="div"
                className="relative w-full h-[200px]"
                onPress={() => navigate(`/endpoints/details?id=${endpoint.id}`)}
              >
                {/* 状态按钮 */}
                <div className="absolute right-4 top-6 z-10">
                  <Chip
                    color={
                      realTimeData.status === "ONLINE"
                        ? "success"
                        : realTimeData.status === "FAIL"
                          ? "danger"
                          : realTimeData.status === "DISCONNECT"
                            ? "default"
                            : "warning"
                    }
                    radius="full"
                    variant="flat"
                  >
                    {realTimeData.status === "ONLINE"
                      ? "在线"
                      : realTimeData.status === "FAIL"
                        ? "异常"
                        : realTimeData.status === "DISCONNECT"
                          ? "断开"
                          : "离线"}
                  </Chip>
                </div>

                {/* 主要内容区域 */}
                <CardBody className="relative h-[140px] bg-gradient-to-br from-content1 to-default-100/50 p-6">
                  <div className="flex items-center gap-2 mb-2 pr-15">
                    {/*  */}
                    {endpoint.name.length < 10 && (
                      <h2 className="inline bg-gradient-to-br from-foreground-800 to-foreground-500 bg-clip-text text-2xl font-semibold tracking-tight text-transparent dark:to-foreground-200">
                        {endpoint.name}
                      </h2>
                    )}
                    {endpoint.name.length < 10 && endpoint.ver && (
                      <Chip
                        className="text-xs"
                        size="sm"
                        variant="flat"
                        color={isBetaVersion(endpoint.ver) ? "primary" : undefined}
                      >
                        {endpoint.ver}
                      </Chip>
                    )}
                    {endpoint.name.length >= 10 && (
                      <h2
                        className={`leading-tight cursor-help overflow-hidden max-h-[2.5em] bg-gradient-to-br from-foreground-800 to-foreground-500 bg-clip-text text-xl font-semibold tracking-tight text-transparent dark:to-foreground-200`}
                        style={{ wordBreak: "break-all" }}
                      >
                        {endpoint.name}
                        {endpoint.ver && (
                          <Chip
                            className="text-xs cursor-pointer ml-1 align-middle"
                            size="sm"
                            variant="flat"
                            color={isBetaVersion(endpoint.ver) ? "primary" : undefined}
                          >
                            {endpoint.ver}
                          </Chip>
                        )}
                      </h2>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-default-400">
                      <FontAwesomeIcon icon={faServer} />
                      <span className="text-small truncate">
                        {formatUrl(endpoint.url, endpoint.apiPath)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-default-400">
                      <FontAwesomeIcon icon={faKey} />
                      <span className="text-small font-mono flex-1 truncate">
                        {settings.isPrivacyMode
                          ? "•••••••••••••••••••••••••••••••••"
                          : endpoint.apiKey}
                      </span>
                    </div>
                  </div>
                </CardBody>

                {/* 底部详情区域 */}
                <CardFooter
                  className={cn(
                    "absolute bottom-0 h-[60px] overflow-visible bg-content1 px-6 duration-300 ease-in-out transition-all",
                    {
                      "h-full": isExpanded,
                    },
                  )}
                >
                  {getEndpointContent(endpoint, isExpanded)}
                </CardFooter>
              </Card>
            );
          })}

          {/* 添加主控卡片 - 仅在非加载状态下显示 */}
          <Card
            isPressable
            as="div"
            className="relative w-full h-[200px] cursor-pointer hover:shadow-lg transition-shadow border-2 border-dashed border-default-300 hover:border-primary"
            onPress={() => onAddOpen()}
          >
            <CardBody className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-default-50 to-default-100/50 p-6">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                  <FontAwesomeIcon
                    className="text-xl text-primary"
                    icon={faPlus}
                  />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-default-700 mb-1">
                    添加 API 主控
                  </h3>
                  <p className="text-small text-default-500">
                    点击添加新的主控配置
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : (
        /* 表格布局 */
        <Table
          aria-label="API 主控列表"
          className="mt-4"
          sortDescriptor={sortDescriptor ?? undefined}
          onSortChange={(descriptor) => {
            if (descriptor.column) {
              setSortDescriptor({
                column: descriptor.column,
                direction: descriptor.direction ?? "ascending",
              });
            }
          }}
        >
          <TableHeader>
            <TableColumn key="id">ID</TableColumn>
            <TableColumn allowsSorting key="name" className="min-w-[140px]">
              名称
            </TableColumn>
            <TableColumn key="version" className="w-24">
              版本
            </TableColumn>
            <TableColumn allowsSorting key="url" className="min-w-[200px]">
              URL
            </TableColumn>
            <TableColumn key="apikey" className="min-w-[220px]">
              API Key
            </TableColumn>
            <TableColumn key="actions" className="w-52">
              操作
            </TableColumn>
          </TableHeader>
          <TableBody>
            {endpoints.length === 0 ? (
              <>
                <TableRow>
                  <TableCell className="text-center py-4" colSpan={6}>
                    暂无主控数据
                  </TableCell>
                </TableRow>
                <TableRow key="add-row-empty">
                  <TableCell colSpan={6}>
                    <Button
                      className="w-full border-2 border-dashed border-default-300 hover:border-primary"
                      variant="light"
                      onPress={onAddOpen}
                    >
                      <FontAwesomeIcon className="mr-2" icon={faPlus} />
                      添加 API 主控
                    </Button>
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <>
                {sortedEndpoints.map((ep) => {
                  const realTimeData = getEndpointDisplayData(ep);

                  return (
                    <TableRow key={ep.id}>
                      <TableCell>{ep.id}</TableCell>
                      <TableCell className="truncate min-w-[140px]">
                        <div className="flex items-center gap-1 max-w-[220px] min-w-0">
                          <Tooltip
                            content={
                              realTimeData.status === "ONLINE"
                                ? "在线"
                                : realTimeData.status === "FAIL"
                                  ? "异常"
                                  : realTimeData.status === "DISCONNECT"
                                    ? "断开"
                                    : "离线"
                            }
                            size="sm"
                          >
                            <span
                              className={`inline-block w-2 h-2 rounded-full cursor-help flex-shrink-0 ${
                                realTimeData.status === "ONLINE"
                                  ? "bg-success-500"
                                  : realTimeData.status === "FAIL"
                                    ? "bg-danger-500"
                                    : realTimeData.status === "DISCONNECT"
                                      ? "bg-default-400"
                                      : "bg-warning-500"
                              }`}
                            />
                          </Tooltip>
                          <span className="text-xs md:text-sm truncate flex-1 min-w-0">
                            {ep.name}
                          </span>
                          <span className="text-default-400 text-xs flex-shrink-0">
                            [{realTimeData.tunnelCount}实例]
                          </span>
                          <Tooltip content="修改名称" size="sm">
                            <FontAwesomeIcon
                              className="text-[10px] text-default-400 hover:text-default-500 cursor-pointer flex-shrink-0"
                              icon={faPen}
                              onClick={() => handleCardClick(ep)}
                            />
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="w-32">
                        <Chip
                          className="text-xs"
                          size="sm"
                          variant="flat"
                          color={isBetaVersion(ep.ver) ? "primary" : undefined}
                        >
                          {ep.ver ? ep.ver : "unknown"}
                        </Chip>
                      </TableCell>
                      <TableCell className="truncate min-w-[200px]">
                        {formatUrl(ep.url, ep.apiPath)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono truncate">
                          {settings.isPrivacyMode
                            ? "•••••••••••••••••••••••••••••••••"
                            : ep.apiKey}
                        </span>
                      </TableCell>
                      <TableCell className="w-52">
                        <div className="flex items-center gap-1 justify-start">
                          {/* 查看详情 */}
                          <Tooltip content="查看详情">
                            <Button
                              isIconOnly
                              color="primary"
                              size="sm"
                              variant="light"
                              onPress={() =>
                                navigate(`/endpoints/details?id=${ep.id}`)
                              }
                            >
                              <FontAwesomeIcon icon={faEye} />
                            </Button>
                          </Tooltip>
                          {/* 添加实例 */}
                          {/* <Tooltip content="添加实例">
                          <Button isIconOnly size="sm" variant="light" color="primary" onPress={()=>handleAddTunnel(ep)}>
                            <FontAwesomeIcon icon={faPlus} />
                          </Button>
                        </Tooltip> */}
                          {/* 刷新实例 */}
                          <Tooltip content="同步实例">
                            <Button
                              isIconOnly
                              color="secondary"
                              size="sm"
                              variant="light"
                              onPress={() => handleRefreshTunnels(ep.id)}
                            >
                              <FontAwesomeIcon icon={faSync} />
                            </Button>
                          </Tooltip>
                          {/* 修改密钥 */}
                          <Tooltip content="修改密钥">
                            <Button
                              isIconOnly
                              color="warning"
                              size="sm"
                              variant="light"
                              onPress={() => handleEditApiKeyClick(ep)}
                            >
                              <FontAwesomeIcon icon={faKey} />
                            </Button>
                          </Tooltip>
                          {/* 复制配置 */}
                          <Tooltip content="复制配置">
                            <Button
                              isIconOnly
                              color="success"
                              size="sm"
                              variant="light"
                              onPress={() => handleCopyConfig(ep)}
                            >
                              <FontAwesomeIcon icon={faCopy} />
                            </Button>
                          </Tooltip>
                          {/* 连接 / 断开 */}
                          <Tooltip
                            content={
                              realTimeData.status === "ONLINE"
                                ? "断开连接"
                                : "连接主控"
                            }
                          >
                            <Button
                              isIconOnly
                              color={
                                realTimeData.status === "ONLINE"
                                  ? "warning"
                                  : "success"
                              }
                              size="sm"
                              variant="light"
                              onPress={() => {
                                if (realTimeData.status === "ONLINE")
                                  handleDisconnect(ep.id);
                                else handleConnect(ep.id);
                              }}
                            >
                              <FontAwesomeIcon
                                icon={
                                  realTimeData.status === "ONLINE"
                                    ? faPlugCircleXmark
                                    : faPlug
                                }
                              />
                            </Button>
                          </Tooltip>
                          {/* 删除 */}
                          <Tooltip content="删除主控">
                            <Button
                              isIconOnly
                              color="danger"
                              size="sm"
                              variant="light"
                              onPress={() => handleDeleteClick(ep)}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </Button>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* 添加主控行 */}
                <TableRow key="add-row">
                  <TableCell colSpan={6}>
                    <Button
                      className="w-full border-2 border-dashed border-default-300 hover:border-primary"
                      variant="light"
                      onPress={onAddOpen}
                    >
                      <FontAwesomeIcon className="mr-2" icon={faPlus} />
                      添加 API 主控
                    </Button>
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      )}
      {/* 添加主控模态框 */}
      <AddEndpointModal
        isOpen={isAddOpen}
        onAdd={handleAddEndpoint}
        onOpenChange={onAddOpenChange}
      />

      {/* 重命名模态框 */}
      {selectedEndpoint && (
        <RenameEndpointModal
          currentName={selectedEndpoint.name}
          isOpen={isRenameOpen}
          onOpenChange={onRenameOpenChange}
          onRename={handleRename}
        />
      )}

      {/* 修改密钥模态框 */}
      {selectedEndpoint && (
        <EditApiKeyModal
          currentApiKey={selectedEndpoint.apiKey}
          endpointName={selectedEndpoint.name}
          isOpen={isEditApiKeyOpen}
          onOpenChange={onEditApiKeyOpenChange}
          onSave={handleEditApiKey}
        />
      )}

      {/* 添加隧道弹窗 */}
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
                    placeholder="实例名称"
                    value={tunnelName}
                    onValueChange={setTunnelName}
                  />
                  <Input
                    placeholder="<core>://<tunnel_addr>/<target_addr>"
                    value={tunnelUrl}
                    onValueChange={setTunnelUrl}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="primary" onPress={handleSubmitAddTunnel}>
                  确定
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 删除确认模态框 */}
      <Modal
        isOpen={isDeleteOpen}
        placement="center"
        onOpenChange={onDeleteOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="text-danger" icon={faTrash} />
                  确认删除主控
                </div>
              </ModalHeader>
              <ModalBody>
                {deleteModalEndpoint && (
                  <>
                    <p className="text-default-600">
                      您确定要删除主控{" "}
                      <span className="font-semibold text-foreground">
                        "{deleteModalEndpoint.name}"
                      </span>{" "}
                      吗？
                    </p>
                    <p className="text-small text-warning">
                      ⚠️ 此操作不可撤销，主控的所有配置都将被永久删除。
                    </p>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="danger"
                  startContent={<FontAwesomeIcon icon={faTrash} />}
                  onPress={() => {
                    handleDeleteEndpoint();
                    onClose();
                  }}
                >
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 手动复制模态框 */}
      <ManualCopyModal
        isOpen={isManualCopyOpen}
        text={manualCopyText}
        onOpenChange={onManualCopyOpenChange}
      />

      {/* 导入数据模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          backdrop:
            "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
        }}
        isOpen={isImportOpen}
        placement="center"
        onOpenChange={onImportOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-primary"
                    icon="solar:import-bold"
                    width={24}
                  />
                  导入数据
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      color="primary"
                      isDisabled={isSubmitting}
                      startContent={
                        <Icon
                          icon="solar:folder-with-files-linear"
                          width={18}
                        />
                      }
                      variant="light"
                      onPress={() => fileInputRef.current?.click()}
                    >
                      选择文件
                    </Button>
                    <span className="text-small text-default-500">
                      {selectedFile ? selectedFile.name : "未选择文件"}
                    </span>
                    <input
                      ref={fileInputRef}
                      accept=".json"
                      className="hidden"
                      type="file"
                      onChange={handleFileSelect}
                    />
                  </div>

                  <div className="text-small text-default-500">
                    <p>• 请选择之前导出的 JSON 格式数据文件</p>
                    <p>• 导入过程中请勿关闭窗口</p>
                    <p>• 重复的数据将被自动跳过</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-linear" width={18} />
                    ) : null
                  }
                  onPress={handleImportData}
                >
                  {isSubmitting ? "导入中..." : "开始导入"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
