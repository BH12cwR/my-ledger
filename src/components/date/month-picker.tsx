"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { MAX_MONTH_START_DAY } from "@/lib/dates";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const START_DAYS = Array.from({ length: MAX_MONTH_START_DAY }, (_, index) => index + 1);

/**
 * 日期抽屉「变体 A」：账单页按月选择账期。
 *
 * 由「月份起始日」一行 + 年份横滑 + 月份 4×3 网格组成；
 * 点击月份即提交并关闭抽屉，改动起始日只影响账期口径本身。
 */
export function MonthPicker({
  value,
  onSelect,
  monthStartDay,
  onMonthStartDayChange,
}: {
  /** 当前账期月份 YYYY-MM */
  value: string;
  onSelect: (month: string) => void;
  monthStartDay: number;
  onMonthStartDayChange: (day: number) => void;
}) {
  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7));
  const [activeYear, setActiveYear] = useState(selectedYear);
  const [startDayOpen, setStartDayOpen] = useState(false);
  // 以选中月份所在年份为基准前后各留几年，列表本身保持稳定（切换年份不会整行重排）
  const years = Array.from({ length: 7 }, (_, index) => selectedYear + 1 - index);

  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
        <span className="text-sm text-muted-foreground">月份起始日</span>
        <button
          type="button"
          onClick={() => setStartDayOpen((open) => !open)}
          className="rounded-lg px-2 py-1 font-mono text-sm tabular-nums transition-colors hover:bg-background"
        >
          {String(monthStartDay).padStart(2, "0")}
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

      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => setActiveYear(year)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm tabular-nums transition-colors",
              year === activeYear ? "bg-blue-500 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {year}年
          </button>
        ))}
      </div>

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
    </div>
  );
}
