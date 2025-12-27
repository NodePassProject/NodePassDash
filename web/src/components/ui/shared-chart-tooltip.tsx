import React from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

// 格式化时间函数 - 统一的时间格式化
const formatFullTime = (timestamp: string | number): string => {
  const date = new Date(timestamp);

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

// 流量格式化函数
const formatTrafficValue = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.abs(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return {
    value: value.toFixed(1),
    unit: units[unitIndex],
  };
};

// 速率格式化函数 - 格式化字节/秒
const formatSpeedValue = (bytesPerSecond: number) => {
  const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];

  let value = Math.abs(bytesPerSecond);
  let unitIndex = 0;

  // 使用1024作为进制
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return {
    value: value.toFixed(1),
    unit: units[unitIndex],
  };
};

// Tooltip数据项接口
interface TooltipItem {
  key: string;
  name: string;
  value: number;
  color?: string;
  unit?: "traffic" | "speed" | "pool" | "latency";
}

// 自定义Tooltip组件属性
interface SharedChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  items?: TooltipItem[]; // 可选的自定义数据项
}

// 通用的图表Tooltip组件
export const SharedChartTooltip: React.FC<SharedChartTooltipProps> = ({
  active,
  payload,
  label,
  items,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation("common");

  if (!active || (!payload?.length && !items?.length)) return null;

  // 使用自定义items或从payload中提取数据
  const dataItems =
    items ||
    payload?.map((entry: any, index: number) => ({
      key: entry.dataKey || `item_${index}`,
      name: entry.name || entry.dataKey || "Unknown",
      value: entry.value,
      color: entry.color,
      unit: "traffic" as const, // 默认单位类型
    })) ||
    [];

  const formatValue = (value: number, unit?: string) => {
    switch (unit) {
      case "traffic":
        const traffic = formatTrafficValue(value);

        return `${traffic.value} ${traffic.unit}`;
      case "speed":
        const speed = formatSpeedValue(value);

        return `${speed.value} ${speed.unit}`;
      case "pool":
        return `${Math.round(value)}`;
      case "latency":
        return `${value.toFixed(2)}ms`;
      default:
        return value.toString();
    }
  };

  return (
    <div className="bg-background border border-default-200 rounded-lg p-3 shadow-lg">
      <p className="text-sm text-default-600 mb-1">
        {formatFullTime(label || "")}
      </p>
      {dataItems.map((item: TooltipItem, index: number) => {
        if (item.value === null || item.value === undefined) return null;

        return (
          <p key={index} className="text-sm font-semibold text-foreground">
            {item.name}:{" "}
            <span className={item.color || "text-warning"}>
              {formatValue(item.value, item.unit)}
            </span>
          </p>
        );
      })}
    </div>
  );
};

// 预定义的Tooltip组件
export const TrafficTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation("common");

  return (
    <SharedChartTooltip
      active={active}
      items={payload?.map((entry: any) => ({
        key: entry.dataKey,
        name: t("traffic") || "Traffic",
        value: entry.value,
        color: "text-green-600 dark:text-green-400",
        unit: "traffic" as const,
      }))}
      label={label}
      payload={payload}
    />
  );
};

export const SpeedTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation("tunnels");

  return (
    <SharedChartTooltip
      active={active}
      items={payload?.map((entry: any) => ({
        key: entry.dataKey,
        name:
          entry.dataKey === "speed_in"
            ? t("details.chartTooltips.upload")
            : t("details.chartTooltips.download"),
        value: entry.value,
        color:
          entry.dataKey === "speed_in"
            ? "text-blue-600 dark:text-blue-400"
            : "text-purple-600 dark:text-purple-400",
        unit: "speed" as const,
      }))}
      label={label}
      payload={payload}
    />
  );
};

export const PoolTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation("tunnels");

  return (
    <SharedChartTooltip
      active={active}
      items={payload?.map((entry: any) => ({
        key: entry.dataKey,
        name: t("details.chartTooltips.pool"),
        value: entry.value,
        color: "text-red-600 dark:text-red-400",
        unit: "pool" as const,
      }))}
      label={label}
      payload={payload}
    />
  );
};

export const LatencyTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation("tunnels");

  return (
    <SharedChartTooltip
      active={active}
      items={payload?.map((entry: any) => ({
        key: entry.dataKey,
        name: t("details.chartTooltips.latency"),
        value: entry.value,
        color: "text-warning",
        unit: "latency" as const,
      }))}
      label={label}
      payload={payload}
    />
  );
};

// 新的延迟Tooltip组件，用于新的LatencyChart
export const LatencyTooltipV2 = ({ active, payload, label }: any) => {
  const { t } = useTranslation("tunnels");

  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const value = entry.value;
  const timestamp = label;

  return (
    <div className="bg-background border border-default-200 rounded-lg p-3 shadow-lg">
      <p className="text-sm text-default-600 mb-1">
        {timestamp
          ? new Date(timestamp).toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : ""}
      </p>
      <p className="text-sm font-semibold text-foreground">
        {t("details.chartTooltips.latency")}:{" "}
        <span className="text-warning">{value.toFixed(2)}ms</span>
      </p>
    </div>
  );
};

export const ConnectionsTooltip = ({ active, payload, label }: any) => {
  const { t } = useTranslation("tunnels");

  return (
    <SharedChartTooltip
      active={active}
      items={payload
        ?.map((entry: any) => {
          let name = "";
          let color = "";

          switch (entry.dataKey) {
            case "pool":
              name = t("details.chartTooltips.pool");
              color = "text-red-600 dark:text-red-400";
              break;
            case "tcps":
              name = t("details.chartTooltips.tcp");
              color = "text-orange-600 dark:text-orange-400";
              break;
            case "udps":
              name = t("details.chartTooltips.udp");
              color = "text-teal-600 dark:text-teal-400";
              break;
            default:
              name = entry.name || entry.dataKey;
              color = "text-default-600";
          }

          return {
            key: entry.dataKey,
            name,
            value: entry.value,
            color,
            unit: "pool" as const,
          };
        })
        .filter((item: any) => item.value !== null && item.value !== undefined)}
      label={label}
      payload={payload}
    />
  );
};

export default SharedChartTooltip;
