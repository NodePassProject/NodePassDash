import React from "react";

interface ServerIconProps {
  className?: string;
  size?: number;
}

export const ServerIconRed: React.FC<ServerIconProps> = ({
  className = "",
  size = 64,
}) => {
  // 生成唯一ID避免冲突
  const gradientId = `statusLightRed-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg
      className={className}
      height={size}
      viewBox="0 0 64 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* 红色指示灯渐变 */}
        <radialGradient cx="50%" cy="50%" id={gradientId} r="50%">
          <stop offset="0%" stopColor="#ff4444" />
          <stop offset="70%" stopColor="#cc2222" />
          <stop offset="100%" stopColor="#881111" />
        </radialGradient>
      </defs>

      {/* 服务器主体 */}
      <rect
        fill="#3a3a3a"
        height="40"
        rx="2"
        ry="2"
        stroke="#555"
        strokeWidth="1"
        width="48"
        x="8"
        y="12"
      />

      {/* 硬盘托架 */}
      <rect
        fill="#1e1e1e"
        height="6"
        rx="1"
        ry="1"
        stroke="#333"
        strokeWidth="0.5"
        width="40"
        x="12"
        y="18"
      />
      <rect
        fill="#1e1e1e"
        height="6"
        rx="1"
        ry="1"
        stroke="#333"
        strokeWidth="0.5"
        width="40"
        x="12"
        y="26"
      />
      <rect
        fill="#1e1e1e"
        height="6"
        rx="1"
        ry="1"
        stroke="#333"
        strokeWidth="0.5"
        width="40"
        x="12"
        y="34"
      />

      {/* 硬盘拉手 */}
      <rect fill="#666" height="4" width="2" x="14" y="19" />
      <rect fill="#666" height="4" width="2" x="14" y="27" />
      <rect fill="#666" height="4" width="2" x="14" y="35" />

      {/* 红色指示灯（不闪烁） */}
      <circle cx="46" cy="20" fill={`url(#${gradientId})`} r="2.5" />

      {/* 电源按钮 */}
      <circle
        cx="20"
        cy="46"
        fill="#333"
        r="2"
        stroke="#555"
        strokeWidth="0.5"
      />
      <circle cx="20" cy="46" fill="#111" r="1" />

      {/* 网络接口 */}
      <rect
        fill="#1a4d1a"
        height="3"
        rx="0.5"
        ry="0.5"
        stroke="#333"
        strokeWidth="0.5"
        width="4"
        x="42"
        y="44"
      />
    </svg>
  );
};
