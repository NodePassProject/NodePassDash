"use client";

import { Button, Card, CardBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { 
  faServer,
  faPlus,
  faLayerGroup,
  faBolt,
  faHammer,
  faCopy,
  faFileImport,
  faFileDownload
} from "@fortawesome/free-solid-svg-icons";
import { useRouter } from "next/navigation";

/**
 * QuickEntry Card 快捷操作卡片组件
 * 类似图片中的设计，包含标题和5个图标按钮
 */
export function QuickEntryCard() {
  const router = useRouter();

  const quickActions = [
    {
      id: "add-endpoint",
      icon: faServer,
      label: "添加主控",
      route: "/endpoints"
    },
    {
      id: "create-tunnel",
      icon: faPlus,
      label: "创建实例",
      route: "/tunnels/create"
    },
    {
      id: "template-create",
      icon: faLayerGroup,
      label: "场景创建",
      route: "/templates"
    },
    {
      id: "quick-create",
      icon: faBolt,
      label: "快速创建",
      route: "/tunnels"
    },
    {
      id: "manual-create",
      icon: faHammer,
      label: "手搓创建",
      route: "/tunnels"
    },
    {
      id: "batch-create",
      icon: faCopy,
      label: "批量创建",
      route: "/tunnels"
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
              onPress={() => router.push(action.route)}
              title={action.label}
              variant="solid"
              className="bg-primary-400 hover:bg-primary-700 text-white"
            >
              <FontAwesomeIcon 
                icon={action.icon} 
                className="w-5 h-5" 
              />
            </Button>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
