'use client';


import { usePathname } from 'next/navigation';

import { AuthProvider } from "./components/auth-provider";
import { RouteGuard } from "./components/route-guard";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login' || pathname === '/login/';

  return (
    <AuthProvider>
      <RouteGuard>
        {isLoginPage ? (
          // 登录页面：简洁布局，无导航栏
          <div className="min-h-screen bg-background">
            {children}
          </div>
        ) : (
          // 其他页面：完整布局，包含导航栏
          <div className="relative flex flex-col h-screen">
            <Navbar />
            <main className="container mx-auto max-w-7xl pt-8 px-6 flex-grow">
              {children}
            </main>
            <Footer />
          </div>
        )}
      </RouteGuard>
    </AuthProvider>
  );
} 