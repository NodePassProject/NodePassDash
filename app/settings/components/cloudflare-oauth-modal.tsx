"use client";

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
  import { Icon } from "@iconify/react";
  import Image from "next/image";
  import NextLink from "next/link";
  import React, { useEffect, useState } from "react";
  import { addToast } from "@heroui/toast";

// OAuth2Config 类型定义，保持与 SecuritySettings 一致
type OAuth2Config = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  userIdPath: string;
  scopes?: string[];
  redirectUri?: string;
};

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen?: boolean) => void;
  config: OAuth2Config;
  setConfig: React.Dispatch<React.SetStateAction<OAuth2Config>>;
  isConfigured: boolean;
  isSubmitting: boolean;
  onSave: () => void;
}

/**
 * Cloudflare OAuth2 配置模态框
 */
const CloudflareOAuthModal: React.FC<Props> = ({
  isOpen,
  onOpenChange,
  config,
  setConfig,
  isConfigured,
  isSubmitting,
  onSave
}) => {
  const [callbackUrl, setCallbackUrl] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCallbackUrl(`${window.location.origin}/api/oauth2/callback`);
    }
  }, []);

  const handleCopyCallback = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      addToast({
        title: "已复制",
        description: "回调地址已复制到剪贴板",
        color: "success",
      });
    } catch (e) {
      addToast({
        title: "复制失败",
        description: "无法复制回调地址，请手动复制",
        color: "danger",
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
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
                <Image src="/cloudflare-svgrepo-com.svg" alt="Cloudflare" width={24} height={24} />
                配置 Cloudflare OAuth2
                {/* 跳转 Cloudflare Access 控制台 */}
                <NextLink
                  href="https://one.dash.cloudflare.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 text-default-500 hover:text-primary"
                >
                  <Icon icon="solar:external-link-line-duotone" width={18} />
                </NextLink>
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
                    value={config.clientId}
                    onChange={(e) => setConfig((prev: OAuth2Config) => ({ ...prev, clientId: e.target.value }))}
                    startContent={<Icon icon="solar:key-linear" width={18} />}
                  />
                  <Input
                    label="Client Secret"
                    placeholder="输入 Cloudflare Access Client Secret"
                    type="password"
                    variant="bordered"
                    value={config.clientSecret}
                    onChange={(e) => setConfig((prev: OAuth2Config) => ({ ...prev, clientSecret: e.target.value }))}
                    startContent={<Icon icon="solar:lock-password-linear" width={18} />}
                  />
                </div>
                <Input
                  label="Auth URL"
                  placeholder="Cloudflare 授权端点 URL"
                  variant="bordered"
                  value={config.authUrl}
                  onChange={(e) => setConfig((prev: OAuth2Config) => ({ ...prev, authUrl: e.target.value }))}
                  startContent={<Icon icon="solar:link-linear" width={18} />}
                />
                <Input
                  label="Token URL"
                  placeholder="Cloudflare Token 端点 URL"
                  variant="bordered"
                  value={config.tokenUrl}
                  onChange={(e) => setConfig((prev: OAuth2Config) => ({ ...prev, tokenUrl: e.target.value }))}
                  startContent={<Icon icon="solar:link-linear" width={18} />}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="User Info URL"
                    placeholder="Cloudflare 用户信息端点 URL"
                    variant="bordered"
                    value={config.userInfoUrl}
                    onChange={(e) => setConfig((prev: OAuth2Config) => ({ ...prev, userInfoUrl: e.target.value }))}
                    startContent={<Icon icon="solar:link-linear" width={18} />}
                  />
                  <Input
                    label="User ID Path"
                    placeholder="用户 ID 字段路径"
                    variant="bordered"
                    value={config.userIdPath}
                    onChange={(e) => setConfig((prev: OAuth2Config) => ({ ...prev, userIdPath: e.target.value }))}
                    startContent={<Icon icon="solar:user-linear" width={18} />}
                  />
                </div>
                <Input
                  label="Scopes"
                  placeholder="OAuth2 权限范围 (以空格分隔)"
                  variant="bordered"
                  value={config.scopes?.join(" ") || ""}
                  onChange={(e) => setConfig((prev: OAuth2Config) => ({
                    ...prev,
                    scopes: e.target.value.split(" ").filter(scope => scope.trim())
                  }))}
                  startContent={<Icon icon="solar:shield-check-linear" width={18} />}
                />
                <div className="text-small text-default-500">
                  <p>• 请确保在 Cloudflare Access 中正确配置应用程序</p>
                  <p>• 默认 Scopes: openid profile</p>
                  <p>• Client Secret 将被安全加密存储</p>
                </div>

                {/* 显示回调地址 */}
                {callbackUrl && (
                  <div className="p-3 bg-default-100 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-default-700">回调地址 (Callback URL)</span>
                      <Icon
                        icon="solar:copy-bold"
                        width={16}
                        className="cursor-pointer text-default-600 hover:text-primary"
                        onClick={handleCopyCallback}
                      />
                    </div>
                    <p className="text-xs text-default-500 break-all">{callbackUrl}</p>
                    <p className="text-xs text-warning mt-1">请在 Cloudflare Access 应用中将此地址配置为 Redirect URL</p>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose} isDisabled={isSubmitting}>
                取消
              </Button>
              <Button color="primary" onPress={onSave} isLoading={isSubmitting} startContent={!isSubmitting ? <Icon icon="solar:check-circle-linear" width={18} /> : null}>
                {isSubmitting ? (isConfigured ? "保存中..." : "绑定中...") : (isConfigured ? "保存配置" : "绑定")}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CloudflareOAuthModal; 