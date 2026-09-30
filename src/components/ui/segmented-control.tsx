"use client";

import { cn } from "@/lib/utils";

export type SegmentedItem<T extends string> = {
  value: T;
  label: string;
  /** `tone="type"` 时选中态的类，如 `bg-tone-expense text-white` */
  activeClass?: string;
};

/**
 * 分段控件。
 *
 * 方案 §2.4 早就声明「共用同一套结构」，但实现里长成了 4 种规格 ——
 * 最离谱的是统计页一屏内两个「支出 / 收入」分段，一个 `text-sm` 满宽、
 * 一个 `text-xs` 居中，而它们驱动的还是同一个 state。
 *
 * 两个维度收口：
 *  * `size`：`md` = `text-sm` / 满宽（口径切换）；`sm` = `text-xs`（粒度、视图切换）
 *  * `tone`：`type` = 条目自带的类型色实底（支出 rose / 收入 emerald / 转账 blue）；
 *            `neutral` = 白底胶囊（月 / 年这类粒度切换）
 *
 * 这与 §2.4「按场景两套活跃态」的裁决一致，只是不再允许第三种、第四种写法。
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  tone = "type",
  className,
  label,
}: {
  items: ReadonlyArray<SegmentedItem<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  tone?: "type" | "neutral";
  className?: string;
  /** 无障碍名称，如「统计口径」 */
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex gap-1 rounded-xl bg-muted/60 p-1", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-lg font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "flex-1 py-1.5 text-sm",
              active
                ? tone === "type"
                  ? (item.activeClass ?? "bg-brand text-white")
                  : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
