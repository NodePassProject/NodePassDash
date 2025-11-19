import React from "react";

export type CellValueProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  onPress?: () => void;
  isInteractive?: boolean;
};

const CellValue = React.forwardRef<HTMLDivElement, CellValueProps>(
  ({ label, value, icon, children, onPress, isInteractive, ...props }, ref) => {
    const isClickable = Boolean(onPress);

    return (
      <div
        ref={ref}
        className={`flex items-start gap-3 group transition-all duration-200 ${
          isClickable
            ? "cursor-pointer hover:bg-default-50 active:bg-default-100 rounded-md px-2 py-1 -mx-2 -my-1"
            : "hover:bg-default-25 rounded-md px-2 py-1 -mx-2 -my-1"
        }`}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onPress}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPress?.();
                }
              }
            : undefined
        }
        {...props}
      >
        {/* Icon column */}
        <div
          className="flex-shrink-0 flex items-center justify-center bg-default-100 rounded-md transition-all duration-200 group-hover:bg-default-200 group-hover:scale-105 relative"
          style={{
            width: "calc(1.25rem + 0.125rem + 1.25rem)",
            height: "calc(1.25rem + 0.125rem + 1.25rem)",
          }}
        >
          <div className="transition-transform duration-200 group-hover:scale-110">
            {icon}
          </div>

          {/* Interactive indicator dot */}
          {isInteractive && (
            <div className="absolute top-1 right-1 w-1 h-1 bg-[#52525A] dark:bg-white rounded-full shadow-sm" />
          )}
        </div>

        {/* Content column */}
        <div className="flex-1 min-w-0">
          {/* Label row */}
          <div className="text-small text-default-500 leading-tight h-5 transition-colors duration-200 group-hover:text-default-700">
            {label}
          </div>
          {/* Value row */}
          <div className="text-small font-medium mt-0.5 break-words h-5 transition-colors duration-200 group-hover:text-foreground">
            {value || children}
          </div>
        </div>
      </div>
    );
  },
);

CellValue.displayName = "CellValue";

export default CellValue;
