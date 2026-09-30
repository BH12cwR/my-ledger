"use client";

import { cn } from "@/lib/utils";

/** 指标格里的语义色：只有「收支类型」才上色，其余保持默认前景色 */
export type MetricTone = "income" | "expense" | "transfer";

const TONE_CLASS: Record<MetricTone, string> = {
  income: "text-tone-income-text",
  expense: "text-tone-expense-text",
  transfer: "text-tone-transfer-text",
};

/**
 * 「标签 + 金额」的小格子。
 *
 * 合并了原来的三份实现：`transaction/summary-cell.tsx`（搜索汇总、账户明细）、
 * 分类详情页私有的 `Metric`、统计页私有的 `OverviewCell` —— 前两者逐字重复，
 * 第三个只是去掉了底色改成居中。
 *
 * 两种版式：
 *  * `box`（默认）：灰底格子，用于卡片内的 2 列指标网格；
 *  * `plain`：无底色、居中、值更大，用于统计页「收支总览」。
 *
 * 金额一律**带 ¥**：同一个网格里还有「总笔数」这种纯数字，
 * 不带符号的话「1,234.00」和笔数分不出来。
 */
export function MetricCell({
  label,
  value,
  tone,
  variant = "box",
  className,
}: {
  label: string;
  /** 已格式化的值（金额请用 `money(cents)`，保留 ¥） */
  value: string;
  tone?: MetricTone;
  variant?: "box" | "plain";
  className?: string;
}) {
  const toneClass = tone ? TONE_CLASS[tone] : undefined;

  if (variant === "plain") {
    return (
      <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("font-mono text-lg tabular-nums", toneClass)}>{value}</span>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg bg-muted/60 px-3 py-2", className)}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("truncate font-mono text-sm tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

/** 指标网格的共用容器：2 列、`gap-3`；条目数为奇数时由调用方给末项加 `col-span-2` */
export const METRIC_GRID_CLASS = "grid grid-cols-2 gap-3";
