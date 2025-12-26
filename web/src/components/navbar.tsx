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

import { ThemeSwitch } from "@/components/theme-switch";

/**
 * 主导航栏组件
 */
export const Navbar = () => {
  // 控制移动端菜单打开状态
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <HeroUINavbar
      isBordered
      isMenuOpen={isMenuOpen}
      maxWidth="full"
      classNames={{
        wrapper: "max-w-[1400px]"
      }}
      onMenuOpenChange={setIsMenuOpen}
    >
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

      {/* 移动端展开菜单 */}
      <NavbarMenu>
        <NavbarMobileMenu onSelect={() => setIsMenuOpen(false)} />
      </NavbarMenu>
    </HeroUINavbar>
  );
};
