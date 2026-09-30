"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/layout/states";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/layout/pagination";
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
import { buildQuery, type AuditLogDto, type Paginated } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const PAGE_SIZE = 20;

const ACTOR_LABELS: Record<string, string> = {
  user: "用户",
  admin: "管理员",
  system: "系统",
};

/** 审计日志：登录、启停用户、创建管理员等敏感操作的可追溯记录 */
export default function AdminAuditLogsPage() {
  const [actionDraft, setActionDraft] = useState("");
  const [action, setAction] = useState("");
  const [actorType, setActorType] = useState<string>("all");
  const [page, setPage] = useState(1);

  const path = useMemo(
    () =>
      `/api/admin/audit-logs${buildQuery({
        action,
        actorType: actorType === "all" ? undefined : actorType,
        page,
        pageSize: PAGE_SIZE,
      })}`,
    [action, actorType, page],
  );

  const query = useApiQuery<Paginated<AuditLogDto>>(path);
  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="审计日志"
        subtitle="记录管理端敏感操作与登录事件，日志写入失败不影响主流程"
      />

      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form
            className="flex flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setAction(actionDraft.trim());
              setPage(1);
            }}
          >
            <Input
              value={actionDraft}
              maxLength={60}
              placeholder="按操作名模糊搜索，例如 admin.user"
              onChange={(event) => setActionDraft(event.target.value)}
            />
            <Button type="submit" variant="secondary">
              <Search />
              搜索
            </Button>
          </form>

          <Select
            value={actorType}
            onValueChange={(value) => {
              setActorType(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="admin">管理员</SelectItem>
              <SelectItem value="user">用户</SelectItem>
              <SelectItem value="system">系统</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {query.loading ? (
        <LoadingBlock label="正在加载日志…" />
      ) : query.error ? (
        <ErrorBlock description={query.error} onRetry={query.reload} />
      ) : items.length === 0 ? (
        <EmptyBlock title="没有匹配的日志" description="换个关键词或来源再试" />
      ) : (
        <>
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead className="hidden md:table-cell">目标</TableHead>
                    <TableHead className="hidden lg:table-cell">详情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {dateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm">
                          {ACTOR_LABELS[log.actorType] ?? log.actorType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.action}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {log.targetType ? `${log.targetType}:${log.targetId ?? "-"}` : "-"}
                      </TableCell>
                      <TableCell className="hidden max-w-[280px] lg:table-cell">
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {log.detail ? JSON.stringify(log.detail) : "-"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={query.data?.total ?? 0}
            unit="条"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}