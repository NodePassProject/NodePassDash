// 端点状态枚举
export const EndpointStatus = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  FAIL: 'FAIL',
  DISCONNECT: 'DISCONNECT'
} as const;

export type EndpointStatusType = typeof EndpointStatus[keyof typeof EndpointStatus];

// SSE 事件类型枚举
export const SSEEventType = {
  INITIAL: 'INITIAL',    // 连接建立时发送，包含所有实例的当前状态
  CREATE: 'CREATE',      // 创建新实例时发送
  UPDATE: 'UPDATE',      // 实例更新时发送（状态变更、启动/停止操作）
  DELETE: 'DELETE',      // 实例被删除时发送
  SHUTDOWN: 'SHUTDOWN',  // 主控服务即将关闭时发送
  LOG: 'LOG'            // 实例产生新日志内容时发送
} as const;

export type SSEEventTypeKey = keyof typeof SSEEventType;
export type SSEEventTypeValue = typeof SSEEventType[SSEEventTypeKey];

// 隧道实例状态枚举
export const TunnelStatus = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  ERROR: 'error'
} as const;

export type TunnelStatusType = typeof TunnelStatus[keyof typeof TunnelStatus];

// 隧道模式枚举
export const TunnelMode = {
  SERVER: 'server',
  CLIENT: 'client'
} as const;

export type TunnelModeType = typeof TunnelMode[keyof typeof TunnelMode];

// TLS 模式枚举
export const TLSMode = {
  0: '0',
  1: '1',
  2: '2'
} as const;

export type TLSModeType = typeof TLSMode[keyof typeof TLSMode];

// 日志级别枚举
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
  EVENT: 'event'
} as const;

export type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

// 隧道类型枚举
export const TunnelType = {
  SINGLE: 'single',      // 单端
  DOUBLE: 'double',      // 双端
  PENETRATE: 'penetrate', // 穿透
  CUSTOM: 'custom'       // 自定义
} as const;

export type TunnelTypeKey = keyof typeof TunnelType;
export type TunnelTypeValue = typeof TunnelType[TunnelTypeKey];

// 分组接口定义
export interface TunnelGroup {
  id: string;
  name: string;
  description?: string;
  type: TunnelTypeValue; // 分组类型：single、double、intranet、custom
  color?: string;
  tunnelIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 场景接口定义
export interface TunnelScene {
  id: string;
  name: string;
  description?: string;
  groups: TunnelGroup[];
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 隧道连接关系接口（用于可视化双端/穿透显示）
export interface TunnelConnection {
  id: string;
  sourceId: string;  // 入口端隧道ID
  targetId: string;  // 出口端隧道ID
  type: TunnelTypeValue;
  description?: string;
}

// 接口定义
export interface Endpoint {
  id: string;
  url: string;
  ip: string;
  apiPath: string;
  apiKey: string;
  status: EndpointStatusType;
  lastCheck: Date;
  createdAt: Date;
  updatedAt: Date;
  tunnelCount: number;
  tunnels?: Tunnel[];
  sseData?: EndpointSSE[];
}

export interface Tunnel {
  id: number;
  name: string;
  endpointId: string;
  endpointName?: string; // 主控名称
  mode: TunnelModeType;
  status: TunnelStatusType;
  tunnelAddress: string;
  tunnelPort: string;
  targetAddress: string;
  targetPort: string;
  tlsMode: TLSModeType;
  certPath?: string;
  keyPath?: string;
  logLevel: LogLevelType;
  commandLine: string;
  password?: string;
  instanceId?: string;
  
  // 网络流量统计字段 - 改为number类型减少内存占用
  tcpRx?: number;
  tcpTx?: number;
  udpRx?: number;
  udpTx?: number;
  pool?: number | null;
  ping?: number | null;
  
  createdAt: Date;
  updatedAt: Date;
  endpoint?: Endpoint;
}

// SSE 连接状态接口
export interface SSEConnection {
  url: string;
  apiPath: string;
  apiKey: string;
  controller: AbortController | null;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  reconnectTimeout: NodeJS.Timeout | null;
  lastEventTime: number;
  isHealthy: boolean;
  manuallyDisconnected: boolean;
}

// SSE 推送数据接口（原 ResponseSSE）
export interface EndpointSSE {
  id: string;
  eventType: SSEEventTypeValue;
  pushType: string;
  eventTime: Date;
  endpointId: string;
  instanceId: string;
  instanceType?: string;
  status?: string;
  url?: string;
  tcpRx?: bigint;
  tcpTx?: bigint;
  udpRx?: bigint;
  udpTx?: bigint;
  pool?: bigint | null;
  ping?: bigint | null;
  logs?: string;
  createdAt: Date;
  endpoint?: Endpoint;
} 