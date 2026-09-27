import type { ZodType } from "zod";
import { ApiError } from "./errors";

/**
 * 把 URL 查询串解析为普通对象后交给 zod 校验。
 * 空字符串统一丢弃，让 schema 里的 default() 生效（?page= 等价于未传）。
 */
export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const raw: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (value !== "") raw[key] = value;
  }
  return schema.parse(raw);
}

/** 读取动态路由参数，缺失时按 400 处理 */
export function pathParam(value: string | undefined, label = "资源标识"): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.badRequest(`缺少${label}`);
  return trimmed;
}

/** 读取布尔型查询参数，接受 1 / true */
export function queryFlag(request: Request, name: string): boolean {
  const value = new URL(request.url).searchParams.get(name);
  return value === "1" || value === "true";
}