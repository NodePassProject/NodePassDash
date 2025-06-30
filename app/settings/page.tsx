"use client";

import {
  Button,
  Tab,
  Tabs
} from "@heroui/react";
import React from "react";

import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";

import SystemSettings from "@/app/settings/components/system-settings";
import SecuritySettings from "@/app/settings/components/security-settings";
import ProfileSettings from "@/app/settings/components/profile-settings";
import NotificationSettings from "@/app/settings/components/notification-settings";
import VersionSettings from "@/app/settings/components/version-settings";
import LogCleanupSettings from "@/app/settings/components/log-cleanup-settings";

export default function SettingsPage() {
  const [selected, setSelected] = React.useState("security");

  // 保存所有更改
  const handleSaveAll = async () => {
    try {
      addToast({
        title: "保存成功",
        description: "设置已更新",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    }
  };

  // 重置当前表单
  const handleReset = () => {
    addToast({
      title: "重置成功",
      description: "设置已恢复默认值",
      color: "warning",
    });
  };

  return (
    <div className="max-w-7xl mx-auto py-6 space-y-6">
      <div className="flex w-full flex-col">
        <Tabs 
          aria-label="设置选项" 
          selectedKey={selected}
          onSelectionChange={setSelected as any}
          color="primary"
          variant="solid"
          radius="lg"
          classNames={{
            base: "w-full",
            tabList: "w-full gap-6 p-2 bg-default-100 rounded-lg",
            cursor: "bg-primary text-primary-foreground shadow-small",
            tab: "data-[selected=true]:text-primary-foreground h-10 px-8",
            panel: "pt-6"
          }}
        >
          {/* <Tab
            key="system"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:settings-bold" className="text-lg" />
                <span>系统设置</span>
              </div>
            }
          >
            <SystemSettings />
          </Tab> */}
          <Tab
            key="security"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:shield-keyhole-bold" className="text-lg" />
                <span>账户安全</span>
              </div>
            }
          >
            <SecuritySettings />
          </Tab>
          {/* <Tab
            key="profile"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:user-circle-bold" className="text-lg" />
                <span>个人信息</span>
              </div>
            }
          >
            <ProfileSettings />
          </Tab>
          <Tab
            key="notifications"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:bell-bold" className="text-lg" />
                <span>通知管理</span>
              </div>
            }
          >
            <NotificationSettings />
          </Tab> */}
          <Tab
            key="logs"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:database-bold" className="text-lg" />
                <span>日志管理</span>
              </div>
            }
          >
            <LogCleanupSettings />
          </Tab>
          <Tab
            key="version"
            title={
              <div className="flex items-center gap-2">
                <Icon icon="solar:refresh-circle-bold" className="text-lg" />
                <span>版本更新</span>
              </div>
            }
          >
            <VersionSettings />
          </Tab>
        </Tabs>
      </div>

      <div className="flex justify-end gap-2">
        <Button 
          color="default" 
          variant="flat"
          onClick={handleReset}
        >
          重置
        </Button>
        <Button 
          color="primary"
          onClick={handleSaveAll}
        >
          保存更改
        </Button>
      </div>
    </div>
  );
} 