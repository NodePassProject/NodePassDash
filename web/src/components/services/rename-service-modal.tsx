import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

interface RenameServiceModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  service: {
    sid: string;
    alias?: string;
  } | null;
  onRenamed?: () => void;
}

export default function RenameServiceModal({
  isOpen,
  onOpenChange,
  service,
  onRenamed,
}: RenameServiceModalProps) {
  const { t } = useTranslation("services");
  const [newName, setNewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 当模态窗打开或服务变化时,初始化输入框的值
  useEffect(() => {
    if (isOpen && service) {
      setNewName(service.alias || service.sid);
    }
  }, [isOpen, service]);

  const handleSubmit = async () => {
    if (!service || !newName.trim()) {
      addToast({
        title: t("renameModal.validation.error"),
        description: t("renameModal.validation.emptyName"),
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/rename`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName.trim() }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t("renameModal.toast.renameFailed"));
      }

      addToast({
        title: t("renameModal.toast.renameSuccess"),
        description: t("renameModal.toast.renamedTo", { name: newName.trim() }),
        color: "success",
      });

      // 调用回调函数刷新数据
      onRenamed?.();

      // 关闭模态窗
      onOpenChange(false);
    } catch (error) {
      console.error(t("renameModal.toast.renameFailed"), error);
      addToast({
        title: t("renameModal.toast.renameFailed"),
        description: error instanceof Error ? error.message : t("renameModal.toast.unknownError"),
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <FontAwesomeIcon icon={faEdit} />
              {t("renameModal.title")}
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-default-600 mb-2">
                    {t("renameModal.fields.currentSid")} <span className="font-mono">{service?.sid}</span>
                  </p>
                </div>
                <Input
                  autoFocus
                  label={t("renameModal.fields.serviceAlias")}
                  placeholder={t("renameModal.placeholders.serviceAlias")}
                  value={newName}
                  variant="bordered"
                  onValueChange={setNewName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSubmitting) {
                      handleSubmit();
                    }
                  }}
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                {t("renameModal.actions.cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={!newName.trim() || isSubmitting}
                isLoading={isSubmitting}
                onPress={handleSubmit}
              >
                {t("renameModal.actions.confirm")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
