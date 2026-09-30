"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, LayoutGrid, List } from "lucide-react";
import { CategoryBadge } from "@/components/category-icon";
import { ListSkeleton } from "@/components/layout/states";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/hooks";
import type { AccountBalanceItem } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACCOUNTS_PATH = "/api/stats/accounts?includeArchived=true";

/**
 * 扣款 / 转入账户抽屉（稿 8）。
 *
 * 只在打开时拉取余额，避免记账页每次都多一次请求；首项固定为「不选择账户」。
 * 标题右侧两个动作：列表 / 网格视图切换，以及「添加」——
 * 后者跳到「我的 → 账户」，账户的增删改只在那一个地方维护（§3.9 的展示 / 管理边界）。
 */
export function AccountSheet({
  open,
  onOpenChange,
  value,
  onSelect,
  title = "选择扣款账户",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  onSelect: (accountId: string | null) => void;
  /** 转账时同一抽屉连开两次，用标题区分「转出 / 转入」 */
  title?: string;
}) {
  const query = useApiQuery<{ items: AccountBalanceItem[] }>(open ? ACCOUNTS_PATH : null);
  const items = query.data?.items ?? [];
  const [grid, setGrid] = useState(false);

  function pick(accountId: string | null) {
    onSelect(accountId);
    onOpenChange(false);
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        title={title}
        headerAction={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={grid ? "切换为列表视图" : "切换为网格视图"}
              aria-pressed={grid}
              onClick={() => setGrid((current) => !current)}
            >
              {grid ? <List /> : <LayoutGrid />}
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings">添加</Link>
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "flex items-center justify-between rounded-xl px-2 py-3 text-left text-sm transition-colors hover:bg-muted/60",
              value === null && "text-blue-600 dark:text-blue-400",
            )}
          >
            <span>不选择账户</span>
            {value === null ? <Check className="size-4" /> : null}
          </button>

          {query.loading ? (
            <ListSkeleton rows={3} />
          ) : grid ? (
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-xs transition-colors hover:bg-muted/60",
                    value === item.id && "bg-blue-500/10",
                  )}
                >
                  <CategoryBadge icon={item.icon} />
                  <span className="w-full truncate text-center font-medium">{item.name}</span>
                  <span className="w-full truncate text-center font-mono text-[11px] tabular-nums text-muted-foreground">
                    {money(item.balanceCents)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60",
                    value === item.id && "bg-blue-500/10",
                  )}
                >
                  <CategoryBadge icon={item.icon} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {money(item.balanceCents)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
