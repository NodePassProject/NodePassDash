import { addToast } from "@heroui/toast";
import ClipboardJS from "clipboard";

/**
 * 健壮的剪贴板复制工具
 * 包含权限检测和用户友好的提示
 */
export class ClipboardManager {
  /**
   * 检测剪贴板权限状态
   */
  private static async checkClipboardPermission(): Promise<{
    granted: boolean;
    denied: boolean;
    prompt: boolean;
    error?: string;
  }> {
    try {
      // 检查 Permissions API 是否可用
      if (!navigator.permissions) {
        return {
          granted: false,
          denied: false,
          prompt: false,
          error: "浏览器不支持权限 API",
        };
      }

      const result = await navigator.permissions.query({
        name: "clipboard-write" as PermissionName,
      });

      return {
        granted: result.state === "granted",
        denied: result.state === "denied",
        prompt: result.state === "prompt",
      };
    } catch (error) {
      console.warn("检查剪贴板权限失败:", error);

      return {
        granted: false,
        denied: false,
        prompt: false,
        error: "无法检查权限状态",
      };
    }
  }

  /**
   * 检测是否为 Chrome 浏览器的 HTTP 环境
   */
  private static isChrome(): boolean {
    return (
      /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)
    );
  }

  /**
   * 显示权限被拒绝的友好提示
   */
  private static showPermissionDeniedMessage(
    onFallback?: (text: string) => void,
    text?: string,
  ): void {
    const isChrome = ClipboardManager.isChrome();
    const isHttp = location.protocol === "http:";

    let title = "剪贴板权限被拒绝";
    let description = "请手动复制内容";

    if (isChrome && isHttp) {
      title = "Chrome 安全限制";
      description = "HTTP 环境下剪贴板功能被限制，请切换到 HTTPS 或手动复制";
    }

    addToast({
      title,
      description,
      color: "warning",
    });

    // 如果提供了回退函数，显示手动复制弹窗
    if (onFallback && text) {
      onFallback(text);
    }
  }

  /**
   * 现代剪贴板 API 复制方法（HTTPS 或 localhost 优先使用）
   */
  private static async copyWithClipboardAPI(text: string): Promise<boolean> {
    try {
      // 检查是否支持现代剪贴板 API
      if (
        !navigator ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        return false;
      }

      // 检查是否在安全上下文中（HTTPS 或 localhost）
      if (!window.isSecureContext) {
        return false;
      }

      await navigator.clipboard.writeText(text);

      // 验证复制是否成功
      try {
        const clipboardText = await navigator.clipboard.readText();

        return clipboardText === text;
      } catch (e) {
        // 如果无法读取剪贴板内容，假设复制成功
        return true;
      }
    } catch (error) {
      console.warn("Clipboard API failed:", error);

      return false;
    }
  }

  /**
   * 改进的 execCommand 方法，确保在正确的上下文中执行
   */
  private static copyWithExecCommand(text: string): boolean {
    try {
      // 创建一个隐藏的可编辑 div
      const hiddenDiv = document.createElement("div");

      hiddenDiv.style.position = "fixed";
      hiddenDiv.style.left = "-999999px";
      hiddenDiv.style.top = "-999999px";
      hiddenDiv.style.opacity = "0";
      hiddenDiv.style.pointerEvents = "none";
      hiddenDiv.style.whiteSpace = "pre";
      hiddenDiv.contentEditable = "true";
      hiddenDiv.textContent = text;

      document.body.appendChild(hiddenDiv);

      // 选择文本
      const range = document.createRange();

      range.selectNodeContents(hiddenDiv);
      const selection = window.getSelection();

      if (!selection) {
        document.body.removeChild(hiddenDiv);

        return false;
      }

      selection.removeAllRanges();
      selection.addRange(range);

      // 聚焦到元素
      hiddenDiv.focus();

      // 执行复制
      const successful = document.execCommand("copy");

      // 清理
      selection.removeAllRanges();
      document.body.removeChild(hiddenDiv);

      console.log("execCommand 结果:", successful);

      return successful;
    } catch (error) {
      console.warn("execCommand 失败:", error);

      return false;
    }
  }

  /**
   * 使用 textarea 的备用方法
   */
  private static copyWithTextarea(text: string): boolean {
    try {
      const textarea = document.createElement("textarea");

      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-999999px";
      textarea.style.top = "-999999px";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      textarea.readOnly = false;

      document.body.appendChild(textarea);

      // 聚焦并选择
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      // 执行复制
      const successful = document.execCommand("copy");

      document.body.removeChild(textarea);

      console.log("textarea 复制结果:", successful);

      return successful;
    } catch (error) {
      console.warn("textarea 复制失败:", error);

      return false;
    }
  }

  /**
   * 检测当前环境的剪贴板支持情况
   */
  private static async getEnvironmentInfo(): Promise<{
    isSecureContext: boolean;
    hasClipboardAPI: boolean;
    hasExecCommand: boolean;
    clipboardJSSupported: boolean;
    permission: {
      granted: boolean;
      denied: boolean;
      prompt: boolean;
      error?: string;
    };
    isChrome: boolean;
    isHttp: boolean;
  }> {
    const permission = await ClipboardManager.checkClipboardPermission();

    return {
      isSecureContext:
        window.isSecureContext ||
        location.protocol === "https:" ||
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1",
      hasClipboardAPI: !!(
        navigator &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ),
      hasExecCommand: !!(
        document && typeof document.execCommand === "function"
      ),
      clipboardJSSupported: ClipboardJS.isSupported(),
      permission,
      isChrome: ClipboardManager.isChrome(),
      isHttp: location.protocol === "http:",
    };
  }

  /**
   * 主复制方法 - 确保在用户交互上下文中调用
   * @param text 要复制的文本
   * @param successMessage 成功时的提示消息
   * @param onFallback 当所有自动复制方法都失败时的回调函数
   */
  public static async copy(
    text: string,
    successMessage: string = "已复制到剪贴板",
    onFallback?: (text: string) => void,
  ): Promise<void> {
    const envInfo = await ClipboardManager.getEnvironmentInfo();

    console.log("剪贴板环境信息:", envInfo);
    console.log(
      "尝试复制的文本:",
      text.substring(0, 50) + (text.length > 50 ? "..." : ""),
    );

    // 特殊情况：Chrome HTTP 环境下权限被拒绝
    if (envInfo.isChrome && envInfo.isHttp && envInfo.permission.denied) {
      console.log("检测到 Chrome HTTP 环境，剪贴板权限被拒绝");
      ClipboardManager.showPermissionDeniedMessage(onFallback, text);

      return;
    }

    // 策略1: 优先尝试现代剪贴板 API（仅在安全上下文中）
    if (
      envInfo.isSecureContext &&
      envInfo.hasClipboardAPI &&
      envInfo.permission.granted
    ) {
      console.log("尝试使用现代剪贴板 API...");
      const modernSuccess = await ClipboardManager.copyWithClipboardAPI(text);

      if (modernSuccess) {
        console.log("现代剪贴板 API 复制成功");
        addToast({
          title: "已复制",
          description: successMessage,
          color: "success",
        });

        return;
      }
      console.log("现代剪贴板 API 复制失败");
    }

    // 策略2: 使用改进的 execCommand 方法
    if (envInfo.hasExecCommand) {
      console.log("尝试使用 execCommand (div)...");
      const execSuccess = ClipboardManager.copyWithExecCommand(text);

      if (execSuccess) {
        console.log("execCommand (div) 复制成功");
        addToast({
          title: "已复制",
          description: successMessage,
          color: "success",
        });

        return;
      }

      console.log("尝试使用 execCommand (textarea)...");
      const textareaSuccess = ClipboardManager.copyWithTextarea(text);

      if (textareaSuccess) {
        console.log("execCommand (textarea) 复制成功");
        addToast({
          title: "已复制",
          description: successMessage,
          color: "success",
        });

        return;
      }
    }

    // 所有方法都失败，显示相应的错误信息
    console.warn("所有剪贴板复制方法都失败了");

    if (envInfo.isChrome && envInfo.isHttp) {
      // Chrome HTTP 环境特殊提示
      ClipboardManager.showPermissionDeniedMessage(onFallback, text);
    } else if (onFallback) {
      onFallback(text);
    } else {
      // 通用错误提示
      addToast({
        title: "复制失败",
        description: "请手动选择并复制内容",
        color: "danger",
      });
    }
  }

  /**
   * 专门用于按钮点击的复制方法
   * 确保在用户交互上下文中执行
   */
  public static async copyOnClick(
    text: string,
    successMessage: string = "已复制到剪贴板",
    onFallback?: (text: string) => void,
  ): Promise<void> {
    // 在用户点击的上下文中，直接执行复制
    return ClipboardManager.copy(text, successMessage, onFallback);
  }

  /**
   * 检查剪贴板功能是否可用
   */
  public static async isSupported(): Promise<boolean> {
    const envInfo = await ClipboardManager.getEnvironmentInfo();

    return (
      envInfo.hasClipboardAPI ||
      envInfo.hasExecCommand ||
      envInfo.clipboardJSSupported
    );
  }

  /**
   * 获取剪贴板权限状态的友好描述
   */
  public static async getPermissionStatus(): Promise<string> {
    const envInfo = await ClipboardManager.getEnvironmentInfo();

    if (envInfo.isChrome && envInfo.isHttp) {
      return "Chrome 在 HTTP 环境下限制剪贴板访问，建议使用 HTTPS";
    }

    if (envInfo.permission.granted) {
      return "剪贴板权限已授予";
    } else if (envInfo.permission.denied) {
      return "剪贴板权限被拒绝";
    } else if (envInfo.permission.prompt) {
      return "需要请求剪贴板权限";
    } else {
      return "无法获取剪贴板权限状态";
    }
  }
}

/**
 * 简化的复制函数，用于快速调用
 */
export const copyToClipboard = ClipboardManager.copyOnClick;
