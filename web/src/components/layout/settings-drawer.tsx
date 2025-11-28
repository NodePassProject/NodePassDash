"use client";

import React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Button,
  Switch,
  Card,
  CardBody,
  CardHeader,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Select,
  SelectItem,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/components/providers/settings-provider";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const {
    settings,
    updateTheme,
    updateLanguage,
    togglePrivacyMode,
    toggleExperimentalMode,
    updateSettings,
    toggleAutoCheckUpdates,
    toggleUpdateNotifications,
    toggleSilentDownload,
    handleManualCheck,
  } = useSettings();

  return (
    <Drawer isOpen={isOpen} placement="right" size="md" onClose={onClose}>
      <DrawerContent className="bg-gradient-to-b from-background to-default-50">
        <DrawerHeader className="border-b border-divider/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Icon
                  className="text-primary"
                  icon="lucide:settings"
                  width={20}
                />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("drawer.title")}</h2>
                <p className="text-sm text-default-500">{t("drawer.description")}</p>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="px-6 py-6">
          <div className="space-y-5">
            {/* 主题设置 */}
            <div className="group">
              <Card className="shadow-sm border border-divider/30 hover:border-primary/30 transition-all duration-300 hover:shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Icon
                        className="text-primary"
                        icon="lucide:palette"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {t("drawer.theme.title")}
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        {t("drawer.theme.description")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-default-700">
                      {t("drawer.theme.label")}
                    </span>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          className="bg-default-100 hover:bg-default-200 min-w-32"
                          endContent={
                            <Icon icon="lucide:chevron-down" width={16} />
                          }
                          size="sm"
                          variant="flat"
                        >
                          {settings.theme === "system"
                            ? t("drawer.theme.system")
                            : settings.theme === "dark"
                              ? t("drawer.theme.dark")
                              : t("drawer.theme.light")}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label={t("drawer.theme.label")}
                        selectedKeys={settings.theme ? [settings.theme] : []}
                        selectionMode="single"
                        onAction={(key) => {
                          console.log("Theme selected:", key);
                          if (key) {
                            updateTheme(key as "light" | "dark" | "system");
                          }
                        }}
                      >
                        <DropdownItem
                          key="light"
                          startContent={
                            <Icon icon="solar:sun-bold" width={16} />
                          }
                        >
                          {t("drawer.theme.light")}
                        </DropdownItem>
                        <DropdownItem
                          key="dark"
                          startContent={
                            <Icon icon="solar:moon-bold" width={16} />
                          }
                        >
                          {t("drawer.theme.dark")}
                        </DropdownItem>
                        <DropdownItem
                          key="system"
                          startContent={
                            <Icon icon="lucide:monitor" width={16} />
                          }
                        >
                          {t("drawer.theme.system")}
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* 语言设置 */}
            <div className="group">
              <Card className="shadow-sm border border-divider/30 hover:border-success/30 transition-all duration-300 hover:shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/10 group-hover:bg-success/20 transition-colors">
                      <Icon
                        className="text-success"
                        icon="lucide:languages"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {t("drawer.language.title")}
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        {t("drawer.language.description")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-default-700">
                      {t("drawer.language.label")}
                    </span>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          className="bg-default-100 hover:bg-default-200 min-w-32"
                          endContent={
                            <Icon icon="lucide:chevron-down" width={16} />
                          }
                          size="sm"
                          variant="flat"
                        >
                          {settings.language === "zh-CN" ? tCommon("language.zhCN") : tCommon("language.enUS")}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label={t("drawer.language.label")}
                        selectedKeys={settings.language ? [settings.language] : []}
                        selectionMode="single"
                        onAction={(key) => {
                          console.log("Language selected:", key);
                          if (key) {
                            updateLanguage(key as "zh-CN" | "en-US");
                          }
                        }}
                      >
                        <DropdownItem
                          key="zh-CN"
                          startContent={
                            <Icon icon="circle-flags:cn" width={16} />
                          }
                        >
                          {tCommon("language.zhCN")}
                        </DropdownItem>
                        <DropdownItem
                          key="en-US"
                          startContent={
                            <Icon icon="circle-flags:us" width={16} />
                          }
                        >
                          {tCommon("language.enUS")}
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* 隐私模式 */}
            <div className="group">
              <Card className="shadow-sm border border-divider/30 hover:border-warning/30 transition-all duration-300 hover:shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-warning/10 group-hover:bg-warning/20 transition-colors">
                      <Icon
                        className="text-warning"
                        icon="lucide:shield"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {t("drawer.privacy.title")}
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        {t("drawer.privacy.description")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        {t("drawer.privacy.label")}
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        {t("drawer.privacy.details")}
                      </p>
                    </div>
                    <Switch
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-warning-100",
                      }}
                      color="warning"
                      isSelected={settings.isPrivacyMode}
                      size="lg"
                      onValueChange={togglePrivacyMode}
                    />
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* 实验性功能 */}
            <div className="group">
              <Card className="shadow-sm border border-divider/30 hover:border-secondary/30 transition-all duration-300 hover:shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-secondary/10 group-hover:bg-secondary/20 transition-colors">
                      <Icon
                        className="text-secondary"
                        icon="lucide:flask-conical"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {t("drawer.experimental.title")}
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        {t("drawer.experimental.description")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        {t("drawer.experimental.label")}
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        {t("drawer.experimental.details")}
                      </p>
                    </div>
                    <Switch
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-secondary-100",
                      }}
                      color="secondary"
                      isSelected={settings.isExperimentalMode}
                      size="lg"
                      onValueChange={toggleExperimentalMode}
                    />
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* 更新检查设置 */}
            <div className="group">
              <Card className="shadow-sm border border-divider/30 hover:border-primary/30 transition-all duration-300 hover:shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                      <Icon
                        className="text-primary"
                        icon="lucide:refresh-cw"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        {t("drawer.updates.title")}
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        {t("drawer.updates.description")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4 space-y-4">
                  {/* 主开关 */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        {t("drawer.updates.enable")}
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        {t("drawer.updates.enableDesc")}
                      </p>
                    </div>
                    <Switch
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-primary-100",
                      }}
                      color="primary"
                      isDisabled={true}
                      isSelected={settings.autoCheckUpdates}
                      size="lg"
                      onValueChange={toggleAutoCheckUpdates}
                    />
                  </div>

                  {/* 检查频率设置 */}
                  {settings.autoCheckUpdates && (
                    <div className="space-y-3 pt-2 border-t border-divider/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-700 font-medium">
                          {t("drawer.updates.frequency")}
                        </span>
                        <Select
                          className="w-32"
                          selectedKeys={[settings.updateCheckFrequency]}
                          size="sm"
                          onSelectionChange={(keys) => {
                            const frequency = Array.from(keys)[0] as
                              | "daily"
                              | "weekly"
                              | "monthly"
                              | "never";

                            updateSettings({ updateCheckFrequency: frequency });
                          }}
                        >
                          <SelectItem key="daily">{t("drawer.updates.daily")}</SelectItem>
                          <SelectItem key="weekly">{t("drawer.updates.weekly")}</SelectItem>
                          <SelectItem key="monthly">{t("drawer.updates.monthly")}</SelectItem>
                          <SelectItem key="never">{t("drawer.updates.never")}</SelectItem>
                        </Select>
                      </div>

                      {/* 具体时间设置 */}
                      {settings.updateCheckFrequency !== "never" && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-default-700 font-medium">
                            {t("drawer.updates.time")}
                          </span>
                          <Select
                            className="w-32"
                            selectedKeys={[settings.updateCheckTime]}
                            size="sm"
                            onSelectionChange={(keys) => {
                              const time = Array.from(keys)[0] as string;

                              updateSettings({ updateCheckTime: time });
                            }}
                          >
                            <SelectItem key="00:00">{t("drawer.updates.midnight")}</SelectItem>
                            <SelectItem key="06:00">{t("drawer.updates.morning")}</SelectItem>
                            <SelectItem key="12:00">{t("drawer.updates.noon")}</SelectItem>
                            <SelectItem key="18:00">{t("drawer.updates.evening")}</SelectItem>
                            <SelectItem key="22:00">{t("drawer.updates.night")}</SelectItem>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 更新通知设置 */}
                  {settings.autoCheckUpdates && (
                    <div className="space-y-3 pt-2 border-divider/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-700 font-medium">
                          {t("drawer.updates.notifications")}
                        </span>
                        <Switch
                          color="primary"
                          isSelected={settings.updateNotifications}
                          size="sm"
                          onValueChange={toggleUpdateNotifications}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-700 font-medium">
                          {t("drawer.updates.silentDownload")}
                        </span>
                        <Switch
                          color="primary"
                          isSelected={settings.silentDownload}
                          size="sm"
                          onValueChange={toggleSilentDownload}
                        />
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </DrawerBody>

        <DrawerFooter className="border-t border-divider/50 bg-background/80 backdrop-blur-sm px-6">
          <div className="w-full space-y-3">
            <Button
              className="w-full font-semibold py-6 bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all duration-300"
              color="primary"
              size="lg"
              onPress={onClose}
            >
              <Icon icon="lucide:check" width={18} />
              {t("drawer.save")}
            </Button>
            <p className="text-xs text-default-400 text-center">
              {t("drawer.autoSave")}
            </p>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
