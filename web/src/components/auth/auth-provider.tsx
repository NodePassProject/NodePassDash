import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildApiUrl } from '@/lib/utils';

interface User {
  username: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  checkAuth: (forceCheck?: boolean) => Promise<void>;
  setUserDirectly: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<number>(0);
  const navigate = useNavigate();

  // 初始挂载时，尝试从 localStorage 读取用户信息，提供"乐观"登录体验，防止刷新立刻跳登录页
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('nodepass.user');
        if (stored) {
          const storedUser = JSON.parse(stored) as User;
          setUser(storedUser);
          console.log('📦 从localStorage恢复用户状态', storedUser);
        }
      } catch (e) {
        console.error('读取本地用户失败', e);
        localStorage.removeItem('nodepass.user');
      }
    }
  }, []);

  // 验证当前用户会话
  const checkAuth = async (forceCheck = false) => {
    console.log('🔍 开始检查身份验证状态', { forceCheck, user: user?.username, loading });
    
    // 如果正在加载中且不是强制检查，则跳过
    if (loading && !forceCheck) {
      console.log('⚡ 跳过身份验证检查（正在加载中）');
      return;
    }
    
    // 避免频繁检查，30秒内不重复检查（除非强制检查）
    const now = Date.now();
    if (!forceCheck && now - lastCheckTime < 30000) {
      console.log('⏭️ 跳过身份验证检查（30秒内已检查）');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch(buildApiUrl('/api/auth/me'));
      console.log('🔍 身份验证检查响应', { 
        status: response.status, 
        ok: response.ok 
      });
      
      if (response.ok) {
        const userData = await response.json();
        console.log('✅ 身份验证成功', userData);

        // 兼容两种返回格式：{ user: { username: "" } } 或 { username: "" }
        let extractedUser: User | null = null;
        if (userData.user && userData.user.username) {
          extractedUser = userData.user as User;
        } else if (userData.username) {
          extractedUser = { username: userData.username } as User;
        }

        if (extractedUser) {
          setUser(extractedUser);

          // 同步到 localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('nodepass.user', JSON.stringify(extractedUser));
          }
        } else {
          // 格式异常视为未登录
          setUser(null);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('nodepass.user');
          }
        }
      } else {
        console.log('❌ 身份验证失败，清除用户状态');
        setUser(null);

        if (typeof window !== 'undefined') {
          localStorage.removeItem('nodepass.user');
        }
      }
      setLastCheckTime(now);
    } catch (error) {
      console.error('🚨 验证身份失败:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // 登出函数
  const logout = async () => {
    console.log('👋 开始登出流程');
    setLoading(true);
    
    try {
      await fetch(buildApiUrl('/api/auth/logout'), {
        method: 'POST',
      });
      console.log('✅ 登出请求完成');
    } catch (error) {
      console.error('🚨 登出请求失败:', error);
    } finally {
      // 清除用户状态和本地存储
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('nodepass.user');
      }
      
      // 延迟跳转，确保状态清理完成
      setTimeout(() => {
        setLoading(false);
        navigate('/login', { replace: true });
      }, 100);
    }
  };

  useEffect(() => {
    // 延迟执行初始身份验证检查，让localStorage恢复先完成
    const timeoutId = setTimeout(() => {
      checkAuth(true); // 初始检查强制执行
    }, 200);
    
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, checkAuth, setUserDirectly: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}