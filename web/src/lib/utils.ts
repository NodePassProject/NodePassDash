import type { TrafficHistory, TrafficStats, Instance } from "./types";

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 构建 API URL
 * @param path API 路径
 * @returns 完整的 API URL
 */
export function buildApiUrl(path: string): string {
  // ---------- 浏览器端 ----------
  if (typeof window !== "undefined") {
    if (import.meta.env.DEV) {
      return path; // 开发环境由 vite 代理
    }

    return `${window.location.origin}${path}`; // 生产环境同源
  }

  // ---------- 服务器端 ----------
  // SSR/SSG 阶段返回原样（或按需拼同源）
  return path;
}

// 实例缓存
const instanceCache = new Map<string, { data: Instance; timestamp: number }>();
const CACHE_TTL = 60000; // 1分钟缓存时间

// 流量历史记录
const trafficHistory: Record<string, TrafficHistory> = {};
const MAX_HISTORY = 1000; // 最大历史记录数

// 前一个统计数据
const previousStats: Record<string, TrafficStats> = {};

// 获取缓存的实例信息
export async function getCachedInstance(
  id: string,
  fetchFn: () => Promise<Instance>,
): Promise<Instance> {
  const now = Date.now();
  const cached = instanceCache.get(id);

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetchFn();

  instanceCache.set(id, {
    data,
    timestamp: now,
  });

  return data;
}

// 处理流量统计
export function processTrafficStats(
  instanceId: string,
  currentStats: TrafficStats,
): void {
  // 如果我们有该实例的前一个统计数据，计算差值
  if (previousStats[instanceId]) {
    const timeDiff =
      currentStats.timestamp - previousStats[instanceId].timestamp;
    const tcpInDiff = currentStats.tcp_in - previousStats[instanceId].tcp_in;
    const tcpOutDiff = currentStats.tcp_out - previousStats[instanceId].tcp_out;
    const udpInDiff = currentStats.udp_in - previousStats[instanceId].udp_in;
    const udpOutDiff = currentStats.udp_out - previousStats[instanceId].udp_out;

    // 存储历史数据
    storeTrafficHistory(instanceId, {
      timestamp: currentStats.timestamp,
      tcp_in_rate: (tcpInDiff / timeDiff) * 1000, // 每秒字节数
      tcp_out_rate: (tcpOutDiff / timeDiff) * 1000,
      udp_in_rate: (udpInDiff / timeDiff) * 1000,
      udp_out_rate: (udpOutDiff / timeDiff) * 1000,
    });
  }

  // 更新前一个统计数据
  previousStats[instanceId] = currentStats;
}

// 存储流量历史
export function storeTrafficHistory(
  instanceId: string,
  metrics: {
    timestamp: number;
    tcp_in_rate: number;
    tcp_out_rate: number;
    udp_in_rate: number;
    udp_out_rate: number;
  },
): void {
  if (!trafficHistory[instanceId]) {
    trafficHistory[instanceId] = {
      timestamps: [],
      tcp_in_rates: [],
      tcp_out_rates: [],
      udp_in_rates: [],
      udp_out_rates: [],
    };
  }

  const history = trafficHistory[instanceId];

  history.timestamps.push(metrics.timestamp);
  history.tcp_in_rates.push(metrics.tcp_in_rate);
  history.tcp_out_rates.push(metrics.tcp_out_rate);
  history.udp_in_rates.push(metrics.udp_in_rate);
  history.udp_out_rates.push(metrics.udp_out_rate);

  // 保持历史数据量可管理
  if (history.timestamps.length > MAX_HISTORY) {
    history.timestamps.shift();
    history.tcp_in_rates.shift();
    history.tcp_out_rates.shift();
    history.udp_in_rates.shift();
    history.udp_out_rates.shift();
  }
}

// 获取实例的流量历史
export function getTrafficHistory(
  instanceId: string,
): TrafficHistory | undefined {
  return trafficHistory[instanceId];
}

// 清除实例的流量历史
export function clearTrafficHistory(instanceId: string): void {
  delete trafficHistory[instanceId];
  delete previousStats[instanceId];
}

// 清除所有流量历史
export function clearAllTrafficHistory(): void {
  Object.keys(trafficHistory).forEach(clearTrafficHistory);
}

// 清除实例缓存
export function clearInstanceCache(instanceId?: string): void {
  if (instanceId) {
    instanceCache.delete(instanceId);
  } else {
    instanceCache.clear();
  }
}

/**
 * 将对象中的 BigInt 值转换为数字，用于 JSON 序列化
 * @param obj 要转换的对象
 * @returns 转换后的对象
 */
export function convertBigIntToNumber<T = any>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    // 如果 BigInt 值太大，转换为字符串；否则转换为数字
    return (obj > Number.MAX_SAFE_INTEGER ? obj.toString() : Number(obj)) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber) as T;
  }

  if (typeof obj === "object") {
    const converted: any = {};

    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }

    return converted as T;
  }

  return obj;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);

    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  if (seconds >= 0) {
    return `${seconds}s`;
  }

  return "0s";
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatTime12(timestamp: number): string {
  // example: 3:45 PM
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;

  return `${hours12}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

// 重新导出隐私相关工具函数
export { formatUrlWithPrivacy } from "./utils/privacy";
