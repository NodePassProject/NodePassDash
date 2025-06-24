import { addToast } from "@heroui/toast";

/**
 * 健壮的剪贴板复制工具
 * 支持现代 Clipboard API、传统 execCommand 和手动复制备选方案
 */
export class ClipboardManager {
  /**
   * 现代剪贴板 API 复制方法（需要 HTTPS 或 localhost）
   */
  private static async copyWithClipboardAPI(text: string): Promise<boolean> {
    try {
      // 更严格的检查
      if (!navigator || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        return false;
      }
      
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed:', error);
      return false;
    }
  }

  /**
   * 传统方法作为回退方案（HTTP 环境可用）
   */
  private static copyWithLegacyAPI(text: string): boolean {
    try {
      // 创建临时文本区域
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      textArea.focus();
      textArea.select();
      
      // 尝试执行复制命令
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      return successful;
    } catch (error) {
      console.warn('Legacy copy failed:', error);
      return false;
    }
  }

  /**
   * 主复制方法
   * @param text 要复制的文本
   * @param successMessage 成功时的提示消息
   * @param onFallback 当所有自动复制方法都失败时的回调函数
   */
  public static async copy(
    text: string, 
    successMessage: string = '已复制到剪贴板',
    onFallback?: (text: string) => void
  ): Promise<void> {
    // 首先尝试现代 API
    const modernSuccess = await ClipboardManager.copyWithClipboardAPI(text);
    if (modernSuccess) {
      addToast({
        title: '已复制',
        description: successMessage,
        color: 'success'
      });
      return;
    }
    
    // 回退到传统方法
    const legacySuccess = ClipboardManager.copyWithLegacyAPI(text);
    if (legacySuccess) {
      addToast({
        title: '已复制',
        description: successMessage,
        color: 'success'
      });
      return;
    }
    
    // 两种方法都失败
    if (onFallback) {
      onFallback(text);
    } else {
      // 默认错误提示
      addToast({
        title: '复制失败',
        description: '请手动选择并复制内容',
        color: 'danger'
      });
    }
  }
}

/**
 * 简化的复制函数，用于快速调用
 */
export const copyToClipboard = ClipboardManager.copy; 