import { NavbarMenuItem, Link } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

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

interface NavbarMobileProps {
  onSelect?: () => void;
}

export function NavbarMobileMenu({ onSelect }: NavbarMobileProps) {
  const { pathname } = useLocation();

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
      {navigationItems.map((item, index) => (
        <NavbarMenuItem key={`${item.href}-${index}`}>
          <Link
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200",
              isActive(item.href)
                ? "text-primary font-semibold bg-primary-100 dark:bg-primary-900/30"
                : "text-default-600",
            )}
            href={item.href}
            onClick={onSelect}
          >
            <Icon icon={item.icon} width={18} />
            {item.label}
          </Link>
        </NavbarMenuItem>
      ))}
    </>
  );
}
