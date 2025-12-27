import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { Button, Card, CardBody, CardHeader, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addToast } from "@heroui/toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faPlug,
  faPlugCircleXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";
import { LogViewer, LogEntry } from "@/components/ui/log-viewer";
import { useNodePassSSE } from "@/lib/hooks/use-nodepass-sse";

// 主控详情接口定义
interface EndpointDetail {
  id: number;
  name: string;
  url: string;
  apiPath: string;
  apiKey: string;
  status: string;
  color?: string;
  os?: string;
  arch?: string;
  ver?: string;
  log?: string;
  tls?: string;
  crt?: string;
  keyPath?: string;
  uptime?: number | null;
  lastCheck: string;
  createdAt: string;
  updatedAt: string;
}

export default function SSEDebugPage() {
  const { t } = useTranslation("endpoints");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const endpointId = searchParams.get("id");

  const [detailLoading, setDetailLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [endpointDetail, setEndpointDetail] = useState<EndpointDetail | null>(
    null,
  );

  const logCounterRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  const scrollToTop = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, []);

  // 获取主控详情数据
  const fetchEndpointDetail = useCallback(async () => {
    if (!endpointId) return;

    try {
      setDetailLoading(true);
      const res = await fetch(
        buildApiUrl(`/api/endpoints/${endpointId}/detail`),
      );

      if (!res.ok) throw new Error(t("details.sseDebug.toast.fetchFailed"));
      const data = await res.json();

      if (data.success && data.endpoint) {
        setEndpointDetail(data.endpoint);
      }
    } catch (err) {
      console.error(err);
      addToast({
        title: t("details.sseDebug.toast.loadFailed"),
        description: err instanceof Error ? err.message : t("details.sseDebug.toast.unknownError"),
        color: "danger",
      });
    } finally {
      setDetailLoading(false);
    }
  }, [endpointId, t]);

  // 使用useMemo稳定endpoint对象，避免频繁重新创建
  const endpoint = useMemo(() => {
    console.log("[SSE Debug] 构建endpoint对象:", endpointDetail);
    if (!endpointDetail) {
      console.log("[SSE Debug] endpointDetail为空，返回null");

      return null;
    }

    const endpointObj = {
      url: endpointDetail.url,
      apiPath: endpointDetail.apiPath,
      apiKey: endpointDetail.apiKey,
    };

    console.log("[SSE Debug] 构建的endpoint对象:", endpointObj);

    return endpointObj;
  }, [endpointDetail?.url, endpointDetail?.apiPath, endpointDetail?.apiKey]);

  // NodePass SSE监听 - 手动模式
  const { isConnected, isConnecting, error, connect, disconnect, reconnect } =
    useNodePassSSE(endpoint, {
      autoReconnect: false, // 禁用自动重连，手动控制
      onConnected: () => {
        console.log("[SSE Debug] 连接成功");
      },
      onMessage: (data) => {
        console.log("[SSE Debug] 收到消息:", data);

        // 处理所有类型的消息，不仅仅是log类型
        let logMessage = "";

        if (data.type === "log") {
          // 直接日志消息
          logMessage = data.message;
        } else if (data.type === "instance") {
          // 实例消息，格式化为可读的日志
          logMessage = `[${t("details.sseDebug.messageTypes.instance")}] ${JSON.stringify(data, null, 2)}`;
        } else if (data.type === "tunnel") {
          // 隧道消息
          logMessage = `[${t("details.sseDebug.messageTypes.tunnel")}] ${JSON.stringify(data, null, 2)}`;
        } else if (data.type === "stats") {
          // 统计消息
          logMessage = `[${t("details.sseDebug.messageTypes.stats")}] ${JSON.stringify(data, null, 2)}`;
        } else if (data.message) {
          // 其他有message字段的消息
          logMessage = data.message;
        } else if (typeof data === "string") {
          // 纯字符串消息
          logMessage = data;
        } else {
          // 其他类型的消息，转换为JSON字符串
          logMessage = JSON.stringify(data, null, 2);
        }

        // 添加到日志列表
        if (logMessage) {
          const newLogEntry: LogEntry = {
            id: ++logCounterRef.current,
            message: logMessage,
            isHtml: true,
          };

          console.log("[SSE Debug] 添加日志条目:", newLogEntry);

          setLogs((prevLogs) => {
            const updatedLogs = [...prevLogs, newLogEntry];

            // 保持日志数量在1000条以内
            if (updatedLogs.length > 1000) {
              return updatedLogs.slice(-1000);
            }
            console.log(
              "[SSE Debug] 更新日志列表，新长度:",
              updatedLogs.length,
            );

            return updatedLogs;
          });
        } else {
          console.log("[SSE Debug] 空消息，跳过");
        }
      },
      onError: (error) => {
        console.error("[SSE Debug] 连接错误:", error);
      },
      onDisconnected: () => {
        console.log("[SSE Debug] 连接已断开");
      },
    });

  // 使用useCallback优化函数引用，添加正确的依赖项
  const memoizedFetchEndpointDetail = useCallback(fetchEndpointDetail, [
    endpointId,
  ]);

  // 初始化数据加载 - 只在组件挂载时执行一次，使用ref避免重复执行
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!hasInitializedRef.current) {
      console.log("[SSE Debug] 组件初始化，加载数据");
      hasInitializedRef.current = true;
      memoizedFetchEndpointDetail();
    }
  }, [memoizedFetchEndpointDetail]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 顶部返回按钮和主控信息 */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
        <div className="flex items-center gap-3">
          <Button
            isIconOnly
            className="bg-default-100 hover:bg-default-200"
            variant="flat"
            onPress={() => navigate(-1)}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </Button>
          {endpointDetail ? (
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg md:text-2xl font-bold truncate">
                {endpointDetail.name} - {t("details.sseDebug.pageTitle")}
              </h1>
              {endpointDetail.ver && (
                <Chip color="secondary" variant="flat">
                  {endpointDetail.ver}
                </Chip>
              )}
            </div>
          ) : (
            <h1 className="text-lg md:text-2xl font-bold truncate">{t("details.sseDebug.pageSubtitle")}</h1>
          )}
        </div>
      </div>

      {/* 日志区域 */}
      <Card className="p-2">
        <CardHeader className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
          <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{t("details.sseDebug.cardTitle")}</h3>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected
                      ? "bg-green-500"
                      : isConnecting
                        ? "bg-yellow-500 animate-pulse"
                        : "bg-red-500"
                  }`}
                />
                <span className="text-sm text-default-500">
                  {isConnected
                    ? t("details.sseDebug.status.connected")
                    : isConnecting
                      ? t("details.sseDebug.status.connecting")
                      : error
                        ? t("details.sseDebug.status.failed")
                        : t("details.sseDebug.status.disconnected")}
                </span>
              </div>
            </div>

            {/* 连接/断开按钮 - 移动端放在第一行右侧 */}
            <div className="md:hidden">
              {!isConnected && !isConnecting ? (
                <Button
                  color="success"
                  isDisabled={!endpointDetail}
                  size="sm"
                  startContent={<FontAwesomeIcon icon={faPlug} />}
                  variant="flat"
                  onPress={connect}
                >
                  {t("details.sseDebug.buttons.connect")}
                </Button>
              ) : (
                <Button
                  color="danger"
                  size="sm"
                  startContent={<FontAwesomeIcon icon={faPlugCircleXmark} />}
                  variant="flat"
                  onPress={disconnect}
                >
                  {t("details.sseDebug.buttons.disconnect")}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 连接/断开按钮 - 桌面端显示 */}
            <div className="hidden md:block">
              {!isConnected && !isConnecting ? (
                <Button
                  color="success"
                  isDisabled={!endpointDetail}
                  size="sm"
                  startContent={<FontAwesomeIcon icon={faPlug} />}
                  variant="flat"
                  onPress={connect}
                >
                  {t("details.sseDebug.buttons.connect")}
                </Button>
              ) : (
                <Button
                  color="danger"
                  size="sm"
                  startContent={<FontAwesomeIcon icon={faPlugCircleXmark} />}
                  variant="flat"
                  onPress={disconnect}
                >
                  {t("details.sseDebug.buttons.disconnect")}
                </Button>
              )}
            </div>

            {/* 清空日志按钮 */}
            <Button
              color="warning"
              size="sm"
              startContent={
                <Icon className="w-4 h-4" icon="solar:trash-bin-trash-bold" />
              }
              variant="flat"
              onPress={() => {
                setLogs([]);
                logCounterRef.current = 0;
              }}
            >
              {t("details.sseDebug.buttons.clear")}
            </Button>

            {/* 重连按钮 - 仅在连接失败时显示 */}
            {error && !isConnecting && (
              <Button
                color="secondary"
                isDisabled={!endpointDetail}
                size="sm"
                startContent={
                  <Icon className="w-4 h-4" icon="solar:refresh-bold" />
                }
                variant="flat"
                onPress={reconnect}
              >
                {t("details.sseDebug.buttons.reconnect")}
              </Button>
            )}

            {/* 滚动到顶部按钮 */}
            <Button
              color="primary"
              size="sm"
              startContent={
                <Icon className="w-4 h-4" icon="solar:arrow-up-bold" />
              }
              variant="flat"
              onPress={scrollToTop}
            >
              {t("details.sseDebug.buttons.scrollTop")}
            </Button>

            {/* 滚动到底部按钮 */}
            <Button
              color="primary"
              size="sm"
              startContent={
                <Icon className="w-4 h-4" icon="solar:arrow-down-bold" />
              }
              variant="flat"
              onPress={scrollToBottom}
            >
              {t("details.sseDebug.buttons.scrollBottom")}
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <LogViewer
            containerRef={logContainerRef}
            heightClass="h-[550px] md:h-[500px]"
            loading={false}
            logs={logs}
          />
        </CardBody>
      </Card>
    </div>
  );
}
