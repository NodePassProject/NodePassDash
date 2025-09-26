import { Tab, Tabs } from "@heroui/react";
import React from "react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";

import SecuritySettings from "@/components/settings/security-settings";
import VersionSettings from "@/components/settings/version-settings";
import LogCleanupSettings from "@/components/settings/log-cleanup-settings";

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
    <div className="max-w-7xl mx-auto py-4 sm:py-6 px-4 sm:px-6 space-y-4 sm:space-y-6">
      <div className="flex w-full flex-col">
        <Tabs
          aria-label="设置选项"
          classNames={{
            base: "w-full",
            tabList:
              "w-full gap-2 sm:gap-4 md:gap-6 p-1 sm:p-2 bg-default-100 rounded-lg",
            cursor: "bg-primary text-primary-foreground shadow-small",
            tab: "data-[selected=true]:text-primary-foreground h-10 px-2 sm:px-4 md:px-8 min-w-0",
            panel: "pt-6",
          }}
          color="primary"
          radius="lg"
          selectedKey={selected}
          variant="solid"
          onSelectionChange={setSelected as any}
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
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Icon className="text-lg" icon="solar:shield-keyhole-bold" />
                <span className="hidden sm:inline">账户安全</span>
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
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Icon className="text-lg" icon="solar:database-bold" />
                <span className="hidden sm:inline">日志管理</span>
              </div>
            }
          >
            <LogCleanupSettings />
          </Tab>
          <Tab
            key="version"
            title={
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <Icon className="text-lg" icon="solar:refresh-circle-bold" />
                <span className="hidden sm:inline">版本检查</span>
              </div>
            }
          >
            <VersionSettings />
          </Tab>
        </Tabs>
      </div>

      {/* <div className="flex justify-end gap-2">
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
      </div> */}
    </div>
  );
}
