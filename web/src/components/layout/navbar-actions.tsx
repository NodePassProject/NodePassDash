import {
  Button,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Icon } from "@iconify/react";

import { useAuth } from "@/components/auth/auth-provider";

/**
 * 导航栏操作区域组件
 * 包含通知按钮和设置按钮
 */
export const NavbarActions = () => {
  // 通过上下文获取登出函数
  const { logout } = useAuth();

  // 控制模态窗
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // 点击确认按钮执行登出
  const handleConfirmLogout = async () => {
    await logout();
    onOpenChange();
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {/* 退出登录图标按钮 */}
        <Button isIconOnly color="danger" variant="light" onClick={onOpen}>
          <Icon icon="solar:logout-2-bold" width={18} />
        </Button>
      </div>

      {/* 退出确认模态窗 */}
      <Modal isOpen={isOpen} placement="center" onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                确认退出
              </ModalHeader>
              <ModalBody>您确定要退出登录吗？</ModalBody>
              <ModalFooter>
                <Button variant="light" onClick={onClose}>
                  取消
                </Button>
                <Button color="danger" onClick={handleConfirmLogout}>
                  确认退出
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};
