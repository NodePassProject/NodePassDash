import { useTranslation } from "react-i18next";

import { getVersion } from "@/lib/version";

/**
 * 页脚组件
 * 包含版本信息和相关链接
 */
export const Footer = () => {
  const { t, i18n } = useTranslation("common");
  const isZhCN = i18n.language === "zh-CN";

  return (
    <footer className="w-full flex items-center justify-center py-3">
      <div className="text-default-600 text-sm">
        {t("footer.copyright")} | {t("footer.version")}
        {getVersion()} | {isZhCN && t("footer.poweredBy")}{" "}
        <a
          className="text-blue-500 hover:text-blue-600 transition-colors"
          href="https://github.com/yosebyte/nodepass"
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("footer.poweredByLink")}
        </a>
        {isZhCN ? ` ${t("footer.poweredBySuffix")}` : ""}
        {!isZhCN && ` ${t("footer.poweredBy")}`}
      </div>
    </footer>
  );
};
