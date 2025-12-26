import React, { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";

interface RenameTunnelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentName: string;
  onRenamed?: (newName: string) => void;
}

export default function RenameTunnelModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentName,
  onRenamed,
}: RenameTunnelModalProps) {
  const { t } = useTranslation("tunnels");
  const [newTunnelName, setNewTunnelName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 当模态框打开时，设置当前名称
  React.useEffect(() => {
    if (isOpen) {
      setNewTunnelName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async () => {
    if (!newTunnelName.trim()) return;

    try {
      setIsLoading(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "rename",
          name: newTunnelName.trim(),
        }),
      });

      if (!response.ok) throw new Error(t("renameModal.toast.updateFailed"));

      addToast({
        title: t("renameModal.toast.updateSuccess"),
        description: t("renameModal.toast.updateSuccessDesc"),
        color: "success",
      });

      onRenamed?.(newTunnelName.trim());
      onOpenChange(false);
    } catch (error) {
      console.error(t("renameModal.toast.updateFailed") + ":", error);
      addToast({
        title: t("renameModal.toast.updateFailedDesc"),
        description: error instanceof Error ? error.message : t("toast.unknownError"),
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleSubmit();
    }
  };

  return (
    <Modal isOpen={isOpen} placement="center" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faPen} />
                {t("renameModal.title")}
              </div>
            </ModalHeader>
            <ModalBody>
              <Input
                autoFocus
                isDisabled={isLoading}
                label={t("renameModal.label")}
                placeholder={t("renameModal.placeholder")}
                value={newTunnelName}
                variant="bordered"
                onKeyDown={handleKeyDown}
                onValueChange={setNewTunnelName}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                isDisabled={isLoading}
                variant="light"
                onPress={onClose}
              >
                {t("renameModal.cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={
                  !newTunnelName.trim() ||
                  newTunnelName.trim() === currentName
                }
                isLoading={isLoading}
                onPress={handleSubmit}
              >
                {t("renameModal.confirm")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
