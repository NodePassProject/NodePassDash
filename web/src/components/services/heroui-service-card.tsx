import {
  Card,
  CardBody,
  CardFooter,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  Chip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEllipsisVertical,
  faPlay,
  faStop,
  faRotateRight,
  faTrash,
  faEdit,
  faUserSlash,
  faSync,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/lib/utils";

// 服务类型定义
export interface Service {
  sid: string;
  type: string;
  alias?: string;
  serverInstanceId?: string;
  clientInstanceId?: string;
  serverEndpointId?: number;
  clientEndpointId?: number;
  tunnelPort?: number;
  tunnelEndpointName?: string;
  entrancePort?: number;
  entranceHost?: string;
  exitPort?: number;
  exitHost?: string;
  totalRx: number;
  totalTx: number;
}

interface ServiceCardProps {
  service: Service;
  formatHost: (host: string | undefined) => string;
  getTypeLabel: (type: string) => string;
  getTypeIcon: (type: string) => any;
  getTypeColor: (type: string) => "primary" | "success" | "secondary" | "warning" | "default";
  onNavigate: () => void;
  onAction: (action: string) => void;
}

// HeroUI 原生风格卡片
export function HeroUIServiceCard({
  service,
  formatHost,
  getTypeLabel,
  getTypeIcon,
  getTypeColor,
  onNavigate,
  onAction,
}: ServiceCardProps) {
  const { t } = useTranslation("services");
  const cardColor = getTypeColor(service.type);

  return (
    <div className="relative group">
      {/* 使用 HeroUI Card 的原生 color 属性 */}
      <Card
        isBlurred
        className="border-none bg-background/60 dark:bg-default-100/50 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        shadow="sm"
      >
        {/* 顶部色条 - 使用对应颜色 */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${cardColor === "primary" ? "bg-primary" :
            cardColor === "success" ? "bg-success" :
              cardColor === "secondary" ? "bg-secondary" :
                cardColor === "warning" ? "bg-warning" :
                  "bg-default-300"
          }`} />

        {/* 右上角操作菜单 */}
        <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                radius="full"
                className="bg-background/80 backdrop-blur-md"
              >
                <FontAwesomeIcon icon={faEllipsisVertical} size="sm" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label={t("card.menu.ariaLabel")} onAction={onAction}>
              <DropdownSection showDivider title={t("card.menu.instanceActions")}>
                <DropdownItem
                  key="start"
                  color="success"
                  startContent={<FontAwesomeIcon fixedWidth icon={faPlay} />}
                >
                  {t("actions.start")}
                </DropdownItem>
                <DropdownItem
                  key="stop"
                  color="warning"
                  startContent={<FontAwesomeIcon fixedWidth icon={faStop} />}
                >
                  {t("actions.stop")}
                </DropdownItem>
                <DropdownItem
                  key="restart"
                  color="primary"
                  startContent={<FontAwesomeIcon fixedWidth icon={faRotateRight} />}
                >
                  {t("actions.restart")}
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  color="danger"
                  startContent={<FontAwesomeIcon fixedWidth icon={faTrash} />}
                >
                  {t("actions.delete")}
                </DropdownItem>
              </DropdownSection>
              <DropdownSection title={t("card.menu.serviceActions")}>
                <DropdownItem
                  key="sync"
                  color="primary"
                  startContent={<FontAwesomeIcon fixedWidth icon={faSync} />}
                >
                  {t("actions.sync")}
                </DropdownItem>
                <DropdownItem
                  key="rename"
                  startContent={<FontAwesomeIcon fixedWidth icon={faEdit} />}
                >
                  {t("actions.rename")}
                </DropdownItem>
                <DropdownItem
                  key="dissolve"
                  color="warning"
                  startContent={<FontAwesomeIcon fixedWidth icon={faUserSlash} />}
                >
                  {t("actions.dissolve")}
                </DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>
        </div>

        <CardBody className="p-4 cursor-pointer" onClick={onNavigate}>
          {/* 图标和标题区域 */}
          <div className="flex gap-3 mb-4">
            {/* 图标容器 - 使用 HeroUI 颜色 */}
            <div
              className={`
                flex-shrink-0 flex items-center justify-center
                w-10 h-10 rounded-xl
                ${cardColor === "primary" ? "bg-primary/10 text-primary" :
                  cardColor === "success" ? "bg-success/10 text-success" :
                    cardColor === "secondary" ? "bg-secondary/10 text-secondary" :
                      "bg-default-100 text-default-500"
                }
                group-hover:scale-110 transition-transform duration-300
              `}
            >
              <FontAwesomeIcon
                className="text-xl"
                icon={getTypeIcon(service.type)}
              />
            </div>

            {/* 标题信息 */}
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <h3
                className="font-medium text-sm text-foreground truncate "
                title={service.alias || service.sid}
              >
                {service.alias || service.sid}
              </h3>
              <span
                className="text-xs text-default-500"
              >
                {getTypeLabel(service.type)}
              </span>
            </div>
          </div>

          {/* 连接信息 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-default-100/50">
              <span className="text-xs font-medium text-default-500 min-w-[36px]">
                {t("card.entry")}
              </span>
              <span className="text-xs font-mono font-semibold text-foreground flex-1 truncate">
                {formatHost(service.entranceHost)}:{service.entrancePort}
              </span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-default-100/50">
              <span className="text-xs font-medium text-default-500 min-w-[36px]">
                {t("card.exit")}
              </span>
              <span className="text-xs font-mono font-semibold text-foreground flex-1 truncate">
                {formatHost(service.exitHost)}:{service.exitPort}
              </span>
            </div>
          </div>
        </CardBody>

        {/* 底部流量统计 */}
        <CardFooter className="border-t border-divider px-4 py-2.5 bg-default-50/50">
          <div className="flex items-center w-full gap-3 text-xs">
            {/* 上传 */}
            <div className="flex-1 flex items-center gap-1.5">
              <span className="font-mono text-success font-bold">↑</span>
              <span className="text-default-400">{t("card.upload")}</span>
              <span className="font-mono font-semibold text-foreground ml-auto truncate">
                {formatBytes(service.totalTx || 0)}
              </span>
            </div>

            {/* 分隔线 */}
            <div className="w-px h-4 bg-divider" />

            {/* 下载 */}
            <div className="flex-1 flex items-center gap-1.5">
              <span className="font-mono text-primary font-bold">↓</span>
              <span className="text-default-400">{t("card.download")}</span>
              <span className="font-mono font-semibold text-foreground ml-auto truncate">
                {formatBytes(service.totalRx || 0)}
              </span>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
