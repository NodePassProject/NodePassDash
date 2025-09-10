import { cn } from "@/lib/utils";

interface MiniCircularProgressProps {
  value: number; // 0-100 的百分比值
  max?: number;
  min?: number;
  className?: string;
  color?: string;
  size?: number; // 进度圆的大小
}

export default function MiniCircularProgress({
  value = 0,
  max = 100,
  min = 0,
  className,
  color = "hsl(var(--heroui-primary))",
  size = 16, // 默认16px，很小的尺寸
}: MiniCircularProgressProps) {
  const radius = (size - 2) / 2; // 减去stroke宽度
  const circumference = 2 * Math.PI * radius;
  const currentPercent = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (currentPercent / 100) * circumference;

  return (
    <div
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          className="text-default-200 opacity-30"
        />
        {/* 进度圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
    </div>
  );
}