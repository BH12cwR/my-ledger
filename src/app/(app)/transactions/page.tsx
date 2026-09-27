"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { TransactionRow } from "@/components/transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, buildQuery, errorMessage, type Paginated, type TransactionDto } from "@/lib/api";
import { todayInBusinessTimezone } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const PAGE_SIZE = 20;
type KindFilter = "all" | "expense" | "income";

/**
 * 账目明细。
 *
 * 筛选条件全部通过查询串下发给 /api/transactions，服务端负责过滤与分页，
 * 前端不做任何本地全量拉取，保证数据量增长后依然稳定。
 */
export default function TransactionsPage() {
  const router = useRouter();
  const today = todayInBusinessTimezone();

  const [kind, setKind] = useState<KindFilter>("all");
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<TransactionDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  const path = useMemo(
    () =>
      `/api/transactions${buildQuery({
        kind: kind === "all" ? undefined : kind,
        from,
        to,
        keyword,
        page,
        pageSize: PAGE_SIZE,
      })}`,
    [kind, from, to, keyword, page],
  );

  const query = useApiQuery<Paginated<TransactionDto>>(path);
  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 0;

  /** 任何筛选条件变化都要把页码重置回第一页，否则会停留在越界页码上 */
  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  async function handleDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      await api.delete(`/api/transactions/${target.id}`);
      toast.success("已删除该笔记录");
      setTarget(null);
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-heading text-lg font-semibold">账目明细</h1>
        <Button asChild size="sm">
          <Link href="/transactions/new">记一笔</Link>
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <Tabs
            value={kind}
            onValueChange={(value) => updateFilter(() => setKind(value as KindFilter))}
          >
            <TabsList className="w-full">
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="expense">支出</TabsTrigger>
              <TabsTrigger value="income">收入</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">开始日期</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(event) => updateFilter(() => setFrom(event.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">结束日期</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(event) => updateFilter(() => setTo(event.target.value))}
              />
            </div>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter(() => setKeyword(keywordDraft.trim()));
            }}
          >
            <Input
              value={keywordDraft}
              maxLength={50}
              placeholder="搜索备注或分类名称"
              onChange={(event) => setKeywordDraft(event.target.value)}
            />
            <Button type="submit" variant="secondary">
              <Search />
              搜索
            </Button>
          </form>
        </CardContent>
      </Card>

      {query.loading ? (
        <LoadingBlock label="正在加载流水…" />
      ) : query.error ? (
        <EmptyBlock
          title="加载失败"
          description={query.error}
          action={
            <Button variant="outline" size="sm" onClick={query.reload}>
              重试
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyBlock title="没有符合条件的记录" description="试着放宽日期范围或清空搜索词" />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col divide-y divide-border/60">
              {items.map((item) => (
                <TransactionRow
                  key={item.id}
                  transaction={item}
                  onClick={() => setTarget(item)}
                />
              ))}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-muted-foreground">
              共 {query.data?.total ?? 0} 笔 · 第 {query.data?.page ?? 1} / {Math.max(totalPages, 1)} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ArrowLeft />
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
                <ArrowRight />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : setTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.categoryName ?? "账目详情"}</DialogTitle>
            <DialogDescription>
              {target ? `${target.happenedOn} · ${money(target.amountCents)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {target ? (
            <div className="flex flex-col gap-2 text-sm">
              <Row label="类型" value={target.kind === "income" ? "收入" : "支出"} />
              <Row label="金额" value={money(target.amountCents)} />
              <Row label="账户" value={target.accountName ?? "未指定"} />
              <Row label="备注" value={target.note ?? "无"} />
              <Row label="标签" value={target.tags.length > 0 ? target.tags.join("、") : "无"} />
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2 />
              删除
            </Button>
            <Button
              onClick={() => {
                if (!target) return;
                router.push(`/transactions/new?id=${target.id}`);
              }}
            >
              <Pencil />
              编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right">{value}</span>
    </div>
  );
}