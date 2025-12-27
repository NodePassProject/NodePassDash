"use client";

import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useTranslation } from "react-i18next";

import { type ChartConfig, ChartContainer } from "./chart";
import { SharedChartTooltip } from "./shared-chart-tooltip";

// 详细流量数据接口
interface DetailedTrafficDataPoint {
  timeStamp: string;
  tcpIn?: number;
  tcpOut?: number;
  udpIn?: number;
  udpOut?: number;
}

// 组件属性
interface DetailedTrafficChartProps {
  data: DetailedTrafficDataPoint[];
  height?: number;
  loading?: boolean;
  error?: string;
  className?: string;
  showFullData?: boolean; // 是否显示全部数据，默认false只显示1小时
}

// 横坐标时间格式化函数 - 综合nezha的相对时间显示
const formatAxisTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  // 对于横坐标，使用相对时间但适当简化
  if (hours > 24) {
    const days = Math.floor(hours / 24);

    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 5) {
    return `${minutes}m`;
  }

  // 5分钟内显示实际时间
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// 自定义Tooltip组件
const DetailedTrafficTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation("tunnels");

  return (
    <SharedChartTooltip
      active={active}
      items={payload
        ?.map((entry: any) => {
          let name = "";
          let color = "";

          switch (entry.dataKey) {
            case "tcpIn":
              name = t("details.chartTooltips.tcpInbound");
              color = "text-blue-600 dark:text-blue-400";
              break;
            case "tcpOut":
              name = t("details.chartTooltips.tcpOutbound");
              color = "text-green-600 dark:text-green-400";
              break;
            case "udpIn":
              name = t("details.chartTooltips.udpInbound");
              color = "text-purple-600 dark:text-purple-400";
              break;
            case "udpOut":
              name = t("details.chartTooltips.udpOutbound");
              color = "text-orange-600 dark:text-orange-400";
              break;
            default:
              name = entry.name || entry.dataKey;
              color = "text-default-600";
          }

          return {
            key: entry.dataKey,
            name,
            value: entry.value,
            color,
            unit: "traffic" as const,
          };
        })
        .filter((item: any) => item.value !== null && item.value !== undefined)}
      label={label}
      payload={payload}
    />
  );
};

// 加载状态组件
const LoadingState: React.FC<{ height: number; className?: string }> = ({
  height,
  className,
}) => {
  const { t } = useTranslation("tunnels");

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={height ? { height } : {}}
    >
      <div className="space-y-1 text-center">
        <div className="flex justify-center">
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 rounded-full border-2 border-default-200 border-t-primary animate-spin" />
          </div>
        </div>
        <p className="text-default-500 animate-pulse text-xs">
          {t("details.chartStates.loading")}
        </p>
      </div>
    </div>
  );
};

// 错误状态组件
const ErrorState: React.FC<{
  error: string;
  height: number;
  className?: string;
}> = ({ error, height, className }) => {
  const { t } = useTranslation("tunnels");

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={height ? { height } : {}}
    >
      <div className="text-center">
        <p className="text-danger text-xs">{t("details.chartStates.loadFailed")}</p>
        <p className="text-default-400 text-xs mt-0.5">{error}</p>
      </div>
    </div>
  );
};

// 空状态组件
const EmptyState: React.FC<{ height: number; className?: string }> = ({
  height,
  className,
}) => {
  const { t } = useTranslation("tunnels");

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={height ? { height } : {}}
    >
      <div className="text-center">
        <p className="text-default-400 text-xs">{t("details.chartStates.noData")}</p>
      </div>
    </div>
  );
};

// 时间过滤函数 - 过滤出1小时内的数据
const filterDataTo1Hour = (data: DetailedTrafficDataPoint[]) => {
  if (data.length === 0) return data;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  return data.filter((item) => {
    try {
      const itemTime = new Date(item.timeStamp);

      return !isNaN(itemTime.getTime()) && itemTime >= oneHourAgo;
    } catch (error) {
      return false;
    }
  });
};

export const DetailedTrafficChart: React.FC<DetailedTrafficChartProps> = ({
  data,
  height = 140,
  loading = false,
  error,
  className = "",
  showFullData = false,
}) => {
  const { t } = useTranslation("tunnels");

  const chartConfig = {
    tcpIn: {
      label: t("details.chartTooltips.tcpInbound"),
      color: "hsl(217 91% 60%)",
    },
    tcpOut: {
      label: t("details.chartTooltips.tcpOutbound"),
      color: "hsl(142 76% 36%)",
    },
    udpIn: {
      label: t("details.chartTooltips.udpInbound"),
      color: "hsl(262 83% 58%)",
    },
    udpOut: {
      label: t("details.chartTooltips.udpOutbound"),
      color: "hsl(25 95% 53%)",
    },
  } satisfies ChartConfig;

  // 处理加载状态
  if (loading && data.length === 0) {
    return <LoadingState className={className} height={height} />;
  }

  // 处理错误状态
  if (error) {
    return <ErrorState className={className} error={error} height={height} />;
  }

  // 处理空数据状态
  if (data.length === 0) {
    return <EmptyState className={className} height={height} />;
  }

  // 计算最大流量值用于Y轴范围
  const allValues = data.reduce((acc: number[], item) => {
    if (item.tcpIn !== undefined && item.tcpIn !== null) acc.push(item.tcpIn);
    if (item.tcpOut !== undefined && item.tcpOut !== null)
      acc.push(item.tcpOut);
    if (item.udpIn !== undefined && item.udpIn !== null) acc.push(item.udpIn);
    if (item.udpOut !== undefined && item.udpOut !== null)
      acc.push(item.udpOut);

    return acc;
  }, []);

  const maxTraffic = allValues.length > 0 ? Math.max(...allValues) : 0;
  // 确保Y轴最大值至少不为0，避免domain异常
  const yAxisMax = maxTraffic > 0 ? Math.ceil(maxTraffic * 1.1) : 1024; // 1KB作为默认值

  // 根据showFullData决定是否过滤数据到1小时
  const filteredData = showFullData ? data : filterDataTo1Hour(data);

  return (
    <ChartContainer
      className={`aspect-auto w-full ${className}`}
      config={chartConfig}
      style={{ height }}
    >
      <AreaChart
        accessibilityLayer
        data={filteredData}
        margin={{
          top: 12,
          left: 12,
          right: 12,
          bottom: 12,
        }}
      >
        <CartesianGrid strokeDasharray="3" vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="timeStamp"
          interval="preserveStartEnd"
          minTickGap={200}
          tickFormatter={formatAxisTime}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          domain={[0, yAxisMax]}
          minTickGap={20}
          mirror={true}
          tickCount={5}
          tickFormatter={(value) => {
            if (value === 0) return "0";
            if (value >= 1024 * 1024 * 1024) {
              return `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`;
            }
            if (value >= 1024 * 1024) {
              return `${(value / (1024 * 1024)).toFixed(1)}MB`;
            }
            if (value >= 1024) {
              return `${(value / 1024).toFixed(1)}KB`;
            }

            return `${Math.round(value)}B`;
          }}
          tickLine={false}
          tickMargin={-15}
          type="number"
        />
        <Tooltip content={<DetailedTrafficTooltip />} />

        {/* TCP入站 */}
        <Area
          dataKey="tcpIn"
          fill={chartConfig.tcpIn.color}
          fillOpacity={0.2}
          isAnimationActive={false}
          name={chartConfig.tcpIn.label}
          stroke={chartConfig.tcpIn.color}
          strokeWidth={2}
          type="monotone"
        />

        {/* TCP出站 */}
        <Area
          dataKey="tcpOut"
          fill={chartConfig.tcpOut.color}
          fillOpacity={0.2}
          isAnimationActive={false}
          name={chartConfig.tcpOut.label}
          stroke={chartConfig.tcpOut.color}
          strokeWidth={2}
          type="monotone"
        />

        {/* UDP入站 */}
        <Area
          dataKey="udpIn"
          fill={chartConfig.udpIn.color}
          fillOpacity={0.2}
          isAnimationActive={false}
          name={chartConfig.udpIn.label}
          stroke={chartConfig.udpIn.color}
          strokeWidth={2}
          type="monotone"
        />

        {/* UDP出站 */}
        <Area
          dataKey="udpOut"
          fill={chartConfig.udpOut.color}
          fillOpacity={0.2}
          isAnimationActive={false}
          name={chartConfig.udpOut.label}
          stroke={chartConfig.udpOut.color}
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
};
