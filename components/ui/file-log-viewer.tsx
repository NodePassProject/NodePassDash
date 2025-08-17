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
  instanceId: string
  className?: string;
  onClearLogs?: () => void;
  // 新增：外部控制接口
  onLogsChange?: (logs: FileLogEntry[]) => void;
  onLoadingChange?: (loading: boolean) => void;
  onClearingChange?: (clearing: boolean) => void;
  // 外部控制的状态
  date?: string; // 改为date参数
  onDateChange?: (date: string) => void; // 改为onDateChange
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
  date: externalDate,
  onDateChange,
  triggerRefresh
}) => {
  const [logs, setLogs] = useState<FileLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalDate, setInternalDate] = useState<string>(""); // 改为空字符串，等待获取可用日期
  const [clearing, setClearing] = useState(false);
  const [availableDates, setAvailableDates] = useState<string[]>([]); // 新增：可用日期列表
  const [loadingDates, setLoadingDates] = useState(false); // 新增：加载日期状态
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 使用外部控制的date或内部state
  const date = externalDate !== undefined ? externalDate : internalDate;

  // 获取可用的日志日期列表
  const fetchAvailableDates = useCallback(async () => {
    if (!endpointId || !instanceId) return;
    
    setLoadingDates(true);
    try {
      const response = await fetch(
        `/api/endpoints/${endpointId}/file-logs/dates?instanceId=${instanceId}`
      );
      
      if (!response.ok) {
        throw new Error('获取可用日志日期失败');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.dates)) {
        setAvailableDates(data.dates);
        
        // 如果没有外部控制的日期，且内部日期为空，则设置默认日期为最新的可用日期
        if (externalDate === undefined && internalDate === "" && data.dates.length > 0) {
          const latestDate = data.dates[0]; // 日期已经按最新排序
          setInternalDate(latestDate);
        }
      } else {
        setAvailableDates([]);
      }
    } catch (error) {
      console.error('获取可用日志日期失败:', error);
      setAvailableDates([]);
    } finally {
      setLoadingDates(false);
    }
  }, [endpointId, instanceId, externalDate, internalDate]);

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
    if (!endpointId || !instanceId || !date) return; // 添加date检查
    
    setLoading(true);
    onLoadingChangeRef.current?.(true);
    
    try {
      const response = await fetch(
        `/api/endpoints/${endpointId}/file-logs?instanceId=${instanceId}&date=${date}`
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
  }, [endpointId, instanceId, date, scrollToBottom]);

  // 稳定化清空日志的回调函数
  const onClearingChangeRef = useRef(onClearingChange);
  const onClearLogsRef = useRef(onClearLogs);
  
  useEffect(() => {
    onClearingChangeRef.current = onClearingChange;
    onClearLogsRef.current = onClearLogs;
  });

  // 清空日志
  const handleClearLogs = useCallback(async () => {
    if (!endpointId || !instanceId) return;
    
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
      
      // 清空本地日志
      setLogs([]);
      onLogsChangeRef.current?.([]);
      
      // 调用外部清空回调
      onClearLogsRef.current?.();
      
      addToast({
        title: "清空成功",
        description: "日志已清空",
        color: "success",
      });
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
  }, [endpointId, instanceId]);

  // 初始加载：获取可用日期
  useEffect(() => {
    fetchAvailableDates();
  }, [fetchAvailableDates]);

  // 当有可用日期且有选中日期时，获取日志
  useEffect(() => {
    if (date && availableDates.length > 0) {
      fetchFileLogs();
    }
  }, [date, availableDates, fetchFileLogs]);

  // 响应外部触发的刷新
  useEffect(() => {
    if (triggerRefresh && triggerRefresh > 0) {
      fetchFileLogs();
    }
  }, [triggerRefresh, fetchFileLogs]);

  // 日志变化时自动滚动到底部
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, scrollToBottom]);

  // 追加新日志的方法
  const appendLog = useCallback((logContent: string) => {
    if (!logContent) return;
    
    // 将content按\n分割，为每一行创建独立的日志条目
    const lines = logContent.split('\n').filter(line => line.length > 0);
    const newLogEntries: FileLogEntry[] = lines.map((line, index) => ({
      timestamp: new Date().toISOString(),
      content: line,
      filePath: 'live' // 标记为实时日志
    }));
    
    // 追加到现有日志列表
    setLogs(prevLogs => {
      const updatedLogs = [...prevLogs, ...newLogEntries];
      onLogsChangeRef.current?.(updatedLogs);
      return updatedLogs;
    });
    
    // 自动滚动到底部
    setTimeout(scrollToBottom, 50);
  }, [scrollToBottom]);

  // 暴露方法给外部组件
  useEffect(() => {
    // 将方法挂载到组件实例上，供外部调用
    const component = { 
      refresh: fetchFileLogs, 
      clear: handleClearLogs,
      scrollToBottom: scrollToBottom,
      appendLog: appendLog,
      getAvailableDates: fetchAvailableDates // 新增：获取可用日期的方法
    };
    (window as any).fileLogViewerRef = component;
    
    return () => {
      delete (window as any).fileLogViewerRef;
    };
  }, [fetchFileLogs, handleClearLogs, scrollToBottom, appendLog, fetchAvailableDates]);

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
            暂无日志记录 {date ? `(${date})` : ''}
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => {
              // 将content按\n分割成多行，然后逐行显示
              const lines = log.content.split('\n').filter(line => line.length > 0);
              return lines.map((line, lineIndex) => (
                <div key={`${index}-${lineIndex}`} className="text-gray-300 leading-5">
                  <span 
                    className="break-all" 
                    dangerouslySetInnerHTML={{ 
                      __html: processAnsiColors(line) 
                    }}
                  />
                </div>
              ));
            }).flat()}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileLogViewer; 