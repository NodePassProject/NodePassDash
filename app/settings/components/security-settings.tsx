"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure
} from "@heroui/react";
import React, { forwardRef, useImperativeHandle, useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import Image from "next/image";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import GitHubOAuthModal from "./github-oauth-modal";
import CloudflareOAuthModal from "./cloudflare-oauth-modal";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import OAuth2ProviderSelectModal from "./oauth2-provider-select-modal";

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

const SecuritySettings = forwardRef<SecuritySettingsRef, {}>((props, ref) => {
  // 修改密码相关状态
  const { isOpen: isPasswordOpen, onOpen: onPasswordOpen, onOpenChange: onPasswordOpenChange } = useDisclosure();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  // 修改用户名相关状态
  const { isOpen: isUsernameOpen, onOpen: onUsernameOpen, onOpenChange: onUsernameOpenChange } = useDisclosure();
  const [newUsername, setNewUsername] = useState("");

  // 全局提交状态（用户名/密码/OAuth2 配置共用）
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

  // 在 state 部分添加 selectedProvider 和 provider select disclosure
  const [selectedProvider, setSelectedProvider] = useState<"github" | "cloudflare" | null>(null);
  const { isOpen: isSelectOpen, onOpen: onSelectOpen, onOpenChange: onSelectOpenChange } = useDisclosure();

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

  // 初始化读取系统已绑定的 OAuth2 提供者及其配置
  useEffect(() => {
    const initOAuth2 = async () => {
      try {
        // 1) 获取当前绑定的 provider
        const res = await fetch('/api/oauth2/config');
        const data = await res.json();
        if (!data.success) return;

        const curProvider = data.provider as "github" | "cloudflare" | "";
        if (!curProvider) return; // 未绑定

        const cfgData = data; // 同一次响应里含配置

        if (curProvider === 'github') {
          setGitHubConfig((prev: any) => ({ ...prev, ...cfgData.config }));
          setIsGitHubConfigured(true);
        } else if (curProvider === 'cloudflare') {
          setCloudflareConfig((prev: any) => ({ ...prev, ...cfgData.config }));
          setIsCloudflareConfigured(true);
        }
      } catch (e) {
        console.error('初始化 OAuth2 配置失败', e);
      }
    };

    initOAuth2();
  }, []);

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

  // 修改用户名功能
  const handleUsernameChange = async () => {
    if (!newUsername) {
      addToast({
        title: "表单验证失败",
        description: "请填写新用户名",
        color: "danger",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch('/api/auth/change-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newUsername }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: "用户名修改成功",
          description: "您的用户名已成功更新",
          color: "success",
        });

        setNewUsername("");
        onUsernameOpenChange();

        // 刷新页面以便于获取最新用户信息
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

  // GitHub OAuth2 配置保存
  const handleSaveGitHubConfig = async () => {
    try {
      setIsSubmitting(true);
      
      const payload = {
        provider: 'github',
        config: gitHubConfig
      };

      const res = await fetch('/api/oauth2/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('保存失败');
      
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
      
      const payload = {
        provider: 'cloudflare',
        config: cloudflareConfig
      };

      const res = await fetch('/api/oauth2/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('保存失败');
      
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

  // 解绑处理
  const handleUnbindProvider = async (provider: "github" | "cloudflare") => {
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/oauth2/config', { method: 'DELETE' });
      if (!res.ok) throw new Error("解绑失败");
      addToast({ title: "解绑成功", description: "已成功解绑 OAuth2 登录方式", color: "success" });
      if (provider === "github") setIsGitHubConfigured(false);
      else setIsCloudflareConfigured(false);
    } catch (e) {
      console.error("解绑失败", e);
      addToast({ title: "解绑失败", description: "操作时发生错误", color: "danger" });
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
        {/* 基础安全设置卡片 */}
        <Card className="mt-5 p-2">
          <CardHeader className="flex gap-3">
            <div className="flex flex-col flex-1">
              <p className="text-lg font-semibold">基础安全设置</p>
              <p className="text-sm text-default-500">管理账户基本安全信息</p>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="p-0">
            <div className="divide-y divide-default-200">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="space-y-1">
                  <h3 className="text-base font-medium">修改用户名</h3>
                  <p className="text-sm text-default-500">更改您的登录用户名</p>
                </div>
                <Button 
                  color="primary" 
                  variant="flat"
                  onPress={onUsernameOpen}
                  startContent={<Icon icon="solar:user-linear" width={18} />}>
                  修改用户名
                </Button>
              </div>
              
              <div className="flex items-center justify-between px-4 py-3">
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
                  <Icon icon="solar:user-bold" className="text-primary" width={24} />
                  修改用户名
                </div>
              </ModalHeader>
              <ModalBody>
                <Input
                  label="新用户名"
                  placeholder="请输入新用户名"
                  variant="bordered"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  startContent={<Icon icon="solar:user-linear" width={18} />}
                />
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

      {/* GitHub OAuth2 配置模态框 */}
      <GitHubOAuthModal
        isOpen={isGitHubOpen}
        onOpenChange={onGitHubOpenChange}
        config={gitHubConfig}
        setConfig={setGitHubConfig}
        isConfigured={isGitHubConfigured}
        isSubmitting={isSubmitting}
        onSave={handleSaveGitHubConfig}
      />

      {/* Cloudflare OAuth2 配置模态框 */}
      <CloudflareOAuthModal
        isOpen={isCloudflareOpen}
        onOpenChange={onCloudflareOpenChange}
        config={cloudflareConfig}
        setConfig={setCloudflareConfig}
        isConfigured={isCloudflareConfigured}
        isSubmitting={isSubmitting}
        onSave={handleSaveCloudflareConfig}
      />

      {/* OAuth2 设置卡片 */}
      <Card className="mt-8 p-2">
        <CardHeader className="flex gap-3">
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">OAuth2 认证</p>
            <p className="text-sm text-default-500">系统仅允许绑定一种第三方登录方式</p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="p-4">
          {isGitHubConfigured || isCloudflareConfigured ? (
            // 已绑定状态
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isGitHubConfigured && (
                  <> <Image src="/github-icon-svgrepo-com.svg" alt="GitHub" width={24} height={24} className="dark:invert" /> <span className="font-medium">GitHub</span> </>) }
                {isCloudflareConfigured && (
                  <> <Image src="/cloudflare-svgrepo-com.svg" alt="Cloudflare" width={24} height={24} /> <span className="font-medium">Cloudflare</span> </>) }
                <Chip color="success" size="sm" variant="flat">已绑定</Chip>
              </div>
              <div className="flex gap-2">
                <Button
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    // 打开对应配置模态框
                    if (isGitHubConfigured) onGitHubOpen();
                    else if (isCloudflareConfigured) onCloudflareOpen();
                  }}
                  startContent={<Icon icon="solar:settings-linear" width={18} />}
                >
                  配置
                </Button>
                <Button
                  color="danger"
                  variant="ghost"
                  onPress={() => handleUnbindProvider(isGitHubConfigured ? "github" : "cloudflare")}
                  isLoading={isSubmitting}
                  startContent={<Icon icon="solar:unlink-linear" width={18} />}
                >
                  解绑
                </Button>
              </div>
            </div>
          ) : (
            // 未绑定状态
            <div className="flex items-center justify-between">
              <p className="text-default-500">尚未绑定任何 OAuth2 登录方式</p>
              <Button
                color="primary"
                onPress={onSelectOpen}
                startContent={<Icon icon="solar:add-circle-linear" width={18} />}
              >
                绑定 OAuth2 认证
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Provider 选择模态框 */}
      <OAuth2ProviderSelectModal
        isOpen={isSelectOpen}
        onOpenChange={onSelectOpenChange}
        onSelect={(provider: "github" | "cloudflare") => {
          setSelectedProvider(provider);
          if (provider === "github") {
            onGitHubOpen();
          } else {
            onCloudflareOpen();
          }
          onSelectOpenChange();
        }}
      />
    </>
  );
});

SecuritySettings.displayName = "SecuritySettings";

export default SecuritySettings; 