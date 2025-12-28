import { useState, useEffect, useRef, useCallback } from "react";

import { buildApiUrl, buildWsUrl, getAuthToken } from "@/lib/utils";

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
  options: TunnelMonitorWSHookOptions = {},
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
      return;
    }

    if (websocketRef.current) {
      disconnect();
    }

    setIsConnecting(true);
    setError(null);

    try {
      const token = getAuthToken();
      const url = new URL(
        buildApiUrl(`/api/ws/tunnel-monitor?instanceId=${instanceId}`),
        window.location.origin,
      );
      if (token) url.searchParams.set("token", token);

      const wsUrl = buildWsUrl(url.toString());

      const websocket = new WebSocket(wsUrl);

      websocketRef.current = websocket;

      websocket.onopen = () => {
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

          // 检查是否为新的隧道监控数据格式（instanceId + info 对象）
          if (data.instanceId && data.info && data.timestamp) {
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
              status: data.status || info.status || "unknown",
              type: info.type || "unknown",
            };

            setLatestData(monitorData);

            if (onData) {
              onData(monitorData);
            }
          } else if (data.type === "tunnel_monitor" && data.data) {
            // 旧的包装格式: {type: 'tunnel_monitor', data: {...}}
            const monitorData = data.data as TunnelMonitorData;

            setLatestData(monitorData);

            if (onData) {
              onData(monitorData);
            }
          } else if (data.type === "error") {
            setError(data.message || "服务器错误");

            if (onError) {
              onError(data.message || "服务器错误");
            }
          }
        } catch (err) {
          // Silently ignore parsing errors
        }
      };

      websocket.onerror = (event) => {
        setIsConnected(false);
        setIsConnecting(false);

        const errorMessage = "连接失败";

        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }
      };

      websocket.onclose = (event) => {
        setIsConnected(false);
        setIsConnecting(false);

        if (!event.wasClean) {
          const errorMessage = "连接意外关闭";

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
      setIsConnecting(false);
      setError("创建连接失败");

      if (onError) {
        onError("创建连接失败");
      }
    }
  }, [instanceId, onConnected, onData, onError, onDisconnected, disconnect]);

  const reconnect = useCallback(() => {
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
