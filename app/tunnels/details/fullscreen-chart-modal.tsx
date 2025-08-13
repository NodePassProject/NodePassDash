"use client";

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
import { faXmark, faRefresh } from "@fortawesome/free-solid-svg-icons";
import { TrafficUsageChart } from "@/components/ui/traffic-usage-chart";
import { SpeedChart } from "@/components/ui/speed-chart";
import { PoolChart } from "@/components/ui/pool-chart";
import { LatencyChart } from "@/components/ui/latency-chart";

// 图表类型
type ChartType = "traffic" | "speed" | "pool" | "latency";

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
  latencyData?: LatencyDataPoint[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
}

// 时间范围选项
const timeRanges = [
  { key: "1h", title: "1小时" },
  { key: "6h", title: "6小时" },
  { key: "12h", title: "12小时" },
  { key: "24h", title: "24小时" },
];

// 根据时间范围过滤数据
const filterDataByTimeRange = (data: any[], timeRange: string) => {
  if (data.length === 0) return data;
  
  const now = new Date();
  const hoursAgo = timeRange === "1h" ? 1 : timeRange === "6h" ? 6 : timeRange === "12h" ? 12 : 24;
  const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
  
  return data.filter((item) => {
    try {
      const itemTime = new Date(item.timeStamp);
      return !isNaN(itemTime.getTime()) && itemTime >= cutoffTime;
    } catch (error) {
      console.error(`时间解析错误: ${item.timeStamp}`, error);
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
  latencyData = [],
  loading = false,
  error,
  onRefresh,
}) => {
  const [timeRange, setTimeRange] = React.useState<string>("24h");

  // 根据图表类型获取对应的数据
  const getCurrentData = () => {
    switch (chartType) {
      case "traffic":
        return filterDataByTimeRange(trafficData, timeRange);
      case "speed":
        return filterDataByTimeRange(speedData, timeRange);
      case "pool":
        return filterDataByTimeRange(poolData, timeRange);
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
      case "latency":
        return <LatencyChart {...chartProps} />;
      default:
        return null;
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      size="5xl"
      scrollBehavior="inside"
      classNames={{
        base: "mx-4",
        body: "p-0",
      }}
    >
      <ModalContent className="max-h-[90vh]">
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center justify-between border-b pb-4">
              <h3 className="text-xl font-bold">{title}</h3>
              
              <div className="flex items-center gap-3">
                {/* 刷新按钮 */}
                <Button
                  size="sm"
                  variant="flat"
                  isIconOnly
                  onPress={onRefresh}
                  isLoading={loading}
                  className="h-8 w-8 min-w-0"
                >
                  <FontAwesomeIcon icon={faRefresh} className="text-sm" />
                </Button>
                
                {/* 时间范围选择 */}
                <Tabs 
                  selectedKey={timeRange}
                  onSelectionChange={(key) => setTimeRange(key as string)}
                  size="sm"
                  variant="light"
                  classNames={{
                    tabList: "gap-1",
                    tab: "text-sm px-3 py-2 min-w-0 h-8",
                    tabContent: "text-sm"
                  }}
                >
                  {timeRanges.map(range => (
                    <Tab key={range.key} title={range.title} />
                  ))}
                </Tabs>
              </div>
            </ModalHeader>
            
            <ModalBody className="p-6">
              <div className="h-[400px] w-full">
                {renderChart()}
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
