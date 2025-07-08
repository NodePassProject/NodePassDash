"use client";

import {
  NavbarItem
} from "@heroui/react";
import { Icon } from "@iconify/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 导航菜单配置
 */
const navigationItems = [
  {
    href: "/dashboard",
    label: "仪表盘",
    // icon: "dashicons:dashboard",
    icon: "solar:chart-2-bold",
  },
  {
    href: "/tunnels",
    label: "实例管理", 
    icon: "solar:transmission-bold",
  },
  {
    href: "/groups",
    label: "分组场景",
    icon: "solar:layers-bold",
  },
  {
    href: "/endpoints",
    label: "主控管理",
    icon: "solar:server-2-bold",
  },
  {
    href: "/settings",
    label: "系统设置",
    icon: "solar:settings-bold",
  },
];

/**
 * 导航栏菜单组件 - 桌面端
 */
export const NavbarMenu = () => {
  const pathname = usePathname();

  /**
   * 判断某个导航项是否处于激活状态
   * 规则：
   *  1. 去掉 pathname 尾部的斜杠再比较
   *  2. 允许子路径，例如 `/dashboard/xxx` 仍视为 `/dashboard` 激活
   */
  const isActive = (href: string) => {
    // 根路径特殊处理
    if (href === '/') {
      return pathname === '/' || pathname === '/index' || pathname === '/index/';
    }
    const normalized = pathname.replace(/\/+$/, '');
    return normalized === href || normalized.startsWith(href + '/');
  };

  return (
    <>
      {navigationItems.map((item) => (
        <NavbarItem key={item.href} isActive={isActive(item.href)}>
          <NextLink
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200",
              isActive(item.href) 
                ? "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30" 
                : "text-default-600"
            )}
            href={item.href}
          >
            <Icon icon={item.icon} width={18} />
            {item.label}
          </NextLink>
        </NavbarItem>
      ))}
    </>
  );
}; 