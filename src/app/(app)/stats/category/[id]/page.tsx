"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { CategoryBadge } from "@/components/category-icon";
import { PageHeader } from "@/components/layout/page-header";
import {
  EmptyBlock,
  ErrorBlock,
  InlineEmpty,
  InlineError,
  LoadingBlock,
  ListSkeleton,
} from "@/components/layout/states";
import { TransactionDetailSheet } from "@/components/transaction/detail-sheet";
import { GroupedList } from "@/components/transaction/grouped-list";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { METRIC_GRID_CLASS, MetricCell } from "@/components/ui/metric-cell";
import {
  api,
  buildQuery,
  errorMessage,
  type CategoryDetailResult,
  type CategoryDto,
  type Paginated,
  type TagDto,
  type TransactionDto,
  type TrendResponse,
} from "@/lib/api";
import { daysInMonth, todayInBusinessTimezone } from "@/lib/dates";
import { money, monthLabel } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

/** 坐标轴金额压缩为「元」，与统计页保持一致 */
function axisMoney(cents: number): string {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  return yuan.toFixed(0);
}

/**
 * 分类详情（稿 9）。
 *
 * 时间 tab 横向滚动：`2026年` + 该年各月（倒序），年份用顶部 `‹ ›` 切换。
 * 区间口径为自然月 / 自然年 —— tab 本身按自然月命名，与账单页的「账期」刻意区分开。
 * 指标里的「平均每月」由服务端按区间覆盖的月数摊分，「退款合计」统计来源支出属于该分类的退款记录。
 */
export default function CategoryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const categoryId = params?.id ?? "";

  const today = todayInBusinessTimezone();
  const currentYear = Number(today.slice(0, 4));

  const [year, setYear] = useState(currentYear);
  /** null 表示「全年」；否则为 YYYY-MM */
  const [monthKey, setMonthKey] = useState<string | null>(null);
  /** 顶栏筛选图标：按标签收窄本页的三处口径 */
  const [tagId, setTagId] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [extra, setExtra] = useState<{ page: number; items: TransactionDto[] }>({
    page: 0,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // 点开的那笔账目：详情 / 删除 / 退款都在抽屉里完成
  // （`detail` 已被本页的统计指标占用，这里换一个名字）
  const [activeTransaction, setActiveTransaction] = useState<TransactionDto | null>(null);

  // 切换年份后原来选中的月份已不属于该年，回到全年
  useEffect(() => {
    setMonthKey(null);
  }, [year]);

  const range = useMemo(() => {
    if (!monthKey) return { from: `${year}-01-01`, to: `${year}-12-31` };
    const lastDay = daysInMonth(monthKey);
    return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` };
  }, [year, monthKey]);

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");
  const category = (categories.data?.items ?? []).find((item) => item.id === categoryId) ?? null;
  // 分类类型决定统计口径；等分类字典到齐再发请求，避免先用错口径取一次数据
  const kind = category?.kind === "income" ? "income" : "expense";
  const ready = category !== null;

  const detail = useApiQuery<CategoryDetailResult>(
    ready
      ? `/api/stats/category${buildQuery({ categoryId, kind, tagId, from: range.from, to: range.to })}`
      : null,
  );
  const trend = useApiQuery<TrendResponse>(
    ready
      ? `/api/stats/trend${buildQuery({
          granularity: "month",
          from: `${year}-01-01`,
          to: `${year}-12-31`,
          categoryId,
          tagId,
        })}`
      : null,
  );

  const listPath = ready
    ? `/api/transactions${buildQuery({
        categoryId,
        kind,
        tagId,
        from: range.from,
        to: range.to,
        page: 1,
        pageSize: PAGE_SIZE,
      })}`
    : null;
  const list = useApiQuery<Paginated<TransactionDto>>(listPath);

  // 区间变化即清空已追加的页，否则会串到另一个区间
  useEffect(() => {
    setExtra((prev) => (prev.page === 0 && prev.items.length === 0 ? prev : { page: 0, items: [] }));
    setMoreError(null);
  }, [listPath]);

  const firstPageItems = list.data?.items ?? [];
  const items = extra.page === 0 ? firstPageItems : [...firstPageItems, ...extra.items];
  const loadedPages = extra.page === 0 ? 1 : extra.page;
  const hasMore = loadedPages < (list.data?.totalPages ?? 1);

  /** 12 个月柱状图：接口只返回有数据的月份，这里补齐整年 */
  const bars = useMemo(() => {
    const byMonth = new Map((trend.data?.points ?? []).map((point) => [point.day, point]));
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      return { month, expenseCents: byMonth.get(month)?.expenseCents ?? 0 };
    });
  }, [trend.data, year]);

  /** 时间 tab：全年 + 该年各月倒序（今年只到当前月） */
  const monthTabs = useMemo(() => {
    const last = year === currentYear ? Number(today.slice(5, 7)) : 12;
    return Array.from({ length: last }, (_, index) => `${year}-${String(last - index).padStart(2, "0")}`);
  }, [year, currentYear, today]);

  async function loadMore() {
    const nextPage = extra.page === 0 ? 2 : extra.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await api.get<Paginated<TransactionDto>>(
        `/api/transactions${buildQuery({
          categoryId,
          kind,
          tagId,
          from: range.from,
          to: range.to,
          page: nextPage,
          pageSize: PAGE_SIZE,
        })}`,
      );
      setExtra((prev) => ({ page: nextPage, items: [...prev.items, ...result.items] }));
    } catch (cause) {
      setMoreError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  /** 删除 / 退款后重新取数：已追加的分页内容已失效，指标与柱状图也一并刷新 */
  function refreshAll() {
    setExtra({ page: 0, items: [] });
    setMoreError(null);
    detail.reload();
    trend.reload();
    list.reload();
  }

  if (categories.loading) return <LoadingBlock label="正在加载分类…" />;

  if (categories.error) {
    return (
      <ErrorBlock
        title="分类加载失败"
        description={categories.error}
        onRetry={categories.reload}
      />
    );
  }

  if (!category) {
    return (
      <EmptyBlock title="分类不存在" description="该分类可能已被删除，返回统计页重新选择" />
    );
  }

  const kindLabel = kind === "income" ? "收入" : "支出";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`分类-${category.name}`}
        onBack={() => router.push("/stats")}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="上一年"
              onClick={() => setYear(year - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm tabular-nums">{year}年</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="下一年"
              onClick={() => setYear(year + 1)}
              disabled={year >= currentYear}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="筛选"
              onClick={() => setFilterOpen(true)}
              className={cn(tagId && "text-brand-text")}
            >
              <SlidersHorizontal />
            </Button>
          </>
        }
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {["year", ...monthTabs].map((tab) => {
          const active = (monthKey ?? "year") === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setMonthKey(tab === "year" ? null : tab)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                active
                  ? "bg-brand text-white"
                  : "border border-border/60 text-muted-foreground hover:bg-muted/60",
              )}
            >
              {tab === "year" ? `${year}年` : monthLabel(tab)}
            </button>
          );
        })}
      </div>

      {detail.loading ? (
        <ListSkeleton rows={3} />
      ) : detail.error ? (
        <ErrorBlock title="指标加载失败" description={detail.error} onRetry={detail.reload} />
      ) : (
        <Card>
          <CardContent className={METRIC_GRID_CLASS}>
            <MetricCell
              label={`总${kindLabel}`}
              value={money(detail.data?.totalCents ?? 0)}
              tone={kind}
            />
            <MetricCell label="总笔数" value={`${detail.data?.transactionCount ?? 0}`} />
            <MetricCell
              label="平均每笔"
              value={money(detail.data?.averagePerTransactionCents ?? 0)}
            />
            <MetricCell
              label="平均每月"
              value={money(detail.data?.averagePerMonthCents ?? 0)}
            />
            <MetricCell
              label="退款"
              value={money(detail.data?.refundCents ?? 0)}
              tone="income"
              className="col-span-2"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{year} 年月度{kindLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.loading ? (
            <ListSkeleton rows={2} />
          ) : trend.error ? (
            <InlineEmpty className="py-6">{trend.error}</InlineEmpty>
          ) : (
            <ChartContainer
              config={{ expenseCents: { label: kindLabel, color: category.color } } satisfies ChartConfig}
              className="aspect-auto h-56 w-full"
            >
              <BarChart data={bars} margin={{ left: 4, right: 8, top: 18, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(value: string) => `${Number(value.slice(5))}月`}
                />
                <YAxis
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => axisMoney(value)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => monthLabel(String(value))}
                      formatter={(value) => money(Number(value))}
                    />
                  }
                />
                <Bar dataKey="expenseCents" fill={category.color} radius={4}>
                  <LabelList
                    position="top"
                    valueAccessor={(entry) => {
                      const cents = Number(entry.value);
                      return cents > 0 ? money(cents, "") : "";
                    }}
                    className="fill-muted-foreground text-[10px]"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-2 text-center">
          <CategoryBadge icon={category.icon} color={category.color} />
          <p className="truncate text-sm font-medium">{category.name}</p>
          <p className="font-mono text-xl font-semibold tabular-nums">
            {money(detail.data?.totalCents ?? 0)}
          </p>
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs tabular-nums"
            style={{ borderColor: category.color, color: category.color }}
          >
            {detail.data?.sharePercentage ?? 0}%
          </span>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        {list.loading ? (
          <ListSkeleton rows={5} />
        ) : list.error ? (
          <ErrorBlock title="明细加载失败" description={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock title="该区间内没有记录" description="换一个时间 tab 试试" />
        ) : (
          <>
            <GroupedList items={items} onSelect={setActiveTransaction} />
            {hasMore ? (
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "加载中…" : "加载更多"}
              </Button>
            ) : null}
            {moreError ? <InlineError>{moreError}</InlineError> : null}
          </>
        )}
      </section>

      <TransactionDetailSheet
        transaction={activeTransaction}
        onOpenChange={(open) => (open ? undefined : setActiveTransaction(null))}
        onChanged={refreshAll}
        onEdit={(transaction) => router.push(`/transactions/new?id=${transaction.id}`)}
      />

      <BottomSheet open={filterOpen} onOpenChange={setFilterOpen}>
        <BottomSheetContent
          title="筛选"
          footer={
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setTagId("");
                  setFilterOpen(false);
                }}
              >
                重置
              </Button>
              <Button className="flex-1" onClick={() => setFilterOpen(false)}>
                完成
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-1 pt-1">
            <p className="px-1 pb-1 text-xs leading-relaxed text-muted-foreground">
              本页的分类与类型已固定，可按标签进一步收窄 —— 标签会同时作用于指标、柱状图与明细。
            </p>
            <TagOption label="全部标签" active={tagId === ""} onClick={() => setTagId("")} />
            {(tags.data?.items ?? []).map((tag) => (
              <TagOption
                key={tag.id}
                label={tag.name}
                color={tag.color}
                active={tagId === tag.id}
                onClick={() => setTagId(tag.id)}
              />
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

/** 筛选抽屉里的一行标签；带 color 时在名称前画一个色点 */
function TagOption({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
        active && "bg-brand/10 text-brand-text",
      )}
    >
      {color ? (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
