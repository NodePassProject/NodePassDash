export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "NodePassDash",
  description: "A modern and secure tunnel dashboard.",
  navItems: [
    {
      label: "仪表盘",
      href: "/dashboard",
    },
    {
      label: "通道管理",
      href: "/tunnels",
    },
    {
      label: "端点管理",
      href: "/endpoints",
    },
  ],
  navMenuItems: [
    {
      label: "设置",
      href: "/settings",
    },
    {
      label: "退出登录",
      href: "/logout",
    },
  ],
  links: {
    github: "https://github.com/ultrathink/nodepass",
    docs: "https://nodepass.ultrathink.org/docs",
  },
};
