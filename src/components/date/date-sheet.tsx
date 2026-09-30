"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import type { BillRangeMode } from "@/lib/dates";
import { CalendarPicker } from "./calendar-picker";
import { MonthPicker } from "./month-picker";

/**
 * 日期选择抽屉的两种外壳：账单页用按月（MonthSheet），记账页用按日（CalendarSheet）。
 * 二者共用同一个 BottomSheet 壳，只是内容不同。
 */
export function MonthSheet({
  open,
  onOpenChange,
  value,
  onSelect,
  monthStartDay,
  onMonthStartDayChange,
  mode,
  onModeChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSelect: (month: string) => void;
  monthStartDay: number;
  onMonthStartDayChange: (day: number) => void;
  /** 传了 `onModeChange` 才渲染「显示方式」三选（账单页用；统计页不传） */
  mode?: BillRangeMode;
  onModeChange?: (mode: BillRangeMode) => void;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="选择日期">
        <MonthPicker
          value={value}
          onSelect={(month) => {
            onSelect(month);
            onOpenChange(false);
          }}
          monthStartDay={monthStartDay}
          onMonthStartDayChange={onMonthStartDayChange}
          mode={mode}
          onModeChange={onModeChange}
        />
      </BottomSheetContent>
    </BottomSheet>
  );
}

export function CalendarSheet({
  open,
  onOpenChange,
  value,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onConfirm: (day: string) => void;
}) {
  // 抽屉里的「待确认日期」：点选只改这里，按「确定」才真正回写。
  // 每次打开都以外部传入的 value 重新起算，避免上次翻到的月份残留。
  const [picked, setPicked] = useState(value);
  useEffect(() => {
    if (open) setPicked(value);
  }, [open, value]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title="选择日期"
        showCloseButton={false}
        headerAction={
          <>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onConfirm(picked);
                onOpenChange(false);
              }}
            >
              确定
            </Button>
          </>
        }
      >
        <CalendarPicker value={picked} onSelect={setPicked} />
      </BottomSheetContent>
    </BottomSheet>
  );
}
