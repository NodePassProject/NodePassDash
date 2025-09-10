import type { ButtonProps, CardProps } from "@heroui/react";
import React from "react";
import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell, Label } from "recharts";
import {
  Card,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";

type ChartData = {
  name: string;
  [key: string]: string | number;
};

type TodayTrafficChartProps = {
  title: string;
  value: string;
  unit?: string;
  color: ButtonProps["color"];
  categories: string[];
  chartData: ChartData[];
  loading?: boolean;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatValue = (value: number | undefined): string => {
  if (!value) return "0 B";
  return formatBytes(value);
};

export const TodayTrafficChart = React.forwardRef<
  HTMLDivElement,
  Omit<CardProps, "children"> & TodayTrafficChartProps
>(
  (
    {
      className,
      title,
      value,
      unit,
      categories,
      color,
      chartData,
      loading = false,
      ...props
    },
    ref,
  ) => {
    if (loading) {
      return (
        <Card
          ref={ref}
          className={cn("dark:border-default-100 min-h-[340px] border border-transparent", className)}
          {...props}
        >
          <div className="flex flex-col gap-y-2 p-4 pb-0">
            <div className="flex items-center justify-between gap-x-2">
              <dt>
                <h3 className="text-small text-default-500 font-medium">{title}</h3>
              </dt>
            </div>
            <dd className="flex items-baseline gap-x-1">
              <span className="text-default-900 text-3xl font-semibold">--</span>
              <span className="text-medium text-default-500 font-medium">{unit}</span>
            </dd>
          </div>
          <div className="h-[200px] flex items-center justify-center">
            <div className="text-center space-y-3">
              <Icon icon="solar:chart-2-bold" className="w-12 h-12 text-default-300 mx-auto animate-pulse" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-default-600">加载中...</p>
              </div>
            </div>
          </div>
        </Card>
      );
    }

    // 检查是否有数据或者总流量为0
    const totalTraffic = chartData.reduce((sum, item) => sum + (item.value as number || 0), 0);
    const hasNoTraffic = chartData.length === 0 || totalTraffic === 0;

    if (hasNoTraffic) {
      return (
        <Card
          ref={ref}
          className={cn("dark:border-default-100 min-h-[340px] border border-transparent bg-gradient-to-br from-default-50/50 to-default-100/30", className)}
          {...props}
        >
          <div className="flex flex-col gap-y-2 p-4 pb-0">
            <div className="flex items-center justify-between gap-x-2">
              <dt>
                <h3 className="text-small text-default-500 font-medium">{title}</h3>
              </dt>
            </div>
            <dd className="flex items-baseline gap-x-1">
              <span className="text-default-600 text-3xl font-semibold">0 B</span>
              <span className="text-medium text-default-400 font-medium">{unit}</span>
            </dd>
          </div>
          <div className="h-[200px] flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="relative">
                <Icon icon="solar:chart-2-linear" className="w-16 h-16 text-default-300 mx-auto" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-default-600">暂无流量变化</p>
              </div>
            </div>
          </div>
          {/* 空状态下的图例 */}
          <div className="text-tiny text-default-400 flex w-full flex-wrap justify-center gap-4 px-4 pb-4">
            {categories.map((category, index) => (
              <div key={index} className="flex items-center gap-2 opacity-50">
                <span
                  className="h-2 w-2 rounded-full bg-default-300"
                />
                <span className="capitalize">{category}</span>
              </div>
            ))}
          </div>
        </Card>
      );
    }

    return (
      <Card
        ref={ref}
        className={cn("dark:border-default-100 min-h-[340px] border border-transparent", className)}
        {...props}
      >
        <div className="flex flex-col gap-y-2 p-4 pb-0">
          <div className="flex items-center justify-between gap-x-2">
            <dt>
              <h3 className="text-small text-foreground font-medium">{title}</h3>
            </dt>
            <div className="flex items-center justify-end gap-x-2">
              {/* <Dropdown
                classNames={{
                  content: "min-w-[120px]",
                }}
                placement="bottom-end"
              >
                <DropdownTrigger>
                  <Button isIconOnly radius="full" size="sm" variant="light">
                    <Icon height={16} icon="solar:menu-dots-bold" width={16} />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  itemClasses={{
                    title: "text-tiny",
                  }}
                  variant="flat"
                >
                  <DropdownItem key="view-details">查看详情</DropdownItem>
                  <DropdownItem key="export-data">导出数据</DropdownItem>
                  <DropdownItem key="set-alert">设置告警</DropdownItem>
                </DropdownMenu>
              </Dropdown> */}
            </div>
          </div>
          <dd className="flex items-baseline gap-x-1">
            <span className="text-default-900 text-3xl font-semibold">{value}</span>
            <span className="text-medium text-default-500 font-medium">{unit}</span>
          </dd>
        </div>
        <ResponsiveContainer
          className="flex-1 [&_.recharts-surface]:outline-hidden"
          height="100%"
          width="100%"
        >
          <PieChart accessibilityLayer margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Tooltip
              content={({ label, payload }) => (
                <div className="rounded-medium bg-background text-tiny shadow-small flex h-8 min-w-[120px] items-center gap-x-2 px-1">
                  <span className="text-foreground font-medium">{label}</span>
                  {payload?.map((p, index) => {
                    const name = p.name;
                    const value = p.value;
                    // 根据索引直接匹配类别，因为数据顺序是固定的
                    const category = categories[index] || name;

                    return (
                      <div key={`${index}-${name}`} className="flex w-full items-center gap-x-2">
                        <div
                          className="h-2 w-2 flex-none rounded-full"
                          style={{
                            backgroundColor: `hsl(var(--heroui-${color}-${(index + 1) * 200}))`,
                          }}
                        />
                        <div className="text-default-700 flex w-full items-center justify-between gap-x-2 pr-1 text-xs">
                          <span className="text-default-500">{category}</span>
                          <span className="text-default-700 font-mono font-medium">
                            {formatValue(value as number)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              cursor={false}
            />
            <Pie
              animationDuration={1000}
              animationEasing="ease"
              cornerRadius={12}
              data={chartData}
              dataKey="value"
              innerRadius="68%"
              nameKey="name"
              paddingAngle={-20}
              strokeWidth={0}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={`hsl(var(--heroui-${color}-${(index + 1) * 200}))`}
                />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        dominantBaseline="central"
                        textAnchor="middle"
                        x={viewBox.cx!}
                        y={viewBox.cy!}
                      >
                        <tspan
                          fill="hsl(var(--heroui-default-700))"
                          fontSize={20}
                          fontWeight={600}
                        >
                          今日
                        </tspan>
                      </text>
                    );
                  }
                  return null;
                }}
                position="center"
              />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="text-tiny text-default-500 flex w-full flex-wrap justify-center gap-4 px-4 pb-4">
          {categories.map((category, index) => (
            <div key={index} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: `hsl(var(--heroui-${color}-${(index + 1) * 200}))`,
                }}
              />
              <span className="capitalize">{category}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  },
);

TodayTrafficChart.displayName = "TodayTrafficChart";
