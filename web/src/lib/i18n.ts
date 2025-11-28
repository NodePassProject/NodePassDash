import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// 导入翻译资源
import commonZh from "@/locales/zh-CN/common.json";
import authZh from "@/locales/zh-CN/auth.json";
import dashboardZh from "@/locales/zh-CN/dashboard.json";
import servicesZh from "@/locales/zh-CN/services.json";
import commonEn from "@/locales/en-US/common.json";
import authEn from "@/locales/en-US/auth.json";
import dashboardEn from "@/locales/en-US/dashboard.json";
import servicesEn from "@/locales/en-US/services.json";

// 定义支持的语言
export const supportedLanguages = ["zh-CN", "en-US"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

// 定义翻译资源类型
export const resources = {
  "zh-CN": {
    common: commonZh,
    auth: authZh,
    dashboard: dashboardZh,
    services: servicesZh,
  },
  "en-US": {
    common: commonEn,
    auth: authEn,
    dashboard: dashboardEn,
    services: servicesEn,
  },
} as const;

// 初始化i18next
i18n
  .use(LanguageDetector) // 自动检测浏览器语言
  .use(initReactI18next) // 集成React
  .init({
    resources,
    fallbackLng: "zh-CN", // 默认语言为中文
    defaultNS: "common", // 默认命名空间
    ns: ["common", "auth", "dashboard", "services"], // 可用的命名空间

    // 语言检测配置
    detection: {
      // 检测顺序：localStorage -> 浏览器语言 -> 默认语言
      order: ["localStorage", "navigator"],
      // 缓存用户选择的语言
      caches: ["localStorage"],
      // localStorage中的key
      lookupLocalStorage: "nodepass-language",
    },

    interpolation: {
      escapeValue: false, // React已经处理了XSS防护
    },

    react: {
      useSuspense: false, // 禁用Suspense，避免闪烁
    },
  });

export default i18n;
