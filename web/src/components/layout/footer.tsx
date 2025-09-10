import { getVersion } from '@/lib/version';

/**
 * 页脚组件
 * 包含版本信息和相关链接
 */
export const Footer = () => {
  return (
    <footer className="w-full flex items-center justify-center py-3">
      <div className="text-default-600 text-sm">
        NodePassDash © 2025 | v{getVersion()} | 由{' '}
        <a 
          href="https://github.com/yosebyte/nodepass" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600 transition-colors"
        >
          NodePass
        </a>
        {' '}驱动
      </div>
    </footer>
  );
};