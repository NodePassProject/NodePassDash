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
  useDisclosure,
} from "@heroui/react";
import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
} from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { buildApiUrl } from "@/lib/utils";
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
  const {
    isOpen: isPasswordOpen,
    onOpen: onPasswordOpen,
    onOpenChange: onPasswordOpenChange,
  } = useDisclosure();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // 修改用户名相关状态
  const {
    isOpen: isUsernameOpen,
    onOpen: onUsernameOpen,
    onOpenChange: onUsernameOpenChange,
  } = useDisclosure();
  const [newUsername, setNewUsername] = useState("");

  // 全局提交状态（用户名/密码/OAuth2 配置共用）
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OAuth2 配置相关状态
  const {
    isOpen: isGitHubOpen,
    onOpen: onGitHubOpen,
    onOpenChange: onGitHubOpenChange,
  } = useDisclosure();
  const {
    isOpen: isCloudflareOpen,
    onOpen: onCloudflareOpen,
    onOpenChange: onCloudflareOpenChange,
  } = useDisclosure();

  const [gitHubConfig, setGitHubConfig] = useState<OAuth2Config>({
    clientId: "",
    clientSecret: "",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    userIdPath: "id",
  });

  const [cloudflareConfig, setCloudflareConfig] = useState<OAuth2Config>({
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    userInfoUrl: "",
    userIdPath: "sub",
    scopes: ["openid", "profile"],
  });

  // Custom OIDC 配置
  interface CustomOIDCConfig extends OAuth2Config {
    issuerUrl: string;
    displayName: string;
    usernamePath: string;
  }

  const [customConfig, setCustomConfig] = useState<CustomOIDCConfig>({
    issuerUrl: "",
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    userInfoUrl: "",
    userIdPath: "sub",
    usernamePath: "preferred_username",
    scopes: ["openid", "profile", "email"],
    displayName: "",
  });

  // 模拟的配置状态（实际应该从后端获取）
  const [isGitHubConfigured, setIsGitHubConfigured] = useState(false);
  const [isCloudflareConfigured, setIsCloudflareConfigured] = useState(false);
  const [isCustomConfigured, setIsCustomConfigured] = useState(false);

  // OIDC Discovery 加载状态
  const [isDiscovering, setIsDiscovering] = useState(false);

  // 在 state 部分添加 selectedProvider 和 provider select disclosure
  const [selectedProvider, setSelectedProvider] = useState<
    "github" | "cloudflare" | "custom" | null
  >(null);
  const {
    isOpen: isSelectOpen,
    onOpen: onSelectOpen,
    onOpenChange: onSelectOpenChange,
  } = useDisclosure();

  // Custom OIDC 配置模态框
  const {
    isOpen: isCustomOpen,
    onOpen: onCustomOpen,
    onOpenChange: onCustomOpenChange,
  } = useDisclosure();

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
        const res = await fetch(buildApiUrl("/api/oauth2/config"));
        const data = await res.json();

        if (!data.success) return;

        const curProvider = data.provider as "github" | "cloudflare" | "custom" | "";

        if (!curProvider) return; // 未绑定

        const cfgData = data; // 同一次响应里含配置

        if (curProvider === "github") {
          setGitHubConfig((prev: any) => ({ ...prev, ...cfgData.config }));
          setIsGitHubConfigured(true);
        } else if (curProvider === "cloudflare") {
          setCloudflareConfig((prev: any) => ({ ...prev, ...cfgData.config }));
          setIsCloudflareConfigured(true);
        } else if (curProvider === "custom") {
          setCustomConfig((prev: any) => ({ ...prev, ...cfgData.config }));
          setIsCustomConfigured(true);
        }
      } catch (e) {
        console.error("初始化 OAuth2 配置失败", e);
      }
    };

    initOAuth2();
  }, []);

  // 修改密码功能（从 navbar-user.tsx 复制）
  const handlePasswordChange = async () => {
    // 验证表单
    if (
      !passwordForm.currentPassword ||
      !passwordForm.newPassword ||
      !passwordForm.confirmPassword
    ) {
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
          title: "密码修改成功",
          description: "您的密码已成功更新",
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
          title: "密码修改失败",
          description: result.message || "请检查您的当前密码是否正确",
          color: "danger",
        });
      }
    } catch (error) {
      console.error("修改密码失败:", error);
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
    setPasswordForm((prev) => ({
      ...prev,
      [field]: value,
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

      const response = await fetch(buildApiUrl("/api/auth/change-username"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      console.error("修改用户名失败:", error);
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
        provider: "github",
        config: {
          ...gitHubConfig,
          redirectUri,
        },
      };

      const res = await fetch(buildApiUrl("/api/oauth2/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("保存失败");

      addToast({
        title: "配置保存成功",
        description: "GitHub OAuth2 配置已成功保存",
        color: "success",
      });

      setIsGitHubConfigured(true);
      onGitHubOpenChange();
    } catch (error) {
      console.error("保存 GitHub 配置失败:", error);
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
        provider: "cloudflare",
        config: {
          ...cloudflareConfig,
          redirectUri,
        },
      };

      const res = await fetch(buildApiUrl("/api/oauth2/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("保存失败");

      addToast({
        title: "配置保存成功",
        description: "Cloudflare OAuth2 配置已成功保存",
        color: "success",
      });

      setIsCloudflareConfigured(true);
      onCloudflareOpenChange();
    } catch (error) {
      console.error("保存 Cloudflare 配置失败:", error);
      addToast({
        title: "保存失败",
        description: "保存 Cloudflare OAuth2 配置时发生错误",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // OIDC Discovery 函数
  const handleDiscoverOIDC = async () => {
    if (!customConfig.issuerUrl) {
      addToast({
        title: "请输入 Discovery URL",
        description: "Discovery URL 不能为空",
        color: "warning",
      });
      return;
    }

    setIsDiscovering(true);
    try {
      const res = await fetch(
        buildApiUrl(`/api/oauth2/discover?url=${encodeURIComponent(customConfig.issuerUrl)}`)
      );
      const data = await res.json();

      if (data.success) {
        setCustomConfig((prev) => ({
          ...prev,
          authUrl: data.authorizationEndpoint || "",
          tokenUrl: data.tokenEndpoint || "",
          userInfoUrl: data.userinfoEndpoint || "",
        }));
        addToast({
          title: "发现成功",
          description: "已自动填充 OIDC 端点配置",
          color: "success",
        });
      } else {
        addToast({
          title: "发现失败",
          description: data.error || "无法获取 OIDC 配置",
          color: "danger",
        });
      }
    } catch (e) {
      console.error("OIDC Discovery 失败:", e);
      addToast({
        title: "发现失败",
        description: "无法连接到 OIDC 服务器",
        color: "danger",
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  // Custom OIDC 配置保存
  const handleSaveCustomConfig = async () => {
    // 验证必填字段
    if (!customConfig.clientId || !customConfig.clientSecret) {
      addToast({
        title: "配置不完整",
        description: "请填写 Client ID 和 Client Secret",
        color: "warning",
      });
      return;
    }

    if (!customConfig.authUrl || !customConfig.tokenUrl) {
      addToast({
        title: "配置不完整",
        description: "请先使用「发现」按钮获取 OIDC 端点，或手动填写 Auth URL 和 Token URL",
        color: "warning",
      });
      return;
    }

    if (!customConfig.displayName) {
      addToast({
        title: "配置不完整",
        description: "请填写显示名称（如 Keycloak、Authentik 等）",
        color: "warning",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const redirectUri = `${window.location.origin}/api/oauth2/callback`;
      const payload = {
        provider: "custom",
        config: {
          ...customConfig,
          redirectUri,
        },
      };

      const res = await fetch(buildApiUrl("/api/oauth2/config"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("保存失败");

      addToast({
        title: "配置保存成功",
        description: `${customConfig.displayName} OIDC 配置已成功保存`,
        color: "success",
      });

      setIsCustomConfigured(true);
      onCustomOpenChange();
    } catch (error) {
      console.error("保存 Custom OIDC 配置失败:", error);
      addToast({
        title: "保存失败",
        description: "保存 Custom OIDC 配置时发生错误",
        color: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 解绑处理
  const handleUnbindProvider = async (provider: "github" | "cloudflare" | "custom") => {
    try {
      setIsSubmitting(true);
      const res = await fetch(buildApiUrl("/api/oauth2/config"), {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("解绑失败");
      addToast({
        title: "解绑成功",
        description: "已成功解绑 OAuth2 登录方式",
        color: "success",
      });
      if (provider === "github") setIsGitHubConfigured(false);
      else if (provider === "cloudflare") setIsCloudflareConfigured(false);
      else if (provider === "custom") setIsCustomConfigured(false);
    } catch (e) {
      console.error("解绑失败", e);
      addToast({
        title: "解绑失败",
        description: "操作时发生错误",
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
                  size="sm"
                  startContent={<Icon icon="solar:user-bold" width={18} />}
                  onPress={onUsernameOpen}
                >
                  修改用户名
                </Button>
              </div>

              <div className="flex items-center justify-between px-4 py-3">
                <div className="space-y-1">
                  <h3 className="text-base font-medium">修改密码</h3>
                  <p className="text-sm text-default-500">
                    定期更新密码以提高账户安全性
                  </p>
                </div>
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Icon icon="solar:key-bold" width={18} />}
                  onPress={onPasswordOpen}
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
                  修改密码
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4">
                  <Input
                    label="当前密码"
                    placeholder="请输入当前密码"
                    startContent={
                      <Icon icon="solar:lock-password-bold" width={18} />
                    }
                    type="password"
                    value={passwordForm.currentPassword}
                    variant="bordered"
                    onChange={(e) =>
                      handlePasswordFormChange(
                        "currentPassword",
                        e.target.value,
                      )
                    }
                  />

                  <Input
                    label="新密码"
                    placeholder="请输入新密码"
                    startContent={<Icon icon="solar:key-bold" width={18} />}
                    type="password"
                    value={passwordForm.newPassword}
                    variant="bordered"
                    onChange={(e) =>
                      handlePasswordFormChange("newPassword", e.target.value)
                    }
                  />

                  <Input
                    label="确认新密码"
                    placeholder="请再次输入新密码"
                    startContent={<Icon icon="solar:key-bold" width={18} />}
                    type="password"
                    value={passwordForm.confirmPassword}
                    variant="bordered"
                    onChange={(e) =>
                      handlePasswordFormChange(
                        "confirmPassword",
                        e.target.value,
                      )
                    }
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
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-bold" width={18} />
                    ) : null
                  }
                  onPress={handlePasswordChange}
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
                    icon="solar:user-bold"
                    width={24}
                  />
                  修改用户名
                </div>
              </ModalHeader>
              <ModalBody>
                <Input
                  label="新用户名"
                  placeholder="请输入新用户名"
                  startContent={<Icon icon="solar:user-bold" width={18} />}
                  value={newUsername}
                  variant="bordered"
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </ModalBody>
              <ModalFooter>
                <Button
                  color="danger"
                  isDisabled={isSubmitting}
                  variant="light"
                  onPress={onClose}
                >
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  startContent={
                    !isSubmitting ? (
                      <Icon icon="solar:check-circle-bold" width={18} />
                    ) : null
                  }
                  onPress={handleUsernameChange}
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
            <p className="text-sm text-default-500">
              系统仅允许绑定一种第三方登录方式
            </p>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="p-4">
          {isGitHubConfigured || isCloudflareConfigured || isCustomConfigured ? (
            // 已绑定状态
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isGitHubConfigured && (
                  <>
                    {" "}
                    <Icon
                      className="dark:text-white"
                      height={24}
                      icon="simple-icons:github"
                      width={24}
                    />{" "}
                    <span className="font-medium">GitHub</span>{" "}
                  </>
                )}
                {isCloudflareConfigured && (
                  <>
                    {" "}
                    <Icon
                      height={24}
                      icon="simple-icons:cloudflare"
                      width={24}
                    />{" "}
                    <span className="font-medium">Cloudflare</span>{" "}
                  </>
                )}
                {isCustomConfigured && (
                  <>
                    {" "}
                    <Icon
                      height={24}
                      icon="solar:key-bold"
                      width={24}
                    />{" "}
                    <span className="font-medium">{customConfig.displayName || "Custom OIDC"}</span>{" "}
                  </>
                )}
                <Chip color="success" size="sm" variant="flat">
                  已绑定
                </Chip>
              </div>
              <div className="flex gap-2">
                <Button
                  color="primary"
                  size="sm"
                  startContent={<Icon icon="solar:settings-bold" width={18} />}
                  onPress={() => {
                    // 打开对应配置模态框
                    if (isGitHubConfigured) onGitHubOpen();
                    else if (isCloudflareConfigured) onCloudflareOpen();
                    else if (isCustomConfigured) onCustomOpen();
                  }}
                >
                  配置
                </Button>
                <Button
                  color="danger"
                  isLoading={isSubmitting}
                  size="sm"
                  startContent={
                    <Icon icon="solar:lock-keyhole-unlocked-bold" width={18} />
                  }
                  onPress={() =>
                    handleUnbindProvider(
                      isGitHubConfigured ? "github" : isCloudflareConfigured ? "cloudflare" : "custom",
                    )
                  }
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
                className="text-white"
                color="primary"
                size="sm"
                startContent={<Icon icon="solar:add-circle-bold" width={18} />}
                onPress={onSelectOpen}
              >
                绑定 OAuth2 认证
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 基本 Provider 选择模态框 - 简化版本，不依赖外部组件 */}
      <Modal
        backdrop="blur"
        isOpen={isSelectOpen}
        placement="center"
        onOpenChange={onSelectOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>选择 OAuth2 提供商</ModalHeader>
              <ModalBody>
                <div className="space-y-3">
                  <Button
                    fullWidth
                    startContent={
                      <Icon icon="simple-icons:github" width={20} />
                    }
                    variant="bordered"
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
                    startContent={
                      <Icon icon="simple-icons:cloudflare" width={20} />
                    }
                    variant="bordered"
                    onPress={() => {
                      setSelectedProvider("cloudflare");
                      onCloudflareOpen();
                      onClose();
                    }}
                  >
                    Cloudflare
                  </Button>
                  <Button
                    fullWidth
                    startContent={
                      <Icon icon="solar:key-bold" width={20} />
                    }
                    variant="bordered"
                    onPress={() => {
                      setSelectedProvider("custom");
                      onCustomOpen();
                      onClose();
                    }}
                  >
                    Custom OIDC
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
        backdrop="blur"
        isOpen={isGitHubOpen}
        placement="center"
        size="2xl"
        onOpenChange={onGitHubOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <div className="flex items-center  w-full">
                  <span>GitHub OAuth2 配置</span>
                  <FontAwesomeIcon
                    className="text-[12px] text-default-400 hover:text-default-500 cursor-pointer ml-2 inline align-baseline"
                    icon={faExternalLink}
                    onClick={(e) => {
                      window.open(
                        "https://github.com/settings/developers",
                        "_blank",
                      );
                    }}
                  />
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Client ID"
                    placeholder="GitHub OAuth App Client ID"
                    value={gitHubConfig.clientId}
                    onChange={(e) =>
                      setGitHubConfig((prev) => ({
                        ...prev,
                        clientId: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Client Secret"
                    placeholder="GitHub OAuth App Client Secret"
                    type="password"
                    value={gitHubConfig.clientSecret}
                    onChange={(e) =>
                      setGitHubConfig((prev) => ({
                        ...prev,
                        clientSecret: e.target.value,
                      }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  onPress={handleSaveGitHubConfig}
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
        backdrop="blur"
        isOpen={isCloudflareOpen}
        placement="center"
        size="2xl"
        onOpenChange={onCloudflareOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center  w-full">
                <span>Cloudflare OAuth2 配置</span>
                <FontAwesomeIcon
                  className="text-[12px] text-default-400 hover:text-default-500 cursor-pointer ml-2 inline align-baseline"
                  icon={faExternalLink}
                  onClick={(e) => {
                    window.open("https://one.dash.cloudflare.com/", "_blank");
                  }}
                />
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label="Client ID"
                    placeholder="Cloudflare OAuth App Client ID"
                    value={cloudflareConfig.clientId}
                    onChange={(e) =>
                      setCloudflareConfig((prev) => ({
                        ...prev,
                        clientId: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Client Secret"
                    placeholder="Cloudflare OAuth App Client Secret"
                    type="password"
                    value={cloudflareConfig.clientSecret}
                    onChange={(e) =>
                      setCloudflareConfig((prev) => ({
                        ...prev,
                        clientSecret: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Auth URL"
                    placeholder="Cloudflare Access Auth URL"
                    value={cloudflareConfig.authUrl}
                    onChange={(e) =>
                      setCloudflareConfig((prev) => ({
                        ...prev,
                        authUrl: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Token URL"
                    placeholder="Cloudflare Access Token URL"
                    value={cloudflareConfig.tokenUrl}
                    onChange={(e) =>
                      setCloudflareConfig((prev) => ({
                        ...prev,
                        tokenUrl: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="User Info URL"
                    placeholder="Cloudflare Access User Info URL"
                    value={cloudflareConfig.userInfoUrl}
                    onChange={(e) =>
                      setCloudflareConfig((prev) => ({
                        ...prev,
                        userInfoUrl: e.target.value,
                      }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  onPress={handleSaveCloudflareConfig}
                >
                  保存配置
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Custom OIDC 配置模态框 */}
      <Modal
        backdrop="blur"
        isOpen={isCustomOpen}
        placement="center"
        size="2xl"
        scrollBehavior="inside"
        onOpenChange={onCustomOpenChange}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center w-full">
                <span>Custom OIDC 配置</span>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  {/* Discovery URL */}
                  <Input
                    label="Discovery URL"
                    placeholder="https://auth.example.com/.well-known/openid-configuration"
                    description="OIDC 发现端点的完整地址，点击「发现」自动填充下方端点"
                    value={customConfig.issuerUrl}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        issuerUrl: e.target.value,
                      }))
                    }
                  />

                  <Divider />

                  {/* 显示名称 */}
                  <Input
                    label="显示名称"
                    placeholder="如 Keycloak、Authentik、Authelia 等"
                    description="将显示在登录按钮上"
                    value={customConfig.displayName}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        displayName: e.target.value,
                      }))
                    }
                  />

                  {/* Client ID / Secret */}
                  <Input
                    label="Client ID"
                    placeholder="OIDC 客户端 ID"
                    value={customConfig.clientId}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        clientId: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Client Secret"
                    placeholder="OIDC 客户端密钥"
                    type="password"
                    value={customConfig.clientSecret}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        clientSecret: e.target.value,
                      }))
                    }
                  />

                  <Divider />

                  {/* OIDC 端点 */}
                  <Input
                    label="Auth URL"
                    placeholder="授权端点 (authorization_endpoint)"
                    value={customConfig.authUrl}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        authUrl: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="Token URL"
                    placeholder="Token 端点 (token_endpoint)"
                    value={customConfig.tokenUrl}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        tokenUrl: e.target.value,
                      }))
                    }
                  />
                  <Input
                    label="User Info URL"
                    placeholder="用户信息端点 (userinfo_endpoint)，可选"
                    value={customConfig.userInfoUrl}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        userInfoUrl: e.target.value,
                      }))
                    }
                  />

                  <Divider />

                  {/* Scopes 和字段映射 */}
                  <Input
                    label="Scopes"
                    placeholder="openid profile email"
                    description="OAuth2 作用域，多个用空格分隔"
                    value={(customConfig.scopes || []).join(" ")}
                    onChange={(e) => {
                      const scopesStr = e.target.value;
                      const scopesArr = scopesStr
                        .split(/\s+/)
                        .filter((s) => s.length > 0);
                      setCustomConfig((prev) => ({
                        ...prev,
                        scopes:
                          scopesArr.length > 0
                            ? scopesArr
                            : ["openid", "profile", "email"],
                      }));
                    }}
                  />
                  <Input
                    label="User ID Path"
                    placeholder="sub"
                    description="从用户信息中提取用户 ID 的字段路径，支持点号路径如 user.id"
                    value={customConfig.userIdPath}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        userIdPath: e.target.value || "sub",
                      }))
                    }
                  />
                  <Input
                    label="Username Path"
                    placeholder="preferred_username"
                    description="从用户信息中提取用户名的字段路径，支持点号路径如 user.name"
                    value={customConfig.usernamePath}
                    onChange={(e) =>
                      setCustomConfig((prev) => ({
                        ...prev,
                        usernamePath: e.target.value || "preferred_username",
                      }))
                    }
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  variant="flat"
                  isLoading={isDiscovering}
                  onPress={handleDiscoverOIDC}
                >
                  发现
                </Button>
                <Button
                  color="primary"
                  isLoading={isSubmitting}
                  onPress={handleSaveCustomConfig}
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
