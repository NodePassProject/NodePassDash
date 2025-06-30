"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Chip, Select, SelectItem } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRefresh, faTrash } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { processAnsiColors } from "@/lib/utils/ansi";

interface FileLogEntry {
  timestamp: string;
  content: string;
  filePath: string;
}

interface FileLogViewerProps {
  endpointId: string;
  instanceId: string;
  className?: string;
  onClearLogs?: () => void;
  // 新增：外部控制接口
  onLogsChange?: (logs: FileLogEntry[]) => void;
  onLoadingChange?: (loading: boolean) => void;
  onClearingChange?: (clearing: boolean) => void;
  // 外部控制的状态
  days?: string;
  onDaysChange?: (days: string) => void;
  triggerRefresh?: number; // 通过改变这个值来触发刷新
}

export const FileLogViewer: React.FC<FileLogViewerProps> = ({
  endpointId,
  instanceId,
  className = "",
  onClearLogs,
  onLogsChange,
  onLoadingChange,
  onClearingChange,
  days: externalDays,
  onDaysChange,
  triggerRefresh
}) => {
  const [logs, setLogs] = useState<FileLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalDays, setInternalDays] = useState<string>("7");
  const [clearing, setClearing] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 使用外部控制的days或内部state
  const days = externalDays !== undefined ? externalDays : internalDays;

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  // 使用useRef来稳定化回调函数，避免循环依赖
  const onLogsChangeRef = useRef(onLogsChange);
  const onLoadingChangeRef = useRef(onLoadingChange);
  
  useEffect(() => {
    onLogsChangeRef.current = onLogsChange;
    onLoadingChangeRef.current = onLoadingChange;
  });

  // 获取文件日志
  const fetchFileLogs = useCallback(async () => {
    if (!endpointId || !instanceId) return;
    
    setLoading(true);
    onLoadingChangeRef.current?.(true);
    
    try {
      const response = await fetch(
        `/api/endpoints/${endpointId}/file-logs?instanceId=${instanceId}&days=${days}`
      );
      
      if (!response.ok) {
        throw new Error('获取文件日志失败');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
        onLogsChangeRef.current?.(data.logs);
        // 延迟滚动到底部
        setTimeout(scrollToBottom, 100);
      } else {
        setLogs([]);
        onLogsChangeRef.current?.([]);
      }
    } catch (error) {
      console.error('获取文件日志失败:', error);
      addToast({
        title: "获取日志失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
      setLogs([]);
      onLogsChangeRef.current?.([]);
    } finally {
      setLoading(false);
      onLoadingChangeRef.current?.(false);
    }
  }, [endpointId, instanceId, days, scrollToBottom]);

  // 稳定化清空日志的回调函数
  const onClearingChangeRef = useRef(onClearingChange);
  const onClearLogsRef = useRef(onClearLogs);
  
  useEffect(() => {
    onClearingChangeRef.current = onClearingChange;
    onClearLogsRef.current = onClearLogs;
  });

  // 清空日志
  const handleClearLogs = useCallback(async () => {
    if (!endpointId || !instanceId || clearing) return;
    
    setClearing(true);
    onClearingChangeRef.current?.(true);
    
    try {
      const response = await fetch(
        `/api/endpoints/${endpointId}/file-logs/clear?instanceId=${instanceId}`,
        { method: 'DELETE' }
      );
      
      if (!response.ok) {
        throw new Error('清空日志失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setLogs([]);
        onLogsChangeRef.current?.([]);
        addToast({
          title: "清空成功",
          description: data.message || "文件日志已清空",
          color: "success",
        });
        
        if (onClearLogsRef.current) {
          onClearLogsRef.current();
        }
      } else {
        throw new Error(data.message || '清空失败');
      }
    } catch (error) {
      console.error('清空日志失败:', error);
      addToast({
        title: "清空失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setClearing(false);
      onClearingChangeRef.current?.(false);
    }
  }, [endpointId, instanceId, clearing]);

  // 暴露刷新和清空方法给外部使用 - 通过回调函数方式

  // 初始加载和依赖变化时重新加载
  useEffect(() => {
    fetchFileLogs();
  }, [endpointId, instanceId, days]); // 直接依赖关键参数，避免fetchFileLogs循环

  // 响应外部触发的刷新
  useEffect(() => {
    if (triggerRefresh !== undefined && triggerRefresh > 0) {
      fetchFileLogs();
    }
  }, [triggerRefresh]); // 移除fetchFileLogs依赖，避免循环

  // 日志变化时自动滚动到底部
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, scrollToBottom]);

  // 追加新日志的方法
  const appendLog = useCallback((logContent: string) => {
    if (!logContent) return;
    
    // 创建新的日志条目
    const newLogEntry: FileLogEntry = {
      timestamp: new Date().toISOString(),
      content: logContent,
      filePath: 'live' // 标记为实时日志
    };
    
    // 追加到现有日志列表
    setLogs(prevLogs => {
      const updatedLogs = [...prevLogs, newLogEntry];
      onLogsChangeRef.current?.(updatedLogs);
      return updatedLogs;
    });
    
    // 自动滚动到底部
    setTimeout(scrollToBottom, 50);
  }, [scrollToBottom]);

  // 暴露方法给外部组件
  React.useEffect(() => {
    // 将方法挂载到组件实例上，供外部调用
    const component = { 
      refresh: fetchFileLogs, 
      clear: handleClearLogs,
      scrollToBottom: scrollToBottom,
      appendLog: appendLog
    };
    (window as any).fileLogViewerRef = component;
    
    return () => {
      delete (window as any).fileLogViewerRef;
    };
  }, [fetchFileLogs, handleClearLogs, scrollToBottom, appendLog]);

  return (
    <div className={className}>
      <div 
        ref={logContainerRef}
        className="h-[300px] md:h-[400px] bg-zinc-900 rounded-lg p-3 md:p-4 font-mono text-xs md:text-sm overflow-auto scrollbar-thin"
      >
        {loading ? (
          <div className="animate-pulse">
            <span className="text-blue-400 ml-2">INFO:</span> 
            <span className="text-gray-300 ml-1">加载文件日志中...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-gray-400">
            暂无日志记录 (最近{days}天)
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="text-gray-300 leading-5">
                <span 
                  className="break-all" 
                  dangerouslySetInnerHTML={{ 
                    __html: processAnsiColors(log.content) 
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileLogViewer; 