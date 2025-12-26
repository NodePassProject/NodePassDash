import { ReactNode, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "./auth-provider";

interface RouteGuardProps {
  children: ReactNode;
}

// 公开路由列表（不需要身份验证）
const RAW_PUBLIC_ROUTES = ["/login", "/oauth-error", "/oauth-success", "/setup-guide"];

/**
 * 规范化路径，去除末尾斜杠（根路径 `/` 除外）
 */
function normalizePath(path: string): string {
  if (path === "/") return path;

  return path.replace(/\/+$/, "");
}

const PUBLIC_ROUTES = RAW_PUBLIC_ROUTES.map(normalizePath);

export function RouteGuard({ children }: RouteGuardProps) {
  const { t } = useTranslation("auth");
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log("🛡️ RouteGuard 状态变化", {
      user: user ? `已登录(${user.username})` : "未登录",
      loading,
      pathname: location.pathname,
      timestamp: new Date().toISOString(),
    });

    // 清除之前的导航超时
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    if (!loading) {
      const isPublicRoute = PUBLIC_ROUTES.includes(
        normalizePath(location.pathname),
      );
      const isSetupGuide = normalizePath(location.pathname) === "/setup-guide";

      console.log("🛡️ RouteGuard 路由检查", {
        pathname: location.pathname,
        isPublicRoute,
        hasUser: !!user,
        user: user,
        needsSetup: user ? (user as any).needsSetup : "no user",
        isSetupGuide,
        action:
          !user && !isPublicRoute
            ? "重定向到登录页"
            : user && isPublicRoute && !isSetupGuide
              ? "重定向到仪表盘"
              : "无需重定向",
      });

      // 添加小延迟，避免与其他导航操作冲突
      navigationTimeoutRef.current = setTimeout(() => {
        if (!user && !isPublicRoute) {
          // 用户未登录且访问私有路由，重定向到登录页
          console.log("🔒 执行重定向：用户未登录，前往登录页");
          navigate("/login", { replace: true });
        } else if (user && isPublicRoute && !isSetupGuide) {
          // 用户已登录但访问公开路由（如登录页），重定向到仪表盘
          // 但是允许已登录用户访问引导页面
          console.log("👤 执行重定向：用户已登录，前往仪表盘");
          navigate("/dashboard", { replace: true });
        }
      }, 150); // 增加延迟时间，确保登录跳转有足够时间完成
    }

    // 清理函数
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [user, loading, location.pathname, navigate]);

  // 显示加载状态
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-8 h-8 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
          </div>
          <p className="text-default-500">{t("loading.verifying")}</p>
        </div>
      </div>
    );
  }

  // 检查是否应该显示内容
  const isPublicRoute = PUBLIC_ROUTES.includes(
    normalizePath(location.pathname),
  );
  const isSetupGuide = normalizePath(location.pathname) === "/setup-guide";
  const shouldShowContent =
    (user && !isPublicRoute) ||
    (!user && isPublicRoute) ||
    (user && isSetupGuide);

  if (!shouldShowContent) {
    // 正在重定向中，显示加载状态
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-8 h-8 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-default-200 border-t-primary animate-spin" />
          </div>
          <p className="text-default-500">{t("loading.redirecting")}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
