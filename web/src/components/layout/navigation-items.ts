import { useTranslation } from "react-i18next";

export const useNavigationItems = () => {
  const { t } = useTranslation("common");

  return [
    {
      href: "/dashboard",
      label: t("nav.dashboard"),
      icon: "solar:chart-2-bold",
    },
    {
      href: "/services",
      label: t("nav.servicesManage"),
      icon: "solar:widget-2-bold",
    },
    {
      href: "/tunnels",
      label: t("nav.tunnelsManage"),
      icon: "solar:transmission-bold",
    },
    {
      href: "/endpoints",
      label: t("nav.endpointsManage"),
      icon: "solar:server-2-bold",
    },
  ];
};

export const isNavigationItemActive = (pathname: string, href: string) => {
  const normalized = pathname.replace(/\/+$/, "");

  if (href === "/dashboard") {
    return (
      normalized === "" ||
      normalized === "/" ||
      normalized === "/dashboard" ||
      normalized.startsWith("/dashboard/")
    );
  }

  return normalized === href || normalized.startsWith(href + "/");
};
