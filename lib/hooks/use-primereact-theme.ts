"use client";

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * 自定义 Hook：让 PrimeReact 主题跟随 HeroUI 主题切换
 * 
 * 这个 Hook 会：
 * 1. 监听 HeroUI 主题变化
 * 2. 动态加载对应的 PrimeReact CSS 主题文件
 * 3. 提供主题加载状态和错误处理
 * 4. 自动清理资源
 * 5. 支持 CDN 和本地主题文件回退机制
 * 
 * @param options 配置选项
 * @returns 主题状态和控制方法
 */
export const usePrimeReactTheme = (options?: {
  lightTheme?: string;
  darkTheme?: string;
  enableConsoleLog?: boolean;
}) => {
  const { theme } = useTheme();
  
  // 默认配置
  const {
    lightTheme = 'lara-light-blue',
    darkTheme = 'lara-dark-blue',
    enableConsoleLog = false
  } = options || {};
  
  const [currentPrimeTheme, setCurrentPrimeTheme] = useState<string>(lightTheme);
  const [isThemeLoading, setIsThemeLoading] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);

  const log = (message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    if (enableConsoleLog) {
      console[type](`[PrimeReact Theme] ${message}`);
    }
  };

  /**
   * 动态加载主题样式表
   */
  const loadTheme = (newTheme: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      setIsThemeLoading(true);
      setThemeError(null);
      
      // 移除旧主题样式
      const oldThemeLink = document.getElementById('primereact-theme');
      if (oldThemeLink) {
        oldThemeLink.remove();
      }
      
      // 创建新主题链接
      const link = document.createElement('link');
      link.id = 'primereact-theme';
      link.rel = 'stylesheet';
      link.type = 'text/css';
      
      // 优先使用 CDN
      const cdnUrl = `https://unpkg.com/primereact/resources/themes/${newTheme}/theme.css`;
      const localUrl = `/primereact/themes/${newTheme}/theme.css`;
      
      link.href = cdnUrl;
      
      link.onload = () => {
        setCurrentPrimeTheme(newTheme);
        setIsThemeLoading(false);
        log(`主题切换成功: ${newTheme}`, 'info');
        resolve();
      };
      
      link.onerror = () => {
        log(`CDN 加载失败，尝试本地路径: ${newTheme}`, 'warn');
        
        // 移除失败的链接
        link.remove();
        
        // 尝试本地路径
        const fallbackLink = document.createElement('link');
        fallbackLink.id = 'primereact-theme';
        fallbackLink.rel = 'stylesheet';
        fallbackLink.type = 'text/css';
        fallbackLink.href = localUrl;
        
        fallbackLink.onload = () => {
          setCurrentPrimeTheme(newTheme);
          setIsThemeLoading(false);
          log(`主题切换成功 (本地): ${newTheme}`, 'info');
          resolve();
        };
        
        fallbackLink.onerror = () => {
          const errorMsg = `主题加载完全失败: ${newTheme}`;
          setThemeError(errorMsg);
          setIsThemeLoading(false);
          log(errorMsg, 'error');
          reject(new Error(errorMsg));
        };
        
        document.head.appendChild(fallbackLink);
      };
      
      document.head.appendChild(link);
    });
  };

  // 主题切换效果
  useEffect(() => {
    const newTheme = theme === 'dark' ? darkTheme : lightTheme;
    
    // 如果主题已经是目标主题，则不需要切换
    if (newTheme === currentPrimeTheme) {
      return;
    }
    
    log(`切换主题: ${currentPrimeTheme} -> ${newTheme}`);
    
    // 使用 setTimeout 确保 DOM 更新完成
    const timer = setTimeout(() => {
      loadTheme(newTheme).catch(console.error);
    }, 0);
    
    return () => {
      clearTimeout(timer);
    };
  }, [theme, currentPrimeTheme, lightTheme, darkTheme]);

  // 组件挂载时初始化主题
  useEffect(() => {
    const initTheme = theme === 'dark' ? darkTheme : lightTheme;
    
    // 检查是否已经有主题链接
    const existingThemeLink = document.getElementById('primereact-theme');
    if (!existingThemeLink) {
      log(`初始化主题: ${initTheme}`);
      loadTheme(initTheme).catch(console.error);
    } else {
      // 如果已存在链接，直接设置当前主题
      setCurrentPrimeTheme(initTheme);
    }
    
    // 组件卸载时清理
    return () => {
      const themeLink = document.getElementById('primereact-theme');
      if (themeLink) {
        log('清理主题链接');
        themeLink.remove();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 手动切换到指定主题
   */
  const switchToTheme = async (themeName: string) => {
    try {
      await loadTheme(themeName);
      log(`手动切换主题成功: ${themeName}`);
    } catch (error) {
      log(`手动切换主题失败: ${themeName}`, 'error');
      throw error;
    }
  };

  return {
    currentTheme: currentPrimeTheme,
    isLoading: isThemeLoading,
    error: themeError,
    switchToTheme,
    // 便捷方法
    switchToLight: () => switchToTheme(lightTheme),
    switchToDark: () => switchToTheme(darkTheme),
  };
};

export default usePrimeReactTheme;
