/**
 * 版本检查工具
 * 用于检查是否有新版本可用
 */

/**
 * 版本信息接口
 */
export interface VersionInfo {
  version: string;
  releaseUrl: string;
  releaseName: string;
  publishedAt: string;
}

/**
 * GitHub Release 响应接口
 */
interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
}

/**
 * 判断版本是否为测试版
 * @param version 版本号字符串
 * @returns 是否为测试版
 */
export function isBetaVersion(version: string): boolean {
  const betaKeywords = ['beta', 'alpha', 'rc', 'dev', 'preview'];
  const versionLower = version.toLowerCase();

  return betaKeywords.some(keyword => versionLower.includes(keyword));
}

/**
 * 比较两个语义化版本号
 * @param version1 版本号1
 * @param version2 版本号2
 * @returns 如果 version2 > version1 返回 true
 */
export function compareVersions(version1: string, version2: string): boolean {
  // 移除 'v' 前缀和 beta 等后缀，只保留数字部分
  const cleanVersion = (v: string) => {
    return v.replace(/^v/, '').split(/[-+]/)[0];
  };

  const v1 = cleanVersion(version1);
  const v2 = cleanVersion(version2);

  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num2 > num1) return true;
    if (num2 < num1) return false;
  }

  return false;
}

/**
 * 从 GitHub 获取最新版本信息
 * @param currentVersion 当前版本号
 * @returns 版本信息，如果没有新版本则返回 null
 */
export async function checkForUpdates(currentVersion: string): Promise<VersionInfo | null> {
  try {
    const isBeta = isBetaVersion(currentVersion);
    let latestVersion: VersionInfo | null = null;

    if (isBeta) {
      // 测试版：获取所有 releases（包括 pre-release）
      const response = await fetch(
        'https://api.github.com/repos/NodePassProject/nodepass-core/releases',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch releases:', response.statusText);
        return null;
      }

      const releases: GitHubRelease[] = await response.json();

      // 找到最新的版本（可能是正式版或测试版）
      if (releases.length > 0) {
        const latest = releases[0];
        latestVersion = {
          version: latest.tag_name,
          releaseUrl: latest.html_url,
          releaseName: latest.name,
          publishedAt: latest.published_at,
        };
      }
    } else {
      // 正式版：只获取最新的正式版本
      const response = await fetch(
        'https://api.github.com/repos/yosebyte/nodepass/releases/latest',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch latest release:', response.statusText);
        return null;
      }

      const release: GitHubRelease = await response.json();
      latestVersion = {
        version: release.tag_name,
        releaseUrl: release.html_url,
        releaseName: release.name,
        publishedAt: release.published_at,
      };
    }

    // 比较版本号
    if (latestVersion && compareVersions(currentVersion, latestVersion.version)) {
      return latestVersion;
    }

    return null;
  } catch (error) {
    console.error('Error checking for updates:', error);
    return null;
  }
}

/**
 * 格式化发布时间
 * @param publishedAt ISO 8601 时间字符串
 * @returns 格式化后的时间字符串
 */
export function formatReleaseTime(publishedAt: string): string {
  const date = new Date(publishedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} 周前`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} 个月前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}
