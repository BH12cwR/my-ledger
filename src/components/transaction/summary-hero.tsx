"use client";

import type { SummaryResult } from "@/lib/api";
import { money } from "@/lib/format";

/**
 * 账单页顶部的结余大卡。
 *
 * 配色刻意不走 --primary（主题里是近黑色），改用蓝色渐变压住视觉重心。
 * 金额左对齐（跟设计稿）；标题由调用方给出 —— 按月是「2026年9月结余」，
 * 按年是「2026年结余」，全部是「累计结余」。
 */
export function SummaryHero({
  label,
  summary,
  incomeLabel = "月收入",
  expenseLabel = "月支出",
}: {
  /** 卡片左上角的标题，如「2026年9月结余」 */
  label: string;
  summary: SummaryResult | null;
  /** 底部两项的文案；按月是「月收入 / 月支出」，按年与全部时换掉「月」字 */
  incomeLabel?: string;
  expenseLabel?: string;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-sm">
      <p className="text-xs text-white/80">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight">
        {money(summary?.netCents ?? 0)}
      </p>
      <div className="mt-4 flex items-center gap-6 text-xs text-white/85">
        <span>
          {incomeLabel}:
          <span className="ml-1 font-mono tabular-nums text-white">
            {money(summary?.incomeCents ?? 0)}
          </span>
        </span>
        <span>
          {expenseLabel}:
          <span className="ml-1 font-mono tabular-nums text-white">
            {money(summary?.expenseCents ?? 0)}
          </span>
        </span>
      </div>
    </div>
  );
}
