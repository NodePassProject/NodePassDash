import { Snippet as HeroSnippet, SnippetProps } from "@heroui/react";
import { cn } from "@heroui/react";

interface MobileSnippetProps extends Omit<SnippetProps, 'classNames'> {
  className?: string;
  mobileOptimized?: boolean;
}

/**
 * 移动端优化的 Snippet 组件
 * 解决移动端文本换行和显示问题
 */
export const Snippet = ({ 
  children, 
  className,
  mobileOptimized = true,
  ...props 
}: MobileSnippetProps) => {
  const defaultClassNames = {
    base: cn("w-full", className),
    pre: "font-mono break-all whitespace-pre-wrap overflow-x-auto max-w-full",
    content: "font-mono break-all whitespace-pre-wrap overflow-x-auto max-w-full",
    copyButton: "hidden sm:flex"
  };

  return (
    <HeroSnippet
      {...props}
      classNames={mobileOptimized ? defaultClassNames : undefined}
    >
      {children}
    </HeroSnippet>
  );
};