"use client";

import type { TrendPoint } from "@/lib/api";
import { money, weekdayLabel } from "@/lib/format";

/**
 * 近七日支出柱状图。
 *
 * 后端按日返回时已补齐空日期，所以这里固定渲染 7 根柱；
 * 0 值柱保留占位并显示 0.00，避免柱数随数据变化而跳动。
 * 柱子是支出，沿用项目的「支出用 rose」约定。
 */
export function WeeklyBars({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((point) => point.expenseCents), 0);

  return (
    <div className="flex items-end justify-between gap-2">
      {points.map((point) => {
        const height = max > 0 ? Math.round((point.expenseCents / max) * 100) : 0;
        return (
          <div key={point.day} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {money(point.expenseCents, "")}
            </span>
            <div className="flex h-28 w-full items-end justify-center">
              <div
                className="w-3.5 rounded-t-md bg-tone-expense/85"
                style={{ height: `${height}%` }}
                aria-hidden
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{weekdayLabel(point.day)}</span>
          </div>
        );
      })}
    </div>
  );
}
