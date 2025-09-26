/**
 * 文本长度限制工具函数
 * 用于处理中英文混合字符的显示宽度计算和限制
 */

/**
 * 计算字符串的显示宽度
 * 中文字符占2个单位，英文字符占1个单位
 * @param str 要计算的字符串
 * @returns 显示宽度
 */
export function getDisplayWidth(str: string): number {
  return Array.from(str).reduce((width, char) => {
    return width + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1);
  }, 0);
}

/**
 * 计算字符串的字节长度 (UTF-8)
 * @param str 要计算的字符串
 * @returns 字节长度
 */
export function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * 创建字符限制配置
 */
export interface TextLimitConfig {
  /** 最大显示宽度 */
  maxDisplayWidth: number;
  /** 显示单位名称 */
  unit?: string;
}

/**
 * 预定义的文本限制配置
 */
export const TEXT_LIMITS = {
  /** 隧道名称限制：12个中文字符或24个英文字符 */
  TUNNEL_NAME: {
    maxDisplayWidth: 24,
    unit: "字符宽度",
  } as TextLimitConfig,

  /** 端点名称限制：稍小一些，适合列表显示 */
  ENDPOINT_NAME: {
    maxDisplayWidth: 20,
    unit: "字符宽度",
  } as TextLimitConfig,

  /** 短名称限制：适合标签等场景 */
  SHORT_NAME: {
    maxDisplayWidth: 16,
    unit: "字符宽度",
  } as TextLimitConfig,
} as const;

/**
 * 文本限制 Hook
 * @param text 当前文本
 * @param config 限制配置
 * @returns 限制相关的状态和方法
 */
export function useTextLimit(text: string, config: TextLimitConfig) {
  const currentWidth = getDisplayWidth(text);
  const isValid = currentWidth <= config.maxDisplayWidth;
  const description = `${currentWidth}/${config.maxDisplayWidth} ${config.unit || "字符宽度"}`;

  return {
    currentWidth,
    maxWidth: config.maxDisplayWidth,
    isValid,
    description,
    isOverLimit: currentWidth > config.maxDisplayWidth,
  };
}

/**
 * 检查文本是否超出显示宽度限制
 * @param text 要检查的文本
 * @param maxDisplayWidth 最大显示宽度
 * @returns 是否超出限制
 */
export function isTextOverLimit(
  text: string,
  maxDisplayWidth: number,
): boolean {
  return getDisplayWidth(text) > maxDisplayWidth;
}

/**
 * 截断文本到指定的显示宽度
 * @param text 要截断的文本
 * @param maxDisplayWidth 最大显示宽度
 * @param suffix 截断后的后缀，默认为 '...'
 * @returns 截断后的文本
 */
export function truncateText(
  text: string,
  maxDisplayWidth: number,
  suffix = "...",
): string {
  if (getDisplayWidth(text) <= maxDisplayWidth) {
    return text;
  }

  const suffixWidth = getDisplayWidth(suffix);
  const targetWidth = maxDisplayWidth - suffixWidth;

  let result = "";
  let currentWidth = 0;

  for (const char of Array.from(text)) {
    const charWidth = /[\u4e00-\u9fff]/.test(char) ? 2 : 1;

    if (currentWidth + charWidth > targetWidth) {
      break;
    }
    result += char;
    currentWidth += charWidth;
  }

  return result + suffix;
}
