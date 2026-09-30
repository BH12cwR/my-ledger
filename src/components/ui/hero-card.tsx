"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 顶部的品牌渐变大卡。
 *
 * 账单页结余、资产总览、账户明细三处共用同一个壳 —— 之前这段
 * `rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-sm`
 * 在三个文件里各写了一遍，而且金额一处左对齐、两处居中。
 *
 * 现在统一：**金额左对齐、副文案统一 `text-white/85`**（跟月结余卡的设计稿）。
 * `children` 里的边距与对齐由调用方自己给，因为三处的底部内容本来就不同。
 */
export function HeroCard({
  label,
  value,
  top,
  children,
  className,
}: {
  /** 左上角小标题，如「2026年9月结余」「总资产」；传 null 表示不渲染 */
  label?: string | null;
  /** 主金额（已格式化） */
  value: string;
  /** 标题上方的附加行，如账户明细的「图标 + 账户类型」 */
  top?: React.ReactNode;
  /** 金额下方的补充内容 */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-br from-brand to-brand-strong p-5 text-white shadow-sm",
        className,
      )}
    >
      {top}
      {label ? (
        <p className={cn("text-xs text-white/85", top ? "mt-3" : undefined)}>{label}</p>
      ) : null}
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {children ? <div className="text-xs text-white/85">{children}</div> : null}
    </div>
  );
}
