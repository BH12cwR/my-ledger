"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ErrorBlock, LoadingBlock } from "@/components/layout/states";
import { PageHeader } from "@/components/layout/page-header";
import { useAdminSession } from "@/components/providers/admin-session-provider";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, errorMessage, type AdminDto } from "@/lib/api";
import { dateTime, relativeTime } from "@/lib/format";
import { useApiQuery } from "@/lib/hooks";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "超级管理员",
  admin: "管理员",
  auditor: "审计员",
};

/** 管理员账号管理：列表只读展示，新建仅限 super_admin */
export default function AdminAdminsPage() {
  const { admin } = useAdminSession();
  const isSuperAdmin = admin?.role === "super_admin";

  const query = useApiQuery<{ items: AdminDto[] }>("/api/admin/admins");
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    setSubmitting(true);
    try {
      await api.post("/api/admin/admins", {
        username: username.trim(),
        displayName: displayName.trim(),
        password,
        role,
      });
      toast.success("管理员已创建");
      setOpen(false);
      setUsername("");
      setDisplayName("");
      setPassword("");
      query.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const items = query.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="管理员账号"
        subtitle="后台账户体系与普通用户完全隔离，密码使用 PBKDF2-SHA256 存储"
        actions={
          <Button size="sm" disabled={!isSuperAdmin} onClick={() => setOpen(true)}>
            <Plus />
            新建管理员
          </Button>
        }
      />

      {!isSuperAdmin ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          仅超级管理员可新建账号，当前账号为只读视图。
        </p>
      ) : null}

      {query.loading ? (
        <LoadingBlock label="正在加载管理员…" />
      ) : query.error ? (
        <ErrorBlock description={query.error} onRetry={query.reload} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>显示名称</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="hidden md:table-cell">最后登录</TableHead>
                  <TableHead className="hidden lg:table-cell">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.username}</TableCell>
                    <TableCell className="text-sm">{item.displayName}</TableCell>
                    <TableCell className="text-xs">
                      {ROLE_LABELS[item.role] ?? item.role}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.status === "active" ? (
                          <Badge variant="secondary" size="sm">
                            正常
                          </Badge>
                        ) : (
                          <Badge variant="destructive" size="sm">
                            已停用
                          </Badge>
                        )}
                        {item.mustChangePassword ? (
                          <Badge variant="outline" size="sm">
                            待改密码
                          </Badge>
                        ) : null}
                        {item.lockedUntil && item.lockedUntil > Date.now() ? (
                          <Badge variant="destructive" size="sm">
                            已锁定
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {relativeTime(item.lastLoginAt)}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {dateTime(item.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建管理员</DialogTitle>
            <DialogDescription>
              密码至少 12 位且需包含大小写字母与数字，创建后需提示对方尽快修改
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                maxLength={50}
                placeholder="字母、数字、下划线、点、中划线"
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayName">显示名称</Label>
              <Input
                id="displayName"
                value={displayName}
                maxLength={30}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">初始密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>角色</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">管理员（可启停用户）</SelectItem>
                  <SelectItem value="auditor">审计员（只读）</SelectItem>
                  <SelectItem value="super_admin">超级管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={
                submitting ||
                username.trim().length < 3 ||
                displayName.trim() === "" ||
                password.length < 12
              }
              onClick={handleCreate}
            >
              {submitting ? <Loader2 className="animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}