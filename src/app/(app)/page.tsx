"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { TransactionRow } from "@/components/transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/components/providers/session-provider";
import { useApiQuery } from "@/lib/hooks";
import type { DashboardOverview, Paginated, TransactionDto } from "@/lib/api";
import { money, monthLabel } from "@/lib/format";

const OVERVIEW_PATH = "/api/stats/overview";
const RECENT_PATH = "/api/transactions?pageSize=5";

/**
 * 首页概览。
 *
 * 数据只来自两个接口：/api/stats/overview（本月/今日聚合）与 /api/transactions（最近账目）。
 * 所有金额都是「分」，展示前统一交给 money() 格式化。
 */
export default function HomePage() {
  const { user } = useSession();
  const router = useRouter();
  const overview = useApiQuery<DashboardOverview>(OVERVIEW_PATH);
  const recent = useApiQuery<Paginated<TransactionDto>>(RECENT_PATH);

  if (overview.loading) return <LoadingBlock label="正在加载你的账本…" />;

  if (overview.error) {
    return (
      <EmptyBlock
        title="账本加载失败"
        description={overview.error}
        action={
          <Button variant="outline" size="sm" onClick={overview.reload}>
            重新加载
          </Button>
        }
      />
    );
  }

  const month = overview.data?.month;
  const today = overview.data?.today;
  const topCategories = overview.data?.topCategories ?? [];
  const recentItems = recent.data?.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">
            你好，{user?.nickname ?? "记账人"}
          </p>
          <h1 className="font-heading text-lg font-semibold">今天也要好好记账</h1>
        </div>
        <Button asChild size="sm">
          <Link href="/transactions/new">
            <Plus />
            记一笔
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{month ? `${monthLabel(month.from.slice(0, 7))}结余` : "本月结余"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="font-mono text-3xl font-semibold tabular-nums">
            {money(month?.netCents ?? 0)}
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">本月收入</p>
              <p className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {money(month?.incomeCents ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">本月支出</p>
              <p className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {money(month?.expenseCents ?? 0)}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            本月共 {month?.transactionCount ?? 0} 笔 · 支出 {month?.expenseCount ?? 0} 笔 ·
            单笔平均支出 {money(month?.averageExpenseCents ?? 0)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>今日</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-sm">
          <Metric label="支出" value={money(today?.expenseCents ?? 0)} tone="expense" />
          <Metric label="收入" value={money(today?.incomeCents ?? 0)} tone="income" />
          <Metric label="笔数" value={`${today?.transactionCount ?? 0}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>本月支出 Top 5</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/stats">
              统计
              <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {topCategories.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              本月还没有支出记录
            </p>
          ) : (
            topCategories.map((item) => (
              <div key={item.categoryId ?? "uncategorized"} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <CategoryIcon name={item.icon} color={item.color} />
                  <span className="flex-1 truncate text-sm">{item.name}</span>
                  <span className="font-mono text-sm tabular-nums">{money(item.amountCents)}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground">
                    {item.percentage}%
                  </span>
                </div>
                <Progress value={item.percentage} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>最近账目</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/transactions">
              全部
              <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.loading ? (
            <LoadingBlock label="正在加载流水…" />
          ) : recentItems.length === 0 ? (
            <EmptyBlock
              title="还没有任何记录"
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
            <div className="flex flex-col divide-y divide-border/60">
              {recentItems.map((item) => (
                <TransactionRow
                  key={item.id}
                  transaction={item}
                  onClick={() => router.push(`/transactions/new?id=${item.id}`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense";
}) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === "income"
            ? "font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
            : tone === "expense"
              ? "font-mono tabular-nums text-rose-600 dark:text-rose-400"
              : "font-mono tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}