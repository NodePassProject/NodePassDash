'use client';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Divider
} from "@heroui/react";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useIsSSR } from '@react-aria/ssr';

import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faUser, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/app/components/auth-provider';
import { addToast } from "@heroui/toast";
import { Icon } from "@iconify/react";
import { buildApiUrl } from '@/lib/utils';
import { Footer } from '@/components/layout/footer';

export default function LoginPage() {
  const router = useRouter();
  const { checkAuth, setUserDirectly } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OAuth2 配置状态
  const [oauthProviders, setOauthProviders] = useState<{provider?: "github" | "cloudflare"; config?: any}>({});

  const { theme } = useTheme();
  const isSSR = useIsSSR();
  // 判断当前是否为暗色主题
  const isDark = !isSSR && theme === 'dark';
  // 根据主题选择对应的 Logo
  const logoSrc = isDark ? '/nodepass-logo-3.svg' : '/nodepass-logo-1.svg';

  useEffect(() => {
    /**
     * 先获取系统当前绑定的 provider，再读取其配置
     */
    const fetchCurrentProvider = async () => {
      try {
        const res = await fetch('/api/auth/oauth2'); // 仅返回 provider
        const data = await res.json();
        if (data.success && data.provider) {
          const cur = data.provider as "github" | "cloudflare";
          // 只需 provider 即可
          setOauthProviders({ provider: cur });
        }
      } catch (e) {
        console.error('获取 OAuth2 当前绑定失败', e);
      }
    };

    fetchCurrentProvider();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    console.log('🔐 开始登录流程', { username: formData.username });

    try {
      const response = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      console.log('📡 登录请求响应', { 
        status: response.status, 
        ok: response.ok 
      });

      const result = await response.json();
      console.log('📋 登录响应数据', result);

      if (response.ok) {
        console.log('✅ 登录成功，设置用户状态并持久化');
        // 登录成功后直接设置用户状态并持久化
        const loginUser = { username: formData.username };
        setUserDirectly(loginUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('nodepass.user', JSON.stringify(loginUser));
        }
        
        console.log('🚀 重定向到仪表盘');
        router.push('/dashboard');
      } else {
        console.error('❌ 登录失败', result);
        setError(result.error || '登录失败');
      }
    } catch (error) {
      console.error('🚨 登录请求异常:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string) => (value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // 清除错误信息
    if (error) setError('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background to-default-100">
      {/* 主要内容区域 */}
      <div className="flex-1 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl">
          <CardHeader className="flex flex-col gap-1 items-center pb-6 pt-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="w-16 h-16 flex items-center justify-center mb-4"
            >
              {/* 根据主题动态渲染 Logo */}
              <Image
                src={logoSrc}
                alt="NodePassDash Logo"
                width={64}
                height={64}
                priority
              />
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground">NodePassDash</h1>
            <p className="text-small text-default-500">请输入您的登录凭据</p>
          </CardHeader>
          
          <CardBody className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 bg-danger-50 border border-danger-200 rounded-lg"
                >
                  <p className="text-danger text-small">{error}</p>
                </motion.div>
              )}
              
              <div className="space-y-4">
                <Input
                  type="text"
                  label="用户名"
                  placeholder="请输入用户名"
                  value={formData.username}
                  onValueChange={handleInputChange('username')}
                  startContent={
                    <FontAwesomeIcon icon={faUser} className="text-default-400" />
                  }
                  isRequired
                  variant="bordered"
                />
                
                <Input
                  type={showPassword ? "text" : "password"}
                  label="密码"
                  placeholder="请输入密码"
                  value={formData.password}
                  onValueChange={handleInputChange('password')}
                  startContent={
                    <FontAwesomeIcon icon={faLock} className="text-default-400" />
                  }
                  endContent={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="focus:outline-none"
                    >
                      <FontAwesomeIcon 
                        icon={showPassword ? faEyeSlash : faEye} 
                        className="text-default-400 hover:text-default-600 transition-colors"
                      />
                    </button>
                  }
                  isRequired
                  variant="bordered"
                />
              </div>
              
              <Button
                type="submit"
                color="primary"
                size="lg"
                className="w-full font-semibold"
                isLoading={isLoading}
                disabled={!formData.username || !formData.password}
              >
                {isLoading ? '登录中...' : '登录'}
              </Button>
            </form>

            {/* OAuth2 登录选项 */}
            {oauthProviders.provider && (
              <div className="mt-6 space-y-3">
                <Divider />
                <p className="text-center text-sm text-default-500">或使用以下方式登录</p>
                <div className="flex flex-col gap-3">
                  {oauthProviders.provider === 'github' && (
                    <Button
                      variant="bordered"
                      color="default"
                      startContent={<Icon icon="simple-icons:github" width={20} />}
                      onPress={() => {
                        window.location.href = '/api/oauth2/login';
                      }}
                    >
                      使用 GitHub 登录
                    </Button>
                  )}
                  {oauthProviders.provider === 'cloudflare' && (
                    <Button
                      variant="bordered"
                      color="default"
                      startContent={<Icon icon="simple-icons:cloudflare" width={20} />}
                      onPress={() => {
                        window.location.href = '/api/oauth2/login';
                      }}
                    >
                      使用 Cloudflare 登录
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
