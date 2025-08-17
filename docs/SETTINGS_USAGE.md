# 全局设置系统使用说明

## 概述

本项目实现了一个全局设置系统，允许用户在整个应用中管理个性化设置，包括主题、新手模式和隐私模式。所有设置都会自动保存到浏览器的本地存储中。

## 功能特性

### 1. 主题设置
- **浅色主题**: 使用浅色配色方案
- **深色主题**: 使用深色配色方案  
- **跟随系统**: 自动跟随操作系统主题设置

### 2. 新手模式
- **启用**: 显示新手引导和提示功能
- **禁用**: 隐藏新手相关功能，适合熟练用户

### 3. 隐私模式
- **启用**: 增强隐私保护，隐藏敏感信息，限制数据收集
- **禁用**: 标准模式，显示完整信息

## 使用方法

### 在组件中使用设置

```tsx
import { useSettings } from '@/components/providers/settings-provider';

const MyComponent = () => {
  const { settings, toggleBeginnerMode, togglePrivacyMode } = useSettings();

  return (
    <div>
      {/* 根据设置显示不同内容 */}
      {settings.isBeginnerMode && (
        <div className="beginner-tip">新手提示内容</div>
      )}
      
      {settings.isPrivacyMode && (
        <div className="privacy-warning">隐私保护已启用</div>
      )}
      
      {/* 切换设置 */}
      <button onClick={toggleBeginnerMode}>
        切换新手模式
      </button>
    </div>
  );
};
```

### 可用的设置状态

```tsx
const { settings } = useSettings();

// 访问设置值
console.log(settings.theme);           // 'light' | 'dark' | 'system'
console.log(settings.isBeginnerMode);  // boolean
console.log(settings.isPrivacyMode);   // boolean
```

### 可用的设置操作

```tsx
const { 
  updateTheme, 
  toggleBeginnerMode, 
  togglePrivacyMode,
  updateSettings 
} = useSettings();

// 更新主题
updateTheme('dark');

// 切换新手模式
toggleBeginnerMode();

// 切换隐私模式
togglePrivacyMode();

// 批量更新设置
updateSettings({
  theme: 'light',
  isBeginnerMode: true
});
```

## 组件结构

### 设置提供者 (SettingsProvider)
- 位置: `components/providers/settings-provider.tsx`
- 功能: 提供全局设置状态管理
- 使用: 已在 `app/providers.tsx` 中配置

### 设置按钮 (SettingsButton)
- 位置: `components/layout/settings-button.tsx`
- 功能: 在导航栏中显示设置图标按钮
- 使用: 已在 `components/layout/navbar.tsx` 中配置

### 设置抽屉 (SettingsDrawer)
- 位置: `components/layout/settings-drawer.tsx`
- 功能: 显示设置选项的侧边抽屉
- 触发: 点击设置按钮时打开

## 数据持久化

- 所有设置自动保存到 `localStorage`
- 存储键名: `nodepass-settings`
- 页面刷新后设置自动恢复
- 支持跨标签页同步

## 示例组件

参考 `components/examples/settings-demo.tsx` 了解如何在组件中使用设置系统。

## 注意事项

1. **服务端渲染**: 设置提供者会等待客户端加载完成后再渲染，避免服务端渲染问题
2. **错误处理**: 本地存储操作包含错误处理，确保应用稳定性
3. **类型安全**: 所有设置都有完整的 TypeScript 类型定义
4. **性能优化**: 设置变更时只更新必要的组件，避免不必要的重渲染

## 扩展设置

如需添加新的设置项，请按以下步骤操作：

1. 在 `Settings` 接口中添加新字段
2. 在 `defaultSettings` 中设置默认值
3. 在 `SettingsContextType` 中添加相应的操作方法
4. 在 `SettingsProvider` 中实现新功能
5. 在 `SettingsDrawer` 中添加相应的UI控件

