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
      isOpen={isOpen} 
      onOpenChange={onOpenChange}
      placement="center"
      backdrop="blur"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              修改主控名称
            </ModalHeader>
            <ModalBody>
              <Input
                label="主控名称"
                placeholder="请输入新的主控名称"
                value={newName}
                onValueChange={setNewName}
                variant="bordered"
                isRequired
              />
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="primary"
                onPress={handleSubmit}
                startContent={<FontAwesomeIcon icon={faSave} />}
                isDisabled={!newName.trim() || newName === currentName}
              >
                保存修改
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 