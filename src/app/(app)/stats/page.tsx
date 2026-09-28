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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildQuery,
  type CategoryBreakdownResponse,
  type CategoryDto,
  type SummaryResult,
  type TagDto,
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

/** Radix Select 不允许空字符串 value，用哨兵值表示「全部」 */
const ALL = "__all__";

const TIME_MODES = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "year", label: "今年" },
  { value: "pickMonth", label: "选月份" },
  { value: "custom", label: "自定义" },
] as const;
type TimeMode = (typeof TIME_MODES)[number]["value"];

const DIMENSIONS = [
  { value: "category", label: "按分类" },
  { value: "tag", label: "按标签" },
] as const;
type Dimension = (typeof DIMENSIONS)[number]["value"];

/**
 * 统计页。
 *
 * 三个接口各司其职：summary 出结论数字、trend 出走势、by-category 出结构。
 * 时间范围支持「本周 / 本月 / 今年」预设，以及按月份或自定义区间查询；
 * 结构图可按数据类型、分类、标签筛选，并在分类与标签两种聚合维度间切换。
 */
export default function StatsPage() {
  const today = todayInBusinessTimezone();

  const [mode, setMode] = useState<TimeMode>("month");
  const [monthValue, setMonthValue] = useState(today.slice(0, 7));
  const [customFrom, setCustomFrom] = useState(shiftDay(today, -29));
  const [customTo, setCustomTo] = useState(today);

  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [dimension, setDimension] = useState<Dimension>("category");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");

  const range = useMemo(() => {
    if (mode === "week") {
      // 以周一为一周起点：getUTCDay() 的 0 表示周日，需整体前移 6 天计算偏移。
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      return {
        from: shiftDay(today, -((weekday + 6) % 7)),
        to: today,
        granularity: "day" as const,
      };
    }
    if (mode === "year") {
      return { from: `${today.slice(0, 4)}-01-01`, to: today, granularity: "month" as const };
    }
    if (mode === "pickMonth") {
      const month = monthValue || today.slice(0, 7);
      const [year, mon] = month.split("-").map(Number);
      // Date.UTC 的 day=0 即上个月最后一天，正好是该月的自然天数。
      const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
      return {
        from: `${month}-01`,
        to: `${month}-${String(lastDay).padStart(2, "0")}`,
        granularity: "day" as const,
      };
    }
    if (mode === "custom") {
      return { from: customFrom, to: customTo, granularity: "day" as const };
    }
    return { from: `${today.slice(0, 7)}-01`, to: today, granularity: "day" as const };
  }, [mode, today, monthValue, customFrom, customTo]);

  const summary = useApiQuery<SummaryResult>(
    `/api/stats/summary${buildQuery({
      from: range.from,
      to: range.to,
      categoryId,
      tagId,
    })}`,
  );
  const trend = useApiQuery<TrendResponse>(
    `/api/stats/trend${buildQuery({
      from: range.from,
      to: range.to,
      granularity: range.granularity,
      categoryId,
      tagId,
    })}`,
  );
  const breakdown = useApiQuery<CategoryBreakdownResponse>(
    `/api/stats/by-category${buildQuery({
      from: range.from,
      to: range.to,
      kind,
      dimension,
      categoryId,
      tagId,
    })}`,
  );

  const points = trend.data?.points ?? [];
  const items = breakdown.data?.items ?? [];
  const hasTrendData = points.some((point) => point.incomeCents > 0 || point.expenseCents > 0);
  const kindLabel = kind === "income" ? "收入" : "支出";
  const activeItem = activeIndex === null ? undefined : items[activeIndex];

  // 已选中的分类即使与当前数据类型不符也要保留在下拉框中，避免选项失配。
  const categoryOptions = (categories.data?.items ?? []).filter(
    (item) => item.kind === kind || item.id === categoryId,
  );

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
          {TIME_MODES.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={item.value === mode ? "default" : "outline"}
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {mode === "pickMonth" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="statsMonth">选择月份</Label>
            <Input
              id="statsMonth"
              type="month"
              value={monthValue}
              onChange={(event) => setMonthValue(event.target.value)}
            />
          </div>
        ) : null}
        {mode === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="statsFrom">开始日期</Label>
              <Input
                id="statsFrom"
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="statsTo">结束日期</Label>
              <Input
                id="statsTo"
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </div>
          </div>
        ) : null}
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>数据类型</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as "expense" | "income")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>统计维度</Label>
              <Select
                value={dimension}
                onValueChange={(value) => setDimension(value as Dimension)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>分类</Label>
              <Select
                value={categoryId || ALL}
                onValueChange={(value) => setCategoryId(value === ALL ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部分类</SelectItem>
                  {categoryOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>标签</Label>
              <Select value={tagId || ALL} onValueChange={(value) => setTagId(value === ALL ? "" : value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部标签</SelectItem>
                  {(tags.data?.items ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
          <CardTitle>{range.granularity === "month" ? "月度收支走势" : "每日收支走势"}</CardTitle>
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
                    range.granularity === "month" ? monthLabel(value) : axisDay(value)
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
                        range.granularity === "month" ? monthLabel(String(value)) : String(value)
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
          <CardTitle>
            {kindLabel}结构 · {dimension === "tag" ? "按标签" : "按分类"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {breakdown.loading ? (
            <LoadingBlock label="正在汇总…" />
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              该区间内没有{kindLabel}记录
            </p>
          ) : (
            <>
              <div className="relative mx-auto aspect-square h-56">
                <ChartContainer
                  config={{ amountCents: { label: kindLabel } } satisfies ChartConfig}
                  className="h-full w-full"
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
                      onMouseEnter={(_data, index) => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      onClick={(_data, index) => setActiveIndex(index)}
                    >
                      {items.map((item, index) => (
                        <Cell
                          key={item.id ?? item.name}
                          fill={item.color}
                          fillOpacity={activeIndex === null || activeIndex === index ? 1 : 0.3}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center">
                  {activeItem ? (
                    <>
                      <span className="max-w-[6.5rem] truncate text-xs text-muted-foreground">
                        {activeItem.name}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {money(activeItem.amountCents)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {activeItem.percentage}% · {activeItem.transactionCount} 笔
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">{kindLabel}合计</span>
                      <span className="font-mono font-medium tabular-nums">
                        {money(breakdown.data?.totalCents ?? 0)}
                      </span>
                      <span className="text-xs text-muted-foreground">点击扇区查看明细</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <button
                    key={item.id ?? item.name}
                    type="button"
                    onClick={() => setActiveIndex(activeIndex === index ? null : index)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-sm transition-colors",
                      activeIndex === index && "bg-muted/60",
                    )}
                  >
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
                  </button>
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
