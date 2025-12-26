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
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  hostname?: string;
}

// 可排序的表格行组件
function SortableTableRow({
  id,
  result,
  index,
  t,
}: {
  id: string;
  result: any;
  index: number;
  t: (key: string) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-divider hover:bg-default-50"
    >
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-default-400 hover:text-default-600"
          >
            <FontAwesomeIcon icon={faGrip} />
          </button>
          <span className="text-small">{result.name}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-small font-mono text-xs">
        {result.url}
        {result.apiPath}
      </td>
      <td className="px-3 py-3 text-small">
        <span
          className={`font-mono ${
            result.status === "success"
              ? "text-success"
              : result.status === "low_version"
                ? "text-warning"
                : "text-danger"
          }`}
        >
          {result.version}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <span
            className={`text-xs ${
              result.status === "success"
                ? "text-success"
                : result.status === "low_version"
                  ? "text-warning"
                  : "text-danger"
            }`}
          >
            {result.canImport ? t("importModal.importSuccess") : t("importModal.importFail")}
          </span>
          <span className="text-xs text-default-400">{result.message}</span>
        </div>
      </td>
    </tr>
  );
}

export default function EndpointsPage() {
  const { t } = useTranslation("endpoints");
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
    isOpen: isImportValidateOpen,
    onOpen: onImportValidateOpen,
    onOpenChange: onImportValidateOpenChange,
  } = useDisclosure();

  const [importValidateResults, setImportValidateResults] = useState<any[]>([]);
  const [sortedValidateResults, setSortedValidateResults] = useState<any[]>([]);
  const [importFileData, setImportFileData] = useState<any>(null);

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    column: string;
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

      if (!response.ok) throw new Error(t("toast.fetchFailedDesc"));
      const data = await response.json();

      if (isMountedRef.current) {
        setEndpoints(data);
      }
    } catch (error) {
      if (isMountedRef.current) {
        console.error("获取主控列表失败:", error);
        addToast({
          title: t("toast.fetchFailed"),
          description: t("toast.fetchFailedDesc"),
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

      if (!response.ok) throw new Error(t("toast.addFailed"));

      addToast({
        title: t("toast.addSuccess"),
        description: t("toast.addSuccessDesc", { name: data.name }),
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: t("toast.addFailed"),
        description: t("toast.addFailedDesc"),
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

        throw new Error(error.message || t("toast.deleteFailed"));
      }

      // 刷新主控列表
      await fetchEndpoints();

      addToast({
        title: t("toast.deleteSuccess"),
        description: t("toast.deleteSuccessDesc"),
        color: "success",
      });
    } catch (error) {
      console.error("删除主控失败:", error);
      addToast({
        title: t("toast.fetchFailed"),
        description: error instanceof Error ? error.message : t("toast.deleteFailed"),
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

        throw new Error(errorData.error || t("toast.reconnectFailed"));
      }

      const result = await response.json();

      addToast({
        title: t("toast.reconnectSuccess"),
        description:
          result.message || t("toast.reconnectSuccessDesc"),
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();
    } catch (error) {
      addToast({
        title: t("toast.reconnectFailed"),
        description:
          error instanceof Error ? error.message : t("toast.reconnectFailedDesc"),
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

        throw new Error(errorData.error || t("toast.connectFailed"));
      }

      const result = await response.json();

      addToast({
        title: t("toast.connectSuccess"),
        description:
          result.message || t("toast.connectSuccessDesc"),
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();
    } catch (error) {
      addToast({
        title: t("toast.connectFailed"),
        description:
          error instanceof Error ? error.message : t("toast.connectFailedDesc"),
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

        throw new Error(errorData.error || t("toast.disconnectFailed"));
      }

      const result = await response.json();

      addToast({
        title: t("toast.disconnectSuccess"),
        description: result.message || t("toast.disconnectSuccessDesc"),
        color: "success",
      });

      // 立即刷新主控列表以获取最新状态
      await fetchEndpoints();
    } catch (error) {
      addToast({
        title: t("toast.disconnectFailed"),
        description:
          error instanceof Error ? error.message : t("toast.disconnectFailedDesc"),
        color: "danger",
      });
    }
  };
  const handleExportData = async () => {
    try {
      const response = await fetch("/api/data/export");

      if (!response.ok) {
        throw new Error(t("toast.exportFailed"));
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
        title: t("toast.exportSuccess"),
        description: t("toast.exportSuccessDesc"),
        color: "success",
      });
    } catch (error) {
      console.error("导出数据失败:", error);
      addToast({
        title: t("toast.exportFailed"),
        description: t("toast.exportFailedDesc"),
        color: "danger",
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      if (file.type !== "application/json") {
        addToast({
          title: t("toast.fileFormatError"),
          description: t("toast.fileFormatErrorDesc"),
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
        title: t("toast.selectFile"),
        description: t("toast.selectFileDesc"),
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);
      const fileContent = await selectedFile.text();
      const importData = JSON.parse(fileContent);

      // 保存文件数据用于后续实际导入
      setImportFileData(importData);

      // 先调用验证接口
      const validateResponse = await fetch("/api/data/validate-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(importData),
      });

      const validateResult = await validateResponse.json();

      if (!validateResult.success) {
        throw new Error(validateResult.error || t("toast.validateFailed"));
      }

      // 关闭导入窗口，显示验证结果窗口
      const results = validateResult.results || [];
      setImportValidateResults(results);
      setSortedValidateResults(results); // 初始化排序结果
      onImportOpenChange();
      onImportValidateOpen();
    } catch (error) {
      console.error("验证导入数据失败:", error);
      addToast({
        title: t("toast.validateFailed"),
        description:
          error instanceof Error ? error.message : t("toast.validateFailedDesc"),
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理拖拽结束事件
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSortedValidateResults((items) => {
        const oldIndex = items.findIndex((item, idx) => `item-${idx}` === active.id);
        const newIndex = items.findIndex((item, idx) => `item-${idx}` === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // 确认导入 - 只导入可导入的主控
  const handleConfirmImport = async () => {
    // 筛选出可导入的主控，使用排序后的结果
    const importableEndpoints = sortedValidateResults
      .filter((result) => result.canImport)
      .map((result) => ({
        name: result.name,
        url: result.url,
        apiPath: result.apiPath,
        apiKey: importFileData?.data?.endpoints?.find(
          (ep: any) => ep.url === result.url && ep.apiPath === result.apiPath
        )?.apiKey || "",
      }));

    if (importableEndpoints.length === 0) {
      addToast({
        title: t("toast.noImportable"),
        description: t("toast.noImportableDesc"),
        color: "warning",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/data/batch-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoints: importableEndpoints }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: t("toast.importDataSuccess"),
          description: result.message,
          color: "success",
        });
        onImportValidateOpenChange();
        setSelectedFile(null);
        setImportFileData(null);
        setImportValidateResults([]);
        setSortedValidateResults([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        // 添加延迟以确保 Toast 消息能够显示
        safeSetTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error(result.error || t("toast.importDataFailed"));
      }
    } catch (error) {
      console.error("导入数据失败:", error);
      addToast({
        title: t("toast.importDataFailed"),
        description:
          error instanceof Error ? error.message : t("toast.importDataFailedDesc"),
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
                {t("table.urlLabel")}
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
                {t("table.apiPrefix")}
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
                {t("table.apiKeyLabel")}
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
                <span className="text-small text-default-500">{t("status.connection")}:</span>
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
                    ? t("status.online")
                    : realTimeData.status === "FAIL"
                      ? t("status.fail")
                      : realTimeData.status === "DISCONNECT"
                        ? t("status.disconnect")
                        : t("status.offline")}
                </Chip>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-small text-default-500">{t("status.instanceCount")}:</span>
                <Chip color="primary" size="sm" variant="flat">
                  {t("table.instancesCount", { count: realTimeData.tunnelCount })}
                </Chip>
              </div>

              {/* 显示失败状态提示 */}
              {realTimeData.status === "FAIL" && (
                <div className="p-2 bg-danger-50 rounded-lg">
                  <p className="text-tiny text-danger-600">
                    {t("status.failMessage")}
                  </p>
                </div>
              )}

              {/* 显示断开状态提示 */}
              {realTimeData.status === "DISCONNECT" && (
                <div className="p-2 bg-default-50 rounded-lg">
                  <p className="text-tiny text-default-600">{t("status.disconnectMessage")}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                size="sm"
                startContent={<FontAwesomeIcon icon={faEdit} />}
                variant="bordered"
              >
                {t("actions.edit")}
              </Button>
              <Button
                size="sm"
                startContent={<FontAwesomeIcon icon={faEye} />}
                variant="bordered"
              >
                {t("actions.view")}
              </Button>
              {realTimeData.canRetry && (
                <Button
                  color="primary"
                  size="sm"
                  startContent={<FontAwesomeIcon icon={faRotateRight} />}
                  variant="bordered"
                  onPress={() => handleReconnect(endpoint.id)}
                >
                  {t("actions.reconnect")}
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
              ? t("table.instances", { count: realTimeData.tunnelCount })
              : t("table.noInstances")}
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
                {t("actions.addTunnel")}
              </DropdownItem>
              <DropdownItem
                key="refresTunnel"
                className="text-secondary"
                color="secondary"
                startContent={<FontAwesomeIcon fixedWidth icon={faSync} />}
              >
                {t("actions.syncTunnel")}
              </DropdownItem>
              <DropdownItem
                key="rename"
                className="text-warning"
                color="warning"
                startContent={<FontAwesomeIcon fixedWidth icon={faPen} />}
              >
                {t("actions.rename")}
              </DropdownItem>
              <DropdownItem
                key="editApiKey"
                className="text-warning"
                color="warning"
                startContent={<FontAwesomeIcon fixedWidth icon={faKey} />}
              >
                {t("actions.editApiKey")}
              </DropdownItem>
              <DropdownItem
                key="copy"
                className="text-success"
                color="success"
                startContent={<FontAwesomeIcon fixedWidth icon={faCopy} />}
              >
                {t("actions.copyConfig")}
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
                {realTimeData.status === "ONLINE" ? t("actions.disconnect") : t("actions.connect")}
              </DropdownItem>
              <DropdownItem
                key="delete"
                className="text-danger"
                color="danger"
                startContent={<FontAwesomeIcon fixedWidth icon={faTrash} />}
              >
                {t("actions.deleteMaster")}
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

        throw new Error(errorData.error || t("toast.renameFailed"));
      }

      addToast({
        title: t("toast.renameSuccess"),
        description: t("toast.renameSuccessDesc", { name: newName }),
        color: "success",
      });

      // 刷新主控列表
      fetchEndpoints();
    } catch (error) {
      addToast({
        title: t("toast.renameFailed"),
        description: error instanceof Error ? error.message : t("toast.renameFailedDesc"),
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

        throw new Error(errorData.error || t("toast.editApiKeyFailed"));
      }

      addToast({
        title: t("toast.editApiKeySuccess"),
        description: t("toast.editApiKeySuccessDesc"),
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
        title: t("toast.editApiKeyFailed"),
        description: error instanceof Error ? error.message : t("toast.editApiKeyFailedDesc"),
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
        title: t("toast.addTunnelUrlRequired"),
        description: t("toast.addTunnelUrlRequiredDesc"),
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
        throw new Error(data.error || t("toast.createTunnelFailed"));
      }
      addToast({
        title: t("toast.createTunnelSuccess"),
        description: data.message || t("toast.createTunnelSuccessDesc"),
        color: "success",
      });
      onAddTunnelOpenChange();
    } catch (err) {
      addToast({
        title: t("toast.createTunnelFailed"),
        description: err instanceof Error ? err.message : t("toast.createTunnelFailedDesc"),
        color: "danger",
      });
    }
  };

  // 复制配置到剪贴板
  function handleCopyConfig(endpoint: FormattedEndpoint) {
    const cfg = `API URL: ${endpoint.url}${endpoint.apiPath}\nAPI KEY: ${endpoint.apiKey}`;

    copyToClipboard(cfg, t("toast.copySuccess"), showManualCopyModal);
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

    copyToClipboard(cmd, t("toast.copyInstallSuccess"), showManualCopyModal);
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
        throw new Error(data.error || t("toast.refreshFailed"));
      }
      addToast({
        title: t("toast.refreshSuccess"),
        description: data.message || t("toast.refreshSuccessDesc"),
        color: "success",
      });
      await fetchEndpoints();
    } catch (err) {
      addToast({
        title: t("toast.refreshFailed"),
        description: err instanceof Error ? err.message : t("toast.refreshFailedDesc"),
        color: "danger",
      });
    }
  };

  return (
    <div className=" space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-4">
          <h1 className="text-2xl font-bold">{t("page.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2 md:mt-0">
          <Button
            startContent={<FontAwesomeIcon icon={faFileDownload} />}
            variant="flat"
            onPress={handleExportData}
          >
            {t("actions.export")}
          </Button>
          <Button
            startContent={<FontAwesomeIcon icon={faFileImport} />}
            variant="flat"
            onPress={onImportOpen}
          >
            {t("actions.import")}
          </Button>
          <Button
            startContent={<FontAwesomeIcon icon={faCopy} />}
            variant="flat"
            onPress={handleCopyInstallScript}
          >
            {t("actions.copyInstall")}
          </Button>
          <Button
            startContent={<FontAwesomeIcon icon={faRotateRight} />}
            variant="flat"
            onPress={async () => {
              await fetchEndpoints();
            }}
          >
            {t("actions.refresh")}
          </Button>
          <Tabs
            aria-label={t("table.layoutSwitch")}
            className="w-auto"
            selectedKey={viewMode}
            onSelectionChange={(key) => setViewMode(key as "card" | "table")}
          >
            <Tab
              key="card"
              title={
                <Tooltip content={t("page.cardView")}>
                  <div>
                    <FontAwesomeIcon icon={faGrip} />
                  </div>
                </Tooltip>
              }
            />
            <Tab
              key="table"
              title={
                <Tooltip content={t("page.tableView")}>
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
                      ? t("status.online")
                      : realTimeData.status === "FAIL"
                        ? t("status.fail")
                        : realTimeData.status === "DISCONNECT"
                          ? t("status.disconnect")
                          : t("status.offline")}
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
                    {t("actions.addApi")}
                  </h3>
                  <p className="text-small text-default-500">
                    {t("actions.addDesc")}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : (
        /* 表格布局 */
        <Table
          aria-label={t("table.tableTitle")}
          className="mt-4"
          sortDescriptor={sortDescriptor ?? undefined}
          onSortChange={(descriptor) => {
            if (descriptor.column) {
              setSortDescriptor({
                column: String(descriptor.column),
                direction: descriptor.direction ?? "ascending",
              });
            }
          }}
        >
          <TableHeader>
            <TableColumn key="id">{t("table.columns.id")}</TableColumn>
            <TableColumn allowsSorting key="name" className="min-w-[140px]">
              {t("table.columns.name")}
            </TableColumn>
            <TableColumn key="version" className="w-24">
              {t("table.columns.version")}
            </TableColumn>
            <TableColumn allowsSorting key="url" className="min-w-[200px]">
              {t("table.columns.url")}
            </TableColumn>
            <TableColumn key="apikey" className="min-w-[220px]">
              {t("table.columns.apiKey")}
            </TableColumn>
            <TableColumn key="actions" className="w-52">
              {t("table.columns.actions")}
            </TableColumn>
          </TableHeader>
          <TableBody>
            {endpoints.length === 0 ? (
              <>
                <TableRow>
                  <TableCell className="text-center py-4" colSpan={6}>
                    {t("page.noData")}
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
                      {t("actions.addApi")}
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
                                ? t("status.online")
                                : realTimeData.status === "FAIL"
                                  ? t("status.fail")
                                  : realTimeData.status === "DISCONNECT"
                                    ? t("status.disconnect")
                                    : t("status.offline")
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
                            {t("table.instancesBracket", { count: realTimeData.tunnelCount })}
                          </span>
                          <Tooltip content={t("table.editName")} size="sm">
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
                          <Tooltip content={t("actions.viewDetails")}>
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
                          {/* <Tooltip content={t("actions.addTunnel")}>
                          <Button isIconOnly size="sm" variant="light" color="primary" onPress={()=>handleAddTunnel(ep)}>
                            <FontAwesomeIcon icon={faPlus} />
                          </Button>
                        </Tooltip> */}
                          {/* 刷新实例 */}
                          <Tooltip content={t("actions.syncTunnel")}>
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
                          <Tooltip content={t("actions.editApiKey")}>
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
                          <Tooltip content={t("actions.copyConfig")}>
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
                                ? t("actions.disconnect")
                                : t("actions.connect")
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
                          <Tooltip content={t("actions.deleteMaster")}>
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
                      {t("actions.addApi")}
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
              <ModalHeader>{t("addTunnelModal.title")}</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Input
                    placeholder={t("addTunnelModal.name")}
                    value={tunnelName}
                    onValueChange={setTunnelName}
                  />
                  <Input
                    placeholder={t("addTunnelModal.urlPlaceholder")}
                    value={tunnelUrl}
                    onValueChange={setTunnelUrl}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {t("addTunnelModal.cancel")}
                </Button>
                <Button color="primary" onPress={handleSubmitAddTunnel}>
                  {t("addTunnelModal.confirm")}
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
                  {t("deleteModal.title")}
                </div>
              </ModalHeader>
              <ModalBody>
                {deleteModalEndpoint && (
                  <>
                    <p className="text-default-600">
                      {t("deleteModal.message")}{" "}
                      <span className="font-semibold text-foreground">
                        "{deleteModalEndpoint.name}"
                      </span>{" "}
                      {t("deleteModal.messageEnd")}
                    </p>
                    <p className="text-small text-warning">
                      {t("deleteModal.warning")}
                    </p>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  {t("deleteModal.cancel")}
                </Button>
                <Button
                  color="danger"
                  startContent={<FontAwesomeIcon icon={faTrash} />}
                  onPress={() => {
                    handleDeleteEndpoint();
                    onClose();
                  }}
                >
                  {t("deleteModal.confirm")}
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
                  {t("importModal.title")}
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
                      {t("importModal.selectFile")}
                    </Button>
                    <span className="text-small text-default-500">
                      {selectedFile ? selectedFile.name : t("importModal.noFile")}
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
                    <p>{t("importModal.helpText1")}</p>
                    <p>{t("importModal.helpText2")}</p>
                    <p>{t("importModal.helpText3")}</p>
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
                  {t("importModal.cancel")}
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
                  {isSubmitting ? t("importModal.checking") : t("importModal.start")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 导入验证结果模态窗 */}
      <Modal
        backdrop="blur"
        classNames={{
          backdrop:
            "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
        }}
        isOpen={isImportValidateOpen}
        placement="center"
        size="3xl"
        onOpenChange={onImportValidateOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-primary"
                    icon="solar:check-circle-bold"
                    width={24}
                  />
                  {t("importModal.validateTitle")}
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <p className="text-small text-default-500">
                    {t("importModal.validateDesc", { count: importValidateResults.length })}
                  </p>
                  <div className="max-h-[400px] overflow-y-auto">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <table className="w-full">
                        <thead className="sticky top-0 bg-default-100 z-10">
                          <tr>
                            <th className="text-left px-3 py-2 text-small font-semibold">
                              {t("importModal.validateColumns.name")}
                            </th>
                            <th className="text-left px-3 py-2 text-small font-semibold">
                              {t("importModal.validateColumns.url")}
                            </th>
                            <th className="text-left px-3 py-2 text-small font-semibold">
                              {t("importModal.validateColumns.version")}
                            </th>
                            <th className="text-left px-3 py-2 text-small font-semibold">
                              {t("importModal.validateColumns.status")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <SortableContext
                            items={sortedValidateResults.map((_, idx) => `item-${idx}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {sortedValidateResults.map((result, index) => (
                              <SortableTableRow
                                key={`item-${index}`}
                                id={`item-${index}`}
                                result={result}
                                index={index}
                                t={t}
                              />
                            ))}
                          </SortableContext>
                        </tbody>
                      </table>
                    </DndContext>
                  </div>
                  <div className="rounded-lg bg-default-100 p-3">
                    <p className="text-xs text-default-600">
                      {t("importModal.validateNote")}
                    </p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={() => {
                    onClose();
                    setImportValidateResults([]);
                    setSortedValidateResults([]);
                    setImportFileData(null);
                  }}
                >
                  {t("importModal.cancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-linear" width={18} />
                    ) : null
                  }
                  onPress={handleConfirmImport}
                >
                  {isSubmitting ? t("importModal.importing") : t("importModal.confirmImport")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
