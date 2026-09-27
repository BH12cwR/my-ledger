import { ApiError } from "../http/errors";
import { parseAmountToCents } from "@/lib/money";

/** 服务层公共类型与工具 */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/** 把外部传入的金额（字符串/数字）转换为「分」，失败时抛出 400 */
export function toCents(value: string | number): number {
  try {
    return parseAmountToCents(value);
  } catch (error) {
    throw ApiError.badRequest(error instanceof Error ? error.message : "金额格式不正确");
  }
}

export function nowMs(): number {
  return Date.now();
}

/** D1 的 .all() 结果统一收敛为数组，兼容 results 为 undefined 的情况 */
export async function allRows<Row>(statement: {
  all: <T>() => Promise<{ results?: T[] }>;
}): Promise<Row[]> {
  const { results } = await statement.all<Row>();
  return results ?? [];
}

/**
 * 构造 IN (?, ?, ...) 占位符。
 * D1 不支持绑定数组，必须展开为等长占位符列表。
 */
export function placeholders(count: number): string {
  return new Array(count).fill("?").join(", ");
}

/** 校验分组统计结果中的百分比，避免除零 */
export function shareOfTotal(amount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 10000) / 100;
}