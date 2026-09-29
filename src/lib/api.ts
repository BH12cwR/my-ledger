/**
 * 前端 API 客户端。
 *
 * 浏览器端从不直接接触 D1，所有读写都必须经过 /api 下的服务端路由。
 * 这里统一处理三件事：请求头、`{ data }` 信封的解包、`{ error }` 信封的抛出，
 * 业务代码只需要关心最终的载荷类型。
 */

import type {
  AccountDto,
  AdminDto,
  AuditLogDto,
  CategoryDto,
  TagDto,
  TransactionDto,
  UserDto,
} from "@/server/http/serialize";
// 错误信封 shape 由服务端响应层定义，前端只做类型引用，避免两侧各写一份而漂移
import type { ApiErrorBody } from "@/server/http/response";
import type { Paginated } from "@/server/services/common";
import type {
  AccountBalanceItem,
  CategoryBreakdownItem,
  CategoryDetailResult,
  SummaryComparison,
  SummaryResult,
  TrendPoint,
} from "@/server/services/stats";
import type { TransactionsSummary } from "@/server/services/transactions";
import type { BudgetConfigDto, BudgetView } from "@/server/services/budgets";
import type { OverviewMetrics } from "@/server/services/admin";

// ---------------------------------------------------------------------------
// 契约类型：直接从服务端序列化层引用，避免前后端各写一份而漂移
// ---------------------------------------------------------------------------

export type {
  AccountDto,
  AdminDto,
  ApiErrorBody,
  AuditLogDto,
  CategoryDto,
  Paginated,
  TagDto,
  TransactionDto,
  UserDto,
};

export interface Capabilities {
  wechat: boolean;
  devLogin: boolean;
}

export interface SessionPayload {
  user: UserDto | null;
  capabilities: Capabilities;
}

export interface DashboardOverview {
  month: SummaryResult;
  today: SummaryResult;
  topCategories: CategoryBreakdownItem[];
  budgets: BudgetView[];
}

export type TrendResponse =
  | { granularity: "day"; from: string; to: string; points: TrendPoint[] }
  | { granularity: "month"; points: TrendPoint[] };

export type CategoryBreakdownDimension = "category" | "tag";

/** 账目最早 / 最晚业务日，用于自定义筛选页的动态年份 chip */
export interface TransactionDateRange {
  firstDay: string | null;
  lastDay: string | null;
}

/** 账目查询的排序方向 */
export type TransactionSort = "desc" | "asc";

export interface CategoryBreakdownResponse {
  from: string;
  to: string;
  kind: "expense" | "income" | "all";
  dimension: CategoryBreakdownDimension;
  totalCents: number;
  /** 上一同长度周期的合计；未请求环比时为 null */
  previousTotalCents: number | null;
  items: CategoryBreakdownItem[];
}

export interface PlatformTrendResponse {
  days: number;
  points: Array<{ day: string; newUsers: number; transactions: number; amountCents: number }>;
}

export type {
  AccountBalanceItem,
  BudgetConfigDto,
  BudgetView,
  CategoryBreakdownItem,
  CategoryDetailResult,
  OverviewMetrics,
  SummaryComparison,
  SummaryResult,
  TransactionsSummary,
  TrendPoint,
};

// ---------------------------------------------------------------------------
// 请求封装
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 未登录 / 会话失效，调用方据此跳转登录页 */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined && init.body !== null;

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    // 断网时 Service Worker 会返回 503，fetch 本身也可能直接抛错
    throw new ApiClientError(0, "network_error", "网络不可用，请检查连接后重试");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = (payload as ApiErrorBody | null)?.error;
    throw new ApiClientError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? `请求失败（HTTP ${response.status}）`,
      error?.details,
    );
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

/** 把任意异常转成可直接展示的中文提示 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误，请稍后重试";
}

/** 构造带查询串的路径，自动忽略空值 */
export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}