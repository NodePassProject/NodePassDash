"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * 支持的语言枚举
 */
export type Language = "en" | "zh-CN";

interface LanguageContextValue {
  /** 当前语言 */
  locale: Language;
  /** 切换语言（在 en 与 zh-CN 之间切换） */
  toggle: () => void;
  /** 设置语言到指定 locale */
  setLocale: (lang: Language) => void;
}

// 创建上下文，提供默认实现以避免 undefined 判断
const LanguageContext = createContext<LanguageContextValue>({
  locale: "zh-CN",
  // 默认实现，仅做占位
  toggle: () => {},
  setLocale: () => {}
});

/**
 * 语言提供者，负责全局管理 locale 状态
 */
export const LanguageProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [locale, setLocaleState] = useState<Language>("zh-CN");

  // 初始化时尝试从 localStorage 读取语言偏好
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = localStorage.getItem("locale") as Language | null;
    if (cached === "en" || cached === "zh-CN") {
      setLocaleState(cached);
      document.documentElement.lang = cached;
    } else {
      document.documentElement.lang = "zh-CN";
    }
  }, []);

  /**
   * 更新语言并持久化到 localStorage
   */
  const setLocale = (lang: Language) => {
    setLocaleState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", lang);
      // 同步更新 html 标签的 lang 属性，便于 SEO 与无障碍
      document.documentElement.lang = lang;
    }
  };

  /**
   * 简单地在中英文之间切换
   */
  const toggle = () => setLocale(locale === "zh-CN" ? "en" : "zh-CN");

  return (
    <LanguageContext.Provider value={{ locale, toggle, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
};

/**
 * 语言上下文消费 Hook
 */
export const useLanguage = () => useContext(LanguageContext); 