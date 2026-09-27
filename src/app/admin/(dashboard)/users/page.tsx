"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Search, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { useAdminSession } from "@/components/providers/admin-session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { api, buildQuery, errorMessage, type Paginated, type UserDto } from "@/lib/api";
import { dateTime, money, relativeTime } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const PAGE_SIZE = 20;

interface UserDetail {
  user: UserDto;
  stats: {
    transactionCount: number;
    totalExpenseCents: number;
    totalIncomeCents: number;
    lastTransactionAt: number | null;
  };
}

/** 用户监控：检索、查看记账概况、启用/禁用账号 */
export default function AdminUsersPage() {
  const { admin } = useAdminSession();
  const canManage = admin?.role === "super_admin" || admin?.role === "admin";

  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const path = useMemo(
    () =>
      `/api/admin/users${buildQuery({
        keyword,
        status: status === "all" ? undefined : status,
        page,
        pageSize: PAGE_SIZE,
      })}`,
    [keyword, status, page],
  );

  const query = useApiQuery<Paginated<UserDto>>(path);
  const detail = useApiQuery<UserDetail>(detailId ? `/api/admin/users/${detailId}` : null);
  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 0;

  async function toggleStatus(user: UserDto) {
    setBusy(true);
    try {
      await api.patch(`/api/admin/users/${user.id}`, {
        status: user.status === "active" ? "disabled" : "active",
      });
      toast.success(user.status === "active" ? "已禁用该用户" : "已恢复该用户");
      query.reload();
      if (detailId === user.id) detail.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="font-heading text-lg font-semibold">用户管理</h1>
        {canManage ? null : (
          <Badge variant="outline" className="text-[10px]">
            当前角色仅可查看
          </Badge>
        )}
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setKeyword(keywordDraft.trim());
              setPage(1);
            }}
          >
            <Input
              value={keywordDraft}
              maxLength={50}
              placeholder="搜索昵称 / openid / unionid"
              onChange={(event) => setKeywordDraft(event.target.value)}
            />
            <Button type="submit" variant="secondary">
              <Search />
              搜索
            </Button>
          </form>

          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">正常</SelectItem>
              <SelectItem value="disabled">已禁用</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {query.loading ? (
        <LoadingBlock label="正在加载用户…" />
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
        <EmptyBlock title="没有匹配的用户" description="换个关键词或状态再试" />
      ) : (
        <>
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>昵称</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="hidden sm:table-cell">注册时间</TableHead>
                    <TableHead className="hidden md:table-cell">最后登录</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setDetailId(user.id)}
                        >
                          <span className="font-medium">{user.nickname}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {user.id.slice(0, 8)}…
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        {user.status === "active" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            正常
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            已禁用
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {dateTime(user.createdAt)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {relativeTime(user.lastLoginAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailId(user.id)}
                          >
                            详情
                          </Button>
                          <Button
                            variant={user.status === "active" ? "destructive" : "outline"}
                            size="sm"
                            disabled={!canManage || busy}
                            onClick={() => toggleStatus(user)}
                          >
                            {user.status === "active" ? <UserX /> : <UserCheck />}
                            {user.status === "active" ? "禁用" : "恢复"}
                          </Button>
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
              共 {query.data?.total ?? 0} 人 · 第 {query.data?.page ?? 1} / {Math.max(totalPages, 1)} 页
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

      <Dialog open={detailId !== null} onOpenChange={(open) => (open ? undefined : setDetailId(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail.data?.user.nickname ?? "用户详情"}</DialogTitle>
            <DialogDescription>{detail.data?.user.id ?? ""}</DialogDescription>
          </DialogHeader>

          {detail.loading ? (
            <LoadingBlock />
          ) : detail.error ? (
            <p className="text-sm text-destructive">{detail.error}</p>
          ) : detail.data ? (
            <div className="flex flex-col gap-2 text-sm">
              <Row label="状态" value={detail.data.user.status === "active" ? "正常" : "已禁用"} />
              <Row label="记账笔数" value={`${detail.data.stats.transactionCount}`} />
              <Row label="累计支出" value={money(detail.data.stats.totalExpenseCents)} />
              <Row label="累计收入" value={money(detail.data.stats.totalIncomeCents)} />
              <Row label="净结余" value={money(
                detail.data.stats.totalIncomeCents - detail.data.stats.totalExpenseCents,
              )} />
              <Row label="最近记账" value={relativeTime(detail.data.stats.lastTransactionAt)} />
              <Row label="注册时间" value={dateTime(detail.data.user.createdAt)} />
              <Row label="最后登录" value={dateTime(detail.data.user.lastLoginAt)} />
              {detail.data.user.status === "disabled" ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="size-3.5" />
                  已禁用用户的全部会话在禁用时被立即吊销
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-right font-mono tabular-nums">{value}</span>
    </div>
  );
}