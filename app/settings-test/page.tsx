import React from 'react';
import { SettingsDemo } from '@/components/examples/settings-demo';

export default function SettingsTestPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">
          设置系统测试页面
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-semibold mb-4">设置状态展示</h2>
            <SettingsDemo />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4">使用说明</h2>
            <div className="space-y-4 text-sm text-default-600">
              <div className="p-4 bg-default-50 dark:bg-default-900/20 rounded-lg">
                <h3 className="font-medium mb-2">1. 打开设置</h3>
                <p>点击导航栏右上角的设置图标（齿轮图标）打开设置抽屉</p>
              </div>
              
              <div className="p-4 bg-default-50 dark:bg-default-900/20 rounded-lg">
                <h3 className="font-medium mb-2">2. 修改设置</h3>
                <p>在设置抽屉中可以切换主题、新手模式和隐私模式</p>
              </div>
              
              <div className="p-4 bg-default-50 dark:bg-default-900/20 rounded-lg">
                <h3 className="font-medium mb-2">3. 查看效果</h3>
                <p>设置会立即生效，并且会自动保存到浏览器本地存储</p>
              </div>
              
              <div className="p-4 bg-default-50 dark:bg-default-900/20 rounded-lg">
                <h3 className="font-medium mb-2">4. 全局同步</h3>
                <p>这些设置在应用的任何地方都可以通过 useSettings hook 访问</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-12 p-6 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 text-primary-700 dark:text-primary-300">
            技术特性
          </h2>
          <ul className="space-y-2 text-sm text-primary-600 dark:text-primary-400">
            <li>• 使用 React Context API 实现全局状态管理</li>
            <li>• 自动保存到 localStorage，支持页面刷新后恢复</li>
            <li>• 完整的 TypeScript 类型支持</li>
            <li>• 响应式设计，支持移动端和桌面端</li>
            <li>• 与现有的 next-themes 系统完全集成</li>
            <li>• 优雅的错误处理和加载状态管理</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

