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

import { useTextLimit, TEXT_LIMITS } from "@/lib/utils/text-limits";

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
  onRename,
}: RenameEndpointModalProps) {
  const [newName, setNewName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 使用公共的文本限制工具
  const textLimit = useTextLimit(newName, TEXT_LIMITS.ENDPOINT_NAME);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async () => {
    if (!newName.trim() || newName === currentName || textLimit.isOverLimit) {
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
    <Modal isOpen={isOpen} placement="center" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faPen} />
                <span>重命名主控</span>
              </div>
            </ModalHeader>

            <ModalBody>
              <Input
                autoFocus
                isRequired
                description={textLimit.description}
                label="主控名称"
                placeholder="请输入新的主控名称"
                value={newName}
                variant="bordered"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSubmit();
                  }
                }}
                onValueChange={setNewName}
              />
            </ModalBody>

            <ModalFooter>
              <Button
                color="default"
                isDisabled={isLoading}
                variant="light"
                onPress={onClose}
              >
                取消
              </Button>
              <Button
                color="primary"
                isDisabled={
                  !newName.trim() ||
                  newName === currentName ||
                  textLimit.isOverLimit
                }
                isLoading={isLoading}
                onPress={handleSubmit}
              >
                {isLoading ? "保存中..." : "保存"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
