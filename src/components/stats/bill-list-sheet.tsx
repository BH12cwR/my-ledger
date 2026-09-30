"use client";

import { useEffect, useState } from "react";
import { ArrowUpDown, ChartColumn } from "lucide-react";
import { ListSkeleton, InlineEmpty, InlineError } from "@/components/layout/states";
import { TransactionRow } from "@/components/transaction-row";
import { TransactionDetailSheet } from "@/components/transaction/detail-sheet";
import { BottomSheet, BottomSheetContent } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  api,
  buildQuery,
  errorMessage,
  type Paginated,
  type TransactionDto,
  type TransactionSort,
} from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";

const PAGE_SIZE = 50;

/** 两个排序口径：按时间（业务日）或按金额 */
type BillSortMode = "time" | "amount";

/**
 * 统计页「账单列表」抽屉（稿 11）。
 *
 * 点环形图的扇区弹出，列出该分类在当前统计区间下的账目。
 * 头部两枚胶囊只改接口的 `sort` 参数（时间 / 金额），不在前端重排已分页的结果 ——
 * 否则「加载更多」会把新一页插到错误的位置。
 * 行点击仍走账目详情抽屉，与其余四处列表保持一致。
 */
export function BillListSheet({
  open,
  onOpenChange,
  categoryId,
  kind,
  from,
  to,
  onChanged,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前扇区对应的分类；未分类的扇区没有 id，不会打开本抽屉 */
  categoryId: string | null;
  /** 与环形图一致的单一口径（「全部」时由调用方折算为支出） */
  kind: "expense" | "income";
  from: string;
  to: string;
  /** 删除 / 退款后通知调用方刷新统计口径 */
  onChanged?: () => void;
  /** 详情抽屉里点「编辑」：跳记账页，由调用方提供路由能力 */
  onEdit: (transaction: TransactionDto) => void;
}) {
  const [mode, setMode] = useState<BillSortMode>("time");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  // 每次打开都回到「按时间、由近到远」，避免上一轮的排序残留在新分类上
  useEffect(() => {
    if (!open) return;
    setMode("time");
    setDirection("desc");
  }, [open]);

  const sort: TransactionSort =
    mode === "time" ? direction : direction === "asc" ? "amount_asc" : "amount_desc";

  const filters = { from, to, kind, categoryId: categoryId ?? undefined, sort };
  const listPath =
    open && categoryId
      ? `/api/transactions${buildQuery({ ...filters, page: 1, pageSize: PAGE_SIZE })}`
      : null;

  const list = useApiQuery<Paginated<TransactionDto>>(listPath);

  // 换分类 / 换排序即清空已追加的页，否则旧结果会混进新结果里
  const [extra, setExtra] = useState<{ page: number; items: TransactionDto[] }>({
    page: 0,
    items: [],
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TransactionDto | null>(null);

  useEffect(() => {
    setExtra((prev) => (prev.page === 0 && prev.items.length === 0 ? prev : { page: 0, items: [] }));
    setMoreError(null);
  }, [listPath]);

  const firstPageItems = list.data?.items ?? [];
  const items = extra.page === 0 ? firstPageItems : [...firstPageItems, ...extra.items];
  const loadedPages = extra.page === 0 ? 1 : extra.page;
  const hasMore = loadedPages < (list.data?.totalPages ?? 1);
  const total = list.data?.total;

  function pick(next: BillSortMode) {
    if (next === mode) {
      // 点已经选中的那枚即翻转方向，省一次「再点一次」的交互成本
      setDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setMode(next);
    setDirection("desc");
  }

  async function loadMore() {
    if (!categoryId) return;
    const nextPage = extra.page === 0 ? 2 : extra.page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await api.get<Paginated<TransactionDto>>(
        `/api/transactions${buildQuery({
          from,
          to,
          kind,
          categoryId,
          sort,
          page: nextPage,
          pageSize: PAGE_SIZE,
        })}`,
      );
      setExtra((prev) => ({ page: nextPage, items: [...prev.items, ...result.items] }));
    } catch (cause) {
      setMoreError(errorMessage(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  /** 删除 / 退款后：已追加的分页已失效，清掉只保留首屏，并通知外部刷新统计 */
  function refreshAll() {
    setExtra({ page: 0, items: [] });
    setMoreError(null);
    list.reload();
    onChanged?.();
  }

  return (
    <>
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent
          title={total === undefined ? "账单列表" : `账单列表 (${total})`}
          headerAction={
            <>
              <Chip
                size="sm"
                active={mode === "time"}
                onClick={() => pick("time")}
                icon={<ArrowUpDown className="size-3.5" aria-hidden />}
              >
                时间
                {mode === "time" ? <SortArrow ascending={direction === "asc"} /> : null}
              </Chip>
              <Chip
                size="sm"
                active={mode === "amount"}
                onClick={() => pick("amount")}
                icon={<ChartColumn className="size-3.5" aria-hidden />}
              >
                统计
                {mode === "amount" ? <SortArrow ascending={direction === "asc"} /> : null}
              </Chip>
            </>
          }
        >
          <div className="flex flex-col gap-3 pt-1">
            {list.loading ? (
              <ListSkeleton rows={5} />
            ) : list.error ? (
              <InlineError className="py-6">{list.error}</InlineError>
            ) : items.length === 0 ? (
              <InlineEmpty className="py-6">该分类下还没有记录</InlineEmpty>
            ) : (
              <>
                {/* 不做日期分组：按金额排序时分组会把结果重新按天切碎（分组键是「天」），
                    而且同一分类的账目在抽屉里本来就是一段平铺的清单 */}
                <div className="flex flex-col divide-y divide-border/60">
                  {items.map((item) => (
                    <TransactionRow
                      key={item.id}
                      transaction={item}
                      groupBy="flat"
                      onClick={() => setDetail(item)}
                    />
                  ))}
                </div>
                {hasMore ? (
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "加载中…" : "加载更多"}
                  </Button>
                ) : null}
                {moreError ? <InlineError>{moreError}</InlineError> : null}
              </>
            )}
          </div>
        </BottomSheetContent>
      </BottomSheet>

      <TransactionDetailSheet
        transaction={detail}
        onOpenChange={(next) => (next ? undefined : setDetail(null))}
        onChanged={refreshAll}
        onEdit={(transaction) => {
          // 编辑要跳页，先把两层抽屉都收起来，避免返回时抽屉还挂着
          setDetail(null);
          onOpenChange(false);
          onEdit(transaction);
        }}
      />
    </>
  );
}

/** 排序方向的后缀箭头：只挂在选中的那枚胶囊上，再点一次翻转方向 */
function SortArrow({ ascending }: { ascending: boolean }) {
  return (
    <span className="text-[10px] opacity-80" aria-hidden>
      {ascending ? "↑" : "↓"}
    </span>
  );
}
