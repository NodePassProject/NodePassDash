import {
  Button,
  Card,
  CardBody,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Spinner,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  useDisclosure,
  Input,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  ButtonGroup,
  Select,
  SelectItem,
  Code,
  Tooltip,
  SortDescriptor,
  Divider,
} from "@heroui/react";
import { Selection } from "@react-types/shared";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEye,
  faEllipsisV,
  faPlay,
  faStop,
  faTrash,
  faRotateRight,
  faPen,
  faPlus,
  faLayerGroup,
  faCopy,
  faHammer,
  faSearch,
  faChevronDown,
  faDownload,
  faQuestionCircle,
  faTag,
  faTimes,
  faExchangeAlt,
  faArrowRight,
  faShield,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { buildApiUrl } from "@/lib/utils";
import { copyToClipboard } from "@/lib/utils/clipboard";
import ManualCopyModal from "@/components/ui/manual-copy-modal";
import SimpleCreateTunnelModal from "@/components/tunnels/simple-create-tunnel-modal";
import BatchCreateModal from "@/components/tunnels/batch-create-modal";
import BatchUrlCreateTunnelModal from "@/components/tunnels/batch-url-create-tunnel-modal";
import GroupManagementModal from "@/components/tunnels/group-management-modal";
import SimpleGroupModal from "@/components/tunnels/simple-group-modal";
import ScenarioCreateModal, {
  ScenarioType,
} from "@/components/tunnels/scenario-create-modal";
import RenameTunnelModal from "@/components/tunnels/rename-tunnel-modal";
import { useSettings } from "@/components/providers/settings-provider";
import { useIsMobile } from "@/lib/hooks/use-media-query";

// 定义分组类型
interface Group {
  id: number;
  name: string;
}

// 定义实例类型
interface Tunnel {
  id: string;
  instanceId?: string;
  type: "server" | "client"; // 统一使用英文类型
  name: string;
  endpoint: string;
  endpointId: string;
  version?: string; // 主控版本信息
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
  status: {
    type: "success" | "danger" | "warning";
    text: string;
  };
  avatar: string;
  // 客户端模式的连接池配置
  min?: number;
  max?: number;
  // 新增字段
  mode: "0"; // 服务端/客户端模式：服务端默认0，客户端默认1
  read: ""; // 数据读取超时
  rate: ""; // 速率限制
  // 流量统计信息
  traffic?: {
    tcpRx: number;
    tcpTx: number;
    udpRx: number;
    udpTx: number;
  };
  // 分组信息
  group?: Group;
}

interface Endpoint {
  id: string;
  name: string;
}

export default function TunnelsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchInput, setSearchInput] = useState(""); // 搜索输入框的即时状态
  const [filterValue, setFilterValue] = useState(""); // 实际用于API调用的搜索值
  const [statusFilter, setStatusFilter] = useState("all");
  const [endpointFilter, setEndpointFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    // 从 localStorage 读取保存的每页显示数量，默认为 10
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tunnels-rows-per-page");

      return saved ? parseInt(saved, 10) : 10;
    }

    return 10;
  });
  const [page, setPage] = useState(1);
  const [deleteModalTunnel, setDeleteModalTunnel] = useState<Tunnel | null>(
    null,
  );
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // 重命名模态框状态
  const [renameModalTunnel, setRenameModalTunnel] = useState<Tunnel | null>(
    null,
  );
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);

  // 导出配置模态框状态
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportConfig, setExportConfig] = useState("");

  // 使用全局设置Hook
  const { settings } = useSettings();

  // 使用共用的实例操作 hook
  const { toggleStatus, restart, deleteTunnel } = useTunnelActions();

  // 实例数据状态，支持动态更新
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);

  // 是否移入回收站
  const [moveToRecycle, setMoveToRecycle] = useState(false);

  // 分页信息
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // 编辑模态控制
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTunnel, setEditTunnel] = useState<Tunnel | null>(null);

  // 批量创建模态控制
  const [batchCreateOpen, setBatchCreateOpen] = useState(false);

  // 快建实例模态控制
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  // 手搓创建模态控制
  const [manualCreateOpen, setManualCreateOpen] = useState(false);

  // 批量删除确认模态控制
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchMoveToRecycle, setBatchMoveToRecycle] = useState(false);

  // 表格多选
  const [selectedKeys, setSelectedKeys] = useState<Selection>(
    new Set<string>(),
  );

  // 排序状态
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: undefined,
    direction: "ascending",
  } as unknown as SortDescriptor);

  // 排序处理函数
  const handleSortChange = (descriptor: SortDescriptor) => {
    console.log("排序变化:", descriptor);
    setSortDescriptor(descriptor);
  };

  // 获取实例列表
  const fetchTunnels = useCallback(async () => {
    try {
      setLoading(true);

      // 构建查询参数
      const params = new URLSearchParams();

      // 筛选参数
      if (filterValue) {
        params.append("search", filterValue);
      }
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (endpointFilter && endpointFilter !== "all") {
        params.append("endpoint_id", endpointFilter);
      }
      if (groupFilter && groupFilter !== "all") {
        params.append("group_id", groupFilter);
      }

      // 分页参数
      params.append("page", page.toString());
      params.append("page_size", rowsPerPage.toString());

      // 排序参数
      if (sortDescriptor.column) {
        console.log("发送排序参数:", {
          column: sortDescriptor.column,
          direction: sortDescriptor.direction,
        });
        params.append("sort_by", String(sortDescriptor.column));
        params.append(
          "sort_order",
          sortDescriptor.direction === "ascending" ? "asc" : "desc",
        );
      }

      const response = await fetch(
        buildApiUrl("/api/tunnels") + "?" + params.toString(),
      );

      if (!response.ok) throw new Error("获取实例列表失败");
      const result = await response.json();

      // 更新数据和分页信息
      setTunnels(result.data || []);
      setTotalItems(result.total || 0);
      setTotalPages(result.total_pages || 1);

      // 如果总页数发生变化，可能需要调整当前页
      if (page > (result.total_pages || 1) && (result.total_pages || 1) > 0) {
        setPage(result.total_pages || 1);
      }
    } catch (error) {
      console.error("获取实例列表失败:", error);
      addToast({
        title: "错误",
        description:
          error instanceof Error ? error.message : "获取实例列表失败",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  }, [
    filterValue,
    statusFilter,
    endpointFilter,
    groupFilter,
    page,
    rowsPerPage,
    sortDescriptor,
  ]); // 恢复依赖项，但使用正确的useEffect模式

  // 获取主控列表
  const fetchEndpoints = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/endpoints/simple"));

      if (!response.ok) throw new Error("获取主控列表失败");
      const data = await response.json();

      setEndpoints(data);
    } catch (error) {
      console.error("获取主控列表失败:", error);
      addToast({
        title: "错误",
        description: "获取主控列表失败",
        color: "danger",
      });
    } finally {
    }
  }, []);

  // 获取分组列表
  const fetchGroups = useCallback(async () => {
    try {
      setGroupsLoading(true);
      const response = await fetch(buildApiUrl("/api/groups"));

      if (!response.ok) throw new Error("获取分组列表失败");
      const data = await response.json();

      setGroups(data.groups || []);
    } catch (error) {
      console.error("获取分组列表失败:", error);
      addToast({
        title: "错误",
        description: "获取分组列表失败",
        color: "danger",
      });
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  // 状态选项 - 使用useMemo缓存
  const statusOptions = useMemo(
    () => [
      { label: "所有状态", value: "all" },
      { label: "运行中", value: "running" },
      { label: "已停止", value: "stopped" },
      { label: "有错误", value: "error" },
      { label: "已离线", value: "offline" },
    ],
    [],
  );

  // 获取选中主控名称 - 使用useMemo缓存
  const selectedEndpointName = useMemo(() => {
    if (endpointFilter === "all") return "所有主控";
    const endpoint = endpoints.find(
      (ep) => String(ep.id) === String(endpointFilter),
    );

    return endpoint ? endpoint.name : "所有主控";
  }, [endpointFilter, endpoints]);

  // 处理实例操作
  const handleTunnelAction = async (tunnelId: string, action: string) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/action`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        },
      );

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "操作失败");
      }

      // 刷新实例列表
      await fetchTunnels();

      addToast({
        title: "成功",
        description: "操作成功",
        color: "success",
      });
    } catch (error) {
      console.error("实例操作失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "操作失败",
        color: "danger",
      });
    }
  };

  // 处理删除实例
  const handleDelete = async (tunnelId: string) => {
    try {
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}`), {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();

        throw new Error(error.message || "删除失败");
      }

      // 刷新实例列表
      await fetchTunnels();

      addToast({
        title: "成功",
        description: "删除成功",
        color: "success",
      });
    } catch (error) {
      console.error("删除实例失败:", error);
      addToast({
        title: "错误",
        description: error instanceof Error ? error.message : "删除失败",
        color: "danger",
      });
    }
  };

  // 计算已选中数量（支持全选）- 使用useMemo缓存
  const selectedCount = useMemo(() => {
    if (selectedKeys === "all") return tunnels.length;
    if (selectedKeys instanceof Set) return selectedKeys.size;

    return 0;
  }, [selectedKeys, tunnels.length]);

  // 显示批量删除确认弹窗
  const showBatchDeleteModal = () => {
    setBatchDeleteModalOpen(true);
  };

  // 执行批量删除
  const executeBatchDelete = async () => {
    if (
      !selectedKeys ||
      (selectedKeys instanceof Set && selectedKeys.size === 0)
    )
      return;

    // 计算待删除的 ID 列表
    let ids: number[] = [];

    if (selectedKeys === "all") {
      ids = filteredItems.map((t) => Number(t.id));
    } else {
      ids = Array.from(selectedKeys as Set<string>).map((id) => Number(id));
    }

    setBatchDeleteModalOpen(false);

    // 使用 promise 形式的 Toast
    addToast({
      timeout: 1,
      title: "批量删除中...",
      description: "正在删除所选实例，请稍候",
      color: "primary",
      promise: fetch(buildApiUrl("/api/tunnels/batch"), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids,
          recycle: batchMoveToRecycle,
        }),
      })
        .then(async (response) => {
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data?.error || "批量删除失败");
          }

          // 成功提示
          addToast({
            title: "批量删除成功",
            description: `已删除 ${data.deleted || ids.length} 个实例`,
            color: "success",
          });

          // 清空选择并刷新
          setSelectedKeys(new Set<string>());
          setBatchMoveToRecycle(false);
          fetchTunnels();

          return data;
        })
        .catch((error) => {
          // 失败提示
          addToast({
            title: "批量删除失败",
            description: error instanceof Error ? error.message : "未知错误",
            color: "danger",
          });
          throw error;
        }),
    });
  };

  // 执行批量启动
  const executeBatchStart = async () => {
    if (
      !selectedKeys ||
      (selectedKeys instanceof Set && selectedKeys.size === 0)
    ) {
      addToast({
        title: "批量启动失败",
        description: "请先选择需要启动的实例",
        color: "warning",
      });

      return;
    }

    // 计算待启动的实例列表
    let selectedTunnels: Tunnel[] = [];

    if (selectedKeys === "all") {
      selectedTunnels = filteredItems;
    } else {
      selectedTunnels = filteredItems.filter((tunnel) =>
        (selectedKeys as Set<string>).has(String(tunnel.id)),
      );
    }

    // 过滤出已停止的实例
    const stoppedTunnels = selectedTunnels.filter(
      (tunnel) => tunnel.status.type !== "success",
    );

    if (stoppedTunnels.length === 0) {
      addToast({
        title: "批量启动失败",
        description: "所选实例中没有可启动的实例（已停止状态）",
        color: "warning",
      });

      return;
    }

    // 显示进行中toast
    addToast({
      title: "批量启动中...",
      description: `正在启动 ${stoppedTunnels.length} 个实例，请稍候`,
      color: "primary",
    });

    try {
      const response = await fetch(buildApiUrl("/api/tunnels/batch/action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: stoppedTunnels.map((t) => Number(t.id)),
          action: "start",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "批量启动失败");
      }

      const succeeded = data.operated || 0;
      const failed = data.failCount || 0;

      // 显示结果toast
      addToast({
        title: "批量启动完成",
        description: `成功启动 ${succeeded} 个实例${failed > 0 ? `，${failed} 个失败` : ""}`,
        color: failed === 0 ? "success" : "warning",
      });

      if (failed > 0 && data.results) {
        const failedTunnels = data.results.filter((r: any) => !r.success);

        console.error(
          "启动失败的实例:",
          failedTunnels.map((f: any) => `${f.name}: ${f.error}`),
        );
      }

      // 刷新实例列表
      await fetchTunnels();
    } catch (error) {
      addToast({
        title: "批量启动失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 执行批量停止
  const executeBatchStop = async () => {
    if (
      !selectedKeys ||
      (selectedKeys instanceof Set && selectedKeys.size === 0)
    ) {
      addToast({
        title: "批量停止失败",
        description: "请先选择需要停止的实例",
        color: "warning",
      });

      return;
    }

    // 计算待停止的实例列表
    let selectedTunnels: Tunnel[] = [];

    if (selectedKeys === "all") {
      selectedTunnels = filteredItems;
    } else {
      selectedTunnels = filteredItems.filter((tunnel) =>
        (selectedKeys as Set<string>).has(String(tunnel.id)),
      );
    }

    // 过滤出运行中的实例
    const runningTunnels = selectedTunnels.filter(
      (tunnel) => tunnel.status.type === "success",
    );

    if (runningTunnels.length === 0) {
      addToast({
        title: "批量停止失败",
        description: "所选实例中没有可停止的实例（运行中状态）",
        color: "warning",
      });

      return;
    }

    // 显示进行中toast
    addToast({
      title: "批量停止中...",
      description: `正在停止 ${runningTunnels.length} 个实例，请稍候`,
      color: "primary",
    });

    try {
      const response = await fetch(buildApiUrl("/api/tunnels/batch/action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: runningTunnels.map((t) => Number(t.id)),
          action: "stop",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "批量停止失败");
      }

      const succeeded = data.operated || 0;
      const failed = data.failCount || 0;

      // 显示结果toast
      addToast({
        title: "批量停止完成",
        description: `成功停止 ${succeeded} 个实例${failed > 0 ? `，${failed} 个失败` : ""}`,
        color: failed === 0 ? "success" : "warning",
      });

      if (failed > 0 && data.results) {
        const failedTunnels = data.results.filter((r: any) => !r.success);

        console.error(
          "停止失败的实例:",
          failedTunnels.map((f: any) => `${f.name}: ${f.error}`),
        );
      }

      // 刷新实例列表
      await fetchTunnels();
    } catch (error) {
      addToast({
        title: "批量停止失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 执行批量重启
  const executeBatchRestart = async () => {
    if (
      !selectedKeys ||
      (selectedKeys instanceof Set && selectedKeys.size === 0)
    ) {
      addToast({
        title: "批量重启失败",
        description: "请先选择需要重启的实例",
        color: "warning",
      });

      return;
    }

    // 计算待重启的实例列表
    let selectedTunnels: Tunnel[] = [];

    if (selectedKeys === "all") {
      selectedTunnels = filteredItems;
    } else {
      selectedTunnels = filteredItems.filter((tunnel) =>
        (selectedKeys as Set<string>).has(String(tunnel.id)),
      );
    }

    // 过滤出运行中的实例（只有运行中的实例才能重启）
    const runningTunnels = selectedTunnels.filter(
      (tunnel) => tunnel.status.type === "success",
    );

    if (runningTunnels.length === 0) {
      addToast({
        title: "批量重启失败",
        description: "所选实例中没有可重启的实例（运行中状态）",
        color: "warning",
      });

      return;
    }

    // 显示进行中toast
    addToast({
      title: "批量重启中...",
      description: `正在重启 ${runningTunnels.length} 个实例，请稍候`,
      color: "primary",
    });

    try {
      const response = await fetch(buildApiUrl("/api/tunnels/batch/action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: runningTunnels.map((t) => Number(t.id)),
          action: "restart",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "批量重启失败");
      }

      const succeeded = data.operated || 0;
      const failed = data.failCount || 0;

      // 显示结果toast
      addToast({
        title: "批量重启完成",
        description: `成功重启 ${succeeded} 个实例${failed > 0 ? `，${failed} 个失败` : ""}`,
        color: failed === 0 ? "success" : "warning",
      });

      if (failed > 0 && data.results) {
        const failedTunnels = data.results.filter((r: any) => !r.success);

        console.error(
          "重启失败的实例:",
          failedTunnels.map((f: any) => `${f.name}: ${f.error}`),
        );
      }

      // 刷新实例列表
      await fetchTunnels();
    } catch (error) {
      addToast({
        title: "批量重启失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 导出配置功能
  const handleExportConfig = () => {
    if (
      !selectedKeys ||
      (selectedKeys instanceof Set && selectedKeys.size === 0)
    )
      return;

    // 计算要导出的隧道
    let selectedTunnels: Tunnel[] = [];

    if (selectedKeys === "all") {
      selectedTunnels = filteredItems;
    } else {
      // 确保字符串匹配，因为 selectedKeys 是字符串类型
      selectedTunnels = filteredItems.filter((tunnel) =>
        (selectedKeys as Set<string>).has(String(tunnel.id)),
      );
    }

    // 转换为导出格式
    const exportData = selectedTunnels.map((tunnel) => ({
      dest: `${tunnel.targetAddress}:${tunnel.targetPort}`,
      listen_port: parseInt(tunnel.tunnelPort),
      name: tunnel.name,
    }));

    // 格式化为您期望的样式，每个对象平铺一行
    const flattenedConfig =
      "[\n" +
      exportData.map((item) => `  ${JSON.stringify(item)}`).join(",\n") +
      "\n]";

    setExportConfig(flattenedConfig);
    setExportModalOpen(true);
  };

  // 手动复制模态框状态
  const [manualCopyText, setManualCopyText] = useState<string>("");
  const [isManualCopyOpen, setIsManualCopyOpen] = useState(false);

  // 分组管理模态框状态
  const [groupManagementModalOpen, setGroupManagementModalOpen] =
    useState(false);

  // 简化分组设置模态框状态
  const [simpleGroupModalOpen, setSimpleGroupModalOpen] = useState(false);
  const [currentTunnelForGroup, setCurrentTunnelForGroup] =
    useState<Tunnel | null>(null);

  // 场景创建模态框状态
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [selectedScenarioType, setSelectedScenarioType] = useState<
    ScenarioType | undefined
  >();

  const showManualCopyModal = (text: string) => {
    setManualCopyText(text);
    setIsManualCopyOpen(true);
  };

  // 复制配置到剪贴板
  const copyExportConfig = async () => {
    copyToClipboard(exportConfig, "配置已复制到剪贴板", showManualCopyModal);
  };

  // 格式化地址显示（处理脱敏逻辑）
  const formatAddress = (address: string, port: string) => {
    // 如果隐私模式关闭，显示完整地址
    if (!settings.isPrivacyMode) {
      return `${address}:${port}`;
    }

    // 如果地址是 127.0.0.1 或为空，保持原样显示
    if (address === "127.0.0.1" || address === "" || !address) {
      return `${address}:${port}`;
    }

    // 隐私模式开启时显示脱敏地址
    return `**.**.**.**:${port}`;
  };

  // 格式化流量显示
  const formatTraffic = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // 类型显示转换函数
  const getTypeDisplayText = (type: "server" | "client"): string => {
    return type === "server" ? "服务端" : "客户端";
  };

  // 格式化流量信息组件
  const TrafficInfo = ({ traffic }: { traffic?: Tunnel["traffic"] }) => {
    if (!traffic) {
      return (
        <div className="text-xs text-default-400 text-left">
          <div>↑ -</div>
          <div>↓ -</div>
        </div>
      );
    }

    // 合并 TCP 和 UDP 流量
    const totalRx = traffic.tcpRx + traffic.udpRx;
    const totalTx = traffic.tcpTx + traffic.udpTx;

    return (
      <div className="text-xs text-left">
        <div className="text-default-600">
          <span className="text-warning-600">↑ {formatTraffic(totalTx)}</span>
        </div>
        <div className="text-default-600">
          <span className="text-success-600">↓ {formatTraffic(totalRx)}</span>
        </div>
      </div>
    );
  };

  // 移动端卡片组件
  const MobileTunnelCard = ({ tunnel }: { tunnel: Tunnel }) => (
    <Card key={tunnel.id} className="w-full">
      <CardBody className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold truncate">{tunnel.name}</h3>
              <Chip
                className="text-xs"
                color={tunnel.type === "server" ? "primary" : "secondary"}
                size="sm"
                variant="flat"
              >
                {getTypeDisplayText(tunnel.type)}
              </Chip>
            </div>
            <div className="space-y-1 text-xs text-default-600">
              <div className="flex items-center gap-1">
                <span>主控:</span>
                <Tooltip
                  content={
                    <div className="text-xs">
                      <div className="font-medium">{tunnel.endpoint}</div>
                      {tunnel.version && (
                        <div className="text-default-400">
                          版本: {tunnel.version}
                        </div>
                      )}
                    </div>
                  }
                  placement="top"
                  size="sm"
                >
                  <span className="cursor-help hover:text-default-800">
                    {tunnel.endpoint}
                  </span>
                </Tooltip>
              </div>
              <div>
                隧道: {formatAddress(tunnel.tunnelAddress, tunnel.tunnelPort)}
              </div>
              <div>
                目标: {formatAddress(tunnel.targetAddress, tunnel.targetPort)}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Chip
              className="text-xs"
              color={tunnel.status.type}
              size="sm"
              variant="flat"
            >
              {tunnel.status.text}
            </Chip>
            {tunnel.group && (
              <Chip
                className="text-xs cursor-pointer"
                color="primary"
                size="sm"
                variant="flat"
                onClick={() => handleGroupClick(tunnel)}
              >
                {tunnel.group.name}
              </Chip>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex-1">
            <TrafficInfo traffic={tunnel.traffic} />
          </div>
          <div className="flex gap-1">
            <Button
              isIconOnly
              color="primary"
              size="sm"
              variant="light"
              onClick={() => navigate(`/tunnels/details?id=${tunnel.id}`)}
            >
              <FontAwesomeIcon className="text-xs" icon={faEye} />
            </Button>
            <Button
              isIconOnly
              color={tunnel.status.type === "success" ? "warning" : "success"}
              size="sm"
              variant="light"
              onClick={() => handleToggleStatus(tunnel)}
            >
              <FontAwesomeIcon
                className="text-xs"
                icon={tunnel.status.type === "success" ? faStop : faPlay}
              />
            </Button>
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button isIconOnly size="sm" variant="light">
                  <FontAwesomeIcon className="text-xs" icon={faEllipsisV} />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="操作选项">
                <DropdownItem
                  key="restart"
                  isDisabled={tunnel.status.type !== "success"}
                  startContent={<FontAwesomeIcon icon={faRotateRight} />}
                  onClick={() => handleRestart(tunnel)}
                >
                  重启
                </DropdownItem>
                <DropdownItem
                  key="edit"
                  startContent={<FontAwesomeIcon icon={faPen} />}
                  onClick={() => {
                    setEditTunnel(tunnel);
                    setEditModalOpen(true);
                  }}
                >
                  编辑
                </DropdownItem>
                <DropdownItem
                  key="rename"
                  startContent={<FontAwesomeIcon icon={faPen} />}
                  onClick={() => handleEditClick(tunnel)}
                >
                  重命名
                </DropdownItem>
                <DropdownItem
                  key="group"
                  startContent={<FontAwesomeIcon icon={faTag} />}
                  onClick={() => handleGroupClick(tunnel)}
                >
                  设置分组
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={<FontAwesomeIcon icon={faTrash} />}
                  onClick={() => handleDeleteClick(tunnel)}
                >
                  删除
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </CardBody>
    </Card>
  );

  // 初始加载 - 只在组件挂载时执行一次
  React.useEffect(() => {
    fetchEndpoints();
    fetchGroups();
  }, []); // 空依赖数组，只在组件挂载时执行一次

  // 搜索防抖处理
  React.useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setFilterValue(searchInput);
    }, 500); // 500ms 防抖延迟

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [searchInput]);

  // 监听过滤参数变化，重新获取数据（包括初始加载）
  React.useEffect(() => {
    fetchTunnels();
  }, [fetchTunnels]); // 只依赖fetchTunnels，当其依赖项变化时会自动触发

  // 表格列定义 - 使用useMemo缓存
  const columns = useMemo(
    () => [
      { key: "type", label: "类型", sortable: false },
      { key: "name", label: "名称", sortable: true },
      { key: "endpoint", label: "主控", sortable: false },
      {
        key: "tunnelAddress",
        label: "隧道地址",
        sortable: false,
      },
      {
        key: "targetAddress",
        label: "目标地址",
        sortable: false,
      },
      { key: "status", label: "状态", sortable: false },
      {
        key: "traffic",
        label: (
          <div className="flex items-center gap-1">
            <span>流量统计</span>
            <Tooltip
              content={
                <div className="text-xs">
                  <div>第一行：↑ 总上传流量 (TCP+UDP)</div>
                  <div>第二行：↓ 总下载流量 (TCP+UDP)</div>
                </div>
              }
              size="sm"
            >
              <FontAwesomeIcon
                className="text-xs text-default-400 hover:text-default-600 cursor-help"
                icon={faQuestionCircle}
              />
            </Tooltip>
          </div>
        ),
        sortable: false,
      },
      { key: "actions", label: "操作", sortable: false },
    ],
    [],
  );

  // 更新实例状态的函数
  const handleStatusChange = (tunnelId: string, isRunning: boolean) => {
    setTunnels((prev) =>
      prev.map((tunnel) =>
        tunnel.id === tunnelId
          ? {
              ...tunnel,
              status: {
                type: isRunning ? ("success" as const) : ("danger" as const),
                text: isRunning ? "运行中" : "已停止",
              },
            }
          : tunnel,
      ),
    );
  };

  // 删除实例的函数
  const handleDeleteTunnel = (tunnelId: string) => {
    setTunnels((prev) => prev.filter((tunnel) => tunnel.id !== tunnelId));
  };

  // 操作按钮处理函数
  const handleToggleStatus = (tunnel: any) => {
    if (!tunnel.instanceId) {
      alert("此实例缺少NodePass ID，无法执行操作");

      return;
    }
    const isRunning = tunnel.status.type === "success";

    toggleStatus(isRunning, {
      instanceId: tunnel.instanceId,
      tunnelId: tunnel.id,
      tunnelName: tunnel.name,
      onStatusChange: (tunnelId, newStatus) => {
        handleStatusChange(tunnelId, newStatus);
        fetchTunnels();
      },
    });
  };

  const handleRestart = (tunnel: any) => {
    if (!tunnel.instanceId) {
      alert("此实例缺少NodePass ID，无法执行操作");

      return;
    }
    restart({
      instanceId: tunnel.instanceId,
      tunnelId: tunnel.id,
      tunnelName: tunnel.name,
      onStatusChange: (tunnelId, newStatus) => {
        handleStatusChange(tunnelId, newStatus);
        fetchTunnels();
      },
    });
  };

  const handleDeleteClick = (tunnel: Tunnel) => {
    setDeleteModalTunnel(tunnel);
    onOpen();
  };

  const confirmDelete = () => {
    if (deleteModalTunnel) {
      deleteTunnel({
        tunnelId: deleteModalTunnel.id,
        instanceId: deleteModalTunnel.instanceId || "",
        tunnelName: deleteModalTunnel.name,
        redirectAfterDelete: false,
        recycle: moveToRecycle,
        onSuccess: () => {
          fetchTunnels();
        },
      });
    }
    onOpenChange();
    setMoveToRecycle(false);
  };

  // 重命名处理函数
  const handleEditClick = (tunnel: Tunnel) => {
    setRenameModalTunnel(tunnel);
    setIsRenameModalOpen(true);
  };

  // 重命名成功回调
  const handleRenameSuccess = (newName: string) => {
    if (renameModalTunnel) {
      // 更新本地状态
      setTunnels((prev) =>
        prev.map((tunnel) =>
          tunnel.id === renameModalTunnel.id
            ? { ...tunnel, name: newName }
            : tunnel,
        ),
      );
    }
  };

  // 处理分组管理
  const handleGroupManagement = () => {
    setGroupManagementModalOpen(true);
  };

  // 处理简化分组设置
  const handleGroupClick = (tunnel: Tunnel) => {
    setCurrentTunnelForGroup(tunnel);
    setSimpleGroupModalOpen(true);
  };

  const handleGroupSaved = useCallback(() => {
    fetchTunnels();
    fetchGroups();
  }, [fetchTunnels, fetchGroups]);

  // 由于筛选和排序已移到后端，这里直接返回隧道列表 - 使用useMemo缓存
  const filteredItems = useMemo(() => {
    return tunnels;
  }, [tunnels]);

  // 分页和表格数据 - 使用useMemo缓存
  const pages = useMemo(() => totalPages, [totalPages]);
  const items = useMemo(() => filteredItems, [filteredItems]); // 后端已经处理了分页，直接使用返回的数据

  const onSearchChange = React.useCallback((value?: string) => {
    if (value) {
      setSearchInput(value);
      setPage(1);
    } else {
      setSearchInput("");
    }
  }, []);

  const onClear = React.useCallback(() => {
    setSearchInput("");
    setFilterValue(""); // 立即清空搜索结果
    setPage(1);
  }, []);

  const onStatusFilterChange = React.useCallback((status: string) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const onEndpointFilterChange = React.useCallback((endpointId: string) => {
    setEndpointFilter(endpointId);
    setPage(1);
  }, []);

  const onGroupFilterChange = React.useCallback((groupId: string) => {
    setGroupFilter(groupId);
    setPage(1);
  }, []);

  // 处理批量操作
  const handleBulkAction = (action: string) => {
    switch (action) {
      case "start":
        executeBatchStart();
        break;
      case "stop":
        executeBatchStop();
        break;
      case "restart":
        executeBatchRestart();
        break;
      case "delete":
        showBatchDeleteModal();
        break;
      case "export":
        handleExportConfig();
        break;
      default:
        break;
    }
  };

  // 分组筛选器组件
  const renderGroupFilter = () => {
    if (groups.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-wrap gap-2">
        <Chip
          className="cursor-pointer rounded-md"
          color={groupFilter === "all" ? "primary" : "default"}
          onClick={() => onGroupFilterChange("all")}
        >
          所有
        </Chip>
        {groups.map((group) => (
          <Chip
            key={group.id}
            className="cursor-pointer rounded-md"
            color={groupFilter === String(group.id) ? "primary" : "default"}
            onClick={() => onGroupFilterChange(String(group.id))}
          >
            {group.name}
          </Chip>
        ))}
      </div>
    );
  };

  // 分页器组件
  const renderPagination = () => {
    if (loading || error || totalItems === 0) {
      return null;
    }

    return (
      <div className="w-full">
        <div className="flex justify-center">
          <Pagination
            loop
            showControls
            classNames={{
              cursor: "text-xs md:text-sm",
              item: "text-xs md:text-sm",
            }}
            page={page}
            size="sm"
            total={pages || 1}
            onChange={setPage}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-7xl py-6 mx-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4">
          {/* 移动端布局 */}
          <div className="flex md:hidden items-center justify-between w-full">
            {/* 左侧：标题和数量 */}
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold ">实例管理</h1>
              {!loading && (
                <Chip className="text-sm " size="sm" variant="solid">
                  {totalItems}
                </Chip>
              )}
            </div>

            {/* 右侧：按钮组 */}
            <div className="flex items-center gap-2">
              <Button
                isIconOnly
                size="sm"
                startContent={<FontAwesomeIcon icon={faRotateRight} />}
                variant="flat"
                onClick={fetchTunnels}
              />
              <ButtonGroup size="sm">
                <Button
                  color="primary"
                  startContent={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    if (settings.isBeginnerMode) {
                      navigate("/tunnels/create");
                    } else {
                      setQuickCreateOpen(true);
                    }
                  }}
                >
                  创建
                </Button>
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button isIconOnly color="primary">
                      <FontAwesomeIcon icon={faChevronDown} />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="创建选项"
                    onAction={(key) => {
                      switch (key) {
                        case "manual":
                          setManualCreateOpen(true);
                          break;
                        case "batch":
                          setBatchCreateOpen(true);
                          break;
                        case "template":
                          navigate("/templates/");
                          break;
                        case "group":
                          handleGroupManagement();
                          break;
                      }
                    }}
                  >
                    <DropdownItem
                      key="manual"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faHammer} />
                      }
                    >
                      手搓创建
                    </DropdownItem>
                    <DropdownItem
                      key="batch"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faCopy} />
                      }
                    >
                      批量创建
                    </DropdownItem>
                    {/* <DropdownItem
                      key="template"
                      startContent={
                        <FontAwesomeIcon icon={faLayerGroup} fixedWidth />
                      }
                    >
                      场景创建
                    </DropdownItem> */}
                    <DropdownItem
                      key="group"
                      startContent={<FontAwesomeIcon fixedWidth icon={faTag} />}
                    >
                      分组管理
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </ButtonGroup>
            </div>
          </div>

          {/* 桌面端布局 */}
          <div className="hidden md:flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <span className="text-2xl font-semibold text-foreground">
                实例管理
              </span>
              {!loading && (
                <Chip
                  className="text-xm text-default-500"
                  size="sm"
                  variant="flat"
                >
                  {totalItems}
                </Chip>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* 分组管理按钮 */}
              <Button
                color="warning"
                startContent={<FontAwesomeIcon icon={faTag} />}
                variant="flat"
                onPress={handleGroupManagement}
              >
                分组管理
              </Button>
              {settings.isBeginnerMode && (
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button
                      className="bg-linear-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                      color="secondary"
                      startContent={<FontAwesomeIcon icon={faLayerGroup} />}
                      variant="flat"
                    >
                      场景创建
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="场景创建选项"
                    onAction={(key) => {
                      const scenarioType = key as ScenarioType;

                      setSelectedScenarioType(scenarioType);
                      setScenarioModalOpen(true);
                    }}
                  >
                    <DropdownItem
                      key="nat-penetration"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faShield} />
                      }
                    >
                      NAT穿透
                    </DropdownItem>
                    <DropdownItem
                      key="single-forward"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faArrowRight} />
                      }
                    >
                      单端转发
                    </DropdownItem>
                    <DropdownItem
                      key="tunnel-forward"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faExchangeAlt} />
                      }
                    >
                      隧道转发
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              )}
              {/* 创建按钮组 */}
              <ButtonGroup>
                <Button
                  className="md:text-sm"
                  color="primary"
                  startContent={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => {
                    if (settings.isBeginnerMode) {
                      navigate("/tunnels/create");
                    } else {
                      setQuickCreateOpen(true);
                    }
                  }}
                >
                  创建实例
                </Button>
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button isIconOnly color="primary">
                      <FontAwesomeIcon icon={faChevronDown} />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="创建选项"
                    onAction={(key) => {
                      switch (key) {
                        case "manual":
                          setManualCreateOpen(true);
                          break;
                        case "batch":
                          setBatchCreateOpen(true);
                          break;
                      }
                    }}
                  >
                    <DropdownItem
                      key="manual"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faHammer} />
                      }
                    >
                      手搓创建
                    </DropdownItem>
                    <DropdownItem
                      key="batch"
                      startContent={
                        <FontAwesomeIcon fixedWidth icon={faCopy} />
                      }
                    >
                      批量创建
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </ButtonGroup>
            </div>
          </div>
        </div>

        {/* 工具栏区域 */}
        <div className="mb-4">
          {/* 移动端布局：三个筛选组件并排 */}
          <div className="flex md:hidden gap-2 mb-3">
            {/* 搜索框 */}
            <Input
              className="flex-1 placeholder:text-sm"
              endContent={
                searchInput && (
                  <Button
                    isIconOnly
                    className="text-default-400 hover:text-default-600"
                    size="sm"
                    variant="light"
                    onClick={onClear}
                  >
                    <FontAwesomeIcon className="text-xs" icon={faTimes} />
                  </Button>
                )
              }
              placeholder="搜索实例"
              size="sm"
              startContent={
                <FontAwesomeIcon className="text-default-400" icon={faSearch} />
              }
              value={searchInput}
              onValueChange={onSearchChange}
            />

            {/* 状态筛选 */}
            <Select
              className="w-28"
              classNames={{
                trigger: "text-xs",
                value: "text-xs",
              }}
              placeholder="状态筛选"
              selectedKeys={[statusFilter]}
              size="sm"
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string;

                onStatusFilterChange(value);
              }}
            >
              {statusOptions.map((option) => (
                <SelectItem key={String(option.value)} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </Select>

            {/* 主控筛选 */}
            <Select
              className="w-28"
              classNames={{
                trigger: "text-xs",
                value: "text-xs",
              }}
              placeholder="主控筛选"
              selectedKeys={[endpointFilter]}
              size="sm"
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string;

                onEndpointFilterChange(value);
              }}
            >
              <SelectItem key="all" className="text-xs">
                所有主控
              </SelectItem>
              <>
                {endpoints.map((endpoint) => (
                  <SelectItem key={String(endpoint.id)} className="text-xs">
                    {endpoint.name}
                  </SelectItem>
                ))}
              </>
            </Select>
          </div>

          {/* 桌面端布局 */}
          <div className="hidden md:flex gap-3 items-center justify-between">
            {/* 左侧：搜索和筛选 */}
            <div className="flex gap-3 flex-1 min-w-0">
              {/* 搜索框 */}
              <Input
                className="w-64"
                endContent={
                  searchInput && (
                    <Button
                      isIconOnly
                      className="text-default-400 hover:text-default-600"
                      size="sm"
                      variant="light"
                      onClick={onClear}
                    >
                      <FontAwesomeIcon className="text-xs" icon={faTimes} />
                    </Button>
                  )
                }
                placeholder="搜索实例名称..."
                size="sm"
                startContent={
                  <FontAwesomeIcon
                    className="text-default-400"
                    icon={faSearch}
                  />
                }
                value={searchInput}
                onValueChange={onSearchChange}
              />

              {/* 状态筛选 */}
              <Select
                className="w-36"
                classNames={{
                  trigger: "text-xs",
                  value: "text-xs",
                }}
                placeholder="状态筛选"
                selectedKeys={[statusFilter]}
                size="sm"
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;

                  onStatusFilterChange(value);
                }}
              >
                {statusOptions.map((option) => (
                  <SelectItem key={String(option.value)} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </Select>

              {/* 主控筛选 */}
              <Select
                className="w-36"
                classNames={{
                  trigger: "text-xs",
                  value: "text-xs",
                }}
                placeholder="主控筛选"
                selectedKeys={[endpointFilter]}
                size="sm"
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;

                  onEndpointFilterChange(value);
                }}
              >
                <SelectItem key="all" className="text-xs">
                  所有主控
                </SelectItem>
                <>
                  {endpoints.map((endpoint) => (
                    <SelectItem key={String(endpoint.id)} className="text-xs">
                      {endpoint.name}
                    </SelectItem>
                  ))}
                </>
              </Select>

              {/* 选中状态显示和批量操作 - 桌面端显示 */}
              <div className="flex items-center h-8">
                <Divider className="h-5" orientation="vertical" />
              </div>
              <div className="flex items-center h-8">
                <span className="text-sm text-default-600 whitespace-nowrap">
                  已选择 {selectedCount} 个
                </span>
              </div>
              {selectedCount > 0 && (
                <>
                  <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                      <Button size="sm" variant="flat">
                        批量操作
                        <FontAwesomeIcon icon={faChevronDown} />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="批量操作"
                      onAction={(key) => handleBulkAction(key as string)}
                    >
                      <DropdownItem
                        key="start"
                        className="text-success"
                        startContent={
                          <FontAwesomeIcon fixedWidth icon={faPlay} />
                        }
                      >
                        批量启动
                      </DropdownItem>
                      <DropdownItem
                        key="stop"
                        className="text-warning"
                        startContent={
                          <FontAwesomeIcon fixedWidth icon={faStop} />
                        }
                      >
                        批量停止
                      </DropdownItem>
                      <DropdownItem
                        key="restart"
                        className="text-secondary"
                        startContent={
                          <FontAwesomeIcon fixedWidth icon={faRotateRight} />
                        }
                      >
                        批量重启
                      </DropdownItem>
                      <DropdownItem
                        key="export"
                        className="text-primary"
                        startContent={
                          <FontAwesomeIcon fixedWidth icon={faDownload} />
                        }
                      >
                        批量导出
                      </DropdownItem>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        startContent={
                          <FontAwesomeIcon fixedWidth icon={faTrash} />
                        }
                      >
                        批量删除
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </>
              )}
            </div>

            {/* 右侧：每页显示和刷新按钮 */}
            <div className="flex items-center gap-3">
              {/* 每页显示数量选择器 */}
              <div className="flex items-center gap-2">
                <Select
                  className="w-32"
                  classNames={{
                    trigger: "text-xs",
                    value: "text-xs",
                  }}
                  selectedKeys={[String(rowsPerPage)]}
                  size="sm"
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    const newRowsPerPage = Number(value);

                    setRowsPerPage(newRowsPerPage);
                    setPage(1);
                    // 保存到 localStorage
                    if (typeof window !== "undefined") {
                      localStorage.setItem(
                        "tunnels-rows-per-page",
                        String(newRowsPerPage),
                      );
                    }
                  }}
                >
                  <SelectItem key="10" className="text-xs" textValue="10条/页">
                    10
                  </SelectItem>
                  <SelectItem key="20" className="text-xs" textValue="20条/页">
                    20
                  </SelectItem>
                  <SelectItem key="50" className="text-xs" textValue="50条/页">
                    50
                  </SelectItem>
                </Select>
              </div>

              {/* 刷新按钮 */}
              <Button
                size="sm"
                variant="flat"
                onClick={fetchTunnels}
                // isLoading={loading}
                startContent={<FontAwesomeIcon icon={faRotateRight} />}
              >
                刷新
              </Button>
            </div>
          </div>
        </div>

        {/* 表格区域 - 使用条件渲染完全分离移动端和桌面端 */}
        <div className="w-full">
          {isMobile ? (
            // 移动端：卡片布局
            <div className="space-y-3">
              {loading || error || items.length === 0 ? (
                <div className="min-h-[400px] flex items-center justify-center py-16">
                  {loading ? (
                    <div className="flex flex-col items-center gap-4">
                      <Spinner size="lg" />
                      <p className="text-default-500">加载中...</p>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-danger-50 flex items-center justify-center">
                        <FontAwesomeIcon
                          className="text-3xl text-danger"
                          icon={faRotateRight}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-danger text-base font-medium">
                          加载失败
                        </p>
                        <p className="text-default-400 text-sm">{error}</p>
                      </div>
                      <Button
                        color="danger"
                        startContent={<FontAwesomeIcon icon={faRotateRight} />}
                        variant="flat"
                        onClick={fetchTunnels}
                      >
                        重试
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 text-center">
                      <div className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center">
                        <FontAwesomeIcon
                          className="text-3xl text-default-400"
                          icon={faEye}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-default-500 text-base font-medium">
                          暂无实例
                        </p>
                        <p className="text-default-400 text-sm">
                          您还没有创建任何实例
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {items.map((tunnel) => (
                    <MobileTunnelCard key={tunnel.id} tunnel={tunnel} />
                  ))}
                  {renderPagination()}
                </>
              )}
            </div>
          ) : (
            // 桌面端：表格布局
            <Table
              isHeaderSticky
              aria-label="实例表格"
              bottomContent={renderPagination()}
              selectedKeys={selectedKeys}
              selectionMode="multiple"
              sortDescriptor={sortDescriptor}
              topContent={renderGroupFilter()}
              onSelectionChange={setSelectedKeys}
              onSortChange={handleSortChange}
            >
              <TableHeader columns={columns}>
                {(column) => (
                  <TableColumn
                    key={column.key}
                    allowsSorting={column.sortable}
                    className={
                      column.key === "actions"
                        ? "w-[140px]"
                        : column.key === "traffic"
                          ? "w-[100px]"
                          : column.key === "type"
                            ? "w-[80px]"
                            : column.key === "endpoint"
                              ? "w-[120px]"
                              : ""
                    }
                    hideHeader={false}
                  >
                    {column.label}
                  </TableColumn>
                )}
              </TableHeader>
              <TableBody
                emptyContent={
                  error ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-20 h-20 rounded-full bg-danger-50 flex items-center justify-center">
                        <FontAwesomeIcon
                          className="text-3xl text-danger"
                          icon={faRotateRight}
                        />
                      </div>
                      <div className="space-y-2 text-center">
                        <p className="text-danger text-base font-medium">
                          加载失败
                        </p>
                        <p className="text-default-400 text-sm">{error}</p>
                      </div>
                      <Button
                        color="danger"
                        startContent={<FontAwesomeIcon icon={faRotateRight} />}
                        variant="flat"
                        onClick={fetchTunnels}
                      >
                        重试
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-center">
                      <div className="w-20 h-20 rounded-full bg-default-100 flex items-center justify-center">
                        <FontAwesomeIcon
                          className="text-3xl text-default-400"
                          icon={faEye}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-default-500 text-base font-medium">
                          暂无实例
                        </p>
                        <p className="text-default-400 text-sm">
                          您还没有创建任何实例
                        </p>
                      </div>
                    </div>
                  )
                }
              >
                {loading
                  ? // Loading 状态：显示 Skeleton
                    Array.from({ length: 5 }).map((_, index) => (
                      <TableRow key={`skeleton-${index}`}>
                        <TableCell>
                          <Skeleton className="w-16 h-6 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="w-24 h-5 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="w-20 h-6 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="w-32 h-5 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="w-32 h-5 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="w-16 h-6 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="w-24 h-5 rounded-lg" />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Skeleton className="w-8 h-8 rounded-lg" />
                            <Skeleton className="w-8 h-8 rounded-lg" />
                            <Skeleton className="w-8 h-8 rounded-lg" />
                            <Skeleton className="w-8 h-8 rounded-lg" />
                            <Skeleton className="w-8 h-8 rounded-lg" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  : // 正常数据
                    items.map((tunnel) => (
                      <TableRow key={tunnel.id}>
                        {/* 类型列 */}
                        <TableCell>
                          <Chip
                            color={
                              tunnel.type === "server" ? "primary" : "secondary"
                            }
                            size="sm"
                            variant="flat"
                          >
                            {getTypeDisplayText(tunnel.type)}
                          </Chip>
                        </TableCell>

                        {/* 名称列 */}
                        <TableCell className="min-w-[120px] max-h-[2.5em] ">
                          <Tooltip
                            content={
                              <div className="text-xs">
                                <div className="font-medium">{tunnel.name}</div>
                                <div className="text-default-400">
                                  {tunnel.instanceId}
                                </div>
                              </div>
                            }
                            size="sm"
                          >
                            <div
                              className="text-sm font-semibold leading-tight cursor-help overflow-hidden text-ellipsis "
                              style={{ wordBreak: "break-all" }}
                            >
                              {tunnel.name}
                              <Tooltip content="修改名称" size="sm">
                                <FontAwesomeIcon
                                  className="text-[10px] text-default-400 hover:text-default-500 cursor-pointer ml-1 inline align-baseline"
                                  icon={faPen}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditClick(tunnel);
                                  }}
                                />
                              </Tooltip>
                            </div>
                          </Tooltip>
                        </TableCell>

                        {/* 主控列 */}
                        <TableCell className="min-w-[120px]">
                          <Tooltip
                            content={
                              <div className="text-xs">
                                <div className="font-medium">
                                  {tunnel.endpoint}
                                </div>
                                {tunnel.version && (
                                  <div className="text-default-400">
                                    版本: {tunnel.version}
                                  </div>
                                )}
                              </div>
                            }
                            placement="top"
                            size="sm"
                          >
                            <Chip
                              className="cursor-help hover:opacity-80 h-auto"
                              color="default"
                              size="sm"
                              variant="bordered"
                            >
                              <div className="line-clamp-2 overflow-hidden text-ellipsis leading-tight text-xs whitespace-normal break-words">
                                {tunnel.endpoint}
                              </div>
                            </Chip>
                          </Tooltip>
                        </TableCell>

                        {/* 隧道地址列 */}
                        <TableCell className="text-sm text-default-600 font-mono">
                          {formatAddress(
                            tunnel.tunnelAddress,
                            tunnel.tunnelPort,
                          )}
                        </TableCell>

                        {/* 目标地址列 */}
                        <TableCell className="text-sm text-default-600 font-mono">
                          {formatAddress(
                            tunnel.targetAddress,
                            tunnel.targetPort,
                          )}
                        </TableCell>

                        {/* 状态列 */}
                        <TableCell className="min-w-[50px]">
                          <Chip
                            color={tunnel.status.type}
                            size="sm"
                            variant="flat"
                          >
                            {tunnel.status.text}
                          </Chip>
                        </TableCell>

                        {/* 流量列 */}
                        <TableCell className="text-sm text-default-600 font-mono min-w-[100px]">
                          <TrafficInfo traffic={tunnel.traffic} />
                        </TableCell>

                        {/* 操作列 */}
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Tooltip content="查看实例" size="sm">
                              <Button
                                isIconOnly
                                color="primary"
                                size="sm"
                                startContent={
                                  <FontAwesomeIcon
                                    className="text-xs "
                                    icon={faEye}
                                  />
                                }
                                variant="light"
                                onClick={() =>
                                  navigate(`/tunnels/details?id=${tunnel.id}`)
                                }
                              />
                            </Tooltip>
                            <Tooltip
                              content={
                                tunnel.status.type === "success"
                                  ? "停止实例"
                                  : "启动实例"
                              }
                              size="sm"
                            >
                              <Button
                                isIconOnly
                                color={
                                  tunnel.status.type === "success"
                                    ? "warning"
                                    : "success"
                                }
                                size="sm"
                                startContent={
                                  <FontAwesomeIcon
                                    className="text-xs"
                                    icon={
                                      tunnel.status.type === "success"
                                        ? faStop
                                        : faPlay
                                    }
                                  />
                                }
                                variant="light"
                                onClick={() => handleToggleStatus(tunnel)}
                              />
                            </Tooltip>
                            <Tooltip content="重启实例" size="sm">
                              <Button
                                isIconOnly
                                color="secondary"
                                isDisabled={tunnel.status.type !== "success"}
                                size="sm"
                                startContent={
                                  <FontAwesomeIcon
                                    className="text-xs"
                                    icon={faRotateRight}
                                  />
                                }
                                variant="light"
                                onClick={() => handleRestart(tunnel)}
                              />
                            </Tooltip>
                            <Tooltip content="编辑实例" size="sm">
                              <Button
                                isIconOnly
                                color="warning"
                                size="sm"
                                startContent={
                                  <FontAwesomeIcon
                                    className="text-xs"
                                    icon={faPen}
                                  />
                                }
                                variant="light"
                                onClick={() => {
                                  setEditTunnel(tunnel);
                                  setEditModalOpen(true);
                                }}
                              />
                            </Tooltip>
                            <Tooltip content="删除实例" size="sm">
                              <Button
                                isIconOnly
                                color="danger"
                                size="sm"
                                startContent={
                                  <FontAwesomeIcon
                                    className="text-xs"
                                    icon={faTrash}
                                  />
                                }
                                variant="light"
                                onClick={() => handleDeleteClick(tunnel)}
                              />
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* 删除确认模态框 */}
      <Modal isOpen={isOpen} placement="center" onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="text-danger" icon={faTrash} />
                  确认删除
                </div>
              </ModalHeader>
              <ModalBody>
                {deleteModalTunnel && (
                  <>
                    <p className="text-default-600">
                      您确定要删除实例{" "}
                      <span className="font-semibold text-foreground">
                        "{deleteModalTunnel.name}"
                      </span>{" "}
                      吗？
                    </p>
                    <p className="text-small text-warning">
                      ⚠️ 此操作不可撤销，实例的所有配置和数据都将被永久删除。
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
                    confirmDelete();
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

      {/* 重命名模态框 */}
      <RenameTunnelModal
        currentName={renameModalTunnel?.name || ""}
        isOpen={isRenameModalOpen}
        tunnelId={renameModalTunnel?.id || ""}
        onOpenChange={setIsRenameModalOpen}
        onRenamed={handleRenameSuccess}
      />

      {/* 批量删除确认模态框 */}
      <Modal
        isOpen={batchDeleteModalOpen}
        placement="center"
        onOpenChange={setBatchDeleteModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="text-danger" icon={faTrash} />
                  确认批量删除
                </div>
              </ModalHeader>
              <ModalBody>
                <p className="text-default-600">
                  您确定要删除选中的{" "}
                  <span className="font-semibold text-foreground">
                    {selectedCount}
                  </span>{" "}
                  个实例吗？
                </p>
                <p className="text-small text-warning">
                  ⚠️ 此操作不可撤销，选中实例的所有配置和数据都将被永久删除。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="danger"
                  startContent={<FontAwesomeIcon icon={faTrash} />}
                  onPress={executeBatchDelete}
                >
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 导出配置模态框 */}
      <Modal
        isOpen={exportModalOpen}
        placement="center"
        scrollBehavior="inside"
        size="2xl"
        onOpenChange={setExportModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon className="text-primary" icon={faDownload} />
                  导出配置规则
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-default-600 text-sm">
                    已选择 {selectedCount}{" "}
                    个实例的配置规则，格式符合批量创建规范：
                  </p>
                  <Code className="w-full p-4 max-h-96 overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap">
                      {exportConfig}
                    </pre>
                  </Code>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  关闭
                </Button>
                <Button
                  color="primary"
                  startContent={<FontAwesomeIcon icon={faCopy} />}
                  onPress={copyExportConfig}
                >
                  复制配置
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 快建实例模态框 */}
      <SimpleCreateTunnelModal
        isOpen={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        onSaved={() => {
          setQuickCreateOpen(false);
          fetchTunnels();
        }}
      />

      {/* 批量创建模态框 */}
      <BatchCreateModal
        isOpen={batchCreateOpen}
        onOpenChange={setBatchCreateOpen}
        onSaved={() => {
          setBatchCreateOpen(false);
          fetchTunnels();
        }}
      />

      {/* 手搓创建模态框 */}
      <BatchUrlCreateTunnelModal
        isOpen={manualCreateOpen}
        onOpenChange={setManualCreateOpen}
        onSaved={() => {
          setManualCreateOpen(false);
          fetchTunnels();
        }}
      />

      {/* 手动复制模态框 */}
      <ManualCopyModal
        isOpen={isManualCopyOpen}
        text={manualCopyText}
        onOpenChange={(open) => setIsManualCopyOpen(open)}
      />

      {/* 分组管理模态框 */}
      <GroupManagementModal
        isOpen={groupManagementModalOpen}
        onOpenChange={setGroupManagementModalOpen}
        onSaved={handleGroupSaved}
      />

      {/* 简化分组设置模态框 */}
      <SimpleGroupModal
        currentGroup={currentTunnelForGroup?.group}
        isOpen={simpleGroupModalOpen}
        tunnelId={currentTunnelForGroup?.id?.toString() || ""}
        onOpenChange={setSimpleGroupModalOpen}
        onSaved={handleGroupSaved}
      />

      {/* Quick Edit Modal */}
      {editModalOpen && editTunnel && (
        <SimpleCreateTunnelModal
          editData={editTunnel as any}
          isOpen={editModalOpen}
          mode="edit"
          onOpenChange={(open) => setEditModalOpen(open)}
          onSaved={() => {
            setEditModalOpen(false);
            fetchTunnels();
          }}
        />
      )}

      {/* 场景创建模态框 */}
      <ScenarioCreateModal
        isOpen={scenarioModalOpen}
        scenarioType={selectedScenarioType}
        onOpenChange={setScenarioModalOpen}
        onSaved={() => {
          setScenarioModalOpen(false);
          setSelectedScenarioType(undefined);
          fetchTunnels();
        }}
      />
    </>
  );
}
