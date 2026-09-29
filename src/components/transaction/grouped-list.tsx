"use client";

import { useMemo } from "react";
import { TransactionRow } from "@/components/transaction-row";
import type { TransactionDto } from "@/lib/api";
import { monthOf, relativeDayLabel } from "@/lib/dates";
import { dayLabel, money, monthLabel } from "@/lib/format";

/**
 * 账目列表：按时间分段，组头右侧给出段内小计。
 *
 * 分组只依赖后端已按时间排好序的顺序，前端的职责仅是「切段 + 求和」，
 * 所以同一笔账在列表里的相对顺序始终与接口一致。
 * 账单页按自然日（组头形如 `09.27 前天`），搜索页按自然月（组头形如 `2026年10月`）。
 */
export function GroupedList({
  items,
  onSelect,
  groupBy = "day",
  showAccount = true,
}: {
  items: TransactionDto[];
  onSelect?: (transaction: TransactionDto) => void;
  /** 分段粒度：`day` 按自然日，`month` 按自然月 */
  groupBy?: "day" | "month";
  /** 整页都是同一个账户时（账户明细页）关掉行内的账户名，避免逐行重复 */
  showAccount?: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, TransactionDto[]>();
    for (const item of items) {
      const key = groupBy === "month" ? monthOf(item.happenedOn) : item.happenedOn;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries());
  }, [items, groupBy]);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([key, list]) => {
        const expenseCents = list.reduce(
          (sum, item) => (item.kind === "expense" ? sum + item.amountCents : sum),
          0,
        );
        const incomeCents = list.reduce(
          (sum, item) => (item.kind === "income" ? sum + item.amountCents : sum),
          0,
        );

        return (
          <section key={key} className="flex flex-col">
            <header className="flex items-center justify-between gap-3 px-1 pb-1 text-xs text-muted-foreground">
              <span>{groupBy === "month" ? monthLabel(key) : dayHeader(key)}</span>
              <span className="flex gap-3 font-mono tabular-nums">
                {expenseCents > 0 ? <span>支:{money(expenseCents, "")}</span> : null}
                {incomeCents > 0 ? <span>收:{money(incomeCents, "")}</span> : null}
              </span>
            </header>
            <div className="flex flex-col divide-y divide-border/60">
              {list.map((item) => (
                <TransactionRow
                  key={item.id}
                  transaction={item}
                  groupBy={groupBy}
                  showAccount={showAccount}
                  onClick={onSelect ? () => onSelect(item) : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** 日分组的组头：`09.27 前天`（相对日只在最近三天出现） */
function dayHeader(day: string): string {
  const relative = relativeDayLabel(day);
  return relative ? `${dayLabel(day)} ${relative}` : dayLabel(day);
}
