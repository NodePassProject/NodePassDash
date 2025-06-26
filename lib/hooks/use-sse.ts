import { useEffect, useRef } from 'react';
import { buildApiUrl } from '@/lib/utils';

interface SSEOptions {
  onMessage?: (event: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
}

// 全局事件订阅 - 用于监听所有系统事件（包括隧道更新、仪表盘更新等）
export function useGlobalSSE(options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = buildApiUrl('/api/sse/global');


    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 检查连接成功消息
        if (data.type === 'connected') {
          if (options.onConnected) {
            options.onConnected();
          }
          return;
        }
        
        if (options.onMessage) {
          options.onMessage(data);
        }
      } catch (error) {
        console.error('[前端SSE] ❌ 解析全局SSE数据失败', error, '原始数据:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error(`[前端SSE] SSE连接错误`, error);
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return eventSourceRef.current;
}

// 隧道事件订阅 - 用于监听特定隧道的事件
export function useTunnelSSE(instanceId: string, options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!instanceId) {
      return;
    }

    // const url = `http://localhost:3000/api/sse/tunnel/${instanceId}`;
    const url = buildApiUrl(`/api/sse/tunnel/${instanceId}`);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 检查连接成功消息
        if (data.type === 'connected') {
          if (options.onConnected) {
            options.onConnected();
          }
          return;
        }
        
        if (options.onMessage) {
          options.onMessage(data);
        }
      } catch (error) {
        console.error('[前端SSE] ❌ 解析隧道SSE数据失败', error, '原始数据:', event.data);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error(`[前端SSE] 隧道SSE连接错误`, error);
      if (options.onError) {
        options.onError(error);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [instanceId]);

  return eventSourceRef.current;
}

// 用于连接 Go 后端的 SSE
export function useSSE(endpoint: string, options: SSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 构建 SSE URL
    const url = buildApiUrl(`/api/sse${endpoint}`);

    // 创建 EventSource 实例
    const eventSource = new EventSource(url);

    // 保存引用
    eventSourceRef.current = eventSource;

    // 连接成功回调
    eventSource.onopen = () => {
      options.onConnected?.();
    };

    // 消息处理
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        options.onMessage?.(data);
      } catch (error) {
        console.error('[SSE] 解析消息失败:', error);
      }
    };

    // 错误处理
    eventSource.onerror = (error) => {
      console.error('[SSE] 连接错误:', error);
      options.onError?.(error);
    };

    // 清理函数
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [endpoint, options]);

  return eventSourceRef.current;
} 