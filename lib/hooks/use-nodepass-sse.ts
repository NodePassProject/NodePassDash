import { useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '@/lib/utils';

interface NodePassSSEOptions {
  onMessage?: (data: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

interface NodePassEndpoint {
  url: string;
  apiPath: string;
  apiKey: string;
}

export function useNodePassSSE(endpoint: NodePassEndpoint | null, options: NodePassSSEOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cleanup = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const connect = (endpoint: NodePassEndpoint) => {
    try {
      cleanup();
      setIsConnecting(true);
      setError(null);

      // 使用后端代理接口连接NodePass SSE
      const proxyUrl = buildApiUrl(`/api/sse/nodepass-proxy?endpointId=${btoa(JSON.stringify({
        url: endpoint.url,
        apiPath: endpoint.apiPath,
        apiKey: endpoint.apiKey
      }))}`);

      console.log('[NodePass SSE] 通过代理连接:', proxyUrl);

      const eventSource = new EventSource(proxyUrl);
      
      // 存储EventSource引用以便清理
      abortControllerRef.current = { abort: () => eventSource.close() } as AbortController;

      eventSource.onopen = () => {
        console.log('[NodePass SSE] 代理连接已建立');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        
        // 触发连接成功回调
        if (options.onConnected) {
          options.onConnected();
        }
      };

      eventSource.onmessage = (event) => {
        try {
          // 首先尝试解析为JSON
          const data = JSON.parse(event.data);
          
          // 检查是否为连接确认消息
          if (data.type === 'connected') {
            console.log('[NodePass SSE] 收到连接确认');
            return;
          }

          // 检查是否为错误消息
          if (data.type === 'error') {
            console.error('[NodePass SSE] 收到错误消息:', data.message);
            setError(data.message);
            return;
          }
          
          console.log('[NodePass SSE] 收到JSON消息:', data);
          if (options.onMessage) {
            options.onMessage(data);
          }
        } catch (parseError) {
          // 如果不是JSON，当作纯文本日志处理
          console.log('[NodePass SSE] 收到文本消息:', event.data);
          
          if (options.onMessage) {
            options.onMessage({
              type: 'log',
              message: event.data
            });
          }
        }
      };

      eventSource.onerror = (error) => {
        console.error('[NodePass SSE] 连接错误:', error);
        setIsConnecting(false);
        setIsConnected(false);
        setError('连接失败');
        
        if (options.onError) {
          options.onError(error);
        }
        
        if (options.onDisconnected) {
          options.onDisconnected();
        }
      };

    } catch (error) {
      console.error('[NodePass SSE] 创建连接失败:', error);
      setIsConnecting(false);
      setIsConnected(false);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);
      
      if (options.onError) {
        options.onError(error);
      }
    }
  };

  // 手动重连功能
  const reconnect = () => {
    if (endpoint && !isConnecting) {
      connect(endpoint);
    }
  };

  useEffect(() => {
    if (!endpoint) {
      cleanup();
      setIsConnected(false);
      setError(null);
      return;
    }

    connect(endpoint);

    return () => {
      cleanup();
      setIsConnected(false);
    };
  }, [endpoint?.url, endpoint?.apiPath, endpoint?.apiKey]);

  return {
    isConnected,
    isConnecting,
    error,
    reconnect
  };
} 