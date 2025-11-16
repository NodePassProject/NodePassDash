import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Input,
  Spinner,
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
} from "@heroui/react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl, formatBytes } from "@/lib/utils";
import { useSettings } from "@/components/providers/settings-provider";
import ScenarioCreateModal, {
  ScenarioType,
} from "@/components/tunnels/scenario-create-modal";
import AssembleServiceModal from "@/components/services/assemble-service-modal";

// 定义服务类型
interface Service {
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
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 场景创建模态框状态
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [selectedScenarioType, setSelectedScenarioType] = useState<
    ScenarioType | undefined
  >();

  // 组装服务模态框状态
  const [assembleModalOpen, setAssembleModalOpen] = useState(false);

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
        throw new Error("获取服务列表失败");
      }

      const data = await response.json();

      setServices(data.services || []);
    } catch (error) {
      console.error("获取服务列表失败:", error);
      addToast({
        title: "获取服务列表失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
      setServices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // 处理确认操作
  const handleConfirmedAction = async () => {
    if (!confirmAction) return;

    const { type, service } = confirmAction;

    try {
      const endpoint =
        type === "dissolve"
          ? `/api/services/${service.sid}/${service.type}/dissolve`
          : `/api/services/${service.sid}/${service.type}`;
      const method = type === "dissolve" ? "POST" : "DELETE";

      const response = await fetch(buildApiUrl(endpoint), {
        method,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "操作失败");
      }

      addToast({
        title: type === "dissolve" ? "解散成功" : "删除成功",
        description: `服务 ${service.alias || service.sid} 已${type === "dissolve" ? "解散" : "删除"}`,
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error("操作失败:", error);
      addToast({
        title: type === "dissolve" ? "解散失败" : "删除失败",
        description: error instanceof Error ? error.message : "未知错误",
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
        buildApiUrl(`/api/services/${service.sid}/${service.type}/${action}`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "操作失败");
      }

      const actionText =
        action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
      addToast({
        title: `${actionText}成功`,
        description: `服务 ${service.alias || service.sid} 已${actionText}`,
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error("操作失败:", error);
      const actionText =
        action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
      addToast({
        title: `${actionText}失败`,
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 处理重命名服务
  const handleRenameService = async (service: Service) => {
    const newName = prompt("请输入新名称:", service.alias || service.sid);
    if (!newName || newName.trim() === "") {
      return;
    }

    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/${service.type}/rename`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName.trim() }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "重命名失败");
      }

      addToast({
        title: "重命名成功",
        description: `服务已重命名为 ${newName.trim()}`,
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error("重命名失败:", error);
      addToast({
        title: "重命名失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 处理同步服务
  const handleSyncService = async (service: Service) => {
    try {
      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/${service.type}/sync`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "同步失败");
      }

      addToast({
        title: "同步成功",
        description: `服务 ${service.alias || service.sid} 已同步`,
        color: "success",
      });

      // 刷新服务列表
      fetchServices();
    } catch (error) {
      console.error("同步失败:", error);
      addToast({
        title: "同步失败",
        description: error instanceof Error ? error.message : "未知错误",
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

  // 根据 type 获取模式文案
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "0":
        return "单端转发";
      case "1":
        return "NAT穿透";
      case "2":
        return "隧道转发";
      case "3":
        return "隧道转发(外部)";
      default:
        return type;
    }
  };

  // 根据类型获取图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "0":
        return faArrowRight;
      case "1":
        return faShield;
      case "2":
        return faExchangeAlt;
      default:
        return faNetworkWired;
    }
  };

  // 根据类型获取颜色
  const getTypeColor = (type: string) => {
    switch (type) {
      case "0":
        return "primary";
      case "1":
        return "success";
      case "2":
        return "secondary";
      default:
        return "default";
    }
  };

  // 格式化 host 显示（处理脱敏逻辑）
  const formatHost = (host: string | undefined) => {
    if (!host) return "[::]";

    // 如果隐私模式关闭，显示完整地址
    if (!settings.isPrivacyMode) {
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
          <h1 className="text-2xl font-bold">服务管理</h1>
        </div>
        <div className="flex gap-2">
          <Button
            color="default"
            isLoading={refreshing}
            startContent={!refreshing && <FontAwesomeIcon icon={faRefresh} />}
            variant="flat"
            onPress={() => fetchServices(true)}
          >
            刷新
          </Button>
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
          <Button
            color="primary"
            startContent={<FontAwesomeIcon icon={faCubes} />}
            onPress={() => setAssembleModalOpen(true)}
          >
            组装服务
          </Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <Card>
        <CardBody>
          <Input
            isClearable
            placeholder="搜索服务 SID、类型或别名..."
            size="sm"
            startContent={<FontAwesomeIcon icon={faSearch} />}
            value={searchQuery}
            onClear={() => setSearchQuery("")}
            onValueChange={setSearchQuery}
          />
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
                  <Skeleton className="flex-shrink-0 w-9 h-16 rounded-md" />
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
            <p className="text-default-400">暂无服务数据</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredServices.map((service) => (
            <Card
              key={`${service.sid}-${service.type}`}
              className="hover:shadow-lg transition-shadow relative"
            >
              {/* 右上角操作菜单 */}
              <div className="absolute top-2 right-2 z-10">
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <FontAwesomeIcon icon={faEllipsisVertical} />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="服务操作"
                    onAction={(key) => {
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
                        handleRenameService(service);
                      } else if (actionKey === "sync") {
                        handleSyncService(service);
                      }
                    }}
                  >
                    <DropdownSection showDivider title="实例操作">
                      <DropdownItem
                        key="start"
                        className="text-success"
                        startContent={<FontAwesomeIcon fixedWidth icon={faPlay} />}
                      >
                        启动
                      </DropdownItem>
                      <DropdownItem
                        key="stop"
                        className="text-warning"
                        startContent={<FontAwesomeIcon fixedWidth icon={faStop} />}
                      >
                        停止
                      </DropdownItem>
                      <DropdownItem
                        key="restart"
                        className="text-primary"
                        startContent={<FontAwesomeIcon fixedWidth icon={faRotateRight} />}
                      >
                        重启
                      </DropdownItem>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        color="danger"
                        startContent={<FontAwesomeIcon fixedWidth icon={faTrash} />}
                      >
                        删除
                      </DropdownItem>
                    </DropdownSection>
                    <DropdownSection  title="服务操作">
                      <DropdownItem
                        key="sync"
                        className="text-primary"
                        startContent={<FontAwesomeIcon fixedWidth icon={faSync} />}
                      >
                        同步
                      </DropdownItem>
                      <DropdownItem
                        key="rename"
                        startContent={<FontAwesomeIcon fixedWidth icon={faEdit} />}
                      >
                        重命名
                      </DropdownItem>
                      <DropdownItem
                        key="dissolve"
                        className="text-danger"
                        color="warning"
                        startContent={<FontAwesomeIcon fixedWidth icon={faUserSlash} />}
                      >
                        解散
                      </DropdownItem>
                    </DropdownSection>
                  </DropdownMenu>
                </Dropdown>
              </div>

              <CardBody
                className="p-4 cursor-pointer"
                onClick={() => {
                  navigate(`/services/details?sid=${service.sid}&type=${service.type}`);
                }}
              >
                {/* 标题：左侧图标 + 右侧两行文字 */}
                <div className="flex gap-3 mb-3 pr-8">
                  {/* 左侧图标 */}
                  <div className="flex-shrink-0 flex items-center justify-center w-9 self-stretch rounded-md bg-default-100">
                    <FontAwesomeIcon
                      className="text-default-600 text-sm"
                      icon={getTypeIcon(service.type)}
                    />
                  </div>

                  {/* 右侧两行文字 */}
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate" title={service.alias || service.sid}>
                      {service.alias || service.sid}
                    </h3>
                    <span className="text-[11px] text-default-500">
                      {getTypeLabel(service.type)}
                    </span>
                  </div>
                </div>

                {/* 入口和出口信息 */}
                <div className="w-full space-y-1 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-default-500">入口：</span>
                    <span className="text-default-700 font-mono">
                      {formatHost(service.entranceHost)}:{service.entrancePort}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-default-500">出口：</span>
                    <span className="text-default-700 font-mono">
                      {formatHost(service.exitHost)}:{service.exitPort}
                    </span>
                  </div>
                </div>
              </CardBody>

              {/* 流量信息 */}
              <CardFooter className="border-t border-divider px-3 py-3">
                <div className="flex items-center w-full text-xs">
                  <div className="flex-1 flex items-center justify-center gap-1">
                    <span className="font-mono text-xs">↑</span>
                    <span className="font-medium text-default-700">
                      {formatBytes(service.totalTx || 0)}
                    </span>
                  </div>
                  <div className="h-4 w-px bg-divider" />
                  <div className="flex-1 flex items-center justify-center gap-1">
                    <span className="font-mono text-xs">↓</span>
                    <span className="font-medium text-default-700">
                      {formatBytes(service.totalRx || 0)}
                    </span>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
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

      {/* 确认操作对话框 */}
      <Modal
        isOpen={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {confirmAction?.type === "dissolve" ? "确认解散服务" : "确认删除服务"}
              </ModalHeader>
              <ModalBody>
                <p>
                  {confirmAction?.type === "dissolve"
                    ? `确定要解散服务 "${confirmAction.service.alias || confirmAction.service.sid}" 吗？`
                    : `确定要删除服务 "${confirmAction?.service.alias || confirmAction?.service.sid}" 吗？此操作不可撤销！`
                  }
                </p>
              </ModalBody>
              <ModalFooter>
                <Button
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color={confirmAction?.type === "dissolve" ? "warning" : "danger"}
                  onPress={() => {
                    handleConfirmedAction();
                    onClose();
                  }}
                >
                  {confirmAction?.type === "dissolve" ? "解散" : "删除"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
