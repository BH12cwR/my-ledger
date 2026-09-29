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
 * 月份导航 + 日历网格 + 今天/昨天/前天快捷，底部取消 / 确定。
 */
export function CalendarPicker({
  value,
  onConfirm,
  onCancel,
}: {
  /** 当前选中日期 YYYY-MM-DD */
  value: string;
  onConfirm: (day: string) => void;
  onCancel: () => void;
}) {
  const today = todayInBusinessTimezone();
  const [cursor, setCursor] = useState(() => monthOf(value));
  const [selected, setSelected] = useState(value);

  const firstWeekday = weekdayOf(`${cursor}-01`);
  const total = daysInMonth(cursor);
  const cells: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, index) => `${cursor}-${String(index + 1).padStart(2, "0")}`),
  ];

  function jumpTo(day: string) {
    setSelected(day);
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
              onClick={() => setSelected(day)}
              className={cn(
                "rounded-lg py-1.5 text-sm tabular-nums transition-colors",
                day === selected
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
                selected === day && "border-blue-500 text-blue-600 dark:text-blue-400",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          取消
        </Button>
        <Button className="flex-1" onClick={() => onConfirm(selected)}>
          确定
        </Button>
      </div>
    </div>
  );
}
