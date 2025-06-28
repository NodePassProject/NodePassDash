"use client";

import {
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  useDisclosure
} from "@heroui/react";
import React, { forwardRef, useImperativeHandle, useState } from "react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// 定义表单验证 schema
const securitySettingsSchema = z.object({
  // 保留空的 schema 以支持未来的设置项
});

type SecuritySettingsForm = z.infer<typeof securitySettingsSchema>;

// OAuth2 配置类型
interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  userIdPath: string;
  scopes?: string[];
}

// 定义组件 ref 类型
export type SecuritySettingsRef = {
  submitForm: () => Promise<void>;
  resetForm: () => void;
};

const SecuritySettings = forwardRef<SecuritySettingsRef>((props, ref) => {
  // 修改密码相关状态
  const { isOpen: isPasswordOpen, onOpen: onPasswordOpen, onOpenChange: onPasswordOpenChange } = useDisclosure();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OAuth2 配置相关状态
  const { isOpen: isGitHubOpen, onOpen: onGitHubOpen, onOpenChange: onGitHubOpenChange } = useDisclosure();
  const { isOpen: isCloudflareOpen, onOpen: onCloudflareOpen, onOpenChange: onCloudflareOpenChange } = useDisclosure();
  
  const [gitHubConfig, setGitHubConfig] = useState<OAuth2Config>({
    clientId: "",
    clientSecret: "",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    userIdPath: "id"
  });

  const [cloudflareConfig, setCloudflareConfig] = useState<OAuth2Config>({
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    userInfoUrl: "",
    userIdPath: "sub",
    scopes: ["openid", "profile"]
  });

  // 模拟的配置状态（实际应该从后端获取）
  const [isGitHubConfigured, setIsGitHubConfigured] = useState(false);
  const [isCloudflareConfigured, setIsCloudflareConfigured] = useState(false);

  // 初始化表单
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SecuritySettingsForm>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {},
  });

  // 修改密码功能（从 navbar-user.tsx 复制）
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
      
      const response = await fetch('/api/auth/change-password', {
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

  const handlePasswordFormChange = (field: string, value: string) => {
    setPasswordForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // GitHub OAuth2 配置保存
  const handleSaveGitHubConfig = async () => {
    try {
      setIsSubmitting(true);
      
      // TODO: 调用后端 API 保存 GitHub OAuth2 配置
      console.log("保存 GitHub OAuth2 配置:", gitHubConfig);
      
      addToast({
        title: "配置保存成功",
        description: "GitHub OAuth2 配置已成功保存",
        color: "success",
      });
      
      setIsGitHubConfigured(true);
      onGitHubOpenChange();
    } catch (error) {
      console.error('保存 GitHub 配置失败:', error);
      addToast({
        title: "保存失败",
        description: "保存 GitHub OAuth2 配置时发生错误",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cloudflare OAuth2 配置保存
  const handleSaveCloudflareConfig = async () => {
    try {
      setIsSubmitting(true);
      
      // TODO: 调用后端 API 保存 Cloudflare OAuth2 配置
      console.log("保存 Cloudflare OAuth2 配置:", cloudflareConfig);
      
      addToast({
        title: "配置保存成功",
        description: "Cloudflare OAuth2 配置已成功保存",
        color: "success",
      });
      
      setIsCloudflareConfigured(true);
      onCloudflareOpenChange();
    } catch (error) {
      console.error('保存 Cloudflare 配置失败:', error);
      addToast({
        title: "保存失败",
        description: "保存 Cloudflare OAuth2 配置时发生错误",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理表单提交
  const onSubmit = async (data: SecuritySettingsForm) => {
    try {
      // TODO: 调用后端 API 保存设置
      console.log("保存设置:", data);
    } catch (error) {
      console.error("保存设置失败:", error);
      throw error;
    }
  };

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    submitForm: () => handleSubmit(onSubmit)(),
    resetForm: () => reset(),
  }));

  return (
    <>
      <form>
        <Card className="mt-5 p-2">
          <CardBody className="gap-8">
            <div className="space-y-6">
              {/* 修改密码 */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-medium">修改密码</h3>
                  <p className="text-sm text-default-500">定期更新密码以提高账户安全性</p>
                </div>
                <Button 
                  color="primary" 
                  variant="flat"
                  onPress={onPasswordOpen}
                  startContent={<Icon icon="solar:key-linear" width={18} />}
                >
                  修改密码
                </Button>
              </div>
              
              <Divider />
              
              {/* GitHub OAuth2 配置 */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:course-up-linear" width={20} className="text-default-600" />
                    <h3 className="text-base font-medium">GitHub OAuth2</h3>
                    <Chip color="warning" size="sm" variant="flat">开发中</Chip>
                  </div>
                  <p className="text-sm text-default-500">配置 GitHub OAuth2 登录集成</p>
                </div>
                <Button 
                  color="default"
                  variant="flat"
                  isDisabled
                  onPress={() => {
                    addToast({
                      title: "功能开发中",
                      description: "GitHub OAuth2 配置功能正在开发中，敬请期待",
                      color: "warning",
                    });
                  }}
                  startContent={<Icon icon="solar:settings-linear" width={18} />}
                >
                  配置
                </Button>
              </div>
              
              <Divider />
              
              {/* Cloudflare OAuth2 配置 */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon icon="solar:cloud-linear" width={20} className="text-default-600" />
                    <h3 className="text-base font-medium">Cloudflare OAuth2</h3>
                    <Chip color="warning" size="sm" variant="flat">开发中</Chip>
                  </div>
                  <p className="text-sm text-default-500">配置 Cloudflare Access OAuth2 登录集成</p>
                </div>
                <Button 
                  color="default"
                  variant="flat"
                  isDisabled
                  onPress={() => {
                    addToast({
                      title: "功能开发中",
                      description: "Cloudflare OAuth2 配置功能正在开发中，敬请期待",
                      color: "warning",
                    });
                  }}
                  startContent={<Icon icon="solar:settings-linear" width={18} />}
                >
                  配置
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </form>

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
                    onChange={(e) => handlePasswordFormChange('currentPassword', e.target.value)}
                    startContent={<Icon icon="solar:lock-password-linear" width={18} />}
                  />
                  
                  <Input
                    label="新密码"
                    placeholder="请输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordFormChange('newPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                  />
                  
                  <Input
                    label="确认新密码"
                    placeholder="请再次输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordFormChange('confirmPassword', e.target.value)}
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

      {/* GitHub OAuth2 配置模态框 */}
      <Modal 
        isOpen={isGitHubOpen} 
        onOpenChange={onGitHubOpenChange}
        placement="center"
        backdrop="blur"
        size="2xl"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:course-up-bold" className="text-primary" width={24} />
                  配置 GitHub OAuth2
                </div>
                <p className="text-sm text-default-500">设置 GitHub OAuth2 登录集成参数</p>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Client ID"
                      placeholder="输入 GitHub OAuth App Client ID"
                      variant="bordered"
                      value={gitHubConfig.clientId}
                      onChange={(e) => setGitHubConfig(prev => ({ ...prev, clientId: e.target.value }))}
                      startContent={<Icon icon="solar:key-linear" width={18} />}
                    />
                    
                    <Input
                      label="Client Secret"
                      placeholder="输入 GitHub OAuth App Client Secret"
                      type="password"
                      variant="bordered"
                      value={gitHubConfig.clientSecret}
                      onChange={(e) => setGitHubConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                      startContent={<Icon icon="solar:lock-password-linear" width={18} />}
                    />
                  </div>
                  
                  <Input
                    label="Auth URL"
                    placeholder="GitHub 授权端点 URL"
                    variant="bordered"
                    value={gitHubConfig.authUrl}
                    onChange={(e) => setGitHubConfig(prev => ({ ...prev, authUrl: e.target.value }))}
                    startContent={<Icon icon="solar:link-linear" width={18} />}
                  />
                  
                  <Input
                    label="Token URL"
                    placeholder="GitHub Token 端点 URL"
                    variant="bordered"
                    value={gitHubConfig.tokenUrl}
                    onChange={(e) => setGitHubConfig(prev => ({ ...prev, tokenUrl: e.target.value }))}
                    startContent={<Icon icon="solar:link-linear" width={18} />}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="User Info URL"
                      placeholder="GitHub 用户信息端点 URL"
                      variant="bordered"
                      value={gitHubConfig.userInfoUrl}
                      onChange={(e) => setGitHubConfig(prev => ({ ...prev, userInfoUrl: e.target.value }))}
                      startContent={<Icon icon="solar:link-linear" width={18} />}
                    />
                    
                    <Input
                      label="User ID Path"
                      placeholder="用户 ID 字段路径"
                      variant="bordered"
                      value={gitHubConfig.userIdPath}
                      onChange={(e) => setGitHubConfig(prev => ({ ...prev, userIdPath: e.target.value }))}
                      startContent={<Icon icon="solar:user-linear" width={18} />}
                    />
                  </div>
                  
                  <div className="text-small text-default-500">
                    <p>• 请确保在 GitHub OAuth App 设置中正确配置回调 URL</p>
                    <p>• Client Secret 将被安全加密存储</p>
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
                  onPress={handleSaveGitHubConfig}
                  isLoading={isSubmitting}
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}
                >
                  {isSubmitting ? "保存中..." : "保存配置"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Cloudflare OAuth2 配置模态框 */}
      <Modal 
        isOpen={isCloudflareOpen} 
        onOpenChange={onCloudflareOpenChange}
        placement="center"
        backdrop="blur"
        size="2xl"
        classNames={{
          backdrop: "bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="solar:cloud-bold" className="text-primary" width={24} />
                  配置 Cloudflare OAuth2
                </div>
                <p className="text-sm text-default-500">设置 Cloudflare Access OAuth2 登录集成参数</p>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Client ID"
                      placeholder="输入 Cloudflare Access Client ID"
                      variant="bordered"
                      value={cloudflareConfig.clientId}
                      onChange={(e) => setCloudflareConfig(prev => ({ ...prev, clientId: e.target.value }))}
                      startContent={<Icon icon="solar:key-linear" width={18} />}
                    />
                    
                    <Input
                      label="Client Secret"
                      placeholder="输入 Cloudflare Access Client Secret"
                      type="password"
                      variant="bordered"
                      value={cloudflareConfig.clientSecret}
                      onChange={(e) => setCloudflareConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                      startContent={<Icon icon="solar:lock-password-linear" width={18} />}
                    />
                  </div>
                  
                  <Input
                    label="Auth URL"
                    placeholder="Cloudflare Access 授权端点 URL"
                    variant="bordered"
                    value={cloudflareConfig.authUrl}
                    onChange={(e) => setCloudflareConfig(prev => ({ ...prev, authUrl: e.target.value }))}
                    startContent={<Icon icon="solar:link-linear" width={18} />}
                  />
                  
                  <Input
                    label="Token URL"
                    placeholder="Cloudflare Access Token 端点 URL"
                    variant="bordered"
                    value={cloudflareConfig.tokenUrl}
                    onChange={(e) => setCloudflareConfig(prev => ({ ...prev, tokenUrl: e.target.value }))}
                    startContent={<Icon icon="solar:link-linear" width={18} />}
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="User Info URL"
                      placeholder="Cloudflare Access 用户信息端点 URL"
                      variant="bordered"
                      value={cloudflareConfig.userInfoUrl}
                      onChange={(e) => setCloudflareConfig(prev => ({ ...prev, userInfoUrl: e.target.value }))}
                      startContent={<Icon icon="solar:link-linear" width={18} />}
                    />
                    
                    <Input
                      label="User ID Path"
                      placeholder="用户 ID 字段路径"
                      variant="bordered"
                      value={cloudflareConfig.userIdPath}
                      onChange={(e) => setCloudflareConfig(prev => ({ ...prev, userIdPath: e.target.value }))}
                      startContent={<Icon icon="solar:user-linear" width={18} />}
                    />
                  </div>
                  
                  <Input
                    label="Scopes"
                    placeholder="OAuth2 权限范围 (以空格分隔)"
                    variant="bordered"
                    value={cloudflareConfig.scopes?.join(' ') || ''}
                    onChange={(e) => setCloudflareConfig(prev => ({ 
                      ...prev, 
                      scopes: e.target.value.split(' ').filter(scope => scope.trim()) 
                    }))}
                    startContent={<Icon icon="solar:shield-check-linear" width={18} />}
                  />
                  
                  <div className="text-small text-default-500">
                    <p>• 请确保在 Cloudflare Access 中正确配置应用程序</p>
                    <p>• 默认 Scopes: openid profile</p>
                    <p>• Client Secret 将被安全加密存储</p>
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
                  onPress={handleSaveCloudflareConfig}
                  isLoading={isSubmitting}
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}
                >
                  {isSubmitting ? "保存中..." : "保存配置"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
});

SecuritySettings.displayName = "SecuritySettings";

export default SecuritySettings; 