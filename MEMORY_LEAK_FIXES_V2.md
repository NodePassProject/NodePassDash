# 内存泄漏修复计划 v2.0

## 概述

本文档记录了NodePassDash应用中页面跳转/切换时的内存泄漏风险点及修复方案。经过初步分析，大部分页面已有良好的内存管理，但仍存在一些需要修复的关键问题。

## 🚨 高优先级修复项

### 1. endpoints/page.tsx - setTimeout清理问题

**位置**: `app/endpoints/page.tsx`
**问题代码**:
```typescript
// Line 466: 页面刷新延迟
setTimeout(() => {
  window.location.reload();
}, 1000);

// Line 781: 重连延迟  
setTimeout(async () => {
  await handleConnect(selectedEndpoint.id);
}, 1000);
```

**风险**: 用户在setTimeout执行前切换页面，定时器仍会执行，可能导致在错误页面执行reload或连接已卸载的组件。

**修复方案**:
```typescript
// 添加组件挂载状态管理
const isMountedRef = useRef(true);
const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

// 在组件卸载时清理
useEffect(() => {
  return () => {
    isMountedRef.current = false;
    timeoutRefs.current.forEach(id => clearTimeout(id));
  };
}, []);

// 替换原有setTimeout
const safeSetTimeout = (callback: () => void, delay: number) => {
  const timeoutId = setTimeout(() => {
    if (isMountedRef.current) {
      callback();
    }
  }, delay);
  timeoutRefs.current.push(timeoutId);
  return timeoutId;
};

// 使用示例
safeSetTimeout(() => {
  window.location.reload();
}, 1000);

safeSetTimeout(async () => {
  await handleConnect(selectedEndpoint.id);
}, 1000);
```

### 2. 异步操作的组件状态检查

**位置**: 多个页面的异步函数
**问题**: 异步操作完成时组件可能已卸载，但仍尝试更新状态

**修复方案**:
```typescript
// 在所有页面添加统一的挂载状态管理
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => {
    isMountedRef.current = false;
  };
}, []);

// 在所有setState前添加检查
const safeSetState = (setter: () => void) => {
  if (isMountedRef.current) {
    setter();
  }
};

// 使用示例
const fetchData = async () => {
  try {
    const data = await api.getData();
    safeSetState(() => setData(data));
  } catch (error) {
    safeSetState(() => setError(error));
  }
};
```

## 🔶 中优先级修复项

### 3. useEffect依赖数组不完整

**位置**: `app/endpoints/page.tsx:174`
**问题代码**:
```typescript
useEffect(() => {
  const startupEndpoints = async () => {
    const endpoints = await fetchEndpoints();
  };
  startupEndpoints();
}, []); // 缺少fetchEndpoints依赖
```

**修复方案**:
```typescript
// 将fetchEndpoints包装为useCallback
const fetchEndpoints = useCallback(async () => {
  // 现有逻辑
}, [/* 正确的依赖 */]);

// 修复useEffect
useEffect(() => {
  fetchEndpoints();
}, [fetchEndpoints]);
```

### 4. localStorage操作的安全性

**位置**: `app/endpoints/page.tsx:147`
**问题代码**:
```typescript
useEffect(() => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('endpointsViewMode', viewMode);
  }
}, [viewMode]);
```

**修复方案**:
```typescript
useEffect(() => {
  if (typeof window !== 'undefined' && isMountedRef.current) {
    localStorage.setItem('endpointsViewMode', viewMode);
  }
}, [viewMode]);
```

### 5. SSE连接的竞态条件

**位置**: `lib/hooks/use-sse.ts`
**问题**: 在快速页面切换时可能存在SSE连接未完全关闭的情况

**修复方案**:
```typescript
// 添加连接状态管理
const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

useEffect(() => {
  // 如果正在连接，先关闭之前的连接
  if (eventSourceRef.current && connectionState === 'connecting') {
    eventSourceRef.current.close();
  }
  
  setConnectionState('connecting');
  const eventSource = new EventSource(url);
  
  eventSource.onopen = () => {
    if (isMountedRef.current) {
      setConnectionState('connected');
    }
  };
  
  return () => {
    setConnectionState('disconnected');
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
  };
}, [url]);
```

## 🔧 长期优化项

### 6. 统一内存管理Hook

**创建**: `lib/hooks/use-memory-manager.ts`
**目标**: 为所有页面提供统一的内存管理能力

```typescript
export function useMemoryManager() {
  const isMountedRef = useRef(true);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const intervalRefs = useRef<NodeJS.Timeout[]>([]);
  const abortControllerRef = useRef<AbortController>();

  useEffect(() => {
    isMountedRef.current = true;
    abortControllerRef.current = new AbortController();
    
    return () => {
      isMountedRef.current = false;
      
      // 清理定时器
      timeoutRefs.current.forEach(id => clearTimeout(id));
      intervalRefs.current.forEach(id => clearInterval(id));
      
      // 取消网络请求
      abortControllerRef.current?.abort();
    };
  }, []);

  const safeSetTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) callback();
    }, delay);
    timeoutRefs.current.push(timeoutId);
    return timeoutId;
  }, []);

  const safeSetInterval = useCallback((callback: () => void, delay: number) => {
    const intervalId = setInterval(() => {
      if (isMountedRef.current) callback();
    }, delay);
    intervalRefs.current.push(intervalId);
    return intervalId;
  }, []);

  const safeFetch = useCallback(async (url: string, options?: RequestInit) => {
    if (!isMountedRef.current) return;
    
    return fetch(url, {
      ...options,
      signal: abortControllerRef.current?.signal
    });
  }, []);

  return {
    isMounted: isMountedRef.current,
    safeSetTimeout,
    safeSetInterval,
    safeFetch
  };
}
```

### 7. 页面级资源清理

**目标**: 为每个页面添加统一的资源清理逻辑

```typescript
// 在每个页面组件中添加
export default function PageComponent() {
  const { isMounted, safeSetTimeout, safeFetch } = useMemoryManager();
  
  // 组件卸载时清理页面特定资源
  useEffect(() => {
    return () => {
      // 清理页面特定的状态、监听器等
    };
  }, []);
  
  // 其他组件逻辑...
}
```

## 🧪 测试验证

### 内存泄漏检测方法

1. **开发者工具检测**:
   ```javascript
   // 在控制台运行，监控内存使用
   const checkMemory = () => {
     if (performance.memory) {
       console.log('Used:', performance.memory.usedJSHeapSize);
       console.log('Total:', performance.memory.totalJSHeapSize);
       console.log('Limit:', performance.memory.jsHeapSizeLimit);
     }
   };
   
   setInterval(checkMemory, 5000);
   ```

2. **页面切换测试**:
   - 快速切换页面20-30次
   - 观察内存使用变化
   - 检查是否有未清理的定时器

3. **组件卸载验证**:
   ```javascript
   // 添加到组件中验证清理是否正确执行
   useEffect(() => {
     console.log('Component mounted');
     return () => {
       console.log('Component unmounted and cleaned');
     };
   }, []);
   ```

## 🎯 实施计划

### Phase 1: 高优先级修复 (1-2天)
- [ ] 修复endpoints/page.tsx的setTimeout问题
- [ ] 添加异步操作的组件状态检查
- [ ] 验证修复效果

### Phase 2: 中优先级修复 (2-3天)  
- [ ] 修复useEffect依赖问题
- [ ] 优化localStorage操作
- [ ] 改进SSE连接管理
- [ ] 全面测试各页面切换

### Phase 3: 长期优化 (1周)
- [ ] 实现统一内存管理Hook
- [ ] 重构所有页面使用新的内存管理
- [ ] 建立内存泄漏监控机制
- [ ] 文档更新和团队培训

## 📝 修复检查清单

在修复每个问题后，请确认：

- [ ] 组件卸载时所有定时器都被清理
- [ ] 异步操作完成前检查组件挂载状态  
- [ ] useEffect有正确的依赖数组
- [ ] SSE连接在组件卸载时正确关闭
- [ ] 没有在卸载的组件上调用setState
- [ ] 添加了适当的错误边界处理
- [ ] 通过了内存泄漏测试

## 🔗 相关资源

- [React官方文档 - Effect清理](https://react.dev/reference/react/useEffect#cleaning-up-an-effect)
- [MDN - EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Chrome DevTools - 内存分析](https://developer.chrome.com/docs/devtools/memory-problems/)

---

**注意**: 在实施修复时，请先在开发环境充分测试，确保不会引入新的问题。建议分批修复，每次修复后都进行全面的功能测试。