"use client";

import {
  HeroUIProvider
} from "@heroui/react";
import type { ThemeProviderProps } from "next-themes";

import * as React from "react";

import { ToastProvider } from "@heroui/toast";
import { useRouter } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

declare module "@react-types/shared" {
  interface RouterConfig {
    routerOptions: NonNullable<
      Parameters<ReturnType<typeof useRouter>["push"]>[1]
    >;
  }
}

export function Providers({ children, themeProps }: ProvidersProps) {
  const router = useRouter();

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
    <HeroUIProvider navigate={router.push}>
      <LanguageProvider>
        <NextThemesProvider {...themeProps}>
          <ToastProvider 
            placement="top-center" 
            toastOffset={80}
            maxVisibleToasts={1}
            toastProps={{ timeout: 1000 }}
          />
          {children}
        </NextThemesProvider>
      </LanguageProvider>
    </HeroUIProvider>
  );
}
