"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/lib/utils';

// 趋势数据类型定义
export interface TrendData {
  avg_delay: number[];
  created_at: number[];
}

export interface MetricsTrendData {
  traffic: TrendData;
  ping: TrendData;
  pool: TrendData;
  speed: TrendData;
}

export interface MetricsTrendResponse {
  success: boolean;
  data: MetricsTrendData;
  hours: number;
  source: string;
  timestamp: number;
}

export interface UseMetricsTrendOptions {
  tunnelId: string;
  hours?: number;
  autoRefresh?: boolean;
  refreshInterval?: number; // 毫秒
  onError?: (error: Error) => void;
  onSuccess?: (data: MetricsTrendResponse) => void;
}

export interface UseMetricsTrendReturn {
  data: MetricsTrendResponse | null;
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
  isAutoRefreshEnabled: boolean;
  
  // 控制方法
  refresh: () => Promise<void>;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
  toggleAutoRefresh: () => void;
  
  // 统计信息
  getDataPointsCount: () => number;
  getLatestDataTime: () => Date | null;
  getRefreshInterval: () => number;
}

/**
 * 使用统一的趋势数据 Hook
 * 
 * 特性：
 * - 每15秒自动轮询（可配置）
 * - 支持手动刷新
 * - 自动内存管理，防止内存泄漏
 * - 错误处理和重试机制
 * - 时间戳对齐的数据
 * 
 * @example
 * ```tsx
 * const { data, loading, error, refresh, toggleAutoRefresh } = useMetricsTrend({
 *   tunnelId: "123",
 *   hours: 24,
 *   refreshInterval: 15000
 * });
 * ```
 */
export function useMetricsTrend({
  tunnelId,
  hours = 24,
  autoRefresh = true,
  refreshInterval = 15000,
  onError,
  onSuccess
}: UseMetricsTrendOptions): UseMetricsTrendReturn {
  
  // 状态管理
  const [data, setData] = useState<MetricsTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(autoRefresh);
  
  // 使用 ref 管理定时器和挂载状态
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 获取趋势数据的核心方法
  const fetchTrendData = useCallback(async (showLoading = true) => {
    try {
      // 验证 tunnelId 是否有效
      if (!tunnelId || tunnelId.trim() === '') {
        setLoading(false);
        setError('隧道ID无效');
        return;
      }
      
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // 创建新的中止控制器
      abortControllerRef.current = new AbortController();
      
      if (showLoading) setLoading(true);
      setError(null);

      const response = await fetch(
        buildApiUrl(`/api/tunnels/${tunnelId}/metrics-trend`),
        {
          signal: abortControllerRef.current.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result: MetricsTrendResponse = await response.json();
      
      if (!result.success) {
        throw new Error(result.data as any || '获取趋势数据失败');
      }

      // 只在组件仍然挂载时更新状态
      if (mountedRef.current) {
        setData(result);
        setLastUpdate(new Date());
        
        // 调用成功回调
        if (onSuccess) {
          onSuccess(result);
        }
      }
    } catch (err) {
      // 忽略取消的请求
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error('获取趋势数据失败:', err);
      
      if (mountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setError(errorMessage);
        
        // 调用错误回调
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      }
    } finally {
      if (mountedRef.current && showLoading) {
        setLoading(false);
      }
    }
  }, [tunnelId, onSuccess, onError]);

  // 启动定时器
  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchTrendData(false); // 轮询时不显示加载状态
      }
    }, refreshInterval);
    
    setIsAutoRefreshEnabled(true);
  }, [refreshInterval, fetchTrendData]);

  // 停止定时器
  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAutoRefreshEnabled(false);
  }, []);

  // 切换自动刷新
  const toggleAutoRefresh = useCallback(() => {
    if (isAutoRefreshEnabled) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
    }
  }, [isAutoRefreshEnabled, startAutoRefresh, stopAutoRefresh]);

  // 手动刷新
  const refresh = useCallback(async () => {
    await fetchTrendData(true);
  }, [fetchTrendData]);

  // 获取数据点数量
  const getDataPointsCount = useCallback(() => {
    if (!data?.data) return 0;
    return data.data.traffic.created_at.length;
  }, [data]);

  // 获取最新数据时间
  const getLatestDataTime = useCallback((): Date | null => {
    if (!data?.data || !data.data.traffic.created_at.length) return null;
    const latest = data.data.traffic.created_at[data.data.traffic.created_at.length - 1];
    return new Date(latest);
  }, [data]);

  // 获取刷新间隔
  const getRefreshInterval = useCallback(() => {
    return refreshInterval;
  }, [refreshInterval]);

  // 初始化和清理
  useEffect(() => {
    mountedRef.current = true;

    // 清理函数
    return () => {
      mountedRef.current = false;
      
      // 清理定时器
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // 取消进行中的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []); // 只在挂载时执行一次

  // 监听 tunnelId 变化，重新加载数据
  useEffect(() => {
    // 只有当 tunnelId 有效时才进行初始加载
    if (tunnelId && tunnelId.trim() !== '') {
      // 初始加载
      fetchTrendData(true);
    } else {
      // 如果 tunnelId 无效，清除之前的状态
      setData(null);
      setError(null);
      setLoading(false);
    }
  }, [tunnelId, fetchTrendData]);

  // 监听自动刷新设置变化
  useEffect(() => {
    if (autoRefresh && tunnelId && tunnelId.trim() !== '') {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
    
    return () => {
      stopAutoRefresh();
    };
  }, [autoRefresh, tunnelId, startAutoRefresh, stopAutoRefresh]);

  // 监听刷新间隔变化
  useEffect(() => {
    if (isAutoRefreshEnabled) {
      stopAutoRefresh();
      startAutoRefresh();
    }
  }, [refreshInterval, isAutoRefreshEnabled, stopAutoRefresh, startAutoRefresh]); // 当刷新间隔变化时重启定时器

  return {
    data,
    loading,
    error,
    lastUpdate,
    isAutoRefreshEnabled,
    
    // 控制方法
    refresh,
    startAutoRefresh,
    stopAutoRefresh,
    toggleAutoRefresh,
    
    // 统计信息
    getDataPointsCount,
    getLatestDataTime,
    getRefreshInterval
  };
}

// 数据格式化工具函数
export const formatMetricsData = {
  /**
   * 格式化时间戳为本地时间字符串
   */
  formatTimestamp: (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  /**
   * 格式化延迟值（毫秒）
   */
  formatLatency: (latency: number): string => {
    return `${latency.toFixed(2)}ms`;
  },

  /**
   * 格式化流量值（字节）
   */
  formatTraffic: (bytes: number): string => {
    if (bytes === 0) return '0 B/min';
    const k = 1024;
    const sizes = ['B/min', 'KB/min', 'MB/min', 'GB/min'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  /**
   * 格式化连接池数量
   */
  formatPool: (count: number): string => {
    return `${Math.round(count)} 个连接`;
  },

  /**
   * 获取数据的统计摘要
   */
  getDataSummary: (data: number[]): {
    min: number;
    max: number;
    avg: number;
    count: number;
  } => {
    if (data.length === 0) {
      return { min: 0, max: 0, avg: 0, count: 0 };
    }
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
    
    return { min, max, avg, count: data.length };
  }
};
