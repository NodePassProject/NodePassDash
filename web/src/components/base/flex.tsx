import { cn } from "@heroui/react";
import * as React from "react";

interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  direction?: "row" | "col" | "row-reverse" | "col-reverse";
  wrap?: "wrap" | "nowrap" | "wrap-reverse";
}

export const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
  ({ 
    children, 
    className, 
    justify = "start", 
    align = "center", 
    direction = "row", 
    wrap = "nowrap",
    ...props 
  }, ref) => {
    const justifyClasses = {
      start: "justify-start",
      center: "justify-center", 
      end: "justify-end",
      between: "justify-between",
      around: "justify-around",
      evenly: "justify-evenly"
    };

    const alignClasses = {
      start: "items-start",
      center: "items-center",
      end: "items-end", 
      stretch: "items-stretch",
      baseline: "items-baseline"
    };

    const directionClasses = {
      row: "flex-row",
      col: "flex-col",
      "row-reverse": "flex-row-reverse",
      "col-reverse": "flex-col-reverse"
    };

    const wrapClasses = {
      wrap: "flex-wrap",
      nowrap: "flex-nowrap",
      "wrap-reverse": "flex-wrap-reverse"
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex",
          justifyClasses[justify],
          alignClasses[align],
          directionClasses[direction],
          wrapClasses[wrap],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Flex.displayName = "Flex";

// 为了向后兼容，保留 FlexBox 组件
export const FlexBox: React.FC<FlexProps> = (props) => {
  return <Flex {...props} />;
};