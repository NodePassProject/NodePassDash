/**
 * 服务历史数据相关的React Hooks
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  ServiceHistory,
  HistoryStatsSummary,
  DashboardHistorySummary,
  HistoryQueryParams,
  HistoryTrendPoint,
  HistoryWorkerStats
} from '@/lib/types/service-history';

// 获取实例历史数据的Hook
export const useInstanceHistory = (endpointId: number, instanceId: string, hours: number = 24) => {
  const [histories, setHistories] = useState<ServiceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/service-history/instance?endpointId=${endpointId}&instanceId=${instanceId}&hours=${hours}`);
      const data = await response.json();
      
      if (data.success) {
        setHistories(data.data || []);
      } else {
        setError(data.error || '获取历史数据失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [endpointId, instanceId, hours]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    histories,
    loading,
    error,
    refetch: fetchData
  };
};

// 获取端点历史数据的Hook
export const useEndpointHistory = (endpointId: number, hours: number = 24) => {
  const [histories, setHistories] = useState<ServiceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/service-history/endpoint?endpointId=${endpointId}&hours=${hours}`);
      const data = await response.json();
      
      if (data.success) {
        setHistories(data.data || []);
      } else {
        setError(data.error || '获取历史数据失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [endpointId, hours]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    histories,
    loading,
    error,
    refetch: fetchData
  };
};

// 获取历史数据统计摘要的Hook
export const useHistoryStats = (params: HistoryQueryParams) => {
  const [stats, setStats] = useState<HistoryStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const query = new URLSearchParams();
      if (params.endpointId) query.append('endpointId', params.endpointId.toString());
      if (params.instanceId) query.append('instanceId', params.instanceId);
      if (params.hours) query.append('hours', params.hours.toString());
      
      const response = await fetch(`/api/service-history/stats?${query}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error || '获取统计数据失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
};

// 获取仪表板历史摘要的Hook
export const useDashboardHistory = (hours: number = 24) => {
  const [summary, setSummary] = useState<DashboardHistorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/service-history/dashboard?hours=${hours}`);
      const data = await response.json();
      
      if (data.success) {
        setSummary(data.data);
      } else {
        setError(data.error || '获取仪表板摘要失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    error,
    refetch: fetchSummary
  };
};

// 获取历史数据趋势的Hook（用于图表）
export const useHistoryTrend = (endpointId: number, instanceId: string, hours: number = 24) => {
  const [trendData, setTrendData] = useState<HistoryTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrend = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/service-history/trend?endpointId=${endpointId}&instanceId=${instanceId}&hours=${hours}`);
      const data = await response.json();
      
      if (data.success) {
        // 转换数据格式以适配图表
        const trendPoints: HistoryTrendPoint[] = (data.data || []).map((item: ServiceHistory) => ({
          timestamp: item.recordTime,
          tcpIn: item.avgTcpIn,
          tcpOut: item.avgTcpOut,
          udpIn: item.avgUdpIn,
          udpOut: item.avgUdpOut,
          ping: item.avgPing,
          pool: item.avgPool,
          totalTraffic: item.avgTcpIn + item.avgTcpOut + item.avgUdpIn + item.avgUdpOut
        }));
        setTrendData(trendPoints);
      } else {
        setError(data.error || '获取趋势数据失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [endpointId, instanceId, hours]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  return {
    trendData,
    loading,
    error,
    refetch: fetchTrend
  };
};

// 获取Worker统计信息的Hook
export const useHistoryWorkerStats = (refreshInterval: number = 30000) => {
  const [workerStats, setWorkerStats] = useState<HistoryWorkerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkerStats = useCallback(async () => {
    try {
      setError(null);
      
      const response = await fetch('/api/sse/stats');
      const data = await response.json();
      
      if (data.success && data.data.history) {
        setWorkerStats(data.data.history);
      } else {
        setError(data.error || '获取Worker统计失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkerStats();
    
    // 定期刷新Worker统计
    const interval = setInterval(fetchWorkerStats, refreshInterval);
    
    return () => clearInterval(interval);
  }, [fetchWorkerStats, refreshInterval]);

  return {
    workerStats,
    loading,
    error,
    refetch: fetchWorkerStats
  };
};

// 历史数据实时更新Hook
export const useHistoryRealtime = (
  endpointId: number, 
  instanceId: string, 
  updateInterval: number = 60000,
  maxDataPoints: number = 100
) => {
  const [realtimeData, setRealtimeData] = useState<HistoryTrendPoint[]>([]);
  const [isActive, setIsActive] = useState(false);

  const startRealtime = useCallback(() => {
    setIsActive(true);
  }, []);

  const stopRealtime = useCallback(() => {
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (!isActive) return;

    const fetchLatestData = async () => {
      try {
        const response = await fetch(`/api/service-history/recent?endpointId=${endpointId}&instanceId=${instanceId}&limit=1`);
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
          const latest = data.data[0];
          const newPoint: HistoryTrendPoint = {
            timestamp: latest.recordTime,
            tcpIn: latest.avgTcpIn,
            tcpOut: latest.avgTcpOut,
            udpIn: latest.avgUdpIn,
            udpOut: latest.avgUdpOut,
            ping: latest.avgPing,
            pool: latest.avgPool,
            totalTraffic: latest.avgTcpIn + latest.avgTcpOut + latest.avgUdpIn + latest.avgUdpOut
          };
          
          setRealtimeData(prev => {
            const updated = [newPoint, ...prev];
            return updated.slice(0, maxDataPoints);
          });
        }
      } catch (error) {
        console.error('获取实时历史数据失败:', error);
      }
    };

    const interval = setInterval(fetchLatestData, updateInterval);
    
    return () => clearInterval(interval);
  }, [isActive, endpointId, instanceId, updateInterval, maxDataPoints]);

  return {
    realtimeData,
    isActive,
    startRealtime,
    stopRealtime
  };
};
