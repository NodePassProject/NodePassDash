import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Divider,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLock,
  faUser,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react/dist/offline";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/components/auth/auth-provider";
import { buildApiUrl } from "@/lib/utils";
import Image from "@/components/common/image";
import { ThemeSwitch } from "@/components/theme-switch";
import { LanguageSwitch } from "@/components/language-switch";
import { Footer } from "@/components/layout/footer";

export default function LoginPage() {
  const navigate = useNavigate();
  const { checkAuth, setUserDirectly, setToken } = useAuth();
  const { t } = useTranslation("auth");
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OAuth2 配置状态
  const [oauthProviders, setOauthProviders] = useState<{
    provider?: "github" | "cloudflare";
    config?: any;
  }>({});
  // 是否禁用用户名密码登录
  const [isLoginDisabled, setIsLoginDisabled] = useState(false);
  // 系统配置错误状态
  const [systemError, setSystemError] = useState("");

  const { resolvedTheme } = useTheme();
  // 判断当前是否为暗色主题 - 使用 resolvedTheme 来获取实际应用的主题
  const isDark = resolvedTheme === "dark";
  // 根据主题选择对应的 Logo
  const logoSrc = isDark ? "/nodepass-logo-3.svg" : "/nodepass-logo-1.svg";

  useEffect(() => {
    /**
     * 先获取系统当前绑定的 provider，再读取其配置
     */
    const fetchCurrentProvider = async () => {
      try {
        const res = await fetch("/api/auth/oauth2"); // 仅返回 provider 和 disableLogin
        const data = await res.json();

        if (data.success) {
          const hasOAuth = !!data.provider;
          const loginDisabled = data.disableLogin === true;

          if (data.provider) {
            const cur = data.provider as "github" | "cloudflare";

            setOauthProviders({ provider: cur });
          }

          // 设置是否禁用用户名密码登录
          setIsLoginDisabled(loginDisabled);

          // 检查系统配置错误：禁用了登录但没有配置 OAuth2
          if (loginDisabled && !hasOAuth) {
            setSystemError(t("login.systemErrorMessage"));
          }
        }
      } catch (e) {
        console.error("获取 OAuth2 当前绑定失败", e);
      }
    };

    fetchCurrentProvider();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    console.log("🔐 开始登录流程", { username: formData.username });

    try {
      const response = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();

        console.log("📋 登录响应数据", result);

        // 检查是否返回了 token
        if (!result.token) {
          console.error("❌ 登录响应缺少 token");
          setError(t("error.loginFailed"));
          return;
        }

        console.log("✅ 登录成功，保存 token 和用户状态");

        // 保存 JWT token
        setToken(result.token, result.expiresAt);

        // 登录成功后设置用户状态并持久化
        const loginUser = { username: formData.username };

        // 先保存到localStorage，再设置状态
        localStorage.setItem("nodepass.user", JSON.stringify(loginUser));
        setUserDirectly(loginUser);

        // 检查是否是默认凭据
        if (result.isDefaultCredentials) {
          console.log("🔧 检测到默认凭据，跳转到引导页");
          // 延迟跳转，让状态更新完成
          setTimeout(() => navigate("/setup-guide"), 200);

          return;
        }

        console.log("🚀 重定向到仪表盘");
        // 延迟跳转，让状态更新完成
        setTimeout(() => navigate("/dashboard"), 200);
      } else {
        const result = await response.json();

        console.error("❌ 登录失败", result);
        setError(result.error || t("error.loginFailed"));
      }
    } catch (error) {
      console.error("🚨 登录请求异常:", error);
      setError(t("error.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string) => (value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // 清除错误信息
    if (error) setError("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-default-100 relative">
      {/* Theme Switch - 右下角固定位置 */}
      <div className="fixed bottom-4 right-4 z-50">
        <ThemeSwitch />
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="shadow-2xl">
            <CardHeader className="flex flex-col gap-1 items-center pb-6 pt-8 relative">
              {/* 语言切换 - 右上角 */}
              <div className="absolute top-4 right-4">
                <LanguageSwitch />
              </div>

              <motion.div
                animate={{ scale: 1 }}
                className="w-16 h-16 flex items-center justify-center mb-4"
                initial={{ scale: 0 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                {/* 根据主题动态渲染 Logo */}
                <Image
                  priority
                  alt="NodePassDash Logo"
                  height={64}
                  src={logoSrc}
                  width={64}
                />
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground">
                {t("login.title")}
              </h1>
              {/* 仅当允许用户名密码登录时显示提示文案 */}
              {!isLoginDisabled && (
                <p className="text-small text-default-500">
                  {t("login.subtitle")}
                </p>
              )}
            </CardHeader>

            <CardBody className="px-8 pb-8">
              {/* 系统配置错误 */}
              {systemError && (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-danger-50 border border-danger-200 rounded-lg text-center"
                  initial={{ opacity: 0, y: 10 }}
                >
                  <Icon
                    className="text-danger mx-auto mb-2"
                    icon="solar:shield-warning-bold"
                    width={24}
                  />
                  <p className="text-danger text-sm font-medium">
                    {t("login.systemError")}
                  </p>
                  <p className="text-danger-600 text-xs mt-1">{systemError}</p>
                </motion.div>
              )}

              {/* 登录表单：仅当未禁用用户名密码登录且系统配置正常时显示 */}
              {!systemError && !isLoginDisabled && (
                <form className="space-y-6" onSubmit={handleSubmit}>
                  {error && (
                    <motion.div
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 bg-danger-50 border border-danger-200 rounded-lg"
                      initial={{ opacity: 0, x: -10 }}
                    >
                      <p className="text-danger text-small">{error}</p>
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    <Input
                      isRequired
                      label={t("login.username")}
                      placeholder={t("login.usernamePlaceholder")}
                      startContent={
                        <FontAwesomeIcon
                          className="text-default-400"
                          icon={faUser}
                        />
                      }
                      type="text"
                      value={formData.username}
                      variant="bordered"
                      onValueChange={handleInputChange("username")}
                    />

                    <Input
                      isRequired
                      endContent={
                        <button
                          className="focus:outline-none"
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          <FontAwesomeIcon
                            className="text-default-400 hover:text-default-600 transition-colors"
                            icon={showPassword ? faEyeSlash : faEye}
                          />
                        </button>
                      }
                      label={t("login.password")}
                      placeholder={t("login.passwordPlaceholder")}
                      startContent={
                        <FontAwesomeIcon
                          className="text-default-400"
                          icon={faLock}
                        />
                      }
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      variant="bordered"
                      onValueChange={handleInputChange("password")}
                    />
                  </div>

                  <Button
                    className="w-full font-semibold"
                    color="primary"
                    disabled={!formData.username || !formData.password}
                    isLoading={isLoading}
                    size="lg"
                    type="submit"
                  >
                    {isLoading ? t("login.submitting") : t("login.submit")}
                  </Button>
                </form>
              )}

              {/* OAuth2 登录选项 */}
              {!systemError && oauthProviders.provider && (
                <div className="mt-6 space-y-3">
                  {!isLoginDisabled && <Divider />}
                  <p className="text-center text-sm text-default-500">
                    {isLoginDisabled
                      ? t("login.dividerLoginDisabled")
                      : t("login.divider")}
                  </p>
                  <div className="flex flex-col gap-3">
                    {oauthProviders.provider === "github" && (
                      <Button
                        color="default"
                        startContent={
                          <Icon icon="simple-icons:github" width={20} />
                        }
                        variant="bordered"
                        onPress={() => {
                          window.location.href = "/api/oauth2/login";
                        }}
                      >
                        {t("login.githubLogin")}
                      </Button>
                    )}
                    {oauthProviders.provider === "cloudflare" && (
                      <Button
                        color="default"
                        startContent={
                          <Icon icon="simple-icons:cloudflare" width={20} />
                        }
                        variant="bordered"
                        onPress={() => {
                          window.location.href = "/api/oauth2/login";
                        }}
                      >
                        {t("login.cloudflareLogin")}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* 页脚 */}
      <Footer />
    </div>
  );
}
