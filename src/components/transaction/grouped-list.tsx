"use client";

import { useMemo } from "react";
import { TransactionRow } from "@/components/transaction-row";
import type { TransactionDto } from "@/lib/api";
import { relativeDayLabel } from "@/lib/dates";
import { dayLabel, money } from "@/lib/format";

/**
 * 账目列表：按自然日分组，组头右侧给出当日小计。
 *
 * 分组只依赖后端已按时间倒序返回的顺序，前端的职责仅是「切段 + 求和」，
 * 所以同一笔账在列表里的相对顺序始终与接口一致。
 */
export function GroupedList({
  items,
  onSelect,
}: {
  items: TransactionDto[];
  onSelect?: (transaction: TransactionDto) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, TransactionDto[]>();
    for (const item of items) {
      const bucket = map.get(item.happenedOn);
      if (bucket) bucket.push(item);
      else map.set(item.happenedOn, [item]);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([day, list]) => {
        const expenseCents = list.reduce(
          (sum, item) => (item.kind === "expense" ? sum + item.amountCents : sum),
          0,
        );
        const incomeCents = list.reduce(
          (sum, item) => (item.kind === "income" ? sum + item.amountCents : sum),
          0,
        );
        const relative = relativeDayLabel(day);

        return (
          <section key={day} className="flex flex-col">
            <header className="flex items-center justify-between gap-3 px-1 pb-1 text-xs text-muted-foreground">
              <span>
                {dayLabel(day)}
                {relative ? ` ${relative}` : ""}
              </span>
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
                  grouped
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
