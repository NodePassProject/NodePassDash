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
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const newInit: RequestInit = {
        credentials: 'include',
        ...init,
      };
      return originalFetch(input, newInit);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <HeroUIProvider navigate={navigate} useHref={useHref}>
      <ToastProvider 
        placement="top-center"
        toastOffset={80}
        maxVisibleToasts={1}
        // toastProps={{ timeout: 1000 }}
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
