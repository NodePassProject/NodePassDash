/**
 * SSE 配置管理
 * 支持集成模式（单端口）和分离模式（双端口）
 */

export interface SSEConfig {
  /** 是否使用集成模式（SSE服务集成到Next.js中） */
  integrated: boolean;
  /** 前端端口 */
  frontendPort: number;
  /** 后端端口（仅分离模式使用） */
  backendPort: number;
  /** SSE 基础URL */
  sseBaseUrl: string;
}

// 从环境变量或默认配置获取SSE配置
export const getSSEConfig = (): SSEConfig => {
  const isIntegrated = process.env.SSE_INTEGRATED !== 'false'; // 默认使用集成模式
  const frontendPort = parseInt(process.env.PORT || '3000');
  const backendPort = parseInt(process.env.SSE_BACKEND_PORT || '3001');
  
  return {
    integrated: isIntegrated,
    frontendPort,
    backendPort,
    sseBaseUrl: isIntegrated 
      ? `http://localhost:${frontendPort}` 
      : `http://localhost:${backendPort}`
  };
};

// 客户端使用的SSE配置
export const getClientSSEConfig = () => {
  // 在客户端，我们总是使用当前域名
  const isClient = typeof window !== 'undefined';
  
  if (isClient) {
    return {
      sseBaseUrl: window.location.origin
    };
  }
  
  // 服务端渲染时的配置
  return getSSEConfig();
};

// SSE 端点路径
export const SSE_ENDPOINTS = {
  tunnel: (instanceId: string) => `/api/sse/tunnel/${instanceId}`,
  internal: '/api/sse/internal'
} as const;

// 完整的 SSE URL 构建器
export const buildSSEUrl = (endpoint: string, config?: SSEConfig): string => {
  const sseConfig = config || getSSEConfig();
  return `${sseConfig.sseBaseUrl}${endpoint}`;
};

// 用于前端组件的 SSE URL 构建器
export const buildClientSSEUrl = (endpoint: string): string => {
  const config = getClientSSEConfig();
  return `${config.sseBaseUrl}${endpoint}`;
}; 