import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Icon } from "@iconify/react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: "primary" | "danger" | "warning" | "success";
  isLoading?: boolean;
  icon?: string;
  iconColor?: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText,
  confirmColor = "danger",
  isLoading = false,
  icon = "solar:danger-triangle-bold",
  iconColor = "text-warning",
}) => {
  const { t } = useTranslation("modals");

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {icon && <Icon className={`w-6 h-6 ${iconColor}`} icon={icon} />}
            {title}
          </div>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">{message}</p>
        </ModalBody>
        <ModalFooter>
          <Button disabled={isLoading} variant="light" onPress={onClose}>
            {cancelText || t("confirmation.defaultCancel")}
          </Button>
          <Button
            color={confirmColor}
            isLoading={isLoading}
            onPress={onConfirm}
          >
            {confirmText || t("confirmation.defaultConfirm")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
