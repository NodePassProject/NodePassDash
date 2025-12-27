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
  Progress,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faShield,
  faExchangeAlt,
  faNetworkWired,
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
  onNavigate: () => void;
  onAction: (action: string) => void;
}

// 获取类型对应的渐变色
const getTypeGradient = (type: string) => {
  switch (type) {
    case "0":
      return "from-blue-500 to-cyan-500";
    case "1":
      return "from-green-500 to-emerald-500";
    case "2":
      return "from-purple-500 to-pink-500";
    default:
      return "from-gray-500 to-slate-500";
  }
};

// 获取类型对应的发光色
const getTypeGlowColor = (type: string) => {
  switch (type) {
    case "0":
      return "rgba(59, 130, 246, 0.5)"; // blue
    case "1":
      return "rgba(34, 197, 94, 0.5)"; // green
    case "2":
      return "rgba(168, 85, 247, 0.5)"; // purple
    default:
      return "rgba(107, 114, 128, 0.5)"; // gray
  }
};

// 毛玻璃现代风格 - 优化版（更扁平）
export function GlassmorphismCard({
  service,
  formatHost,
  getTypeLabel,
  getTypeIcon,
  onNavigate,
  onAction,
}: ServiceCardProps) {
  const { t } = useTranslation("services");

  return (
    <div className="group relative">
      {/* 背景光晕效果 */}
      <div
        className="absolute -inset-0.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
        style={{
          background: `linear-gradient(135deg, ${getTypeGlowColor(service.type)}, transparent)`,
        }}
      />

      {/* 主卡片 */}
      <Card
        className={`
          relative overflow-hidden
          bg-gradient-to-br from-white/80 to-white/40 dark:from-gray-900/80 dark:to-gray-800/40
          backdrop-blur-xl backdrop-saturate-150
          border border-white/20 dark:border-gray-700/30
          shadow-xl shadow-black/5
          hover:shadow-2xl hover:shadow-black/10
          hover:-translate-y-1
          transition-all duration-300
        `}
      >
        {/* 顶部渐变装饰条 */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${getTypeGradient(service.type)}`}
        />

        {/* 右上角操作菜单 */}
        <div className="absolute top-2 right-2 z-10">
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button
                isIconOnly
                size="sm"
                className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-md border border-white/20"
                variant="flat"
              >
                <FontAwesomeIcon icon={faEllipsisVertical} />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label={t("card.menu.ariaLabel")} onAction={onAction}>
              <DropdownSection showDivider title={t("card.menu.instanceActions")}>
                <DropdownItem
                  key="start"
                  className="text-success"
                  startContent={<FontAwesomeIcon fixedWidth icon={faPlay} />}
                >
                  {t("actions.start")}
                </DropdownItem>
                <DropdownItem
                  key="stop"
                  className="text-warning"
                  startContent={<FontAwesomeIcon fixedWidth icon={faStop} />}
                >
                  {t("actions.stop")}
                </DropdownItem>
                <DropdownItem
                  key="restart"
                  className="text-primary"
                  startContent={<FontAwesomeIcon fixedWidth icon={faRotateRight} />}
                >
                  {t("actions.restart")}
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={<FontAwesomeIcon fixedWidth icon={faTrash} />}
                >
                  {t("actions.delete")}
                </DropdownItem>
              </DropdownSection>
              <DropdownSection title={t("card.menu.serviceActions")}>
                <DropdownItem
                  key="sync"
                  className="text-primary"
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
                  className="text-danger"
                  color="warning"
                  startContent={<FontAwesomeIcon fixedWidth icon={faUserSlash} />}
                >
                  {t("actions.dissolve")}
                </DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>
        </div>

        <CardBody className="p-3 cursor-pointer" onClick={onNavigate}>
          {/* 图标和标题区域 - 更紧凑 */}
          <div className="flex gap-3 mb-2.5">
            {/* 渐变图标容器 - 更小 */}
            <div
              className={`
                relative flex-shrink-0 flex items-center justify-center
                w-11 h-11 rounded-lg
                bg-gradient-to-br ${getTypeGradient(service.type)}
                shadow-lg
                group-hover:scale-110 transition-transform duration-300
              `}
            >
              <FontAwesomeIcon
                className="text-white text-lg"
                icon={getTypeIcon(service.type)}
              />
              {/* 图标光晕 */}
              <div
                className="absolute inset-0 rounded-lg opacity-50 blur-md"
                style={{
                  background: `linear-gradient(135deg, ${getTypeGlowColor(service.type)}, transparent)`,
                }}
              />
            </div>

            {/* 标题信息 */}
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <h3
                className="font-semibold text-sm text-gray-900 dark:text-white truncate"
                title={service.alias || service.sid}
              >
                {service.alias || service.sid}
              </h3>
              <span
                className={`
                  inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium w-fit
                  bg-gradient-to-r ${getTypeGradient(service.type)}
                  text-white
                `}
              >
                {getTypeLabel(service.type)}
              </span>
            </div>
          </div>

          {/* 连接信息 - 更紧凑 */}
          <div className="space-y-1.5">
            <div
              className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm border border-white/20"
            >
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-10">
                {t("card.entry")}
              </span>
              <span className="text-[11px] font-mono font-semibold text-gray-900 dark:text-white flex-1 truncate">
                {formatHost(service.entranceHost)}:{service.entrancePort}
              </span>
            </div>
            <div
              className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm border border-white/20"
            >
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 w-10">
                {t("card.exit")}
              </span>
              <span className="text-[11px] font-mono font-semibold text-gray-900 dark:text-white flex-1 truncate">
                {formatHost(service.exitHost)}:{service.exitPort}
              </span>
            </div>
          </div>
        </CardBody>

        {/* 底部流量统计 - 更扁 */}
        <CardFooter className="border-t border-white/20 dark:border-gray-700/20 px-3 py-2 backdrop-blur-sm bg-white/30 dark:bg-gray-800/20">
          <div className="flex items-center w-full gap-3">
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 shadow-md">
                <span className="text-white text-[10px] font-bold">↑</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">{t("card.upload")}</span>
                <span className="text-[11px] font-mono font-semibold text-gray-900 dark:text-white leading-tight">
                  {formatBytes(service.totalTx || 0)}
                </span>
              </div>
            </div>
            <div className="w-px h-6 bg-white/20 dark:bg-gray-700/20" />
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 shadow-md">
                <span className="text-white text-[10px] font-bold">↓</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">{t("card.download")}</span>
                <span className="text-[11px] font-mono font-semibold text-gray-900 dark:text-white leading-tight">
                  {formatBytes(service.totalRx || 0)}
                </span>
              </div>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

