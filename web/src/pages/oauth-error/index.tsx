import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "next-themes";
import { useIsSSR } from "@react-aria/ssr";
import { motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShieldAlt,
  faRedo,
  faHome,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";

export default function OAuthErrorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");
  const [provider, setProvider] = useState("");

  const { theme } = useTheme();
  const isSSR = useIsSSR();
  // 判断当前是否为暗色主题
  const isDark = !isSSR && theme === "dark";

  useEffect(() => {
    // 从 URL 参数获取错误信息
    const error = searchParams.get("error") || "OAuth2 登录失败";
    const providerParam = searchParams.get("provider") || "";

    setErrorMessage(decodeURIComponent(error));
    setProvider(providerParam);
  }, [searchParams]);

  const handleRetryLogin = () => {
    navigate("/login");
  };

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <div className="flex flex-col bg-gradient-to-br from-background to-default-100 min-h-screen">
      {/* 主要内容区域 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
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
                {/* Logo placeholder - in real implementation you'd import the image */}
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">NP</span>
                </div>
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground">
                NodePassDash
              </h1>
              <p className="text-small text-default-500">OAuth2 登录遇到问题</p>
            </CardHeader>

            <CardBody className="px-8 pb-8">
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
                initial={{ opacity: 0, y: 10 }}
                transition={{ delay: 0.3 }}
              >
                {/* 错误状态图标 */}
                <div className="flex justify-center">
                  <div className="w-20 h-20 bg-danger-50 rounded-full flex items-center justify-center">
                    <FontAwesomeIcon
                      className="text-danger text-4xl"
                      icon={faShieldAlt}
                    />
                  </div>
                </div>

                {/* 错误信息 */}
                <div className="text-center space-y-3">
                  <h2 className="text-xl font-semibold text-danger">
                    登录失败
                  </h2>

                  <div className="p-4 bg-danger-50 border border-danger-200 rounded-lg">
                    <p className="text-danger text-sm font-medium mb-2">
                      错误详情
                    </p>
                    <p className="text-danger-600 text-xs break-words">
                      {errorMessage}
                    </p>
                    {provider && (
                      <p className="text-danger-500 text-xs mt-2">
                        提供者:{" "}
                        {provider === "github"
                          ? "GitHub"
                          : provider === "cloudflare"
                            ? "Cloudflare"
                            : provider}
                      </p>
                    )}
                  </div>

                  <div className="text-small text-default-500 space-y-1">
                    <p>• 可能的原因：系统已绑定其他 OAuth2 账户</p>
                    <p>• 每个系统只能绑定一个 OAuth2 用户</p>
                    <p>• 请联系管理员或使用已绑定的账户登录</p>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full font-semibold"
                    color="primary"
                    size="lg"
                    startContent={<FontAwesomeIcon icon={faRedo} />}
                    onPress={handleRetryLogin}
                  >
                    重新登录
                  </Button>

                  <Button
                    className="w-full font-semibold"
                    color="default"
                    size="lg"
                    startContent={<FontAwesomeIcon icon={faHome} />}
                    variant="bordered"
                    onPress={handleGoHome}
                  >
                    返回首页
                  </Button>
                </div>

                {/* 帮助信息 */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 text-xs text-default-400">
                    <FontAwesomeIcon icon={faInfoCircle} />
                    <span>如需帮助，请联系系统管理员</span>
                  </div>
                </div>
              </motion.div>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
