"use client";

import React, { useState, useMemo } from "react";
import { Card, cn, tv } from "@heroui/react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { addToast } from "@heroui/toast";

import {
  useTunnelMonitorWS,
  TunnelMonitorData,
} from "@/lib/hooks/use-tunnel-monitor-ws";

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

// 生成双线数据（用于流量和连接数的双指标显示）
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
const SingleChart = ({ title, value, color, chartData, index }: any) => {
  const classes = React.useMemo(() => chart({ color }), [color]);

  return (
    <Card className={classes.card()}>
      <section className="flex flex-col flex-nowrap">
        <div className="flex justify-between items-start px-4 pt-4">
          <div className="flex items-center gap-2">
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
  index,
}: any) => {
  const classes = React.useMemo(() => chart({ color }), [color]);

  return (
    <Card className={classes.card()}>
      <section className="flex flex-col flex-nowrap">
        <div className="flex justify-between items-start px-4 pt-4">
          <div className="flex items-center gap-2">
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

interface TunnelStatsChartsProps {
  instanceId?: string | null;
  isExperimentalMode?: boolean;
}

export default function TunnelStatsCharts({
  instanceId,
  isExperimentalMode = true,
}: TunnelStatsChartsProps) {
  console.log("[TunnelStatsCharts] 组件初始化:", {
    instanceId,
    isExperimentalMode,
  });
  const [dataHistory, setDataHistory] = useState<TunnelMonitorData[]>([]);
  const [previousTcpRx, setPreviousTcpRx] = useState<number | null>(null);
  const [previousTcpTx, setPreviousTcpTx] = useState<number | null>(null);
  const [previousUdpRx, setPreviousUdpRx] = useState<number | null>(null);
  const [previousUdpTx, setPreviousUdpTx] = useState<number | null>(null);
  const [previousTimestamp, setPreviousTimestamp] = useState<number | null>(
    null,
  );
  const [tcpRxRate, setTcpRxRate] = useState(0);
  const [tcpTxRate, setTcpTxRate] = useState(0);
  const [udpRxRate, setUdpRxRate] = useState(0);
  const [udpTxRate, setUdpTxRate] = useState(0);

  // 检查是否满足启动条件：实验模式 + 有实例ID
  const shouldConnect = isExperimentalMode && instanceId;

  // 使用隧道监控WebSocket - 只有满足条件时才连接
  const { latestData, isConnected } = useTunnelMonitorWS(
    shouldConnect ? instanceId : null,
    {
      onConnected: () => {
        // 清空历史数据，重新开始
        setDataHistory([]);
        setPreviousTcpRx(null);
        setPreviousTcpTx(null);
        setPreviousUdpRx(null);
        setPreviousUdpTx(null);
        setPreviousTimestamp(null);
        setTcpRxRate(0);
        setTcpTxRate(0);
        setUdpRxRate(0);
        setUdpTxRate(0);

        addToast({
          title: "隧道监控WebSocket连接成功",
          description: "开始接收实时隧道性能数据",
          color: "success",
        });
      },
      onData: (data) => {
        console.log("[TunnelStatsCharts] 收到隧道监控数据:", data);

        // 使用数据中的 timestamp
        const currentTimestamp = data.timestamp;

        if (!currentTimestamp) {
          console.warn(
            "[TunnelStatsCharts] 数据中缺少 timestamp，无法计算速率",
          );

          return;
        }

        // 使用函数式更新来计算真实速率（数据差值 / 时间差值）
        setPreviousTimestamp((prevTime) => {
          if (prevTime !== null && currentTimestamp > prevTime) {
            // 计算时间差值（毫秒 -> 秒）
            const timeDiffMs = currentTimestamp - prevTime;
            const timeDiff = timeDiffMs / 1000;

            console.log("[TunnelStatsCharts] 时间差值计算:", {
              prevTime: new Date(prevTime).toISOString(),
              currentTime: new Date(currentTimestamp).toISOString(),
              timeDiffMs: `${timeDiffMs}ms`,
              timeDiff: `${timeDiff.toFixed(2)}s`,
            });

            // 计算TCP速率
            setPreviousTcpRx((prevTcpRx) => {
              if (
                data.tcpRx !== undefined &&
                prevTcpRx !== null &&
                timeDiff > 0
              ) {
                const dataDiff = Math.max(0, data.tcpRx - prevTcpRx); // 防止负值
                const rate = dataDiff / timeDiff; // 字节/秒

                setTcpRxRate(rate);
                console.log("[TunnelStatsCharts] TCP下行速率计算:", {
                  prevValue: prevTcpRx,
                  currentValue: data.tcpRx,
                  dataDiff: `${dataDiff} bytes`,
                  timeDiff: `${timeDiff.toFixed(2)}s`,
                  rate: `${(rate / 1024).toFixed(2)} KB/s`,
                  rateMbps: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
                });
              } else if (data.tcpRx !== undefined) {
                setTcpRxRate(0); // 第一次或无效数据
              }

              return data.tcpRx !== undefined ? data.tcpRx : prevTcpRx;
            });

            setPreviousTcpTx((prevTcpTx) => {
              if (
                data.tcpTx !== undefined &&
                prevTcpTx !== null &&
                timeDiff > 0
              ) {
                const dataDiff = Math.max(0, data.tcpTx - prevTcpTx);
                const rate = dataDiff / timeDiff;

                setTcpTxRate(rate);
                console.log("[TunnelStatsCharts] TCP上行速率计算:", {
                  prevValue: prevTcpTx,
                  currentValue: data.tcpTx,
                  dataDiff: `${dataDiff} bytes`,
                  timeDiff: `${timeDiff.toFixed(2)}s`,
                  rate: `${(rate / 1024).toFixed(2)} KB/s`,
                  rateMbps: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
                });
              } else if (data.tcpTx !== undefined) {
                setTcpTxRate(0);
              }

              return data.tcpTx !== undefined ? data.tcpTx : prevTcpTx;
            });

            // 计算UDP速率
            setPreviousUdpRx((prevUdpRx) => {
              if (
                data.udpRx !== undefined &&
                prevUdpRx !== null &&
                timeDiff > 0
              ) {
                const dataDiff = Math.max(0, data.udpRx - prevUdpRx);
                const rate = dataDiff / timeDiff;

                setUdpRxRate(rate);
                console.log("[TunnelStatsCharts] UDP下行速率计算:", {
                  prevValue: prevUdpRx,
                  currentValue: data.udpRx,
                  dataDiff: `${dataDiff} bytes`,
                  timeDiff: `${timeDiff.toFixed(2)}s`,
                  rate: `${(rate / 1024).toFixed(2)} KB/s`,
                  rateMbps: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
                });
              } else if (data.udpRx !== undefined) {
                setUdpRxRate(0);
              }

              return data.udpRx !== undefined ? data.udpRx : prevUdpRx;
            });

            setPreviousUdpTx((prevUdpTx) => {
              if (
                data.udpTx !== undefined &&
                prevUdpTx !== null &&
                timeDiff > 0
              ) {
                const dataDiff = Math.max(0, data.udpTx - prevUdpTx);
                const rate = dataDiff / timeDiff;

                setUdpTxRate(rate);
                console.log("[TunnelStatsCharts] UDP上行速率计算:", {
                  prevValue: prevUdpTx,
                  currentValue: data.udpTx,
                  dataDiff: `${dataDiff} bytes`,
                  timeDiff: `${timeDiff.toFixed(2)}s`,
                  rate: `${(rate / 1024).toFixed(2)} KB/s`,
                  rateMbps: `${(rate / 1024 / 1024).toFixed(2)} MB/s`,
                });
              } else if (data.udpTx !== undefined) {
                setUdpTxRate(0);
              }

              return data.udpTx !== undefined ? data.udpTx : prevUdpTx;
            });
          } else {
            // 第一次数据，初始化前一次的值
            console.log("[TunnelStatsCharts] 初始化首次数据");
            setPreviousTcpRx(data.tcpRx || null);
            setPreviousTcpTx(data.tcpTx || null);
            setPreviousUdpRx(data.udpRx || null);
            setPreviousUdpTx(data.udpTx || null);
          }

          return currentTimestamp;
        });

        // 保持历史数据（最多10个点用于图表）
        setDataHistory((prev) => {
          const processedData = {
            ...data,
            timestamp: currentTimestamp,
          };

          const newHistory = [...prev, processedData].slice(-10);

          console.log(
            "[TunnelStatsCharts] 历史数据更新，长度:",
            newHistory.length,
          );

          return newHistory;
        });
      },
    },
  );

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
  const tcpTrafficChartData = useMemo(() => {
    const chartData = dataHistory.map((item, index) => ({
      time: `${index}`,
      value1: item.tcpRx || 0, // TCP接收
      value2: item.tcpTx || 0, // TCP发送
    }));

    console.log("[TunnelStatsCharts] TCP流量图表数据更新:", chartData);

    return chartData;
  }, [dataHistory]);

  const udpTrafficChartData = useMemo(() => {
    const chartData = dataHistory.map((item, index) => ({
      time: `${index}`,
      value1: item.udpRx || 0, // UDP接收
      value2: item.udpTx || 0, // UDP发送
    }));

    console.log("[TunnelStatsCharts] UDP流量图表数据更新:", chartData);

    return chartData;
  }, [dataHistory]);

  const latencyChartData = useMemo(() => {
    const chartData = dataHistory.map((item, index) => ({
      time: `${index}`,
      value: item.ping || 0,
    }));

    console.log("[TunnelStatsCharts] 延迟图表数据更新:", chartData);

    return chartData;
  }, [dataHistory]);

  const connectionChartData = useMemo(() => {
    const chartData = dataHistory.map((item, index) => ({
      time: `${index}`,
      value1: item.pool || 0, // 连接池
      value2: (item.tcps || 0) + (item.udps || 0), // 总连接数
    }));

    console.log("[TunnelStatsCharts] 连接数图表数据更新:", chartData);

    return chartData;
  }, [dataHistory]);

  // 使用实际速率数据，没有数据时提供最小默认图表数据
  const currentTcpData = useMemo(() => {
    const data = {
      title: "TCP流量",
      value1: formatBytes(tcpTxRate),
      value2: formatBytes(tcpRxRate),
      label1: "发送",
      label2: "接收",
      chartData:
        tcpTrafficChartData.length > 0
          ? tcpTrafficChartData
          : [
              { time: "0", value1: 0, value2: 0 },
              { time: "1", value1: 0, value2: 0 },
            ],
      color: "primary",
      icon: "solar:transmission-bold",
    };

    console.log("[TunnelStatsCharts] TCP数据对象更新:", {
      sendRate: data.value1,
      receiveRate: data.value2,
      chartLength: data.chartData.length,
      tcpTxRate,
      tcpRxRate,
    });

    return data;
  }, [tcpTxRate, tcpRxRate, tcpTrafficChartData]);

  const currentUdpData = useMemo(() => {
    const data = {
      title: "UDP流量",
      value1: formatBytes(udpTxRate),
      value2: formatBytes(udpRxRate),
      label1: "发送",
      label2: "接收",
      chartData:
        udpTrafficChartData.length > 0
          ? udpTrafficChartData
          : [
              { time: "0", value1: 0, value2: 0 },
              { time: "1", value1: 0, value2: 0 },
            ],
      color: "secondary",
      icon: "solar:transmission-square-bold",
    };

    console.log("[TunnelStatsCharts] UDP数据对象更新:", {
      sendRate: data.value1,
      receiveRate: data.value2,
      chartLength: data.chartData.length,
      udpTxRate,
      udpRxRate,
    });

    return data;
  }, [udpTxRate, udpRxRate, udpTrafficChartData]);

  const currentLatencyData = useMemo(() => {
    const data = {
      title: "延迟",
      value: `${latestData?.ping || 0}ms`,
      chartData:
        latencyChartData.length > 0
          ? latencyChartData
          : [
              { time: "0", value: 0 },
              { time: "1", value: 0 },
            ],
      color: "success",
      icon: "solar:clock-circle-bold",
    };

    console.log("[TunnelStatsCharts] 延迟数据对象更新:", {
      value: data.value,
      chartLength: data.chartData.length,
    });

    return data;
  }, [latestData?.ping, latencyChartData]);

  const currentPoolData = useMemo(() => {
    const data = {
      title: "连接池",
      value: `${latestData?.pool || 0}`,
      chartData: dataHistory.map((item, index) => ({
        time: `${index}`,
        value: item.pool || 0,
      })),
      color: "warning",
      icon: "solar:server-2-bold",
    };

    if (data.chartData.length === 0) {
      data.chartData = [
        { time: "0", value: 0 },
        { time: "1", value: 0 },
      ];
    }
    console.log("[TunnelStatsCharts] 连接池数据对象更新:", {
      value: data.value,
      chartLength: data.chartData.length,
    });

    return data;
  }, [latestData?.pool, dataHistory]);

  const currentConnectionsData = useMemo(() => {
    const data = {
      title: "连接数",
      value1: `${latestData?.tcps || 0}`,
      value2: `${latestData?.udps || 0}`,
      label1: "TCP",
      label2: "UDP",
      chartData: dataHistory.map((item, index) => ({
        time: `${index}`,
        value1: item.tcps || 0,
        value2: item.udps || 0,
      })),
      color: "danger",
      icon: "solar:server-path-bold",
    };

    if (data.chartData.length === 0) {
      data.chartData = [
        { time: "0", value1: 0, value2: 0 },
        { time: "1", value1: 0, value2: 0 },
      ];
    }
    console.log("[TunnelStatsCharts] 连接数据对象更新:", {
      tcp: data.value1,
      udp: data.value2,
      chartLength: data.chartData.length,
    });

    return data;
  }, [latestData?.tcps, latestData?.udps, dataHistory]);

  // 调试信息
  console.log("[TunnelStatsCharts] 组件状态:", {
    instanceId,
    isExperimentalMode,
    shouldConnect,
    isConnected,
    dataHistoryLength: dataHistory.length,
    latestData: latestData
      ? {
          instanceId: latestData.instanceId,
          timestamp: latestData.timestamp,
          tcpRx: latestData.tcpRx,
          tcpTx: latestData.tcpTx,
          udpRx: latestData.udpRx,
          udpTx: latestData.udpTx,
        }
      : null,
    currentRates: {
      tcpRxRate,
      tcpTxRate,
      udpRxRate,
      udpTxRate,
    },
  });

  // 如果不满足启动条件，不显示组件
  if (!shouldConnect) {
    console.log("[TunnelStatsCharts] 不满足启动条件，不显示组件");

    return <></>;
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 调试：连接状态提示 */}
      {/* {!isConnected && (
        <div className="col-span-full">
          <div className="p-3 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 rounded-lg">
            <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
              <div className="w-2 h-2 rounded-full bg-warning-500 animate-pulse"></div>
              <span className="text-sm">正在连接隧道监控服务... (instanceId: {instanceId})</span>
            </div>
          </div>
        </div>
      )} */}

      {/* 调试：连接成功但无数据时的提示 */}
      {/* {isConnected && dataHistory.length === 0 && (
        <div className="col-span-full">
          <div className="p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 rounded-lg">
            <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
              <div className="w-2 h-2 rounded-full bg-primary-500"></div>
              <span className="text-sm">隧道监控已连接，等待数据... (已接收: {dataHistory.length} 条)</span>
            </div>
          </div>
        </div>
      )} */}

      {/* TCP流量 */}
      <DualChart key="tcp-chart" {...currentTcpData} index="tcp" />

      {/* UDP流量 */}
      <DualChart key="udp-chart" {...currentUdpData} index="udp" />

      {/* 连接池 */}
      <SingleChart key="pool-chart" {...currentPoolData} index="pool" />

      {/* TCP/UDP连接数 */}
      <DualChart
        key="connections-chart"
        {...currentConnectionsData}
        index="connections"
      />
    </div>
  );
}
