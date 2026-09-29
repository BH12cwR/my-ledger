"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { EmptyBlock, ErrorBlock, ListSkeleton } from "@/components/layout/states";
import { TransactionDetailSheet } from "@/components/transaction/detail-sheet";
import { GroupedList } from "@/components/transaction/grouped-list";
import { SummaryCell } from "@/components/transaction/summary-cell";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  api,
  errorMessage,
  type Paginated,
  type TransactionDto,
  type TransactionsSummary,
} from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import {
  EMPTY_SEARCH_FILTERS,
  SEARCH_KIND_OPTIONS,
  hasDateFilter,
  readSearchFilters,
  searchFilterQuery,
  type SearchFilters,
} from "@/lib/search-filters";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/**
 * 搜索账单页（稿 6）。
 *
 * 筛选条件全部落在 URL 上：从「自定义筛选」返回、刷新页面、浏览器前进后退都能还原视图。
 * 汇总卡与列表共用同一套过滤参数（服务端同一段 WHERE），所以「共 N 笔」永远等于列表总数。
 * 关键字同时匹配分类名、备注与金额，由服务端完成，不在前端做本地过滤。
 */
export default function SearchPage() {
  const router = useRouter();

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS);
  // ready 之前不写 URL、不发请求，避免用默认值覆盖掉地址栏里已有的条件
  const [ready, setReady] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [kindSheetOpen, setKindSheetOpen] = useState(false);

  useEffect(() => {
    const initial = readSearchFilters(window.location.search);
    setFilters(initial);
    setKeywordDraft(initial.keyword);
    setReady(true);
  }, []);

  // 地址栏跟随筛选条件变化；用 replaceState 而不是 router.replace，
  // 既保留浏览器历史（从筛选页返回能回到原条件），也不会触发额外的路由请求
  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, "", `/search${searchFilterQuery(filters)}`);
  }, [filters, ready]);

  // 输入即搜：300ms 静默期后才应用关键字，避免每敲一个字都打一次接口
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const next = keywordDraft.trim();
      setFilters((current) => (current.keyword === next ? current : { ...current, keyword: next }));
    }, 300);
    return () => clearTimeout(timer);
  }, [keywordDraft, ready]);

  const listPath = ready
    ? `/api/transactions${searchFilterQuery(filters, { page: 1, pageSize: PAGE_SIZE })}`
    : null;
  const summaryPath = ready
    ? `/api/transactions/summary${searchFilterQuery(filters)}`
    : null;

  const list = useApiQuery<Paginated<TransactionDto>>(listPath);
  const summary = useApiQuery<TransactionsSummary>(summaryPath);

  // 翻页状态：page 为 0 表示「只有首屏那一页」
  const [extra, setExtra] = useState<{ page: number; items: TransactionDto[] }>({
    page: 0,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // 点开的那笔账目：详情 / 删除 / 退款都在抽屉里完成
  const [detail, setDetail] = useState<TransactionDto | null>(null);

  // 条件一变就必须清空已追加的页，否则旧结果会混进新结果里
  useEffect(() => {
    setExtra((prev) => (prev.page === 0 && prev.items.length === 0 ? prev : { page: 0, items: [] }));
    setMoreError(null);
  }, [listPath]);

  const firstPageItems = list.data?.items ?? [];
  const items = extra.page === 0 ? firstPageItems : [...firstPageItems, ...extra.items];
  const loadedPages = extra.page === 0 ? 1 : extra.page;
  const hasMore = loadedPages < (list.data?.totalPages ?? 1);

  const kindLabel = useMemo(
    () => SEARCH_KIND_OPTIONS.find((option) => option.value === filters.kind)?.label ?? "全部",
    [filters.kind],
  );

  async function loadMore() {
    const nextPage = extra.page === 0 ? 2 : extra.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await api.get<Paginated<TransactionDto>>(
        `/api/transactions${searchFilterQuery(filters, { page: nextPage, pageSize: PAGE_SIZE })}`,
      );
      setExtra((prev) => ({ page: nextPage, items: [...prev.items, ...result.items] }));
    } catch (cause) {
      setMoreError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!ready) return <ListSkeleton rows={4} />;

  /** 删除 / 退款后重新取数：已追加的分页内容已失效，一并清掉只保留首屏 */
  function refreshAll() {
    setExtra({ page: 0, items: [] });
    setMoreError(null);
    list.reload();
    summary.reload();
  }

  const filterHref = `/search/filter${searchFilterQuery(filters)}`;
  const filterActive = hasDateFilter(filters) || Boolean(filters.categoryId);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="返回" onClick={() => router.push("/")}>
          <ArrowLeft />
        </Button>
        <h1 className="font-heading text-lg font-semibold">搜索账单</h1>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setKindSheetOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60",
            filters.kind && "border-blue-500/40 text-blue-600 dark:text-blue-400",
          )}
        >
          {kindLabel}
          <ChevronDown className="size-3.5" />
        </button>
        <Link
          href={filterHref}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs transition-colors hover:bg-muted/60",
            filterActive && "border-blue-500/40 text-blue-600 dark:text-blue-400",
          )}
        >
          筛选
          <ChevronDown className="size-3.5" />
        </Link>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border/60 px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={keywordDraft}
          maxLength={50}
          placeholder="搜索：分类、备注、金额"
          onChange={(event) => setKeywordDraft(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Link href={filterHref} aria-label="筛选" className="shrink-0 py-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>搜索汇总</CardTitle>
          <CardAction>
            <span className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">共 {summary.data?.total ?? 0} 笔</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={filters.sort === "asc" ? "改为从新到旧" : "改为从旧到新"}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    sort: current.sort === "asc" ? "desc" : "asc",
                  }))
                }
              >
                <ArrowUpDown className={cn(filters.sort === "asc" && "text-blue-600")} />
              </Button>
            </span>
          </CardAction>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <SummaryCell label="支出" cents={summary.data?.expenseCents} tone="expense" />
          <SummaryCell label="收入" cents={summary.data?.incomeCents} tone="income" />
          <SummaryCell label="结余" cents={summary.data?.netCents} />
          <SummaryCell label="转账/还款" cents={summary.data?.transferCents} tone="transfer" />
          <SummaryCell label="退款" cents={summary.data?.refundCents} tone="income" />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        {list.loading ? (
          <ListSkeleton rows={5} />
        ) : list.error ? (
          <ErrorBlock title="搜索结果加载失败" description={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="没有符合条件的记录"
            description="试着换个关键词，或到「筛选」里放宽日期范围"
          />
        ) : (
          <>
            <GroupedList items={items} groupBy="month" onSelect={setDetail} />
            {hasMore ? (
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            ) : null}
            {moreError ? (
              <p className="text-center text-xs text-destructive">{moreError}</p>
            ) : null}
          </>
        )}
      </section>

      <TransactionDetailSheet
        transaction={detail}
        onOpenChange={(open) => (open ? undefined : setDetail(null))}
        onChanged={refreshAll}
        onEdit={(transaction) => router.push(`/transactions/new?id=${transaction.id}`)}
      />

      <BottomSheet open={kindSheetOpen} onOpenChange={setKindSheetOpen}>
        <BottomSheetContent title="选择类型">
          <div className="flex flex-col gap-1 pt-1">
            {SEARCH_KIND_OPTIONS.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                onClick={() => {
                  setFilters((current) => ({ ...current, kind: option.value }));
                  setKindSheetOpen(false);
                }}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                  filters.kind === option.value &&
                    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
