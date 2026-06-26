import { NavbarItem, Link } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * 导航栏菜单组件 - 桌面端
 */
interface NavbarMenuProps {
  variant?: "normal" | "radio-center" | "basic-header";
}

export const NavbarMenu = ({ variant = "normal" }: NavbarMenuProps) => {
  const { pathname } = useLocation();
  const { t } = useTranslation("common");
  const isRadioCenter = variant === "radio-center";
  const isBasicHeader = variant === "basic-header";

  /**
   * 导航菜单配置
   */
  const navigationItems = [
    {
      href: "/dashboard",
      label: t("nav.dashboard"),
      icon: "solar:chart-2-bold",
    },
    {
      href: "/services",
      label: t("nav.servicesManage"),
      icon: "solar:widget-2-bold",
    },
    {
      href: "/tunnels",
      label: t("nav.tunnelsManage"),
      icon: "solar:transmission-bold",
    },
    {
      href: "/endpoints",
      label: t("nav.endpointsManage"),
      icon: "solar:server-2-bold",
    },
  ];

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
              "flex items-center gap-1 transition-all duration-200",
              isRadioCenter
                ? "rounded-full px-3 py-1.5 text-sm"
                : isBasicHeader
                  ? "rounded-full px-3 py-1.5 text-sm"
                  : "rounded-lg px-3 py-2",
              isActive(item.href) &&
                (isRadioCenter
                  ? "bg-foreground text-background shadow-small"
                  : isBasicHeader
                    ? "font-semibold text-primary"
                    : "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30"),
              !isActive(item.href) &&
                (isRadioCenter
                  ? "text-default-500 hover:bg-default-100 hover:text-foreground dark:hover:bg-default-200/20"
                  : isBasicHeader
                    ? "text-default-600 hover:bg-background/70 hover:text-foreground"
                    : "text-default-600"),
            )}
            href={item.href}
          >
            <Icon
              icon={item.icon}
              width={isRadioCenter || isBasicHeader ? 16 : 18}
            />
            {item.label}
          </Link>
        </NavbarItem>
      ))}
    </>
  );
};
