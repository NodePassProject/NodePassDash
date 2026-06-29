import { NavbarItem, Link } from "@heroui/react";
import { Icon } from "@iconify/react/dist/offline";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import {
  isNavigationItemActive,
  useNavigationItems,
} from "@/components/layout/navigation-items";

/**
 * 导航栏菜单组件 - 桌面端
 */
interface NavbarMenuProps {
  variant?: "normal" | "radio-center" | "basic-header";
}

export const NavbarMenu = ({ variant = "normal" }: NavbarMenuProps) => {
  const { pathname } = useLocation();
  const navigationItems = useNavigationItems();
  const isRadioCenter = variant === "radio-center";
  const isBasicHeader = variant === "basic-header";

  return (
    <>
      {navigationItems.map((item) => (
        <NavbarItem
          key={item.href}
          isActive={isNavigationItemActive(pathname, item.href)}
        >
          <Link
            className={cn(
              "flex items-center gap-1 transition-all duration-200",
              isRadioCenter
                ? "rounded-full px-3 py-1.5 text-sm"
                : isBasicHeader
                  ? "rounded-full px-3 py-1.5 text-sm"
                  : "rounded-lg px-3 py-2",
              isNavigationItemActive(pathname, item.href) &&
                (isRadioCenter
                  ? "bg-foreground text-background shadow-small"
                  : isBasicHeader
                    ? "font-semibold text-primary"
                    : "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30"),
              !isNavigationItemActive(pathname, item.href) &&
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
