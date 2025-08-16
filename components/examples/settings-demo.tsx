"use client";

import React from 'react';
import { Card, CardBody, CardHeader, Badge, Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useSettings } from '@/components/providers/settings-provider';
import { useTheme } from 'next-themes';

/**
 * 示例组件：展示如何在其他组件中使用全局设置
 */
export const SettingsDemo: React.FC = () => {
  const { settings } = useSettings();
  const { theme } = useTheme();

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex gap-3">
        <div className="flex flex-col">
          <p className="text-md">全局设置状态</p>
          <p className="text-small text-default-500">
            这些设置在整个应用中都是同步的
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {/* 主题状态 */}
          <div className="flex items-center justify-between">
            <span className="text-sm">当前主题：</span>
            <Badge 
              color={theme === 'dark' ? 'secondary' : 'primary'}
              variant="flat"
            >
              {theme === 'system' ? '跟随系统' : 
               theme === 'dark' ? '深色' : '浅色'}
            </Badge>
          </div>

          {/* 新手模式状态 */}
          <div className="flex items-center justify-between">
            <span className="text-sm">新手模式：</span>
            <Badge 
              color={settings.isBeginnerMode ? 'success' : 'default'}
              variant="flat"
            >
              {settings.isBeginnerMode ? '已启用' : '已禁用'}
            </Badge>
          </div>

          {/* 隐私模式状态 */}
          <div className="flex items-center justify-between">
            <span className="text-sm">隐私模式：</span>
            <Badge 
              color={settings.isPrivacyMode ? 'success' : 'default'}
              variant="flat"
            >
              {settings.isPrivacyMode ? '已启用' : '已禁用'}
            </Badge>
          </div>

          {/* 根据设置显示不同的内容 */}
          {settings.isBeginnerMode && (
            <div className="mt-4 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                <Icon icon="lucide:lightbulb" width={16} />
                <span className="text-sm font-medium">新手提示</span>
              </div>
              <p className="text-xs text-primary-500 mt-1">
                新手模式已启用，您将看到更多帮助提示和引导信息。
              </p>
            </div>
          )}

          {settings.isPrivacyMode && (
            <div className="mt-4 p-3 bg-success-50 dark:bg-success-900/20 rounded-lg">
              <div className="flex items-center gap-2 text-success-600 dark:text-success-400">
                <Icon icon="lucide:shield-check" width={16} />
                <span className="text-sm font-medium">隐私保护</span>
              </div>
              <p className="text-xs text-success-500 mt-1">
                隐私模式已启用，敏感信息将被隐藏，数据收集受到限制。
              </p>
            </div>
          )}

          {/* 设置按钮 */}
          <div className="mt-4">
            <Button 
              color="primary" 
              variant="bordered" 
              size="sm" 
              className="w-full"
              startContent={<Icon icon="lucide:settings" width={16} />}
            >
              打开设置
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};

