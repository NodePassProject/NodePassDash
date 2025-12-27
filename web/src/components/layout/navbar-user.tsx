import {
  Avatar,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useState, useRef } from "react";
import { addToast } from "@heroui/toast";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/components/auth/auth-provider";
import { buildApiUrl } from "@/lib/utils";

export const NavbarUser = () => {
  const { t } = useTranslation("common");
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const {
    isOpen: isPasswordOpen,
    onOpen: onPasswordOpen,
    onOpenChange: onPasswordOpenChange,
  } = useDisclosure();
  const {
    isOpen: isUsernameOpen,
    onOpen: onUsernameOpen,
    onOpenChange: onUsernameOpenChange,
  } = useDisclosure();
  const {
    isOpen: isImportOpen,
    onOpen: onImportOpen,
    onOpenChange: onImportOpenChange,
  } = useDisclosure();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [newUsername, setNewUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogout = async () => {
    await logout();
  };

  const handlePasswordChange = async () => {
    // 验证表单
    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
      addToast({
        title: t("navbarUser.toast.passwordValidationFailed"),
        description: t("navbarUser.toast.passwordValidationFailedDesc"),
        color: "danger",
      });

      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast({
        title: t("navbarUser.toast.passwordMismatch"),
        description: t("navbarUser.toast.passwordMismatchDesc"),
        color: "danger",
      });

      return;
    }

    if (passwordForm.newPassword.length < 6) {
      addToast({
        title: t("navbarUser.toast.passwordTooShort"),
        description: t("navbarUser.toast.passwordTooShortDesc"),
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(buildApiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: t("navbarUser.toast.passwordChangeSuccess"),
          description: t("navbarUser.toast.passwordChangeSuccessDesc"),
          color: "success",
        });

        // 重置表单并关闭模态框
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        onPasswordOpenChange();
      } else {
        addToast({
          title: t("navbarUser.toast.passwordChangeFailed"),
          description: result.message || t("navbarUser.toast.passwordChangeFailedDesc"),
          color: "danger",
        });
      }
    } catch (error) {
      console.error("修改密码失败:", error);
      addToast({
        title: t("navbarUser.toast.networkError"),
        description: t("navbarUser.toast.networkErrorDesc"),
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (field: string, value: string) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleUsernameChange = async () => {
    // 验证表单
    if (!newUsername) {
      addToast({
        title: t("navbarUser.toast.usernameValidationFailed"),
        description: t("navbarUser.toast.usernameValidationFailedDesc"),
        color: "danger",
      });

      return;
    }

    if (newUsername === user?.username) {
      addToast({
        title: t("navbarUser.toast.usernameSame"),
        description: t("navbarUser.toast.usernameSameDesc"),
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(buildApiUrl("/api/auth/change-username"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newUsername,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: t("navbarUser.toast.usernameChangeSuccess"),
          description: t("navbarUser.toast.usernameChangeSuccessDesc"),
          color: "success",
        });

        // 重置表单并关闭模态框
        setNewUsername("");
        onUsernameOpenChange();
        // 刷新用户信息
        window.location.reload();
      } else {
        addToast({
          title: t("navbarUser.toast.usernameChangeFailed"),
          description: result.message || t("navbarUser.toast.usernameChangeFailedDesc"),
          color: "danger",
        });
      }
    } catch (error) {
      console.error("修改用户名失败:", error);
      addToast({
        title: t("navbarUser.toast.networkError"),
        description: t("navbarUser.toast.networkErrorDesc"),
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch(buildApiUrl("/api/data/export"));

      if (!response.ok) {
        throw new Error(t("navbarUser.toast.exportFailed"));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `nodepassdash-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        title: t("navbarUser.toast.exportSuccess"),
        description: t("navbarUser.toast.exportSuccessDesc"),
        color: "success",
      });
    } catch (error) {
      console.error("导出数据失败:", error);
      addToast({
        title: t("navbarUser.toast.exportFailed"),
        description: t("navbarUser.toast.exportFailedDesc"),
        color: "danger",
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      if (file.type !== "application/json") {
        addToast({
          title: t("navbarUser.toast.fileFormatError"),
          description: t("navbarUser.toast.fileFormatErrorDesc"),
          color: "danger",
        });

        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImportData = async () => {
    if (!selectedFile) {
      addToast({
        title: t("navbarUser.toast.fileRequired"),
        description: t("navbarUser.toast.fileRequiredDesc"),
        color: "danger",
      });

      return;
    }

    try {
      setIsSubmitting(true);
      const fileContent = await selectedFile.text();
      const importData = JSON.parse(fileContent);

      const response = await fetch(buildApiUrl("/api/data/import"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(importData),
      });

      const result = await response.json();

      if (response.ok) {
        addToast({
          title: t("navbarUser.toast.importSuccess"),
          description: result.message,
          color: "success",
        });
        onImportOpenChange();
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        // 添加延迟以确保 Toast 消息能够显示
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error(result.error || t("navbarUser.toast.importFailed"));
      }
    } catch (error) {
      console.error("导入数据失败:", error);
      addToast({
        title: t("navbarUser.toast.importFailed"),
        description:
          error instanceof Error ? error.message : t("navbarUser.toast.importFailedDesc"),
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return null; // 未登录时不显示用户菜单
  }

  return (
    <>
      <Dropdown placement="bottom-end">
        <DropdownTrigger>
          <Avatar
            isBordered
            showFallback
            as="button"
            className="transition-transform"
            color="primary"
            name={user?.username}
            size="sm"
          />
        </DropdownTrigger>
        <DropdownMenu
          aria-label={t("navbarUser.menu.ariaLabel")}
          className="w-[240px]"
          variant="flat"
          onAction={(key) => {
            if (key === "logout") {
              handleLogout();
            } else if (key === "change-password") {
              onPasswordOpen();
            } else if (key === "change-username") {
              onUsernameOpen();
            } else if (key === "export-data") {
              handleExportData();
            } else if (key === "import-data") {
              onImportOpen();
            } else if (key === "system-settings") {
              navigate("/settings");
            }
          }}
        >
          {/* 用户信息 */}
          <DropdownItem key="profile" className="h-14 gap-2">
            <p className="font-semibold">{t("navbarUser.menu.loggedInAs")}</p>
            <p className="font-semibold">{user?.username}</p>
          </DropdownItem>

          {/* 修改用户名 */}
          <DropdownItem
            key="change-username"
            startContent={<Icon icon="solar:user-id-linear" width={18} />}
          >
            {t("navbarUser.menu.changeUsername")}
          </DropdownItem>

          {/* 修改密码 */}
          <DropdownItem
            key="change-password"
            startContent={<Icon icon="solar:key-linear" width={18} />}
          >
            {t("navbarUser.menu.changePassword")}
          </DropdownItem>

          {/* 导出数据 */}
          <DropdownItem
            key="export-data"
            isDisabled={isSubmitting}
            startContent={<Icon icon="solar:upload-square-linear" width={18} />}
          >
            {t("navbarUser.menu.exportData")}
          </DropdownItem>

          {/* 导入数据 */}
          <DropdownItem
            key="import-data"
            isDisabled={isSubmitting}
            startContent={
              <Icon icon="solar:download-square-linear" width={18} />
            }
          >
            {t("navbarUser.menu.importData")}
          </DropdownItem>

          {/* 系统设置 */}
          <DropdownItem
            key="system-settings"
            startContent={<Icon icon="solar:settings-linear" width={18} />}
          >
            {t("navbarUser.menu.systemSettings")}
          </DropdownItem>

          {/* 退出登录 */}
          <DropdownItem
            key="logout"
            color="danger"
            startContent={<Icon icon="solar:logout-3-linear" width={18} />}
          >
            {t("navbarUser.menu.logout")}
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      {/* 修改密码模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          backdrop:
            "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
        }}
        isOpen={isPasswordOpen}
        placement="center"
        onOpenChange={onPasswordOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-primary"
                    icon="solar:key-bold"
                    width={24}
                  />
                  {t("navbarUser.changePassword.title")}
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label={t("navbarUser.changePassword.currentPassword")}
                    placeholder={t("navbarUser.changePassword.currentPasswordPlaceholder")}
                    startContent={
                      <Icon icon="solar:lock-password-linear" width={18} />
                    }
                    type="password"
                    value={passwordForm.currentPassword}
                    variant="bordered"
                    onChange={(e) =>
                      handleFormChange("currentPassword", e.target.value)
                    }
                  />

                  <Input
                    label={t("navbarUser.changePassword.newPassword")}
                    placeholder={t("navbarUser.changePassword.newPasswordPlaceholder")}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                    type="password"
                    value={passwordForm.newPassword}
                    variant="bordered"
                    onChange={(e) =>
                      handleFormChange("newPassword", e.target.value)
                    }
                  />

                  <Input
                    label={t("navbarUser.changePassword.confirmPassword")}
                    placeholder={t("navbarUser.changePassword.confirmPasswordPlaceholder")}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                    type="password"
                    value={passwordForm.confirmPassword}
                    variant="bordered"
                    onChange={(e) =>
                      handleFormChange("confirmPassword", e.target.value)
                    }
                  />

                  <div className="text-small text-default-500">
                    <p>{t("navbarUser.changePassword.hint1")}</p>
                    <p>{t("navbarUser.changePassword.hint2")}</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={onClose}
                >
                  {t("navbarUser.changePassword.cancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-linear" width={18} />
                    ) : null
                  }
                  onPress={handlePasswordChange}
                >
                  {isSubmitting ? t("navbarUser.changePassword.submitting") : t("navbarUser.changePassword.submit")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 修改用户名模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          backdrop:
            "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
        }}
        isOpen={isUsernameOpen}
        placement="center"
        onOpenChange={onUsernameOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-primary"
                    icon="solar:user-id-bold"
                    width={24}
                  />
                  {t("navbarUser.changeUsername.title")}
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label={t("navbarUser.changeUsername.newUsername")}
                    placeholder={t("navbarUser.changeUsername.newUsernamePlaceholder")}
                    startContent={<Icon icon="solar:user-linear" width={18} />}
                    value={newUsername}
                    variant="bordered"
                    onChange={(e) => setNewUsername(e.target.value)}
                  />

                  <div className="text-small text-default-500">
                    <p>{t("navbarUser.changeUsername.hint1")}</p>
                    <p>{t("navbarUser.changeUsername.hint2")}</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={onClose}
                >
                  {t("navbarUser.changeUsername.cancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-linear" width={18} />
                    ) : null
                  }
                  onPress={handleUsernameChange}
                >
                  {isSubmitting ? t("navbarUser.changeUsername.submitting") : t("navbarUser.changeUsername.submit")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 导入数据模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          backdrop:
            "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20",
        }}
        isOpen={isImportOpen}
        placement="center"
        onOpenChange={onImportOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon
                    className="text-primary"
                    icon="solar:import-bold"
                    width={24}
                  />
                  {t("navbarUser.importData.title")}
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      color="primary"
                      isDisabled={isSubmitting}
                      startContent={
                        <Icon
                          icon="solar:folder-with-files-linear"
                          width={18}
                        />
                      }
                      variant="light"
                      onPress={() => fileInputRef.current?.click()}
                    >
                      {t("navbarUser.importData.selectFile")}
                    </Button>
                    <span className="text-small text-default-500">
                      {selectedFile ? selectedFile.name : t("navbarUser.importData.noFileSelected")}
                    </span>
                    <input
                      ref={fileInputRef}
                      accept=".json"
                      className="hidden"
                      type="file"
                      onChange={handleFileSelect}
                    />
                  </div>

                  <div className="text-small text-default-500">
                    <p>{t("navbarUser.importData.hint1")}</p>
                    <p>{t("navbarUser.importData.hint2")}</p>
                    <p>{t("navbarUser.importData.hint3")}</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={onClose}
                >
                  {t("navbarUser.importData.cancel")}
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-linear" width={18} />
                    ) : null
                  }
                  onPress={handleImportData}
                >
                  {isSubmitting ? t("navbarUser.importData.submitting") : t("navbarUser.importData.submit")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};
