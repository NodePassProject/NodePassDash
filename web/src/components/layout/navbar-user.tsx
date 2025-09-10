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
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useAuth } from "@/components/auth/auth-provider";
import { useState, useRef } from "react";
import { addToast } from "@heroui/toast";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "@/lib/utils";

export const NavbarUser = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { isOpen: isPasswordOpen, onOpen: onPasswordOpen, onOpenChange: onPasswordOpenChange } = useDisclosure();
  const { isOpen: isUsernameOpen, onOpen: onUsernameOpen, onOpenChange: onUsernameOpenChange } = useDisclosure();
  const { isOpen: isImportOpen, onOpen: onImportOpen, onOpenChange: onImportOpenChange } = useDisclosure();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
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
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      addToast({
        title: "表单验证失败",
        description: "请填写所有密码字段",
        color: "danger",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast({
        title: "密码不匹配",
        description: "新密码和确认密码不一致",
        color: "danger",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      addToast({
        title: "密码太短",
        description: "新密码长度至少为6位",
        color: "danger",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      const response = await fetch(buildApiUrl('/api/auth/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: "密码修改成功",
          description: "您的密码已成功更新",
          color: "success",
        });
        
        // 重置表单并关闭模态框
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
        onPasswordOpenChange();
      } else {
        addToast({
          title: "密码修改失败",
          description: result.message || "请检查您的当前密码是否正确",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('修改密码失败:', error);
      addToast({
        title: "网络错误",
        description: "请检查网络连接后重试",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (field: string, value: string) => {
    setPasswordForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleUsernameChange = async () => {
    // 验证表单
    if (!newUsername) {
      addToast({
        title: "表单验证失败",
        description: "请填写新用户名",
        color: "danger",
      });
      return;
    }

    if (newUsername === user?.username) {
      addToast({
        title: "用户名相同",
        description: "新用户名不能与当前用户名相同",
        color: "danger",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      
      const response = await fetch(buildApiUrl('/api/auth/change-username'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newUsername
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: "用户名修改成功",
          description: "您的用户名已成功更新",
          color: "success",
        });
        
        // 重置表单并关闭模态框
        setNewUsername("");
        onUsernameOpenChange();
        // 刷新用户信息
        window.location.reload();
      } else {
        addToast({
          title: "用户名修改失败",
          description: result.message || "修改用户名时发生错误",
          color: "danger",
        });
      }
    } catch (error) {
      console.error('修改用户名失败:', error);
      addToast({
        title: "网络错误",
        description: "请检查网络连接后重试",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/data/export'));
      if (!response.ok) {
        throw new Error('导出失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nodepassdash-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        title: "导出成功",
        description: "数据已成功导出到文件",
        color: "success",
      });
    } catch (error) {
      console.error('导出数据失败:', error);
      addToast({
        title: "导出失败",
        description: "导出数据时发生错误",
        color: "danger",
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/json') {
        addToast({
          title: "文件格式错误",
          description: "请选择 JSON 格式的文件",
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
        title: "请选择文件",
        description: "请先选择要导入的端点配置文件",
        color: "danger",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const fileContent = await selectedFile.text();
      const importData = JSON.parse(fileContent);

      const response = await fetch(buildApiUrl('/api/data/import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(importData),
      });

      const result = await response.json();

      if (response.ok) {
        addToast({
          title: "导入成功",
          description: result.message,
          color: "success",
        });
        onImportOpenChange();
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // 添加延迟以确保 Toast 消息能够显示
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error(result.error || '导入失败');
      }
    } catch (error) {
      console.error('导入数据失败:', error);
      addToast({
        title: "导入失败",
        description: error instanceof Error ? error.message : "导入数据时发生错误",
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
            as="button"
            className="transition-transform"
            color="primary"
            name={user?.username}
            size="sm"
            showFallback
          />
        </DropdownTrigger>
        <DropdownMenu 
          aria-label="用户菜单"
          variant="flat"
          className="w-[240px]"
          onAction={(key) => {
            if (key === 'logout') {
              handleLogout();
            } else if (key === 'change-password') {
              onPasswordOpen();
            } else if (key === 'change-username') {
              onUsernameOpen();
            } else if (key === 'export-data') {
              handleExportData();
            } else if (key === 'import-data') {
              onImportOpen();
            } else if (key === 'system-settings') {
              navigate('/settings');
            }
          }}
        >
          {/* 用户信息 */}
          <DropdownItem key="profile" className="h-14 gap-2">
            <p className="font-semibold">已登录为</p>
            <p className="font-semibold">{user?.username}</p>
          </DropdownItem>
          
          {/* 修改用户名 */}
          <DropdownItem 
            key="change-username"
            startContent={<Icon icon="solar:user-id-linear" width={18} />}
          >
            修改用户名
          </DropdownItem>
          
          {/* 修改密码 */}
          <DropdownItem 
            key="change-password"
            startContent={<Icon icon="solar:key-linear" width={18} />}
          >
            修改密码
          </DropdownItem>
          
          {/* 导出数据 */}
          <DropdownItem
            key="export-data"
            startContent={<Icon icon="solar:upload-square-linear" width={18} />}
            isDisabled={isSubmitting}
          >
            导出数据
          </DropdownItem>

          {/* 导入数据 */}
          <DropdownItem
            key="import-data"
            startContent={<Icon icon="solar:download-square-linear" width={18} />}
            isDisabled={isSubmitting}
          >
            导入数据
          </DropdownItem>

          {/* 系统设置 */}
          <DropdownItem
            key="system-settings"
            startContent={<Icon icon="solar:settings-linear" width={18} />}
          >
            系统设置
          </DropdownItem>
          
          {/* 退出登录 */}
          <DropdownItem 
            key="logout" 
            color="danger"
            startContent={<Icon icon="solar:logout-3-linear" width={18} />}
          >
            退出登录
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      {/* 修改密码模态框 */}
      <Modal 
        isOpen={isPasswordOpen} 
        onOpenChange={onPasswordOpenChange}
        placement="center"
        backdrop="blur"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:key-bold" className="text-primary" width={24} />
                  修改密码
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label="当前密码"
                    placeholder="请输入当前密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.currentPassword}
                    onChange={(e) => handleFormChange('currentPassword', e.target.value)}
                    startContent={<Icon icon="solar:lock-password-linear" width={18} />}
                  />
                  
                  <Input
                    label="新密码"
                    placeholder="请输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.newPassword}
                    onChange={(e) => handleFormChange('newPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                  />
                  
                  <Input
                    label="确认新密码"
                    placeholder="请再次输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handleFormChange('confirmPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                  />
                  
                  <div className="text-small text-default-500">
                    <p>• 密码长度至少为6位</p>
                    <p>• 建议包含字母、数字和特殊字符</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="danger" 
                  variant="light" 
                  onPress={onClose}
                  isDisabled={isSubmitting}
                >
                  取消
                </Button>
                <Button 
                  color="primary" 
                  onPress={handlePasswordChange}
                  isLoading={isSubmitting}
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}
                >
                  {isSubmitting ? "修改中..." : "确认修改"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 修改用户名模态框 */}
      <Modal 
        isOpen={isUsernameOpen} 
        onOpenChange={onUsernameOpenChange}
        placement="center"
        backdrop="blur"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:user-id-bold" className="text-primary" width={24} />
                  修改用户名
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label="新用户名"
                    placeholder="请输入新用户名"
                    variant="bordered"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    startContent={<Icon icon="solar:user-linear" width={18} />}
                  />
                  
                  <div className="text-small text-default-500">
                    <p>• 用户名将用于系统显示和登录</p>
                    <p>• 修改后需要重新登录</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="danger" 
                  variant="light" 
                  onPress={onClose}
                  isDisabled={isSubmitting}
                >
                  取消
                </Button>
                <Button 
                  color="primary" 
                  onPress={handleUsernameChange}
                  isLoading={isSubmitting}
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}
                >
                  {isSubmitting ? "修改中..." : "确认修改"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 导入数据模态框 */}
      <Modal 
        isOpen={isImportOpen} 
        onOpenChange={onImportOpenChange}
        placement="center"
        backdrop="blur"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:import-bold" className="text-primary" width={24} />
                  导入数据
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      color="primary"
                      variant="light"
                      startContent={<Icon icon="solar:folder-with-files-linear" width={18} />}
                      onPress={() => fileInputRef.current?.click()}
                      isDisabled={isSubmitting}
                    >
                      选择文件
                    </Button>
                    <span className="text-small text-default-500">
                      {selectedFile ? selectedFile.name : '未选择文件'}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                  
                  <div className="text-small text-default-500">
                    <p>• 请选择之前导出的 JSON 格式数据文件</p>
                    <p>• 导入过程中请勿关闭窗口</p>
                    <p>• 重复的数据将被自动跳过</p>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button 
                  color="danger" 
                  variant="light" 
                  onPress={onClose}
                  isDisabled={isSubmitting}
                >
                  取消
                </Button>
                <Button 
                  color="primary" 
                  onPress={handleImportData}
                  isLoading={isSubmitting}
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}
                >
                  {isSubmitting ? "导入中..." : "开始导入"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};