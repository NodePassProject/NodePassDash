"use client";

import { ReactNode } from 'react';
import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTheme } from "next-themes";

interface OAuthErrorLayoutProps {
  children: ReactNode;
}

export default function OAuthErrorLayout({ children }: OAuthErrorLayoutProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-background relative">
      {children}
      
      {/* 浮动主题切换按钮 */}
      <Button
        isIconOnly
        variant="flat"
        className="fixed bottom-4 right-4 rounded-full"
        onClick={toggleTheme}
        aria-label="切换主题"
      >
        <Icon 
          icon={theme === 'light' ? "solar:moon-linear" : "solar:sun-2-linear"}
          width={24}
          className="text-foreground"
        />
      </Button>
    </div>
  );
} 