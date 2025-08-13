"use client";

import { Card, CardBody, CardHeader, Switch, Button, Tabs, Tab } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRefresh } from "@fortawesome/free-solid-svg-icons";
import { useTheme } from "next-themes";
import * as React from "react";
import { useCallback, useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { LatencyTooltip } from "./shared-chart-tooltip";

// 数据结构定义
interface LatencyDataPoint {
  created_at: number;
  avg_delay: number;
}

interface MetricsAPIResponse {
  ping?: {
    avg_delay: number[];
    created_at: number[];
  };
}

interface LatencyChartProps {
  apiData: MetricsAPIResponse | null;
  loading?: boolean;
  error?: string;
  className?: string;
  height?: number;
  title?: string;
  // 新增的控制按钮相关props
  onRefresh?: () => void;
  refreshLoading?: boolean;
  timeRange?: "1h" | "6h" | "12h" | "24h";
  onTimeRangeChange?: (timeRange: "1h" | "6h" | "12h" | "24h") => void;
}

// 格式化时间
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const minutes = date.getMinutes();
  return minutes === 0 ? `${date.getHours()}:00` : `${date.getHours()}:${minutes.toString().padStart(2, '0')}`;
};



// 数据转换函数
const transformData = (data: MetricsAPIResponse): LatencyDataPoint[] => {
  if (!data?.ping?.created_at || !data?.ping?.avg_delay) return [];
  
  const result: LatencyDataPoint[] = [];
  const timestamps = data.ping.created_at;
  const delays = data.ping.avg_delay;
  
  for (let i = 0; i < timestamps.length; i++) {
    result.push({
      created_at: timestamps[i],
      avg_delay: delays[i] || 0,
    });
  }
  
  return result.sort((a, b) => a.created_at - b.created_at);
};

// 异常值处理和平滑函数
const processDataWithSmoothing = (data: LatencyDataPoint[], enabled: boolean): LatencyDataPoint[] => {
  if (!enabled || data.length === 0) return data;
  
  const windowSize = 11; // 滑动窗口大小
  const alpha = 0.3; // EWMA平滑因子
  
  // 计算中位数
  const getMedian = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  
  // 异常值处理
  const processValues = (values: number[]) => {
    if (values.length === 0) return null;
    
    const median = getMedian(values);
    const deviations = values.map((v) => Math.abs(v - median));
    const medianDeviation = getMedian(deviations) * 1.4826; // MAD估计器
    
    // 使用中位数绝对偏差(MAD)进行异常值检测
    const validValues = values.filter(
      (v) =>
        Math.abs(v - median) <= 3 * medianDeviation && // 异常值判定
        v <= median * 3, // 限制最大值
    );
    
    if (validValues.length === 0) return median;
    
    // 计算EWMA
    let ewma = validValues[0];
    for (let i = 1; i < validValues.length; i++) {
      ewma = alpha * validValues[i] + (1 - alpha) * ewma;
    }
    
    return ewma;
  };
  
  // EWMA历史值
  let ewmaHistory = data[0]?.avg_delay || 0;
  
  return data.map((point, index) => {
    if (index < windowSize - 1) return point;
    
    const window = data.slice(index - windowSize + 1, index + 1);
    const values = window.map((w) => w.avg_delay).filter((v) => v !== undefined && v !== null);
    
    if (values.length > 0) {
      const processed = processValues(values);
      if (processed !== null) {
        ewmaHistory = alpha * processed + (1 - alpha) * ewmaHistory;
        return {
          ...point,
          avg_delay: Math.round(ewmaHistory * 100) / 100, // 保留2位小数
        };
      }
    }
    
    return point;
  });
};

// 主组件
export const LatencyChart: React.FC<LatencyChartProps> = ({
  apiData,
  loading = false,
  error,
  className = "",
  height = 250,
  title = "端内延迟",
  onRefresh,
  refreshLoading = false,
  timeRange = "24h",
  onTimeRangeChange
}) => {
  const { theme } = useTheme();
  const [isPeakEnabled, setIsPeakEnabled] = React.useState(false);
  
  // 转换数据
  const transformedData = useMemo(() => transformData(apiData || {}), [apiData]);
  
  // 处理后的数据（包含平滑处理）
  const processedData = useMemo(() => {
    return processDataWithSmoothing(transformedData, isPeakEnabled);
  }, [transformedData, isPeakEnabled]);

  // 根据时间范围过滤数据
  const filteredData = useMemo(() => {
    if (processedData.length === 0 || !timeRange) return processedData;
    
    // 获取当前时间
    const now = new Date();
    const hoursAgo = timeRange === "1h" ? 1 : timeRange === "6h" ? 6 : timeRange === "12h" ? 12 : 24;
    const cutoffTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    
    // 过滤数据
    return processedData.filter((item) => {
      const itemTime = new Date(item.created_at);
      return !isNaN(itemTime.getTime()) && itemTime >= cutoffTime;
    });
  }, [processedData, timeRange]);
  
  // 自适应Y轴范围
  const yAxisDomain = useMemo(() => {
    if (filteredData.length === 0) return [0, 100];
    
    const values = filteredData.map(d => d.avg_delay);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const padding = (maxVal - minVal) * 0.1; // 10% 的padding
    
    return [
      Math.max(0, minVal - padding),
      maxVal + padding
    ];
  }, [filteredData]);
  
  // 计算X轴刻度
  const xAxisTicks = useMemo(() => {
    if (filteredData.length < 6) {
      return filteredData.map(item => item.created_at);
    }
    
    // 计算数据的总时间跨度
    const timeSpan = filteredData[filteredData.length - 1].created_at - filteredData[0].created_at;
    const hours = timeSpan / (1000 * 60 * 60);
    
    return filteredData
      .filter((item, index, array) => {
        if (hours <= 12) {
          // 12小时内，每60分钟显示一个刻度
          return (
            index === 0 ||
            index === array.length - 1 ||
            new Date(item.created_at).getMinutes() % 60 === 0
          );
        }
        // 超过12小时，每2小时显示一个刻度
        const date = new Date(item.created_at);
        return date.getMinutes() === 0 && date.getHours() % 2 === 0;
      })
      .map((item) => item.created_at);
  }, [filteredData]);
  

  
  // 加载状态
  if (loading && filteredData.length === 0) {
    return (
      <Card className={`p-2 ${className}`}>
        <CardBody>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="relative w-8 h-8">
                  <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
                </div>
              </div>
              <p className="text-default-500 animate-pulse text-sm">加载延迟数据中...</p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  
  // 错误状态
  if (error) {
    return (
      <Card className={`p-2 ${className}`}>
        <CardBody>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="text-center">
              <p className="text-danger text-base">延迟数据加载失败</p>
              <p className="text-default-400 text-sm mt-2">{error}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  
  // 无数据状态
  if (filteredData.length === 0) {
    return (
      <Card className={`p-2 ${className}`}>
        <CardBody>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="text-center">
              <p className="text-default-500 text-base">暂无延迟数据</p>
              <p className="text-default-400 text-sm mt-2">
                当实例运行时，延迟数据将在此显示
              </p>
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }
  
  return (
    <Card className={`${className}`}>
      <CardHeader className="flex items-center justify-between pb-2 pt-4 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{title}</h3>
            {/* 峰值平滑开关移到标题右侧 */}
            {/* <div className="flex items-center gap-1 ml-2">
              <Switch 
                id="peakCut" 
                size="sm"
                isSelected={isPeakEnabled} 
                onValueChange={setIsPeakEnabled} 
              />
              <label className="text-xs cursor-pointer text-default-600" htmlFor="peakCut">
                峰值平滑
              </label>
            </div> */}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 手动刷新按钮 */}
          {onRefresh && (
            <Button
              size="sm"
              variant="flat"
              isIconOnly
              onPress={onRefresh}
              isLoading={refreshLoading}
              className="h-7 w-7 min-w-0"
            >
              <FontAwesomeIcon icon={faRefresh} className="text-xs" />
            </Button>
          )}
          
          {/* 时间范围选择 */}
          {onTimeRangeChange && (
            <Tabs 
              selectedKey={timeRange}
              onSelectionChange={(key) => onTimeRangeChange(key as "1h" | "6h" | "12h" | "24h")}
              size="sm"
              variant="light"
              classNames={{
                tabList: "gap-1",
                tab: "text-xs px-2 py-1 min-w-0 h-7",
                tabContent: "text-xs"
              }}
            >
              <Tab key="1h" title="1小时" />
              <Tab key="6h" title="6小时" />
              <Tab key="12h" title="12小时" />
              <Tab key="24h" title="24小时" />
            </Tabs>
          )}
        </div>
      </CardHeader>
      
      <CardBody className="py-4 pr-2 pl-0 sm:pt-6 sm:pr-6 sm:pb-6 sm:pl-2">
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={filteredData} 
              margin={{ left: 0, right: 12, top: 5, bottom: 5 }}
            >
              <CartesianGrid 
                vertical={false} 
                stroke={theme === 'dark' ? '#27272a' : '#e4e4e7'}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="created_at"
                tickLine={true}
                tickSize={3}
                axisLine={false}
                tickMargin={8}
                minTickGap={80}
                ticks={xAxisTicks}
                tickFormatter={formatTime}
                stroke={theme === 'dark' ? '#a1a1aa' : '#71717a'}
                fontSize={11}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={15}
                domain={yAxisDomain}
                tickFormatter={(value) => `${Math.round(value)}ms`}
                stroke={theme === 'dark' ? '#a1a1aa' : '#71717a'}
                fontSize={11}
              />
              <Tooltip content={<LatencyTooltip />} />
              <Line
                type="linear"
                dataKey="avg_delay"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
};

export default LatencyChart;
