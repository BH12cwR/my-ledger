"use client";

import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 汇总卡的单元格：搜索汇总与账户明细共用。
 *
 * 金额不带货币符号 —— 窄栏里更省空间，整卡顶部已给出「共 N 笔」的语境。
 */
export function SummaryCell({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number | undefined;
  tone?: "income" | "expense" | "transfer";
}) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate font-mono tabular-nums",
          tone === "income" && "text-emerald-600 dark:text-emerald-400",
          tone === "expense" && "text-rose-600 dark:text-rose-400",
          tone === "transfer" && "text-blue-600 dark:text-blue-400",
        )}
      >
        {money(cents ?? 0, "")}
      </p>
    </div>
  );
}
