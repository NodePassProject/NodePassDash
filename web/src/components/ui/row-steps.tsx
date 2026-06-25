import React from "react";

export interface RowStepItem {
  title: string;
}

interface RowStepsProps {
  /** 1-indexed 当前激活的 step。 */
  currentStep: number;
  /** 步骤列表,每项至少包含 title。 */
  steps: RowStepItem[];
  className?: string;
}

/**
 * RowSteps 是参考 HeroUI Pro RowSteps 风格的步骤指示器。
 *
 * 视觉特点:
 *   - 圆形数字 indicator,水平排列
 *   - 当前 step: primary 填充 + 外圈高亮
 *   - 已完成 step: primary 填充 + checkmark
 *   - 未到 step: default-200
 *   - title 在圆形右侧(响应式:窄屏隐藏 title)
 *   - 圆形之间用横线连接,激活段用 primary
 *
 * checkmark 用 inline SVG,避免 iconify 在线 fetch 失败时显示空圆。
 */
export default function RowSteps({
  currentStep,
  steps,
  className,
}: RowStepsProps) {
  return (
    <ol className={["flex w-full items-center", className || ""].join(" ")}>
      {steps.map((step, idx) => {
        const num = idx + 1;
        const isDone = num < currentStep;
        const isActive = num === currentStep;
        const isLast = idx === steps.length - 1;

        return (
          <li
            key={idx}
            className={["flex items-center", isLast ? "" : "flex-1"].join(" ")}
          >
            <div className="flex items-center gap-2">
              <div
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-default-200 text-default-500",
                ].join(" ")}
              >
                {isDone ? <CheckIcon /> : num}
              </div>
              <span
                className={[
                  "hidden sm:inline text-sm font-medium whitespace-nowrap",
                  isActive
                    ? "text-foreground"
                    : isDone
                      ? "text-foreground"
                      : "text-default-400",
                ].join(" ")}
              >
                {step.title}
              </span>
            </div>
            {!isLast && (
              <div
                className={[
                  "h-px flex-1 mx-3 transition-colors",
                  isDone ? "bg-primary" : "bg-default-200",
                ].join(" ")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Inline checkmark SVG — 避免依赖 iconify 在线 fetch
function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 1 1 1.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 0 1 1.04-.208Z"
      />
    </svg>
  );
}
