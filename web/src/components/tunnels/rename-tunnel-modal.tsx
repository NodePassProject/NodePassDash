import React, { useState } from "react";
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
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";
import { useTextLimit, TEXT_LIMITS } from "@/lib/utils/text-limits";

interface RenameTunnelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: number;
  currentName: string;
  onRenamed?: (newName: string) => void;
}

export default function RenameTunnelModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentName,
  onRenamed,
}: RenameTunnelModalProps) {
  const [newTunnelName, setNewTunnelName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 使用公共的文本限制工具
  const textLimit = useTextLimit(newTunnelName, TEXT_LIMITS.TUNNEL_NAME);

  // 当模态框打开时，设置当前名称
  React.useEffect(() => {
    if (isOpen) {
      setNewTunnelName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async () => {
    if (!newTunnelName.trim() || textLimit.isOverLimit) return;

    try {
      setIsLoading(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "rename",
          name: newTunnelName.trim(),
        }),
      });

      if (!response.ok) throw new Error("修改名称失败");

      addToast({
        title: "修改成功",
        description: "实例名称已更新",
        color: "success",
      });

      onRenamed?.(newTunnelName.trim());
      onOpenChange(false);
    } catch (error) {
      console.error("修改名称失败:", error);
      addToast({
        title: "修改失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleSubmit();
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
                修改实例名称
              </div>
            </ModalHeader>
            <ModalBody>
              <Input
                autoFocus
                description={textLimit.description}
                isDisabled={isLoading}
                label="实例名称"
                placeholder="请输入新的实例名称"
                value={newTunnelName}
                variant="bordered"
                onKeyDown={handleKeyDown}
                onValueChange={setNewTunnelName}
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
                  !newTunnelName.trim() ||
                  newTunnelName.trim() === currentName ||
                  textLimit.isOverLimit
                }
                isLoading={isLoading}
                onPress={handleSubmit}
              >
                确认修改
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
