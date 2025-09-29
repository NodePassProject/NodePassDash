import { useState, useEffect, useRef, useCallback } from "react";

import { buildApiUrl } from "@/lib/utils";

export interface SystemMonitorData {
  endpointId: number;
  timestamp: number;
  os?: string;
  arch?: string;
  cpu?: number; // CPU使用率（百分比）
  ram?: number; // RAM使用率（百分比）
  swap?: number; // Swap使用率（百分比）
  netrx?: number; // 网络接收流量（字节）
  nettx?: number; // 网络发送流量（字节）
  diskr?: number; // 磁盘读取流量（字节）
  diskw?: number; // 磁盘写入流量（字节）
  sysup?: number; // 系统运行时间（秒）
  ver?: string; // 版本信息
  uptime?: number; // 应用运行时间
  // 新增字段，用于计算
  mem_total?: number; // 总内存（字节）
  mem_used?: number; // 已使用内存（字节）
  swap_total?: number; // 总Swap（字节）
  swap_used?: number; // 已使用Swap（字节）
}

interface SystemMonitorWSHookOptions {
  autoReconnect?: boolean;
  onConnected?: () => void;
  onData?: (data: SystemMonitorData) => void;
  onError?: (error: string) => void;
  onDisconnected?: () => void;
}

export function useSystemMonitorWS(
  endpointId: number | null,
  options: SystemMonitorWSHookOptions = {},
) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestData, setLatestData] = useState<SystemMonitorData | null>(null);

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
    console.log("[System Monitor WS] 手动断开连接");

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
    if (!endpointId) {
      console.warn("[System Monitor WS] 端点ID为空，无法连接");

      return;
    }

    if (websocketRef.current) {
      disconnect();
    }

    console.log("[System Monitor WS] 开始连接...");
    setIsConnecting(true);
    setError(null);

    try {
      // 构建WebSocket URL，直接传递端点ID
      const wsUrl = buildApiUrl(
        `/api/ws/system-monitor?endpointId=${endpointId}`,
      ).replace("http", "ws");

      console.log("[System Monitor WS] 连接到:", wsUrl);

      const websocket = new WebSocket(wsUrl);

      websocketRef.current = websocket;

      websocket.onopen = () => {
        console.log("[System Monitor WS] WebSocket连接已建立");
        console.log("[System Monitor WS] WebSocket状态:", websocket.readyState);
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

          console.log("[System Monitor WS] 收到原始数据:", data);

          // 检查是否为新的系统监控数据格式（数据在 info 对象中）
          if (data.endpointId && data.info && data.info.os && data.info.arch) {
            // 新的数据格式：系统监控数据在 info 对象中
            console.log(
              "[System Monitor WS] 检测到新的系统监控数据格式（info对象）",
            );

            const info = data.info;

            // 计算RAM使用率（百分比）
            const ramUsedBytes = info.mem_used || 0;
            const ramUsagePercent =
              info.mem_total > 0 ? (ramUsedBytes / info.mem_total) * 100 : 0;

            // 计算Swap使用率（百分比）
            const swapUsedBytes = info.swap_used || 0;
            const swapUsagePercent =
              info.swap_total > 0 ? (swapUsedBytes / info.swap_total) * 100 : 0;

            // 构建标准化的系统监控数据
            const monitorData: SystemMonitorData = {
              endpointId: data.endpointId,
              timestamp: new Date(data.timestamp).getTime(),
              os: info.os,
              arch: info.arch,
              ver: info.ver,
              uptime: info.uptime,
              sysup: info.sysup,
              // CPU使用率
              cpu: info.cpu || 0,
              // RAM使用率（百分比）
              ram: ramUsagePercent,
              // Swap使用率（百分比）
              swap: swapUsagePercent,
              // 网络流量（字节）
              netrx: info.netrx || 0,
              nettx: info.nettx || 0,
              // 磁盘I/O（字节）
              diskr: info.diskr || 0,
              diskw: info.diskw || 0,
              // 原始数据（用于计算）
              mem_total: info.mem_total,
              mem_used: info.mem_used,
              swap_total: info.swap_total,
              swap_used: info.swap_used,
            };

            console.log("[System Monitor WS] 解析后的系统监控数据:", {
              cpu: `${monitorData.cpu}%`,
              ram: `${monitorData.ram.toFixed(1)}%`,
              swap: `${monitorData.swap.toFixed(1)}%`,
              netrx: `${monitorData.netrx} bytes`,
              nettx: `${monitorData.nettx} bytes`,
              diskr: `${monitorData.diskr} bytes`,
              diskw: `${monitorData.diskw} bytes`,
              ramUsed: `${(ramUsedBytes / 1024 / 1024 / 1024).toFixed(1)}GB`,
              ramTotal: `${(info.mem_total / 1024 / 1024 / 1024).toFixed(1)}GB`,
            });

            setLatestData(monitorData);

            if (onData) {
              onData(monitorData);
            }
          } else if (
            data.os &&
            data.arch &&
            (data.cpu !== undefined || data.mem_total !== undefined)
          ) {
            // 直接数据格式（兼容旧版本）
            console.log("[System Monitor WS] 检测到直接系统监控数据格式");

            // 计算RAM使用率（百分比）
            const ramUsedBytes = data.mem_used || 0;
            const ramUsagePercent =
              data.mem_total > 0 ? (ramUsedBytes / data.mem_total) * 100 : 0;

            // 计算Swap使用率（百分比）
            const swapUsedBytes = data.swap_used || 0;
            const swapUsagePercent =
              data.swap_total > 0 ? (swapUsedBytes / data.swap_total) * 100 : 0;

            // 构建标准化的系统监控数据
            const monitorData: SystemMonitorData = {
              endpointId: endpointId || 0,
              timestamp: Date.now(),
              os: data.os,
              arch: data.arch,
              ver: data.ver,
              uptime: data.uptime,
              sysup: data.sysup,
              // CPU使用率
              cpu: data.cpu || 0,
              // RAM使用率（百分比）
              ram: ramUsagePercent,
              // Swap使用率（百分比）
              swap: swapUsagePercent,
              // 网络流量（字节）
              netrx: data.netrx || 0,
              nettx: data.nettx || 0,
              // 磁盘I/O（字节）
              diskr: data.diskr || 0,
              diskw: data.diskw || 0,
            };

            console.log("[System Monitor WS] 解析后的系统监控数据:", {
              cpu: `${monitorData.cpu}%`,
              ram: `${monitorData.ram.toFixed(1)}%`,
              swap: `${monitorData.swap.toFixed(1)}%`,
              netrx: `${monitorData.netrx} bytes`,
              nettx: `${monitorData.nettx} bytes`,
              diskr: `${monitorData.diskr} bytes`,
              diskw: `${monitorData.diskw} bytes`,
            });

            setLatestData(monitorData);

            if (onData) {
              onData(monitorData);
            }
          } else if (data.type === "system_monitor" && data.data) {
            // 旧的包装格式: {type: 'system_monitor', data: {...}}
            const monitorData = data.data as SystemMonitorData;

            console.log(
              "[System Monitor WS] 系统监控数据(旧格式):",
              monitorData,
            );
            setLatestData(monitorData);

            if (onData) {
              onData(monitorData);
            }
          } else if (data.type === "error") {
            console.error("[System Monitor WS] 服务器错误:", data.message);
            setError(data.message || "服务器错误");

            if (onError) {
              onError(data.message || "服务器错误");
            }
          } else if (data.type === "connected") {
            console.log("[System Monitor WS] 服务器连接确认:", data.message);
          } else {
            console.warn("[System Monitor WS] 未知数据格式:", data);
          }
        } catch (err) {
          console.error(
            "[System Monitor WS] 解析消息失败:",
            err,
            "Raw data:",
            event.data,
          );
        }
      };

      websocket.onerror = (event) => {
        console.error("[System Monitor WS] 连接错误:", event);

        setIsConnected(false);
        setIsConnecting(false);

        const errorMessage = "连接失败";

        setError(errorMessage);

        if (onError) {
          onError(errorMessage);
        }

        console.log("[System Monitor WS] 连接失败，不进行自动重连");
      };

      websocket.onclose = (event) => {
        console.log(
          "[System Monitor WS] 连接已关闭:",
          event.code,
          event.reason,
        );
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
      console.error("[System Monitor WS] 创建连接失败:", err);
      setIsConnecting(false);
      setError("创建连接失败");

      if (onError) {
        onError("创建连接失败");
      }
    }
  }, [endpointId, onConnected, onData, onError, onDisconnected, disconnect]);

  const reconnect = useCallback(() => {
    console.log("[System Monitor WS] 手动重连");
    hasAttemptedConnectionRef.current = false;
    connect();
  }, [connect]);

  // 组件挂载时自动连接（只尝试一次）
  useEffect(() => {
    if (endpointId && !hasAttemptedConnectionRef.current) {
      hasAttemptedConnectionRef.current = true;
      connect();
    } else if (!endpointId) {
      // 如果ID为空，清理连接
      disconnect();
    }
  }, [endpointId, connect, disconnect]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
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
