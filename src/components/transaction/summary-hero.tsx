"use client";

import type { SummaryResult } from "@/lib/api";
import { money, monthLabel } from "@/lib/format";

/**
 * 账单页顶部的「月结余」大卡。
 *
 * 配色刻意不走 --primary（主题里是近黑色），改用蓝色渐变压住视觉重心。
 */
export function SummaryHero({
  month,
  summary,
}: {
  /** 账期月份 YYYY-MM */
  month: string;
  summary: SummaryResult | null;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-sm">
      <p className="text-xs text-white/80">{monthLabel(month)}结余</p>
      <p className="mt-3 text-center font-mono text-3xl font-semibold tabular-nums tracking-tight">
        {money(summary?.netCents ?? 0)}
      </p>
      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-white/85">
        <span>
          月收入:
          <span className="ml-1 font-mono tabular-nums text-white">
            {money(summary?.incomeCents ?? 0)}
          </span>
        </span>
        <span>
          月支出:
          <span className="ml-1 font-mono tabular-nums text-white">
            {money(summary?.expenseCents ?? 0)}
          </span>
        </span>
      </div>
    </div>
  );
}
