import { buildApiUrl } from "./utils";

/**
 * API 客户端 - 自动在请求头中添加 JWT token
 */

// 获取 token
function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("nodepass.token");
  }
  return null;
}

// 扩展 RequestInit 类型以支持自定义选项
interface ApiFetchOptions extends RequestInit {
  // 是否跳过自动添加 token（默认 false）
  skipAuth?: boolean;
}

/**
 * 带自动认证的 fetch 封装
 * @param url - API 路径（相对路径，如 "/api/tunnels"）
 * @param options - fetch 选项，可包含 skipAuth
 */
export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { skipAuth = false, ...fetchOptions } = options;

  // 构建完整 URL
  const fullUrl = buildApiUrl(url);

  // 准备请求头
  const headers = new Headers(fetchOptions.headers || {});

  // 如果不跳过认证，自动添加 Authorization header
  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  // 发送请求
  const response = await fetch(fullUrl, {
    ...fetchOptions,
    headers,
  });

  // 如果返回 401，token 可能已过期，清除本地存储
  if (response.status === 401 && !skipAuth) {
    console.warn("🚨 Token 已过期或无效，清除本地存储");
    if (typeof window !== "undefined") {
      localStorage.removeItem("nodepass.token");
      localStorage.removeItem("nodepass.tokenExpiresAt");
      localStorage.removeItem("nodepass.user");
    }
    // 重定向到登录页（可选）
    // window.location.href = "/login";
  }

  return response;
}

/**
 * GET 请求便捷方法
 */
export async function apiGet(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: "GET",
  });
}

/**
 * POST 请求便捷方法
 */
export async function apiPost(
  url: string,
  body?: unknown,
  options: ApiFetchOptions = {},
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT 请求便捷方法
 */
export async function apiPut(
  url: string,
  body?: unknown,
  options: ApiFetchOptions = {},
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE 请求便捷方法
 */
export async function apiDelete(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: "DELETE",
  });
}

/**
 * PATCH 请求便捷方法
 */
export async function apiPatch(
  url: string,
  body?: unknown,
  options: ApiFetchOptions = {},
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// 导出默认的 apiFetch 作为主要接口
export default apiFetch;
