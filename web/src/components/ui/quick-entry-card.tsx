import { Card, CardBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faServer, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function QuickEntryCard() {
  const navigate = useNavigate();
  const { t } = useTranslation("dashboard");

  const quickActions = [
    {
      id: "add-endpoint",
      icon: faServer,
      label: t("quickActions.addEndpoint"),
      route: "/endpoints",
      color: "bg-blue-500 hover:bg-blue-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "create-tunnel",
      icon: "solar:transmission-bold",
      label: t("quickActions.createTunnel"),
      route: "/tunnels/create",
      color: "bg-green-500 hover:bg-green-600",
      iconType: "iconify",
      external: false,
    },
    {
      id: "template-create",
      icon: faLayerGroup,
      label: t("quickActions.scenarioCreate"),
      route: "/templates",
      color: "bg-purple-500 hover:bg-purple-600",
      iconType: "fontawesome",
      external: false,
    },
    {
      id: "settings",
      icon: "solar:settings-bold",
      label: t("quickActions.settings"),
      route: "/settings",
      color: "bg-gray-500 hover:bg-gray-600",
      iconType: "iconify",
      external: false,
    },
  ];

  return (
    <Card className="h-full min-h-[140px] dark:border-default-100 border border-transparent">
      <CardBody className="p-5 h-full flex flex-col justify-between">
        <span className="text-base font-semibold text-foreground">
          {t("quickActions.title")}
        </span>
        <div className="grid grid-cols-4 gap-3 pt-5">
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
              <div
                className={`flex items-center justify-center w-14 h-14 rounded-xl ${action.color} text-white transition-all duration-200 group-hover:shadow-lg group-hover:shadow-black/20`}
              >
                {action.iconType === "fontawesome" ? (
                  <FontAwesomeIcon
                    className="!w-6 !h-6"
                    icon={action.icon as any}
                    style={{ width: "24px", height: "24px" }}
                  />
                ) : (
                  <Icon height={24} icon={action.icon as string} width={24} />
                )}
              </div>
              <span className="text-xs text-center text-default-600 group-hover:text-foreground transition-colors duration-200 font-medium leading-tight">
                {action.label}
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
