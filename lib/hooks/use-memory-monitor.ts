import { useEffect, useRef, useCallback } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface MemoryMonitorOptions {
  interval?: number; // 监控间隔（毫秒）
  threshold?: number; // 内存使用阈值（MB）
  onMemoryWarning?: (info: MemoryInfo) => void;
  onMemoryLeak?: (info: MemoryInfo, increase: number) => void;
}

export function useMemoryMonitor(options: MemoryMonitorOptions = {}) {
  const {
    interval = 5000, // 默认5秒监控一次
    threshold = 100, // 默认100MB警告
    onMemoryWarning,
    onMemoryLeak
  } = options;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMemoryRef = useRef<MemoryInfo | null>(null);
  const isMountedRef = useRef(true);

  // 获取内存信息
  const getMemoryInfo = useCallback((): MemoryInfo | null => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
    return null;
  }, []);

  // 格式化内存大小
  const formatMemorySize = useCallback((bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }, []);

  // 开始监控
  const startMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      if (!isMountedRef.current) return;

      const memoryInfo = getMemoryInfo();
      if (!memoryInfo) return;

      const usedMB = memoryInfo.usedJSHeapSize / (1024 * 1024);

      // 检查内存使用是否超过阈值
      if (usedMB > threshold && onMemoryWarning) {
        console.warn(`[内存监控] 内存使用过高: ${formatMemorySize(memoryInfo.usedJSHeapSize)}`);
        onMemoryWarning(memoryInfo);
      }

      // 检查内存泄漏（连续增长）
      if (lastMemoryRef.current) {
        const increase = memoryInfo.usedJSHeapSize - lastMemoryRef.current.usedJSHeapSize;
        const increaseMB = increase / (1024 * 1024);
        
        // 如果内存持续增长超过10MB，可能是内存泄漏
        if (increaseMB > 10 && onMemoryLeak) {
          console.error(`[内存监控] 检测到可能的内存泄漏: 增长 ${formatMemorySize(increase)}`);
          onMemoryLeak(memoryInfo, increase);
        }
      }

      lastMemoryRef.current = memoryInfo;
    }, interval);
  }, [interval, threshold, onMemoryWarning, onMemoryLeak, getMemoryInfo, formatMemorySize]);

  // 停止监控
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 获取当前内存信息
  const getCurrentMemoryInfo = useCallback(() => {
    return getMemoryInfo();
  }, [getMemoryInfo]);

  // 手动触发垃圾回收（仅在开发环境）
  const forceGC = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[内存监控] 尝试手动触发垃圾回收');
      if ('gc' in window) {
        (window as any).gc();
      } else {
        console.warn('[内存监控] 浏览器不支持手动垃圾回收');
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    startMonitoring();

    return () => {
      isMountedRef.current = false;
      stopMonitoring();
    };
  }, [startMonitoring, stopMonitoring]);

  return {
    getCurrentMemoryInfo,
    formatMemorySize,
    forceGC,
    startMonitoring,
    stopMonitoring
  };
}
