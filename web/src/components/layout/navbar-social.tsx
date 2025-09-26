"use client";

import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";

/**
 * 社交链接配置
 */
const socialLinks = [
  {
    key: "github",
    label: "Github",
    icon: "mdi:github",
    href: "https://github.com/NodePassProject/NodePassDash",
    target: "_blank",
  },
  {
    key: "telegram",
    label: "Telegram",
    icon: "mdi:telegram",
    href: "https://t.me/NodePassGroup",
    target: "_blank",
  },
];

/**
 * 导航栏社交链接组件
 * 包含Github和Telegram按钮
 */
export const NavbarSocial = () => {
  return (
    <>
      {socialLinks.map((link) => (
        <Button
          key={link.key}
          isIconOnly
          aria-label={link.label}
          as="a"
          className="text-default-600 hover:border-primary hover:text-primary"
          href={link.href}
          rel="noopener noreferrer"
          size="md"
          target={link.target}
          variant="light"
        >
          <Icon icon={link.icon} width={23} />
        </Button>
      ))}
    </>
  );
};
