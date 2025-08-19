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
  Divider,
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
import { useSettings } from "@/components/providers/settings-provider";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    settings,
    updateTheme,
    toggleBeginnerMode,
    togglePrivacyMode,
    toggleExperimentalMode,
    updateSettings,
    toggleAutoCheckUpdates,
    toggleUpdateNotifications,
    toggleSilentDownload,
    handleManualCheck,
  } = useSettings();

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md">
      <DrawerContent className="bg-gradient-to-b from-background to-default-50">
        <DrawerHeader className="border-b border-divider/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Icon
                  icon="lucide:settings"
                  className="text-primary"
                  width={20}
                />
              </div>
              <div>
                <h2 className="text-xl font-bold">个性化设置</h2>
                <p className="text-sm text-default-500">自定义您的使用体验</p>
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
                        icon="lucide:palette"
                        className="text-primary"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        主题设置
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        选择您喜欢的界面主题
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-default-700">
                      主题模式
                    </span>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          variant="flat"
                          size="sm"
                          className="bg-default-100 hover:bg-default-200 min-w-32"
                          endContent={
                            <Icon icon="lucide:chevron-down" width={16} />
                          }
                        >
                          {settings.theme === "system"
                            ? "跟随系统"
                            : settings.theme === "dark"
                              ? "深色主题"
                              : "浅色主题"}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="主题选择"
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
                          浅色主题
                        </DropdownItem>
                        <DropdownItem
                          key="dark"
                          startContent={
                            <Icon icon="solar:moon-bold" width={16} />
                          }
                        >
                          深色主题
                        </DropdownItem>
                        <DropdownItem
                          key="system"
                          startContent={
                            <Icon icon="lucide:monitor" width={16} />
                          }
                        >
                          跟随系统
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* 新手模式 */}
            <div className="group">
              <Card className="shadow-sm border border-divider/30 hover:border-success/30 transition-all duration-300 hover:shadow-md bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-success/10 group-hover:bg-success/20 transition-colors">
                      <Icon
                        icon="lucide:graduation-cap"
                        className="text-success"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        新手模式
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        为初学者提供引导帮助
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        启用新手引导和提示功能
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        适合初次使用系统的用户，提供详细的操作指引
                      </p>
                    </div>
                    <Switch
                      isSelected={settings.isBeginnerMode}
                      onValueChange={toggleBeginnerMode}
                      color="success"
                      size="lg"
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-success-100",
                      }}
                    />
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
                        icon="lucide:shield"
                        className="text-warning"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        隐私模式
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        保护您的隐私数据安全
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        增强隐私保护功能
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        隐藏敏感信息，限制数据收集，保护用户隐私
                      </p>
                    </div>
                    <Switch
                      isSelected={settings.isPrivacyMode}
                      onValueChange={togglePrivacyMode}
                      color="warning"
                      size="lg"
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-warning-100",
                      }}
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
                        icon="lucide:flask-conical"
                        className="text-secondary"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        实验性功能
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        尝鲜测试中的新特性
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        启用实验性功能
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        功能可能不稳定，谨慎在生产环境使用
                      </p>
                    </div>
                    <Switch
                      isSelected={settings.isExperimentalMode}
                      onValueChange={toggleExperimentalMode}
                      color="secondary"
                      size="lg"
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-secondary-100",
                      }}
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
                        icon="lucide:refresh-cw"
                        className="text-primary"
                        width={18}
                      />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">
                        自动检查新版本
                      </span>
                      <p className="text-xs text-default-500 mt-1">
                        管理软件更新检查策略
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4 space-y-4">
                  {/* 主开关 */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-default-700 mb-2 font-medium">
                        启用自动检查更新
                      </p>
                      <p className="text-xs text-default-500 leading-relaxed">
                        定期检查是否有新版本可用
                      </p>
                    </div>
                    <Switch
                      isDisabled={true}
                      isSelected={settings.autoCheckUpdates}
                      onValueChange={toggleAutoCheckUpdates}
                      color="primary"
                      size="lg"
                      classNames={{
                        wrapper: "group-data-[hover=true]:bg-primary-100",
                      }}
                    />
                  </div>

                  {/* 检查频率设置 */}
                  {settings.autoCheckUpdates && (
                    <div className="space-y-3 pt-2 border-t border-divider/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-700 font-medium">
                          检查频率
                        </span>
                        <Select
                          selectedKeys={[settings.updateCheckFrequency]}
                          onSelectionChange={(keys) => {
                            const frequency = Array.from(keys)[0] as
                              | "daily"
                              | "weekly"
                              | "monthly"
                              | "never";
                            updateSettings({ updateCheckFrequency: frequency });
                          }}
                          size="sm"
                          className="w-32"
                        >
                          <SelectItem key="daily">每日</SelectItem>
                          <SelectItem key="weekly">每周</SelectItem>
                          <SelectItem key="monthly">每月</SelectItem>
                          <SelectItem key="never">从不</SelectItem>
                        </Select>
                      </div>

                      {/* 具体时间设置 */}
                      {settings.updateCheckFrequency !== "never" && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-default-700 font-medium">
                            检查时间
                          </span>
                          <Select
                            selectedKeys={[settings.updateCheckTime]}
                            onSelectionChange={(keys) => {
                              const time = Array.from(keys)[0] as string;
                              updateSettings({ updateCheckTime: time });
                            }}
                            size="sm"
                            className="w-32"
                          >
                            <SelectItem key="00:00">午夜 (00:00)</SelectItem>
                            <SelectItem key="06:00">早晨 (06:00)</SelectItem>
                            <SelectItem key="12:00">中午 (12:00)</SelectItem>
                            <SelectItem key="18:00">傍晚 (18:00)</SelectItem>
                            <SelectItem key="22:00">晚上 (22:00)</SelectItem>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 更新通知设置 */}
                  {settings.autoCheckUpdates && (
                    <div className="space-y-3 pt-2 border-t border-divider/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-700 font-medium">
                          更新通知
                        </span>
                        <Switch
                          isSelected={settings.updateNotifications}
                          onValueChange={toggleUpdateNotifications}
                          color="primary"
                          size="sm"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-700 font-medium">
                          静默下载
                        </span>
                        <Switch
                          isSelected={settings.silentDownload}
                          onValueChange={toggleSilentDownload}
                          color="primary"
                          size="sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* 手动检查按钮 */}
                  {/* <div className="pt-2 border-t border-divider/20">
                    <Button
                      size="sm"
                      variant="flat"
                      color="primary"
                      isDisabled={true}
                      startContent={
                        <Icon icon="lucide:refresh-cw" width={16} />
                      }
                      onClick={handleManualCheck}
                      className="w-full"
                    >
                      立即检查更新
                    </Button>
                  </div> */}
                </CardBody>
              </Card>
            </div>
          </div>
        </DrawerBody>

        <DrawerFooter className="border-t border-divider/50 bg-background/80 backdrop-blur-sm px-6">
          <div className="w-full space-y-3">
            <Button
              color="primary"
              onPress={onClose}
              className="w-full font-semibold py-6 bg-gradient-to-r from-primary to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all duration-300"
              size="lg"
            >
              <Icon icon="lucide:check" width={18} />
              保存设置
            </Button>
            <p className="text-xs text-default-400 text-center">
              设置将自动保存到本地存储
            </p>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
