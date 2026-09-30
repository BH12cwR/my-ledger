"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

/**
 * 日期抽屉「变体 B」：记账页选具体某一天。
 * 月份导航 + 日历网格 + 今天/昨天/前天快捷。
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

  const firstWeekday = weekdayOf(`${cursor}-01`);
  const total = daysInMonth(cursor);
  const cells: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, index) => `${cursor}-${String(index + 1).padStart(2, "0")}`),
  ];

  function jumpTo(day: string) {
    onSelect(day);
    setCursor(monthOf(day));
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
        <span className="text-sm font-medium">{monthLabel(cursor)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="下个月"
          onClick={() => setCursor((month) => shiftMonth(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

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
