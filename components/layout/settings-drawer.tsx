"use client";

import React from 'react';
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
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useSettings } from '@/components/providers/settings-provider';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const { settings, updateTheme, toggleBeginnerMode, togglePrivacyMode } = useSettings();

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="md">
      <DrawerContent className="bg-gradient-to-b from-background to-default-50">
        <DrawerHeader className="border-b border-divider/50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Icon icon="lucide:settings" className="text-primary" width={20} />
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
                      <Icon icon="lucide:palette" className="text-primary" width={18} />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">主题设置</span>
                      <p className="text-xs text-default-500 mt-1">选择您喜欢的界面主题</p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody className="pt-0 pb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-default-700">主题模式</span>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button 
                          variant="flat" 
                          size="sm"
                          className="bg-default-100 hover:bg-default-200 min-w-32"
                          endContent={<Icon icon="lucide:chevron-down" width={16} />}
                        >
                          {settings.theme === 'system' ? '跟随系统' : 
                           settings.theme === 'dark' ? '深色主题' : '浅色主题'}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu 
                        aria-label="主题选择"
                        selectedKeys={settings.theme ? [settings.theme] : []}
                        selectionMode="single"
                        onAction={(key) => {
                          console.log('Theme selected:', key);
                          if (key) {
                            updateTheme(key as 'light' | 'dark' | 'system');
                          }
                        }}
                      >
                        <DropdownItem key="light" startContent={<Icon icon="solar:sun-bold" width={16} />}>
                          浅色主题
                        </DropdownItem>
                        <DropdownItem key="dark" startContent={<Icon icon="solar:moon-bold" width={16} />}>
                          深色主题
                        </DropdownItem>
                        <DropdownItem key="system" startContent={<Icon icon="lucide:monitor" width={16} />}>
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
                      <Icon icon="lucide:graduation-cap" className="text-success" width={18} />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">新手模式</span>
                      <p className="text-xs text-default-500 mt-1">为初学者提供引导帮助</p>
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
                        wrapper: "group-data-[hover=true]:bg-success-100"
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
                      <Icon icon="lucide:shield" className="text-warning" width={18} />
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">隐私模式</span>
                      <p className="text-xs text-default-500 mt-1">保护您的隐私数据安全</p>
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
                        wrapper: "group-data-[hover=true]:bg-warning-100"
                      }}
                    />
                  </div>
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
