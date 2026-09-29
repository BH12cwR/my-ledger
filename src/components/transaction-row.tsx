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
  groupBy = "none",
  showAccount = true,
  onClick,
}: {
  transaction: TransactionDto;
  showUser?: boolean;
  /**
   * 分组粒度，决定日期与账户名各自出现在哪里：
   *  - `none`：不分组，副标题放备注 · 账户，金额下方放日期；
   *  - `day`：按日分组，日期已由组头给出，行内不再重复，账户名移到金额下方；
   *  - `month`：按月分组，组头只有年月，行内必须保留日期（`09-27 快递费`）。
   */
  groupBy?: "none" | "day" | "month";
  /**
   * 是否在金额下方重复账户名。账户明细页里整页都是同一个账户，
   * 逐行重复只是噪音，那里会关掉它。
   */
  showAccount?: boolean;
  onClick?: () => void;
}) {
  const isIncome = transaction.kind === "income";
  const isTransfer = transaction.kind === "transfer";
  // 转账没有分类，用「转出 → 转入」代替分类名，一眼看清方向
  const title = isTransfer
    ? transaction.accountName && transaction.toAccountName
      ? `${transaction.accountName} → ${transaction.toAccountName}`
      : "转账"
    : transaction.categoryName ?? (isIncome ? "收入" : "支出");
  // 只有不分组时账户名才挤在副标题里，分组场景一律移到金额下方
  const accountInline = groupBy === "none";
  const subtitleParts = [
    groupBy === "month" ? transaction.happenedOn : null,
    transaction.note,
    // 转账的账户名已并入标题，普通账目才在副标题重复账户
    isTransfer || !accountInline ? null : transaction.accountName,
    showUser ? transaction.userNickname ?? transaction.userId : null,
  ].filter((part): part is string => Boolean(part));
  const subtitle = subtitleParts.join(" · ");
  // 移动端一行放不下太多标签，最多展示 2 个，其余折叠为 +N
  const visibleTags = transaction.tags.slice(0, 2);
  const hiddenTagCount = transaction.tags.length - visibleTags.length;
  const refunded = !isIncome && transaction.refundedAt !== null;
  const amountTone = isTransfer
    ? "text-blue-600 dark:text-blue-400"
    : isIncome
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

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
        color={
          transaction.categoryColor ??
          (isTransfer ? "#3b82f6" : isIncome ? "#22c55e" : "#94a3b8")
        }
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          {visibleTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
              {tag}
            </Badge>
          ))}
          {hiddenTagCount > 0 ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">+{hiddenTagCount}</span>
          ) : null}
          {transaction.refundOfId ? (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              退款
            </Badge>
          ) : null}
          {refunded ? (
            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
              已退款
            </Badge>
          ) : null}
        </div>
        {subtitle.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : groupBy === "none" ? (
          <p className="truncate text-xs text-muted-foreground">{transaction.happenedOn}</p>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("font-mono text-sm tabular-nums", amountTone)}>
          {isTransfer ? "" : isIncome ? "+" : "-"}
          {money(transaction.amountCents)}
        </p>
        {groupBy === "none" ? (
          <p className="text-[11px] text-muted-foreground">{transaction.happenedOn.slice(5)}</p>
        ) : showAccount && transaction.accountName && !isTransfer ? (
          <p className="text-[11px] text-muted-foreground">{transaction.accountName}</p>
        ) : null}
      </div>
    </button>
  );
}