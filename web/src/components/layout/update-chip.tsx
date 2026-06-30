import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Spinner,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react/dist/offline";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/components/providers/settings-provider";
import { buildApiUrl, getAuthToken } from "@/lib/utils";

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

interface UpdateInfo {
  current: { current: string; os: string; arch: string };
  stable?: GitHubRelease;
  beta?: GitHubRelease;
  hasStableUpdate: boolean;
  hasBetaUpdate: boolean;
}

interface CurrentVersion {
  current: string;
  restartPending?: boolean;
  pendingVersion?: string;
}

type UpdateState =
  | "idle"
  | "has-update"
  | "updating"
  | "update-complete"
  | "restarting"
  | "error";

const COUNTDOWN_SECONDS = 3;
const LAST_CHECK_KEY = "nodepass-last-update-check";
const LAST_CHECK_CACHE_KEY = "nodepass-update-cache";

export function UpdateChip() {
  const { t } = useTranslation("settings");
  const { settings } = useSettings();

  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [state, setState] = useState<UpdateState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(-1);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  const fetchCurrent = useCallback(async (): Promise<CurrentVersion | null> => {
    try {
      const res = await fetch(buildApiUrl("/api/version/current"));
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch {
      return null;
    }
  }, []);

  const fetchUpdateInfo = useCallback(async (): Promise<UpdateInfo | null> => {
    try {
      const res = await fetch(buildApiUrl("/api/version/check-update"));
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    } catch {
      return null;
    }
  }, []);

  // 检查更新逻辑(供按钮和初次加载共用)
  const runCheck = useCallback(
    async (opts?: { force?: boolean }) => {
      setChecking(true);
      try {
        const cur = await fetchCurrent();
        if (cur) {
          setCurrentVersion(cur.current);
          if (cur.restartPending) {
            setUpdateInfo((prev) =>
              prev
                ? prev
                : {
                    current: { current: cur.current, os: "", arch: "" },
                    hasStableUpdate: false,
                    hasBetaUpdate: false,
                  },
            );
            setState("update-complete");
            return;
          }
        }
        const info = await fetchUpdateInfo();
        if (info) {
          setUpdateInfo(info);
          setState(info.hasStableUpdate || info.hasBetaUpdate ? "has-update" : "idle");
          if (opts?.force) {
            const today = new Date().toDateString();
            localStorage.setItem(LAST_CHECK_KEY, today);
            // 同步更新缓存
            const curVer = await fetchCurrent();
            if (curVer) {
              localStorage.setItem(
                LAST_CHECK_CACHE_KEY,
                JSON.stringify({ ...info, _checkedFor: curVer.current }),
              );
            }
          }
        }
      } finally {
        setChecking(false);
      }
    },
    [fetchCurrent, fetchUpdateInfo],
  );

  // 初次加载:总是请求当前版本(发现 restartPending 时立刻进入完成状态);
  // 先从 localStorage 加载缓存结果立即显示,再按需在后台刷新(每天一次)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 并行拉取当前版本 + 读取本地缓存
      const [cur] = await Promise.all([fetchCurrent()]);
      if (cancelled) return;

      if (cur) {
        setCurrentVersion(cur.current);
        if (cur.restartPending) {
          setUpdateInfo({
            current: { current: cur.current, os: "", arch: "" },
            hasStableUpdate: false,
            hasBetaUpdate: false,
          });
          setState("update-complete");
          return;
        }

        // 从缓存加载上次检查结果,版本一致时立即恢复 chip 状态
        try {
          const raw = localStorage.getItem(LAST_CHECK_CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as UpdateInfo & { _checkedFor?: string };
            if (cached._checkedFor === cur.current) {
              setUpdateInfo(cached);
              setState(cached.hasStableUpdate || cached.hasBetaUpdate ? "has-update" : "idle");
            } else {
              // 版本已变化(更新后重启),清除旧缓存
              localStorage.removeItem(LAST_CHECK_CACHE_KEY);
            }
          }
        } catch {
          localStorage.removeItem(LAST_CHECK_CACHE_KEY);
        }
      }

      if (!settings.autoCheckUpdates) return;
      const today = new Date().toDateString();
      if (localStorage.getItem(LAST_CHECK_KEY) === today) return;

      // 后台静默刷新
      const info = await fetchUpdateInfo();
      if (cancelled || !info) return;
      setUpdateInfo(info);
      setState(info.hasStableUpdate || info.hasBetaUpdate ? "has-update" : "idle");
      localStorage.setItem(LAST_CHECK_KEY, today);
      // 缓存结果供后续页面加载即时读取
      if (cur) {
        localStorage.setItem(
          LAST_CHECK_CACHE_KEY,
          JSON.stringify({ ...info, _checkedFor: cur.current }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoCheckUpdates]);

  const latestVersion = useMemo(() => {
    if (!updateInfo) return "";
    if (updateInfo.hasStableUpdate && updateInfo.stable) return updateInfo.stable.tag_name;
    if (updateInfo.hasBetaUpdate && updateInfo.beta) return updateInfo.beta.tag_name;
    if (updateInfo.stable) return updateInfo.stable.tag_name;
    return "";
  }, [updateInfo]);

  const releaseUrl = useMemo(() => {
    if (!updateInfo) return "";
    if (updateInfo.stable) return updateInfo.stable.html_url;
    if (updateInfo.beta) return updateInfo.beta.html_url;
    return "";
  }, [updateInfo]);

  // 启动 SSE 进度订阅
  const startProgressSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setDownloadPercent(-1);

    const token = getAuthToken();
    const url = new URL(buildApiUrl("/api/sse/version-progress"), window.location.origin);
    if (token) url.searchParams.set("token", token);

    const es = new EventSource(url.toString());
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const evt = JSON.parse(event.data) as { level: string; message: string; percent: number };
        if (evt.percent >= 0) {
          setDownloadPercent(evt.percent);
        }
      } catch {
        /* ignore parse errors */
      }
    };
    es.onerror = () => {
      // SSE 断开（服务重启或连接超时）时静默关闭
      es.close();
    };
  }, []);

  // 停止 SSE 进度订阅
  const stopProgressSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  const handleUpdate = async () => {
    setState("updating");
    setErrorMsg("");
    // 先建立 SSE 订阅，再发出更新请求，避免错过早期日志
    startProgressSSE();
    try {
      const type = updateInfo?.hasStableUpdate ? "stable" : "beta";
      const res = await fetch(buildApiUrl("/api/version/auto-update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data?.error || `HTTP ${res.status}`);
        setState("error");
        stopProgressSSE();
        return;
      }
      // 后端异步执行；轮询 /current 等待 restartPending=true（SSE 同时提供实时日志）
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const cur = await fetchCurrent();
        if (cur?.restartPending) {
          stopProgressSSE();
          setState("update-complete");
          return;
        }
      }
      stopProgressSSE();
      setErrorMsg(t("update.timeout"));
      setState("error");
    } catch (e: any) {
      stopProgressSSE();
      setErrorMsg(e?.message || String(e));
      setState("error");
    }
  };

  const startCountdown = () => {
    setCountdown(COUNTDOWN_SECONDS);
    setState("restarting");
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          void triggerRestart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const triggerRestart = async () => {
    try {
      await fetch(buildApiUrl("/api/version/restart"), { method: "POST" });
    } catch {
      /* ignore — connection drop is expected once the process exits */
    }
    // 进程退出后,supervisor/Docker 拉起容器,大约几秒后服务恢复
    // 持续探测 /api/version/current,通时刷新页面
    const probe = setInterval(async () => {
      try {
        const res = await fetch(buildApiUrl("/api/version/current"), { cache: "no-store" });
        if (res.ok) {
          clearInterval(probe);
          window.location.reload();
        }
      } catch {
        /* still down */
      }
    }, 1500);
    // 兜底:超过 60s 强制刷新
    setTimeout(() => {
      clearInterval(probe);
      window.location.reload();
    }, 60_000);
  };

  useEffect(
    () => () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      stopProgressSSE();
    },
    [stopProgressSSE],
  );

  const showChip = state !== "idle";
  if (!showChip) return null;

  // 各状态下 logo 旁的图标保持一致;只用 tooltip + color 区分语义
  const triggerColor: "warning" | "success" =
    state === "has-update" || state === "updating" ? "warning" : "success";
  const triggerIcon = "fa6-solid:circle-up";
  const triggerTooltip =
    state === "has-update"
      ? t("update.chipTooltipHasUpdate", { version: latestVersion })
      : state === "updating"
        ? t("update.chipTooltipUpdating")
        : state === "update-complete"
          ? t("update.chipTooltipPendingRestart")
          : t("update.chipTooltipRestarting");

  return (
    <Popover
      isOpen={popoverOpen}
      onOpenChange={setPopoverOpen}
      placement="bottom-start"
      offset={10}
    >
      <PopoverTrigger>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color={triggerColor}
          aria-label={triggerTooltip}
          className="min-w-unit-6 w-6 h-6 rounded-full"
        >
          <Tooltip content={triggerTooltip} placement="bottom">
            <span className="inline-flex items-center justify-center">
              <Icon
                icon={triggerIcon}
                width={16}
                className={
                  triggerColor === "warning" ? "text-warning" : "text-success"
                }
              />
            </span>
          </Tooltip>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[300px]">
        <UpdatePanel
          state={state}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          releaseUrl={releaseUrl}
          errorMsg={errorMsg}
          countdown={countdown}
          checking={checking}
          downloadPercent={downloadPercent}
          onRefresh={() => void runCheck({ force: true })}
          onUpdate={handleUpdate}
          onRestart={startCountdown}
          t={t}
        />
      </PopoverContent>
    </Popover>
  );
}

interface UpdatePanelProps {
  state: UpdateState;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  errorMsg: string;
  countdown: number;
  checking: boolean;
  downloadPercent: number;
  onRefresh: () => void;
  onUpdate: () => void;
  onRestart: () => void;
  t: (key: string, opts?: any) => string;
}

function UpdatePanel({
  state,
  currentVersion,
  latestVersion,
  releaseUrl,
  errorMsg,
  countdown,
  checking,
  downloadPercent,
  onRefresh,
  onUpdate,
  onRestart,
  t,
}: UpdatePanelProps) {
  const isHasUpdate = state === "has-update" || state === "updating" || state === "error";
  const isComplete = state === "update-complete" || state === "restarting";
  const isUpdating = state === "updating";

  return (
    <div className="flex flex-col gap-3 p-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-default-700">
          {t("update.popover.currentVersion")}
        </span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          isLoading={checking}
          onPress={onRefresh}
          aria-label={t("update.popover.refresh")}
        >
          <Icon icon="solar:refresh-bold" width={16} />
        </Button>
      </div>

      {/* 版本号 */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-foreground">
            {currentVersion || "—"}
          </span>
          {isComplete && (
            <Icon icon="solar:check-circle-bold" className="text-success" width={20} />
          )}
        </div>
        <span className="text-xs text-default-500">
          {isComplete
            ? t("update.popover.upToDate")
            : latestVersion
              ? t("update.popover.latestVersion", { version: latestVersion })
              : t("update.popover.noLatest")}
        </span>
      </div>

      {/* 下载进度条（仅更新中且有进度数据时显示）*/}
      {isUpdating && downloadPercent >= 0 && (
        <Progress
          size="sm"
          value={downloadPercent}
          color="warning"
          label={`${downloadPercent}%`}
          classNames={{ label: "text-xs text-default-500" }}
          showValueLabel
        />
      )}

      {/* 状态 Alert — 有更新/待更新 */}
      {isHasUpdate && !isUpdating && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/8 p-3 dark:border-warning/25 dark:bg-warning/10">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/15 dark:bg-warning/20">
            <Icon icon="material-symbols-light:deployed-code-update" className="text-warning-600 dark:text-warning" width={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-warning-700 dark:text-warning-400">
              {t("update.popover.updateAvailable")}
            </span>
            <span className="text-xs text-default-500">{latestVersion}</span>
          </div>
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/8 p-3 dark:border-success/25 dark:bg-success/10">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 dark:bg-success/20">
            <Icon icon="solar:check-circle-bold" className="text-success-600 dark:text-success" width={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-success-700 dark:text-success-400">
              {t("update.popover.updateComplete")}
            </span>
            <span className="text-xs text-default-500">
              {t("update.popover.restartHint")}
            </span>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col gap-1 rounded-lg border border-danger/30 bg-danger/8 p-3 text-xs text-danger-700 dark:border-danger/25 dark:bg-danger/10 dark:text-danger-400">
          <span className="font-semibold">{t("update.popover.error")}</span>
          <span className="break-all">{errorMsg}</span>
        </div>
      )}

      {/* 主按钮 */}
      {(state === "has-update" || state === "updating" || state === "error") && (
        <Button
          color="primary"
          isLoading={state === "updating"}
          isDisabled={state === "updating"}
          onPress={onUpdate}
          startContent={
            state !== "updating" ? <Icon icon="solar:download-bold" width={18} /> : null
          }
          className="w-full font-semibold"
          size="md"
        >
          {state === "updating"
            ? t("update.popover.updating")
            : t("update.popover.updateNow")}
        </Button>
      )}

      {state === "update-complete" && (
        <Button
          color="success"
          onPress={onRestart}
          startContent={<Icon icon="solar:refresh-bold" width={18} />}
          className="w-full font-semibold text-white"
          size="md"
        >
          {t("update.popover.restartNow")}
        </Button>
      )}

      {state === "restarting" && (
        <Button
          color="success"
          isDisabled
          startContent={<Spinner size="sm" color="default" />}
          className="w-full font-semibold text-white"
          size="md"
        >
          {t("update.popover.restarting", { seconds: countdown })}
        </Button>
      )}

      {/* 查看更新日志 */}
      {(state === "has-update" || state === "updating") && releaseUrl && (
        <a
          href={releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-xs text-default-500 hover:text-default-700"
        >
          {t("update.popover.releaseNotes")}
          <Icon icon="lucide:external-link" width={12} />
        </a>
      )}
    </div>
  );
}
