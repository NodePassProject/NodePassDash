import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// 导入翻译资源
import commonZh from "@/locales/zh-CN/common.json";
import authZh from "@/locales/zh-CN/auth.json";
import dashboardZh from "@/locales/zh-CN/dashboard.json";
import servicesZh from "@/locales/zh-CN/services.json";
import settingsZh from "@/locales/zh-CN/settings.json";
import tunnelsZh from "@/locales/zh-CN/tunnels.json";
import endpointsZh from "@/locales/zh-CN/endpoints.json";
import debugZh from "@/locales/zh-CN/debug.json";
import examplesZh from "@/locales/zh-CN/examples.json";
import modalsZh from "@/locales/zh-CN/modals.json";
import oauthZh from "@/locales/zh-CN/oauth.json";
import setupGuideZh from "@/locales/zh-CN/setup-guide.json";
import commonEn from "@/locales/en-US/common.json";
import authEn from "@/locales/en-US/auth.json";
import dashboardEn from "@/locales/en-US/dashboard.json";
import servicesEn from "@/locales/en-US/services.json";
import settingsEn from "@/locales/en-US/settings.json";
import tunnelsEn from "@/locales/en-US/tunnels.json";
import endpointsEn from "@/locales/en-US/endpoints.json";
import debugEn from "@/locales/en-US/debug.json";
import examplesEn from "@/locales/en-US/examples.json";
import modalsEn from "@/locales/en-US/modals.json";
import oauthEn from "@/locales/en-US/oauth.json";
import setupGuideEn from "@/locales/en-US/setup-guide.json";

// 定义支持的语言
export const supportedLanguages = ["zh-CN", "en-US"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

// 浏览器语言映射函数：将浏览器检测到的语言映射到支持的语言
const convertDetectedLanguage = (lng: string): SupportedLanguage => {
  // 移除语言代码中的地区后缀，例如 zh-Hans-CN -> zh
  const langCode = lng.toLowerCase().split("-")[0];

  // 映射规则：zh 系列 -> zh-CN，en 系列 -> en-US
  if (langCode === "zh") {
    return "zh-CN";
  }
  if (langCode === "en") {
    return "en-US";
  }

  // 精确匹配支持的语言
  if (supportedLanguages.includes(lng as SupportedLanguage)) {
    return lng as SupportedLanguage;
  }

  // 默认返回中文
  return "zh-CN";
};

// 定义翻译资源类型
export const resources = {
  "zh-CN": {
    common: commonZh,
    auth: authZh,
    dashboard: dashboardZh,
    services: servicesZh,
    settings: settingsZh,
    tunnels: tunnelsZh,
    endpoints: endpointsZh,
    debug: debugZh,
    examples: examplesZh,
    modals: modalsZh,
    oauth: oauthZh,
    "setup-guide": setupGuideZh,
  },
  "en-US": {
    common: commonEn,
    auth: authEn,
    dashboard: dashboardEn,
    services: servicesEn,
    settings: settingsEn,
    tunnels: tunnelsEn,
    endpoints: endpointsEn,
    debug: debugEn,
    examples: examplesEn,
    modals: modalsEn,
    oauth: oauthEn,
    "setup-guide": setupGuideEn,
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
    ns: ["common", "auth", "dashboard", "services", "settings", "tunnels", "endpoints", "debug", "examples", "modals", "oauth", "setup-guide"], // 可用的命名空间

    // 语言检测配置
    detection: {
      // 检测顺序：localStorage -> 浏览器语言 -> 默认语言
      order: ["localStorage", "navigator"],
      // 缓存用户选择的语言
      caches: ["localStorage"],
      // localStorage中的key
      lookupLocalStorage: "nodepass-language",
      // 将检测到的语言转换为支持的语言格式
      convertDetectedLanguage,
    },

    interpolation: {
      escapeValue: false, // React已经处理了XSS防护
    },

    react: {
      useSuspense: false, // 禁用Suspense，避免闪烁
    },
  });

export default i18n;
