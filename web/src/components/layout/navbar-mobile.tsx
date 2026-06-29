import { NavbarMenuItem, Link } from "@heroui/react";
import { Icon } from "@iconify/react/dist/offline";
import { useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";
import {
  isNavigationItemActive,
  useNavigationItems,
} from "@/components/layout/navigation-items";

interface NavbarMobileProps {
  onSelect?: () => void;
}

export function NavbarMobileMenu({ onSelect }: NavbarMobileProps) {
  const { pathname } = useLocation();
  const navigationItems = useNavigationItems();

  return (
    <>
      {navigationItems.map((item, index) => (
        <NavbarMenuItem key={`${item.href}-${index}`}>
          <Link
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200",
              isNavigationItemActive(pathname, item.href)
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
