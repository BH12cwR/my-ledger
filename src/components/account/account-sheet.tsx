"use client";

import { Check } from "lucide-react";
import { CategoryBadge } from "@/components/category-icon";
import { ListSkeleton } from "@/components/layout/states";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { accountTypeLabel } from "@/lib/account-types";
import { useApiQuery } from "@/lib/hooks";
import type { AccountBalanceItem } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const ACCOUNTS_PATH = "/api/stats/accounts?includeArchived=true";

/**
 * 扣款 / 转入账户抽屉。
 *
 * 只在打开时拉取余额，避免记账页每次都多一次请求；首项固定为「不选择账户」。
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

  function pick(accountId: string | null) {
    onSelect(accountId);
    onOpenChange(false);
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={title}>
        <div className="flex flex-col gap-1">
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
          ) : (
            items.map((item) => (
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{accountTypeLabel(item.type)}</p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {money(item.balanceCents)}
                </span>
              </button>
            ))
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
