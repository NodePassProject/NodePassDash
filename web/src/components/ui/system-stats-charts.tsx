import React, { useState, useEffect, useMemo } from "react";
import { Card, cn } from "@heroui/react";
import { tv } from "tailwind-variants";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Icon } from "@iconify/react";

import MiniCircularProgress from "./mini-circular-progress";

import {
  useSystemMonitorWS,
  SystemMonitorData,
} from "@/lib/hooks/use-system-monitor-ws";

// 生成模拟时间序列数据
const generateMockData = (baseValue: number, variance: number = 20) => {
  return Array.from({ length: 10 }, (_, i) => ({
    time: `${i}s`,
    value: Math.max(
      0,
      Math.min(100, baseValue + (Math.random() - 0.5) * variance),
    ),
  }));
};

// 生成双线数据（用于网络和磁盘的双指标显示）
const generateDualMockData = (
  baseValue1: number,
  baseValue2: number,
  variance: number = 20,
) => {
  return Array.from({ length: 10 }, (_, i) => ({
    time: `${i}s`,
    value1: Math.max(0, baseValue1 + (Math.random() - 0.5) * variance),
    value2: Math.max(0, baseValue2 + (Math.random() - 0.5) * variance),
  }));
};

// 图表卡片颜色变体
const chart = tv({
  slots: {
    card: "shadow-none border border-transparent",
    iconWrapper: "rounded-small p-2",
  },
  variants: {
    color: {
      default: {
        card: "bg-default-200/50",
        iconWrapper: "bg-default-200/50 text-default-700",
      },
      primary: {
        card: "bg-primary-50 dark:bg-primary-900/20",
        iconWrapper: "bg-primary-100 dark:bg-primary-500/20 text-primary",
      },
      secondary: {
        card: "bg-secondary-50 dark:bg-secondary-100/50",
        iconWrapper: "bg-secondary-100 dark:bg-secondary-100/50 text-secondary",
      },
      success: {
        card: "bg-success-50 dark:bg-success-100/50",
        iconWrapper: "bg-success-100 dark:bg-success-100/50 text-success",
      },
      warning: {
        card: "bg-warning-50 dark:bg-warning-100/50",
        iconWrapper: "bg-warning-100 dark:bg-warning-100/50 text-warning",
      },
      danger: {
        card: "bg-danger-50 dark:bg-danger-100/50",
        iconWrapper: "bg-danger-100 dark:bg-danger-100/50 text-danger",
      },
    },
  },
  defaultVariants: {
    color: "default",
  },
});

// 单指标图表组件
const SingleChart = ({ title, value, color, chartData, icon, index }: any) => {
  const classes = React.useMemo(() => chart({ color }), [color]);

  // 调试信息
  React.useEffect(() => {
    console.log(`[SingleChart ${title}] 数据更新:`, {
      value,
      chartDataLength: chartData?.length,
      chartData: chartData?.slice(-3),
    });
  }, [title, value, chartData]);

  return (
    <Card className={classes.card()}>
      <section className="flex flex-col flex-nowrap">
        <div className="flex justify-between items-start px-4 pt-4">
          <div className="flex items-center gap-2">
            <div className={classes.iconWrapper()}>
              <Icon
                className="text-inherit"
                height={16}
                icon={icon}
                width={16}
              />
            </div>
            <dt className="text-default-600 text-sm font-medium">{title}</dt>
          </div>
          <dd className="text-default-700 text-sm font-normal">{value}</dd>
        </div>
        <div className="min-h-24 w-full">
          {chartData.length > 0 && (
            <ResponsiveContainer className="[&_.recharts-surface]:outline-hidden">
              <AreaChart
                accessibilityLayer
                className="translate-y-1 scale-105"
                data={chartData}
              >
                <defs>
                  <linearGradient
                    id={"colorUv" + index}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="10%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <YAxis
                  domain={[
                    Math.min(...chartData.map((d: any) => d.value)),
                    "auto",
                  ]}
                  hide={true}
                />
                <Area
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  dataKey="value"
                  fill={`url(#colorUv${index})`}
                  stroke={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </Card>
  );
};

// 双指标图表组件
const DualChart = ({
  title,
  value1,
  value2,
  label1,
  label2,
  color,
  chartData,
  icon,
  index,
}: any) => {
  const classes = React.useMemo(() => chart({ color }), [color]);

  // 调试信息
  React.useEffect(() => {
    console.log(`[DualChart ${title}] 数据更新:`, {
      value1,
      value2,
      chartDataLength: chartData?.length,
      chartData: chartData?.slice(-3),
    });
  }, [title, value1, value2, chartData]);

  return (
    <Card className={classes.card()}>
      <section className="flex flex-col flex-nowrap">
        <div className="flex justify-between items-start px-4 pt-4">
          <div className="flex items-center gap-2">
            <div className={classes.iconWrapper()}>
              <Icon
                className="text-inherit"
                height={16}
                icon={icon}
                width={16}
              />
            </div>
            <dt className="text-default-600 text-sm font-medium">{title}</dt>
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <div
                  className={cn("w-2 h-2 rounded-full", {
                    "bg-success": color === "success",
                    "bg-primary": color === "primary",
                    "bg-secondary": color === "secondary",
                    "bg-warning": color === "warning",
                    "bg-danger": color === "danger",
                    "bg-foreground": color === "default",
                  })}
                />
                <span className="text-default-600 text-xs">{label1}</span>
              </div>
              <div className="text-default-700 text-xs font-normal">
                {value1}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <div
                  className={cn("w-2 h-2 rounded-full opacity-60", {
                    "bg-success": color === "success",
                    "bg-primary": color === "primary",
                    "bg-secondary": color === "secondary",
                    "bg-warning": color === "warning",
                    "bg-danger": color === "danger",
                    "bg-foreground": color === "default",
                  })}
                />
                <span className="text-default-600 text-xs">{label2}</span>
              </div>
              <div className="text-default-700 text-xs font-normal">
                {value2}
              </div>
            </div>
          </div>
        </div>
        <div className="min-h-24 w-full">
          {chartData.length > 0 && (
            <ResponsiveContainer className="[&_.recharts-surface]:outline-hidden">
              <AreaChart
                accessibilityLayer
                className="translate-y-1 scale-105"
                data={chartData}
              >
                <defs>
                  <linearGradient
                    id={"colorUv1_" + index}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="10%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient
                    id={"colorUv2_" + index}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="10%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="100%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <YAxis
                  domain={[
                    Math.min(
                      ...chartData.map((d: any) =>
                        Math.min(d.value1, d.value2),
                      ),
                    ),
                    "auto",
                  ]}
                  hide={true}
                />
                <Area
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  dataKey="value1"
                  fill={`url(#colorUv1_${index})`}
                  stroke={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  strokeWidth={1.5}
                />
                <Area
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  dataKey="value2"
                  fill={`url(#colorUv2_${index})`}
                  stroke={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  strokeOpacity={0.6}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </Card>
  );
};

// 内存专用图表组件
const MemoryChart = ({
  title,
  memUsed,
  memTotal,
  swapUsed,
  swapTotal,
  memPercent,
  swapPercent,
  color,
  chartData,
  icon,
  index,
}: any) => {
  const classes = React.useMemo(() => chart({ color }), [color]);

  // 格式化字节为 GiB 单位（2位小数）
  const formatToGiB = (bytes: number) => {
    if (!bytes || bytes === 0) return "0.00";
    const gib = bytes / (1024 * 1024 * 1024); // 转换为 GiB (1024进制)

    return gib.toFixed(2);
  };

  // 调试信息
  React.useEffect(() => {
    console.log(`[MemoryChart ${title}] 数据更新:`, {
      memUsed: `${formatToGiB(memUsed)} GiB`,
      memTotal: `${formatToGiB(memTotal)} GiB`,
      memPercent: `${memPercent}%`,
      swapUsed: `${formatToGiB(swapUsed)} GiB`,
      swapTotal: `${formatToGiB(swapTotal)} GiB`,
      swapPercent: `${swapPercent}%`,
      chartDataLength: chartData?.length,
    });
  }, [
    title,
    memUsed,
    memTotal,
    swapUsed,
    swapTotal,
    memPercent,
    swapPercent,
    chartData,
  ]);

  return (
    <Card className={classes.card()}>
      <section className="flex flex-col flex-nowrap">
        <div className="flex justify-between items-start px-4 pt-4">
          <div className="flex items-center gap-2">
            <div className={classes.iconWrapper()}>
              <Icon
                className="text-inherit"
                height={16}
                icon={icon}
                width={16}
              />
            </div>
            <dt className="text-default-600 text-sm font-medium">{title}</dt>
          </div>
          <div className="flex flex-col gap-2 text-left">
            {/* 有Swap时显示完整的内存信息，无Swap时只显示进度圆和数值 */}
            {swapTotal > 0 ? (
              <div className="flex items-center gap-1.5">
                <div
                  className={cn("w-2 h-2 rounded-full", {
                    "bg-success": color === "success",
                    "bg-primary": color === "primary",
                    "bg-secondary": color === "secondary",
                    "bg-warning": color === "warning",
                    "bg-danger": color === "danger",
                    "bg-foreground": color === "default",
                  })}
                />
                <span className="text-default-600 text-xs">内存</span>
                <MiniCircularProgress
                  color={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  size={14}
                  value={memPercent}
                />
                <span className="text-default-700 text-xs font-normal">
                  {formatToGiB(memUsed)} / {formatToGiB(memTotal)} GiB
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <MiniCircularProgress
                  color={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  size={14}
                  value={memPercent}
                />
                <span className="text-default-700 text-xs font-normal">
                  {formatToGiB(memUsed)} / {formatToGiB(memTotal)} GiB
                </span>
              </div>
            )}

            {/* Swap信息 - 只在有Swap时显示 */}
            {swapTotal > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className={cn("w-2 h-2 rounded-full opacity-60", {
                    "bg-success": color === "success",
                    "bg-primary": color === "primary",
                    "bg-secondary": color === "secondary",
                    "bg-warning": color === "warning",
                    "bg-danger": color === "danger",
                    "bg-foreground": color === "default",
                  })}
                />
                <span className="text-default-600 text-xs">Swap</span>
                <MiniCircularProgress
                  className="opacity-70"
                  color={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  size={14}
                  value={swapPercent}
                />
                <span className="text-default-700 text-xs font-normal">
                  {formatToGiB(swapUsed)} / {formatToGiB(swapTotal)} GiB
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="min-h-24 w-full">
          {chartData.length > 0 && (
            <ResponsiveContainer className="[&_.recharts-surface]:outline-hidden">
              <AreaChart
                accessibilityLayer
                className="translate-y-1 scale-105"
                data={chartData}
              >
                <defs>
                  <linearGradient
                    id={"colorUv1_" + index}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="10%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                  <linearGradient
                    id={"colorUv2_" + index}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="10%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="100%"
                      stopColor={cn({
                        "hsl(var(--heroui-success))": color === "success",
                        "hsl(var(--heroui-primary))": color === "primary",
                        "hsl(var(--heroui-secondary))": color === "secondary",
                        "hsl(var(--heroui-warning))": color === "warning",
                        "hsl(var(--heroui-danger))": color === "danger",
                        "hsl(var(--heroui-foreground))": color === "default",
                      })}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <YAxis
                  domain={[
                    Math.min(
                      ...chartData.map((d: any) =>
                        Math.min(d.value1, d.value2),
                      ),
                    ),
                    "auto",
                  ]}
                  hide={true}
                />
                <Area
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  dataKey="value1"
                  fill={`url(#colorUv1_${index})`}
                  stroke={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  strokeWidth={1.5}
                />
                <Area
                  animationDuration={800}
                  animationEasing="ease-in-out"
                  dataKey="value2"
                  fill={`url(#colorUv2_${index})`}
                  stroke={cn({
                    "hsl(var(--heroui-success))": color === "success",
                    "hsl(var(--heroui-primary))": color === "primary",
                    "hsl(var(--heroui-secondary))": color === "secondary",
                    "hsl(var(--heroui-warning))": color === "warning",
                    "hsl(var(--heroui-danger))": color === "danger",
                    "hsl(var(--heroui-foreground))": color === "default",
                  })}
                  strokeOpacity={0.6}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </Card>
  );
};

interface SystemStatsChartsProps {
  endpointId?: number | null;
  endpointOS?: string | null; // 主控操作系统
  endpointVersion?: string | null; // 主控版本
}

export default function SystemStatsCharts({
  endpointId,
  endpointOS,
  endpointVersion,
}: SystemStatsChartsProps) {
  const [dataHistory, setDataHistory] = useState<SystemMonitorData[]>([]);
  const [previousNetRx, setPreviousNetRx] = useState<number | null>(null);
  const [previousNetTx, setPreviousNetTx] = useState<number | null>(null);
  const [previousDiskR, setPreviousDiskR] = useState<number | null>(null);
  const [previousDiskW, setPreviousDiskW] = useState<number | null>(null);
  const [previousTimestamp, setPreviousTimestamp] = useState<number | null>(
    null,
  );
  const [netRxRate, setNetRxRate] = useState(0);
  const [netTxRate, setNetTxRate] = useState(0);
  const [diskRRate, setDiskRRate] = useState(0);
  const [diskWRate, setDiskWRate] = useState(0);

  // 版本比较函数
  const isVersionGreaterOrEqual = (
    version: string,
    targetVersion: string,
  ): boolean => {
    if (!version) return false;

    const parseVersion = (v: string) => {
      // 移除可能的前缀（如 'v'）并分割
      const cleanVersion = v.replace(/^v/, "");

      return cleanVersion.split(".").map((num) => parseInt(num, 10) || 0);
    };

    const current = parseVersion(version);
    const target = parseVersion(targetVersion);

    for (let i = 0; i < Math.max(current.length, target.length); i++) {
      const currentPart = current[i] || 0;
      const targetPart = target[i] || 0;

      if (currentPart > targetPart) return true;
      if (currentPart < targetPart) return false;
    }

    return true; // 版本相等
  };

  // 检查是否满足启动条件：实验模式 + 有端点ID + 操作系统是Linux + 版本>=1.6.0
  const shouldConnect =
    endpointId &&
    endpointOS?.toLowerCase() === "linux" &&
    endpointVersion &&
    isVersionGreaterOrEqual(endpointVersion, "1.6.0");

  // 使用系统监控WebSocket - 只有满足条件时才连接，并且要等待数据加载完成
  const wsEndpointId = useMemo(() => {
    // 只有当endpointDetail数据加载完成且满足条件时才返回endpointId
    return shouldConnect && endpointOS && endpointVersion ? endpointId : null;
  }, [shouldConnect, endpointId, endpointOS, endpointVersion]);

  const { latestData, isConnected } = useSystemMonitorWS(wsEndpointId, {
    onConnected: () => {
      // 清空历史数据，重新开始
      setDataHistory([]);
      setPreviousNetRx(null);
      setPreviousNetTx(null);
      setPreviousDiskR(null);
      setPreviousDiskW(null);
      setPreviousTimestamp(null);
      setNetRxRate(0);
      setNetTxRate(0);
      setDiskRRate(0);
      setDiskWRate(0);

      console.log("系统监控WebSocket连接成功");
    },
    onData: (data) => {
      console.log("[SystemStatsCharts] 收到系统监控数据:", data);

      // 使用数据中的 timestamp（已经处理为时间戳）
      const currentTimestamp = data.timestamp;

      if (!currentTimestamp) {
        console.warn("[SystemStatsCharts] 数据中缺少 timestamp，无法计算速率");

        return;
      }

      // 使用函数式更新来计算真实速率（数据差值 / 时间差值）
      setPreviousTimestamp((prevTime) => {
        if (prevTime !== null && currentTimestamp > prevTime) {
          // 计算时间差值（毫秒 -> 秒）
          const timeDiffMs = currentTimestamp - prevTime;
          const timeDiff = timeDiffMs / 1000;

          console.log("[SystemStatsCharts] 时间差值计算:", {
            prevTime: new Date(prevTime).toISOString(),
            currentTime: new Date(currentTimestamp).toISOString(),
            timeDiffMs: `${timeDiffMs}ms`,
            timeDiff: `${timeDiff.toFixed(2)}s`,
          });

          // 计算网络速率
          setPreviousNetRx((prevNetRx) => {
            if (
              data.netrx !== undefined &&
              prevNetRx !== null &&
              timeDiff > 0
            ) {
              const dataDiff = Math.max(0, data.netrx - prevNetRx); // 防止负值
              const rate = dataDiff / timeDiff; // 字节/秒

              setNetRxRate(rate);
              console.log("[SystemStatsCharts] 网络下行速率计算:", {
                prevValue: prevNetRx,
                currentValue: data.netrx,
                dataDiff: `${dataDiff} bytes`,
                timeDiff: `${timeDiff.toFixed(2)}s`,
                rate: `${(rate / 1024).toFixed(2)} KB/s`,
                rateMbps: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
              });
            } else if (data.netrx !== undefined) {
              setNetRxRate(0); // 第一次或无效数据
            }

            return data.netrx !== undefined ? data.netrx : prevNetRx;
          });

          setPreviousNetTx((prevNetTx) => {
            if (
              data.nettx !== undefined &&
              prevNetTx !== null &&
              timeDiff > 0
            ) {
              const dataDiff = Math.max(0, data.nettx - prevNetTx);
              const rate = dataDiff / timeDiff;

              setNetTxRate(rate);
              console.log("[SystemStatsCharts] 网络上行速率计算:", {
                prevValue: prevNetTx,
                currentValue: data.nettx,
                dataDiff: `${dataDiff} bytes`,
                timeDiff: `${timeDiff.toFixed(2)}s`,
                rate: `${(rate / 1024).toFixed(2)} KB/s`,
                rateMbps: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
              });
            } else if (data.nettx !== undefined) {
              setNetTxRate(0);
            }

            return data.nettx !== undefined ? data.nettx : prevNetTx;
          });

          // 计算磁盘I/O速率
          setPreviousDiskR((prevDiskR) => {
            if (
              data.diskr !== undefined &&
              prevDiskR !== null &&
              timeDiff > 0
            ) {
              const dataDiff = Math.max(0, data.diskr - prevDiskR);
              const rate = dataDiff / timeDiff;

              setDiskRRate(rate);
              console.log("[SystemStatsCharts] 磁盘读取速率计算:", {
                prevValue: prevDiskR,
                currentValue: data.diskr,
                dataDiff: `${dataDiff} bytes`,
                timeDiff: `${timeDiff.toFixed(2)}s`,
                rate: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
              });
            } else if (data.diskr !== undefined) {
              setDiskRRate(0);
            }

            return data.diskr !== undefined ? data.diskr : prevDiskR;
          });

          setPreviousDiskW((prevDiskW) => {
            if (
              data.diskw !== undefined &&
              prevDiskW !== null &&
              timeDiff > 0
            ) {
              const dataDiff = Math.max(0, data.diskw - prevDiskW);
              const rate = dataDiff / timeDiff;

              setDiskWRate(rate);
              console.log("[SystemStatsCharts] 磁盘写入速率计算:", {
                prevValue: prevDiskW,
                currentValue: data.diskw,
                dataDiff: `${dataDiff} bytes`,
                timeDiff: `${timeDiff.toFixed(2)}s`,
                rate: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
              });
            } else if (data.diskw !== undefined) {
              setDiskWRate(0);
            }

            return data.diskw !== undefined ? data.diskw : prevDiskW;
          });
        } else {
          // 第一次数据，初始化前一次的值
          console.log("[SystemStatsCharts] 初始化首次数据");
          setPreviousNetRx(data.netrx || null);
          setPreviousNetTx(data.nettx || null);
          setPreviousDiskR(data.diskr || null);
          setPreviousDiskW(data.diskw || null);
        }

        return currentTimestamp;
      });

      // 保持历史数据（最多20个点用于图表）
      setDataHistory((prev) => {
        const processedData = {
          ...data,
          timestamp: currentTimestamp,
        };

        const newHistory = [...prev, processedData].slice(-20);

        console.log(
          "[SystemStatsCharts] 历史数据更新，长度:",
          newHistory.length,
        );

        return newHistory;
      });
    },
  });

  // 格式化字节速率为字节速率格式
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B/s";
    if (bytes < 0) return "0 B/s"; // 防止负数

    const k = 1024; // 使用1024作为进制
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // 根据历史数据生成图表数据
  const cpuChartData = useMemo(() => {
    return dataHistory.map((item, index) => ({
      time: `${index}`,
      value: item.cpu || 0,
    }));
  }, [dataHistory]);

  const ramChartData = useMemo(() => {
    return dataHistory.map((item, index) => ({
      time: `${index}`,
      value1: item.ram || 0, // 内存使用率
      value2: item.swap || 0, // Swap使用率
    }));
  }, [dataHistory]);

  const networkChartData = useMemo(() => {
    return dataHistory.map((item, index) => ({
      time: `${index}`,
      value1: item.netrx || 0, // 下行速率
      value2: item.nettx || 0, // 上行速率
    }));
  }, [dataHistory]);

  const diskChartData = useMemo(() => {
    return dataHistory.map((item, index) => ({
      time: `${index}`,
      value1: item.diskr || 0, // 读取速率
      value2: item.diskw || 0, // 写入速率
    }));
  }, [dataHistory]);

  // 数据对象
  const currentCpuData = useMemo(() => {
    const cpuValue = latestData?.cpu || 0;

    console.log("[SystemStatsCharts] CPU 数据渲染:", {
      cpuValue,
      latestDataExists: !!latestData,
      timestamp: latestData?.timestamp,
      chartDataLength: cpuChartData.length,
    });

    return {
      title: "CPU",
      value: `${cpuValue.toFixed(1)}%`,
      chartData:
        cpuChartData.length > 0
          ? cpuChartData
          : [
              { time: "0", value: 0 },
              { time: "1", value: 0 },
            ],
      color: "primary",
      icon: "solar:cpu-bold",
    };
  }, [latestData?.cpu, latestData?.timestamp, cpuChartData]);

  const currentRamData = useMemo(() => {
    const memUsed = latestData?.mem_used || 0;
    const memTotal = latestData?.mem_total || 0;
    const swapUsed = latestData?.swap_used || 0;
    const swapTotal = latestData?.swap_total || 0;

    return {
      title: "RAM",
      memUsed,
      memTotal,
      swapUsed,
      swapTotal,
      memPercent: latestData?.ram || 0,
      swapPercent: latestData?.swap || 0,
      chartData:
        ramChartData.length > 0
          ? ramChartData
          : [
              { time: "0", value1: 0, value2: 0 },
              { time: "1", value1: 0, value2: 0 },
            ],
      color: "secondary",
      icon: "material-symbols:memory-alt",
    };
  }, [
    latestData?.ram,
    latestData?.swap,
    latestData?.mem_total,
    latestData?.mem_used,
    latestData?.swap_total,
    latestData?.swap_used,
    latestData?.timestamp,
    ramChartData,
  ]);

  const currentNetworkData = useMemo(
    () => ({
      title: "网络",
      value1: formatBytes(netTxRate),
      value2: formatBytes(netRxRate),
      label1: "上行",
      label2: "下行",
      chartData:
        networkChartData.length > 0
          ? networkChartData
          : [
              { time: "0", value1: 0, value2: 0 },
              { time: "1", value1: 0, value2: 0 },
            ],
      color: "success",
      icon: "solar:wi-fi-router-bold",
    }),
    [netTxRate, netRxRate, networkChartData],
  );

  const currentDiskData = useMemo(
    () => ({
      title: "磁盘",
      value1: formatBytes(diskRRate),
      value2: formatBytes(diskWRate),
      label1: "读取",
      label2: "写入",
      chartData:
        diskChartData.length > 0
          ? diskChartData
          : [
              { time: "0", value1: 0, value2: 0 },
              { time: "1", value1: 0, value2: 0 },
            ],
      color: "warning",
      icon: "solar:ssd-round-bold",
    }),
    [diskRRate, diskWRate, diskChartData],
  );

  // 调试信息
  useEffect(() => {
    console.log("[SystemStatsCharts] 组件状态:", {
      endpointId,
      endpointOS,
      endpointVersion,
      shouldConnect,
      isConnected,
      dataHistoryLength: dataHistory.length,
      latestData: latestData
        ? {
            cpu: latestData.cpu,
            ram: latestData.ram,
            swap: latestData.swap,
          }
        : null,
      currentRates: {
        netRxRate,
        netTxRate,
        diskRRate,
        diskWRate,
      },
    });
  }, [
    endpointId,
    endpointOS,
    endpointVersion,
    shouldConnect,
    isConnected,
    dataHistory.length,
    latestData,
    netRxRate,
    netTxRate,
    diskRRate,
    diskWRate,
  ]);

  // 如果不满足启动条件，显示提示信息
  if (!shouldConnect) {
    // 在实验模式下显示为什么不能连接的原因
    if ( endpointId) {
      const reasons = [];

      if (endpointOS?.toLowerCase() !== "linux") {
        reasons.push(
          `操作系统不支持(当前: ${endpointOS || "未知"}, 需要: Linux)`,
        );
      }
      if (
        !endpointVersion ||
        !isVersionGreaterOrEqual(endpointVersion, "1.6.0")
      ) {
        reasons.push(
          `版本不支持(当前: ${endpointVersion || "未知"}, 需要: >=1.6.0)`,
        );
      }

      if (reasons.length > 0) {
        return (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="sm:col-span-2 lg:col-span-4 p-4">
              <div className="text-center text-sm text-default-500">
                <div className="mb-2">⚠️ 系统监控图表不可用</div>
                <div className="text-xs space-y-1">
                  {reasons.map((reason, index) => (
                    <div key={index}>• {reason}</div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        );
      }
    }

    return <></>;
  }

  return (
    <div className="space-y-4">
      {/* 连接状态提示 */}
      {!isConnected && (
        <Card className="p-3 bg-warning-50 dark:bg-warning-900/20 border-warning-200">
          <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
            <div className="w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
            <span className="text-sm">正在连接系统监控服务...</span>
          </div>
        </Card>
      )}

      {/* 图表网格 */}
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CPU */}
        <SingleChart key="cpu-chart" {...currentCpuData} index="cpu" />

        {/* RAM - 使用专用的内存组件 */}
        <MemoryChart key="ram-chart" {...currentRamData} index="ram" />

        {/* 网络流量 */}
        <DualChart
          key="network-chart"
          {...currentNetworkData}
          index="network"
        />

        {/* 磁盘I/O */}
        <DualChart key="disk-chart" {...currentDiskData} index="disk" />
      </div>

      {/* 连接成功但无数据时的提示 */}
      {isConnected && dataHistory.length === 0 && (
        <Card className="p-3 bg-primary-50 dark:bg-primary-900/20 border-primary-200">
          <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
            <div className="w-2 h-2 rounded-full bg-primary-500" />
            <span className="text-sm">已连接，等待数据...</span>
          </div>
        </Card>
      )}
    </div>
  );
}
