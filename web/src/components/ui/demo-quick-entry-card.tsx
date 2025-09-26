import { Card, CardBody, useDisclosure } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faLayerGroup,
  faBug,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";
import { addToast } from "@heroui/toast";

import AddEndpointModal from "@/components/endpoints/add-endpoint-modal";
import SimpleCreateTunnelModal from "@/components/tunnels/simple-create-tunnel-modal";
import { buildApiUrl } from "@/lib/utils";

/**
 * Demo QuickEntry Card 快捷操作卡片组件（Demo页面专用）
 * 2列3行布局，按钮为左右布局：icon label
 */
export function DemoQuickEntryCard() {
  const navigate = useNavigate();

  // 模态框控制
  const {
    isOpen: isAddEndpointOpen,
    onOpen: onAddEndpointOpen,
    onOpenChange: onAddEndpointOpenChange,
  } = useDisclosure();

  const {
    isOpen: isCreateTunnelOpen,
    onOpen: onCreateTunnelOpen,
    onOpenChange: onCreateTunnelOpenChange,
  } = useDisclosure();

  const quickActions = [
    {
      id: "add-endpoint",
      icon: faServer,
      label: "添加主控",
      action: "modal",
      color: "bg-blue-500 hover:bg-blue-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "create-tunnel",
      icon: "solar:transmission-bold",
      label: "创建实例",
      action: "modal",
      color: "bg-green-500 hover:bg-green-600",
      iconType: "iconify",
      external: false,
    },
    {
      id: "template-create",
      icon: faLayerGroup,
      label: "场景创建",
      action: "navigate",
      route: "/templates",
      color: "bg-purple-500 hover:bg-purple-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "debug-tools",
      icon: faBug,
      label: "调试工具",
      action: "navigate",
      route: "/debug",
      color: "bg-teal-500 hover:bg-teal-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "docs",
      icon: "solar:document-text-bold",
      label: "说明文档",
      action: "navigate",
      route: "/docs",
      color: "bg-indigo-500 hover:bg-indigo-600",
      iconType: "iconify",
      external: false,
    },
    {
      id: "settings",
      icon: "solar:settings-bold",
      label: "系统设置",
      action: "navigate",
      route: "/settings",
      color: "bg-gray-500 hover:bg-gray-600",
      iconType: "iconify",
      external: false,
    },
  ];

  // 处理添加主控
  const handleAddEndpoint = async (data: any) => {
    try {
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "添加主控失败");
      }

      addToast({
        title: "添加成功",
        description: "主控已成功添加",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "添加失败",
        description:
          error instanceof Error ? error.message : "添加主控时发生错误",
        color: "danger",
      });
      throw error; // 重新抛出错误，让模态框处理
    }
  };

  // 处理隧道创建成功
  const handleTunnelCreated = () => {
    // 创建隧道成功后的处理，可以在这里添加刷新逻辑或其他操作
  };

  // 处理快捷操作点击
  const handleActionClick = (action: any) => {
    if (action.action === "modal") {
      if (action.id === "add-endpoint") {
        onAddEndpointOpen();
      } else if (action.id === "create-tunnel") {
        onCreateTunnelOpen();
      }
    } else if (action.action === "navigate") {
      if (action.external && action.route) {
        window.open(action.route, "_blank");
      } else if (action.route) {
        navigate(action.route);
      }
    }
  };

  return (
    <Card className="h-full   dark:border-default-100 border border-transparent">
      <CardBody className="p-5 h-full flex flex-col">
        {/* 标题 */}
        <span className="text-base font-semibold text-foreground mb-4">
          快捷操作
        </span>

        {/* 按钮网格 - 2列3行 */}
        <div className="grid grid-cols-2 gap-3 flex-1">
          {quickActions.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-3 cursor-pointer group transition-all hover:scale-[1.02] rounded-lg hover:bg-default-50 dark:hover:bg-default-100"
              onClick={() => handleActionClick(action)}
            >
              {/* 图标 */}
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-lg ${action.color} text-white transition-colors duration-200 group-hover:shadow-lg flex-shrink-0`}
              >
                {action.iconType === "fontawesome" ? (
                  <FontAwesomeIcon
                    className="!w-4 !h-4"
                    icon={action.icon}
                    style={{ width: "16px", height: "16px" }}
                  />
                ) : (
                  <Icon height={16} icon={action.icon} width={16} />
                )}
              </div>

              {/* 文字标签 */}
              <span className="text-sm text-default-600 group-hover:text-foreground transition-colors duration-200 font-medium">
                {action.label}
              </span>
            </div>
          ))}
        </div>
      </CardBody>

      {/* 添加主控模态框 */}
      <AddEndpointModal
        isOpen={isAddEndpointOpen}
        onAdd={handleAddEndpoint}
        onOpenChange={onAddEndpointOpenChange}
      />

      {/* 创建实例模态框 */}
      <SimpleCreateTunnelModal
        isOpen={isCreateTunnelOpen}
        mode="create"
        onOpenChange={onCreateTunnelOpenChange}
        onSaved={handleTunnelCreated}
      />
    </Card>
  );
}
