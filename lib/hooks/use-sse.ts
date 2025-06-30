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

// NodePass主控SSE监听 - 直接连接到NodePass主控的SSE接口
export function useNodePassSSE(endpointDetail: { url: string; apiPath: string; apiKey: string } | null, options: SSEOptions = {}) {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!endpointDetail) {
      return;
    }

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
        if (options.onConnected) {
          options.onConnected();
        }

        // 创建Reader读取流数据
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
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
              if (line.startsWith('data: ')) {
                const data = line.slice(6); // 移除 "data: " 前缀
                
                if (data.trim() === '') {
                  continue; // 跳过空数据行
                }

                try {
                  // 尝试解析JSON数据
                  const parsedData = JSON.parse(data);
                  console.log('[NodePass SSE] 收到JSON消息:', parsedData);
                  
                  if (options.onMessage) {
                    options.onMessage(parsedData);
                  }
                } catch (parseError) {
                  // 如果不是JSON，当作纯文本日志处理
                  console.log('[NodePass SSE] 收到文本消息:', data);
                  
                  if (options.onMessage) {
                    options.onMessage({
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
        
        console.error('[NodePass SSE] 连接错误:', error);
        if (options.onError) {
          options.onError(error);
        }
      }
    };

    connectToSSE();

    return () => {
      console.log('[NodePass SSE] 清理连接');
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [endpointDetail?.url, endpointDetail?.apiPath, endpointDetail?.apiKey]);

  return null; // 不返回EventSource，因为我们使用的是fetch
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