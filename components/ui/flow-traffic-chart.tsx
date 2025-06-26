"use client";

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTheme } from "next-themes";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export type FlowTrafficData = {
  id: string;
  data: Array<{
    x: string;
    y: number;
  }>;
};

interface FlowTrafficChartProps {
  data: FlowTrafficData[];
  height?: number;
  unit?: string;
  timeRange?: "1h" | "6h" | "12h" | "24h";
}

export function FlowTrafficChart({ data, height = 300, unit = 'GB', timeRange = '24h' }: FlowTrafficChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // 转换数据格式为 Chart.js 格式
  const chartData = React.useMemo(() => {
    const labels = data[0]?.data.map(point => point.x) || [];
    

    
    const datasets = data.map((series, index) => {
      const colors = [
        {
          bg: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          border: isDark ? 'rgb(59, 130, 246)' : 'rgb(59, 130, 246)',
        },
        {
          bg: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: isDark ? 'rgb(16, 185, 129)' : 'rgb(16, 185, 129)',
        },
        {
          bg: isDark ? 'rgba(245, 101, 101, 0.1)' : 'rgba(245, 101, 101, 0.1)',
          border: isDark ? 'rgb(245, 101, 101)' : 'rgb(245, 101, 101)',
        },
        {
          bg: isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.1)',
          border: isDark ? 'rgb(168, 85, 247)' : 'rgb(168, 85, 247)',
        },
      ];

      const color = colors[index % colors.length];

      return {
        label: series.id,
        data: series.data.map(point => point.y),
        borderColor: color.border,
        backgroundColor: color.bg,
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: color.border,
        pointHoverBorderColor: isDark ? '#1f2937' : '#ffffff',
        pointHoverBorderWidth: 2,
      };
    });

    return {
      labels,
      datasets,
    };
  }, [data, isDark]);

  const options = React.useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
          color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.3)',
        },
        ticks: {
          color: isDark ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 12,
          },
                    // 全部显示横坐标，太多时允许旋转
          maxTicksLimit: 1000, // 设置足够大的数字，实现全部显示
          maxRotation: 45, // 允许旋转45度
          minRotation: 0, // 优先水平显示
          callback: function(value: any, index: number, ticks: any[]) {
            const labels = chartData.labels;
            if (!labels || labels.length === 0) return '';
            
            const label = labels[index];
            if (!label || typeof label !== 'string') return '';
            
            // 解析时间格式提取小时:分钟部分
            const timeMatch = label.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
            if (!timeMatch) return label;
            
            const [, date, hour, minute] = timeMatch;
            
            // 全部显示，让Chart.js自动处理旋转
            return `${hour}:${minute}`;
          },
        },
        border: {
          display: false,
        },
      },
      y: {
        display: true,
        min: 0,
        grid: {
          color: isDark ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: isDark ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
          font: {
            size: 12,
          },
          callback: function(value: any) {
            return value + ' ' + unit;
          },
        },
        border: {
          display: false,
        },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          color: isDark ? 'rgb(209, 213, 219)' : 'rgb(75, 85, 99)',
          font: {
            size: 13,
            weight: 500,
          },
          padding: 20,
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: isDark ? 'rgba(17, 24, 39, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDark ? 'rgb(243, 244, 246)' : 'rgb(17, 24, 39)',
        bodyColor: isDark ? 'rgb(209, 213, 219)' : 'rgb(75, 85, 99)',
        borderColor: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(209, 213, 219, 0.3)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: function(context: any) {
            // 显示完整的时间信息
            if (context && context.length > 0) {
              const index = context[0].dataIndex;
              const fullLabel = chartData.labels[index];
              return fullLabel || '';
            }
            return '';
          },
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y} ${unit}`;
          },
        },
      },
    },
    elements: {
      line: {
        borderJoinStyle: 'round' as const,
      },
      point: {
        hoverRadius: 8,
      },
    },
  }), [isDark]);

  return (
    <div style={{ height, width: '100%' }}>
      <Line data={chartData} options={options} />
    </div>
  );
} 