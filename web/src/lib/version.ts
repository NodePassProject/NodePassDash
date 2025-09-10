// 声明全局变量类型
declare const __APP_VERSION__: string;

// 从构建时注入的版本信息获取版本号
export const getVersion = () => {
  return __APP_VERSION__ || '0.0.0';
};