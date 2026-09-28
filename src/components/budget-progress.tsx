"use client";

import { Progress } from "@/components/ui/progress";
import type { BudgetPeriod } from "@/server/db/types";

/** 预算周期的中文短标签：本月 / 本年 */
export function budgetPeriodLabel(period: BudgetPeriod): string {
  return period === "yearly" ? "本年" : "本月";
}

/**
 * 预算进度条：按用量切换颜色（<80% 绿、80~100% 琥珀、超支红），
 * 并钳制到 100% 以内，避免超支时进度条出现反向偏移。
 */
export function BudgetProgress({ percentage, className }: { percentage: number; className?: string }) {
  const tone =
    percentage >= 100 ? "bg-rose-500" : percentage >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return <Progress value={Math.min(percentage, 100)} indicatorClassName={tone} className={className} />;
}
