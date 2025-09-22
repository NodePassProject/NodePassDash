import { useState, useEffect, useRef, useCallback } from 'react';
import { buildApiUrl } from '@/lib/utils';

export interface TunnelMonitorData {
  instanceId: string;
  timestamp: number;
  tcpRx: number;
  tcpTx: number;
  udpRx: number;
  udpTx: number;
  pool?: number;
  ping?: number;
  tcps?: number;
  udps?: number;
  status: string;
  type: string;
}

interface TunnelMonitorWSHookOptions {
  autoReconnect?: boolean;
  onConnected?: () => void;
  onData?: (data: TunnelMonitorData) => void;
  onError?: (error: string) => void;
  onDisconnected?: () => void;
}

export function useTunnelMonitorWS(
  instanceId: string | null,
  options: TunnelMonitorWSHookOptions = {}
) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestData, setLatestData] = useState<TunnelMonitorData | null>(null);
  
  const websocketRef = useRef<WebSocket | null>(null);
  const hasAttemptedConnectionRef = useRef(false);

  const {
    autoReconnect = false,
    onConnected,
    onData,
    onError,
    onDisconnected,
  } = options;

  const disconnect = useCallback(() => {
    console.log('[Tunnel Monitor WS] 手动断开连接');
    
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    hasAttemptedConnectionRef.current = false;

    if (onDisconnected) {
      onDisconnected();
    }
  }, [onDisconnected]);

  const connect = useCallback(() => {
    if (!instanceId) {
      console.warn('[Tunnel Monitor WS] 实例ID为空，无法连接');
      return;
    }

    if (websocketRef.current) {
      disconnect();
    }

    console.log('[Tunnel Monitor WS] 开始连接...');
    setIsConnecting(true);
    setError(null);

    try {
      // 构建WebSocket URL，直接传递实例ID
      const wsUrl = buildApiUrl(`/api/ws/tunnel-monitor?instanceId=${instanceId}`).replace('http', 'ws');
      
      console.log('[Tunnel Monitor WS] 连接到:', wsUrl);

      const websocket = new WebSocket(wsUrl);
      websocketRef.current = websocket;

      websocket.onopen = () => {
        console.log('[Tunnel Monitor WS] WebSocket连接已建立');
        console.log('[Tunnel Monitor WS] WebSocket状态:', websocket.readyState);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        
        if (onConnected) {
          onConnected();
        }
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Tunnel Monitor WS] 收到原始数据:', data);

          console.log('[Tunnel Monitor WS] 数据格式检查:', {
            hasInstanceId: !!data.instanceId,
            hasInfo: !!data.info,
            hasTimestamp: !!data.timestamp,
            instanceId: data.instanceId,
            dataKeys: Object.keys(data)
          });

          // 检查是否为新的隧道监控数据格式（instanceId + info 对象）
          if (data.instanceId && data.info && data.timestamp) {
            console.log('[Tunnel Monitor WS] 检测到新的隧道监控数据格式（info对象）');
            
            const info = data.info;
            
            // 构建标准化的隧道监控数据
            const monitorData: TunnelMonitorData = {
              instanceId: data.instanceId,
              timestamp: data.timestamp,
              tcpRx: info.tcprx || 0,
              tcpTx: info.tcptx || 0,
              udpRx: info.udprx || 0,
              udpTx: info.udptx || 0,
              pool: info.pool || 0,
              ping: info.ping || 0,
              tcps: info.tcps || 0,
              udps: info.udps || 0,
              status: data.status || info.status || 'unknown',
              type: info.type || 'unknown',
            };
            
            console.log('[Tunnel Monitor WS] 解析后的隧道监控数据:', {
              instanceId: monitorData.instanceId,
              timestamp: new Date(monitorData.timestamp).toISOString(),
              tcpRx: `${monitorData.tcpRx} bytes`,
              tcpTx: `${monitorData.tcpTx} bytes`,
              udpRx: `${monitorData.udpRx} bytes`,
              udpTx: `${monitorData.udpTx} bytes`,
              ping: `${monitorData.ping}ms`,
              pool: monitorData.pool,
              connections: `TCP: ${monitorData.tcps}, UDP: ${monitorData.udps}`
            });
            
            setLatestData(monitorData);
            
            if (onData) {
              onData(monitorData);
            }
            
          } else if (data.type === 'tunnel_monitor' && data.data) {
            // 旧的包装格式: {type: 'tunnel_monitor', data: {...}}
            const monitorData = data.data as TunnelMonitorData;
            console.log('[Tunnel Monitor WS] 隧道监控数据(旧格式):', monitorData);
            setLatestData(monitorData);
            
            if (onData) {
              onData(monitorData);
            }
          } else if (data.type === 'error') {
            console.error('[Tunnel Monitor WS] 服务器错误:', data.message);
            setError(data.message || '服务器错误');
            
            if (onError) {
              onError(data.message || '服务器错误');
            }
          } else if (data.type === 'connected') {
            console.log('[Tunnel Monitor WS] 服务器连接确认:', data.message);
          } else {
            console.warn('[Tunnel Monitor WS] 未知数据格式:', data);
          }
        } catch (err) {
          console.error('[Tunnel Monitor WS] 解析消息失败:', err, 'Raw data:', event.data);
        }
      };

      websocket.onerror = (event) => {
        console.error('[Tunnel Monitor WS] 连接错误:', event);
        
        setIsConnected(false);
        setIsConnecting(false);
        
        const errorMessage = '连接失败';
        setError(errorMessage);
        
        if (onError) {
          onError(errorMessage);
        }

        console.log('[Tunnel Monitor WS] 连接失败，不进行自动重连');
      };

      websocket.onclose = (event) => {
        console.log('[Tunnel Monitor WS] 连接已关闭:', event.code, event.reason);
        setIsConnected(false);
        setIsConnecting(false);
        
        if (!event.wasClean) {
          const errorMessage = '连接意外关闭';
          setError(errorMessage);
          
          if (onError) {
            onError(errorMessage);
          }
        }

        if (onDisconnected) {
          onDisconnected();
        }
      };

    } catch (err) {
      console.error('[Tunnel Monitor WS] 创建连接失败:', err);
      setIsConnecting(false);
      setError('创建连接失败');
      
      if (onError) {
        onError('创建连接失败');
      }
    }
  }, [instanceId, onConnected, onData, onError, onDisconnected, disconnect]);

  const reconnect = useCallback(() => {
    console.log('[Tunnel Monitor WS] 手动重连');
    hasAttemptedConnectionRef.current = false;
    connect();
  }, [connect]);

  // 组件挂载时自动连接（只尝试一次）
  useEffect(() => {
    if (instanceId && !hasAttemptedConnectionRef.current) {
      hasAttemptedConnectionRef.current = true;
      connect();
    } else if (!instanceId) {
      // 如果ID为空，清理连接
      disconnect();
    }
  }, [instanceId, connect, disconnect]);

  // 组件卸载时清理 - 增强清理逻辑
  useEffect(() => {
    return () => {
      // 清理数据状态，释放内存
      setLatestData(null);
      setError(null);
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    latestData,
    connect,
    disconnect,
    reconnect,
  };
}