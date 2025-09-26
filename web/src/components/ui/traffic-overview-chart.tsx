import React from "react";
import { Card, cn } from "@heroui/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

// 流量数据类型
type TrafficData = {
  time: string;
  tcpIn: number;
  tcpOut: number;
  udpIn: number;
  udpOut: number;
};

// 时间范围类型
type TimeRange = "7Days" | "3Days" | "24Hours" | "12Hours";

// 流量指标类型
type TrafficMetric = {
  key: string;
  title: string;
  value: number;
  suffix: string;
  type: "number";
  change: string;
  changeType: "positive" | "negative" | "neutral";
  color: string;
  dataKey: keyof TrafficData;
};

interface TrafficOverviewChartProps {
  data: TrafficData[];
  loading?: boolean;
  onTimeRangeChange?: (range: TimeRange) => void;
  timeRange?: TimeRange;
}

// 流量单位转换函数
const formatTrafficValue = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.abs(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return {
    value: value.toFixed(2),
    unit: units[unitIndex],
  };
};

// 根据数据选择最合适的统一单位
const getBestUnit = (values: number[]) => {
  if (values.length === 0) return { unit: "B", divisor: 1 };

  const maxValue = Math.max(...values);
  const units = ["B", "KB", "MB", "GB", "TB"];
  const divisors = [
    1,
    1024,
    1024 * 1024,
    1024 * 1024 * 1024,
    1024 * 1024 * 1024 * 1024,
  ];

  let unitIndex = 0;
  let testValue = maxValue;

  while (testValue >= 1024 && unitIndex < units.length - 1) {
    testValue /= 1024;
    unitIndex++;
  }

  return {
    unit: units[unitIndex],
    divisor: divisors[unitIndex],
  };
};

// 横坐标时间格式化函数 - 参考speed-chart的实现
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

// Tooltip时间格式化函数 - 显示实际时间
const formatTooltipTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffHours < 24) {
    // 24小时内只显示时分
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } else {
    // 超过24小时显示月日时分
    return date
      .toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
      .replace(/\//g, "-");
  }
};

function TrafficOverviewChartComponent({
  data,
  loading = false,
  onTimeRangeChange,
  timeRange = "24Hours",
}: TrafficOverviewChartProps) {
  const [activeMetric, setActiveMetric] = React.useState<string>("tcp-in");

  // 计算流量指标数据
  const trafficMetrics = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    // 计算当前值和变化率
    const currentValues = {
      tcpIn: data[data.length - 1]?.tcpIn || 0,
      tcpOut: data[data.length - 1]?.tcpOut || 0,
      udpIn: data[data.length - 1]?.udpIn || 0,
      udpOut: data[data.length - 1]?.udpOut || 0,
    };

    const previousValues = {
      tcpIn: data[Math.max(0, data.length - 2)]?.tcpIn || 0,
      tcpOut: data[Math.max(0, data.length - 2)]?.tcpOut || 0,
      udpIn: data[Math.max(0, data.length - 2)]?.udpIn || 0,
      udpOut: data[Math.max(0, data.length - 2)]?.udpOut || 0,
    };

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? "+100%" : "0%";
      const change = ((current - previous) / previous) * 100;

      return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
    };

    const getChangeType = (
      current: number,
      previous: number,
    ): "positive" | "negative" | "neutral" => {
      if (previous === 0) return current > 0 ? "positive" : "neutral";
      const change = current - previous;

      if (change > 0) return "positive";
      if (change < 0) return "negative";

      return "neutral";
    };

    return [
      {
        key: "tcp-in",
        title: "TCP In",
        value: currentValues.tcpIn,
        suffix: "",
        type: "number" as const,
        change: calculateChange(currentValues.tcpIn, previousValues.tcpIn),
        changeType: getChangeType(currentValues.tcpIn, previousValues.tcpIn),
        color: "primary",
        dataKey: "tcpIn" as keyof TrafficData,
      },
      {
        key: "tcp-out",
        title: "TCP Out",
        value: currentValues.tcpOut,
        suffix: "",
        type: "number" as const,
        change: calculateChange(currentValues.tcpOut, previousValues.tcpOut),
        changeType: getChangeType(currentValues.tcpOut, previousValues.tcpOut),
        color: "success",
        dataKey: "tcpOut" as keyof TrafficData,
      },
      {
        key: "udp-in",
        title: "UDP In",
        value: currentValues.udpIn,
        suffix: "",
        type: "number" as const,
        change: calculateChange(currentValues.udpIn, previousValues.udpIn),
        changeType: getChangeType(currentValues.udpIn, previousValues.udpIn),
        color: "warning",
        dataKey: "udpIn" as keyof TrafficData,
      },
      {
        key: "udp-out",
        title: "UDP Out",
        value: currentValues.udpOut,
        suffix: "",
        type: "number" as const,
        change: calculateChange(currentValues.udpOut, previousValues.udpOut),
        changeType: getChangeType(currentValues.udpOut, previousValues.udpOut),
        color: "danger",
        dataKey: "udpOut" as keyof TrafficData,
      },
    ];
  }, [data]);

  // 获取当前活跃的指标数据
  const activeMetricData = React.useMemo(() => {
    const metric = trafficMetrics.find((m) => m.key === activeMetric);

    return {
      metric,
      color: metric?.color || "primary",
      dataKey: metric?.dataKey || "tcpIn",
    };
  }, [activeMetric, trafficMetrics]);

  // 处理时间范围变化
  const handleTimeRangeChange = (key: React.Key) => {
    const newRange = key as TimeRange;

    onTimeRangeChange?.(newRange);
  };

  // 格式化数值显示
  const formatValue = (value: number, type: string | undefined) => {
    if (type === "number") {
      const { value: formattedValue, unit } = formatTrafficValue(value);

      return { value: formattedValue, unit };
    }

    return { value: value.toString(), unit: "" };
  };

  // 获取最佳单位用于图表显示 - 优化内存使用
  const chartUnit = React.useMemo(() => {
    if (!data || data.length === 0) return "B";

    // 直接计算最大值，避免创建大型数组
    let maxValue = 0;

    for (const item of data) {
      maxValue = Math.max(
        maxValue,
        item.tcpIn,
        item.tcpOut,
        item.udpIn,
        item.udpOut,
      );
    }

    const { unit } = getBestUnit([maxValue]);

    return unit;
  }, [data]);

  // 转换数据为图表格式 - 优化内存使用
  const chartData = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    // 使用更高效的方式计算最大值，避免创建大型中间数组
    let maxValue = 0;

    for (const item of data) {
      const values = [item.tcpIn, item.tcpOut, item.udpIn, item.udpOut];
      const localMax = Math.max(...values);

      if (localMax > maxValue) {
        maxValue = localMax;
      }
    }

    const { divisor } = getBestUnit([maxValue]);

    // 直接返回转换后的数据，避免多次数组操作
    return data.map((item) => ({
      time: item.time, // 保持原始时间戳用于格式化
      tcpIn: Math.round((item.tcpIn / divisor) * 100) / 100, // 使用Math.round代替parseFloat
      tcpOut: Math.round((item.tcpOut / divisor) * 100) / 100,
      udpIn: Math.round((item.udpIn / divisor) * 100) / 100,
      udpOut: Math.round((item.udpOut / divisor) * 100) / 100,
    }));
  }, [data, timeRange]);

  if (loading) {
    return (
      <Card className="h-full min-h-[400px] dark:border-default-100 border border-transparent">
        <div className="flex items-center justify-center h-full">
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
              </div>
            </div>
            <p className="text-default-500 animate-pulse text-sm md:text-base">
              加载流量数据中...
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="h-full min-h-[400px] dark:border-default-100 border border-transparent">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-default-500 text-base md:text-lg">
              暂无流量数据
            </p>
            <p className="text-default-400 text-xs md:text-sm mt-2">
              当有实例运行时，流量趋势数据将在此显示
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      as="dl"
      className="h-[470px] dark:border-default-100 border border-transparent"
    >
      <section className="flex flex-col flex-nowrap h-full">
        <div className="flex flex-col justify-between gap-y-2 p-5 flex-shrink-0">
          <div className="flex flex-col gap-y-2">
            <div className="flex flex-col gap-y-0">
              <span className="text-base font-semibold text-foreground">
                流量总耗
              </span>
            </div>
            <div className="mt-2 flex w-full items-center">
              <div className="-my-3 flex w-full max-w-[800px] items-center gap-x-3 overflow-x-auto py-3">
                {trafficMetrics.map(
                  ({ key, change, changeType, type, value, title }) => (
                    <button
                      key={key}
                      className={cn(
                        "rounded-medium flex w-full flex-col gap-2 p-3 transition-colors",
                        {
                          "bg-default-100": activeMetric === key,
                        },
                      )}
                      onClick={() => setActiveMetric(key)}
                    >
                      <span
                        className={cn(
                          "text-small text-default-500 font-medium transition-colors",
                          {
                            "text-primary": activeMetric === key,
                          },
                        )}
                      >
                        {title}
                      </span>
                      <div className="flex items-center gap-x-3">
                        <span className="text-foreground text-3xl font-bold">
                          {(() => {
                            const formatted = formatValue(value, type);

                            return (
                              <>
                                <span>{formatted.value}</span>
                                {formatted.unit && (
                                  <span className="text-2xl font-bold ml-1">
                                    {formatted.unit}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </span>
                      </div>
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
        <ResponsiveContainer
          className="flex-1 min-h-[300px] [&_.recharts-surface]:outline-hidden"
          height="100%"
          width="100%"
        >
          <AreaChart
            data={chartData}
            margin={{
              left: 0,
              right: 0,
            }}
          >
            <defs>
              <linearGradient id="colorGradient" x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="10%"
                  stopColor={`hsl(var(--heroui-${activeMetricData.color}-500))`}
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor={`hsl(var(--heroui-${activeMetricData.color}-100))`}
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              horizontalCoordinatesGenerator={() => [200, 150, 100, 50]}
              stroke="hsl(var(--heroui-default-200))"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="time"
              style={{
                fontSize: "var(--heroui-font-size-tiny)",
                transform: "translateX(-40px)",
              }}
              tickFormatter={formatAxisTime}
              tickLine={false}
            />
            <Tooltip
              content={({ label, payload }) => (
                <div className="rounded-medium bg-foreground text-tiny shadow-small flex h-auto min-w-[120px] items-center gap-x-2 p-2">
                  <div className="flex w-full flex-col gap-y-0">
                    {payload?.map((p, index) => {
                      const name = p.name;
                      const value = p.value;

                      return (
                        <div
                          key={`${index}-${name}`}
                          className="flex w-full items-center gap-x-2"
                        >
                          <div className="text-small text-background flex w-full items-center gap-x-1">
                            {(() => {
                              const formatted = formatValue(
                                value as number,
                                activeMetricData.metric?.type,
                              );

                              return (
                                <>
                                  <span>{formatted.value}</span>
                                  {formatted.unit && (
                                    <span>{formatted.unit}</span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                    <span className="text-small text-foreground-400 font-medium">
                      {formatTooltipTime(label as string)}
                    </span>
                  </div>
                </div>
              )}
              cursor={{
                strokeWidth: 0,
              }}
            />
            <Area
              activeDot={{
                stroke: `hsl(var(--heroui-${activeMetricData.color}))`,
                strokeWidth: 2,
                fill: "hsl(var(--heroui-background))",
                r: 5,
              }}
              animationDuration={1000}
              animationEasing="ease"
              dataKey={activeMetricData.dataKey}
              fill="url(#colorGradient)"
              stroke={`hsl(var(--heroui-${activeMetricData.color}))`}
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>
    </Card>
  );
}

// 使用React.memo优化渲染性能，减少不必要的重新渲染
export const TrafficOverviewChart = React.memo(TrafficOverviewChartComponent);
