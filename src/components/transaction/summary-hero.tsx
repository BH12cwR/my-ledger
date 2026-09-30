"use client";

import type { SummaryResult } from "@/lib/api";
import { HeroCard } from "@/components/ui/hero-card";
import { money } from "@/lib/format";

/**
 * 账单页顶部的结余大卡。
 *
 * 壳与配色走 `HeroCard`（资产页与账户明细页共用同一套），这里只补底部
 * 「月收入 / 月支出」两栏 —— 标题由调用方给出，按月是「2026年9月结余」，
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
    <HeroCard label={label} value={money(summary?.netCents ?? 0)}>
      <div className="mt-4 flex flex-wrap items-center gap-6">
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
    </HeroCard>
  );
}
