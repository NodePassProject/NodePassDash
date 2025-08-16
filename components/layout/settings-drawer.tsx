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
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="sm">
      <DrawerContent>
        <DrawerHeader className="border-b border-default-200">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Icon icon="lucide:settings" className="text-primary" width={20} />
            个性化设置
          </div>
        </DrawerHeader>
        
        <DrawerBody className="px-4">
          <div className="space-y-6">
            {/* 主题设置 */}
            <Card className="shadow-none border border-default-200">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:palette" className="text-primary" width={18} />
                  <span className="font-medium">主题设置</span>
                </div>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-default-600">主题模式</span>
                  <Dropdown>
                    <DropdownTrigger>
                      <Button 
                        variant="bordered" 
                        size="sm"
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

            <Divider />

            {/* 新手模式 */}
            <Card className="shadow-none border border-default-200">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:graduation-cap" className="text-primary" width={18} />
                  <span className="font-medium">新手模式</span>
                </div>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-default-600 mb-1">
                      启用新手引导和提示功能
                    </p>
                    <p className="text-xs text-default-400">
                      适合初次使用系统的用户
                    </p>
                  </div>
                  <Switch
                    isSelected={settings.isBeginnerMode}
                    onValueChange={toggleBeginnerMode}
                    color="primary"
                    size="lg"
                  />
                </div>
              </CardBody>
            </Card>

            <Divider />

            {/* 隐私模式 */}
            <Card className="shadow-none border border-default-200">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:shield" className="text-primary" width={18} />
                  <span className="font-medium">隐私模式</span>
                </div>
              </CardHeader>
              <CardBody className="pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-default-600 mb-1">
                      增强隐私保护功能
                    </p>
                    <p className="text-xs text-default-400">
                      隐藏敏感信息，限制数据收集
                    </p>
                  </div>
                  <Switch
                    isSelected={settings.isPrivacyMode}
                    onValueChange={togglePrivacyMode}
                    color="primary"
                    size="lg"
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </DrawerBody>

        <DrawerFooter className="border-t border-default-200">
          <Button color="primary" onPress={onClose} className="w-full">
            完成
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
