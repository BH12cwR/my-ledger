"use client";

import { Badge } from "@/components/ui/badge";
import { CategoryBadge } from "@/components/category-icon";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionDto } from "@/lib/api";

/**
 * 账目行：首页、明细页与后台监控共用同一套渲染，
 * 保证「一笔账在不同页面看起来是同一条记录」。
 */
export function TransactionRow({
  transaction,
  showUser = false,
  onClick,
}: {
  transaction: TransactionDto;
  showUser?: boolean;
  onClick?: () => void;
}) {
  const isIncome = transaction.kind === "income";
  const title = transaction.categoryName ?? (isIncome ? "收入" : "支出");
  const subtitleParts = [
    transaction.note,
    transaction.accountName,
    showUser ? transaction.userNickname ?? transaction.userId : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors",
        onClick && "hover:bg-muted/60",
      )}
    >
      <CategoryBadge
        icon={transaction.categoryIcon}
        color={transaction.categoryColor ?? (isIncome ? "#22c55e" : "#94a3b8")}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {transaction.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {subtitleParts.length > 0 ? subtitleParts.join(" · ") : transaction.happenedOn}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "font-mono text-sm tabular-nums",
            isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
          )}
        >
          {isIncome ? "+" : "-"}
          {money(transaction.amountCents)}
        </p>
        <p className="text-[11px] text-muted-foreground">{transaction.happenedOn.slice(5)}</p>
      </div>
    </button>
  );
}