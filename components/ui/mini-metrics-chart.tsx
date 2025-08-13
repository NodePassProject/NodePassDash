"use client";

import React from 'react';
import { RealtimeLineChart, DataSeries, RealtimeDataPoint } from './realtime-line-chart';

// API 响应数据结构
export interface MiniMetricsAPIResponse {
  traffic?: {
    avg_delay: number[];
    created_at: number[];
  };
  speed_in?: {
    avg_delay: number[];
    created_at: number[];
  };
  speed_out?: {
    avg_delay: number[];
    created_at: number[];
  };
  pool?: {
    avg_delay: number[];
    created_at: number[];
  };
}

// 组件属性
export interface MiniMetricsChartProps {
  apiData: MiniMetricsAPIResponse | null;
  type: 'traffic' | 'speed' | 'pool';
  height?: number;
  loading?: boolean;
  error?: string;
  className?: string;
  // 自定义边距
  customPadding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

// 颜色映射
const CHART_COLORS = {
  traffic: '#3b82f6',    // 蓝色 - 流量速率
  speed_in: '#8b5cf6',   // 紫色 - 入站速度
  speed_out: '#ef4444',  // 红色 - 出站速度
  pool: '#10b981',       // 绿色 - 连接池
} as const;

// 时间格式化函数
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(/\//g, '-');
};

// 数据转换函数
const transformAPIDataToChartData = (
  apiData: MiniMetricsAPIResponse,
  type: 'traffic' | 'speed' | 'pool'
): RealtimeDataPoint[] => {
  const chartData: RealtimeDataPoint[] = [];

  if (type === 'traffic' && apiData.traffic) {
    const timestamps = apiData.traffic.created_at;
    const values = apiData.traffic.avg_delay;

    timestamps.forEach((timestamp, index) => {
      chartData.push({
        timestamp,
        time: formatTime(timestamp),
        traffic: values[index] || 0, // 流量总用量
      });
    });
  }

  if (type === 'speed') {
    // 合并入站和出站速度数据
    const speedInTimestamps = apiData.speed_in?.created_at || [];
    const speedInValues = apiData.speed_in?.avg_delay || [];
    const speedOutTimestamps = apiData.speed_out?.created_at || [];
    const speedOutValues = apiData.speed_out?.avg_delay || [];

    // 合并时间戳
    const allTimestamps = [...new Set([...speedInTimestamps, ...speedOutTimestamps])].sort();

    allTimestamps.forEach((timestamp) => {
      const speedInIndex = speedInTimestamps.indexOf(timestamp);
      const speedOutIndex = speedOutTimestamps.indexOf(timestamp);
      
      chartData.push({
        timestamp,
        time: formatTime(timestamp),
        speed_in: speedInIndex >= 0 ? speedInValues[speedInIndex] || 0 : 0,
        speed_out: speedOutIndex >= 0 ? speedOutValues[speedOutIndex] || 0 : 0,
      });
    });
  }

  if (type === 'pool' && apiData.pool) {
    const timestamps = apiData.pool.created_at;
    const values = apiData.pool.avg_delay;

    timestamps.forEach((timestamp, index) => {
      chartData.push({
        timestamp,
        time: formatTime(timestamp),
        pool: Math.round(values[index] || 0),
      });
    });
  }

  // 按时间戳排序
  return chartData.sort((a, b) => a.timestamp - b.timestamp);
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
const EmptyState: React.FC<{ type: 'traffic' | 'speed' | 'pool'; height: number; className?: string }> = ({ type, height, className }) => (
  <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
    <div className="text-center">
      <p className="text-default-400 text-xs">
        暂无{type === 'traffic' ? '流量' : type === 'speed' ? '速度' : '连接池'}数据
      </p>
    </div>
  </div>
);

export const MiniMetricsChart: React.FC<MiniMetricsChartProps> = ({
  apiData,
  type,
  height = 140,
  loading = false,
  error,
  className = '',
  customPadding,
}) => {
  // 内部状态管理历史数据
  const [historicalData, setHistoricalData] = React.useState<RealtimeDataPoint[]>([]);

  // 数据更新逻辑
  React.useEffect(() => {
    if (!apiData) return;

    const newChartData = transformAPIDataToChartData(apiData, type);
    
    setHistoricalData(prevData => {
      // 合并新旧数据，避免重复
      const mergedData = [...prevData];
      
      newChartData.forEach(newPoint => {
        const existingIndex = mergedData.findIndex(point => point.timestamp === newPoint.timestamp);
        if (existingIndex >= 0) {
          // 更新已存在的数据点
          mergedData[existingIndex] = { ...mergedData[existingIndex], ...newPoint };
        } else {
          // 添加新数据点
          mergedData.push(newPoint);
        }
      });

      // 按时间排序并保持最新的数据点
      const sortedData = mergedData.sort((a, b) => a.timestamp - b.timestamp);
      return sortedData.slice(-100); // 只保留最新的100个数据点
    });
  }, [apiData, type]);

  // 配置数据系列
  const dataSeries = React.useMemo((): DataSeries[] => {
    if (type === 'traffic') {
      return [
        {
          key: 'traffic',
          name: '流量用量',
          color: CHART_COLORS.traffic,
          unit: 'B',
          yAxisId: 'left',
        },
      ];
    } else if (type === 'speed') {
      return [
        {
          key: 'speed_in',
          name: '入站速度',
          color: CHART_COLORS.speed_in,
          unit: 'B/s',
          yAxisId: 'left',
        },
        {
          key: 'speed_out',
          name: '出站速度',
          color: CHART_COLORS.speed_out,
          unit: 'B/s',
          yAxisId: 'left',
        },
      ];
    } else {
      return [
        {
          key: 'pool',
          name: '连接池',
          color: CHART_COLORS.pool,
          unit: '个',
          yAxisId: 'left',
        },
      ];
    }
  }, [type]);

  // 处理加载状态
  if (loading && historicalData.length === 0) {
    return <LoadingState height={height} className={className} />;
  }

  // 处理错误状态
  if (error) {
    return <ErrorState error={error} height={height} className={className} />;
  }

  // 处理空数据状态
  if (historicalData.length === 0) {
    return <EmptyState type={type} height={height} className={className} />;
  }

  // 检查是否有有效数据
  const hasValidData = dataSeries.some(series => 
    historicalData.some(point => {
      const value = point[series.key];
      return value !== undefined && value !== null && !isNaN(value);
    })
  );

  if (!hasValidData) {
    return <EmptyState type={type} height={height} className={className} />;
  }

  const isDualSeries = type === 'speed' && dataSeries.length > 1;
  // 速率图表不显示图例
  const shouldShowLegend = isDualSeries && type !== 'speed';

  // 构建自定义样式
  const customStyle: React.CSSProperties = {};
  if (customPadding) {
    if (customPadding.top !== undefined) customStyle.paddingTop = customPadding.top;
    if (customPadding.right !== undefined) customStyle.paddingRight = customPadding.right;
    if (customPadding.bottom !== undefined) customStyle.paddingBottom = customPadding.bottom;
    if (customPadding.left !== undefined) customStyle.paddingLeft = customPadding.left;
  }

  return (
    <div style={customStyle} className={className}>
      <RealtimeLineChart
        data={historicalData}
        series={dataSeries}
        height={height}
        maxDataPoints={100}
        timeRange="24h"
        showLegend={shouldShowLegend}
        isDualAxis={false}
        leftYAxisLabel={type === 'traffic' ? '流量用量' : type === 'speed' ? '速度' : '连接数'}
        className="p-0"
        isMiniChart={true}
      />
    </div>
  );
};
