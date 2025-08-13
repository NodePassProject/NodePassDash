"use client";

import React from 'react';
import { RealtimeLineChart, DataSeries, RealtimeDataPoint } from './realtime-line-chart';
import { useTheme } from 'next-themes';

// API 响应数据结构
export interface MetricsAPIResponse {
  traffic?: {
    avg_delay: number[];
    created_at: number[];
  };
  ping?: {
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
export interface EnhancedMetricsChartProps {
  apiData: MetricsAPIResponse | null;
  type: 'traffic' | 'quality';
  height?: number;
  timeRange?: '1h' | '6h' | '12h' | '24h';
  showLegend?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
  maxDataPoints?: number; // 最大保存的数据点数量
}

// 颜色映射 - 参考 nezha-dash 的配色方案
const CHART_COLORS = {
  traffic: '#3b82f6',    // 蓝色 - 流量速率
  ping: '#f59e0b',       // 橙色 - 延迟
  pool: '#10b981',       // 绿色 - 连接池
  speed: '#8b5cf6',      // 紫色 - 速度
  upload: '#ef4444',     // 红色 - 上传
  download: '#06b6d4',   // 青色 - 下载
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

// 数据转换函数 - 将 API 数据转换为图表数据
const transformAPIDataToChartData = (
  apiData: MetricsAPIResponse,
  type: 'traffic' | 'quality'
): RealtimeDataPoint[] => {
  const chartData: RealtimeDataPoint[] = [];

  if (type === 'traffic' && apiData.traffic) {
    const timestamps = apiData.traffic.created_at;
    const values = apiData.traffic.avg_delay;

    timestamps.forEach((timestamp, index) => {
      const existingPoint = chartData.find(point => point.timestamp === timestamp);
      if (existingPoint) {
        existingPoint.traffic = values[index] || 0;
      } else {
        chartData.push({
          timestamp,
          time: formatTime(timestamp),
          traffic: values[index] || 0,
        });
      }
    });
  }

  if (type === 'quality') {
    // 只处理延迟数据
    if (apiData.ping) {
      const timestamps = apiData.ping.created_at;
      const values = apiData.ping.avg_delay;

      timestamps.forEach((timestamp, index) => {
        const existingPoint = chartData.find(point => point.timestamp === timestamp);
        if (existingPoint) {
          existingPoint.ping = Number((values[index] || 0).toFixed(2));
        } else {
          chartData.push({
            timestamp,
            time: formatTime(timestamp),
            ping: Number((values[index] || 0).toFixed(2)),
          });
        }
      });
    }
  }

  // 按时间戳排序
  return chartData.sort((a, b) => a.timestamp - b.timestamp);
};

// 加载状态组件
const LoadingState: React.FC<{ height: number; className?: string }> = ({ height, className }) => (
  <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
        </div>
      </div>
      <p className="text-default-500 animate-pulse text-sm">加载数据中...</p>
    </div>
  </div>
);

// 错误状态组件
const ErrorState: React.FC<{ error: string; height: number; onRetry?: () => void; className?: string }> = ({ 
  error, 
  height, 
  onRetry,
  className
}) => (
  <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
    <div className="text-center">
      <p className="text-danger text-base">数据加载失败</p>
      <p className="text-default-400 text-sm mt-2">{error}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="mt-2 px-4 py-2 text-sm bg-danger-50 hover:bg-danger-100 text-danger rounded-lg transition-colors"
        >
          重试
        </button>
      )}
    </div>
  </div>
);

// 空状态组件
const EmptyState: React.FC<{ type: 'traffic' | 'quality'; height: number; className?: string }> = ({ type, height, className }) => (
  <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
    <div className="text-center">
      <p className="text-default-500 text-base">
        暂无{type === 'traffic' ? '流量' : '连接质量'}数据
      </p>
      <p className="text-default-400 text-sm mt-2">
        当实例运行时，{type === 'traffic' ? '流量趋势' : '延迟和连接池'}数据将在此显示
      </p>
    </div>
  </div>
);

export const EnhancedMetricsChart: React.FC<EnhancedMetricsChartProps> = ({
  apiData,
  type,
  height = 300,
  timeRange = '24h',
  showLegend = true,
  loading = false,
  error,
  className = '',
  maxDataPoints = 1000,
}) => {
  const { theme } = useTheme();
  
  // 内部状态管理历史数据 - 实现数据累积而非重绘
  const [historicalData, setHistoricalData] = React.useState<RealtimeDataPoint[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = React.useState<number>(0);

  // 数据更新逻辑 - 只追加新数据，不重绘整个图表
  React.useEffect(() => {
    if (!apiData) return;

    const newChartData = transformAPIDataToChartData(apiData, type);
    const currentTime = Date.now();

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

      // 按时间排序并限制数据点数量
      const sortedData = mergedData.sort((a, b) => a.timestamp - b.timestamp);
      
      // 保持最新的数据点，移除过老的数据
      return sortedData.slice(-maxDataPoints);
    });

    setLastUpdateTime(currentTime);
  }, [apiData, type, maxDataPoints]);

  // 配置数据系列
  const dataSeries = React.useMemo((): DataSeries[] => {
    if (type === 'traffic') {
      return [
        {
          key: 'traffic',
          name: '总流量速率',
          color: CHART_COLORS.traffic,
          unit: 'B/s',
          yAxisId: 'left' as const,
        },
      ];
    } else {
      // quality 类型 - 只显示延迟数据
      return [
        {
          key: 'ping',
          name: '端内延迟',
          color: CHART_COLORS.ping,
          unit: 'ms',
          yAxisId: 'left' as const,
        },
      ].filter(series => {
        // 只显示有数据的系列
        return historicalData.some(point => point[series.key] !== undefined);
      });
    }
  }, [type, historicalData]);

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

  const isDualAxis = false; // 现在只有单轴显示

  return (
    <RealtimeLineChart
      data={historicalData}
      series={dataSeries}
      height={height || 300} // 如果height为0，则使用默认值
      maxDataPoints={maxDataPoints}
      timeRange={timeRange}
      showLegend={showLegend}
      isDualAxis={isDualAxis}
      leftYAxisLabel={type === 'traffic' ? '流量速率' : '延迟'}
      rightYAxisLabel=""
      className={className}
    />
  );
};
