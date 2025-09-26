/**
 * 隐私模式相关的工具函数
 */

/**
 * 格式化URL显示（处理脱敏逻辑）
 * @param url 基础URL
 * @param apiPath API路径
 * @param isPrivacyMode 是否启用隐私模式
 * @returns 格式化后的URL字符串
 */
export const formatUrlWithPrivacy = (
  url: string,
  apiPath: string,
  isPrivacyMode: boolean,
): string => {
  const fullUrl = `${url}${apiPath}`;

  // 如果隐私模式关闭，显示完整URL
  if (!isPrivacyMode) {
    return fullUrl;
  }

  // 隐私模式开启时对IP地址进行部分脱敏
  try {
    const urlObj = new URL(fullUrl);
    let maskedHost = urlObj.hostname;

    // 检测IPv4地址
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipv4Match = maskedHost.match(ipv4Regex);

    if (ipv4Match) {
      // IPv4地址：只保留前两段
      maskedHost = `${ipv4Match[1]}.${ipv4Match[2]}.***.***`;
    } else {
      // 检测IPv6地址
      const ipv6Regex = /^([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})/;
      const ipv6Match = maskedHost.match(ipv6Regex);

      if (ipv6Match) {
        // IPv6地址：只保留前两段
        maskedHost = `${ipv6Match[1]}:${ipv6Match[2]}:***:***:***:***:***:***`;
      } else {
        // 域名：完全脱敏
        maskedHost = "********";
      }
    }

    // 重新组装URL
    let maskedUrl = `${urlObj.protocol}//${maskedHost}`;

    if (urlObj.port) {
      maskedUrl += `:${urlObj.port}`;
    }
    maskedUrl += urlObj.pathname + urlObj.search + urlObj.hash;

    return maskedUrl;
  } catch (error) {
    // URL解析失败时的备用方案
    return "••••••••••••••••••••••••••";
  }
};
