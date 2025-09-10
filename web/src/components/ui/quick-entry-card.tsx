import { Button, Card, CardBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faServer,
  faPlus,
  faLayerGroup,
  faBolt,
  faHammer,
  faBug
} from "@fortawesome/free-solid-svg-icons";
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
      color: "bg-blue-500 hover:bg-blue-600"
    },
    {
      id: "create-tunnel",
      icon: faPlus,
      label: "创建实例",
      route: "/tunnels/create",
      color: "bg-green-500 hover:bg-green-600"
    },
    {
      id: "template-create",
      icon: faLayerGroup,
      label: "场景创建",
      route: "/templates",
      color: "bg-purple-500 hover:bg-purple-600"
    },
    {
      id: "quick-create",
      icon: faBolt,
      label: "快速创建",
      route: "/tunnels",
      color: "bg-orange-500 hover:bg-orange-600"
    },
    {
      id: "manual-create",
      icon: faHammer,
      label: "手搓创建",
      route: "/tunnels",
      color: "bg-red-500 hover:bg-red-600"
    },
    {
      id: "debug-tools",
      icon: faBug,
      label: "调试工具",
      route: "/debug",
      color: "bg-teal-500 hover:bg-teal-600"
    }
  ];

  return (
    <Card className="h-full min-h-[120px] dark:border-default-100 border border-transparent">
      <CardBody className="p-4 h-full flex flex-col justify-between">
        {/* 标题 */}
        <dt className="text-small text-foreground font-medium">快捷操作</dt>        
        {/* 按钮行 */}
        <div className="flex pt-5 justify-between">
          {quickActions.map((action) => (
            <Button
              isIconOnly
              key={action.id}
              onPress={() => navigate(action.route)}
              title={action.label}
              variant="solid"
              className={`${action.color} text-white transition-colors duration-200`}
            >
              <FontAwesomeIcon 
                icon={action.icon} 
                className="!w-5 !h-5" 
                style={{ width: '20px', height: '20px' }}
              />
            </Button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}