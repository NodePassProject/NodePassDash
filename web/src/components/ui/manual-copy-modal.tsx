"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy } from "@fortawesome/free-solid-svg-icons";

interface ManualCopyModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  text: string;
  title?: string;
}

export default function ManualCopyModal({
  isOpen,
  onOpenChange,
  text,
  title,
}: ManualCopyModalProps) {
  const { t } = useTranslation("modals");

  return (
    <Modal
      isOpen={isOpen}
      placement="center"
      size="lg"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faCopy} />
                {title || t("manualCopy.defaultTitle")}
              </div>
            </ModalHeader>
            <ModalBody>
              <p className="text-default-600 mb-3">
                {t("manualCopy.description")}
              </p>
              <div className="bg-default-100 p-3 rounded-lg">
                <pre className="text-small font-mono whitespace-pre-wrap break-all select-all">
                  {text}
                </pre>
              </div>
              <p className="text-small text-default-500 mt-2">
                {t("manualCopy.hint")}
              </p>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" onPress={onClose}>
                {t("manualCopy.understood")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
