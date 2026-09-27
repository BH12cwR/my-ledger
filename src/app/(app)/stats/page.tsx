"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  buildQuery,
  type CategoryBreakdownResponse,
  type SummaryResult,
  type TrendResponse,
} from "@/lib/api";
import { shiftDay, todayInBusinessTimezone } from "@/lib/dates";
import { axisDay, money, monthLabel } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const TREND_CONFIG = {
  incomeCents: { label: "收入", color: "#10b981" },
  expenseCents: { label: "支出", color: "#f43f5e" },
} satisfies ChartConfig;

/** 坐标轴上的金额压缩为「元」，避免出现一长串 0 */
function axisMoney(cents: number): string {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  return yuan.toFixed(0);
}

const PRESET_KEYS = ["7d", "30d", "month", "12m"] as const;
type PresetKey = (typeof PRESET_KEYS)[number];

/**
 * 统计页。
 *
 * 三个接口各司其职：summary 出结论数字、trend 出走势、by-category 出结构。
 * 时间范围由预设切换驱动，避免用户手填日期造成的越界查询。
 */
export default function StatsPage() {
  const today = todayInBusinessTimezone();
  const [presetKey, setPresetKey] = useState<PresetKey>("30d");

  const presets = useMemo(
    () =>
      ({
        "7d": { label: "近 7 天", granularity: "day" as const, from: shiftDay(today, -6), to: today },
        "30d": { label: "近 30 天", granularity: "day" as const, from: shiftDay(today, -29), to: today },
        month: {
          label: "本月",
          granularity: "day" as const,
          from: `${today.slice(0, 7)}-01`,
          to: today,
        },
        "12m": {
          label: "近 12 个月",
          granularity: "month" as const,
          from: shiftDay(today, -364),
          to: today,
        },
      }) satisfies Record<
        PresetKey,
        { label: string; granularity: "day" | "month"; from: string; to: string }
      >,
    [today],
  );

  const active = presets[presetKey];
  const rangeQuery = buildQuery({ from: active.from, to: active.to });

  const summary = useApiQuery<SummaryResult>(`/api/stats/summary${rangeQuery}`);
  const trend = useApiQuery<TrendResponse>(
    `/api/stats/trend${buildQuery({
      from: active.from,
      to: active.to,
      granularity: active.granularity,
    })}`,
  );
  const breakdown = useApiQuery<CategoryBreakdownResponse>(
    `/api/stats/by-category${buildQuery({ from: active.from, to: active.to, kind: "expense" })}`,
  );

  const points = trend.data?.points ?? [];
  const items = breakdown.data?.items ?? [];
  const hasTrendData = points.some((point) => point.incomeCents > 0 || point.expenseCents > 0);

  if (summary.error) {
    return (
      <EmptyBlock
        title="统计加载失败"
        description={summary.error}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              summary.reload();
              trend.reload();
              breakdown.reload();
            }}
          >
            重试
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-lg font-semibold">收支统计</h1>
        <div className="flex flex-wrap gap-2">
          {PRESET_KEYS.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={key === presetKey ? "default" : "outline"}
              onClick={() => setPresetKey(key)}
            >
              {presets[key].label}
            </Button>
          ))}
        </div>
      </header>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="收入" value={money(summary.data?.incomeCents ?? 0)} tone="income" />
          <Metric label="支出" value={money(summary.data?.expenseCents ?? 0)} tone="expense" />
          <Metric label="结余" value={money(summary.data?.netCents ?? 0)} />
          <Metric label="笔数" value={`${summary.data?.transactionCount ?? 0}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{active.granularity === "month" ? "月度收支走势" : "每日收支走势"}</CardTitle>
        </CardHeader>
        <CardContent>
          {trend.loading ? (
            <LoadingBlock label="正在生成走势…" />
          ) : trend.error ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{trend.error}</p>
          ) : !hasTrendData ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              该区间内还没有收支记录
            </p>
          ) : (
            <ChartContainer config={TREND_CONFIG} className="aspect-auto h-56 w-full">
              <AreaChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-incomeCents)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-incomeCents)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="fillExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-expenseCents)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-expenseCents)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                  tickFormatter={(value: string) =>
                    active.granularity === "month" ? monthLabel(value) : axisDay(value)
                  }
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
                      indicator="line"
                      labelFormatter={(value) =>
                        active.granularity === "month"
                          ? monthLabel(String(value))
                          : String(value)
                      }
                      formatter={(value) => money(Number(value))}
                    />
                  }
                />
                <Area
                  dataKey="incomeCents"
                  type="monotone"
                  fill="url(#fillIncome)"
                  stroke="var(--color-incomeCents)"
                  strokeWidth={2}
                />
                <Area
                  dataKey="expenseCents"
                  type="monotone"
                  fill="url(#fillExpense)"
                  stroke="var(--color-expenseCents)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>支出结构</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {breakdown.loading ? (
            <LoadingBlock label="正在汇总分类…" />
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              该区间内没有支出记录
            </p>
          ) : (
            <>
              <ChartContainer
                config={{ amountCents: { label: "支出" } } satisfies ChartConfig}
                className="mx-auto aspect-square h-56"
              >
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value) => money(Number(value))}
                      />
                    }
                  />
                  <Pie
                    data={items}
                    dataKey="amountCents"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {items.map((item) => (
                      <Cell key={item.categoryId ?? item.name} fill={item.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <div key={item.categoryId ?? item.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.transactionCount} 笔</span>
                    <span className="font-mono tabular-nums">{money(item.amountCents)}</span>
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </>
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
        className={cn(
          "font-mono tabular-nums",
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
          tone === "expense" && "text-rose-600 dark:text-rose-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}