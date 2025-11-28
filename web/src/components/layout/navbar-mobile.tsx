import { NavbarMenuItem, Link } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface NavbarMobileProps {
  onSelect?: () => void;
}

export function NavbarMobileMenu({ onSelect }: NavbarMobileProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation("common");

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
