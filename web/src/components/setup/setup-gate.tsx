import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchSetupStatus } from "@/lib/api/setup";

type Phase = "checking" | "ok" | "needs-setup" | "error";

interface Props {
  children: ReactNode;
}

/**
 * SetupGate 在 App 渲染之前探测后端 setup 状态。
 *
 * - 探测期: 渲染轻量加载指示
 * - 后端返回 setup_mode=true: 自动 redirect 到 /setup (除非已经在那里)
 * - 否则: 渲染下游 (AuthProvider / RouteGuard / App)
 * - 探测失败: 显示明确的错误页(过去 fallback 到 "ok" 会让登录页/dashboard
 *   误以为后端正常,实际请求会一片红 — 不如直接告诉用户)
 *
 * 这一层故意放在 AuthProvider 之上,因为 setup 模式下 /api/auth/me
 * 会返回 503,AuthProvider 会一直在异常态。Gate 直接绕开它。
 */
export function SetupGate({ children }: Props) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [errMsg, setErrMsg] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const runCheck = async () => {
    setPhase("checking");
    setErrMsg("");
    try {
      const s = await fetchSetupStatus();
      if (s.setup_mode) {
        setPhase("needs-setup");
        if (location.pathname !== "/setup") {
          navigate("/setup", { replace: true });
        }
      } else {
        setPhase("ok");
        if (location.pathname === "/setup") {
          navigate("/login", { replace: true });
        }
      }
    } catch (e) {
      setPhase("error");
      setErrMsg(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    runCheck();
    // 只在挂载时检测一次。setup 完成靠重启,不需要运行时变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md text-center space-y-4">
          <div className="text-danger text-5xl">⚠️</div>
          <h1 className="text-xl font-semibold">无法连接到后端</h1>
          <p className="text-sm text-default-500 break-all">{errMsg}</p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
            onClick={runCheck}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
