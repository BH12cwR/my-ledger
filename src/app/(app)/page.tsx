"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { BudgetProgress, budgetPeriodLabel } from "@/components/budget-progress";
import { CategoryIcon } from "@/components/category-icon";
import { ErrorBlock, EmptyBlock, ListSkeleton, LoadingBlock } from "@/components/layout/states";
import { TransactionRow } from "@/components/transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  const router = useRouter();
  const overview = useApiQuery<DashboardOverview>(OVERVIEW_PATH);
  const recent = useApiQuery<Paginated<TransactionDto>>(RECENT_PATH);

  if (overview.loading) return <LoadingBlock label="正在加载你的账本…" />;

  if (overview.error) {
    return <ErrorBlock title="账本加载失败" description={overview.error} onRetry={overview.reload} />;
  }

  const month = overview.data?.month;
  const today = overview.data?.today;
  const topCategories = overview.data?.topCategories ?? [];
  const budgets = overview.data?.budgets ?? [];
  const recentItems = recent.data?.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>预算</CardTitle>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings">
                管理
                <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {budgets.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">还没有设置预算，先为每月支出定个额度吧</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">去设置</Link>
              </Button>
            </div>
          ) : (
            budgets.map((budget) => (
              <div key={budget.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <CategoryIcon name={budget.categoryIcon ?? "wallet"} color={budget.categoryColor} />
                  <span className="flex-1 truncate text-sm">{budget.categoryName ?? "总预算"}</span>
                  <span className="font-mono text-sm tabular-nums">
                    {money(budget.spentCents)}
                    <span className="text-muted-foreground"> / {money(budget.amountCents)}</span>
                  </span>
                </div>
                <BudgetProgress percentage={budget.percentage} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {budgetPeriodLabel(budget.period)} · 已用 {budget.percentage}%
                  </span>
                  <span className={budget.remainingCents < 0 ? "text-rose-600 dark:text-rose-400" : ""}>
                    {budget.remainingCents < 0
                      ? `超支 ${money(-budget.remainingCents)}`
                      : `剩余 ${money(budget.remainingCents)}`}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{month ? `${monthLabel(month.from.slice(0, 7))}结余` : "本月结余"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p
            className={`font-mono text-4xl font-semibold tabular-nums tracking-tight ${
              (month?.netCents ?? 0) < 0 ? "text-rose-600 dark:text-rose-400" : ""
            }`}
          >
            {money(month?.netCents ?? 0)}
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">本月收入</p>
              <p className="font-mono font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                {money(month?.incomeCents ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">本月支出</p>
              <p className="font-mono font-medium tabular-nums text-rose-600 dark:text-rose-400">
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
        <CardHeader>
          <CardTitle>本月支出 Top 5</CardTitle>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/stats">
                统计
                <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {topCategories.length === 0 ? (
            <p className="rounded-lg bg-muted/60 px-3 py-6 text-center text-xs text-muted-foreground">
              本月还没有支出记录
            </p>
          ) : (
            topCategories.map((item) => (
              <div key={item.id ?? item.name} className="flex flex-col gap-1.5">
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
        <CardHeader>
          <CardTitle>最近账目</CardTitle>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href="/transactions">
                全部
                <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {recent.loading ? (
            <ListSkeleton rows={3} />
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
            ? "font-mono font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
            : tone === "expense"
              ? "font-mono font-medium tabular-nums text-rose-600 dark:text-rose-400"
              : "font-mono font-medium tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}