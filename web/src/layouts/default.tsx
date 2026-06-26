import { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/layout/footer";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useSettings } from "@/components/providers/settings-provider";

interface DefaultLayoutProps {
  children: ReactNode;
}

export default function DefaultLayout({ children }: DefaultLayoutProps) {
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const normalized = pathname.replace(/\/$/, "");
  const isSimpleLayout =
    normalized === "/login" ||
    normalized === "/oauth-error" ||
    normalized === "/oauth-success" ||
    normalized === "/setup-guide" ||
    normalized === "/setup";

  if (isSimpleLayout) {
    return (
      // 登录页面和错误页面：简洁布局，无导航栏
      <div className="min-h-screen bg-background">{children}</div>
    );
  }

  if (settings.navbarStyle === "settings-layout") {
    return <SidebarLayout>{children}</SidebarLayout>;
  }

  return (
    // 其他页面：完整布局，包含导航栏
    <div className="relative flex flex-col h-screen">
      <Navbar />
      <main className="container mx-auto max-w-[1400px] pt-8 px-6 flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
}
