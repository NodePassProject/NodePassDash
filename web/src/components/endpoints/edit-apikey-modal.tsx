"use client";

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
import { faKey, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface EditApiKeyModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  currentApiKey: string;
  endpointName: string;
  onSave: (newApiKey: string) => Promise<void>;
}

export default function EditApiKeyModal({
  isOpen,
  onOpenChange,
  currentApiKey,
  endpointName,
  onSave,
}: EditApiKeyModalProps) {
  const { t } = useTranslation("endpoints");
  const [newApiKey, setNewApiKey] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!newApiKey.trim()) return;

    setIsLoading(true);
    try {
      await onSave(newApiKey.trim());
      setNewApiKey("");
      onOpenChange();
    } catch (error) {
      // 错误处理由父组件的 onSave 方法处理
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = () => {
    if (!isLoading) {
      setNewApiKey("");
      onOpenChange();
    }
  };

  const toggleVisibility = () => setIsVisible(!isVisible);

  return (
    <Modal
      hideCloseButton={isLoading}
      isDismissable={!isLoading}
      isOpen={isOpen}
      placement="center"
      onOpenChange={handleOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-warning" icon={faKey} />
                {t("editApiKeyModal.title")}
              </div>
              <p className="text-small text-default-500 font-normal">
                {t("editApiKeyModal.endpoint")}: {endpointName}
              </p>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <label className="text-small text-default-600 mb-2 block">
                    {t("editApiKeyModal.currentKey")}
                  </label>
                  <Input
                    isReadOnly
                    className="font-mono"
                    size="sm"
                    type="password"
                    value={currentApiKey}
                    variant="bordered"
                  />
                </div>
                <div>
                  <label className="text-small text-default-600 mb-2 block">
                    {t("editApiKeyModal.newKey")} <span className="text-danger">*</span>
                  </label>
                  <Input
                    className="font-mono"
                    endContent={
                      <button
                        className="focus:outline-none"
                        type="button"
                        onClick={toggleVisibility}
                      >
                        <FontAwesomeIcon
                          className="text-default-400 pointer-events-none text-sm"
                          icon={isVisible ? faEyeSlash : faEye}
                        />
                      </button>
                    }
                    placeholder={t("editApiKeyModal.newKeyPlaceholder")}
                    size="sm"
                    type={isVisible ? "text" : "password"}
                    value={newApiKey}
                    variant="bordered"
                    onValueChange={setNewApiKey}
                  />
                </div>
                <div className="p-3 bg-warning-50 rounded-lg">
                  <p className="text-tiny text-warning-600">
                    {t("editApiKeyModal.warning")}
                  </p>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                isDisabled={isLoading}
                variant="light"
                onPress={onClose}
              >
                {t("editApiKeyModal.cancel")}
              </Button>
              <Button
                color="warning"
                isDisabled={!newApiKey.trim()}
                isLoading={isLoading}
                startContent={
                  !isLoading ? <FontAwesomeIcon icon={faKey} /> : null
                }
                onPress={handleSubmit}
              >
                {isLoading ? t("editApiKeyModal.saving") : t("editApiKeyModal.save")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
