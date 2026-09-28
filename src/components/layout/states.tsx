"use client";

import { Loader2, PackageOpen } from "lucide-react";

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
 * 骨架与真实列表行高度接近，数据到达时不会产生明显跳动。
 */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-3"
        >
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-muted" />
            <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-3 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** 空状态：列表没数据时给出明确的下一步指引 */
export function EmptyBlock({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-12 text-center">
      <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
