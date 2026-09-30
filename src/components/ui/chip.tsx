"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 可选中的小胶囊：筛选入口、日期快捷、标签、排序键都用它。
 *
 * 之前同一个概念有三种圆角（`rounded-full` / `rounded-xl`）与三种内边距 ——
 * 最典型的是筛选页的日期快捷项，跟搜索页的筛选胶囊长得完全不一样。
 * 现在统一 `rounded-full`，只有两档尺寸：
 *  * `md`：带图标（`px-3 py-1.5`）
 *  * `sm`：纯文字（`px-2.5 py-1`）
 *
 * 需要渲染成 `<Link>` 时用 `chipClass()` 取同一套类名。
 */
export type ChipSize = "md" | "sm";

export function chipClass({
  size = "md",
  active = false,
  className,
}: {
  size?: ChipSize;
  active?: boolean;
  className?: string;
} = {}) {
  return cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors",
    size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-xs",
    active
      ? "border-brand bg-brand/10 text-brand-text"
      : "border-border/60 text-muted-foreground hover:bg-muted/60",
    className,
  );
}

export function Chip({
  size = "md",
  active = false,
  icon,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "children"> & {
  size?: ChipSize;
  active?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <button type="button" className={chipClass({ size, active, className })} {...props}>
      {icon}
      {children}
    </button>
  );
}
