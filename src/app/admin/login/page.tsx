"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage, type AdminDto } from "@/lib/api";

/**
 * 管理员登录页。
 *
 * 与用户端登录完全隔离：账号来自 admin_users 表，登录成功后服务端下发
 * ledger_admin_session Cookie，前端不做任何凭据存储。
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 已登录时直接进入后台，避免重复登录
  useEffect(() => {
    api
      .get<{ admin: AdminDto }>("/api/admin/auth/me")
      .then(() => router.replace("/admin"))
      .catch(() => undefined);
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post<{ admin: AdminDto }>("/api/admin/auth/login", {
        username: username.trim(),
        password,
      });
      toast.success("登录成功");
      router.replace("/admin");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-foreground text-background">
          <ShieldCheck className="size-6" />
        </span>
        <h1 className="font-heading text-xl font-semibold">监控后台</h1>
        <p className="text-sm text-muted-foreground">平台级指标、用户与账目审计</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>管理员登录</CardTitle>
          <CardDescription>连续 5 次密码错误将锁定账号 15 分钟</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={submitting || username.trim() === "" || password === ""}
            >
              {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>

      <Link
        href="/"
        className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        返回用户端
      </Link>
    </div>
  );
}