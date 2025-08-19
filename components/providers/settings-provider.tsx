"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

// 设置类型定义
interface Settings {
  theme: 'light' | 'dark' | 'system';
  isBeginnerMode: boolean;
  isPrivacyMode: boolean;
  isExperimentalMode: boolean;
  autoCheckUpdates: boolean;
  updateCheckFrequency: 'daily' | 'weekly' | 'monthly' | 'never';
  updateCheckTime: string;
  updateNotifications: boolean;
  silentDownload: boolean;
}

// 默认设置
const defaultSettings: Settings = {
  theme: 'system',
  isBeginnerMode: false,
  isPrivacyMode: false,
  isExperimentalMode: false,
  autoCheckUpdates: true,
  updateCheckFrequency: 'weekly',
  updateCheckTime: '06:00',
  updateNotifications: true,
  silentDownload: false,
};

// 设置上下文类型
interface SettingsContextType {
  settings: Settings;
  updateTheme: (theme: 'light' | 'dark' | 'system') => void;
  toggleBeginnerMode: () => void;
  togglePrivacyMode: () => void;
  toggleExperimentalMode: () => void;
  updateSettings: (newSettings: Partial<Settings>) => void;
  toggleAutoCheckUpdates: () => void;
  toggleUpdateNotifications: () => void;
  toggleSilentDownload: () => void;
  handleManualCheck: () => void;
}

// 创建上下文
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// 本地存储键名
const SETTINGS_STORAGE_KEY = 'nodepass-settings';

// 设置提供者组件
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const { theme, setTheme } = useTheme();

  // 从本地存储加载设置
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      console.log('Stored settings:', storedSettings);
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        console.log('Parsed settings:', parsedSettings);
        setSettings({ ...defaultSettings, ...parsedSettings });
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 只在初始化时同步，避免循环更新
  useEffect(() => {
    if (isLoaded && settings.theme && settings.theme !== theme) {
      console.log('Initial sync - setting theme to:', settings.theme);
      setTheme(settings.theme);
    }
  }, [isLoaded]);

  // 只同步来自外部（如 navbar ThemeSwitch）的 theme 变化到 settings
  useEffect(() => {
    if (isLoaded && theme && theme !== settings.theme) {
      console.log('External theme change detected:', theme);
      const newSettings = { ...settings, theme: theme as 'light' | 'dark' | 'system' };
      setSettings(newSettings);
      saveSettings(newSettings);
    }
  }, [theme, isLoaded]);

  // 保存设置到本地存储
  const saveSettings = (newSettings: Settings) => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error('保存设置失败:', error);
    }
  };

  // 更新主题
  const updateTheme = (newTheme: 'light' | 'dark' | 'system') => {
    console.log('updateTheme called with:', newTheme);
    console.log('Current settings:', settings);
    
    // 如果主题没有变化，直接返回
    if (settings.theme === newTheme) {
      console.log('Theme unchanged, skipping update');
      return;
    }
    
    const newSettings = { ...settings, theme: newTheme };
    console.log('New settings:', newSettings);
    setSettings(newSettings);
    saveSettings(newSettings);
    
    // 同步更新 next-themes 的主题
    console.log('Calling setTheme with:', newTheme);
    setTheme(newTheme);
    
    // 检查 HTML 元素的类
    setTimeout(() => {
      const htmlElement = document.documentElement;
      console.log('HTML classes after theme change:', htmlElement.className);
      console.log('Data-theme attribute:', htmlElement.getAttribute('data-theme'));
    }, 100);
  };

  // 切换新手模式
  const toggleBeginnerMode = () => {
    const newSettings = { ...settings, isBeginnerMode: !settings.isBeginnerMode };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // 切换隐私模式
  const togglePrivacyMode = () => {
    const newSettings = { ...settings, isPrivacyMode: !settings.isPrivacyMode };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // 切换实验性功能
  const toggleExperimentalMode = () => {
    const newSettings = { ...settings, isExperimentalMode: !settings.isExperimentalMode };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // 切换自动检查更新
  const toggleAutoCheckUpdates = () => {
    const newSettings = { ...settings, autoCheckUpdates: !settings.autoCheckUpdates };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // 切换更新通知
  const toggleUpdateNotifications = () => {
    const newSettings = { ...settings, updateNotifications: !settings.updateNotifications };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // 切换静默下载
  const toggleSilentDownload = () => {
    const newSettings = { ...settings, silentDownload: !settings.silentDownload };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // 手动检查更新
  const handleManualCheck = () => {
    // TODO: 实现手动检查更新逻辑
    console.log('手动检查更新...');
    // 这里可以调用后端API检查更新
  };

  // 更新多个设置
  const updateSettings = (newSettings: Partial<Settings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  // 等待设置加载完成
  if (!isLoaded) {
    return null;
  }

  const contextValue: SettingsContextType = {
    settings,
    updateTheme,
    toggleBeginnerMode,
    togglePrivacyMode,
    toggleExperimentalMode,
    updateSettings,
    toggleAutoCheckUpdates,
    toggleUpdateNotifications,
    toggleSilentDownload,
    handleManualCheck,
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};

// 自定义Hook，用于在组件中使用设置
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings 必须在 SettingsProvider 内部使用');
  }
  return context;
};

