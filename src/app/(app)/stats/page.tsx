"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from "recharts";
import {
  ArrowLeft,
  CalendarDays,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";
import { BillListSheet } from "@/components/stats/bill-list-sheet";
import { CategoryRank } from "@/components/stats/category-rank";
import { MonthSheet } from "@/components/date/date-sheet";
import { ErrorBlock, LoadingBlock } from "@/components/layout/states";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
import {
  periodMonthOf,
  resolveMonthRange,
  shiftMonth,
  todayInBusinessTimezone,
} from "@/lib/dates";
import { money, monthLabel } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";
import { useMonthStartDay } from "@/lib/month-start-day";
import { cn } from "@/lib/utils";

const TREND_CONFIG = {
  incomeCents: { label: "收入", color: "#10b981" },
  expenseCents: { label: "支出", color: "#f43f5e" },
} satisfies ChartConfig;

/** 环形图最多渲染几个环外标签，超出后靠下方排行榜看全量，避免标签互相压字 */
const MAX_RING_LABELS = 6;

const GRANULARITIES = [
  { value: "month", label: "月" },
  { value: "year", label: "年" },
] as const;
type Granularity = (typeof GRANULARITIES)[number]["value"];

const KINDS = [
  { value: "expense", label: "支出", activeClass: "bg-rose-500 text-white" },
  { value: "income", label: "收入", activeClass: "bg-emerald-500 text-white" },
  { value: "all", label: "全部", activeClass: "bg-blue-500 text-white" },
] as const;
type StatsKind = (typeof KINDS)[number]["value"];

const DIMENSIONS = [
  { value: "category", label: "按分类" },
  { value: "tag", label: "按标签" },
] as const;
type Dimension = (typeof DIMENSIONS)[number]["value"];

/** Radix Select 不允许空字符串 value，用哨兵值表示「全部」 */
const ALL = "__all__";

/** 坐标轴上的金额压缩为「元」，避免出现一长串 0 */
function axisMoney(cents: number): string {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10000) return `${(yuan / 10000).toFixed(1)}万`;
  return yuan.toFixed(0);
}

/**
 * 统计页（稿 4）。
 *
 * 顶部「月 / 年」决定粒度：月按账期（受「月份起始日」影响）取整月，年取整年。
 * 「支出 / 收入 / 全部」决定口径，「全部」为收支合并（仅结构占比与排行有意义，
 * 环形图在「全部」下固定看支出）。
 * 环比由服务端在同一次请求里返回上一同长度周期（决策 5），前端不发第二次请求。
 */
export default function StatsPage() {
  const router = useRouter();
  const today = todayInBusinessTimezone();
  const [monthStartDay, setMonthStartDay] = useMonthStartDay();

  const [granularity, setGranularity] = useState<Granularity>("month");
  // 用户手动选过月份后固定住，避免起始日异步加载完成时把默认月份改回去
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const [year, setYear] = useState(() => today.slice(0, 4));

  const [kind, setKind] = useState<StatsKind>("expense");
  const [dimension, setDimension] = useState<Dimension>("category");
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  /** 「收支总览」五项指标是否收起（跟设计稿的折叠箭头） */
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  /** 点开环形图扇区后弹出「账单列表」抽屉的分类 id */
  const [billList, setBillList] = useState<string | null>(null);
  // 悬停与锁定分开管理：悬停移开即恢复，锁定需显式点击（触摸端不触发 mouseleave）
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);

  const month = monthOverride ?? periodMonthOf(today, monthStartDay);
  const range = useMemo(
    () =>
      granularity === "month"
        ? resolveMonthRange(month, monthStartDay)
        : { from: `${year}-01-01`, to: `${year}-12-31` },
    [granularity, month, monthStartDay, year],
  );
  const trendGranularity = granularity === "month" ? ("day" as const) : ("month" as const);

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");

  const filterQuery = { from: range.from, to: range.to, categoryId, tagId };

  const summary = useApiQuery<SummaryResult>(
    `/api/stats/summary${buildQuery({ ...filterQuery, compare: 1 })}`,
  );
  const trend = useApiQuery<TrendResponse>(
    `/api/stats/trend${buildQuery({
      ...filterQuery,
      granularity: trendGranularity,
    })}`,
  );
  const breakdownPath = `/api/stats/by-category${buildQuery({
    ...filterQuery,
    kind,
    dimension,
    compare: 1,
  })}`;
  // 「全部」下环形图仍需要单一类型，另取一次支出口径；其它情况下与排行榜共用同一份数据
  const ringQueryPath =
    kind === "all"
      ? `/api/stats/by-category${buildQuery({
          ...filterQuery,
          kind: "expense",
          dimension: "category",
          compare: 1,
        })}`
      : null;

  const breakdown = useApiQuery<CategoryBreakdownResponse>(breakdownPath);
  const ringQuery = useApiQuery<CategoryBreakdownResponse>(ringQueryPath);

  const ringData = kind === "all" ? ringQuery.data : breakdown.data;
  const ringItems = ringData?.items ?? [];

  // 换区间/口径后扇区已经换了，索引会指向另一条数据，必须清掉选中态
  useEffect(() => {
    setHoverIndex(null);
    setPinnedIndex(null);
  }, [breakdownPath, ringQueryPath]);

  const activeIndex = hoverIndex ?? pinnedIndex;
  const activeItem = activeIndex === null ? undefined : ringItems[activeIndex];

  const points = trend.data?.points ?? [];
  const hasTrendData = points.some((point) => point.incomeCents > 0 || point.expenseCents > 0);
  const kindLabel = kind === "income" ? "收入" : "支出";
  // 「日收支统计」的柱子跟随整页口径；「全部」下与环形图保持一致，固定看支出
  const trendKey = kind === "income" ? "incomeCents" : "expenseCents";
  const trendColor = kind === "income" ? "#10b981" : "#f43f5e";
  /** X 轴：按日时只给「日号」（跟设计稿的 1 / 5 / 9…），按月时给「YYYY年M月」 */
  const trendTick = (value: string) =>
    trendGranularity === "month" ? monthLabel(value) : String(Number(value.slice(8, 10)));

  // 已选中的分类即使与当前口径不符也要保留在下拉框中，避免选项失配
  const categoryOptions = (categories.data?.items ?? []).filter(
    (item) => kind === "all" || item.kind === kind || item.id === categoryId,
  );
  const filterCount = (categoryId ? 1 : 0) + (tagId ? 1 : 0) + (dimension === "tag" ? 1 : 0);

  function step(delta: number) {
    if (granularity === "month") {
      setMonthOverride(shiftMonth(month, delta));
      return;
    }
    setYear((current) => String(Number(current) + delta));
  }

  // summary 是整页骨架，等它到齐再渲染，避免先画 ¥0.00 再跳变
  if (summary.loading) return <LoadingBlock label="正在汇总收支…" />;

  if (summary.error) {
    return (
      <ErrorBlock
        title="统计加载失败"
        description={summary.error}
        onRetry={() => {
          summary.reload();
          trend.reload();
          breakdown.reload();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="返回" onClick={() => router.push("/")}>
          <ArrowLeft />
        </Button>
        <h1 className="font-heading text-lg font-semibold">统计</h1>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
            {GRANULARITIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setGranularity(item.value)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  granularity === item.value
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="筛选"
            onClick={() => setFilterOpen(true)}
            className={cn(filterCount > 0 && "text-blue-600 dark:text-blue-400")}
          >
            <SlidersHorizontal />
          </Button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon-sm" aria-label="上一期" onClick={() => step(-1)}>
          <ChevronLeft />
        </Button>
        <button
          type="button"
          onClick={() => {
            if (granularity === "month") setSheetOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:bg-muted/60"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {granularity === "month" ? monthLabel(month) : `${year}年`}
        </button>
        <Button variant="ghost" size="icon-sm" aria-label="下一期" onClick={() => step(1)}>
          <ChevronRight />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>收支总览</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {summaryCollapsed ? null : (
            <div className="grid w-full grid-cols-2 gap-4">
              <OverviewCell label="支出" value={money(summary.data?.expenseCents ?? 0)} />
              <OverviewCell label="收入" value={money(summary.data?.incomeCents ?? 0)} />
              <OverviewCell label="结余" value={money(summary.data?.netCents ?? 0)} />
              <OverviewCell label="日均支出" value={money(summary.data?.dailyAverageCents ?? 0)} />
              <OverviewCell
                label="转账"
                value={money(summary.data?.transferCents ?? 0)}
                className="col-span-2"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setSummaryCollapsed((collapsed) => !collapsed)}
            aria-expanded={!summaryCollapsed}
            aria-label={summaryCollapsed ? "展开收支总览" : "收起收支总览"}
            className="inline-flex w-24 items-center justify-center rounded-lg bg-muted/60 py-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <ChevronUp
              className={cn("size-4 transition-transform", summaryCollapsed && "rotate-180")}
              aria-hidden
            />
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>日收支统计</CardTitle>
          <CardAction>
            {/* 设计稿的卡头图标没有定义动作，这里如实做成图表类型标识，不假装成按钮 */}
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
              <ChartColumn className="size-4" aria-hidden />
            </span>
          </CardAction>
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
            <ChartContainer config={TREND_CONFIG} className="aspect-auto h-52 w-full">
              <BarChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={16}
                  tickFormatter={trendTick}
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
                        trendGranularity === "month" ? monthLabel(String(value)) : String(value)
                      }
                      formatter={(value) => money(Number(value))}
                    />
                  }
                />
                <Bar dataKey={trendKey} fill={trendColor} radius={2} maxBarSize={10} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
        {KINDS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setKind(item.value)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
              kind === item.value
                ? item.activeClass
                : "text-muted-foreground hover:bg-background/60",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          {/* 稿 10 的卡名就是「分类统计」，不随口径改名 —— 口径已由下方的分段表达 */}
          <CardTitle>分类统计</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {breakdown.loading || ringQuery.loading ? (
            <LoadingBlock label="正在汇总…" />
          ) : ringItems.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              该区间内没有{kind === "all" ? "支出" : kindLabel}记录
            </p>
          ) : (
            <>
              <div className="relative mx-auto h-64 w-full max-w-xs">
                <ChartContainer
                  config={{ amountCents: { label: "金额" } } satisfies ChartConfig}
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
                      data={ringItems}
                      dataKey="amountCents"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={72}
                      paddingAngle={2}
                      strokeWidth={0}
                      label={renderRingLabel}
                      onMouseEnter={(_data, index) => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                      onClick={(_data, index) => {
                        const item = ringItems[index];
                        // 未分类的扇区没有 id，筛不出对应流水，只做高亮
                        if (item?.id) setBillList(item.id);
                        setPinnedIndex((current) => (current === index ? null : index));
                      }}
                    >
                      {ringItems.map((item, index) => (
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
                      <span className="text-xs text-muted-foreground">总计</span>
                      <span className="font-mono font-medium tabular-nums">
                        {money(ringData?.totalCents ?? 0)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-center gap-1 rounded-xl bg-muted/60 p-1">
                {KINDS.slice(0, 2).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setKind(item.value)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                      (kind === "all" ? "expense" : kind) === item.value
                        ? item.activeClass
                        : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dimension === "tag" ? "标签排行" : "分类排行"}</CardTitle>
        </CardHeader>
        <CardContent>
          {breakdown.loading ? (
            <LoadingBlock label="正在汇总…" />
          ) : (breakdown.data?.items ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              该区间内没有{kind === "all" ? "" : kindLabel}记录
            </p>
          ) : (
            <CategoryRank
              items={breakdown.data?.items ?? []}
              onSelect={
                dimension === "category"
                  ? (item) => {
                      if (!item.id) return;
                      router.push(`/stats/category/${item.id}`);
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      <MonthSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        value={month}
        onSelect={setMonthOverride}
        monthStartDay={monthStartDay}
        onMonthStartDayChange={setMonthStartDay}
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
                  setCategoryId("");
                  setTagId("");
                  setDimension("category");
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
          <div className="flex flex-col gap-4 pt-1">
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
              <Select
                value={tagId || ALL}
                onValueChange={(value) => setTagId(value === ALL ? "" : value)}
              >
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
        </BottomSheetContent>
      </BottomSheet>

      <BillListSheet
        open={billList !== null}
        onOpenChange={(next) => {
          if (!next) setBillList(null);
        }}
        categoryId={billList}
        // 「全部」口径下环形图固定看支出，账单列表跟着同一口径才不会对不上
        kind={kind === "income" ? "income" : "expense"}
        from={range.from}
        to={range.to}
        onChanged={() => {
          summary.reload();
          breakdown.reload();
          ringQuery.reload();
        }}
        onEdit={(transaction) => router.push(`/transactions/new?id=${transaction.id}`)}
      />
    </div>
  );
}

/** 环外标签：分类名 + 百分比；只画前几个，其余靠排行榜看全量 */
function renderRingLabel(props: PieLabelRenderProps) {
  const index = props.index;
  if (typeof index === "number" && index >= MAX_RING_LABELS) return null;

  const percent = typeof props.percent === "number" ? props.percent : 0;
  const x = Number(props.x);
  const cx = Number(props.cx);

  return (
    <text
      x={x}
      y={Number(props.y)}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      className="fill-muted-foreground text-[10px]"
    >
      {`${String(props.name ?? "")} ${(percent * 100).toFixed(2)}%`}
    </text>
  );
}

/** 「收支总览」的一格：标签在上、数值在下，整格居中（跟设计稿） */
function OverviewCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums">{value}</span>
    </div>
  );
}