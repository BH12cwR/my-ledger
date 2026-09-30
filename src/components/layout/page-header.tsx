"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 页面标题区。
 *
 * 收敛掉之前 5 种写法：账单页那种「按钮当标题 + 右侧图标组」、二级页的
 * 「返回 + h1 + 右侧控件」、后台的三种 `justify-between` 变体、以及设置页
 * 那个连 header 都没有的裸 `<h1>`。
 *
 * - `title` 是 `h1` 的内容。账单页传的是月份选择按钮 —— 那里「标题」本来就是当前区间。
 * - 「记一笔」是唯一例外：它是全屏模态，没有标题只有 X + 分段控件，因此不用本组件
 *   （见 §2.7 的例外条款），但仍需自带 `sr-only` 的 `h1`。
 */
export function PageHeader({
  title,
  onBack,
  backLabel = "返回",
  actions,
  subtitle,
  className,
}: {
  /** h1 的内容 */
  title: React.ReactNode;
  /** 传了才渲染返回箭头；二级页一律用 `←` */
  onBack?: () => void;
  backLabel?: string;
  /** 标题右侧的控件组，自动靠右 */
  actions?: React.ReactNode;
  /** 标题下方的一行说明 */
  subtitle?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <Button variant="ghost" size="icon-sm" aria-label={backLabel} onClick={onBack}>
            <ArrowLeft />
          </Button>
        ) : null}
        <div className="min-w-0">
          <h1 className="min-w-0 truncate text-lg font-semibold">{title}</h1>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}
