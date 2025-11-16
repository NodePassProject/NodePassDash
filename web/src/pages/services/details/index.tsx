import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tab,
  Tabs,
  useDisclosure,
  Tooltip,
  Accordion,
  AccordionItem,
  Switch,
  cn,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DatePicker,
  Badge,
  RadioGroup,
  Radio,
} from "@heroui/react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faRefresh,
  faServer,
  faDesktop,
  faArrowRight,
  faShield,
  faExchangeAlt,
  faPlay,
  faRotateRight,
  faTrash,
  faStop,
  faEye,
  faEyeSlash,
  faArrowDown,
  faDownload,
  faPen,
  faRecycle,
  faExpand,
  faHammer,
  faBug,
} from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { Icon } from "@iconify/react";
import { parseDate } from "@internationalized/date";

import { buildApiUrl } from "@/lib/utils";
import { Snippet } from "@/components/ui/snippet";
import SimpleCreateTunnelModal from "@/components/tunnels/simple-create-tunnel-modal";
import RenameTunnelModal from "@/components/tunnels/rename-tunnel-modal";
import InstanceTagModal from "@/components/tunnels/instance-tag-modal";
import { TrafficStatsCard } from "@/components/tunnels/traffic-stats-card";
import { ConnectionsStatsCard } from "@/components/tunnels/connections-stats-card";
import { NetworkQualityCard } from "@/components/tunnels/network-quality-card";
import { useTunnelActions } from "@/lib/hooks/use-tunnel-actions";
import { DetailedTrafficChart } from "@/components/ui/detailed-traffic-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { ConnectionsChart } from "@/components/ui/connections-chart";
import { LatencyChart } from "@/components/ui/latency-chart";
import { FileLogViewer } from "@/components/ui/file-log-viewer";
import { useTunnelSSE } from "@/lib/hooks/use-sse";
import { useMetricsTrend } from "@/lib/hooks/use-metrics-trend";
import TunnelStatsCharts from "@/components/ui/tunnel-stats-charts";
import { useSettings } from "@/components/providers/settings-provider";
import CellValue from "@/pages/tunnels/details/cell-value";
import OriginalCellValue from "@/pages/tunnels/details/original-cell-value";
import { FullscreenChartModal } from "@/pages/tunnels/details/fullscreen-chart-modal";

// 定义服务详情类型
interface ServiceDetails {
  sid: string;
  type: string;
  alias?: string;
  serverInstanceId?: string;
  clientInstanceId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ServiceDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sid = searchParams.get("sid");
  const type = searchParams.get("type");
  const [service, setService] = useState<ServiceDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // 根据 type 获取模式文案
  const getTypeLabel = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "单端转发模式";
      case "1":
        return "内网穿透模式";
      case "2":
        return "隧道转发模式";
      default:
        return typeValue;
    }
  };

  // 根据 type 获取英文模式名称
  const getTypeEnglishLabel = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "Single-end Forwarding";
      case "1":
        return "NAT Traversal";
      case "2":
        return "Tunnel Forwarding";
      default:
        return typeValue;
    }
  };

  // 根据类型获取图标
  const getTypeIcon = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return faArrowRight;
      case "1":
        return faShield;
      case "2":
        return faExchangeAlt;
      default:
        return faServer;
    }
  };

  // 根据类型获取颜色
  const getTypeColor = (typeValue: string) => {
    switch (typeValue) {
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

  // 获取服务详情
  const fetchServiceDetails = useCallback(async () => {
    if (!sid || !type) {
      navigate("/services");

      return;
    }

    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(`/api/services/${sid}/${type}`));

      if (!response.ok) {
        throw new Error("获取服务详情失败");
      }

      const data = await response.json();

      setService(data.service);
    } catch (error) {
      console.error("获取服务详情失败:", error);
      addToast({
        title: "获取服务详情失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
      navigate("/services");
    } finally {
      setLoading(false);
    }
  }, [sid, type, navigate]);

  useEffect(() => {
    fetchServiceDetails();
  }, [fetchServiceDetails]);

  if (loading || !service) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Spinner color="primary" size="lg" />
          </div>
          <p className="text-default-500 animate-pulse">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-0">
      {/* 顶部操作区 */}
      <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:justify-between md:items-center">
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            isIconOnly
            className="bg-default-100 hover:bg-default-200"
            variant="flat"
            onClick={() => navigate(-1)}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-default-100">
            <FontAwesomeIcon
              className="text-default-600"
              icon={getTypeIcon(service.type)}
            />
          </div>
          <h1 className="text-lg md:text-2xl font-bold truncate">
            {service.alias || service.sid}
          </h1>
          <Chip
            color={getTypeColor(service.type) as any}
            variant="flat"
          >
            {getTypeLabel(service.type)}
          </Chip>
        </div>

        {/* 操作按钮组 */}
        <div className="flex items-center gap-2">
          <Button
            color="default"
            startContent={<FontAwesomeIcon icon={faRefresh} />}
            variant="flat"
            onPress={fetchServiceDetails}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 服务信息卡片 */}
      <Card className="p-2">
        <CardHeader className="flex items-center justify-between pb-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">服务信息</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 服务 SID */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon
                  className="text-default-600"
                  height={18}
                  icon="lucide:hash"
                  width={18}
                />
                <span className="text-sm text-default-500">服务 SID</span>
              </div>
              <p className="font-mono text-sm">{service.sid}</p>
            </div>

            {/* 服务类型 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon
                  className="text-default-600"
                  height={18}
                  icon="lucide:network"
                  width={18}
                />
                <span className="text-sm text-default-500">服务类型</span>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{getTypeLabel(service.type)}</p>
                <p className="text-xs text-default-400">{getTypeEnglishLabel(service.type)}</p>
              </div>
            </div>

            {/* 别名 */}
            {service.alias && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-default-600"
                    height={18}
                    icon="lucide:tag"
                    width={18}
                  />
                  <span className="text-sm text-default-500">别名</span>
                </div>
                <p className="text-sm">{service.alias}</p>
              </div>
            )}

            {/* Server 实例 */}
            {service.serverInstanceId && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-default-600"
                    height={18}
                    icon="lucide:server"
                    width={18}
                  />
                  <span className="text-sm text-default-500">Server 实例</span>
                </div>
                <p className="font-mono text-sm truncate">{service.serverInstanceId}</p>
              </div>
            )}

            {/* Client 实例 */}
            {service.clientInstanceId && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-default-600"
                    height={18}
                    icon="lucide:monitor"
                    width={18}
                  />
                  <span className="text-sm text-default-500">Client 实例</span>
                </div>
                <p className="font-mono text-sm truncate">{service.clientInstanceId}</p>
              </div>
            )}

            {/* 创建时间 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon
                  className="text-default-600"
                  height={18}
                  icon="lucide:calendar"
                  width={18}
                />
                <span className="text-sm text-default-500">创建时间</span>
              </div>
              <p className="text-sm">
                {new Date(service.createdAt).toLocaleString()}
              </p>
            </div>

            {/* 更新时间 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon
                  className="text-default-600"
                  height={18}
                  icon="lucide:clock"
                  width={18}
                />
                <span className="text-sm text-default-500">更新时间</span>
              </div>
              <p className="text-sm">
                {new Date(service.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
