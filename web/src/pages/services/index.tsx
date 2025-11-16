import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Input,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tooltip,
} from "@heroui/react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearch,
  faRefresh,
  faServer,
  faDesktop,
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
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";
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
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // 场景创建模态框状态
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [selectedScenarioType, setSelectedScenarioType] = useState<
    ScenarioType | undefined
  >();

  // 组装服务模态框状态
  const [assembleModalOpen, setAssembleModalOpen] = useState(false);

  // 获取服务列表
  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
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
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner color="primary" size="lg" />
      </div>
    );
  }

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
            startContent={<FontAwesomeIcon icon={faRefresh} />}
            variant="flat"
            onPress={fetchServices}
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
      {filteredServices.length === 0 ? (
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
              className="hover:shadow-lg transition-shadow"
            >
              <CardBody
                className="p-4 cursor-pointer"
                onClick={() => {
                  navigate(`/services/details?sid=${service.sid}&type=${service.type}`);
                }}
              >
                {/* 第一行：图标 + 类型名称（小字） */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-default-100">
                    <FontAwesomeIcon
                      className="text-default-600 text-xs"
                      icon={getTypeIcon(service.type)}
                    />
                  </div>
                  <span className="text-xs text-default-500">
                    {getTypeLabel(service.type)}
                  </span>
                </div>

                {/* 第二行：图标 + 别名（大字） */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-base truncate flex-1" title={service.alias || service.sid}>
                    {service.alias || service.sid}
                  </h3>
                </div>

                {/* 入口和出口信息 */}
                <div className="w-full space-y-1 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-default-500">入口：</span>
                    <span className="text-default-700 font-mono">
                      {service.entranceHost?service.entranceHost:"[::]"}:{service.entrancePort}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-default-500">出口：</span>
                    <span className="text-default-700 font-mono">
                      {service.exitHost}:{service.exitPort}
                    </span>
                  </div>
                </div>
              </CardBody>

              <CardFooter className="border-t border-divider p-2 flex justify-center gap-1">
                {/* 停止/启动按钮 */}
                <Tooltip content="启动">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={(e) => {
                      e.stopPropagation();
                      // TODO: 实现启动逻辑
                      addToast({
                        title: "启动服务",
                        description: `服务 ${service.alias || service.sid} 启动功能待实现`,
                        color: "primary",
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faPlay} className="text-success" />
                  </Button>
                </Tooltip>

                <Tooltip content="停止">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={(e) => {
                      e.stopPropagation();
                      // TODO: 实现停止逻辑
                      addToast({
                        title: "停止服务",
                        description: `服务 ${service.alias || service.sid} 停止功能待实现`,
                        color: "warning",
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faStop} className="text-danger" />
                  </Button>
                </Tooltip>

                {/* 重启按钮 */}
                <Tooltip content="重启">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={(e) => {
                      e.stopPropagation();
                      // TODO: 实现重启逻辑
                      addToast({
                        title: "重启服务",
                        description: `服务 ${service.alias || service.sid} 重启功能待实现`,
                        color: "primary",
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faRotateRight} className="text-primary" />
                  </Button>
                </Tooltip>

                {/* 解散按钮 */}
                <Tooltip content="解散">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={(e) => {
                      e.stopPropagation();
                      // TODO: 实现解散逻辑
                      addToast({
                        title: "解散服务",
                        description: `服务 ${service.alias || service.sid} 解散功能待实现`,
                        color: "warning",
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faUserSlash} className="text-warning" />
                  </Button>
                </Tooltip>

                {/* 删除按钮 */}
                <Tooltip content="删除">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={(e) => {
                      e.stopPropagation();
                      // TODO: 实现删除逻辑
                      addToast({
                        title: "删除服务",
                        description: `服务 ${service.alias || service.sid} 删除功能待实现`,
                        color: "danger",
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-danger" />
                  </Button>
                </Tooltip>

                {/* 重命名按钮 */}
                <Tooltip content="重命名">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={(e) => {
                      e.stopPropagation();
                      // TODO: 实现重命名逻辑
                      addToast({
                        title: "重命名服务",
                        description: `服务 ${service.alias || service.sid} 重命名功能待实现`,
                        color: "primary",
                      });
                    }}
                  >
                    <FontAwesomeIcon icon={faEdit} className="text-default-600" />
                  </Button>
                </Tooltip>
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
    </div>
  );
}
