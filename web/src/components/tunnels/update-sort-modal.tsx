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

interface UpdateSortModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tunnelId: string;
  currentSort: string;
  onUpdated?: (newSort: string) => void;
}

export default function UpdateSortModal({
  isOpen,
  onOpenChange,
  tunnelId,
  currentSort,
  onUpdated,
}: UpdateSortModalProps) {
  const [newSort, setNewSort] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 当模态框打开时，设置当前权重
  React.useEffect(() => {
    if (isOpen) {
      setNewSort(currentSort);
    }
  }, [isOpen, currentSort]);

  const handleSubmit = async () => {
    // 允许空值（表示0）
    const sortValue = newSort.trim();

    try {
      setIsLoading(true);
      const response = await fetch(buildApiUrl(`/api/tunnels/${tunnelId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "updateSort",
          sorts: sortValue ? parseInt(sortValue) : 0,
        }),
      });

      if (!response.ok) throw new Error("修改权重失败");

      addToast({
        title: "修改成功",
        description: "权重已更新",
        color: "success",
      });

      onUpdated?.(sortValue);
      onOpenChange(false);
    } catch (error) {
      console.error("修改权重失败:", error);
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
    <Modal isOpen={isOpen} placement="center" size="sm" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon className="text-primary" icon={faPen} />
                修改权重
              </div>
            </ModalHeader>
            <ModalBody>
              <Input
                autoFocus
                isDisabled={isLoading}
                label="权重(越大越前)"
                placeholder="0"
                type="number"
                value={newSort}
                variant="bordered"
                onKeyDown={handleKeyDown}
                onValueChange={setNewSort}
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
                isDisabled={newSort.trim() === currentSort}
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
