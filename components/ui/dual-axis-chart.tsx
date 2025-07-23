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
import { useTheme } from 'next-themes';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export type DualAxisDataset = {
  id: string; // 数据集名称
  axis: 'left' | 'right'; // 使用哪个y轴
  data: Array<{
    x: string;
    y: number;
  }>;
};

interface DualAxisChartProps {
  datasets: DualAxisDataset[];
  leftUnit: string; // 左轴单位
  rightUnit: string; // 右轴单位
  height?: number;
  timeRange?: '1h' | '6h' | '12h' | '24h';
  showLegend?: boolean;
}

// 双纵坐标折线图
export const DualAxisChart: React.FC<DualAxisChartProps> = ({
  datasets,
  leftUnit,
  rightUnit,
  height = 300,
  timeRange = '24h',
  showLegend = true,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // 取第一条数据集的 labels 作为横坐标
  const labels = React.useMemo(() => {
    const first = datasets[0];
    return first ? first.data.map((p) => p.x) : [];
  }, [datasets]);

  // 判断是否所有点在同一天
  const sameDay = React.useMemo(() => {
    if (!labels || labels.length === 0) return true;
    const firstLabel = labels[0];
    const dateMatch = firstLabel.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return true;
    const targetDate = dateMatch[1];
    return labels.every((lbl) => lbl.startsWith(targetDate));
  }, [labels]);

  const chartData = React.useMemo(() => {
    const colors = [
      {
        bg: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
        border: isDark ? 'rgb(59, 130, 246)' : 'rgb(59, 130, 246)',
      },
      {
        bg: isDark ? 'rgba(245, 101, 101, 0.1)' : 'rgba(245, 101, 101, 0.1)',
        border: isDark ? 'rgb(245, 101, 101)' : 'rgb(245, 101, 101)',
      },
      {
        bg: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
        border: isDark ? 'rgb(16, 185, 129)' : 'rgb(16, 185, 129)',
      },
      {
        bg: isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(168, 85, 247, 0.1)',
        border: isDark ? 'rgb(168, 85, 247)' : 'rgb(168, 85, 247)',
      },
    ];

    return {
      labels,
      datasets: datasets.map((series, index) => {
        const color = colors[index % colors.length];
        return {
          label: series.id,
          data: series.data.map((p) => p.y),
          borderColor: color.border,
          backgroundColor: color.bg,
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          yAxisID: series.axis === 'right' ? 'yRight' : 'y',
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: color.border,
          pointHoverBorderColor: isDark ? '#1f2937' : '#ffffff',
          pointHoverBorderWidth: 2,
        } as const;
      }),
    };
  }, [datasets, isDark, labels]);

  const options = React.useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: isDark ? 'rgb(156,163,175)' : 'rgb(75,85,99)',
            font: { size: 12 },
            maxRotation: 45,
            minRotation: 0,
            callback: (v: any, index: number) => {
              const lbl = labels[index];
              if (!lbl) return '';
              const m = lbl.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
              if (!m) return lbl;
              const [, , month, day, hh, mm] = m;
              if (sameDay) {
                return `${hh}:${mm}`;
              }
              return `${month}-${day} ${hh}:${mm}`;
            },
          },
        },
        y: {
          type: 'linear' as const,
          position: 'left' as const,
          grid: {
            color: isDark ? 'rgba(75,85,99,0.2)' : 'rgba(209,213,219,0.2)',
            drawBorder: false,
          },
          ticks: {
            color: isDark ? 'rgb(156,163,175)' : 'rgb(75,85,99)',
            font: { size: 12 },
            callback: (v: any) => `${v} ${leftUnit}`,
          },
        },
        yRight: {
          type: 'linear' as const,
          position: 'right' as const,
          grid: {
            drawOnChartArea: false, // 避免重复网格线
          },
          ticks: {
            color: isDark ? 'rgb(156,163,175)' : 'rgb(75,85,99)',
            font: { size: 12 },
            callback: (v: any) => `${v} ${rightUnit}`,
          },
        },
      },
      plugins: {
        legend: {
          display: showLegend,
          position: 'top' as const,
          align: 'end' as const,
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            boxHeight: 8,
            color: isDark ? 'rgb(209,213,219)' : 'rgb(75,85,99)',
            font: { size: 13, weight: 500 },
            padding: 20,
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor: isDark ? 'rgb(243,244,246)' : 'rgb(17,24,39)',
          bodyColor: isDark ? 'rgb(209,213,219)' : 'rgb(75,85,99)',
          borderColor: isDark ? 'rgba(75,85,99,0.3)' : 'rgba(209,213,219,0.3)',
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            title: (ctx: any) => {
              if (ctx && ctx.length > 0) return labels[ctx[0].dataIndex] || '';
              return '';
            },
            label: (ctx: any) => {
              const axis = ctx.dataset.yAxisID === 'yRight' ? rightUnit : leftUnit;
              return `${ctx.dataset.label}: ${ctx.parsed.y} ${axis}`;
            },
          },
        },
      },
    } as const;
  }, [isDark, leftUnit, rightUnit, labels, showLegend, sameDay]);

  return (
    <div style={{ height, width: '100%' }}>
      <Line data={chartData} options={options} />
    </div>
  );
}; 