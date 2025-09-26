"use client";

import type { ButtonProps } from "@heroui/react";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@heroui/react";

type ChartData = {
  weekday: string;
  [key: string]: string | number;
};

type WeeklyStatsChartProps = {
  title?: string;
  color?: ButtonProps["color"];
  categories?: string[];
  chartData?: ChartData[];
  loading?: boolean;
  formatBytes?: (bytes: number) => string;
};

// 模拟本周统计数据
const weeklyStatsData: WeeklyStatsChartProps = {
  title: "本周统计",
  categories: ["TCP In", "TCP Out", "UDP In", "UDP Out"],
  color: "primary",
  chartData: [
    {
      weekday: "Mon",
      "TCP In": 45,
      "TCP Out": 32,
      "UDP In": 28,
      "UDP Out": 15,
    },
    {
      weekday: "Tue",
      "TCP In": 52,
      "TCP Out": 38,
      "UDP In": 35,
      "UDP Out": 22,
    },
    {
      weekday: "Wed",
      "TCP In": 38,
      "TCP Out": 28,
      "UDP In": 25,
      "UDP Out": 18,
    },
    {
      weekday: "Thu",
      "TCP In": 65,
      "TCP Out": 42,
      "UDP In": 38,
      "UDP Out": 25,
    },
    {
      weekday: "Fri",
      "TCP In": 58,
      "TCP Out": 35,
      "UDP In": 32,
      "UDP Out": 20,
    },
    {
      weekday: "Sat",
      "TCP In": 72,
      "TCP Out": 48,
      "UDP In": 45,
      "UDP Out": 30,
    },
    {
      weekday: "Sun",
      "TCP In": 80,
      "TCP Out": 55,
      "UDP In": 50,
      "UDP Out": 35,
    },
  ],
};

const formatWeekday = (weekday: string) => {
  const dayMap: Record<string, string> = {
    Mon: "Mon",
    Tue: "Tue",
    Wed: "Wed",
    Thu: "Thu",
    Fri: "Fri",
    Sat: "Sat",
    Sun: "Sun",
  };

  return dayMap[weekday] || weekday;
};

function WeeklyStatsChartComponent({
  title = "本周统计",
  categories = ["TCP In", "TCP Out", "UDP In", "UDP Out"],
  color = "primary",
  chartData = [],
  loading = false,
  formatBytes = (bytes: number) => `${bytes} B`,
}: WeeklyStatsChartProps) {
  return (
    <Card className="h-full dark:border-default-100 border border-transparent">
      <div className="flex flex-col gap-y-4 p-5 pb-0">
        <div className="flex flex-col gap-y-0">
          <span className="text-base font-semibold text-foreground">
            {title}
          </span>
        </div>

        {!loading && (
          <div className="text-tiny text-default-500 flex w-full justify-end gap-4">
            {categories.map((category, index) => (
              <div key={index} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: `hsl(var(--heroui-${color}-${(index + 1) * 200}))`,
                  }}
                />
                <span>{category}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        // 加载状态
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-2 h-8 w-8 mx-auto animate-spin rounded-full border-2 border-primary border-r-transparent" />
            <span className="text-sm text-default-500">加载中...</span>
          </div>
        </div>
      ) : (
        // 总是显示图表，即使数据为空也显示7天的0值
        <ResponsiveContainer
          className="[&_.recharts-surface]:outline-hidden flex-1"
          height={150}
          width="100%"
        >
          <BarChart
            data={chartData}
            margin={{
              top: 20,
              right: 14,
              left: -8,
              bottom: 5,
            }}
          >
            <XAxis
              dataKey="weekday"
              strokeOpacity={0.25}
              style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              tickFormatter={formatWeekday}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              style={{ fontSize: "var(--heroui-font-size-tiny)" }}
              tickFormatter={(value) => formatBytes(value)}
              tickLine={false}
            />
            <Tooltip
              content={({ label, payload }) => (
                <div className="rounded-medium bg-background text-tiny shadow-small flex h-auto min-w-[120px] items-center gap-x-2 p-2">
                  <div className="flex w-full flex-col gap-y-1">
                    <span className="text-foreground font-medium">
                      {formatWeekday(label)}
                    </span>
                    {payload?.map((p, index) => {
                      const name = p.name;
                      const value = p.value;
                      const category =
                        categories.find((c) => c === name) ?? name;

                      return (
                        <div
                          key={`${index}-${name}`}
                          className="flex w-full items-center gap-x-2"
                        >
                          <div
                            className="h-2 w-2 flex-none rounded-full"
                            style={{
                              backgroundColor: `hsl(var(--heroui-${color}-${(index + 1) * 200}))`,
                            }}
                          />
                          <div className="text-default-700 flex w-full items-center justify-between gap-x-2 pr-1 text-xs">
                            <span className="text-default-500">{category}</span>
                            <span className="text-default-700 font-mono font-medium">
                              {formatBytes(value as number)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              cursor={false}
            />
            {categories.map((category, index) => (
              <Bar
                key={`${category}-${index}`}
                animationDuration={450}
                animationEasing="ease"
                barSize={24}
                dataKey={category}
                fill={`hsl(var(--heroui-${color}-${(index + 1) * 200}))`}
                radius={index === categories.length - 1 ? [4, 4, 0, 0] : 0}
                stackId="bars"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

// 使用React.memo优化渲染性能
export const WeeklyStatsChart = React.memo(WeeklyStatsChartComponent);
