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
                修改 API 密钥
              </div>
              <p className="text-small text-default-500 font-normal">
                主控: {endpointName}
              </p>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <label className="text-small text-default-600 mb-2 block">
                    当前 API Key
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
                    新 API Key <span className="text-danger">*</span>
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
                    placeholder="请输入新的 API Key"
                    size="sm"
                    type={isVisible ? "text" : "password"}
                    value={newApiKey}
                    variant="bordered"
                    onValueChange={setNewApiKey}
                  />
                </div>
                <div className="p-3 bg-warning-50 rounded-lg">
                  <p className="text-tiny text-warning-600">
                    ⚠️ 修改密钥后将自动断开并重新连接到主控
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
                取消
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
                {isLoading ? "保存中..." : "保存"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
