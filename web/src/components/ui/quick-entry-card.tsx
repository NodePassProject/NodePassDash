import { Card, CardBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faServer,
  faLayerGroup,
  faBug,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";

/**
 * QuickEntry Card 快捷操作卡片组件
 * 类似图片中的设计，包含标题和5个图标按钮
 */
export function QuickEntryCard() {
  const navigate = useNavigate();

  const quickActions = [
    {
      id: "add-endpoint",
      icon: faServer,
      label: "添加主控",
      route: "/endpoints",
      color: "bg-blue-500 hover:bg-blue-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "create-tunnel",
      icon: "solar:transmission-bold",
      label: "创建实例",
      route: "/tunnels/create",
      color: "bg-green-500 hover:bg-green-600",
      iconType: "iconify",
      external: false,
    },
    {
      id: "template-create",
      icon: faLayerGroup,
      label: "场景创建",
      route: "/templates",
      color: "bg-purple-500 hover:bg-purple-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "settings",
      icon: "solar:settings-bold",
      label: "设置",
      route: "/settings",
      color: "bg-gray-500 hover:bg-gray-600",
      iconType: "iconify",
      external: false,
    },
    {
      id: "docs",
      icon: "solar:document-text-bold",
      label: "文档",
      route: "/docs",
      color: "bg-indigo-500 hover:bg-indigo-600",
      iconType: "iconify",
      external: false,
    },
    {
      id: "debug-tools",
      icon: faBug,
      label: "调试工具",
      route: "/debug",
      color: "bg-teal-500 hover:bg-teal-600",
      iconType: "fontawesome",
      external: false,
    },
  ];

  return (
    <Card className="h-full min-h-[140px] dark:border-default-100 border border-transparent">
      <CardBody className="p-5 h-full flex flex-col justify-between">
        {/* 标题 */}
        <span className="text-base font-semibold text-foreground">
          快捷操作
        </span>
        {/* 按钮行 */}
        <div className="flex pt-5 justify-between">
          {quickActions.map((action) => (
            <div
              key={action.id}
              className="flex flex-col items-center gap-2 cursor-pointer group transition-transform hover:scale-105"
              onClick={() => {
                if (action.external) {
                  window.open(action.route, "_blank");
                } else {
                  navigate(action.route);
                }
              }}
            >
              {/* 图标按钮 */}
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-lg ${action.color} text-white transition-colors duration-200 group-hover:shadow-lg`}
              >
                {action.iconType === "fontawesome" ? (
                  <FontAwesomeIcon
                    className="!w-5 !h-5"
                    icon={action.icon as any}
                    style={{ width: "20px", height: "20px" }}
                  />
                ) : (
                  <Icon height={20} icon={action.icon as string} width={20} />
                )}
              </div>

              {/* 文字标签 */}
              <span className="text-xs text-center text-default-600 group-hover:text-foreground transition-colors duration-200 font-medium">
                {action.label}
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
