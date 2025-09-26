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
                <span>修改 API 密钥</span>
              </div>
              <p className="text-small text-default-500">
                主控：{endpointName}
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
                        ⚠️ 重要提醒
                      </h4>
                      <p className="text-sm text-warning-700">
                        修改API密钥后，当前连接将断开，需要使用新密钥重新连接主控。
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
                  label="新 API 密钥"
                  placeholder="请输入新的API密钥"
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
                取消
              </Button>
              <Button
                color="warning"
                isDisabled={!newApiKey.trim() || newApiKey === currentApiKey}
                isLoading={isLoading}
                onPress={handleSubmit}
              >
                {isLoading ? "保存中..." : "确认修改"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
