'use client';

import { useState, useEffect } from 'react';

// 定义全局可见性状态的键
type VisibilityKey = 
  | 'endpoints.showApiKeyAll'    // 主控管理：全局显示API Key
  | 'endpoints.showUrlAll'       // 主控管理：全局显示URL
  | 'tunnels.showFullAddress';   // 实例管理：显示完整地址

// 默认值配置
const DEFAULT_VALUES: Record<VisibilityKey, boolean> = {
  'endpoints.showApiKeyAll': false,
  'endpoints.showUrlAll': false,
  'tunnels.showFullAddress': true,
};

/**
 * 全局可见性状态管理Hook
 * 支持localStorage持久化
 */
export const useGlobalVisibility = () => {
  // 状态存储
  const [visibilityState, setVisibilityState] = useState<Record<VisibilityKey, boolean>>({
    'endpoints.showApiKeyAll': DEFAULT_VALUES['endpoints.showApiKeyAll'],
    'endpoints.showUrlAll': DEFAULT_VALUES['endpoints.showUrlAll'],
    'tunnels.showFullAddress': DEFAULT_VALUES['tunnels.showFullAddress'],
  });

  // 初始化时从localStorage读取状态
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedState: Partial<Record<VisibilityKey, boolean>> = {};
    
    // 读取所有保存的状态
    Object.keys(DEFAULT_VALUES).forEach((key) => {
      const visibilityKey = key as VisibilityKey;
      const saved = localStorage.getItem(`globalVisibility.${visibilityKey}`);
      if (saved !== null) {
        savedState[visibilityKey] = saved === 'true';
      } else {
        savedState[visibilityKey] = DEFAULT_VALUES[visibilityKey];
      }
    });

    setVisibilityState(prev => ({ ...prev, ...savedState }));
  }, []);

  // 更新单个状态
  const setVisibility = (key: VisibilityKey, value: boolean) => {
    setVisibilityState(prev => ({
      ...prev,
      [key]: value
    }));

    // 保存到localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(`globalVisibility.${key}`, String(value));
    }
  };

  // 切换单个状态
  const toggleVisibility = (key: VisibilityKey) => {
    const currentValue = visibilityState[key];
    const newValue = !currentValue;
    setVisibility(key, newValue);
    return newValue;
  };

  // 获取单个状态
  const getVisibility = (key: VisibilityKey): boolean => {
    return visibilityState[key];
  };

  // 重置所有状态为默认值
  const resetAllVisibility = () => {
    setVisibilityState(DEFAULT_VALUES);
    
    // 清除localStorage中的所有状态
    if (typeof window !== 'undefined') {
      Object.keys(DEFAULT_VALUES).forEach((key) => {
        localStorage.removeItem(`globalVisibility.${key}`);
      });
    }
  };

  return {
    // 状态获取
    getVisibility,
    
    // 状态更新
    setVisibility,
    toggleVisibility,
    
    // 批量操作
    resetAllVisibility,
    
    // 便捷访问器（主控管理相关）
    endpoints: {
      showApiKeyAll: visibilityState['endpoints.showApiKeyAll'],
      showUrlAll: visibilityState['endpoints.showUrlAll'],
      setShowApiKeyAll: (value: boolean) => setVisibility('endpoints.showApiKeyAll', value),
      setShowUrlAll: (value: boolean) => setVisibility('endpoints.showUrlAll', value),
      toggleShowApiKeyAll: () => toggleVisibility('endpoints.showApiKeyAll'),
      toggleShowUrlAll: () => toggleVisibility('endpoints.showUrlAll'),
    },
    
    // 便捷访问器（实例管理相关）
    tunnels: {
      showFullAddress: visibilityState['tunnels.showFullAddress'],
      setShowFullAddress: (value: boolean) => setVisibility('tunnels.showFullAddress', value),
      toggleShowFullAddress: () => toggleVisibility('tunnels.showFullAddress'),
    },
  };
}; 