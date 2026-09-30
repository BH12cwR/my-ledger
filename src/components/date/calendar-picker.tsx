"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  daysInMonth,
  monthOf,
  shiftDay,
  shiftMonth,
  todayInBusinessTimezone,
  weekdayOf,
} from "@/lib/dates";
import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const QUICK_DAYS = [
  { label: "今天", delta: 0 },
  { label: "昨天", delta: -1 },
  { label: "前天", delta: -2 },
];

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** 月份标题下拉里横滑的年份：当前年的前后各两年 */
const YEAR_SPAN = [2, 1, 0, -1, -2];

/**
 * 日期抽屉「变体 B」：记账页选具体某一天。
 * 月份导航（可下拉跳月）+ 日历网格 + 今天/昨天/前天快捷。
 *
 * 「取消 / 确定」不在这里 —— 它们由 `CalendarSheet` 放在抽屉标题行右侧（跟设计稿），
 * 本组件只负责「显示哪一天」与「选了哪一天」。抽屉每次打开都会重新挂载，
 * 因此这里的月份游标天然从传入的 value 重新起算。
 */
export function CalendarPicker({
  value,
  onSelect,
}: {
  /** 当前选中的日期，受控 */
  value: string;
  onSelect: (day: string) => void;
}) {
  const today = todayInBusinessTimezone();
  const [cursor, setCursor] = useState(() => monthOf(value));
  /** 月份标题的下拉：只改「正在浏览的月份」，不动已选日期 */
  const [pickerOpen, setPickerOpen] = useState(false);

  const cursorYear = Number(cursor.slice(0, 4));
  const cursorMonth = cursor.slice(5);
  const years = YEAR_SPAN.map((delta) => cursorYear + delta);

  const firstWeekday = weekdayOf(`${cursor}-01`);
  const total = daysInMonth(cursor);
  const cells: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, index) => `${cursor}-${String(index + 1).padStart(2, "0")}`),
  ];

  function jumpTo(day: string) {
    onSelect(day);
    setCursor(monthOf(day));
    setPickerOpen(false);
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="上个月"
          onClick={() => setCursor((month) => shiftMonth(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          aria-label="选择年月"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium transition-colors hover:bg-muted/60"
        >
          {monthLabel(cursor)}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              pickerOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="下个月"
          onClick={() => setCursor((month) => shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      {pickerOpen ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 p-2">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                // 换年份时保留当前月份，避免跳到 1 月又要重新找回月份
                onClick={() => setCursor(`${year}-${cursorMonth}`)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm tabular-nums transition-colors",
                  year === cursorYear ? "bg-blue-500 text-white" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {year}年
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((month) => {
              const key = `${cursorYear}-${String(month).padStart(2, "0")}`;
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => {
                    setCursor(key);
                    setPickerOpen(false);
                  }}
                  className={cn(
                    "rounded-lg border py-2 text-sm transition-colors",
                    key === cursor
                      ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-border/60 hover:bg-muted/60",
                  )}
                >
                  {month}月
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((label) => (
          <span key={label} className="py-1 text-[11px] text-muted-foreground">
            {label}
          </span>
        ))}
        {cells.map((day, index) =>
          day === null ? (
            <span key={`blank-${index}`} />
          ) : (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              className={cn(
                "rounded-lg py-1.5 text-sm tabular-nums transition-colors",
                day === value
                  ? "bg-blue-500 text-white"
                  : day === today
                    ? "text-blue-600 dark:text-blue-400"
                    : "hover:bg-muted",
              )}
            >
              {Number(day.slice(8, 10))}
            </button>
          ),
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {QUICK_DAYS.map((item) => {
          const day = shiftDay(today, item.delta);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => jumpTo(day)}
              className={cn(
                "rounded-xl border border-border/60 py-2 text-xs transition-colors hover:bg-muted/60",
                value === day && "border-blue-500 text-blue-600 dark:text-blue-400",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
