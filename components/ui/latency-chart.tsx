"use client";

import React from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { type ChartConfig, ChartContainer } from "./chart";
import { LatencyTooltipV2 } from "./shared-chart-tooltip";

// 延迟数据接口 - 与其他图表保持一致
interface LatencyDataPoint {
  timeStamp: string;
  latency: number;
}

// 组件属性 - 与其他图表保持一致
interface LatencyChartProps {
  data: LatencyDataPoint[];
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
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Tooltip时间格式化函数 - 显示实际时间
const formatTooltipTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffHours < 24) {
    // 24小时内只显示时分
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else {
    // 超过24小时显示月日时分
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/\//g, '-');
  }
};

// 加载状态组件
const LoadingState: React.FC<{ height: number; className?: string }> = ({ height, className }) => (
  <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
    <div className="space-y-1 text-center">
      <div className="flex justify-center">
        <div className="relative w-4 h-4">
          <div className="absolute inset-0 rounded-full border-2 border-default-200 border-t-primary animate-spin" />
        </div>
      </div>
      <p className="text-default-500 animate-pulse text-xs">加载中...</p>
    </div>
  </div>
);

// 错误状态组件
const ErrorState: React.FC<{ error: string; height: number; className?: string }> = ({ 
  error, 
  height, 
  className
}) => (
  <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
    <div className="text-center">
      <p className="text-danger text-xs">加载失败</p>
      <p className="text-default-400 text-xs mt-0.5">{error}</p>
    </div>
  </div>
);

// 空状态组件
const EmptyState: React.FC<{ height: number; className?: string }> = ({ height, className }) => (
  <div className={`flex items-end justify-center ${className}`} style={height ? { height } : {}}>
    <div className="text-center pb-2">
      <p className="text-default-400 text-xs">暂无延迟数据</p>
    </div>
  </div>
);

// 时间过滤函数 - 过滤出1小时内的数据
const filterDataTo1Hour = (data: LatencyDataPoint[]) => {
  if (data.length === 0) return data;
  
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  return data.filter((item) => {
    try {
      const itemTime = new Date(item.timeStamp);
      return !isNaN(itemTime.getTime()) && itemTime >= oneHourAgo;
    } catch (error) {
      console.error(`时间解析错误: ${item.timeStamp}`, error);
      return false;
    }
  });
};

export const LatencyChart: React.FC<LatencyChartProps> = ({
  data,
  height = 140,
  loading = false,
  error,
  className = '',
  showFullData = false,
}) => {
  // 调试信息 - 开发环境下显示数据更新
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[LatencyChart] 数据更新:', data.length, '条记录');
    }
  }, [data]);

  const chartConfig = {
    latency: {
      label: "延迟",
    },
  } satisfies ChartConfig;

  // 处理加载状态
  if (loading && data.length === 0) {
    return <LoadingState height={height} className={className} />;
  }

  // 处理错误状态
  if (error) {
    return <ErrorState error={error} height={height} className={className} />;
  }

  // 处理空数据状态
  if (data.length === 0) {
    return <EmptyState height={height} className={className} />;
  }

  // 计算Y轴范围
  const maxLatency = Math.max(...data.map(item => item.latency));
  const yAxisMax = maxLatency > 0 ? Math.ceil(maxLatency * 1.1) : 100; // 100ms作为默认值

  // 根据showFullData决定是否过滤数据到1小时
  const filteredData = showFullData ? data : filterDataTo1Hour(data);

  return (
    <ChartContainer config={chartConfig} className={`aspect-auto w-full ${className}`} style={{ height }}>
      <LineChart
        accessibilityLayer
        data={filteredData}
        margin={{
          top: 12,
          left: 12,
          right: 12,
        }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3" />
        <XAxis
          dataKey="timeStamp"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={200}
          interval="preserveStartEnd"
          tickFormatter={formatAxisTime}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          mirror={true}
          tickMargin={-15}
          type="number"
          domain={[0, yAxisMax]}
          allowDecimals={false}
          minTickGap={20}
          tickCount={5}
          tickFormatter={(value) => {
            if (value === 0) return '0';
            return `${Math.round(value)}ms`;
          }}
        />
        <Tooltip content={<LatencyTooltipV2 />} />
        <Line
          isAnimationActive={false}
          dataKey="latency"
          type="monotone"
          stroke="hsl(45 93% 47%)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
};
