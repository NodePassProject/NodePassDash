import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react/dist/offline";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/components/providers/settings-provider";
import { buildApiUrl } from "@/lib/utils";

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

const COUNTDOWN_SECONDS = 15;
const LAST_CHECK_KEY = "nodepass-last-update-check";

// ─── Mock mode (visual QA) ──────────────────────────────────────────
// 在 URL 上加 ?mock-update=has-update | update-complete | restarting
// 可在不触发后端的情况下预览 chip + popover 各状态。
// 例如:http://localhost:3000/dashboard?mock-update=has-update
function readMockState(): UpdateState | null {
  if (typeof window === "undefined") return null;
  const sp = new URLSearchParams(window.location.search);
  const v = sp.get("mock-update");
  if (!v) return null;
  if (
    v === "has-update" ||
    v === "updating" ||
    v === "update-complete" ||
    v === "restarting" ||
    v === "error"
  ) {
    return v as UpdateState;
  }
  return null;
}

const MOCK_CURRENT = "v0.1.119";
const MOCK_LATEST = "v0.1.121";

export function UpdateChip() {
  const { t } = useTranslation("settings");
  const { settings } = useSettings();

  const mockState = useMemo(() => readMockState(), []);
  const isMock = mockState !== null;

  const [currentVersion, setCurrentVersion] = useState<string>(
    isMock ? MOCK_CURRENT : "",
  );
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(
    isMock
      ? {
          current: { current: MOCK_CURRENT, os: "linux", arch: "amd64" },
          stable: {
            tag_name: MOCK_LATEST,
            name: MOCK_LATEST,
            body: "",
            published_at: new Date().toISOString(),
            html_url: "https://github.com/NodePassProject/NodePassDash/releases/latest",
            prerelease: false,
            draft: false,
          },
          hasStableUpdate: true,
          hasBetaUpdate: false,
        }
      : null,
  );
  const [state, setState] = useState<UpdateState>(mockState ?? "idle");
  const [errorMsg, setErrorMsg] = useState<string>(
    isMock && mockState === "error" ? "模拟错误信息" : "",
  );
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [popoverOpen, setPopoverOpen] = useState(isMock);
  const [checking, setChecking] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (isMock) {
        setChecking(true);
        setTimeout(() => setChecking(false), 700); // 仅做 loading 动画演示
        return;
      }
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
            localStorage.setItem(LAST_CHECK_KEY, new Date().toDateString());
          }
        }
      } finally {
        setChecking(false);
      }
    },
    [fetchCurrent, fetchUpdateInfo],
  );

  // 初次加载:总是请求当前版本(发现 restartPending 时立刻进入完成状态);
  // 如开启自动检查 + 当天未检查,顺便拉一次远端
  useEffect(() => {
    if (isMock) return; // mock 模式跳过真实请求
    let cancelled = false;
    (async () => {
      const cur = await fetchCurrent();
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
      }
      if (!settings.autoCheckUpdates) return;
      const today = new Date().toDateString();
      if (localStorage.getItem(LAST_CHECK_KEY) === today) return;
      const info = await fetchUpdateInfo();
      if (cancelled || !info) return;
      setUpdateInfo(info);
      setState(info.hasStableUpdate || info.hasBetaUpdate ? "has-update" : "idle");
      localStorage.setItem(LAST_CHECK_KEY, today);
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

  const handleUpdate = async () => {
    setState("updating");
    setErrorMsg("");
    if (isMock) {
      // 模拟 2s 下载/替换,然后进入"待重启"状态
      setTimeout(() => setState("update-complete"), 2000);
      return;
    }
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
        return;
      }
      // 后端是异步执行;轮询 /current 等到 restartPending=true
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const cur = await fetchCurrent();
        if (cur?.restartPending) {
          setState("update-complete");
          return;
        }
      }
      setErrorMsg(t("update.timeout"));
      setState("error");
    } catch (e: any) {
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
    if (isMock) {
      // 倒计时归零后,mock 模式回到 has-update 让你重新试
      setTimeout(() => setState("has-update"), 1500);
      return;
    }
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
    },
    [],
  );

  // mock=restarting 时自动启动倒计时,方便预览
  useEffect(() => {
    if (isMock && mockState === "restarting") {
      startCountdown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <PopoverContent className="p-0 w-[280px]">
        <UpdatePanel
          state={state}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          releaseUrl={releaseUrl}
          errorMsg={errorMsg}
          countdown={countdown}
          checking={checking}
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
  onRefresh,
  onUpdate,
  onRestart,
  t,
}: UpdatePanelProps) {
  const isHasUpdate = state === "has-update" || state === "updating" || state === "error";
  const isComplete = state === "update-complete" || state === "restarting";

  return (
    <div className="flex flex-col gap-4 p-4 w-full">
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

      {/* 状态 Alert */}
      {isHasUpdate && (
        <div className="flex items-center gap-3 rounded-lg border border-warning-200 bg-warning-50 p-3 dark:border-warning-700 dark:bg-warning-900/30">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-100 dark:bg-warning-800/50">
            <Icon icon="material-symbols-light:deployed-code-update" className="text-warning" width={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-warning-700 dark:text-warning-300">
              {t("update.popover.updateAvailable")}
            </span>
            <span className="text-xs text-default-500">{latestVersion}</span>
          </div>
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-3 rounded-lg border border-success-200 bg-success-50 p-3 dark:border-success-700 dark:bg-success-900/30">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-100 dark:bg-success-800/50">
            <Icon icon="solar:check-circle-bold" className="text-success" width={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-success-700 dark:text-success-300">
              {t("update.popover.updateComplete")}
            </span>
            <span className="text-xs text-default-500">
              {t("update.popover.restartHint")}
            </span>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col gap-1 rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700 dark:border-danger-700 dark:bg-danger-900/30 dark:text-danger-300">
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
