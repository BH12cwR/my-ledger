"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChartPie, ChevronDown, Plus, UserRound } from "lucide-react";
import { MonthSheet } from "@/components/date/date-sheet";
import { EmptyBlock, ErrorBlock, ListSkeleton } from "@/components/layout/states";
import { WeeklyBars } from "@/components/stats/weekly-bars";
import { GroupedList } from "@/components/transaction/grouped-list";
import { SummaryHero } from "@/components/transaction/summary-hero";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/lib/dates";
import { money, monthLabel } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";
import { useMonthStartDay } from "@/lib/month-start-day";

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

  const month = monthOverride ?? periodMonthOf(today, monthStartDay);
  const range = useMemo(() => resolveMonthRange(month, monthStartDay), [month, monthStartDay]);

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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-lg font-medium transition-colors hover:bg-muted/60"
        >
          {monthLabel(month)}
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>

        <div className="flex items-center gap-1">
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
              <ChartPie />
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
        <SummaryHero month={month} summary={summary.data} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>最近七日支出</CardTitle>
          <CardAction>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              共计 {money(weekTotal, "")}
            </span>
          </CardAction>
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
            title="本月还没有记录"
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
            <GroupedList
              items={items}
              onSelect={(transaction) => router.push(`/transactions/new?id=${transaction.id}`)}
            />
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
      />
    </div>
  );
}
