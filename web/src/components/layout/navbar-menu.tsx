import { NavbarItem, Link } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * 导航菜单配置
 */
const navigationItems = [
  {
    href: "/dashboard",
    label: "仪表盘",
    icon: "solar:chart-2-bold",
  },
  {
    href: "/tunnels",
    label: "实例管理",
    icon: "solar:transmission-bold",
  },
  {
    href: "/services",
    label: "服务管理",
    icon: "solar:widget-2-bold",
  },
  {
    href: "/endpoints",
    label: "主控管理",
    icon: "solar:server-2-bold",
  },
];

/**
 * 导航栏菜单组件 - 桌面端
 */
export const NavbarMenu = () => {
  const { pathname } = useLocation();

  /**
   * 判断某个导航项是否处于激活状态
   * 规则：
   *  1. 去掉 pathname 尾部的斜杠再比较
   *  2. 允许子路径，例如 `/dashboard/xxx` 仍视为 `/dashboard` 激活
   *  3. 根目录 "/" 也匹配 "/dashboard"
   */
  const isActive = (href: string) => {
    const normalized = pathname.replace(/\/+$/, "");

    // dashboard特殊处理：根路径也视为dashboard激活
    if (href === "/dashboard") {
      return (
        normalized === "/" ||
        normalized === "/dashboard" ||
        normalized.startsWith("/dashboard/")
      );
    }

    // 其他路径的正常匹配
    return normalized === href || normalized.startsWith(href + "/");
  };

  return (
    <>
      {navigationItems.map((item) => (
        <NavbarItem key={item.href} isActive={isActive(item.href)}>
          <Link
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg transition-all duration-200",
              isActive(item.href)
                ? "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30"
                : "text-default-600",
            )}
            href={item.href}
          >
            <Icon icon={item.icon} width={18} />
            {item.label}
          </Link>
        </NavbarItem>
      ))}
    </>
  );
};
