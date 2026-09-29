"use client";

import { CategoryBadge } from "@/components/category-icon";
import { EmptyBlock, ErrorBlock, ListSkeleton } from "@/components/layout/states";
import { accountTypeLabel } from "@/lib/account-types";
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
 * 余额由服务端聚合（初始余额 + 收支净额），前端只负责合计与按类型分组，空组不渲染。
 */
export default function AssetsPage() {
  const query = useApiQuery<{ items: AccountBalanceItem[] }>(ACCOUNTS_PATH);
  const items = query.data?.items ?? [];
  const totalCents = items.reduce((sum, item) => sum + item.balanceCents, 0);

  const groups = GROUP_ORDER.map((group) => ({
    ...group,
    items: items.filter((item) => item.type === group.type),
  })).filter((group) => group.items.length > 0);

  if (query.loading) return <ListSkeleton rows={5} />;

  if (query.error) {
    return <ErrorBlock title="资产加载失败" description={query.error} onRetry={query.reload} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 p-5 text-white shadow-sm">
        <p className="text-xs text-white/80">总资产</p>
        <p className="mt-3 text-center font-mono text-3xl font-semibold tabular-nums tracking-tight">
          {money(totalCents)}
        </p>
        <p className="mt-2 text-center text-xs text-white/85">{items.length} 个账户</p>
      </div>

      {groups.length === 0 ? (
        <EmptyBlock title="还没有账户" description="先在「我的 → 账户」里添加一个账户" />
      ) : (
        groups.map((group) => (
          <section key={group.type} className="flex flex-col gap-1">
            <h2 className="px-1 text-xs text-muted-foreground">{group.label}</h2>
            <div className="flex flex-col divide-y divide-border/60">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-1 py-2.5">
                  <CategoryBadge icon={item.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {accountTypeLabel(item.type)} · {item.transactionCount} 笔
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {money(item.balanceCents)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
