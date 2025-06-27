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
  MODE0: 'mode0',
  MODE1: 'mode1',
  MODE2: 'mode2'
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

// 接口定义
export interface Endpoint {
  id: string;
  url: string;
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
  id: string;
  name: string;
  endpointId: string;
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
  
  // 网络流量统计字段
  tcpRx?: bigint;
  tcpTx?: bigint;
  udpRx?: bigint;
  udpTx?: bigint;
  
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
  logs?: string;
  createdAt: Date;
  endpoint?: Endpoint;
} 