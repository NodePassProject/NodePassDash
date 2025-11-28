import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave } from "@fortawesome/free-solid-svg-icons";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface RenameEndpointModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  onRename: (newName: string) => void;
  currentName: string;
}

export default function RenameEndpointModal({
  isOpen,
  onOpenChange,
  onRename,
  currentName,
}: RenameEndpointModalProps) {
  const { t } = useTranslation("endpoints");
  const [newName, setNewName] = useState(currentName);

  // 当模态框打开时，设置初始名称
  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = () => {
    if (newName.trim() && newName !== currentName) {
      onRename(newName.trim());
    }
    onOpenChange();
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      placement="center"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              {t("renameModal.title")}
            </ModalHeader>
            <ModalBody>
              <Input
                isRequired
                label={t("renameModal.label")}
                placeholder={t("renameModal.placeholder")}
                value={newName}
                variant="bordered"
                onValueChange={setNewName}
              />
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={onClose}>
                {t("renameModal.cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={!newName.trim() || newName === currentName}
                startContent={<FontAwesomeIcon icon={faSave} />}
                onPress={handleSubmit}
              >
                {t("renameModal.save")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
