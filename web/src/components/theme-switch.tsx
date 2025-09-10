import {
  Button
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTheme } from "next-themes";

export interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch: React.FC<ThemeSwitchProps> = ({
  className,
}) => {
  const { theme, setTheme } = useTheme();

  const onChange = () => {
    theme === "light" ? setTheme("dark") : setTheme("light");
  };

  const isDark = theme === "dark";

  return (
    <Button
      isIconOnly
      variant="light"
      size="sm"
      onClick={onChange}
      aria-label={`切换到${isDark ? "浅色" : "深色"}主题`}
      className={`text-default-600 hover:text-primary ${className}`}
    >
      {isDark ? (
        <Icon icon="solar:moon-bold" width={20} />
      ) : (
        <Icon icon="solar:sun-bold" width={20} />
      )}
    </Button>
  );
};
