"use client";

import { Button, Dropdown, DropdownMenu, DropdownItem, DropdownTrigger } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useIsSSR } from "@react-aria/ssr";
import { useLanguage } from "@/components/providers/language-provider";

export interface LocaleSwitchProps {
  className?: string;
}

/**
 * 简单的语言切换按钮，目前支持 zh-CN / en 两种语言
 */
export const LocaleSwitch: React.FC<LocaleSwitchProps> = ({ className }) => {
  const { locale, setLocale } = useLanguage();
  const isSSR = useIsSSR();

  const isZh = !isSSR && locale === "zh-CN";

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          isIconOnly
          variant="light"
          size="md"
          aria-label="切换语言"
          className={`text-default-600 hover:text-primary ${className}`}
        >
          <Icon icon="mdi:language" width={20} />
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="选择语言"
        selectionMode="single"
        selectedKeys={[locale]}
      >
        <DropdownItem
          key="zh-CN"
          onPress={() => {
            if (locale !== "zh-CN") setLocale("zh-CN");
          }}
        >
          中文
        </DropdownItem>
        {/* 预留英文选项，可按需启用 */}
        {/* <DropdownItem key="en" onPress={() => setLocale("en")}>English</DropdownItem> */}
      </DropdownMenu>
    </Dropdown>
  );
}; 