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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";

interface RenameEndpointModalProps {
  isOpen: boolean;
  onOpenChange: () => void;
  currentName: string;
  onRename: (newName: string) => Promise<void>;
}

export default function RenameEndpointModal({
  isOpen,
  onOpenChange,
  currentName,
  onRename
}: RenameEndpointModalProps) {
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async () => {
    if (!newName.trim() || newName === currentName) {
      return;
    }

    try {
      setIsLoading(true);
      await onRename(newName.trim());
      onOpenChange();
    } catch (error) {
      // 错误处理由父组件负责
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faPen} className="text-primary" />
                <span>重命名主控</span>
              </div>
            </ModalHeader>
            
            <ModalBody>
              <Input
                label="主控名称"
                placeholder="请输入新的主控名称"
                value={newName}
                onValueChange={setNewName}
                variant="bordered"
                isRequired
                autoFocus
                maxLength={25}
                endContent={<span className="text-xs text-default-500">{newName.length}/25</span>}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit();
                  }
                }}
              />
            </ModalBody>
            
            <ModalFooter>
              <Button 
                color="default" 
                variant="light" 
                onPress={onClose}
                isDisabled={isLoading}
              >
                取消
              </Button>
              <Button 
                color="primary" 
                onPress={handleSubmit}
                isLoading={isLoading}
                isDisabled={!newName.trim() || newName === currentName}
              >
                {isLoading ? '保存中...' : '保存'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}