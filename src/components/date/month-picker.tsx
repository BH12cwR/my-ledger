"use client";

import { useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { MAX_MONTH_START_DAY, type BillRangeMode } from "@/lib/dates";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const START_DAYS = Array.from({ length: MAX_MONTH_START_DAY }, (_, index) => index + 1);

/** 「显示方式」三选；图标取自设计稿（日历 / 跨年月 / 层叠） */
const MODES: Array<{ value: BillRangeMode; label: string; icon: LucideIcon }> = [
  { value: "month", label: "按月", icon: CalendarDays },
  { value: "year", label: "按年", icon: CalendarRange },
  { value: "all", label: "全部", icon: Layers },
];

/**
 * 日期抽屉「变体 A」：账单页按账期选择。
 *
 * 两种用法共用本组件：
 *  * 账单页传 `onModeChange`：「显示方式」三选 + 月份起始日 + 年份横滑 + 月份 4×3 网格；
 *    切到「按年」只留年份（点年份即选中），切到「全部」不需要选择、只给一句说明。
 *  * 统计页不传 `onModeChange`，退回纯月份选择 —— 它自己有「月 / 年」分段，不需要这里的开关。
 *
 * 点月份 / 年份即提交并关闭抽屉；改「显示方式」与「月份起始日」只改口径本身，不关抽屉。
 */
export function MonthPicker({
  value,
  onSelect,
  monthStartDay,
  onMonthStartDayChange,
  mode = "month",
  onModeChange,
}: {
  /** 当前账期月份 YYYY-MM（按年模式只用它的年份部分） */
  value: string;
  onSelect: (month: string) => void;
  monthStartDay: number;
  onMonthStartDayChange: (day: number) => void;
  mode?: BillRangeMode;
  /** 传了才渲染「显示方式」，不传即退回纯月份选择 */
  onModeChange?: (mode: BillRangeMode) => void;
}) {
  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7));
  const [activeYear, setActiveYear] = useState(selectedYear);
  const [startDayOpen, setStartDayOpen] = useState(false);
  // 以选中月份所在年份为基准前后各留几年，列表本身保持稳定（切换年份不会整行重排）
  const years = Array.from({ length: 7 }, (_, index) => selectedYear + 1 - index);

  return (
    <div className="flex flex-col gap-4 pb-1">
      {onModeChange ? (
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onModeChange(item.value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs transition-colors",
                  active
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "border-border/60 text-muted-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {mode === "all" ? (
        <p className="rounded-xl bg-muted/60 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          查看全部账目，不受月份与年份限制。
        </p>
      ) : (
        <>
          {mode === "month" ? (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
                <span className="text-sm text-muted-foreground">月份起始日</span>
                <button
                  type="button"
                  onClick={() => setStartDayOpen((open) => !open)}
                  aria-expanded={startDayOpen}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-sm tabular-nums transition-colors hover:bg-background"
                >
                  {String(monthStartDay).padStart(2, "0")}
                  <ChevronRight
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      startDayOpen && "rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
              </div>

              {startDayOpen ? (
                <div className="grid max-h-40 grid-cols-7 gap-1 overflow-y-auto rounded-xl border border-border/60 p-2">
                  {START_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => onMonthStartDayChange(day)}
                      className={cn(
                        "rounded-lg py-1.5 font-mono text-xs tabular-nums transition-colors",
                        day === monthStartDay ? "bg-blue-500 text-white" : "hover:bg-muted",
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
            {years.map((year) => {
              // 按月模式高亮的是「正在浏览的年份」，按年模式高亮的是「已选中的年份」
              const active = mode === "year" ? year === selectedYear : year === activeYear;
              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => {
                    setActiveYear(year);
                    if (mode === "year") onSelect(`${year}-01`);
                  }}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm tabular-nums transition-colors",
                    active ? "bg-blue-500 text-white" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {year}年
                </button>
              );
            })}
          </div>

          {mode === "month" ? (
            <div className="grid grid-cols-4 gap-2">
              {MONTHS.map((month) => {
                const active = activeYear === selectedYear && month === selectedMonth;
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => onSelect(`${activeYear}-${String(month).padStart(2, "0")}`)}
                    className={cn(
                      "relative rounded-xl border py-2.5 text-sm transition-colors",
                      active
                        ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "border-border/60 hover:bg-muted/60",
                    )}
                  >
                    {month}月
                    {active ? <Check className="absolute top-1 right-1 size-3 text-blue-500" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
