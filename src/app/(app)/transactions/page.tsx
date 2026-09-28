"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  buildQuery,
  errorMessage,
  type CategoryDto,
  type Paginated,
  type TagDto,
  type TransactionDto,
} from "@/lib/api";
import { todayInBusinessTimezone } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const PAGE_SIZE = 20;
type KindFilter = "all" | "expense" | "income";

/** Radix Select 不允许空字符串 value，用哨兵值表示「全部」 */
const ALL = "__all__";

/** 某个月的自然天数：Date.UTC 的 day=0 即上个月最后一天 */
function lastDayOfMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

/** 按自然月增减，输入输出均为 YYYY-MM */
function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 账目明细。
 *
 * 筛选条件全部通过查询串下发给 /api/transactions，服务端负责过滤与分页，
 * 前端不做任何本地全量拉取，保证数据量增长后依然稳定。
 */
export default function TransactionsPage() {
  const router = useRouter();
  const today = todayInBusinessTimezone();
  const currentMonth = today.slice(0, 7);

  const [kind, setKind] = useState<KindFilter>("all");
  const [from, setFrom] = useState(`${currentMonth}-01`);
  const [to, setTo] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [tagId, setTagId] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<TransactionDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refunding, setRefunding] = useState(false);

  const categories = useApiQuery<{ items: CategoryDto[] }>("/api/categories");
  const tags = useApiQuery<{ items: TagDto[] }>("/api/tags");

  const path = useMemo(
    () =>
      `/api/transactions${buildQuery({
        kind: kind === "all" ? undefined : kind,
        from,
        to,
        categoryId,
        tagId,
        keyword,
        page,
        pageSize: PAGE_SIZE,
      })}`,
    [kind, from, to, categoryId, tagId, keyword, page],
  );

  const query = useApiQuery<Paginated<TransactionDto>>(path);
  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 0;

  // 已选中的分类即使与当前数据类型不符也要保留，避免下拉框显示为空
  const categoryOptions = (categories.data?.items ?? []).filter(
    (item) => kind === "all" || item.kind === kind || item.id === categoryId,
  );

  const month = from.slice(0, 7);
  const canRefund =
    target?.kind === "expense" && !target.refundOfId && !target.refundedAt;

  /** 任何筛选条件变化都要把页码重置回第一页，否则会停留在越界页码上 */
  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  /** 快捷切换月份：整月区间一次性写入起止日期 */
  function applyMonth(value: string) {
    if (!value) return;
    const lastDay = lastDayOfMonth(value);
    updateFilter(() => {
      setFrom(`${value}-01`);
      setTo(`${value}-${String(lastDay).padStart(2, "0")}`);
    });
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

  async function handleRefund() {
    if (!target) return;
    setRefunding(true);
    try {
      await api.post(`/api/transactions/${target.id}/refund`);
      toast.success("已生成等额退款收入");
      setTarget(null);
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRefunding(false);
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

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="month">月份</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(event) => applyMonth(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="上个月"
              onClick={() => applyMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="下个月"
              onClick={() => applyMonth(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyMonth(currentMonth)}>
              本月
            </Button>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>分类</Label>
              <Select
                value={categoryId || ALL}
                onValueChange={(value) =>
                  updateFilter(() => setCategoryId(value === ALL ? "" : value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部分类</SelectItem>
                  {categoryOptions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>标签</Label>
              <Select
                value={tagId || ALL}
                onValueChange={(value) => updateFilter(() => setTagId(value === ALL ? "" : value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>全部标签</SelectItem>
                  {(tags.data?.items ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <EmptyBlock title="没有符合条件的记录" description="试着放宽日期范围或清空筛选条件" />
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
              {target.refundOfId ? <Row label="状态" value="退款收入（不可编辑）" /> : null}
              {target.refundedAt ? <Row label="状态" value="已退款" /> : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {canRefund ? (
              <Button variant="secondary" disabled={refunding} onClick={handleRefund}>
                <RotateCcw />
                退款
              </Button>
            ) : null}
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              <Trash2 />
              删除
            </Button>
            {target && !target.refundOfId ? (
              <Button
                onClick={() => {
                  router.push(`/transactions/new?id=${target.id}`);
                }}
              >
                <Pencil />
                编辑
              </Button>
            ) : null}
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
