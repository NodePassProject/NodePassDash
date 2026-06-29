/**
 * 隐私模式相关的工具函数
 */

// 常见多段公共后缀（足够覆盖中文/英文圈,不引入完整 PSL）
const MULTI_SEGMENT_SUFFIXES = new Set([
  "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn",
  "com.hk", "com.tw", "com.mo",
  "co.uk", "co.jp", "co.kr", "co.in", "co.nz", "co.za",
  "com.au", "com.br", "com.sg", "com.mx", "com.tr",
  "github.io", "pages.dev", "vercel.app",
]);

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// 本地回环地址不脱敏（无隐私收益,反而损失辨识度）
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/** 判断是否 IPv4 */
const isIPv4 = (host: string): boolean => IPV4_REGEX.test(host);

/** 判断是否 IPv6（含或不含方括号均可） */
const isIPv6 = (host: string): boolean => {
  const stripped = host.startsWith("[") && host.endsWith("]")
    ? host.slice(1, -1)
    : host;

  // IPv6 至少含 2 个冒号,且仅由 hex / : 组成（兼容 ::、嵌套 IPv4 暂不考虑）
  if ((stripped.match(/:/g) || []).length < 2) return false;
  return /^[0-9a-fA-F:]+$/.test(stripped);
};

/** IPv4 脱敏：保留前两段 */
export const maskIPv4 = (host: string): string => {
  const m = host.match(IPV4_REGEX);
  if (!m) return host;
  return `${m[1]}.${m[2]}.***.***`;
};

/** IPv6 脱敏：保留前两段,兼容方括号 */
export const maskIPv6 = (host: string): string => {
  const hasBrackets = host.startsWith("[") && host.endsWith("]");
  const inner = hasBrackets ? host.slice(1, -1) : host;
  const m = inner.match(/^([0-9a-fA-F]{1,4}):([0-9a-fA-F]{1,4})/);
  if (!m) return host;
  const masked = `${m[1]}:${m[2]}:***:***:***:***:***:***`;
  return hasBrackets ? `[${masked}]` : masked;
};

/**
 * 域名脱敏：保留公共后缀 + 注册名首字母,子域整体替换为 ***
 * 例: example.com         -> e******.com
 *     api.example.com     -> ***.e******.com
 *     a.b.bank.com.cn     -> ***.b***.com.cn
 *     qq.com              -> **.com   （注册名过短无首字母可留）
 *     localhost / 单段     -> 原样保留
 */
export const maskHost = (host: string): string => {
  if (!host) return host;
  if (host === "localhost" || !host.includes(".")) return host;

  const parts = host.split(".");

  // 识别公共后缀长度（1 段或 2 段）
  const lastTwo = parts.slice(-2).join(".").toLowerCase();
  const suffixLen = MULTI_SEGMENT_SUFFIXES.has(lastTwo) ? 2 : 1;

  if (parts.length <= suffixLen) return host; // 异常,原样返回

  const suffix = parts.slice(-suffixLen).join(".");
  const sld = parts[parts.length - suffixLen - 1];
  const subdomainParts = parts.slice(0, parts.length - suffixLen - 1);

  const maskedSld =
    sld.length <= 2
      ? "*".repeat(sld.length)
      : sld[0] + "*".repeat(sld.length - 1);

  const core = `${maskedSld}.${suffix}`;
  return subdomainParts.length > 0 ? `***.${core}` : core;
};

/** 统一入口：根据 host 类型自动选择 IPv4 / IPv6 / 域名脱敏 */
export const maskHostname = (host: string): string => {
  if (!host) return host;
  if (LOOPBACK_HOSTS.has(host)) return host;
  if (isIPv4(host)) return maskIPv4(host);
  if (isIPv6(host)) return maskIPv6(host);
  return maskHost(host);
};

/**
 * 地址脱敏：host[:port],按隐私模式开关决定是否处理
 * 用于替换页面里重复的 formatAddress 实现
 */
export const maskAddress = (
  address: string,
  isPrivacyMode: boolean,
): string => {
  if (!address || !isPrivacyMode) return address;

  // 优先处理带方括号的 IPv6: [::1]:8080
  const bracketMatch = address.match(/^(\[[^\]]+\])(?::(\d+))?$/);
  if (bracketMatch) {
    const masked = maskIPv6(bracketMatch[1]);
    return bracketMatch[2] ? `${masked}:${bracketMatch[2]}` : masked;
  }

  // 不带方括号:按最后一个 ":" 拆 host/port,但纯 IPv6 不能这样拆
  if (isIPv6(address)) return maskIPv6(address);

  const lastColon = address.lastIndexOf(":");
  if (lastColon === -1) return maskHostname(address);

  const host = address.slice(0, lastColon);
  const port = address.slice(lastColon + 1);
  // port 必须是纯数字,否则视为无端口
  if (!/^\d+$/.test(port)) return maskHostname(address);

  return `${maskHostname(host)}:${port}`;
};

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

  if (!isPrivacyMode) return fullUrl;

  try {
    const urlObj = new URL(fullUrl);
    const maskedHost = maskHostname(urlObj.hostname);

    let maskedUrl = `${urlObj.protocol}//${maskedHost}`;
    if (urlObj.port) maskedUrl += `:${urlObj.port}`;
    maskedUrl += urlObj.pathname + urlObj.search + urlObj.hash;

    return maskedUrl;
  } catch {
    // URL 解析失败:可能传入的是裸 host[:port]
    return maskAddress(fullUrl, true);
  }
};
