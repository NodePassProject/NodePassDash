import { NavbarBrand, Link, cn, Badge } from "@heroui/react";
import { useTheme } from "next-themes";
import { useIsSSR } from "@react-aria/ssr";

import { fontSans } from "@/config/fonts";
import { getVersion } from "@/lib/version";

// NodePass Logo 组件
const NodePassLogo = () => {
  const { theme, resolvedTheme } = useTheme();
  const isSSR = useIsSSR();

  // 根据主题选择颜色 - 使用 resolvedTheme 来正确处理 system 主题
  const isDark = !isSSR && resolvedTheme === "dark";
  const pathColor = isDark ? "#FFFFFF" : "#000000";

  return (
    <svg
      className="w-8 h-8"
      viewBox="0 0 480 480"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* NodePass Logo */}
      <g transform="translate(64, 57.2)">
        <svg
          height="365.6"
          viewBox="0 0 448 512"
          width="352"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M248 106.6c18.9-9 32-28.3 32-50.6c0-30.9-25.1-56-56-56s-56 25.1-56 56c0 22.3 13.1 41.6 32 50.6v98.8c-2.8 1.3-5.5 2.9-8 4.7l-80.1-45.8c1.6-20.8-8.6-41.6-27.9-52.8C57.2 96 23 105.2 7.5 132S1.2 193 28 208.5c1.3.8 2.6 1.5 4 2.1v90.8c-1.3.6-2.7 1.3-4 2.1C1.2 319-8 353.2 7.5 380s49.7 36 76.5 20.5c19.3-11.1 29.4-32 27.8-52.8l50.5-28.9c-11.5-11.2-19.9-25.6-23.8-41.7l-50.5 29c-2.6-1.8-5.2-3.3-8-4.7v-90.8c2.8-1.3 5.5-2.9 8-4.7l80.1 45.8c-.1 1.4-.2 2.8-.2 4.3c0 22.3 13.1 41.6 32 50.6v98.8c-18.9 9-32 28.3-32 50.6c0 30.9 25.1 56 56 56s56-25.1 56-56c0-22.3-13.1-41.6-32-50.6v-98.8c2.8-1.3 5.5-2.9 8-4.7l80.1 45.8c-1.6 20.8 8.6 41.6 27.8 52.8c26.8 15.5 61 6.3 76.5-20.5s6.3-61-20.5-76.5c-1.3-.8-2.7-1.5-4-2.1v-90.8c1.4-.6 2.7-1.3 4-2.1c26.8-15.5 36-49.7 20.5-76.5s-49.5-36-76.3-20.5c-19.3 11.1-29.4 32-27.8 52.8l-50.6 28.9c11.5 11.2 19.9 25.6 23.8 41.7l50.6-29c2.6 1.8 5.2 3.3 8 4.7v90.8c-2.8 1.3-5.5 2.9-8 4.6l-80.1-45.8c.1-1.4.2-2.8.2-4.3c0-22.3-13.1-41.6-32-50.6v-98.8z"
            fill={pathColor}
          />
        </svg>
      </g>
    </svg>
  );
};

/**
 * 导航栏Logo组件
 */
export const NavbarLogo = () => {
  // 检测环境和版本
  const isDev = import.meta.env.DEV;
  const version = getVersion();
  const isBeta = version.includes('beta');

  // 确定badge内容和颜色
  const getBadgeProps = () => {
    if (isDev) {
      return { content: "dev", color: "default" as const };
    }
    if (isBeta) {
      return { content: "beta", color: "default" as const };
    }
    return null;
  };

  const badgeProps = getBadgeProps();

  return (
    <NavbarBrand as="li" className="gap-3 max-w-fit">
      <Link className="flex justify-start items-center gap-2" href="/">
        {badgeProps ? (
          <Badge
            content={badgeProps.content}
            color={badgeProps.color}
            size="sm"
            variant="flat"
          >
            <NodePassLogo />
          </Badge>
        ) : (
          <NodePassLogo />
        )}
        <p className={cn("font-bold text-foreground", fontSans.className)}>
          NodePassDash
        </p>
      </Link>
    </NavbarBrand>
  );
};
