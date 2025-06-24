"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button
} from "@heroui/react";
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
  title = "手动复制"
}: ManualCopyModalProps) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center" size="lg">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faCopy} className="text-primary" />
                {title}
              </div>
            </ModalHeader>
            <ModalBody>
              <p className="text-default-600 mb-3">
                自动复制失败，请手动选择并复制以下内容：
              </p>
              <div className="bg-default-100 p-3 rounded-lg">
                <pre className="text-small font-mono whitespace-pre-wrap break-all select-all">
                  {text}
                </pre>
              </div>
              <p className="text-small text-default-500 mt-2">
                💡 提示：点击上方文本框可全选内容，然后使用 Ctrl+C (Windows) 或 Cmd+C (Mac) 复制
              </p>
            </ModalBody>
            <ModalFooter>
              <Button color="primary" onPress={onClose}>
                知道了
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
} 