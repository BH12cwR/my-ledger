"use client";

import { CategoryBadge } from "@/components/category-icon";
import { ChangeBadge } from "./change-badge";
import type { CategoryBreakdownItem } from "@/lib/api";
import { money } from "@/lib/format";

/**
 * 分类排行：图标 + 名称 + 占比 + 环比徽章 + 金额 + 占比进度条。
 *
 * 进度条宽度取占比（上限 100，避免极端情况下溢出圆角容器），颜色沿用分类色。
 * 未分类 / 未打标签的行没有 id，这类行不可点击（没有可跳转的详情页）。
 */
export function CategoryRank({
  items,
  onSelect,
}: {
  items: CategoryBreakdownItem[];
  onSelect?: (item: CategoryBreakdownItem) => void;
}) {
  return (
    <div className="flex flex-col divide-y divide-border/60">
      {items.map((item) => {
        const clickable = Boolean(onSelect && item.id);

        return (
          <button
            key={item.id ?? item.name}
            type="button"
            disabled={!clickable}
            onClick={() => {
              if (clickable) onSelect?.(item);
            }}
            className={
              clickable
                ? "flex items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-muted/60"
                : "flex items-center gap-3 px-1 py-2.5 text-left"
            }
          >
            <CategoryBadge icon={item.icon} color={item.color} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{item.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {item.percentage}%
                </span>
                <ChangeBadge
                  currentCents={item.amountCents}
                  previousCents={item.previousAmountCents}
                />
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(item.percentage, 100)}%`,
                    backgroundColor: item.color,
                  }}
                  aria-hidden
                />
              </div>
            </div>

            <span className="shrink-0 font-mono text-sm tabular-nums">
              {money(item.amountCents)}
            </span>
          </button>
        );
      })}
    </div>
  );
}