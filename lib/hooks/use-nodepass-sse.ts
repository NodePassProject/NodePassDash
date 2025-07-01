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

      const processEvent = (event: MessageEvent) => {
        console.log('[NodePass SSE] ========== 新消息开始 ==========');
        console.log('[NodePass SSE] 原始事件数据:', event.data);
        console.log('[NodePass SSE] 数据类型:', typeof event.data);
        
        try {
          // 首先尝试解析为JSON
          const data = JSON.parse(event.data);
          console.log('[NodePass SSE] JSON解析成功:', data);
          console.log('[NodePass SSE] 消息类型:', data.type);
          
          if (options.onMessage) {
            console.log('[NodePass SSE] 调用onMessage回调，传递数据:', data);
            options.onMessage(data);
            console.log('[NodePass SSE] onMessage回调调用完成');
          } else {
            console.warn('[NodePass SSE] onMessage回调不存在');
          }

          // 检查是否为连接确认消息
          if (data.type === 'connected') {
            console.log('[NodePass SSE] 收到连接确认消息');
            return;
          }

          // 检查是否为错误消息
          if (data.type === 'error') {
            console.error('[NodePass SSE] 收到错误消息:', data.message);
            setError(data.message);
            return;
          }
          
          console.log('[NodePass SSE] 处理普通JSON消息:', data);
                          } catch (parseError) {
          // 如果不是JSON，当作纯文本日志处理
          console.log('[NodePass SSE] JSON解析失败，作为文本处理:', parseError instanceof Error ? parseError.message : String(parseError));
          console.log('[NodePass SSE] 文本消息内容:', event.data);
          
          if (options.onMessage) {
            console.log('[NodePass SSE] 调用onMessage回调处理文本消息');
            options.onMessage({
              type: 'log',
              message: event.data
            });
            console.log('[NodePass SSE] 文本消息处理完成');
          } else {
            console.warn('[NodePass SSE] onMessage回调不存在，无法处理文本消息');
          }
        }
        
        console.log('[NodePass SSE] ========== 消息处理结束 ==========');
      };

      eventSource.onmessage = processEvent;

      // 注册统一事件处理器，兼容自定义事件类型（例如 instance、tunnel 等）
      const handleEvent = (event: MessageEvent) => {
        console.log('[NodePass SSE] ==== 自定义事件 ====', event.type);
        processEvent(event);
      };

      // 监听常见的自定义事件类型
      const customEventTypes = ['instance', 'tunnel', 'stats', 'log', 'update'];
      customEventTypes.forEach((evt) => {
        eventSource.addEventListener(evt, handleEvent as EventListener);
      });

      // 错误事件处理
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