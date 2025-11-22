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

import { ScenarioType } from "./service-create-modal";

interface ScenarioSelectionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onScenarioSelected: (scenarioType: ScenarioType) => void;
}

interface ScenarioOption {
  type: ScenarioType;
  title: string;
  description: string;
  icon: string;
  color: "primary" | "success" | "secondary";
  bgClass: string;
}

const scenarioOptions: ScenarioOption[] = [
  {
    type: "nat-penetration",
    title: "内网穿透",
    description: "内网穿透模式适用于安全要求的穿透需求，用户连接到服务端指定端口，流量通过完整连接池转发至目标服务",
    icon: "solar:shield-network-bold-duotone",
    color: "secondary",
    bgClass: "bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/20",
  },
  {
    type: "single-forward",
    title: "单端转发",
    description: "单端转发模式适用于简单的端口转发需求，用户连接到客户端指定端口，流量通过轻量连接池转发至目标服务",
    icon: "solar:server-square-cloud-bold-duotone",
    color: "primary",
    bgClass: "bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/20",
  },
  {
    type: "tunnel-forward",
    title: "隧道转发",
    description: "隧道转发模式适用于安全要求的中转需求，用户连接到客户端指定端口，流量通过完整连接池转发至目标服务",
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
              <h2 className="text-2xl font-bold">选择网络场景</h2>
              <p className="text-sm text-default-500 font-normal">
                Select Network Scenario
              </p>
            </ModalHeader>
            <ModalBody className="py-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scenarioOptions.map((scenario) => (
                  <Card
                    key={scenario.type}
                    className={`${scenario.bgClass} border-2 border-transparent hover:border-${scenario.color} transition-all duration-200 hover:scale-105 cursor-pointer`}
                    isPressable
                    onPress={() => handleSelectScenario(scenario.type)}
                  >
                    <CardBody className="flex flex-col items-center justify-center py-8 px-4">
                      <div className="mb-6">
                        <Icon
                          icon={scenario.icon}
                          className={`text-6xl text-${scenario.color}`}
                        />
                      </div>
                      <h3 className="text-xl font-bold mb-3 text-center">
                        {scenario.title}
                      </h3>
                      <p className="text-sm text-default-600 text-center leading-relaxed">
                        {scenario.description}
                      </p>
                    </CardBody>
                    <CardFooter className="justify-center pt-0 pb-6">
                      <Button
                        color={scenario.color}
                        variant="shadow"
                        className="font-medium"
                        onPress={() => handleSelectScenario(scenario.type)}
                      >
                        选择
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
