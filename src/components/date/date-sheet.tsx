"use client";

import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSelect: (month: string) => void;
  monthStartDay: number;
  onMonthStartDayChange: (day: number) => void;
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
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title="选择日期">
        <CalendarPicker
          value={value}
          onConfirm={(day) => {
            onConfirm(day);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </BottomSheetContent>
    </BottomSheet>
  );
}
