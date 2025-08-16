/**
 * 服务历史监控数据类型定义
 * 对应后端的ServiceHistory模型
 */

// 服务历史记录接口
export interface ServiceHistory {
  id: number;
  endpointId: number;
  instanceId: string;
  
  // 聚合后的网络流量平均值
  avgTcpIn: number;   // 平均TCP入站
  avgTcpOut: number;  // 平均TCP出站
  avgUdpIn: number;   // 平均UDP入站
  avgUdpOut: number;  // 平均UDP出站
  avgPing: number;    // 平均延迟
  avgPool: number;    // 平均连接池
  
  // 统计信息
  recordCount: number;  // 参与聚合的数据点数量
  upCount: number;      // 在线次数
  recordTime: string;   // 记录时间
  createdAt: string;    // 创建时间
  
  // 关联数据（可选）
  endpoint?: {
    id: number;
    name: string;
    url: string;
    status: string;
  };
}

// 历史数据统计摘要接口
export interface HistoryStatsSummary {
  totalRecords: number;
  avgTcpIn: number;
  avgTcpOut: number;
  avgUdpIn: number;
  avgUdpOut: number;
  avgPing: number;
  avgPool: number;
  maxPing: number;
  minPing: number;
  uniqueInstances: number;
  queryTimeRange: number; // 查询时间范围（小时）
  queryStartTime: string;
}

// 仪表板历史数据摘要接口
export interface DashboardHistorySummary {
  overview: {
    totalRecords: number;
    uniqueEndpoints: number;
    uniqueInstances: number;
    avgTrafficIn: number;
    avgTrafficOut: number;
    avgPing: number;
  };
  endpointStats: Array<{
    endpointId: number;
    recordCount: number;
    instanceCount: number;
    avgTrafficIn: number;
    avgTrafficOut: number;
    avgPing: number;
  }>;
  queryTimeRange: number;
  queryStartTime: string;
}

// 历史数据查询参数接口
export interface HistoryQueryParams {
  endpointId?: number;    // 端点ID（可选）
  instanceId?: string;    // 实例ID（可选）
  hours?: number;         // 查询小时数（默认24）
  startTime?: string;     // 开始时间（可选）
  endTime?: string;       // 结束时间（可选）
  limit?: number;         // 记录数限制（可选）
}

// 历史数据趋势点接口（用于图表显示）
export interface HistoryTrendPoint {
  timestamp: string;      // 时间戳
  tcpIn: number;         // TCP入站流量
  tcpOut: number;        // TCP出站流量
  udpIn: number;         // UDP入站流量
  udpOut: number;        // UDP出站流量
  ping: number;          // 延迟
  pool: number;          // 连接池
  totalTraffic: number;  // 总流量
}

// 历史数据图表配置接口
export interface HistoryChartConfig {
  type: 'line' | 'area' | 'bar';
  metrics: Array<'tcpIn' | 'tcpOut' | 'udpIn' | 'udpOut' | 'ping' | 'pool' | 'totalTraffic'>;
  timeRange: number;     // 时间范围（小时）
  refreshInterval: number; // 刷新间隔（毫秒）
  showLegend: boolean;
  showGrid: boolean;
  height: number;
}

// Worker统计信息接口（用于显示Worker状态）
export interface HistoryWorkerStats {
  activeInstances: number;      // 活跃实例数
  totalDataPoints: number;      // 总数据点数
  batchQueueSize: number;       // 批量队列大小
  accumulationThreshold: number; // 累积阈值
}

// API响应包装接口
export interface HistoryApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 历史数据过滤器接口
export interface HistoryFilter {
  endpointIds?: number[];
  instanceIds?: string[];
  timeRange: {
    start: Date;
    end: Date;
  };
  metrics?: {
    minPing?: number;
    maxPing?: number;
    minTraffic?: number;
    maxTraffic?: number;
  };
}

// 历史数据导出接口
export interface HistoryExportConfig {
  format: 'json' | 'csv' | 'excel';
  timeRange: {
    start: string;
    end: string;
  };
  includeMetrics: Array<'tcpIn' | 'tcpOut' | 'udpIn' | 'udpOut' | 'ping' | 'pool'>;
  groupBy?: 'endpoint' | 'instance' | 'time';
}

// 实时更新配置接口
export interface HistoryRealtimeConfig {
  enabled: boolean;
  updateInterval: number; // 更新间隔（毫秒）
  maxDataPoints: number;  // 最大数据点数
  autoScroll: boolean;    // 自动滚动
}
