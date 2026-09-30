"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 环比徽章：本期相对上一同长度周期的差额。
 *
 * 只在拿到上期数据时渲染（`previousCents === null` 表示未请求环比）。
 * 颜色沿用「涨红跌绿」的收支语境：统计页以支出为主要视角，涨为警示。
 */
export function ChangeBadge({
  currentCents,
  previousCents,
  className,
}: {
  currentCents: number;
  previousCents: number | null;
  className?: string;
}) {
  if (previousCents === null) return null;

  const diff = currentCents - previousCents;
  if (diff === 0) {
    return <span className={cn("text-[10px] text-muted-foreground", className)}>持平</span>;
  }

  const up = diff > 0;
  const Icon = up ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums",
        up ? "text-tone-expense-text" : "text-tone-income-text",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {money(Math.abs(diff), "")}
    </span>
  );
}