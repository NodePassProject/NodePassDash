"use client";

import React, { useEffect, useRef } from "react";

import { processAnsiColors } from "@/lib/utils/ansi";

export interface LogEntry {
  id: number | string;
  message: string;
  isHtml?: boolean;
}

interface LogViewerProps {
  logs: LogEntry[];
  heightClass?: string; // tailwind 高度类，如 h-[400px]
  loading?: boolean;
  containerRef?: React.RefObject<HTMLDivElement>;
}

/**
 * 日志查看组件，可复用
 * @param logs 日志数组
 * @param heightClass 容器高度 Tailwind 类，默认 h-[300px] md:h-[400px]
 * @param loading 是否加载中
 */
export const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  heightClass = "h-[300px] md:h-[400px]",
  loading = false,
  containerRef,
}) => {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = containerRef ?? internalRef;

  // 自动滚动到底部
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={ref}
      className={`${heightClass} bg-zinc-900 rounded-lg p-4 font-mono text-sm overflow-auto scrollbar-thin`}
    >
      {loading ? (
        <div className="animate-pulse text-gray-300">加载日志中...</div>
      ) : logs.length === 0 ? (
        <div className="text-gray-400 animate-pulse">暂无日志</div>
      ) : (
        <div className="space-y-1">
          {logs.slice().map((log) => (
            <div key={log.id} className="text-gray-300 leading-5">
              {log.isHtml !== false ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: processAnsiColors(log.message),
                  }}
                />
              ) : (
                <span className="break-all">{log.message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
