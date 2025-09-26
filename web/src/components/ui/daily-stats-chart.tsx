"use client";

import type { ButtonProps } from "@heroui/react";

import React from "react";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  Cell,
  Tooltip,
} from "recharts";
import { Card } from "@heroui/react";
import { Icon } from "@iconify/react";

type ChartData = {
  name: string;
  value: number;
  valueText: string;
  [key: string]: string | number;
};

type DailyStatsChartProps = {
  title?: string;
  color?: ButtonProps["color"];
  categories?: string[];
  chartData?: ChartData[];
  unit?: string;
  unitTitle?: string;
  total?: number;
  loading?: boolean;
  formatBytes?: (bytes: number) => string;
};

const colorIndexMap = (index: number) => {
  const mapIndex: Record<number, number> = {
    0: 300,
    1: 500,
    2: 700,
    3: 900,
  };

  return mapIndex[index] ?? 200;
};

const formatTotal = (value: number | undefined) => {
  return value?.toLocaleString() ?? "0";
};

function DailyStatsChartComponent({
  title = "今日流量",
  categories = ["TCP入站", "TCP出站", "UDP入站", "UDP出站"],
  color = "success",
  chartData = [],
  unit = "",
  unitTitle = "总流量",
  total = 0,
  loading = false,
  formatBytes = (bytes: number) => `${bytes} B`,
}: DailyStatsChartProps) {
  return (
    <Card className="dark:border-default-100 min-h-[300] border border-transparent">
      <div className="flex flex-col gap-y-4 p-5 pb-0">
        <div className="flex flex-col gap-y-0">
          <span className="text-base font-semibold text-foreground">
            {title}
          </span>
        </div>
      </div>

      {loading ? (
        // 加载状态
        <div className="flex h-[200px] items-center justify-center">
          <div className="text-center">
            <div className="mb-2 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-primary border-r-transparent" />
            <span className="text-sm text-default-500">加载中...</span>
          </div>
        </div>
      ) : chartData.length === 0 ? (
        // 无数据状态
        <div className="flex h-[200px] items-center justify-center">
          <div className="text-center">
            <Icon
              className="text-4xl text-default-300 mb-2"
              icon="solar:database-bold"
            />
            <span className="text-sm text-default-500">暂无数据</span>
          </div>
        </div>
      ) : (
        // 正常数据显示
        <div className="flex h-full flex-col flex-col-reverse flex-wrap gap-3 sm:flex-row sm:flex-nowrap">
          <div className="text-tiny text-default-500 flex flex-col justify-center gap-y-4 pb-4 pl-5 lg:pb-0 sm:flex-[2]">
            {categories.map((category, index) => {
              const matchedData = chartData.find((c) => c.name === category);
              const valueText = matchedData?.valueText || "0 B";

              return (
                <div key={index} className="flex justify-between gap-y-0 pr-2">
                  <span className="text-small text-default-500 font-medium capitalize">
                    {category}
                  </span>
                  <span className="text-small text-foreground font-semibold">
                    {valueText}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="sm:flex-[3]">
            <ResponsiveContainer
              className="[&_.recharts-surface]:outline-hidden pr-5"
              height={200}
              width="100%"
            >
              <RadialBarChart
                barSize={10}
                cx="50%"
                cy="50%"
                data={chartData}
                endAngle={-270}
                innerRadius={90}
                outerRadius={54}
                startAngle={90}
              >
                <Tooltip
                  content={({ payload }) => (
                    <div className="rounded-medium bg-background text-tiny shadow-small flex h-8 min-w-[120px] items-center gap-x-2 px-1">
                      {payload?.map((p) => {
                        const name = p.payload.name;
                        const value = p.value;
                        const index = chartData.findIndex(
                          (c) => c.name === name,
                        );

                        return (
                          <div
                            key={`${index}-${name}`}
                            className="flex w-full items-center gap-x-2"
                          >
                            <div
                              className="h-2 w-2 flex-none rounded-full"
                              style={{
                                backgroundColor: `hsl(var(--heroui-${color}-${colorIndexMap(index)}))`,
                              }}
                            />
                            <div className="text-default-700 flex w-full items-center justify-between gap-x-2 pr-1 text-xs">
                              <span className="text-default-500">{name}</span>
                              <span className="text-default-700 font-mono font-medium">
                                {formatBytes(value as number)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  cursor={false}
                />
                <RadialBar
                  animationDuration={1000}
                  animationEasing="ease"
                  background={{ fill: "hsl(var(--heroui-default-100))" }}
                  cornerRadius={12}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`hsl(var(--heroui-${color}-${colorIndexMap(index)}))`}
                    />
                  ))}
                </RadialBar>
                <g>
                  <text textAnchor="middle" x="50%" y="48%">
                    <tspan
                      className="fill-default-500 text-[0.6rem]"
                      dy="-0.5em"
                      x="50%"
                    >
                      {unitTitle}
                    </tspan>
                    <tspan
                      className="fill-foreground text-tiny font-semibold"
                      dy="1.5em"
                      x="50%"
                    >
                      {formatBytes(total)}
                    </tspan>
                  </text>
                </g>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

// 使用React.memo优化渲染性能
export const DailyStatsChart = React.memo(DailyStatsChartComponent);
