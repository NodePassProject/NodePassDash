import type { NavigateOptions } from "react-router-dom";

import { HeroUIProvider } from "@heroui/system";
import { ToastProvider } from "@heroui/toast";
import { useHref, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "./components/auth/auth-provider";
import { RouteGuard } from "./components/auth/route-guard";
import { SettingsProvider } from "./components/providers/settings-provider";

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  // 全局 fetch 补丁：默认添加 credentials:'include'，确保跨端口请求携带 Cookie
  // 使用单例模式避免重复补丁导致的内存泄漏
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 检查是否已经应用了补丁，避免重复设置
    if ((window as any)._fetchPatched) {
      return;
    }

    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const newInit: RequestInit = {
        credentials: 'include',
        ...init,
      };
      return originalFetch(input, newInit);
    };

    // 标记已应用补丁
    (window as any)._fetchPatched = true;
    (window as any)._originalFetch = originalFetch;

    return () => {
      // 清理时恢复原始 fetch 并清除标记
      if ((window as any)._fetchPatched && (window as any)._originalFetch) {
        window.fetch = (window as any)._originalFetch;
        (window as any)._fetchPatched = false;
        delete (window as any)._originalFetch;
      }
    };
  }, []); // 空依赖数组确保只执行一次

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref}>
      <ToastProvider 
        placement="top-center"
        toastOffset={80}
        maxVisibleToasts={1}
      />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        themes={['light', 'dark', 'system']}
      >
        <SettingsProvider>
          <AuthProvider>
            <RouteGuard>
              {children}
            </RouteGuard>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </HeroUIProvider>
  );
}
