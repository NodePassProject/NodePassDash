import { Card, CardBody, CardHeader, useDisclosure } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faServer, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";
import { addToast } from "@heroui/toast";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import AddEndpointModal from "@/components/endpoints/add-endpoint-modal";
import SimpleCreateTunnelModal from "@/components/tunnels/simple-create-tunnel-modal";
import ScenarioSelectionModal from "@/components/services/scenario-selection-modal";
import ScenarioCreateModal, {
  ScenarioType,
} from "@/components/services/service-create-modal";
import { buildApiUrl } from "@/lib/utils";

/**
 * 快捷操作卡片：单列 4 张横向大卡片，左侧渐变图标 + 标题/副标题 + 右侧箭头。
 */
export function DemoQuickEntryCard() {
  const navigate = useNavigate();
  const { t } = useTranslation("dashboard");

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

  const [scenarioSelectionModalOpen, setScenarioSelectionModalOpen] =
    useState(false);
  const [scenarioModalOpen, setScenarioModalOpen] = useState(false);
  const [selectedScenarioType, setSelectedScenarioType] = useState<
    ScenarioType | undefined
  >();

  const quickActions = [
    {
      id: "add-endpoint",
      icon: faServer,
      label: t("quickActions.addEndpoint"),
      desc: t("quickActions.addEndpointDesc"),
      iconType: "fontawesome" as const,
      gradient:
        "bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-500 dark:to-blue-700",
      ringHover:
        "group-hover:border-blue-300/60 dark:group-hover:border-blue-500/40",
      glow: "group-hover:shadow-blue-500/20",
    },
    {
      id: "create-tunnel",
      icon: "solar:transmission-bold",
      label: t("quickActions.createTunnel"),
      desc: t("quickActions.createTunnelDesc"),
      iconType: "iconify" as const,
      gradient:
        "bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-500 dark:to-emerald-700",
      ringHover:
        "group-hover:border-emerald-300/60 dark:group-hover:border-emerald-500/40",
      glow: "group-hover:shadow-emerald-500/20",
    },
    {
      id: "template-create",
      icon: faLayerGroup,
      label: t("quickActions.scenarioCreate"),
      desc: t("quickActions.scenarioCreateDesc"),
      iconType: "fontawesome" as const,
      gradient:
        "bg-gradient-to-br from-purple-500 to-purple-600 dark:from-purple-500 dark:to-purple-700",
      ringHover:
        "group-hover:border-purple-300/60 dark:group-hover:border-purple-500/40",
      glow: "group-hover:shadow-purple-500/20",
    },
    {
      id: "settings",
      icon: "solar:settings-bold",
      label: t("quickActions.settings"),
      desc: t("quickActions.settingsDesc"),
      iconType: "iconify" as const,
      gradient:
        "bg-gradient-to-br from-slate-500 to-slate-600 dark:from-slate-500 dark:to-slate-700",
      ringHover:
        "group-hover:border-slate-300/60 dark:group-hover:border-slate-500/40",
      glow: "group-hover:shadow-slate-500/20",
    },
  ];

  const handleAddEndpoint = async (data: any) => {
    try {
      const response = await fetch(buildApiUrl("/api/endpoints"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || t("quickActions.addEndpointError"));
      }

      addToast({
        title: t("quickActions.addEndpointSuccess"),
        description: t("quickActions.addEndpointSuccessDesc"),
        color: "success",
      });
    } catch (error) {
      addToast({
        title: t("quickActions.addEndpointFailed"),
        description:
          error instanceof Error
            ? error.message
            : t("quickActions.addEndpointErrorDesc"),
        color: "danger",
      });
      throw error;
    }
  };

  const handleTunnelCreated = () => {};

  const handleScenarioSelected = (scenarioType: ScenarioType) => {
    setSelectedScenarioType(scenarioType);
    setScenarioModalOpen(true);
  };

  const handleActionClick = (actionId: string) => {
    switch (actionId) {
      case "add-endpoint":
        onAddEndpointOpen();
        break;
      case "create-tunnel":
        onCreateTunnelOpen();
        break;
      case "template-create":
        setScenarioSelectionModalOpen(true);
        break;
      case "settings":
        navigate("/settings");
        break;
    }
  };

  return (
    <Card className="h-full dark:border-default-100 border border-transparent">
      <CardHeader className="px-4 pt-4 pb-0">
        <span className="text-base font-semibold text-foreground">
          {t("quickActions.title")}
        </span>
      </CardHeader>
      <CardBody className="px-4 py-3 flex flex-col gap-2">
        {quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => handleActionClick(action.id)}
            className={`group flex-1 min-h-[56px] flex items-center gap-3 px-3 rounded-lg border border-default-200/70 dark:border-default-100 bg-content1 dark:bg-default-50/40 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${action.glow} ${action.ringHover}`}
          >
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-md text-white flex-shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105 ${action.gradient}`}
            >
              {action.iconType === "fontawesome" ? (
                <FontAwesomeIcon
                  className="!w-3 !h-3"
                  icon={action.icon as any}
                  style={{ width: "12px", height: "12px" }}
                />
              ) : (
                <Icon
                  height={14}
                  icon={action.icon as string}
                  width={14}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {action.label}
              </div>
              <div className="text-xs text-default-500 truncate mt-0.5">
                {action.desc}
              </div>
            </div>

            <Icon
              className="text-default-400 group-hover:text-default-600 group-hover:translate-x-0.5 transition-all duration-200 flex-shrink-0"
              height={18}
              icon="solar:alt-arrow-right-linear"
              width={18}
            />
          </button>
        ))}
      </CardBody>

      <AddEndpointModal
        isOpen={isAddEndpointOpen}
        onAdd={handleAddEndpoint}
        onOpenChange={onAddEndpointOpenChange}
      />

      <SimpleCreateTunnelModal
        isOpen={isCreateTunnelOpen}
        mode="create"
        onOpenChange={onCreateTunnelOpenChange}
        onSaved={handleTunnelCreated}
      />

      <ScenarioSelectionModal
        isOpen={scenarioSelectionModalOpen}
        onOpenChange={setScenarioSelectionModalOpen}
        onScenarioSelected={handleScenarioSelected}
      />

      <ScenarioCreateModal
        isOpen={scenarioModalOpen}
        scenarioType={selectedScenarioType}
        onOpenChange={setScenarioModalOpen}
        onSaved={() => {
          setScenarioModalOpen(false);
          setSelectedScenarioType(undefined);
        }}
      />
    </Card>
  );
}
