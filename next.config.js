/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  // 使用纯静态导出模式
  output: 'export',
  // 输出目录改为 web/dist
  distDir: 'dist',
  // 优化打包大小
  outputFileTracingRoot: process.cwd(),
  // 跳过构建时的 ESLint 检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 禁用开发工具
  devIndicators: {
    position: 'bottom-left',
  },
  // 禁用所有调试功能 - 开发环境禁用以避免API重复调用
  reactStrictMode: process.env.NODE_ENV === 'production',
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // 由于使用静态导出，需要禁用图片优化
  // images: {
  //   unoptimized: true,
  // },
  // 配置导出时的基础路径
  basePath: '',
  // 配置静态导出时的路由处理
  trailingSlash: !isDev,
  // 配置动态路由的静态生成
  experimental: {
    appDir: true,
    serverActions: false
  },
  // 开发模式本地代理 API
  async rewrites() {
    if (isDev) {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';
      return [
        {
          source: '/api/:path*',
          destination: `${apiBase}/api/:path*`,
        },
      ];
    }
    return [];
  }
};

module.exports = nextConfig;
