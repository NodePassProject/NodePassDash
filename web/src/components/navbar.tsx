"use client";

import {
  Navbar as HeroUINavbar,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuToggle,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useState } from "react";

import { NavbarLogo } from "./layout/navbar-logo";
import { NavbarMenu as DesktopNavbarMenu } from "./layout/navbar-menu";
import { NavbarSocial } from "./layout/navbar-social";
import { NavbarActions } from "./layout/navbar-actions";
import { NavbarMobileMenu } from "./layout/navbar-mobile";
import { SettingsButton } from "./layout/settings-button";

import { useSettings } from "@/components/providers/settings-provider";
import { cn } from "@/lib/utils";

/**
 * 主导航栏组件
 */
export const Navbar = () => {
  // 控制移动端菜单打开状态
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { settings } = useSettings();
  const isRadioCenter = settings.navbarStyle === "radio-center";
  const isBasicHeader = settings.navbarStyle === "basic-header";
  const isFloatingStyle = isRadioCenter || isBasicHeader;

  return (
    <HeroUINavbar
      classNames={{
        base: cn(
          isFloatingStyle && "bg-transparent shadow-none backdrop-filter-none",
          isRadioCenter && "pt-4 pb-2",
          isBasicHeader && "py-2 lg:bg-transparent",
        ),
        wrapper: cn(
          "max-w-[1400px] px-4 sm:px-6",
          isRadioCenter && "h-auto justify-center px-4 bg-transparent",
          isBasicHeader &&
            "grid grid-cols-[auto_1fr] gap-3 bg-transparent lg:grid-cols-[1fr_auto_1fr]",
        ),
      }}
      height={isBasicHeader ? "60px" : undefined}
      isBordered={!isFloatingStyle}
      isMenuOpen={isMenuOpen}
      maxWidth="full"
      onMenuOpenChange={setIsMenuOpen}
    >
      {isRadioCenter ? (
        <NavbarContent
          className={cn(
            "w-full justify-between gap-3 rounded-full border border-default-200/60 bg-background/70 px-3 py-2 shadow-medium backdrop-blur-md backdrop-saturate-150",
            "dark:border-default-100/30 dark:bg-default-100/50",
            "lg:w-auto lg:justify-center lg:gap-4",
          )}
          justify="center"
        >
          <NavbarMenuToggle
            className="lg:hidden"
            icon={
              isMenuOpen ? (
                <Icon height={24} icon="lucide:x" width={24} />
              ) : (
                <Icon height={24} icon="lucide:menu" width={24} />
              )
            }
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          />
          <NavbarLogo />
          <div className="hidden items-center gap-1 lg:flex">
            <DesktopNavbarMenu variant="radio-center" />
          </div>
          <NavbarItem className="hidden items-center gap-1 sm:flex">
            <NavbarSocial />
            <SettingsButton />
            <NavbarActions />
          </NavbarItem>
          <NavbarItem className="flex items-center gap-1 sm:hidden">
            <SettingsButton />
            <NavbarActions />
          </NavbarItem>
        </NavbarContent>
      ) : isBasicHeader ? (
        <>
          <NavbarContent className="min-w-0 max-w-fit gap-2" justify="start">
            <NavbarMenuToggle
              className="lg:hidden"
              icon={
                isMenuOpen ? (
                  <Icon height={24} icon="lucide:x" width={24} />
                ) : (
                  <Icon height={24} icon="lucide:menu" width={24} />
                )
              }
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            />
            <NavbarLogo />
          </NavbarContent>

          <NavbarContent
            className={cn(
              "hidden h-12 w-full max-w-fit justify-self-center gap-2 rounded-full bg-content2 px-3 shadow-small dark:bg-content1 lg:flex",
            )}
            justify="center"
          >
            <DesktopNavbarMenu variant="basic-header" />
          </NavbarContent>

          <NavbarContent
            className={cn(
              "ml-auto flex h-12 max-w-fit items-center gap-0 justify-self-end rounded-full p-0",
              "lg:bg-content2 lg:px-1 lg:shadow-small lg:dark:bg-content1",
            )}
            justify="end"
          >
            <NavbarItem className="hidden items-center gap-0 sm:flex">
              <NavbarSocial />
              <SettingsButton />
              <NavbarActions />
            </NavbarItem>
            <NavbarItem className="flex items-center gap-0 sm:hidden">
              <SettingsButton />
              <NavbarActions />
            </NavbarItem>
          </NavbarContent>
        </>
      ) : (
        <>
          {/* 左侧内容 - 移动端汉堡菜单 + Logo */}
          <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
            {/* 移动端汉堡菜单 - 在lg断点以下显示，包括平板 */}
            <NavbarMenuToggle
              className="lg:hidden"
              icon={
                isMenuOpen ? (
                  <Icon height={24} icon="lucide:x" width={24} />
                ) : (
                  <Icon height={24} icon="lucide:menu" width={24} />
                )
              }
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            />
            <NavbarLogo />
          </NavbarContent>

          {/* 中间导航菜单 - 桌面端 */}
          <NavbarContent
            className="hidden lg:flex basis-1/5 sm:basis-full"
            justify="center"
          >
            <DesktopNavbarMenu />
          </NavbarContent>

          {/* 右侧工具栏 - 桌面端 */}
          <NavbarContent
            className="hidden sm:flex basis-1/5 sm:basis-full"
            justify="end"
          >
            <NavbarItem className="hidden sm:flex items-center gap-1">
              {/* 社交链接 */}
              <NavbarSocial />

              {/* 个性化设置按钮 */}
              <SettingsButton />

              {/* 退出登录图标按钮 */}
              <NavbarActions />
            </NavbarItem>
          </NavbarContent>

          {/* 右侧工具栏 - 移动端 */}
          <NavbarContent className="sm:hidden basis-1 pl-4" justify="end">
            <SettingsButton />
            <NavbarActions />
          </NavbarContent>
        </>
      )}

      {/* 移动端展开菜单 */}
      <NavbarMenu
        className={cn(
          isRadioCenter &&
            "top-[calc(var(--navbar-height)+16px)] mx-auto mt-3 max-h-[50vh] max-w-[90vw] rounded-2xl border border-default-200/60 bg-background/80 py-6 shadow-medium backdrop-blur-md backdrop-saturate-150 dark:border-default-100/30 dark:bg-default-100/60",
          isBasicHeader &&
            "top-[calc(var(--navbar-height)+8px)] mx-auto mt-2 max-h-[52vh] max-w-[92vw] rounded-2xl border border-default-200/60 bg-background/90 py-6 shadow-medium backdrop-blur-md backdrop-saturate-150 dark:border-default-100/30 dark:bg-default-100/70",
        )}
      >
        <NavbarMobileMenu onSelect={() => setIsMenuOpen(false)} />
      </NavbarMenu>
    </HeroUINavbar>
  );
};
