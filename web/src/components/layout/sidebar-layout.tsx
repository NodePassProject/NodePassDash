"use client";

import { ReactNode, useState } from "react";
import {
  Button,
  Chip,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Footer } from "./footer";
import { NodePassLogo } from "./navbar-logo";
import { SettingsDrawer } from "./settings-drawer";

import { useAuth } from "@/components/auth/auth-provider";
import { Navbar } from "@/components/navbar";
import { fontSans } from "@/config/fonts";
import { getVersion } from "@/lib/version";
import { cn } from "@/lib/utils";
import {
  isNavigationItemActive,
  useNavigationItems,
} from "@/components/layout/navigation-items";

interface SidebarLayoutProps {
  children: ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const { t } = useTranslation("common");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigationItems = useNavigationItems();
  const {
    isOpen: isLogoutOpen,
    onOpen: onLogoutOpen,
    onOpenChange: onLogoutOpenChange,
  } = useDisclosure();
  const version = getVersion();
  const badgeProps = import.meta.env.DEV
    ? { content: "dev", color: "default" as const }
    : version.includes("beta")
      ? { content: "beta", color: "primary" as const }
      : null;
  const sidebarWidthClass = isCollapsed ? "w-[83px]" : "w-72";

  const handleConfirmLogout = async () => {
    await logout();
    onLogoutOpenChange();
  };

  return (
    <div className="relative min-h-screen bg-background lg:flex">
      <div className="lg:hidden">
        <Navbar />
      </div>

      <aside
        className={cn(
          "hidden h-screen shrink-0 border-r border-divider/60 bg-default-50/80 p-6 backdrop-blur-md transition-[width] duration-250 dark:bg-default-100/30 lg:sticky lg:top-0 lg:flex lg:flex-col",
          isCollapsed && "items-center px-[6px]",
          sidebarWidthClass,
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 pl-2",
            isCollapsed && "justify-center gap-0 pl-0",
          )}
        >
          <Link
            className={cn(
              "flex items-center justify-start",
              isCollapsed && "justify-center",
            )}
            href="/"
          >
            <NodePassLogo />
            <p
              className={cn(
                "pl-1 font-bold text-foreground",
                isCollapsed && "hidden",
                fontSans.className,
              )}
            >
              NodePassDash
            </p>
            {badgeProps && !isCollapsed && (
              <Chip
                className="ml-1 h-5 p-0"
                color={badgeProps.color}
                size="sm"
                variant="flat"
              >
                {badgeProps.content}
              </Chip>
            )}
          </Link>

          {!isCollapsed && (
            <button
              aria-label="收缩侧边栏"
              className="ml-auto flex text-default-500 transition-colors hover:text-foreground"
              type="button"
              onClick={() => setIsCollapsed(true)}
            >
              <Icon
                className="[&>g]:stroke-[1px]"
                icon="solar:round-alt-arrow-left-line-duotone"
                width={24}
              />
            </button>
          )}
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {navigationItems.map((item) => {
            const isActive = isNavigationItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-200",
                  isCollapsed && "w-11 gap-0 justify-center p-0",
                  isActive
                    ? "bg-foreground text-background shadow-small"
                    : "text-default-600 hover:bg-background hover:text-foreground",
                )}
                href={item.href}
              >
                <Icon
                  className="shrink-0"
                  icon={item.icon}
                  width={isCollapsed ? 24 : 20}
                />
                <span className={cn(isCollapsed && "hidden")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          className={cn("mt-auto flex flex-col", isCollapsed && "items-center")}
        >
          {isCollapsed && (
            <Button
              isIconOnly
              aria-label="展开侧边栏"
              className="flex h-11 w-11 text-default-600"
              size="sm"
              variant="light"
              onPress={() => setIsCollapsed(false)}
            >
              <Icon
                className="[&>g]:stroke-[1px]"
                icon="solar:round-alt-arrow-right-line-duotone"
                width={24}
              />
            </Button>
          )}
          <div className="flex w-full flex-col gap-1">
            {[
              {
                key: "github",
                label: "GitHub",
                icon: "mdi:github",
                href: "https://github.com/NodePassProject/NodePassDash",
              },
              {
                key: "telegram",
                label: "Telegram",
                icon: "mdi:telegram",
                href: "https://t.me/nodepass_offcial_group",
              },
            ].map((item) => (
              <Tooltip
                key={item.key}
                content={item.label}
                isDisabled={!isCollapsed}
                placement="right"
              >
                <Button
                  as="a"
                  className={cn(
                    "justify-start truncate text-default-600 hover:text-primary",
                    isCollapsed && "h-11 w-11 justify-center px-0",
                  )}
                  fullWidth={!isCollapsed}
                  href={item.href}
                  isIconOnly={isCollapsed}
                  radius="lg"
                  rel="noopener noreferrer"
                  target="_blank"
                  variant="light"
                >
                  <Icon icon={item.icon} width={isCollapsed ? 24 : 22} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Button>
              </Tooltip>
            ))}

            <Tooltip
              content={t("nav.appearanceSettings")}
              isDisabled={!isCollapsed}
              placement="right"
            >
              <Button
                className={cn(
                  "justify-start truncate text-default-600 hover:text-primary",
                  isCollapsed && "h-11 w-11 justify-center px-0",
                )}
                fullWidth={!isCollapsed}
                isIconOnly={isCollapsed}
                radius="lg"
                variant="light"
                onPress={() => setIsSettingsOpen(true)}
              >
                <Icon
                  icon="solar:pallete-2-bold"
                  width={isCollapsed ? 24 : 22}
                />
                {!isCollapsed && <span>{t("nav.appearanceSettings")}</span>}
              </Button>
            </Tooltip>

            <Tooltip
              content={t("nav.logout")}
              isDisabled={!isCollapsed}
              placement="right"
            >
              <Button
                className={cn(
                  "justify-start truncate text-danger hover:text-danger",
                  isCollapsed && "h-11 w-11 justify-center px-0",
                )}
                color="danger"
                fullWidth={!isCollapsed}
                isIconOnly={isCollapsed}
                radius="lg"
                variant="light"
                onPress={onLogoutOpen}
              >
                <Icon
                  icon="solar:logout-2-bold"
                  width={isCollapsed ? 24 : 22}
                />
                {!isCollapsed && <span>{t("nav.logout")}</span>}
              </Button>
            </Tooltip>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="container mx-auto max-w-[1400px] flex-grow px-6 pt-8">
          {children}
        </main>
        <Footer />
      </div>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <Modal
        isOpen={isLogoutOpen}
        placement="center"
        onOpenChange={onLogoutOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {t("logout.confirmTitle")}
              </ModalHeader>
              <ModalBody>{t("logout.confirmMessage")}</ModalBody>
              <ModalFooter>
                <Button variant="light" onClick={onClose}>
                  {t("action.cancel")}
                </Button>
                <Button color="danger" onClick={handleConfirmLogout}>
                  {t("logout.confirm")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
