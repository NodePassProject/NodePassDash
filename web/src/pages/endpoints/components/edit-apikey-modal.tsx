import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

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
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewApiKey(currentApiKey);
      setShowApiKey(false);
    }
  }, [isOpen, currentApiKey]);

  const handleSubmit = async () => {
    if (!newApiKey.trim() || newApiKey === currentApiKey) {
      return;
    }

    try {
      setIsLoading(true);
      await onSave(newApiKey.trim());
      onOpenChange();
    } catch (error) {
      // 错误处理由父组件负责
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} placement="center" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-warning" icon={faKey} />
                <span>{t("editApiKeyModal.title")}</span>
              </div>
              <p className="text-small text-default-500">
                {t("editApiKeyModal.endpoint")}: {endpointName}
              </p>
            </ModalHeader>

            <ModalBody>
              <div className="space-y-4">
                <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon
                      className="text-warning text-lg mt-0.5"
                      icon={faKey}
                    />
                    <div>
                      <h4 className="font-semibold text-warning-800 mb-1">
                        {t("editApiKeyModal.warningTitle")}
                      </h4>
                      <p className="text-sm text-warning-700">
                        {t("editApiKeyModal.warningMessage")}
                      </p>
                    </div>
                  </div>
                </div>

                <Input
                  autoFocus
                  isRequired
                  endContent={
                    <button
                      className="focus:outline-none"
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      <FontAwesomeIcon
                        className="text-default-400"
                        icon={showApiKey ? faEyeSlash : faEye}
                      />
                    </button>
                  }
                  label={t("editApiKeyModal.newApiKey")}
                  placeholder={t("editApiKeyModal.newApiKeyPlaceholder")}
                  type={showApiKey ? "text" : "password"}
                  value={newApiKey}
                  variant="bordered"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSubmit();
                    }
                  }}
                  onValueChange={setNewApiKey}
                />
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
                isDisabled={!newApiKey.trim() || newApiKey === currentApiKey}
                isLoading={isLoading}
                onPress={handleSubmit}
              >
                {isLoading ? t("editApiKeyModal.saving") : t("editApiKeyModal.confirm")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
