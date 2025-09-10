import React from "react";

export type CellValueProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: React.ReactNode;
};

const CellValue = React.forwardRef<HTMLDivElement, CellValueProps>(
  ({label, value, children, ...props}, ref) => (
    <div ref={ref} className="flex items-center justify-between" {...props}>
      <div className="text-small text-default-500">{label}</div>
      <div className="text-small font-medium">{value || children}</div>
    </div>
  ),
);

CellValue.displayName = "CellValue";

export default CellValue;
