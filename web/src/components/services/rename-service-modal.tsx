import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@heroui/react";
import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { addToast } from "@heroui/toast";

import { buildApiUrl } from "@/lib/utils";

interface RenameServiceModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  service: {
    sid: string;
    alias?: string;
  } | null;
  onRenamed?: () => void;
}

export default function RenameServiceModal({
  isOpen,
  onOpenChange,
  service,
  onRenamed,
}: RenameServiceModalProps) {
  const [newName, setNewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 当模态窗打开或服务变化时,初始化输入框的值
  useEffect(() => {
    if (isOpen && service) {
      setNewName(service.alias || service.sid);
    }
  }, [isOpen, service]);

  const handleSubmit = async () => {
    if (!service || !newName.trim()) {
      addToast({
        title: "错误",
        description: "服务名称不能为空",
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(
        buildApiUrl(`/api/services/${service.sid}/rename`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName.trim() }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "重命名失败");
      }

      addToast({
        title: "重命名成功",
        description: `服务已重命名为 ${newName.trim()}`,
        color: "success",
      });

      // 调用回调函数刷新数据
      onRenamed?.();

      // 关闭模态窗
      onOpenChange(false);
    } catch (error) {
      console.error("重命名失败:", error);
      addToast({
        title: "重命名失败",
        description: error instanceof Error ? error.message : "未知错误",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2">
              <FontAwesomeIcon icon={faEdit} />
              重命名服务
            </ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-default-600 mb-2">
                    当前服务 SID: <span className="font-mono">{service?.sid}</span>
                  </p>
                </div>
                <Input
                  autoFocus
                  label="服务别名"
                  placeholder="请输入服务别名"
                  value={newName}
                  variant="bordered"
                  onValueChange={setNewName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isSubmitting) {
                      handleSubmit();
                    }
                  }}
                />
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                取消
              </Button>
              <Button
                color="primary"
                isDisabled={!newName.trim() || isSubmitting}
                isLoading={isSubmitting}
                onPress={handleSubmit}
              >
                确定
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
