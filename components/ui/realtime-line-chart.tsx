"use client";

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from 'next-themes';

// 数据点接口
export interface RealtimeDataPoint {
  timestamp: number;
  time: string; // 格式化后的时间字符串
  [key: string]: any; // 允许多个数据系列
}

// 数据系列配置
export interface DataSeries {
  key: string; // 数据键名
  name: string; // 显示名称
  color: string; // 线条颜色
  unit: string; // 单位
  yAxisId?: 'left' | 'right'; // Y轴归属
}

// 组件属性
export interface RealtimeLineChartProps {
  data: RealtimeDataPoint[];
  series: DataSeries[];
  height?: number;
  maxDataPoints?: number; // 最大显示数据点数量
  timeRange?: '1h' | '6h' | '12h' | '24h';
  showLegend?: boolean;
  leftYAxisLabel?: string;
  rightYAxisLabel?: string;
  isDualAxis?: boolean;
  className?: string;
}

// 时间格式化函数 - 参考 nezha-dash 的实现
const formatTimestamp = (timestamp: number): string => {
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

// 数值格式化函数
const formatValue = (value: number, unit: string): string => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  
  if (unit.includes('B') || unit.includes('b')) {
    // 流量单位自动转换
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let val = Math.abs(value);
    let unitIndex = 0;
    
    while (val >= 1024 && unitIndex < units.length - 1) {
      val /= 1024;
      unitIndex++;
    }
    
    return `${val.toFixed(1)} ${units[unitIndex]}${unit.includes('/s') ? '/s' : ''}`;
  } else if (unit === 'ms') {
    return `${value.toFixed(1)}ms`;
  } else if (unit === '个' || unit === 'count') {
    return `${Math.round(value)}`;
  }
  
  return `${value}`;
};

// 根据时间范围过滤数据
const filterDataByTimeRange = (data: RealtimeDataPoint[], timeRange: string): RealtimeDataPoint[] => {
  if (data.length === 0) return data;
  
  const now = Date.now();
  const timeRangeMs = {
    '1h': 1 * 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
  }[timeRange] || 24 * 60 * 60 * 1000;
  
  return data.filter(point => now - point.timestamp <= timeRangeMs);
};

// 生成X轴刻度
const generateXAxisTicks = (data: RealtimeDataPoint[], timeRange: string): number[] => {
  if (data.length === 0) return [];
  
  const filteredData = filterDataByTimeRange(data, timeRange);
  if (filteredData.length === 0) return [];
  
  const startTime = filteredData[0].timestamp;
  const endTime = filteredData[filteredData.length - 1].timestamp;
  const duration = endTime - startTime;
  
  // 根据时间范围确定刻度间隔
  let tickInterval: number;
  if (duration <= 1 * 60 * 60 * 1000) { // 1小时内
    tickInterval = 10 * 60 * 1000; // 每10分钟
  } else if (duration <= 6 * 60 * 60 * 1000) { // 6小时内
    tickInterval = 60 * 60 * 1000; // 每1小时
  } else if (duration <= 12 * 60 * 60 * 1000) { // 12小时内
    tickInterval = 60 * 60 * 1000; // 每1小时
  } else { // 24小时
    tickInterval = 2 * 60 * 60 * 1000; // 每2小时
  }
  
  const ticks: number[] = [];
  let currentTick = startTime;
  
  // 对齐到合适的时间点
  const alignedStart = new Date(startTime);
  if (tickInterval >= 60 * 60 * 1000) {
    // 对齐到整点
    alignedStart.setMinutes(0, 0, 0);
    if (tickInterval === 2 * 60 * 60 * 1000) {
      // 对齐到偶数小时
      const hours = alignedStart.getHours();
      alignedStart.setHours(hours - (hours % 2));
    }
  } else {
    // 对齐到整分钟
    alignedStart.setSeconds(0, 0);
  }
  
  currentTick = alignedStart.getTime();
  
  while (currentTick <= endTime) {
    ticks.push(currentTick);
    currentTick += tickInterval;
  }
  
  return ticks.length > 0 ? ticks : [startTime, endTime];
};

export const RealtimeLineChart: React.FC<RealtimeLineChartProps> = ({
  data,
  series,
  height = 300,
  maxDataPoints = 1000,
  timeRange = '24h',
  showLegend = true,
  leftYAxisLabel = '',
  rightYAxisLabel = '',
  isDualAxis = false,
  className = '',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // 处理数据：过滤时间范围并限制数据点数量
  const processedData = React.useMemo(() => {
    let filteredData = filterDataByTimeRange(data, timeRange);
    
    // 限制数据点数量，保留最新的数据
    if (filteredData.length > maxDataPoints) {
      filteredData = filteredData.slice(-maxDataPoints);
    }
    
    return filteredData;
  }, [data, timeRange, maxDataPoints]);

  // 生成 X 轴刻度
  const xAxisTicks = React.useMemo(() => {
    return generateXAxisTicks(processedData, timeRange);
  }, [processedData, timeRange]);

  // 主题颜色
  const colors = React.useMemo(() => ({
    grid: isDark ? 'rgba(75,85,99,0.2)' : 'rgba(209,213,219,0.3)',
    text: isDark ? 'rgb(209,213,219)' : 'rgb(75,85,99)',
    axis: isDark ? 'rgba(75,85,99,0.4)' : 'rgba(209,213,219,0.6)',
  }), [isDark]);

  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const timestamp = typeof label === 'string' ? parseInt(label) : label;
    const time = formatTimestamp(timestamp);

    return (
      <div 
        className="border rounded-lg p-3 shadow-lg backdrop-blur-sm"
        style={{
          backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
          borderColor: isDark ? 'rgba(75,85,99,0.3)' : 'rgba(209,213,219,0.3)',
          color: colors.text,
        }}
      >
        <p className="font-medium mb-2 text-sm">{time}</p>
        {payload.map((entry: any, index: number) => {
          const seriesConfig = series.find(s => s.key === entry.dataKey);
          const unit = seriesConfig?.unit || '';
          const value = entry.value;
          
          if (value === null || value === undefined) return null;
          
          return (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {formatValue(value, unit)} {unit}
            </p>
          );
        })}
      </div>
    );
  };

  // X轴标签格式化
  const formatXAxisLabel = (tickItem: any) => {
    const timestamp = typeof tickItem === 'string' ? parseInt(tickItem) : tickItem;
    return formatTimestamp(timestamp);
  };

  // Y轴格式化
  const formatYAxisLabel = (value: number, seriesKey?: string) => {
    if (seriesKey) {
      const seriesConfig = series.find(s => s.key === seriesKey);
      const unit = seriesConfig?.unit || '';
      return formatValue(value, unit);
    }
    return formatValue(value, '');
  };

  if (processedData.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={height ? { height } : {}}>
        <div className="text-center">
          <p className="text-default-500 text-sm">暂无数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`} style={height ? { height } : {}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={processedData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke={colors.grid}
            vertical={false}
          />
          
          <XAxis 
            dataKey="timestamp"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={xAxisTicks}
            axisLine={false}
            tickLine={false}
            tick={{ 
              fill: colors.text,
              fontSize: 12,
            }}
            tickFormatter={formatXAxisLabel}
            minTickGap={50}
          />
          
          {/* 左Y轴 */}
          <YAxis 
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ 
              fill: colors.text,
              fontSize: 12,
            }}
            tickFormatter={(value) => {
              const leftSeries = series.find(s => !s.yAxisId || s.yAxisId === 'left');
              return formatYAxisLabel(value, leftSeries?.key);
            }}
            minTickGap={20}
            width={45}
          />
          
          {/* 右Y轴（双轴模式时） */}
          {isDualAxis && (
            <YAxis 
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ 
                fill: colors.text,
                fontSize: 12,
              }}
              tickFormatter={(value) => {
                const rightSeries = series.find(s => s.yAxisId === 'right');
                return formatYAxisLabel(value, rightSeries?.key);
              }}
              minTickGap={20}
              width={45}
            />
          )}

          <Tooltip content={<CustomTooltip />} />
          
          {showLegend && (
            <Legend 
              iconType="line"
              wrapperStyle={{ 
                paddingTop: '15px',
                color: colors.text,
                fontSize: '13px'
              }}
            />
          )}

          {/* 渲染数据线 */}
          {series.map((seriesConfig) => (
            <Line
              key={seriesConfig.key}
              yAxisId={isDualAxis ? (seriesConfig.yAxisId || 'left') : 'left'}
              type="monotone"
              dataKey={seriesConfig.key}
              name={seriesConfig.name}
              stroke={seriesConfig.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ 
                r: 4, 
                stroke: seriesConfig.color, 
                strokeWidth: 2, 
                fill: seriesConfig.color 
              }}
              connectNulls={false}
              animationDuration={300}
              animationEasing="ease-in-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
