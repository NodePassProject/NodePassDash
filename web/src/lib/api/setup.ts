import { buildApiUrl } from "@/lib/utils";

export type DriverKind = "sqlite" | "postgres";

export interface SetupStatus {
  initialized: boolean;
  setup_mode: boolean;
  version?: string;
}

export interface SetupPayload {
  driver: DriverKind;
  sqlite?: {
    path: string;
    wal_mode: boolean;
  };
  postgres?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl_mode: string;
    timezone: string;
  };
  admin?: {
    username: string;
    password: string;
  };
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

/** 探测后端 setup 状态。Setup 模式与 Ready 模式都会返回结构一致的 JSON。 */
export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch(buildApiUrl("/api/setup/status"));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as SetupStatus;
}

/** 测试数据库连接(不写任何东西)。 */
export async function testConnection(payload: SetupPayload): Promise<void> {
  await postJSON("/api/setup/test-connection", payload);
}

/** 提交一条龙初始化(连接 + 建表 + 创建管理员 + flip initialized)。 */
export async function initializeDatabase(payload: SetupPayload): Promise<void> {
  await postJSON("/api/setup/initialize", payload);
}
