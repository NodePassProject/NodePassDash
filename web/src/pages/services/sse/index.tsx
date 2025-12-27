import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Chip,
  Spinner,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowDown,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";
import { processAnsiColors } from "@/lib/utils/ansi";
import { useTunnelSSE } from "@/lib/hooks/use-sse";

interface SSELogEntry {
  timestamp: string;
  content: string;
  filePath: string;
}

interface ServiceDetails {
  sid: string;
  type: string;
  alias?: string;
  serverInstanceId?: string;
  clientInstanceId?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ServiceSSEPage() {
  const { t } = useTranslation("services");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 从 URL 参数获取 sid
  const sid = searchParams.get("sid");

  // 服务详情状态
  const [service, setService] = useState<ServiceDetails | null>(null);
  const [loading, setLoading] = useState(true);

  // Server 端状态
  const [serverLogs, setServerLogs] = useState<SSELogEntry[]>([]);
  const [serverClearPopoverOpen, setServerClearPopoverOpen] = useState(false);
  const serverLogContainerRef = useRef<HTMLDivElement>(null);

  // Client 端状态
  const [clientLogs, setClientLogs] = useState<SSELogEntry[]>([]);
  const [clientClearPopoverOpen, setClientClearPopoverOpen] = useState(false);
  const clientLogContainerRef = useRef<HTMLDivElement>(null);

  // 根据 type 获取模式文案
  // 0: 通用单端转发, 1: 本地内网穿透, 2: 本地隧道转发
  // 3: 外部内网穿透, 4: 外部隧道转发, 5: 均衡单端转发
  // 6: 均衡内网穿透, 7: 均衡隧道转发
  const getTypeLabel = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return t("types.general");
      case "1":
        return t("types.localPenetration");
      case "2":
        return t("types.localTunnel");
      case "3":
        return t("types.externalPenetration");
      case "4":
        return t("types.externalTunnel");
      case "5":
        return t("types.balancedSingle");
      case "6":
        return t("types.balancedPenetration");
      case "7":
        return t("types.balancedTunnel");
      default:
        return typeValue;
    }
  };

  // 根据类型获取颜色 (HeroUI 原生颜色)
  // 单端转发=primary(蓝), 内网穿透=success(绿), 隧道转发=secondary(紫), 均衡=warning(橙)
  const getTypeColor = (typeValue: string) => {
    switch (typeValue) {
      case "0":
        return "primary";     // 通用单端转发 - 蓝色
      case "1":
        return "success";     // 本地内网穿透 - 绿色
      case "2":
        return "secondary";   // 本地隧道转发 - 紫色
      case "3":
        return "success";     // 外部内网穿透 - 绿色
      case "4":
        return "secondary";   // 外部隧道转发 - 紫色
      case "5":
        return "warning";     // 均衡单端转发 - 橙色
      case "6":
        return "warning";     // 均衡内网穿透 - 橙色
      case "7":
        return "warning";     // 均衡隧道转发 - 橙色
      default:
        return "default";
    }
  };

  // 获取服务详情
  const fetchServiceDetails = useCallback(async () => {
    if (!sid) {
      navigate("/services");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(buildApiUrl(`/api/services/${sid}`));

      if (!response.ok) {
        throw new Error(t("sse.toast.fetchFailed"));
      }

      const data = await response.json();
      setService(data.service);
    } catch (error) {
      console.error("获取服务详情失败:", error);
      addToast({
        title: t("sse.toast.fetchFailed"),
        description: error instanceof Error ? error.message : t("sse.toast.unknownError"),
        color: "danger",
      });
      navigate("/services");
    } finally {
      setLoading(false);
    }
  }, [sid, navigate, t]);

  useEffect(() => {
    fetchServiceDetails();
  }, [fetchServiceDetails]);

  // 滚动到底部的辅助函数
  const scrollToBottom = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  };

  // 追加日志到 Server 端
  const appendServerLog = useCallback((logContent: string) => {
    if (!logContent) return;

    const lines = logContent.split("\n").filter((line) => line.length > 0);
    const newLogEntries: SSELogEntry[] = lines.map((line) => ({
      timestamp: new Date().toISOString(),
      content: processAnsiColors(line),
      filePath: "live",
    }));

    setServerLogs((prevLogs) => {
      const updatedLogs = [...prevLogs, ...newLogEntries];
      // 限制日志数量，保留最新的1000条
      return updatedLogs.slice(-1000);
    });

    setTimeout(() => scrollToBottom(serverLogContainerRef), 50);
  }, []);

  // 追加日志到 Client 端
  const appendClientLog = useCallback((logContent: string) => {
    if (!logContent) return;

    const lines = logContent.split("\n").filter((line) => line.length > 0);
    const newLogEntries: SSELogEntry[] = lines.map((line) => ({
      timestamp: new Date().toISOString(),
      content: processAnsiColors(line),
      filePath: "live",
    }));

    setClientLogs((prevLogs) => {
      const updatedLogs = [...prevLogs, ...newLogEntries];
      // 限制日志数量，保留最新的1000条
      return updatedLogs.slice(-1000);
    });

    setTimeout(() => scrollToBottom(clientLogContainerRef), 50);
  }, []);

  // Server 端 SSE 消息处理
  const serverSseOnMessage = useCallback(
    (data: any) => {
      console.log("[Server SSE] 收到消息:", data);

      // 处理 log 事件
      if (data.type === "log" && data.logs) {
        appendServerLog(data.logs);
      }

      // 处理 update 事件
      if (data.type === "update") {
        console.log("[Server SSE] 收到update事件");
      }
    },
    [appendServerLog]
  );

  // Client 端 SSE 消息处理
  const clientSseOnMessage = useCallback(
    (data: any) => {
      console.log("[Client SSE] 收到消息:", data);

      // 处理 log 事件
      if (data.type === "log" && data.logs) {
        appendClientLog(data.logs);
      }

      // 处理 update 事件
      if (data.type === "update") {
        console.log("[Client SSE] 收到update事件");
      }
    },
    [appendClientLog]
  );

  // Server 端 SSE 错误处理
  const serverSseOnError = useCallback((error: any) => {
    console.error("[Server SSE] 连接错误:", error);
  }, []);

  // Client 端 SSE 错误处理
  const clientSseOnError = useCallback((error: any) => {
    console.error("[Client SSE] 连接错误:", error);
  }, []);

  // 判断是否为单端转发模式 (type=0 或 type=5)
  const isSingleForward = service?.type === "0" || service?.type === "5";

  // Server 端 SSE 连接（单端转发模式不连接）
  useTunnelSSE(service?.serverInstanceId || "", {
    onMessage: serverSseOnMessage,
    onError: serverSseOnError,
    enabled: !!service?.serverInstanceId && !isSingleForward, // 单端转发时不连接 Server 端
  });

  // Client 端 SSE 连接
  useTunnelSSE(service?.clientInstanceId || "", {
    onMessage: clientSseOnMessage,
    onError: clientSseOnError,
    enabled: !!service?.clientInstanceId, // 只有存在 clientInstanceId 时才连接
  });

  // 渲染单个日志面板
  const renderLogPanel = (
    title: string,
    logs: SSELogEntry[],
    handleScrollToBottom: () => void,
    clearPopoverOpen: boolean,
    setClearPopoverOpen: (open: boolean) => void,
    handleClear: () => void,
    logContainerRef: React.RefObject<HTMLDivElement>
  ) => {
    return (
      <Card className="p-2 flex-1 flex flex-col">
        <CardHeader className="flex-shrink-0 flex items-center justify-between pb-2">
          <h3 className="text-lg font-semibold">{title}</h3>

          <div className="flex items-center gap-1">
            <Tooltip content={t("sse.buttons.scrollToBottom")} placement="top">
              <Button
                isIconOnly
                className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                size="sm"
                variant="flat"
                onPress={handleScrollToBottom}
              >
                <FontAwesomeIcon className="text-xs" icon={faArrowDown} />
              </Button>
            </Tooltip>

            <Popover
              isOpen={clearPopoverOpen}
              placement="bottom"
              onOpenChange={setClearPopoverOpen}
            >
              <PopoverTrigger>
                <Button
                  isIconOnly
                  className="h-7 w-7 sm:h-8 sm:w-8 min-w-0"
                  color="danger"
                  size="sm"
                  variant="flat"
                >
                  <FontAwesomeIcon className="text-xs" icon={faTrash} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-3">
                <div className="space-y-3">
                  <p className="text-sm font-medium">{t("sse.confirmClear.title")}</p>
                  <p className="text-xs text-default-500">
                    {t("sse.confirmClear.message")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      color="danger"
                      size="sm"
                      onPress={() => {
                        handleClear();
                        setClearPopoverOpen(false);
                      }}
                    >
                      {t("sse.confirmClear.confirm")}
                    </Button>
                    <Button
                      className="flex-1"
                      size="sm"
                      variant="flat"
                      onPress={() => setClearPopoverOpen(false)}
                    >
                      {t("sse.confirmClear.cancel")}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>
        <CardBody className="flex-1 overflow-hidden p-0">
          <div
            ref={logContainerRef}
            className="h-full bg-zinc-900 rounded-lg p-3 md:p-4 font-mono text-xs md:text-sm overflow-auto scrollbar-thin"
          >
            {logs.length === 0 ? (
              <div className="text-gray-400 flex items-center">
                <div className="animate-pulse flex items-center">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce mr-2" />
                  <span>{t("sse.waitingForLogs")}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {logs
                  .map((log, index) => {
                    const lines = log.content
                      .split("\n")
                      .filter((line) => line.length > 0);

                    return lines.map((line, lineIndex) => (
                      <div
                        key={`${index}-${lineIndex}`}
                        className="text-gray-300 leading-5"
                      >
                        <span
                          dangerouslySetInnerHTML={{ __html: line }}
                          className="break-all"
                        />
                      </div>
                    ));
                  })
                  .flat()}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    );
  };

  if (loading || !service) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="space-y-4">
          <div className="flex justify-center">
            <Spinner color="primary" size="lg" />
          </div>
          <p className="text-default-500 animate-pulse">{t("sse.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-4 p-4 md:p-0">
      {/* 顶部操作区 */}
      <div className="flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            isIconOnly
            className="bg-default-100 hover:bg-default-200"
            variant="flat"
            onClick={() => navigate(-1)}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          <h1 className="text-lg md:text-2xl font-bold">
            {service.alias || service.sid}
          </h1>
          <Chip color={getTypeColor(service.type) as any} variant="flat">
            {getTypeLabel(service.type)}
          </Chip>
        </div>
      </div>

      {/* 日志展示区域：单端转发只显示 Client 端 */}
      <div className={`flex-1 grid grid-cols-1 ${isSingleForward ? "" : "lg:grid-cols-2"} gap-4 overflow-hidden`}>
        {/* Server 端日志（单端转发模式不显示） */}
        {!isSingleForward && renderLogPanel(
          t("sse.serverLog"),
          serverLogs,
          () => scrollToBottom(serverLogContainerRef),
          serverClearPopoverOpen,
          setServerClearPopoverOpen,
          () => setServerLogs([]),
          serverLogContainerRef
        )}

        {/* Client 端日志 */}
        {renderLogPanel(
          isSingleForward ? t("sse.realtimeLog") : t("sse.clientLog"),
          clientLogs,
          () => scrollToBottom(clientLogContainerRef),
          clientClearPopoverOpen,
          setClientClearPopoverOpen,
          () => setClientLogs([]),
          clientLogContainerRef
        )}
      </div>
    </div>
  );
}
