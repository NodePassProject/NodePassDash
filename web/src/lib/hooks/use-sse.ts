import { useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/lib/utils';

interface SSEOptions {
  onMessage?: (event: any) => void;
  onError?: (error: any) => void;
  onConnected?: () => void;
  enabled?: boolean; // 添加enabled参数控制是否连接
}



// 隧道事件订阅 - 用于监听特定隧道的事件
export function useTunnelSSE(instanceId: string, options: SSEOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const isMountedRef = useRef(true);

  // 使用 useCallback 包装回调函数
  const onMessage = useCallback(options.onMessage || (() => {}), [options.onMessage]);
  const onError = useCallback(options.onError || (() => {}), [options.onError]);
  const onConnected = useCallback(options.onConnected || (() => {}), [options.onConnected]);

  useEffect(() => {
    // 如果没有instanceId或者enabled为false，则不连接
    if (!instanceId || options.enabled === false) {
      // 如果已有连接，先关闭
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    isMountedRef.current = true;
    const url = buildApiUrl(`/api/sse/tunnel/${instanceId}`);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      if (!isMountedRef.current) return;
      
      try {
        const data = JSON.parse(event.data);
        
        // 检查连接成功消息
        if (data.type === 'connected') {
          onConnected();
          return;
        }
        
        onMessage(data);
      } catch (error) {
        if (isMountedRef.current) {
          console.error('[前端SSE] ❌ 解析隧道SSE数据失败', error, '原始数据:', event.data);
        }
      }
    };
    
    eventSource.onerror = (error) => {
      if (isMountedRef.current) {
        console.error(`[前端SSE] 隧道SSE连接错误`, error);
        onError(error);
      }
    };

    return () => {
      isMountedRef.current = false;

      // 强制清理EventSource连接
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (error) {
          console.debug('[前端SSE] 关闭隧道SSE失败', error);
        } finally {
          eventSourceRef.current = null;
        }
      }
    };
  }, [instanceId, onMessage, onError, onConnected, options.enabled]);

  return eventSourceRef.current;
}

// NodePass主控SSE监听 - 直接连接到NodePass主控的SSE接口
export function useNodePassSSE(endpointDetail: { url: string; apiPath: string; apiKey: string } | null, options: SSEOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // 使用 useCallback 包装回调函数
  const onMessage = useCallback(options.onMessage || (() => {}), [options.onMessage]);
  const onError = useCallback(options.onError || (() => {}), [options.onError]);
  const onConnected = useCallback(options.onConnected || (() => {}), [options.onConnected]);

  useEffect(() => {
    if (!endpointDetail) {
      return;
    }

    isMountedRef.current = true;

    // 构建NodePass SSE URL: {URL}{APIPath}/events
    const sseUrl = `${endpointDetail.url}${endpointDetail.apiPath}/events`;
    console.log('[NodePass SSE] 直接连接到:', sseUrl);

    const connectToSSE = async () => {
      try {
        // 创建AbortController用于取消请求
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // 使用fetch连接SSE，支持自定义Headers
        const response = await fetch(sseUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-API-Key': endpointDetail.apiKey
          },
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        console.log('[NodePass SSE] 连接成功，开始读取流');
        
        // 触发连接成功回调
        if (isMountedRef.current) {
          onConnected();
        }

        // 创建Reader读取流数据
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            if (!isMountedRef.current) break;
            
            const { done, value } = await reader.read();
            
            if (done) {
              console.log('[NodePass SSE] 流结束');
              break;
            }

            // 解码数据并添加到缓冲区
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // 处理完整的SSE消息
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一个可能不完整的行

            for (const line of lines) {
              if (!isMountedRef.current) break;
              
              if (line.startsWith('data: ')) {
                const data = line.slice(6); // 移除 "data: " 前缀
                
                if (data.trim() === '') {
                  continue; // 跳过空数据行
                }

                try {
                  // 尝试解析JSON数据
                  const parsedData = JSON.parse(data);
                  console.log('[NodePass SSE] 收到JSON消息:', parsedData);
                  
                  if (isMountedRef.current) {
                    onMessage(parsedData);
                  }
                } catch (parseError) {
                  // 如果不是JSON，当作纯文本日志处理
                  console.log('[NodePass SSE] 收到文本消息:', data);
                  
                  if (isMountedRef.current) {
                    onMessage({
                      type: 'log',
                      message: data
                    });
                  }
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('[NodePass SSE] 连接被主动取消');
          return;
        }
        
        if (isMountedRef.current) {
          console.error('[NodePass SSE] 连接错误:', error);
          onError(error);
        }
      }
    };

    connectToSSE();

    return () => {
      console.log('[NodePass SSE] 清理连接');
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [endpointDetail?.url, endpointDetail?.apiPath, endpointDetail?.apiKey, onMessage, onError, onConnected]);

  return null; // 不返回EventSource，因为我们使用的是fetch
}

// 用于连接 Go 后端的 SSE
export function useSSE(endpoint: string, options: SSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const isMountedRef = useRef(true);

  // 使用 useCallback 包装回调函数
  const onMessage = useCallback(options.onMessage || (() => {}), [options.onMessage]);
  const onError = useCallback(options.onError || (() => {}), [options.onError]);
  const onConnected = useCallback(options.onConnected || (() => {}), [options.onConnected]);

  useEffect(() => {
    isMountedRef.current = true;
    
    // 构建 SSE URL
    const url = buildApiUrl(`/api/sse${endpoint}`);

    // 创建 EventSource 实例
    const eventSource = new EventSource(url);

    // 保存引用
    eventSourceRef.current = eventSource;

    // 连接成功回调
    eventSource.onopen = () => {
      if (isMountedRef.current) {
        onConnected();
      }
    };

    // 消息处理
    eventSource.onmessage = (event) => {
      if (!isMountedRef.current) return;
      
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        if (isMountedRef.current) {
          console.error('[SSE] 解析消息失败:', error);
        }
      }
    };

    // 错误处理
    eventSource.onerror = (error) => {
      if (isMountedRef.current) {
        console.error('[SSE] 连接错误:', error);
        onError(error);
      }
    };

    // 清理函数 - 增强清理逻辑
    return () => {
      isMountedRef.current = false;

      // 强制清理EventSource连接
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (error) {
          console.debug('[SSE] 关闭EventSource失败', error);
        } finally {
          eventSourceRef.current = null;
        }
      }
    };
  }, [endpoint, onMessage, onError, onConnected]);

  return eventSourceRef.current;
} 