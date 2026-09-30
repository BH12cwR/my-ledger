"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CategoryBadge } from "@/components/category-icon";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyBlock, ErrorBlock, ListSkeleton } from "@/components/layout/states";
import { TransactionDetailSheet } from "@/components/transaction/detail-sheet";
import { GroupedList } from "@/components/transaction/grouped-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HeroCard } from "@/components/ui/hero-card";
import { METRIC_GRID_CLASS, MetricCell } from "@/components/ui/metric-cell";
import {
  api,
  buildQuery,
  errorMessage,
  type AccountBalanceItem,
  type Paginated,
  type TransactionDto,
  type TransactionsSummary,
} from "@/lib/api";
import { accountTypeLabel } from "@/lib/account-types";
import { money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const ACCOUNTS_PATH = "/api/stats/accounts?includeArchived=true";
const PAGE_SIZE = 50;

/**
 * 账户明细（资产 Tab 的二级页）。
 *
 * 与 `/assets` 的分工：那边按类型罗列全部账户、负责「看总额」，
 * 这里只看单个账户 —— 余额、累计收支与全部流水。
 *
 * 流水与汇总共用 `accountId` 一个条件，因此「共 N 笔」与列表行数始终一致；
 * 该条件在服务端同时覆盖转出与转入，才能和余额的双向下账口径对得上。
 */
export default function AccountDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const accountId = params?.id ?? "";

  const accounts = useApiQuery<{ items: AccountBalanceItem[] }>(ACCOUNTS_PATH);
  const account = (accounts.data?.items ?? []).find((item) => item.id === accountId) ?? null;
  // 账户字典到齐前不发流水请求：否则可能在账户不存在时先取一次无意义的数据
  const ready = accounts.data !== null;

  const summaryPath = ready
    ? `/api/transactions/summary${buildQuery({ accountId })}`
    : null;
  const listPath = ready
    ? `/api/transactions${buildQuery({ accountId, page: 1, pageSize: PAGE_SIZE })}`
    : null;

  const summary = useApiQuery<TransactionsSummary>(summaryPath);
  const list = useApiQuery<Paginated<TransactionDto>>(listPath);

  // 翻页状态：page 为 0 表示「只有首屏那一页」
  const [extra, setExtra] = useState<{ page: number; items: TransactionDto[] }>({
    page: 0,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransactionDto | null>(null);

  // 换账户即清空已追加的页，否则上一个账户的流水会串进来
  useEffect(() => {
    setExtra((prev) => (prev.page === 0 && prev.items.length === 0 ? prev : { page: 0, items: [] }));
    setMoreError(null);
  }, [listPath]);

  const firstPageItems = list.data?.items ?? [];
  const items = extra.page === 0 ? firstPageItems : [...firstPageItems, ...extra.items];
  const loadedPages = extra.page === 0 ? 1 : extra.page;
  const hasMore = loadedPages < (list.data?.totalPages ?? 1);

  /** 删除 / 退款后重新取数：已追加的分页内容已失效，一并清掉只保留首屏 */
  function refreshAll() {
    setExtra({ page: 0, items: [] });
    setMoreError(null);
    summary.reload();
    list.reload();
    accounts.reload();
  }

  async function loadMore() {
    const nextPage = extra.page === 0 ? 2 : extra.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await api.get<Paginated<TransactionDto>>(
        `/api/transactions${buildQuery({ accountId, page: nextPage, pageSize: PAGE_SIZE })}`,
      );
      setExtra((prev) => ({ page: nextPage, items: [...prev.items, ...result.items] }));
    } catch (cause) {
      setMoreError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={account?.name ?? "账户明细"}
        onBack={() => router.push("/assets")}
        backLabel="返回资产"
      />

      {accounts.loading ? (
        <ListSkeleton rows={3} variant="avatars" />
      ) : accounts.error ? (
        <ErrorBlock title="账户加载失败" description={accounts.error} onRetry={accounts.reload} />
      ) : !account ? (
        <EmptyBlock
          title="账户不存在"
          description="它可能已被删除，返回资产页看看其它账户"
          action={
            <Button variant="outline" size="sm" onClick={() => router.push("/assets")}>
              返回资产
            </Button>
          }
        />
      ) : (
        <>
          <HeroCard
            top={
              <div className="flex items-center gap-2">
                <CategoryBadge icon={account.icon} />
                <span className="text-xs text-white/85">{accountTypeLabel(account.type)}</span>
              </div>
            }
            value={money(account.balanceCents)}
          >
            <p className="mt-3">共 {account.transactionCount} 笔</p>
          </HeroCard>

          <Card>
            <CardHeader>
              <CardTitle>累计汇总</CardTitle>
            </CardHeader>
            <CardContent className={METRIC_GRID_CLASS}>
              <MetricCell
                label="支出"
                value={money(summary.data?.expenseCents)}
                tone="expense"
              />
              <MetricCell label="收入" value={money(summary.data?.incomeCents)} tone="income" />
              <MetricCell label="结余" value={money(summary.data?.netCents)} />
              <MetricCell label="转账" value={money(summary.data?.transferCents)} tone="transfer" />
            </CardContent>
          </Card>

          <section className="flex flex-col gap-3">
            {list.loading ? (
              <ListSkeleton rows={5} />
            ) : list.error ? (
              <ErrorBlock title="流水加载失败" description={list.error} onRetry={list.reload} />
            ) : items.length === 0 ? (
              <EmptyBlock title="该账户还没有流水" description="从「记一笔」里把账户指定为它即可" />
            ) : (
              <>
                <GroupedList
                  items={items}
                  groupBy="month"
                  showAccount={false}
                  onSelect={setDetail}
                />
                {hasMore ? (
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "加载中…" : "加载更多"}
                  </Button>
                ) : null}
                {moreError ? (
                  <p className="text-center text-xs text-destructive">{moreError}</p>
                ) : null}
              </>
            )}
          </section>
        </>
      )}

      <TransactionDetailSheet
        transaction={detail}
        onOpenChange={(open) => (open ? undefined : setDetail(null))}
        onChanged={refreshAll}
        onEdit={(transaction) => router.push(`/transactions/new?id=${transaction.id}`)}
      />
    </div>
  );
}
