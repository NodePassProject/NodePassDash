import React from "react";

export type OriginalCellValueProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: React.ReactNode;
};

const OriginalCellValue = React.forwardRef<
  HTMLDivElement,
  OriginalCellValueProps
>(({ label, value, children, ...props }, ref) => (
  <div ref={ref} className="flex items-center justify-between" {...props}>
    <div className="text-small text-default-500">{label}</div>
    <div className="text-small font-medium">{value || children}</div>
  </div>
));

OriginalCellValue.displayName = "OriginalCellValue";

export default OriginalCellValue;
