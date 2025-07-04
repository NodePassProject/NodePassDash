"use client";

import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/app/components/auth-provider";

/**
 * 导航栏操作区域组件
 * 包含通知按钮和设置按钮
 */
export const NavbarActions = () => {
  // 通过上下文获取登出函数
  const { logout } = useAuth();

  return (
    <div className="flex items-center gap-1">
      {/* 退出登录图标按钮 */}
      <Button isIconOnly variant="light" color="danger" onClick={logout}>
        <Icon icon="solar:logout-2-bold" width={18} />
      </Button>
    </div>
  );
}; 