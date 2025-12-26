import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Card,
  CardBody,
  CardFooter,
  Button,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRight,
  faExchangeAlt,
  faShield,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";

import { ScenarioType } from "./service-create-modal";

interface ScenarioSelectionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onScenarioSelected: (scenarioType: ScenarioType) => void;
}

interface ScenarioOption {
  type: ScenarioType;
  icon: string;
  color: "primary" | "success" | "secondary";
  bgClass: string;
}

const scenarioOptionsBase: ScenarioOption[] = [
  {
    type: "single-forward",
    icon: "solar:server-square-cloud-bold-duotone",
    color: "primary",
    bgClass: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/20",
  },
  {
    type: "nat-penetration",
    icon: "solar:shield-network-bold-duotone",
    color: "secondary",
    bgClass: "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/20",
  },
  {
    type: "tunnel-forward",
    icon: "solar:server-minimalistic-bold-duotone",
    color: "success",
    bgClass: "bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/20",
  }
];

export default function ScenarioSelectionModal({
  isOpen,
  onOpenChange,
  onScenarioSelected,
}: ScenarioSelectionModalProps) {
  const { t } = useTranslation("dashboard");

  const getScenarioKey = (scenarioType: ScenarioType): string => {
    switch (scenarioType) {
      case "single-forward":
        return "singleForward";
      case "nat-penetration":
        return "natPenetration";
      case "tunnel-forward":
        return "tunnelForward";
      default:
        return "singleForward";
    }
  };

  const handleSelectScenario = (scenarioType: ScenarioType) => {
    onOpenChange(false);
    // 使用 setTimeout 确保模态窗关闭动画完成后再打开新的模态窗
    setTimeout(() => {
      onScenarioSelected(scenarioType);
    }, 150);
  };

  return (
    <Modal
      isOpen={isOpen}
      size="4xl"
      placement="center"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold">{t("scenarioSelection.title")}</h2>
              <p className="text-sm text-default-500 font-normal">
                {t("scenarioSelection.subtitle")}
              </p>
            </ModalHeader>
            <ModalBody className="py-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scenarioOptionsBase.map((scenario) => {
                  const scenarioKey = getScenarioKey(scenario.type);

                  return (
                    <Card
                      key={scenario.type}
                      className={`${scenario.bgClass} border-2 border-transparent hover:border-${scenario.color} transition-all duration-200`}
                    >
                      <CardBody className="flex flex-col items-center justify-center py-8 px-4">
                        <div className="mb-6">
                          <Icon
                            icon={scenario.icon}
                            className={`text-6xl text-${scenario.color}`}
                          />
                        </div>
                        <h3 className="text-xl font-bold mb-3 text-center">
                          {t(`scenarioSelection.scenarios.${scenarioKey}.title`)}
                        </h3>
                        <p className="text-sm text-default-600 text-center leading-relaxed">
                          {t(`scenarioSelection.scenarios.${scenarioKey}.description`)}
                        </p>
                      </CardBody>
                      <CardFooter className="justify-center pt-0 pb-6">
                        <Button
                          color={scenario.color}
                          variant="shadow"
                          className="font-medium"
                          onPress={() => handleSelectScenario(scenario.type)}
                        >
                          {t("scenarioSelection.select")}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
