"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  date?: string; // 改为date参数
  onDateChange?: (date: string) => void; // 改为onDateChange
  triggerRefresh?: number; // 通过改变这个值来触发刷新
  isRealtimeMode?: boolean; // 是否处于实时模式
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
  triggerRefresh,
  isRealtimeMode = false,
}) => {
  const [logs, setLogs] = useState<FileLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalDate, setInternalDate] = useState<string>(""); // 内部日期状态（当外部没有提供时使用）
  const [clearing, setClearing] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 使用外部控制的date或内部state
  const date = externalDate !== undefined ? externalDate : internalDate;

  // 移除获取可用日志日期的功能，直接使用外部传入的日期

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

    console.log(
      `[FileLogViewer] 开始获取日志: endpointId=${endpointId}, instanceId=${instanceId}, date=${date}`,
    );

    setLoading(true);
    onLoadingChangeRef.current?.(true);

    try {
      const response = await fetch(
        `/api/tunnels/${instanceId}/file-logs?&date=${date}`,
      );

      if (!response.ok) {
        throw new Error("获取文件日志失败");
      }

      const data = await response.json();

      if (data.success && data.data && Array.isArray(data.data.logs)) {
        // 转换API返回的格式到FileLogEntry格式
        const convertedLogs: FileLogEntry[] = data.data.logs.map(
          (log: any) => ({
            timestamp: log.timestamp || new Date().toISOString(),
            content: log.message || log.content || "",
            filePath: log.filePath || "file",
          }),
        );

        setLogs(convertedLogs);
        onLogsChangeRef.current?.(convertedLogs);
        // 延迟滚动到底部
        setTimeout(scrollToBottom, 100);
      } else {
        setLogs([]);
        onLogsChangeRef.current?.([]);
      }
    } catch (error) {
      console.error("获取文件日志失败:", error);
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
        `/api/tunnels/${instanceId}/file-logs/clear`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("清空日志失败");
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
      console.error("清空日志失败:", error);
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

  // 移除自动获取可用日期的逻辑，避免多次API调用

  // 当有选中日期时，获取日志
  useEffect(() => {
    if (date && endpointId && instanceId) {
      fetchFileLogs();
    }
  }, [date, endpointId, instanceId, fetchFileLogs]);

  // 响应外部触发的刷新
  useEffect(() => {
    if (triggerRefresh && triggerRefresh > 0 && endpointId && instanceId) {
      fetchFileLogs();
    }
  }, [triggerRefresh, endpointId, instanceId, fetchFileLogs]);

  // 日志变化时自动滚动到底部
  useEffect(() => {
    if (logs.length > 0) {
      setTimeout(scrollToBottom, 50);
    }
  }, [logs, scrollToBottom]);

  // 清空显示（仅清空UI，不调用接口）
  const clearDisplay = useCallback(() => {
    setLogs([]);
    onLogsChangeRef.current?.([]);
  }, []);

  // 追加新日志的方法
  const appendLog = useCallback(
    (logContent: string) => {
      if (!logContent) return;

      // 将content按\n分割，为每一行创建独立的日志条目
      const lines = logContent.split("\n").filter((line) => line.length > 0);
      const newLogEntries: FileLogEntry[] = lines.map((line, index) => ({
        timestamp: new Date().toISOString(),
        content: processAnsiColors(line), // 处理ANSI颜色
        filePath: "live", // 标记为实时日志
      }));

      // 追加到现有日志列表
      setLogs((prevLogs) => {
        const updatedLogs = [...prevLogs, ...newLogEntries];

        onLogsChangeRef.current?.(updatedLogs);

        return updatedLogs;
      });

      // 自动滚动到底部
      setTimeout(scrollToBottom, 50);
    },
    [scrollToBottom],
  );

  // 暴露方法给外部组件
  useEffect(() => {
    // 将方法挂载到组件实例上，供外部调用
    const component = {
      refresh: fetchFileLogs,
      clear: handleClearLogs,
      clearDisplay: clearDisplay, // 新增：仅清空显示的方法
      scrollToBottom: scrollToBottom,
      appendLog: appendLog,
    };

    (window as any).fileLogViewerRef = component;

    return () => {
      delete (window as any).fileLogViewerRef;
    };
  }, [fetchFileLogs, handleClearLogs, clearDisplay, scrollToBottom, appendLog]);

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
          isRealtimeMode ? (
            <div className="text-gray-400 flex items-center">
              <div className="animate-pulse flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce mr-2" />
                <span>正在等待日志推送...</span>
              </div>
            </div>
          ) : (
            <div className="text-gray-400">
              暂无日志记录 {date ? `(${date})` : ""}
            </div>
          )
        ) : (
          <div className="space-y-1">
            {logs
              .map((log, index) => {
                // 将content按\n分割成多行，然后逐行显示
                const lines = log.content
                  .split("\n")
                  .filter((line) => line.length > 0);

                return lines.map((line, lineIndex) => (
                  <div
                    key={`${index}-${lineIndex}`}
                    className="text-gray-300 leading-5"
                  >
                    <span
                      dangerouslySetInnerHTML={{
                        __html: line, // API已经处理过ANSI颜色，直接使用
                      }}
                      className="break-all"
                    />
                  </div>
                ));
              })
              .flat()}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileLogViewer;
