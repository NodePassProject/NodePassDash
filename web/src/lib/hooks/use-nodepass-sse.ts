import { useEffect, useRef, useState, useCallback } from 'react';
import { buildApiUrl } from '@/lib/utils';

interface NodePassSSEOptions {
  onMessage?: (data: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  autoReconnect?: boolean; // 是否自动重连，默认false
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventListenersRef = useRef<Map<string, (event: MessageEvent) => void>>(new Map());

  // 使用useCallback确保回调函数引用稳定
  const onMessage = useCallback(options.onMessage || (() => {}), [options.onMessage]);
  const onError = useCallback(options.onError || (() => {}), [options.onError]);
  const onConnected = useCallback(options.onConnected || (() => {}), [options.onConnected]);
  const onDisconnected = useCallback(options.onDisconnected || (() => {}), [options.onDisconnected]);

  const cleanup = useCallback(() => {
    // 清理事件监听器
    if (eventSourceRef.current && eventListenersRef.current.size > 0) {
      eventListenersRef.current.forEach((listener, eventType) => {
        eventSourceRef.current?.removeEventListener(eventType, listener);
      });
      eventListenersRef.current.clear();
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const connect = useCallback((endpoint: NodePassEndpoint) => {
    // 如果已经在连接中，避免重复连接
    if (isConnecting || eventSourceRef.current) {
      console.log('[NodePass SSE] 连接已存在，跳过重复连接');
      return;
    }

    // 检查endpoint参数是否有效
    if (!endpoint || !endpoint.url || !endpoint.apiPath || !endpoint.apiKey) {
      console.error('[NodePass SSE] endpoint参数无效:', endpoint);
      setError('endpoint配置无效');
      return;
    }

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

      // 修复URL构建逻辑 - 避免重复的/api路径
      let fullUrl;
      if (process.env.NODE_ENV === 'development') {
        // 在开发环境下，buildApiUrl已经返回了正确的路径，不需要再添加apiBase
        fullUrl = proxyUrl;
      } else {
        // 生产环境下确保URL是完整的
        fullUrl = proxyUrl.startsWith('http') ? proxyUrl : `${window.location.origin}${proxyUrl}`;
      }
      console.log('[NodePass SSE] 完整URL:', fullUrl);

      const eventSource = new EventSource(fullUrl);

      // 存储EventSource引用以便清理
      eventSourceRef.current = eventSource;
      abortControllerRef.current = { abort: () => eventSource.close() } as AbortController;

      eventSource.onopen = () => {
        console.log('[NodePass SSE] 代理连接已建立');
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);

        // 触发连接成功回调
        onConnected();
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

          console.log('[NodePass SSE] 调用onMessage回调，传递数据:', data);
          onMessage(data);
          console.log('[NodePass SSE] onMessage回调调用完成');

          // 检查是否为连接确认消息
          if (data.type === 'connected') {
            console.log('[NodePass SSE] 收到连接确认消息');
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);
            return;
          }

          // 检查是否为错误消息
          if (data.type === 'error') {
            console.error('[NodePass SSE] 收到错误消息:', data.message);
            setError(data.message);
            setIsConnected(false);
            setIsConnecting(false);
            return;
          }

        } catch (parseError) {
          // 如果不是JSON，当作纯文本日志处理
          console.log('[NodePass SSE] JSON解析失败，作为文本处理:', parseError instanceof Error ? parseError.message : String(parseError));
          console.log('[NodePass SSE] 文本消息内容:', event.data);

          console.log('[NodePass SSE] 调用onMessage回调处理文本消息');
          onMessage({
            type: 'log',
            message: event.data
          });
          console.log('[NodePass SSE] 文本消息处理完成');
        }

        console.log('[NodePass SSE] ========== 消息处理结束 ==========');
      };

      eventSource.onmessage = processEvent;

      // 注册统一事件处理器，兼容自定义事件类型（例如 instance、tunnel 等）
      const handleEvent = (event: MessageEvent) => {
        console.log('[NodePass SSE] ==== 自定义事件 ====', event.type);
        console.log('[NodePass SSE] 自定义事件数据:', event.data);
        processEvent(event);
      };

      // 监听常见的自定义事件类型
      const customEventTypes = ['instance', 'tunnel', 'stats', 'log', 'update'];
      customEventTypes.forEach((evt) => {
        console.log('[NodePass SSE] 注册自定义事件监听器:', evt);
        eventSource.addEventListener(evt, handleEvent as EventListener);
        eventListenersRef.current.set(evt, handleEvent);
      });

      // 错误事件处理
      eventSource.onerror = (error) => {
        console.error('[NodePass SSE] 连接错误:', error);
        setIsConnecting(false);
        setIsConnected(false);
        setError('连接失败');

        // 手动模式，直接关闭连接
        console.log('[NodePass SSE] 手动模式，关闭连接');
        cleanup();

        onError(error);
        onDisconnected();
      };

    } catch (error) {
      console.error('[NodePass SSE] 创建连接失败:', error);
      setIsConnecting(false);
      setIsConnected(false);

      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(errorMessage);

      onError(error);
    }
  }, [cleanup, onMessage, onError, onConnected, onDisconnected, options.autoReconnect, isConnecting]);

  // 手动连接功能
  const connectManually = useCallback(() => {
    if (endpoint && !isConnecting) {
      console.log('[NodePass SSE] 手动连接');
      connect(endpoint);
    }
  }, [endpoint, isConnecting, connect]);

  // 手动断开功能
  const disconnect = useCallback(() => {
    console.log('[NodePass SSE] 手动断开连接');
    cleanup();
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
  }, [cleanup]);

  // 手动重连功能
  const reconnect = useCallback(() => {
    if (endpoint && !isConnecting) {
      console.log('[NodePass SSE] 手动重连');
      cleanup(); // 确保清理之前的连接
      setError(null);
      connect(endpoint);
    }
  }, [endpoint, isConnecting, cleanup, connect]);

  // 组件卸载时清理连接
  useEffect(() => {
    return () => {
      console.log('[NodePass SSE] 组件卸载，清理连接');
      cleanup();
      setIsConnected(false);
    };
  }, [cleanup]);

  return {
    isConnected,
    isConnecting,
    error,
    connect: connectManually,
    disconnect,
    reconnect
  };
} 