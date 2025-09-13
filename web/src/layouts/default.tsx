import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/layout/footer';

interface DefaultLayoutProps {
  children: ReactNode;
}

export default function DefaultLayout({ children }: DefaultLayoutProps) {
  const { pathname } = useLocation();
  const isSimpleLayout = pathname.replace(/\/$/, '') === '/login' || pathname.replace(/\/$/, '') === '/oauth-error' || pathname.replace(/\/$/, '') === '/setup-guide';

  return isSimpleLayout ? (
    // 登录页面和错误页面：简洁布局，无导航栏
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
  );
}
