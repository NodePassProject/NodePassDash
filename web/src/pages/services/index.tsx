import {
  Button,
  Card,
  CardBody,
  Input,
  Skeleton,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  CardFooter
} from "@heroui/react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faRefresh,
  faNetworkWired,
  faLayerGroup,
  faShield,
  faArrowRight,
  faExchangeAlt,
  faCubes,
  faPlay,
  faStop,
  faRotateRight,
  faTrash,
  faEdit,
  faUserSlash,
  faEllipsisVertical,
  faSync,
  faGripVertical,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl, formatBytes } from "@/lib/utils";
import { useSettings } from "@/components/providers/settings-provider";
import ScenarioCreateModal, {
  ScenarioType,
} from "@/components/services/service-create-modal";
import AssembleServiceModal from "@/components/services/assemble-service-modal";
import RenameServiceModal from "@/components/services/rename-service-modal";
import { HeroUIServiceCard } from "@/components/services/heroui-service-card";
import { SortableHeroUIServiceCard } from "@/components/services/sortable-heroui-service-card";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";

// 定义服务类型
export interface Service {
  sid: string;
  type: string;
  alias?: string;
  serverInstanceId?: string;
  clientInstanceId?: string;
  serverEndpointId?: number;
  clientEndpointId?: number;
  tunnelPort?: number;
  tunnelEndpointName?: string;
  entrancePort?: number;
  entranceHost?: string;
  exitPort?: number;
  exitHost?: string;
  totalRx: number;
  totalTx: number;
  sorts?: number; // 排序字段
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const { t } = useTranslation("services");
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 拖拽相关状态
  const [isSorting, setIsSorting] = useState(false);

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动8px后才激活拖拽
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // 场景创建模态框状态
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [selectedScenarioType, setSelectedScenarioType] = useState<
    ScenarioType | undefined
  >();

  // 组装服务模态框状态
  const [assembleModalOpen, setAssembleModalOpen] = useState(false);

  // 重命名模态框状态
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameService, setRenameService] = useState<Service | null>(null);

  // 确认对话框状态
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "dissolve" | "delete";
    service: Service;
  } | null>(null);

  // 获取服务列表
  const fetchServices = useCallback(async (isRefresh = false) => {
    try {
      setLoading(true);
      if (isRefresh) {
        setRefreshing(true);
      }

      const response = await fetch(buildApiUrl("/api/services"));

      if (!response.ok) {
        throw new Error(t("toast.fetchError"));
      }

      const data = await response.json();

      // 按 sorts 字段降序排序（更大的值排在前面）
      // 后端已经排序，这里双重保险
      const sortedServices = (data.services || []).sort(
        (a: Service, b: Service) => (b.sorts || 0) - (a.sorts || 0)
      );

      setServices(sortedServices);
    } catch (error) {
      console.error(t("toast.fetchError"), error);
      addToast({
        title: t("toast.fetchError"),
        description: error instanceof Error ? error.message : t("toast.unknownError"),
        color: "danger",
      });
      setServices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // 处理拖拽结束
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setIsSorting(true);

    const oldIndex = services.findIndex((s) => s.sid === active.id);
    const newIndex = services.findIndex((s) => s.sid === over.id);

    // 更新本地顺序
    const newServices = arrayMove(services, oldIndex, newIndex);

    // 更新 sorts 字段（降序：第一个位置的 sorts 值最大）
    const updatedServices = newServices.map((service, index) => ({
      ...service,
      sorts: newServices.length - 1 - index,
    }));

    setServices(updatedServices);

    // 保存到后端
    try {
      const response = await fetch(buildApiUrl("/api/services/sorts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          services: updatedServices.map((s) => ({
            sid: s.sid,
            sorts: s.sorts,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(t("toast.sortError"));
      }

      addToast({
        title: t("toast.sortSaved"),
        color: "success",
      });
    } catch (error) {
      console.error(t("toast.sortError"), error);
      addToast({
        title: t("toast.sortError"),
        description: error instanceof Error ? error.message : t("toast.unknownError"),
        color: "danger",
      });
      // 失败时恢复原顺序
      fetchServices();
    } finally {
      setIsSorting(false);
    }
  };

  // 处理确认操作
  const handleConfirmedAction = async () => {
    if (!confirmAction) return;

    const { type, service } = confirmAction;

    try {
      const endpoint =
        type === "dissolve"
          ? `/api/services/${service.sid}/dissolve`
          : `/api/services/${service.sid}`;
      const method = type === "dissolve" ? "POST" : "DELETE";

      const response = await fetch(buildApiUrl(endpoint), {
        method,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("toast.operationError"));
      }

      addToast({
        title: type === "dissolve" ? t("toast.dissolveSuccess") : t("toast.deleteSuccess"),
        description: t("toast.serviceActioned", {
          name: service.alias || service.sid,
          action: type === "dissolve" ? t("actions.dissolve") : t("actions.delete")
        }),
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error(t("toast.operationError"), error);
      addToast({
        title: type === "dissolve" ? t("toast.dissolveError") : t("toast.deleteError"),
        description: error instanceof Error ? error.message : t("toast.unknownError"),
        color: "danger",
      });
    }

    setConfirmModalOpen(false);
    setConfirmAction(null);
  };

  // 处理服务操作（启动、停止、重启）
  const handleServiceAction = async (
    action: "start" | "stop" | "restart",
    service: Service,
  ) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/${action}`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("toast.operationError"));
      }

      const actionText =
        action === "start" ? t("actions.start") : action === "stop" ? t("actions.stop") : t("actions.restart");
      addToast({
        title: t("toast.actionSuccess", { action: actionText }),
        description: t("toast.serviceActioned", {
          name: service.alias || service.sid,
          action: actionText
        }),
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error(t("toast.operationError"), error);
      const actionText =
        action === "start" ? t("actions.start") : action === "stop" ? t("actions.stop") : t("actions.restart");
      addToast({
        title: t("toast.actionError", { action: actionText }),
        description: error instanceof Error ? error.message : t("toast.unknownError"),
        color: "danger",
      });
    }
  };

  // 打开重命名模态框
  const handleOpenRenameModal = (service: Service) => {
    setRenameService(service);
    setRenameModalOpen(true);
  };

  // 处理同步服务
  const handleSyncService = async (service: Service) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/sync`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("toast.syncError"));
      }

      addToast({
        title: t("toast.syncSuccess"),
        description: t("toast.serviceActioned", {
          name: service.alias || service.sid,
          action: t("actions.sync")
        }),
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error(t("toast.syncError"), error);
      addToast({
        title: t("toast.syncError"),
        description: error instanceof Error ? error.message : t("toast.unknownError"),
        color: "danger",
      });
    }
  };

  // 过滤服务
  const filteredServices = React.useMemo(() => {
    if (!searchQuery) return services;

    const query = searchQuery.toLowerCase();

    return services.filter(
      (service) =>
        service.sid.toLowerCase().includes(query) ||
        service.type.toLowerCase().includes(query) ||
        (service.alias && service.alias.toLowerCase().includes(query)),
    );
  }, [services, searchQuery]);

  // 是否启用拖拽（仅在无搜索时启用）
  const isDragEnabled = !searchQuery && !isSorting;

  // 根据 type 获取模式文案
  // 0: 通用单端转发, 1: 本地内网穿透, 2: 本地隧道转发
  // 3: 外部内网穿透, 4: 外部隧道转发, 5: 均衡单端转发
  // 6: 均衡内网穿透, 7: 均衡隧道转发
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "0":
        return t("types.general");
      case "1":
        return t("types.localPenetration");
      case "2":
        return t("types.localTunnel");
      case "3":
        return t("types.externalPenetration");
      case "4":
        return t("types.externalTunnel");
      case "5":
        return t("types.balancedSingle");
      case "6":
        return t("types.balancedPenetration");
      case "7":
        return t("types.balancedTunnel");
      default:
        return type;
    }
  };

  // 根据类型获取图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "0":
      case "5":
        return faArrowRight;  // 单端转发
      case "1":
      case "3":
      case "6":
        return faShield;      // 内网穿透
      case "2":
      case "4":
      case "7":
        return faExchangeAlt; // 隧道转发
      default:
        return faNetworkWired;
    }
  };

  // 根据类型获取颜色 (HeroUI 原生颜色)
  // 单端转发=primary(蓝), 内网穿透=success(绿), 隧道转发=secondary(紫), 均衡=warning(橙)
  const getTypeColor = (type: string): "primary" | "success" | "secondary" | "warning" | "default" => {
    switch (type) {
      case "0":
        return "primary";     // 通用单端转发 - 蓝色
      case "1":
        return "success";     // 本地内网穿透 - 绿色
      case "2":
        return "secondary";   // 本地隧道转发 - 紫色
      case "3":
        return "success";     // 外部内网穿透 - 绿色
      case "4":
        return "secondary";   // 外部隧道转发 - 紫色
      case "5":
        return "warning";     // 均衡单端转发 - 橙色
      case "6":
        return "warning";     // 均衡内网穿透 - 橙色
      case "7":
        return "warning";     // 均衡隧道转发 - 橙色
      default:
        return "default";
    }
  };

  // 格式化 host 显示（处理脱敏逻辑）
  const formatHost = (host: string | undefined) => {
    if (!host) return "[::]";

    // 如果隐私模式关闭，显示完整地址
    if (!settings.settings.isPrivacyMode) {
      return host;
    }

    // 隐私模式开启时对IP地址进行部分脱敏
    // 检测IPv4地址
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = host.match(ipv4Regex);

    if (ipv4Match) {
      // IPv4地址：只保留前两段
      return `${ipv4Match[1]}.${ipv4Match[2]}.***.***`;
    }

    // 检测IPv6地址
    const ipv6Regex = /^([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})/;
    const ipv6Match = host.match(ipv6Regex);

    if (ipv6Match) {
      // IPv6地址：只保留前两段
      return `${ipv6Match[1]}:${ipv6Match[2]}:***:***:***:***:***:***`;
    }

    // 域名：完全脱敏
    return "********";
  };

  return (
    <div className="space-y-4">
      {/* 页面标题和操作栏 */}
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <div className="flex gap-2">
          <Button
            color="default"
            isLoading={refreshing}
            startContent={!refreshing && <FontAwesomeIcon icon={faRefresh} />}
            variant="flat"
            onPress={() => fetchServices(true)}
          >
            {t("actions.refresh")}
          </Button>
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                className="bg-linear-to-tr from-pink-500 to-yellow-500 text-white shadow-lg"
                color="secondary"
                startContent={<FontAwesomeIcon icon={faLayerGroup} />}
                variant="flat"
              >
                {t("actions.createService")}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label={t("scenarios.label")}
              onAction={(key) => {
                const scenarioType = key as ScenarioType;
                setSelectedScenarioType(scenarioType);
                setScenarioModalOpen(true);
              }}
            >
              <DropdownItem
                key="single-forward"
                color="primary"
                startContent={
                  <FontAwesomeIcon fixedWidth icon={faArrowRight} />
                }
              >
                {t("scenarios.singleEndpoint")}
              </DropdownItem>
              <DropdownItem
                key="nat-penetration"
                color="success"
                classNames={{
                  title: "group-hover:text-white"
                }}
                startContent={
                  <FontAwesomeIcon fixedWidth icon={faShield} className="group-hover:text-white" />
                }
              >
                {t("scenarios.penetration")}
              </DropdownItem>

              <DropdownItem
                key="tunnel-forward"
                color="secondary"
                startContent={
                  <FontAwesomeIcon fixedWidth icon={faExchangeAlt} />
                }
              >
                {t("scenarios.tunnelForward")}
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
          <Button
            color="primary"
            startContent={<FontAwesomeIcon icon={faCubes} />}
            onPress={() => setAssembleModalOpen(true)}
          >
            {t("actions.assembleService")}
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <Card>
        <CardBody>
          <div className="flex flex-col gap-2">
            <Input
              isClearable
              placeholder={t("search.placeholder")}
              size="sm"
              startContent={<FontAwesomeIcon icon={faSearch} />}
              value={searchQuery}
              onClear={() => setSearchQuery("")}
              onValueChange={setSearchQuery}
            />
            {!searchQuery && !loading && filteredServices.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-default-500">
                <FontAwesomeIcon icon={faGripVertical} className="text-default-400" />
                <span>{t("sorting.enabled")}</span>
              </div>
            )}
            {searchQuery && (
              <div className="flex items-center gap-2 text-xs text-warning">
                <FontAwesomeIcon icon={faSearch} className="text-warning" />
                <span>{t("sorting.disabled")}</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 服务卡片列表 */}
      {loading ? (
        // 加载中显示 Skeleton
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Card key={index} className="relative">
              <CardBody className="p-4">
                <div className="flex gap-3 mb-3">
                  <Skeleton className="flex-shrink-0 w-9 h-9 rounded-md" />
                  <div className="flex flex-col justify-center gap-2 flex-1">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                </div>
              </CardBody>
              <CardFooter className="border-t border-divider px-3 py-3">
                <div className="flex items-center w-full gap-2">
                  <Skeleton className="h-3 flex-1 rounded" />
                  <Skeleton className="h-3 flex-1 rounded" />
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-default-400">{t("empty.noServices")}</p>
          </CardBody>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredServices.map((s) => s.sid)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredServices.map((service) => {
                const handleAction = (key: React.Key) => {
                  const actionKey = key as string;

                  // 需要二次确认的操作
                  if (actionKey === "dissolve" || actionKey === "delete") {
                    setConfirmAction({
                      type: actionKey,
                      service,
                    });
                    setConfirmModalOpen(true);
                    return;
                  }

                  // 其他操作直接执行
                  if (actionKey === "start" || actionKey === "stop" || actionKey === "restart") {
                    handleServiceAction(actionKey, service);
                  } else if (actionKey === "rename") {
                    handleOpenRenameModal(service);
                  } else if (actionKey === "sync") {
                    handleSyncService(service);
                  }
                };

                // 如果启用拖拽，使用 SortableHeroUIServiceCard；否则使用普通卡片
                if (isDragEnabled) {
                  return (
                    <SortableHeroUIServiceCard
                      key={service.sid}
                      service={service}
                      formatHost={formatHost}
                      getTypeLabel={getTypeLabel}
                      getTypeIcon={getTypeIcon}
                      getTypeColor={getTypeColor}
                      onNavigate={() => navigate(`/services/details?sid=${service.sid}`)}
                      onAction={handleAction}
                    />
                  );
                } else {
                  return (
                    <HeroUIServiceCard
                      key={service.sid}
                      service={service}
                      formatHost={formatHost}
                      getTypeLabel={getTypeLabel}
                      getTypeIcon={getTypeIcon}
                      getTypeColor={getTypeColor}
                      onNavigate={() => navigate(`/services/details?sid=${service.sid}`)}
                      onAction={handleAction}
                    />
                  );
                }
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 场景创建模态框 */}
      <ScenarioCreateModal
        isOpen={scenarioModalOpen}
        scenarioType={selectedScenarioType}
        onOpenChange={setScenarioModalOpen}
        onSaved={() => {
          setScenarioModalOpen(false);
          setSelectedScenarioType(undefined);
          fetchServices();
        }}
      />

      {/* 组装服务模态框 */}
      <AssembleServiceModal
        isOpen={assembleModalOpen}
        onOpenChange={setAssembleModalOpen}
        onSaved={() => {
          setAssembleModalOpen(false);
          fetchServices();
        }}
      />

      {/* 重命名服务模态框 */}
      <RenameServiceModal
        isOpen={renameModalOpen}
        service={renameService}
        onOpenChange={setRenameModalOpen}
        onRenamed={() => {
          setRenameModalOpen(false);
          setRenameService(null);
          fetchServices();
        }}
      />

      {/* 确认操作对话框 */}
      <Modal
        isOpen={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {confirmAction?.type === "dissolve" ? t("confirm.dissolveTitle") : t("confirm.deleteTitle")}
              </ModalHeader>
              <ModalBody>
                <p>
                  {confirmAction?.type === "dissolve"
                    ? t("confirm.dissolveMessage", { name: confirmAction.service.alias || confirmAction.service.sid })
                    : t("confirm.deleteMessage", { name: confirmAction?.service.alias || confirmAction?.service.sid })
                  }
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                >
                  {t("action.cancel", { ns: "common" })}
                </Button>
                <Button
                  color={confirmAction?.type === "dissolve" ? "warning" : "danger"}
                  onPress={() => {
                    handleConfirmedAction();
                    onClose();
                  }}
                >
                  {confirmAction?.type === "dissolve" ? t("actions.dissolve") : t("actions.delete")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
