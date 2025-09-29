"use client";

import React from "react";
import { Card, CardBody, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";

type SimpleCircleChartProps = {
  title: string;
  icon: IconDefinition;
  percentage: number;
  color?: string;
  loading?: boolean;
  subtitle?: string;
};

export function SimpleCircleChart({
  title,
  icon,
  percentage,
  color = "primary",
  loading = false,
  subtitle,
}: SimpleCircleChartProps) {
  if (loading) {
    return (
      <Card className="aspect-square p-4 bg-white dark:bg-default-50 border-0 shadow-sm">
        <CardBody className="flex flex-col p-0">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="w-4 h-4 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <Skeleton className="w-28 h-28 rounded-full" />
          </div>
        </CardBody>
      </Card>
    );
  }

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Card className="aspect-square p-4 bg-white dark:bg-default-50 border-0 shadow-sm hover:shadow-md transition-all">
      <CardBody className="flex flex-col p-0">
        {/* 标题区域 */}
        <div className="flex items-center gap-2 mb-4">
          <FontAwesomeIcon
            className="text-default-500 text-sm"
            icon={icon}
          />
          <span className="text-sm text-default-600 font-medium">{title}</span>
        </div>

        {/* 圆圈进度条 */}
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-28 h-28">
            <svg
              className="w-full h-full transform -rotate-90"
              viewBox="0 0 112 112"
            >
              {/* 背景圆圈 */}
              <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke="hsl(var(--heroui-default-100))"
                strokeWidth="8"
              />
              {/* 进度圆圈 */}
              <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke={`hsl(var(--heroui-${color}-500))`}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            {/* 中心百分比 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-foreground">
                {percentage}%
              </span>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}