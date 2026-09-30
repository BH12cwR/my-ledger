"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryBadge } from "@/components/category-icon";
import { EmptyBlock, ErrorBlock, ListSkeleton } from "@/components/layout/states";
import { HeroCard } from "@/components/ui/hero-card";
import type { AccountBalanceItem } from "@/lib/api";
import { money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const ACCOUNTS_PATH = "/api/stats/accounts?includeArchived=true";

/** 账户分组顺序与「我的 → 账户」里的类型选项保持一致 */
const GROUP_ORDER = [
  { type: "cash", label: "现金" },
  { type: "bank", label: "银行卡" },
  { type: "wechat", label: "微信" },
  { type: "alipay", label: "支付宝" },
  { type: "credit", label: "信用卡" },
  { type: "other", label: "其他" },
] as const;

/**
 * 资产页：账户余额总览。
 *
 * 余额由服务端聚合（初始余额 + 收支净额 + 转账双向），前端只负责合计与按类型分组，空组不渲染。
 * 点账户进入 `/assets/[id]` 看该账户的收支与流水；账户的增删改仍留在「我的 → 账户」，
 * 两处职责分开，避免同一套管理逻辑维护两遍。
 *
 * 这是 Tab 根页、首屏就是数据卡，因此标题只做无障碍用途（`sr-only`），不加一行占位标题。
 */
export default function AssetsPage() {
  const query = useApiQuery<{ items: AccountBalanceItem[] }>(ACCOUNTS_PATH);
  const items = query.data?.items ?? [];
  const totalCents = items.reduce((sum, item) => sum + item.balanceCents, 0);

  const groups = GROUP_ORDER.map((group) => ({
    ...group,
    items: items.filter((item) => item.type === group.type),
  })).filter((group) => group.items.length > 0);

  if (query.loading) return <ListSkeleton rows={5} variant="avatars" />;

  if (query.error) {
    return <ErrorBlock title="资产加载失败" description={query.error} onRetry={query.reload} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">资产</h1>

      <HeroCard label="总资产" value={money(totalCents)}>
        <p className="mt-3">{items.length} 个账户</p>
      </HeroCard>

      {groups.length === 0 ? (
        <EmptyBlock title="还没有账户" description="先在「我的 → 账户」里添加一个账户" />
      ) : (
        groups.map((group) => (
          <section key={group.type} className="flex flex-col gap-1">
            <h2 className="px-1 text-xs text-muted-foreground">{group.label}</h2>
            <div className="flex flex-col divide-y divide-border/60">
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/assets/${item.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-muted/60"
                >
                  <CategoryBadge icon={item.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.transactionCount} 笔
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {money(item.balanceCents)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
