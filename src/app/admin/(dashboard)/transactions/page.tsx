"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildQuery, type Paginated, type TransactionDto } from "@/lib/api";
import { todayInBusinessTimezone } from "@/lib/dates";
import { money } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const PAGE_SIZE = 20;

/**
 * 账目监控（跨用户只读）。
 *
 * 依赖 /api/admin/transactions 的 userId=null 语义：服务层显式开启跨用户查询，
 * 并带出记账人昵称，便于定位异常数据。
 */
export default function AdminTransactionsPage() {
  const today = todayInBusinessTimezone();

  const [userIdDraft, setUserIdDraft] = useState("");
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const path = useMemo(
    () =>
      `/api/admin/transactions${buildQuery({
        userId,
        kind: kind === "all" ? undefined : kind,
        from,
        to,
        keyword,
        page,
        pageSize: PAGE_SIZE,
      })}`,
    [userId, kind, from, to, keyword, page],
  );

  const query = useApiQuery<Paginated<TransactionDto>>(path);
  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-semibold">账目监控</h1>
        <p className="text-xs text-muted-foreground">
          跨用户只读视图 · 服务端按 happened_on 过滤，今日 {today}
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userId">用户 ID</Label>
              <Input
                id="userId"
                value={userIdDraft}
                placeholder="精确匹配用户 ID"
                onChange={(event) => setUserIdDraft(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">开始日期</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">结束日期</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>类型</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="income">收入</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setUserId(userIdDraft.trim());
              setKeyword(keywordDraft.trim());
              setPage(1);
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
              查询
            </Button>
          </form>
        </CardContent>
      </Card>

      {query.loading ? (
        <LoadingBlock label="正在加载账目…" />
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
        <EmptyBlock title="没有匹配的账目" description="调整筛选条件后再试" />
      ) : (
        <>
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>记账人</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead className="hidden md:table-cell">账户</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                    <TableHead className="hidden lg:table-cell">备注 / 标签</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-xs">{item.happenedOn}</TableCell>
                      <TableCell className="text-xs">
                        {item.userNickname ?? item.userId?.slice(0, 8) ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.categoryName ?? (item.kind === "income" ? "收入" : "支出")}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {item.accountName ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {item.kind === "income" ? "+" : "-"}
                        {money(item.amountCents)}
                      </TableCell>
                      <TableCell className="hidden max-w-[240px] lg:table-cell">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.note ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {item.note}
                            </span>
                          ) : null}
                          {item.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </div>
  );
}