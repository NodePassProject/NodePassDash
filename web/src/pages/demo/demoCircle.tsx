"use client";

import type {ButtonProps, CardProps} from "@heroui/react";

import React from "react";
import {ResponsiveContainer, PieChart, Pie, Tooltip, Cell, Label} from "recharts";
import {
  Card,
  Button,
  Select,
  SelectItem,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  cn,
} from "@heroui/react";
import {Icon} from "@iconify/react";

type ChartData = {
  name: string;
  [key: string]: string | number;
};

type CircleChartProps = {
  title: string;
  total: number;
  unit?: string;
  color: ButtonProps["color"];
  categories: string[];
  chartData: ChartData[];
};

const data: CircleChartProps[] = [
  {
    title: "Traffic Sources",
    total: 224000,
    unit: "Visitors",
    categories: ["Search", "Direct", "Social", "Referral"],
    color: "default",
    chartData: [
      {name: "Search", value: 400},
      {name: "Direct", value: 300},
      {name: "Social", value: 300},
      {name: "Referral", value: 200},
    ],
  },
  {
    title: "Device Usage",
    total: 4500,
    unit: "Devices",
    categories: ["Mobile", "Desktop", "Tablet", "Smart TV"],
    color: "primary",
    chartData: [
      {name: "Mobile", value: 450},
      {name: "Desktop", value: 300},
      {name: "Tablet", value: 250},
      {name: "Smart TV", value: 200},
    ],
  },
  {
    title: "Browser Usage",
    total: 8790,
    unit: "Devices",
    categories: ["Chrome", "Safari", "Firefox", "Edge"],
    color: "secondary",
    chartData: [
      {name: "Chrome", value: 350},
      {name: "Safari", value: 280},
      {name: "Firefox", value: 220},
      {name: "Edge", value: 150},
    ],
  },
];

export default function Component() {
  return (
    <dl className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
      {data.map((item, index) => (
        <CircleChartCard key={index} {...item} />
      ))}
    </dl>
  );
}

const formatTotal = (total: number) => {
  return total >= 1000 ? `${(total / 1000).toFixed(1)}K` : total;
};

const CircleChartCard = React.forwardRef<
  HTMLDivElement,
  Omit<CardProps, "children"> & CircleChartProps
>(({className, title, total, unit, categories, color, chartData, ...props}, ref) => {
  return (
    <Card
      ref={ref}
      className={cn("dark:border-default-100 min-h-[280px] border border-transparent", className)}
      {...props}
    >
      <div className="flex flex-col gap-y-2 p-4 pb-0">
        <div className="flex items-center justify-between gap-x-2">
          <dt>
            <h3 className="text-small text-default-500 font-medium">{title}</h3>
          </dt>
          <div className="flex items-center justify-end gap-x-2">
            <Select
              aria-label="Time Range"
              classNames={{
                trigger: "min-w-[100px] min-h-7 h-7",
                value: "text-tiny text-default-500!",
                selectorIcon: "text-default-500",
                popoverContent: "min-w-[120px]",
              }}
              defaultSelectedKeys={["per-day"]}
              listboxProps={{
                itemClasses: {
                  title: "text-tiny",
                },
              }}
              placeholder="Per Day"
              size="sm"
            >
              <SelectItem key="per-day">Per Day</SelectItem>
              <SelectItem key="per-week">Per Week</SelectItem>
              <SelectItem key="per-month">Per Month</SelectItem>
            </Select>
            <Dropdown
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
                <DropdownItem key="view-details">View Details</DropdownItem>
                <DropdownItem key="export-data">Export Data</DropdownItem>
                <DropdownItem key="set-alert">Set Alert</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>
      <div className="flex h-full flex-wrap items-center justify-center gap-x-2 lg:flex-nowrap">
        <ResponsiveContainer
          className="w-full max-w-[200px] [&_.recharts-surface]:outline-hidden"
          height={200}
          width="100%"
        >
          <PieChart accessibilityLayer margin={{top: 0, right: 0, left: 0, bottom: 0}}>
            <Tooltip
              content={({label, payload}) => (
                <div className="rounded-medium bg-background text-tiny shadow-small flex h-8 min-w-[120px] items-center gap-x-2 px-1">
                  <span className="text-foreground font-medium">{label}</span>
                  {payload?.map((p, index) => {
                    const name = p.name;
                    const value = p.value;
                    const category = categories.find((c) => c.toLowerCase() === name) ?? name;

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
                            {formatTotal(value as number)}
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
                content={({viewBox}) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        dominantBaseline="auto"
                        textAnchor="middle"
                        x={viewBox.cx!}
                        y={viewBox.cy!}
                      >
                        <tspan
                          fill="hsl(var(--heroui-default-700))"
                          fontSize={20}
                          fontWeight={600}
                          x={viewBox.cx!}
                          y={viewBox.cy!}
                        >
                          {formatTotal(total)}
                        </tspan>
                        <tspan
                          fill="hsl(var(--heroui-default-500))"
                          fontSize={12}
                          fontWeight={500}
                          x={viewBox.cx!}
                          y={viewBox.cy! + 14}
                        >
                          {unit}
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

        <div className="text-tiny text-default-500 flex w-full flex-col justify-center gap-4 p-4 lg:p-0">
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
      </div>
    </Card>
  );
});

CircleChartCard.displayName = "CircleChartCard";
