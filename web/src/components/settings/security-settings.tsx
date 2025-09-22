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
import { buildApiUrl } from "@/lib/utils";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
// import GitHubOAuthModal from "./github-oauth-modal";
// import CloudflareOAuthModal from "./cloudflare-oauth-modal";
// import OAuth2ProviderSelectModal from "./oauth2-provider-select-modal";

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
  /**
   * 回调地址，由前端根据 window.location.origin 生成并与其它配置一同保存
   */
  redirectUri?: string;
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
        const res = await fetch(buildApiUrl('/api/oauth2/config'));
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

      const response = await fetch(buildApiUrl('/api/auth/change-username'), {
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
      
      const redirectUri = `${window.location.origin}/api/oauth2/callback`;
      const payload = {
        provider: 'github',
        config: {
          ...gitHubConfig,
          redirectUri,
        }
      };

      const res = await fetch(buildApiUrl('/api/oauth2/config'), {
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
      
      const redirectUri = `${window.location.origin}/api/oauth2/callback`;
      const payload = {
        provider: 'cloudflare',
        config: {
          ...cloudflareConfig,
          redirectUri,
        }
      };

      const res = await fetch(buildApiUrl('/api/oauth2/config'), {
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
      const res = await fetch(buildApiUrl('/api/oauth2/config'), { method: 'DELETE' });
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
                  size="sm"
                  color="primary" 
                  onPress={onUsernameOpen}
                  startContent={<Icon icon="solar:user-bold" width={18} />}
                   >
                  修改用户名
                </Button>
              </div>
              
              <div className="flex items-center justify-between px-4 py-3">
                <div className="space-y-1">
                  <h3 className="text-base font-medium">修改密码</h3>
                  <p className="text-sm text-default-500">定期更新密码以提高账户安全性</p>
                </div>
                <Button 
                  size="sm"
                  color="primary" 
                  onPress={onPasswordOpen}
                  startContent={<Icon icon="solar:key-bold" width={18} />}
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
                    startContent={<Icon icon="solar:lock-password-bold" width={18} />}
                  />
                  
                  <Input
                    label="新密码"
                    placeholder="请输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordFormChange('newPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-bold" width={18} />}
                  />
                  
                  <Input
                    label="确认新密码"
                    placeholder="请再次输入新密码"
                    type="password"
                    variant="bordered"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordFormChange('confirmPassword', e.target.value)}
                    startContent={<Icon icon="solar:key-bold" width={18} />}
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
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-bold" width={18} /> : null}
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
                  startContent={<Icon icon="solar:user-bold" width={18} />}
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
                  startContent={!isSubmitting ? <Icon icon="solar:check-circle-bold" width={18} /> : null}
                >
                  {isSubmitting ? "修改中..." : "确认修改"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

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
                  <> <Icon icon="simple-icons:github" width={24} height={24} className="dark:text-white" /> <span className="font-medium">GitHub</span> </>) }
                {isCloudflareConfigured && (
                  <> <Icon icon="simple-icons:cloudflare" width={24} height={24} /> <span className="font-medium">Cloudflare</span> </>) }
                <Chip color="success" size="sm" variant="flat">已绑定</Chip>
              </div>
              <div className="flex gap-2">
                <Button
                  color="primary"
                  size="sm"
                  onPress={() => {
                    // 打开对应配置模态框
                    if (isGitHubConfigured) onGitHubOpen();
                    else if (isCloudflareConfigured) onCloudflareOpen();
                  }}
                  startContent={<Icon icon="solar:settings-bold" width={18} />}
                >
                  配置
                </Button>
                <Button
                  color="danger"
                  size="sm"
                  onPress={() => handleUnbindProvider(isGitHubConfigured ? "github" : "cloudflare")}
                  isLoading={isSubmitting}
                  startContent={<Icon icon="solar:lock-keyhole-unlocked-bold" width={18} />}
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
                size="sm"
                color="primary"
                className="text-white"
                onPress={onSelectOpen}
                startContent={<Icon icon="solar:add-circle-bold" width={18} />}
              >
                绑定 OAuth2 认证
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 基本 Provider 选择模态框 - 简化版本，不依赖外部组件 */}
      <Modal 
        isOpen={isSelectOpen} 
        onOpenChange={onSelectOpenChange}
        placement="center"
        backdrop="blur"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>选择 OAuth2 提供商</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Button
                    fullWidth
                    variant="bordered"
                    startContent={<Icon icon="simple-icons:github" width={20} />}
                    onPress={() => {
                      setSelectedProvider("github");
                      onGitHubOpen();
                      onClose();
                    }}
                  >
                    GitHub
                  </Button>
                  <Button
                    fullWidth
                    variant="bordered"
                    startContent={<Icon icon="simple-icons:cloudflare" width={20} />}
                    onPress={() => {
                      setSelectedProvider("cloudflare");
                      onCloudflareOpen();
                      onClose();
                    }}
                  >
                    Cloudflare
                  </Button>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* GitHub OAuth2 配置模态框 - 简化版 */}
      <Modal 
        isOpen={isGitHubOpen} 
        onOpenChange={onGitHubOpenChange}
        placement="center"
        backdrop="blur"
        size="2xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <div className="flex items-center justify-between w-full">
                  <span>GitHub OAuth2 配置</span>
                  <a
                    href="https://github.com/settings/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-default-400 hover:text-default-700 dark:hover:text-default-300"
                    title="打开 GitHub 开发者设置"
                  >
                    <Icon icon="solar:external-link-bold" width={18} />
                  </a>
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Client ID"
                    placeholder="GitHub OAuth App Client ID"
                    value={gitHubConfig.clientId}
                    onChange={(e) => setGitHubConfig(prev => ({...prev, clientId: e.target.value}))}
                  />
                  <Input
                    label="Client Secret"
                    type="password"
                    placeholder="GitHub OAuth App Client Secret"
                    value={gitHubConfig.clientSecret}
                    onChange={(e) => setGitHubConfig(prev => ({...prev, clientSecret: e.target.value}))}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button 
                  color="primary" 
                  onPress={handleSaveGitHubConfig}
                  isLoading={isSubmitting}
                >
                  保存配置
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Cloudflare OAuth2 配置模态框 - 简化版 */}
      <Modal 
        isOpen={isCloudflareOpen} 
        onOpenChange={onCloudflareOpenChange}
        placement="center"
        backdrop="blur"
        size="2xl"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
              <span>Cloudflare OAuth2 配置</span>
                  <a
                    href="https://one.dash.cloudflare.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-default-400 hover:text-default-700 dark:hover:text-default-300"
                    title="打开 Zero Trust Dashboard"
                  >
                    <Icon icon="solar:external-link-bold" width={18} />
                  </a>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Client ID"
                    placeholder="Cloudflare OAuth App Client ID"
                    value={cloudflareConfig.clientId}
                    onChange={(e) => setCloudflareConfig(prev => ({...prev, clientId: e.target.value}))}
                  />
                  <Input
                    label="Client Secret"
                    type="password"
                    placeholder="Cloudflare OAuth App Client Secret"
                    value={cloudflareConfig.clientSecret}
                    onChange={(e) => setCloudflareConfig(prev => ({...prev, clientSecret: e.target.value}))}
                  />
                  <Input
                    label="Auth URL"
                    placeholder="Cloudflare Access Auth URL"
                    value={cloudflareConfig.authUrl}
                    onChange={(e) => setCloudflareConfig(prev => ({...prev, authUrl: e.target.value}))}
                  />
                  <Input
                    label="Token URL"
                    placeholder="Cloudflare Access Token URL"
                    value={cloudflareConfig.tokenUrl}
                    onChange={(e) => setCloudflareConfig(prev => ({...prev, tokenUrl: e.target.value}))}
                  />
                  <Input
                    label="User Info URL"
                    placeholder="Cloudflare Access User Info URL"
                    value={cloudflareConfig.userInfoUrl}
                    onChange={(e) => setCloudflareConfig(prev => ({...prev, userInfoUrl: e.target.value}))}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button 
                  color="primary" 
                  onPress={handleSaveCloudflareConfig}
                  isLoading={isSubmitting}
                >
                  保存配置
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