import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Button,
  Tabs,
  Tab,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRefresh } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";

import { TrafficUsageChart } from "@/components/ui/traffic-usage-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { PoolChart } from "@/components/ui/pool-chart";
import { ConnectionsChart } from "@/components/ui/connections-chart";
import { LatencyChart } from "@/components/ui/latency-chart";

// 图表类型
type ChartType = "traffic" | "speed" | "pool" | "connections" | "latency";

// 数据接口
interface TrafficDataPoint {
  timeStamp: string;
  traffic: number;
}

interface SpeedDataPoint {
  timeStamp: string;
  speed_in: number;
  speed_out: number;
}

interface PoolDataPoint {
  timeStamp: string;
  pool: number;
}

interface ConnectionDataPoint {
  timeStamp: string;
  pool?: number;
  tcps?: number;
  udps?: number;
}

interface LatencyDataPoint {
  timeStamp: string;
  latency: number;
}

// 模态组件属性
interface FullscreenChartModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  chartType: ChartType;
  title: string;
  trafficData?: TrafficDataPoint[];
  speedData?: SpeedDataPoint[];
  poolData?: PoolDataPoint[];
  connectionsData?: ConnectionDataPoint[];
  latencyData?: LatencyDataPoint[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
}

// 时间范围选项 - moved to component to access t function

// 根据时间范围过滤数据
const filterDataByTimeRange = (data: any[], timeRange: string) => {
  if (data.length === 0) return data;

  const now = new Date();
  const hoursAgo =
    timeRange === "1h"
      ? 1
      : timeRange === "6h"
        ? 6
        : timeRange === "12h"
          ? 12
          : 24;
  const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

  return data.filter((item) => {
    try {
      const itemTime = new Date(item.timeStamp);

      return !isNaN(itemTime.getTime()) && itemTime >= cutoffTime;
    } catch (error) {
      console.error(`Time parsing error: ${item.timeStamp}`, error);

      return false;
    }
  });
};

export const FullscreenChartModal: React.FC<FullscreenChartModalProps> = ({
  isOpen,
  onOpenChange,
  chartType,
  title,
  trafficData = [],
  speedData = [],
  poolData = [],
  connectionsData = [],
  latencyData = [],
  loading = false,
  error,
  onRefresh,
}) => {
  const { t } = useTranslation("tunnels");
  const [timeRange, setTimeRange] = React.useState<string>("24h");

  // 时间范围选项
  const timeRanges = [
    { key: "1h", title: t("details.timeRange.1h") },
    { key: "6h", title: t("details.timeRange.6h") },
    { key: "12h", title: t("details.timeRange.12h") },
    { key: "24h", title: t("details.timeRange.24h") },
  ];

  // 根据图表类型获取对应的数据
  const getCurrentData = () => {
    switch (chartType) {
      case "traffic":
        return filterDataByTimeRange(trafficData, timeRange);
      case "speed":
        return filterDataByTimeRange(speedData, timeRange);
      case "pool":
        return filterDataByTimeRange(poolData, timeRange);
      case "connections":
        return filterDataByTimeRange(connectionsData, timeRange);
      case "latency":
        return filterDataByTimeRange(latencyData, timeRange);
      default:
        return [];
    }
  };

  // 渲染对应的图表组件
  const renderChart = () => {
    const data = getCurrentData();
    const chartProps = {
      data,
      height: 400,
      loading,
      error,
      className: "h-full w-full",
      showFullData: true, // 全屏模式始终显示完整数据
    };

    switch (chartType) {
      case "traffic":
        return <TrafficUsageChart {...chartProps} />;
      case "speed":
        return <SpeedChart {...chartProps} />;
      case "pool":
        return <PoolChart {...chartProps} />;
      case "connections":
        return <ConnectionsChart {...chartProps} />;
      case "latency":
        return <LatencyChart {...chartProps} />;
      default:
        return null;
    }
  };

  return (
    <Modal
      classNames={{
        base: "mx-4",
        body: "p-0",
      }}
      isOpen={isOpen}
      scrollBehavior="inside"
      size="5xl"
      onOpenChange={onOpenChange}
    >
      <ModalContent className="max-h-[90vh]">
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center justify-between border-b pb-4">
              <h3 className="text-xl font-bold">{title}</h3>

              <div className="flex items-center gap-3">
                {/* 刷新按钮 */}
                <Button
                  isIconOnly
                  className="h-8 w-8 min-w-0"
                  isLoading={loading}
                  size="sm"
                  variant="flat"
                  onPress={onRefresh}
                >
                  <FontAwesomeIcon className="text-sm" icon={faRefresh} />
                </Button>

                {/* 时间范围选择 */}
                <Tabs
                  classNames={{
                    tabList: "gap-1",
                    tab: "text-sm px-3 py-2 min-w-0 h-8",
                    tabContent: "text-sm",
                  }}
                  selectedKey={timeRange}
                  size="sm"
                  variant="light"
                  onSelectionChange={(key) => setTimeRange(key as string)}
                >
                  {timeRanges.map((range) => (
                    <Tab key={range.key} title={range.title} />
                  ))}
                </Tabs>
              </div>
            </ModalHeader>

            <ModalBody className="p-6">
              <div className="h-[400px] w-full">{renderChart()}</div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
