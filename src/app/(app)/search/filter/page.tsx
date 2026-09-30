"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { CategoryBadge } from "@/components/category-icon";
import { ListSkeleton } from "@/components/layout/states";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CategoryDto, TransactionDateRange } from "@/lib/api";
import {
  detectRangePreset,
  resolveRangePreset,
  todayInBusinessTimezone,
  type DetectedRangePreset,
  type RangePreset,
} from "@/lib/dates";
import { useApiQuery } from "@/lib/hooks";
import { useMonthStartDay } from "@/lib/month-start-day";
import {
  EMPTY_SEARCH_FILTERS,
  readSearchFilters,
  searchFilterQuery,
  type SearchFilters,
} from "@/lib/search-filters";
import { cn } from "@/lib/utils";

/** 快捷日期项；`data` 的文案由数据跨度动态生成，单独拼装 */
const FIXED_PRESETS: Array<{ preset: RangePreset; label: string }> = [
  { preset: "all", label: "全部" },
  { preset: "thisMonth", label: "本月" },
  { preset: "lastMonth", label: "上月" },
  { preset: "thisYear", label: "今年" },
  { preset: "lastYear", label: "去年" },
];

/**
 * 自定义筛选（稿 7 / 10）。
 *
 * 只管「日期范围 + 分类」两块：类型与关键字归搜索页，避免同一条件在两处各管一半。
 * 点「确定」把整份条件推回搜索页（URL 查询串即状态），因此从搜索页进来的原有类型、
 * 关键字、排序都会被原样带回去。
 * 无多账本前提下，「账本成员」「选择账本」两块整体不渲染（决策 6）。
 */
export default function SearchFilterPage() {
  const router = useRouter();
  const today = todayInBusinessTimezone();
  const [monthStartDay] = useMonthStartDay();

  const [filters, setFilters] = useState<SearchFilters>(EMPTY_SEARCH_FILTERS);
  const [ready, setReady] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  // 从搜索页带过来的完整条件，确定时原样回写
  useEffect(() => {
    setFilters(readSearchFilters(window.location.search));
    setReady(true);
  }, []);

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  // 数据跨度只用于渲染「2025年~2026年」这枚动态 chip；失败时静默降级为不渲染
  const dataRange = useApiQuery<TransactionDateRange>("/api/transactions/range");

  const presetContext = useMemo(
    () => ({
      today,
      monthStartDay,
      dataFrom: dataRange.data?.firstDay ?? null,
      dataTo: dataRange.data?.lastDay ?? null,
    }),
    [today, monthStartDay, dataRange.data],
  );

  const activePreset: DetectedRangePreset = detectRangePreset(
    filters.from || null,
    filters.to || null,
    presetContext,
  );

  const presets = useMemo(() => {
    const { firstDay, lastDay } = dataRange.data ?? { firstDay: null, lastDay: null };
    const items = [...FIXED_PRESETS];
    if (firstDay && lastDay) {
      const firstYear = firstDay.slice(0, 4);
      const lastYear = lastDay.slice(0, 4);
      items.push({
        preset: "data",
        label: firstYear === lastYear ? `${firstYear}年` : `${firstYear}年~${lastYear}年`,
      });
    }
    return items;
  }, [dataRange.data]);

  const categoryItems = categories.data?.items ?? [];
  const selectedCategory = categoryItems.find((item) => item.id === filters.categoryId) ?? null;

  function pickPreset(preset: RangePreset) {
    const range = resolveRangePreset(preset, presetContext);
    setFilters((current) => ({ ...current, from: range.from ?? "", to: range.to ?? "" }));
  }

  /** 只清空本页负责的两块，类型与关键字仍归搜索页所有 */
  function reset() {
    setFilters((current) => ({ ...current, from: "", to: "", categoryId: "" }));
  }

  function confirm() {
    router.push(`/search${searchFilterQuery(filters)}`);
  }

  if (!ready) return <ListSkeleton rows={3} />;

  return (
    <div className="flex flex-col gap-4 pb-24">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="返回"
          onClick={() => router.push(`/search${searchFilterQuery(filters)}`)}
        >
          <ArrowLeft />
        </Button>
        <h1 className="font-heading text-lg font-semibold">自定义筛选</h1>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
          重置
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>日期范围</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-2">
            {presets.map((item) => (
              <button
                key={item.preset}
                type="button"
                onClick={() => pickPreset(item.preset)}
                className={cn(
                  // 4 列等宽（跟设计稿）：首行 全部/本月/上月/今年，次行 去年 + 跨两列的年份跨度。
                  // 跨列是给「2025年~2026年」这类长标签留位置，否则一行放不下。
                  "overflow-hidden rounded-xl border px-1 py-2 text-xs leading-tight whitespace-nowrap transition-colors",
                  item.preset === "data" && "col-span-2",
                  activePreset === item.preset
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "border-border/60 text-muted-foreground hover:bg-muted/60",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">自定义日期</p>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="开始日期"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, from: event.target.value }))
                }
              />
              <span className="shrink-0 text-muted-foreground">-</span>
              <Input
                type="date"
                aria-label="截止日期"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, to: event.target.value }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>分类</CardTitle>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-muted/60"
          >
            {selectedCategory ? (
              <CategoryBadge icon={selectedCategory.icon} color={selectedCategory.color} />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-sm">
              {selectedCategory?.name ?? "全部分类"}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      {/* 「确定」吸底（跟设计稿）。二级页不挂底部导航，所以不会与导航重叠；
          外面再用 pb-24 给内容留出等高的余量，避免最后一张卡被按钮盖住 */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-2xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button className="w-full" onClick={confirm}>
            确定
          </Button>
        </div>
      </div>

      <BottomSheet open={categoryOpen} onOpenChange={setCategoryOpen}>
        <BottomSheetContent title="选择分类">
          <div className="flex flex-col gap-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setFilters((current) => ({ ...current, categoryId: "" }));
                setCategoryOpen(false);
              }}
              className={cn(
                "rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                !filters.categoryId && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              )}
            >
              全部分类
            </button>
            {categories.loading ? <ListSkeleton rows={3} /> : null}
            {categoryItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setFilters((current) => ({ ...current, categoryId: item.id }));
                  setCategoryOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/60",
                  filters.categoryId === item.id && "bg-blue-500/10",
                )}
              >
                <CategoryBadge icon={item.icon} color={item.color} />
                <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.kind === "income" ? "收入" : "支出"}
                </span>
              </button>
            ))}
          </div>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
