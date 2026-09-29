/**
 * 搜索账单 / 自定义筛选两个页面共用的筛选条件定义。
 *
 * 条件全部落在 URL 查询串上（而不是 React 状态或全局 store），
 * 这样从筛选页返回、刷新页面、浏览器前进后退都能还原同一个视图。
 */

import { buildQuery, type TransactionSort } from "./api";

/** 空串表示「不限定类型」 */
export type SearchKindFilter = "" | "expense" | "income" | "transfer";

export const SEARCH_KIND_OPTIONS: Array<{ value: SearchKindFilter; label: string }> = [
  { value: "", label: "全部" },
  { value: "expense", label: "支出" },
  { value: "income", label: "收入" },
  { value: "transfer", label: "转账" },
];

export interface SearchFilters {
  kind: SearchKindFilter;
  from: string;
  to: string;
  categoryId: string;
  keyword: string;
  sort: TransactionSort;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  kind: "",
  from: "",
  to: "",
  categoryId: "",
  keyword: "",
  sort: "desc",
};

/**
 * 从查询串还原筛选条件。
 *
 * 页面侧请传 `window.location.search` 而不是用 `useSearchParams`：
 * 后者会让页面退出静态预渲染，这在本项目的部署形态下代价不小。
 */
export function readSearchFilters(search: string): SearchFilters {
  const params = new URLSearchParams(search);
  const kind = params.get("kind") ?? "";
  return {
    kind: kind === "expense" || kind === "income" || kind === "transfer" ? kind : "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    categoryId: params.get("categoryId") ?? "",
    keyword: params.get("keyword") ?? "",
    sort: params.get("sort") === "asc" ? "asc" : "desc",
  };
}

/** 筛选条件 → 查询串（含前导 `?`）；空值一律省略，`extra` 用于追加分页 / 排序 */
export function searchFilterQuery(
  filters: SearchFilters,
  extra: Record<string, string | number> = {},
): string {
  return buildQuery({
    kind: filters.kind || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    categoryId: filters.categoryId || undefined,
    keyword: filters.keyword || undefined,
    // desc 是默认值，不写进 URL，保持地址栏干净
    sort: filters.sort === "asc" ? "asc" : undefined,
    ...extra,
  });
}

/** 判断筛选条件里是否带了时间区间，用于「筛选」按钮的高亮提示 */
export function hasDateFilter(filters: SearchFilters): boolean {
  return Boolean(filters.from || filters.to);
}
