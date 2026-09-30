"use client";

import { Loader2, PackageOpen, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 统一的居中加载态，避免每个页面各写一套 */
export function LoadingBlock({ label = "加载中…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/**
 * 列表骨架屏：用占位行替代居中转圈。
 *
 * 三个版式分别对齐三种真实行，否则数据到达时会有一次可见跳动：
 *  * `rows`（默认）：流水行 —— 无边框、`size-2.5` 类型色点、`px-1 py-2.5`；
 *  * `avatars`：资产 / 账户行 —— 无边框、36px 图标圆；
 *  * `cards`：设置页那类「带边框 + 36px 图标圆」的管理行。
 */
export function ListSkeleton({
  rows = 3,
  variant = "rows",
}: {
  rows?: number;
  variant?: "rows" | "avatars" | "cards";
}) {
  const bordered = variant === "cards";
  const avatar = variant === "avatars";
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center rounded-xl",
            bordered
              ? "gap-3 border border-border/60 px-3 py-2"
              : cn("gap-2.5 px-1 py-2.5", avatar && "gap-3"),
          )}
        >
          <div
            className={
              avatar || bordered
                ? "size-9 shrink-0 animate-pulse rounded-full bg-muted"
                : "size-2.5 shrink-0 animate-pulse rounded-full bg-muted"
            }
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-muted" />
            <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-3 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * 空状态与错误状态共用一套布局，靠 tone 区分语义：
 * 空态是中性提示（还没数据），错误态是危险提示（数据没取到）。
 */
export function EmptyBlock({
  title,
  description,
  action,
  icon,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center ${
        danger ? "border-destructive/40 bg-destructive/5" : "border-border/70"
      }`}
    >
      <span
        className={`mb-1 inline-flex size-10 items-center justify-center rounded-full ${
          danger ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        }`}
      >
        {icon ?? <PackageOpen className="size-5" />}
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * 加载失败态：给出错误原因与重试入口。
 *
 * 多请求页面（如统计页）可在 onRetry 里一次性重载全部相关查询。
 */
export function ErrorBlock({
  title = "加载失败",
  description,
  onRetry,
  retryLabel = "重试",
}: {
  title?: string;
  description?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <EmptyBlock
      tone="danger"
      title={title}
      description={description ?? undefined}
      icon={<TriangleAlert className="size-5" />}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * 「轻量内联态」：图表区、抽屉里那种「一小行提示」。
 *
 * `EmptyBlock` 管的是整块留白，这里管的是嵌在图表 / 卡片里的一行字 ——
 * 之前这段类名在 8 处无数据提示、6 处错误提示里各写了一遍。
 * 间距交给调用方（`className="py-6"`），避免和默认值打架。
 */
export function InlineEmpty({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={cn("text-center text-xs text-muted-foreground", className)}>{children}</p>
  );
}

export function InlineError({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn("text-center text-xs text-destructive", className)}>{children}</p>;
}
