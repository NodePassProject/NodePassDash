"use client"

import React from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { type ChartConfig, ChartContainer } from "./chart";
import { SpeedTooltip } from "./shared-chart-tooltip";

// 速率数据接口
interface SpeedDataPoint {
  timeStamp: string;
  speed_in: number;
  speed_out: number;
}

// 组件属性
interface SpeedChartProps {
  data: SpeedDataPoint[];
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

// 速率格式化函数
const formatSpeedValue = (bytesPerSecond: number) => {
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let value = Math.abs(bytesPerSecond);
  let unitIndex = 0;
  
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  
  return {
    value: value.toFixed(1),
    unit: units[unitIndex]
  };
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
    <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
      <div className="text-center">
        <p className="text-default-400 text-xs">暂无速率数据</p>
      </div>
    </div>
  );

  

// 时间过滤函数 - 过滤出1小时内的数据
const filterDataTo1Hour = (data: SpeedDataPoint[]) => {
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

export const SpeedChart: React.FC<SpeedChartProps> = ({
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
      console.log('[SpeedChart] 数据更新:', data.length, '条记录');
      if (data.length > 0) {
        console.log('[SpeedChart] 样本数据:', data.slice(0, 2));
        console.log('[SpeedChart] 数据范围:', {
          speed_in: {
            min: Math.min(...data.map(d => d.speed_in)),
            max: Math.max(...data.map(d => d.speed_in))
          },
          speed_out: {
            min: Math.min(...data.map(d => d.speed_out)),
            max: Math.max(...data.map(d => d.speed_out))
          }
        });
      }
    }
  }, [data]);
  const chartConfig = {
    speed_in: {
      label: "上传速度",
      color: "hsl(220 70% 50%)", // 蓝色
    },
    speed_out: {
      label: "下载速度", 
      color: "hsl(280 65% 60%)", // 紫色
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

  // 计算最大速率值用于Y轴范围
  const maxSpeed = Math.max(
    ...data.map(item => Math.max(item.speed_in, item.speed_out))
  );
  // 确保Y轴最大值至少不为0，避免domain异常
  const yAxisMax = maxSpeed > 0 ? Math.ceil(maxSpeed * 1.1) : 1024; // 1KB/s 作为默认值

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
            const { value: formattedValue, unit } = formatSpeedValue(value);
            return `${formattedValue}${unit}`;
          }}
        />
        <Tooltip content={<SpeedTooltip />} />
        <Line
          isAnimationActive={false}
          dataKey="speed_in"
          type="monotone"
          stroke="hsl(220 70% 50%)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          isAnimationActive={false}
          dataKey="speed_out"
          type="monotone"
          stroke="hsl(280 65% 60%)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
};
