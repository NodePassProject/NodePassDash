# 主控版本功能实现说明

## 功能概述

在实例列表中添加了主控版本显示功能，用户可以通过鼠标悬停在主控名称上来查看对应的版本信息。

## 实现内容

### 1. 数据库修改

- 为 `endpoints` 表添加了 `version` 字段
- 创建了相应的索引以提高查询性能

### 2. 后端API修改

- 修改了 `GetTunnelsWithPagination` 方法，关联查询主控版本信息
- 在 `TunnelWithStats` 结构体中添加了 `EndpointVersion` 字段
- 更新了 `getEndpointsByIDs` 方法以包含版本信息

### 3. 前端显示修改

- 在移动端卡片布局中，主控名称支持悬停显示版本信息
- 在桌面端表格中，主控列支持悬停显示版本信息
- 使用 Tooltip 组件展示版本详情

## 使用方法

### 1. 运行数据库迁移

```bash
pnpm run db:add-version
```

### 2. 重启后端服务

确保后端服务重新启动以加载新的代码。

### 3. 查看效果

- 在实例列表页面，将鼠标悬停在任何主控名称上
- 会显示一个包含主控名称和版本信息的提示框

### 4. 测试功能

```bash
# 测试主控版本功能是否正常工作
pnpm run test:version
```

## 技术细节

### 数据库迁移

注意：`ver`字段已经在之前的迁移文件 `005_add_endpoint_info_fields.sql` 中添加了。

```sql
-- ver字段已在005迁移中添加
-- ALTER TABLE endpoints ADD COLUMN ver TEXT DEFAULT '';

-- 创建索引（用于优化查询性能）
CREATE INDEX IF NOT EXISTS idx_endpoints_version ON endpoints(ver);
```

### API响应格式

隧道列表API现在会在每个隧道对象中包含 `version` 字段：

```json
{
  "data": [
    {
      "id": "1",
      "name": "示例隧道",
      "endpoint": "主控名称",
      "version": "1.2.3",
      // ... 其他字段
    }
  ]
}
```

### 前端组件

- 移动端：使用 `Tooltip` 包装主控名称，悬停显示版本
- 桌面端：使用 `Tooltip` 包装主控 `Chip` 组件，悬停显示版本

## 注意事项

1. 如果主控没有设置版本信息，`version` 字段将为空字符串
2. 版本信息仅在悬停时显示，不会影响表格布局
3. 该功能向后兼容，不会影响现有的API调用

## 未来扩展

可以考虑添加以下功能：

1. 在主控管理页面中编辑版本信息
2. 版本比较和升级提醒
3. 版本兼容性检查
4. 版本历史记录
