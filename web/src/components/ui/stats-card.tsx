import React from "react";
import { Card, CardBody } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@heroui/react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: IconDefinition;
  color: "primary" | "success" | "danger" | "warning" | "default";
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const colorClasses = {
  primary: {
    card: "bg-gradient-to-br from-primary-50 to-primary-100/50 dark:from-primary-900/20 dark:to-primary-900/10",
    value: "text-primary",
    iconBg: "bg-primary/10 text-primary",
  },
  success: {
    card: "bg-gradient-to-br from-success-50 to-success-100/50 dark:from-success-900/20 dark:to-success-900/10",
    value: "text-success",
    iconBg: "bg-success/10 text-success",
  },
  danger: {
    card: "bg-gradient-to-br from-danger-50 to-danger-100/50 dark:from-danger-900/20 dark:to-danger-900/10",
    value: "text-danger",
    iconBg: "bg-danger/10 text-danger",
  },
  warning: {
    card: "bg-gradient-to-br from-warning-50 to-warning-100/50 dark:from-warning-900/20 dark:to-warning-900/10",
    value: "text-warning",
    iconBg: "bg-warning/10 text-warning",
  },
  default: {
    card: "bg-gradient-to-br from-default-50 to-default-100/50 dark:from-default-900/20 dark:to-default-900/10",
    value: "text-default-600",
    iconBg: "bg-default-500/10 text-default-600",
  },
};

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  color,
  loading = false,
  onClick,
  className,
}) => {
  const colors = colorClasses[color];

  return (
    <Card
      className={cn(
        "p-3 md:p-4 cursor-pointer transition-transform hover:scale-[1.02]",
        colors.card,
        className,
      )}
      isPressable={!!onClick}
      onPress={onClick}
    >
      <CardBody className="p-0">
        <div className="flex justify-between items-center">
          <div className="flex flex-col gap-1">
            <span className="text-default-600 text-xs md:text-sm">{title}</span>
            <span
              className={cn("text-xl md:text-2xl font-semibold", colors.value)}
            >
              {loading ? "--" : value}
            </span>
          </div>
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-lg",
              colors.iconBg,
            )}
          >
            <FontAwesomeIcon className="w-5 h-5 md:w-6 md:h-6" icon={icon} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
