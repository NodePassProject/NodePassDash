import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Divider
} from "@heroui/react";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useIsSSR } from '@react-aria/ssr';

import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faUser, faEye, faEyeSlash, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { addToast } from "@heroui/toast";
import { buildApiUrl } from '@/lib/utils';

export default function SetupGuidePage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    currentPassword: 'Np123456', // 默认密码预填
    newUsername: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { theme } = useTheme();
  const isSSR = useIsSSR();
  
  // 判断当前是否为暗色主题
  const isDark = !isSSR && theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 防止重复提交
    if (isLoading) {
      return;
    }
    
    setIsLoading(true);
    setError('');

    // 前端验证
    if (!formData.newUsername || !formData.newPassword || !formData.confirmPassword) {
      setError('请填写所有必填字段');
      setIsLoading(false);
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('新密码和确认密码不一致');
      setIsLoading(false);
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('新密码长度至少为6位');
      setIsLoading(false);
      return;
    }

    if (formData.newPassword === 'Np123456') {
      setError('新密码不能与默认密码相同，请设置一个安全的密码');
      setIsLoading(false);
      return;
    }

    try {
      // 使用新的合并接口同时修改用户名和密码
      const response = await fetch(buildApiUrl('/api/auth/update-security'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newUsername: formData.newUsername,
          newPassword: formData.newPassword
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addToast({
          title: "设置完成",
          description: "您的账号信息已成功更新",
          color: "success",
        });

        // 短暂延迟后跳转，让用户看到成功提示
        setTimeout(() => {
          navigate('/login');
        }, 500);
      } else {
        setError(result.message || '更新账号信息失败');
      }
    } catch (error) {
      console.error('设置失败:', error);
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
          className="w-full max-w-lg"
        >
          <Card className="shadow-2xl">
            <CardHeader className="flex flex-col gap-1 items-center pb-6 pt-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="w-16 h-16 flex items-center justify-center mb-4"
              >
                <div className="w-16 h-16 bg-warning-100 rounded-full flex items-center justify-center">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning text-2xl" />
                </div>
              </motion.div>
              <h1 className="text-2xl font-bold text-foreground">安全设置引导</h1>
              <p className="text-small text-default-500 text-center">
                检测到使用默认凭据，为了账户安全，请立即更新您的用户名和密码
              </p>
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
                    label="新用户名"
                    placeholder="请输入新的用户名"
                    value={formData.newUsername}
                    onValueChange={handleInputChange('newUsername')}
                    startContent={
                      <FontAwesomeIcon icon={faUser} className="text-default-400" />
                    }
                    isRequired
                    variant="bordered"
                    description="设置一个个性化的用户名"
                  />
                  
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    label="新密码"
                    placeholder="请输入新密码"
                    value={formData.newPassword}
                    onValueChange={handleInputChange('newPassword')}
                    startContent={
                      <FontAwesomeIcon icon={faLock} className="text-default-400" />
                    }
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="focus:outline-none"
                      >
                        <FontAwesomeIcon 
                          icon={showNewPassword ? faEyeSlash : faEye} 
                          className="text-default-400 hover:text-default-600 transition-colors"
                        />
                      </button>
                    }
                    isRequired
                    variant="bordered"
                    description="至少6位，建议包含字母、数字和符号"
                  />
                  
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    label="确认新密码"
                    placeholder="请再次输入新密码"
                    value={formData.confirmPassword}
                    onValueChange={handleInputChange('confirmPassword')}
                    startContent={
                      <FontAwesomeIcon icon={faLock} className="text-default-400" />
                    }
                    endContent={
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="focus:outline-none"
                      >
                        <FontAwesomeIcon 
                          icon={showConfirmPassword ? faEyeSlash : faEye} 
                          className="text-default-400 hover:text-default-600 transition-colors"
                        />
                      </button>
                    }
                    isRequired
                    variant="bordered"
                  />
                </div>
                
                <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning mt-0.5" />
                    <div className="text-xs text-warning-700">
                      <p className="font-medium">安全提示：</p>
                      <ul className="mt-1 space-y-1">
                        <li>• 不要使用与默认密码相同的密码</li>
                        <li>• 建议使用强密码包含大小写字母、数字和特殊字符</li>
                        <li>• 完成设置后需要重新登录</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <Button
                  type="submit"
                  color="warning"
                  size="lg"
                  className="w-full font-semibold text-white"
                  isLoading={isLoading}
                  disabled={isLoading || !formData.newUsername || !formData.newPassword || !formData.confirmPassword}
                >
                  {isLoading ? '设置中...' : '完成安全设置'}
                </Button>
              </form>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}