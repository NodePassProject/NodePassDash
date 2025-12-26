import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/components/providers/settings-provider";
import type { SupportedLanguage } from "@/lib/i18n";

export interface LanguageSwitchProps {
  className?: string;
  showLabel?: boolean; // 是否显示语言文本
}

const languageConfig = {
  "zh-CN": {
    label: "简体中文",
    shortLabel: "中文",
    icon: "twemoji:flag-china",
  },
  "en-US": {
    label: "English",
    shortLabel: "EN",
    icon: "twemoji:flag-united-states",
  },
} as const;

export const LanguageSwitch: React.FC<LanguageSwitchProps> = ({
  className,
  showLabel = false,
}) => {
  const { settings, updateLanguage } = useSettings();
  const { t } = useTranslation("common");
  const currentLanguage = settings.language;

  const handleLanguageChange = (key: string | number) => {
    updateLanguage(key as SupportedLanguage);
  };

  // 添加防御性检查，如果 currentLanguage 不在配置中，使用默认语言
  const currentLangConfig = languageConfig[currentLanguage] || languageConfig["zh-CN"];

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
            isIconOnly
          aria-label={t("language.switch")}
          className={`text-default-600 hover:text-primary bg-default-100/50 hover:bg-default-200/50 backdrop-blur-sm ${className}`}
          size="sm"
            radius="full"
          startContent={
            <Icon icon={currentLangConfig.icon} width={16} />
          }
          variant="light"
        >
          {showLabel ? currentLangConfig.shortLabel : null}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={t("language.select")}
        selectedKeys={[currentLanguage]}
        selectionMode="single"
        onAction={handleLanguageChange}
      >
        <DropdownItem
          key="zh-CN"
          startContent={
            <Icon icon={languageConfig["zh-CN"].icon} width={16} />
          }
        >
          {languageConfig["zh-CN"].label}
        </DropdownItem>
        <DropdownItem
          key="en-US"
          startContent={
            <Icon icon={languageConfig["en-US"].icon} width={16} />
          }
        >
          {languageConfig["en-US"].label}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};
