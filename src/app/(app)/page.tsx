"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChartColumn, ChevronDown, Plus, Search, UserRound } from "lucide-react";
import { MonthSheet } from "@/components/date/date-sheet";
import { EmptyBlock, ErrorBlock, ListSkeleton } from "@/components/layout/states";
import { WeeklyBars } from "@/components/stats/weekly-bars";
import { TransactionDetailSheet } from "@/components/transaction/detail-sheet";
import { GroupedList } from "@/components/transaction/grouped-list";
import { SummaryHero } from "@/components/transaction/summary-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  api,
  buildQuery,
  errorMessage,
  type Paginated,
  type SummaryResult,
  type TransactionDto,
  type TrendPoint,
} from "@/lib/api";
import {
  periodMonthOf,
  resolveMonthRange,
  shiftDay,
  todayInBusinessTimezone,
  type BillRangeMode,
} from "@/lib/dates";
import { money, monthLabel } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";
import { useMonthStartDay } from "@/lib/month-start-day";
import type { TransactionDateRange } from "@/lib/api";

const PAGE_SIZE = 50;

/**
 * 账单页：按账期月份聚合的主入口。
 *
 * 三块数据各取所需：summary 出「月结余」大卡，trend 出最近七日的支出柱状，
 * transactions 出当前账期的流水（按日分组 + 前端翻页）。
 * 账期由「月份起始日」决定，起始日为 1 号时就是自然月。
 */
export default function BillPage() {
  const router = useRouter();
  const today = todayInBusinessTimezone();
  const [monthStartDay, setMonthStartDay] = useMonthStartDay();
  // 用户手动选过月份后固定住，避免起始日异步加载完成时把默认月份改回去
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 日期抽屉的「显示方式」：按月（账期）/ 按年（自然年）/ 全部（账目自身跨度） */
  const [mode, setMode] = useState<BillRangeMode>("month");

  const month = monthOverride ?? periodMonthOf(today, monthStartDay);
  const monthRange = useMemo(() => resolveMonthRange(month, monthStartDay), [month, monthStartDay]);
  // 「全部」要用账目自身的跨度，只为这个模式发一次请求
  const dataRange = useApiQuery<TransactionDateRange>(
    mode === "all" ? "/api/transactions/range" : null,
  );
  const range = useMemo(() => {
    if (mode === "year") {
      const year = month.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    if (mode === "all") {
      const { firstDay, lastDay } = dataRange.data ?? { firstDay: null, lastDay: null };
      // 一笔账都没有时退回当前账期：接口在无区间时默认「最近 30 天」，那不是「全部」
      return firstDay && lastDay ? { from: firstDay, to: lastDay } : monthRange;
    }
    return monthRange;
  }, [mode, month, monthRange, dataRange.data]);

  const heroLabel =
    mode === "year"
      ? `${month.slice(0, 4)}年结余`
      : mode === "all"
        ? "累计结余"
        : `${monthLabel(month)}结余`;
  const headerLabel =
    mode === "year" ? `${month.slice(0, 4)}年` : mode === "all" ? "全部" : monthLabel(month);

  const summaryPath = `/api/stats/summary${buildQuery({ from: range.from, to: range.to })}`;
  const trendPath = `/api/stats/trend${buildQuery({
    granularity: "day",
    from: shiftDay(today, -6),
    to: today,
  })}`;
  const listPath = `/api/transactions${buildQuery({
    from: range.from,
    to: range.to,
    page: 1,
    pageSize: PAGE_SIZE,
  })}`;

  const summary = useApiQuery<SummaryResult>(summaryPath);
  const trend = useApiQuery<{ granularity: "day"; points: TrendPoint[] }>(trendPath);
  const list = useApiQuery<Paginated<TransactionDto>>(listPath);

  // 翻页状态：page 为 0 表示「只有首屏那一页」，其余值记录已追加到的页码
  const [extra, setExtra] = useState<{ page: number; items: TransactionDto[] }>({
    page: 0,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  // 点开的那笔账目：详情 / 删除 / 退款都在抽屉里完成
  const [detail, setDetail] = useState<TransactionDto | null>(null);

  // 账期变化即清空已追加的页，否则会串到下一个月
  useEffect(() => {
    setExtra((prev) =>
      prev.page === 0 && prev.items.length === 0 ? prev : { page: 0, items: [] },
    );
    setMoreError(null);
  }, [listPath]);

  const firstPageItems = list.data?.items ?? [];
  const items = extra.page === 0 ? firstPageItems : [...firstPageItems, ...extra.items];
  const loadedPages = extra.page === 0 ? 1 : extra.page;
  const hasMore = loadedPages < (list.data?.totalPages ?? 1);

  const weekPoints = trend.data?.points ?? [];
  const weekTotal = weekPoints.reduce((sum, point) => sum + point.expenseCents, 0);

  async function loadMore() {
    const nextPage = extra.page === 0 ? 2 : extra.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await api.get<Paginated<TransactionDto>>(
        `/api/transactions${buildQuery({
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

  /** 删除 / 退款后重新取数：已追加的分页内容已失效，一并清掉只保留首屏 */
  function refreshAll() {
    setExtra({ page: 0, items: [] });
    setMoreError(null);
    summary.reload();
    trend.reload();
    list.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-lg font-medium transition-colors hover:bg-muted/60"
        >
          {headerLabel}
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>

        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon-sm">
            <Link href="/search" aria-label="搜索账单">
              <Search />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="选择日期"
            onClick={() => setSheetOpen(true)}
          >
            <CalendarDays />
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href="/stats" aria-label="统计">
              <ChartColumn />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm">
            <Link href="/settings" aria-label="我的">
              <UserRound />
            </Link>
          </Button>
        </div>
      </header>

      {summary.error ? (
        <ErrorBlock
          title="账期数据加载失败"
          description={summary.error}
          onRetry={summary.reload}
        />
      ) : (
        <SummaryHero
          label={heroLabel}
          summary={summary.data}
          incomeLabel={mode === "month" ? "月收入" : "收入"}
          expenseLabel={mode === "month" ? "月支出" : "支出"}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>最近七日支出</CardTitle>
          <CardDescription className="text-xs">
            共计 <span className="font-mono tabular-nums">{money(weekTotal, "")}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trend.loading ? <ListSkeleton rows={2} /> : <WeeklyBars points={weekPoints} />}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        {list.loading ? (
          <ListSkeleton rows={5} />
        ) : list.error ? (
          <ErrorBlock title="流水加载失败" description={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock
            title="这个区间还没有记录"
            description="从「记一笔」开始，随手记下今天的收支"
            action={
              <Button asChild size="sm">
                <Link href="/transactions/new">
                  <Plus />
                  记一笔
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <GroupedList items={items} onSelect={setDetail} />
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

      <MonthSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        value={month}
        onSelect={setMonthOverride}
        monthStartDay={monthStartDay}
        onMonthStartDayChange={setMonthStartDay}
        mode={mode}
        onModeChange={setMode}
      />

      <TransactionDetailSheet
        transaction={detail}
        onOpenChange={(open) => (open ? undefined : setDetail(null))}
        onChanged={refreshAll}
        onEdit={(transaction) => router.push(`/transactions/new?id=${transaction.id}`)}
      />
    </div>
  );
}
