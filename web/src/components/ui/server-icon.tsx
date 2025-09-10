import React from 'react';

interface ServerIconProps {
  className?: string;
  size?: number;
}

export const ServerIcon: React.FC<ServerIconProps> = ({ 
  className = "", 
  size = 64 
}) => {
  // 生成唯一ID避免冲突
  const gradientId = `statusLight-${Math.random().toString(36).substr(2, 9)}`;
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 64 64" 
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* 指示灯渐变 */}
        <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00ff88"/>
          <stop offset="70%" stopColor="#00cc66"/>
          <stop offset="100%" stopColor="#009944"/>
        </radialGradient>
      </defs>
      
      {/* 服务器主体 */}
      <rect 
        x="8" y="12" width="48" height="40" rx="2" ry="2" 
        fill="#3a3a3a" 
        stroke="#555" 
        strokeWidth="1"
      />
      
      {/* 硬盘托架 */}
      <rect 
        x="12" y="18" width="40" height="6" rx="1" ry="1" 
        fill="#1e1e1e" 
        stroke="#333" 
        strokeWidth="0.5"
      />
      <rect 
        x="12" y="26" width="40" height="6" rx="1" ry="1" 
        fill="#1e1e1e" 
        stroke="#333" 
        strokeWidth="0.5"
      />
      <rect 
        x="12" y="34" width="40" height="6" rx="1" ry="1" 
        fill="#1e1e1e" 
        stroke="#333" 
        strokeWidth="0.5"
      />
      
      {/* 硬盘拉手 */}
      <rect x="14" y="19" width="2" height="4" fill="#666"/>
      <rect x="14" y="27" width="2" height="4" fill="#666"/>
      <rect x="14" y="35" width="2" height="4" fill="#666"/>
      
      {/* 指示灯 */}
      <circle cx="46" cy="20" r="2.5" fill={`url(#${gradientId})`}>
        <animate 
          attributeName="opacity" 
          values="0.3;1;0.3" 
          dur="2s" 
          repeatCount="indefinite"
        />
      </circle>
      
      {/* 电源按钮 */}
      <circle 
        cx="20" cy="46" r="2" 
        fill="#333" 
        stroke="#555" 
        strokeWidth="0.5"
      />
      <circle cx="20" cy="46" r="1" fill="#111"/>
      
      {/* 网络接口 */}
      <rect 
        x="42" y="44" width="4" height="3" rx="0.5" ry="0.5" 
        fill="#1a4d1a" 
        stroke="#333" 
        strokeWidth="0.5"
      />
    </svg>
  );
};