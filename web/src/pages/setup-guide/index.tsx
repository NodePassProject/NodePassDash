import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Switch,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Progress,
} from "@heroui/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLock,
  faUser,
  faEye,
  faEyeSlash,
  faExclamationTriangle,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { Icon } from "@iconify/react";
import { addToast } from "@heroui/toast";
import { useTranslation } from "react-i18next";

import { buildApiUrl } from "@/lib/utils";
import { useSettings } from "@/components/providers/settings-provider";
import { useAuth } from "@/components/auth/auth-provider";

// IP脱敏动画组件
const IPMaskingDemo = ({ isPrivacyMode, t }: { isPrivacyMode: boolean; t: any }) => {
  return (
    <div className="relative h-24 bg-default-100 rounded-lg p-4 overflow-hidden">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xs text-default-500 mb-2">{t("step3.privacyMode.demoLabel")}</p>
          <motion.div className="font-mono text-lg font-semibold">
            <AnimatePresence mode="wait">
              {!isPrivacyMode ? (
                <motion.span
                  key="full"
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-foreground"
                  exit={{ opacity: 0, scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  192.168.1.100
                </motion.span>
              ) : (
                <motion.span
                  key="masked"
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-success"
                  exit={{ opacity: 0, scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  192.168.*.*
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* 脱敏效果动画背景 */}
      <AnimatePresence>
        {isPrivacyMode && (
          <motion.div
            animate={{
              opacity: [0, 0.5, 0],
              scale: [0.8, 1.5],
            }}
            className="absolute inset-0 bg-success/10 rounded-lg"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0, scale: 0.8 }}
            transition={{
              duration: 0.6,
              repeat: 0,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// 步骤指示器组件
const StepIndicator = ({
  currentStep,
  totalSteps,
  t,
}: {
  currentStep: number;
  totalSteps: number;
  t: any;
}) => {
  const steps = [
    { number: 1, title: t("steps.step1") },
    { number: 2, title: t("steps.step2") },
    { number: 3, title: t("steps.step3") },
  ];

  return (
    <div className="w-full mb-8">
      <div className="flex items-center justify-between relative">
        {/* 进度条背景 */}
        <div className="absolute top-5 left-0 right-0 h-1 bg-default-200 rounded-full" />
        <Progress
          aria-label={t("progress.label")}
          className="absolute top-5 left-0 right-0"
          classNames={{
            indicator: "bg-gradient-to-r from-primary to-success",
          }}
          size="sm"
          value={(currentStep / totalSteps) * 100}
        />

        {/* 步骤圆点 */}
        {steps.map((step) => (
          <div key={step.number} className="flex flex-col items-center z-10">
            <motion.div
              animate={{
                scale: currentStep === step.number ? 1.1 : 1,
                backgroundColor:
                  currentStep >= step.number
                    ? "hsl(var(--heroui-primary))"
                    : "hsl(var(--heroui-default-200))",
              }}
              className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
              transition={{ duration: 0.3 }}
            >
              {currentStep > step.number ? (
                <FontAwesomeIcon
                  className="text-white text-sm"
                  icon={faCheck}
                />
              ) : (
                <span
                  className={`text-sm font-bold ${
                    currentStep >= step.number
                      ? "text-white"
                      : "text-default-500"
                  }`}
                >
                  {step.number}
                </span>
              )}
            </motion.div>
            <p
              className={`text-xs mt-2 font-medium ${
                currentStep === step.number
                  ? "text-primary"
                  : "text-default-500"
              }`}
            >
              {step.title}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function SetupGuidePage() {
  const navigate = useNavigate();
  const { settings, updateTheme, updateLanguage, updateSettings } = useSettings();
  const { t } = useTranslation("setup-guide");
  const { setUserDirectly, setToken } = useAuth();

  // 步骤管理
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;

  // 第一步：主题和语言
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark" | "system">(
    settings.theme || "system"
  );
  const [selectedLanguage, setSelectedLanguage] = useState<"zh" | "en">(
    settings.language === "zh-CN" ? "zh" : "en"
  );

  // 第二步：用户名和密码
  const [formData, setFormData] = useState({
    currentPassword: "Np123456",
    newUsername: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 第三步：功能配置
  const [privacyMode, setPrivacyMode] = useState(settings.isPrivacyMode ?? true);
  const [experimentalMode, setExperimentalMode] = useState(
    settings.isExperimentalMode ?? false
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleInputChange = (field: string) => (value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (error) setError("");
  };

  const handleNext = () => {
    if (currentStep === 1) {
      // 主题和语言已经在选择时立即应用，直接进入下一步
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // 验证用户名和密码
      if (!formData.newUsername || !formData.newPassword || !formData.confirmPassword) {
        setError(t("errors.allFieldsRequired"));
        return;
      }
      if (formData.newPassword !== formData.confirmPassword) {
        setError(t("errors.passwordMismatch"));
        return;
      }
      if (formData.newPassword.length < 6) {
        setError(t("errors.passwordTooShort"));
        return;
      }
      if (formData.newPassword === "Np123456") {
        setError(t("errors.sameAsDefault"));
        return;
      }
      setError("");
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError("");
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError("");

    try {
      // 1. 获取当前 token（用于认证）
      const token = localStorage.getItem("nodepass.token");
      if (!token) {
        setError("未登录，请先登录");
        setIsLoading(false);
        navigate("/login");
        return;
      }

      // 2. 更新用户名和密码
      const response = await fetch(buildApiUrl("/api/auth/update-security"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newUsername: formData.newUsername,
          newPassword: formData.newPassword,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // 3. 保存功能配置
        updateSettings({
          isPrivacyMode: privacyMode,
          isExperimentalMode: experimentalMode,
        });

        // 4. 更新 token 和用户信息（后端返回了新的 token）
        if (result.token && result.username) {
          // 保存新 token
          setToken(result.token, result.expiresAt);

          // 保存新用户信息到 localStorage
          const user = { username: result.username };
          if (typeof window !== "undefined") {
            localStorage.setItem("nodepass.user", JSON.stringify(user));
          }

          // 更新 AuthProvider 的用户状态
          setUserDirectly(user);
        }

        addToast({
          title: t("success.title"),
          description: t("success.description"),
          color: "success",
        });

        // 5. 跳转到仪表盘
        setTimeout(() => {
          navigate("/dashboard");
        }, 500);
      } else {
        setError(result.message || t("errors.updateFailed"));
      }
    } catch (error) {
      console.error("设置失败:", error);
      setError(t("errors.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            key="step1"
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
            exit={{ opacity: 0, x: -20 }}
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">
                {t("step1.title")}
              </h3>
              <p className="text-sm text-default-500 mb-6">
                {t("step1.description")}
              </p>
            </div>

            {/* 主题选择 */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Icon icon="lucide:palette" width={18} />
                {t("step1.theme.label")}
              </label>
              <p className="text-xs text-default-400">
                {t("step1.theme.description")}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "light", label: t("step1.theme.light"), icon: "solar:sun-bold" },
                  { key: "dark", label: t("step1.theme.dark"), icon: "solar:moon-bold" },
                  { key: "system", label: t("step1.theme.system"), icon: "lucide:monitor" },
                ].map((theme) => (
                  <motion.button
                    key={theme.key}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedTheme === theme.key
                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                        : "border-default-200 hover:border-default-300 hover:shadow-md"
                    }`}
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedTheme(theme.key as any);
                      // 立即应用主题，让用户看到实时效果
                      updateTheme(theme.key as any);
                    }}
                  >
                    <motion.div
                      animate={{
                        rotate: selectedTheme === theme.key ? [0, 10, -10, 0] : 0,
                      }}
                      transition={{ duration: 0.5 }}
                    >
                      <Icon
                        className={
                          selectedTheme === theme.key
                            ? "text-primary"
                            : "text-default-500"
                        }
                        icon={theme.icon}
                        width={24}
                      />
                    </motion.div>
                    <p
                      className={`text-sm mt-2 font-medium ${
                        selectedTheme === theme.key
                          ? "text-primary"
                          : "text-default-700"
                      }`}
                    >
                      {theme.label}
                    </p>
                    {selectedTheme === theme.key && (
                      <motion.div
                        animate={{ scale: [0, 1] }}
                        className="mt-1"
                        initial={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <Icon
                          className="text-primary mx-auto"
                          icon="solar:check-circle-bold"
                          width={16}
                        />
                      </motion.div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 语言选择 */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Icon icon="lucide:languages" width={18} />
                {t("step1.language.label")}
              </label>
              <p className="text-xs text-default-400">
                {t("step1.language.description")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "zh", label: t("step1.language.zh"), icon: "circle-flags:cn" },
                  { key: "en", label: t("step1.language.en"), icon: "circle-flags:us" },
                ].map((lang) => (
                  <motion.button
                    key={lang.key}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      selectedLanguage === lang.key
                        ? "border-success bg-success/10 shadow-lg shadow-success/20"
                        : "border-default-200 hover:border-default-300 hover:shadow-md"
                    }`}
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedLanguage(lang.key as any);
                      // 立即应用语言设置，将简短代码转换为完整语言代码
                      updateLanguage(lang.key === "zh" ? "zh-CN" : "en-US");
                    }}
                  >
                    <motion.div
                      animate={{
                        rotate: selectedLanguage === lang.key ? [0, 15, -15, 0] : 0,
                      }}
                      transition={{ duration: 0.5 }}
                    >
                      <Icon
                        icon={lang.icon}
                        width={24}
                      />
                    </motion.div>
                    <p
                      className={`text-sm mt-2 font-medium ${
                        selectedLanguage === lang.key
                          ? "text-success"
                          : "text-default-700"
                      }`}
                    >
                      {lang.label}
                    </p>
                    {selectedLanguage === lang.key && (
                      <motion.div
                        animate={{ scale: [0, 1] }}
                        className="mt-1"
                        initial={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <Icon
                          className="text-success mx-auto"
                          icon="solar:check-circle-bold"
                          width={16}
                        />
                      </motion.div>
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        );

      case 2:
        return (
          <motion.div
            key="step2"
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
            exit={{ opacity: 0, x: -20 }}
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">
                {t("step2.title")}
              </h3>
              <p className="text-sm text-default-500 mb-6">
                {t("step2.description")}
              </p>
            </div>

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
                description={t("step2.newUsername.description")}
                label={t("step2.newUsername.label")}
                placeholder={t("step2.newUsername.placeholder")}
                startContent={
                  <FontAwesomeIcon className="text-default-400" icon={faUser} />
                }
                type="text"
                value={formData.newUsername}
                variant="bordered"
                onValueChange={handleInputChange("newUsername")}
              />

              <Input
                isRequired
                description={t("step2.newPassword.description")}
                endContent={
                  <button
                    className="focus:outline-none"
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    <FontAwesomeIcon
                      className="text-default-400 hover:text-default-600 transition-colors"
                      icon={showNewPassword ? faEyeSlash : faEye}
                    />
                  </button>
                }
                label={t("step2.newPassword.label")}
                placeholder={t("step2.newPassword.placeholder")}
                startContent={
                  <FontAwesomeIcon className="text-default-400" icon={faLock} />
                }
                type={showNewPassword ? "text" : "password"}
                value={formData.newPassword}
                variant="bordered"
                onValueChange={handleInputChange("newPassword")}
              />

              <Input
                isRequired
                endContent={
                  <button
                    className="focus:outline-none"
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    <FontAwesomeIcon
                      className="text-default-400 hover:text-default-600 transition-colors"
                      icon={showConfirmPassword ? faEyeSlash : faEye}
                    />
                  </button>
                }
                label={t("step2.confirmPassword.label")}
                placeholder={t("step2.confirmPassword.placeholder")}
                startContent={
                  <FontAwesomeIcon className="text-default-400" icon={faLock} />
                }
                type={showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                variant="bordered"
                onValueChange={handleInputChange("confirmPassword")}
              />
            </div>

            <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg">
              <div className="flex items-start gap-2">
                <FontAwesomeIcon
                  className="text-warning mt-0.5"
                  icon={faExclamationTriangle}
                />
                <div className="text-xs text-warning-700">
                  <p className="font-medium">{t("step2.securityTips.title")}</p>
                  <ul className="mt-1 space-y-1">
                    <li>• {t("step2.securityTips.tip1")}</li>
                    <li>• {t("step2.securityTips.tip2")}</li>
                    <li>• {t("step2.securityTips.tip3")}</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div
            key="step3"
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
            exit={{ opacity: 0, x: -20 }}
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h3 className="text-lg font-semibold mb-4 text-foreground">
                {t("step3.title")}
              </h3>
              <p className="text-sm text-default-500 mb-6">
                {t("step3.description")}
              </p>
            </div>

            {/* 隐私模式 */}
            <Card className="border border-divider/30">
              <CardBody className="p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon
                        className="text-warning"
                        icon="lucide:shield"
                        width={20}
                      />
                      <h4 className="font-semibold text-foreground">{t("step3.privacyMode.title")}</h4>
                    </div>
                    <p className="text-sm text-default-500 leading-relaxed">
                      {t("step3.privacyMode.description")}
                    </p>
                  </div>
                  <Switch
                    classNames={{
                      wrapper: "group-data-[hover=true]:bg-warning-100",
                    }}
                    color="warning"
                    isSelected={privacyMode}
                    size="lg"
                    onValueChange={setPrivacyMode}
                  />
                </div>

                {/* IP脱敏动画演示 */}
                <IPMaskingDemo isPrivacyMode={privacyMode} t={t} />
              </CardBody>
            </Card>

            {/* 实验性功能 */}
            <Card className="border border-divider/30">
              <CardBody className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon
                        className="text-secondary"
                        icon="lucide:flask-conical"
                        width={20}
                      />
                      <h4 className="font-semibold text-foreground">
                        {t("step3.experimentalMode.title")}
                      </h4>
                    </div>
                    <p className="text-sm text-default-500 leading-relaxed">
                      {t("step3.experimentalMode.description")}
                    </p>
                  </div>
                  <Switch
                    classNames={{
                      wrapper: "group-data-[hover=true]:bg-secondary-100",
                    }}
                    color="secondary"
                    isSelected={experimentalMode}
                    size="lg"
                    onValueChange={setExperimentalMode}
                  />
                </div>
              </CardBody>
            </Card>

            {error && (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="p-3 bg-danger-50 border border-danger-200 rounded-lg"
                initial={{ opacity: 0, x: -10 }}
              >
                <p className="text-danger text-small">{error}</p>
              </motion.div>
            )}
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-default-100">
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="shadow-2xl">
            <CardHeader className="flex flex-col gap-1 items-center pb-6 pt-8">
              <motion.div
                animate={{ scale: 1 }}
                className="w-16 h-16 flex items-center justify-center mb-4"
                initial={{ scale: 0 }}
                transition={{ delay: 0.2, type: "spring" }}
              >
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-success rounded-full flex items-center justify-center">
                  <Icon
                    className="text-white text-2xl"
                    icon="lucide:sparkles"
                    width={32}
                  />
                </div>
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground">
                {t("title")}
              </h1>
              <p className="text-small text-default-500 text-center">
                {t("subtitle")}
              </p>
            </CardHeader>

            <CardBody className="px-8 pb-8">
              {/* 步骤指示器 */}
              <StepIndicator currentStep={currentStep} totalSteps={totalSteps} t={t} />

              {/* 步骤内容 */}
              <AnimatePresence mode="wait">{renderStepContent()}</AnimatePresence>

              {/* 导航按钮 */}
              <div className="flex gap-3 mt-8">
                {currentStep > 1 && (
                  <Button
                    className="flex-1"
                    color="default"
                    size="lg"
                    variant="bordered"
                    onPress={handleBack}
                  >
                    {t("buttons.back")}
                  </Button>
                )}
                {currentStep < totalSteps ? (
                  <Button
                    className="flex-1 font-semibold"
                    color="primary"
                    size="lg"
                    onPress={handleNext}
                  >
                    {t("buttons.next")}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 font-semibold bg-gradient-to-r from-primary to-success text-white"
                    disabled={isLoading}
                    isLoading={isLoading}
                    size="lg"
                    onPress={handleSubmit}
                  >
                    {isLoading ? t("buttons.finishing") : t("buttons.finish")}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
