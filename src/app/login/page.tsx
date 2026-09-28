"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/components/providers/session-provider";
import { api, errorMessage } from "@/lib/api";

/**
 * 用户端登录页。
 *
 * 三种入口：
 *  * 账号密码登录 / 自助注册（始终可用）
 *  * 微信扫码（需配置 WECHAT_APP_ID / WECHAT_APP_SECRET）
 *  * 开发模式模拟登录（需 AUTH_DEV_MODE=true 且非生产环境）
 */
export default function LoginPage() {
  const { user, capabilities, loading, refresh } = useSession();
  const router = useRouter();
  const [next, setNext] = useState("/");
  const [submitting, setSubmitting] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    username: "",
    nickname: "",
    password: "",
    confirmPassword: "",
  });
  const [nickname, setNickname] = useState("演示用户");

  // 用 window.location 而非 useSearchParams：后者会把页面强制变为动态渲染，
  // 与静态预渲染策略冲突，会让页面退出静态生成。
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("next");
    if (target && target.startsWith("/") && !target.startsWith("//")) setNext(target);
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const handleLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      try {
        await api.post<{ user: unknown }>("/api/auth/login", loginForm);
        await refresh();
        toast.success("登录成功");
        router.replace(next);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [loginForm, refresh, router, next],
  );

  const handleRegister = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (registerForm.password !== registerForm.confirmPassword) {
        toast.error("两次输入的密码不一致");
        return;
      }
      setSubmitting(true);
      try {
        await api.post<{ user: unknown }>("/api/auth/register", {
          username: registerForm.username,
          password: registerForm.password,
          nickname: registerForm.nickname.trim() || undefined,
        });
        await refresh();
        toast.success("注册成功，已自动登录");
        router.replace(next);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setSubmitting(false);
      }
    },
    [registerForm, refresh, router, next],
  );

  const handleDevLogin = useCallback(async () => {
    setSubmitting(true);
    try {
      await api.post<{ user: unknown }>("/api/auth/dev-login", { nickname });
      await refresh();
      toast.success("已进入演示账号");
      router.replace(next);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }, [nickname, refresh, router, next]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck className="size-6" />
        </span>
        <h1 className="font-heading text-xl font-semibold">账本</h1>
        <p className="text-sm text-muted-foreground">
          记录每一笔收支，看清钱都去了哪里
        </p>
      </div>

      <Card>
        <Tabs defaultValue="login">
          <CardHeader>
            <TabsList className="w-full">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>
            <CardDescription>
              使用账号密码登录，账本数据与账号绑定
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TabsContent value="login">
              <form className="flex flex-col gap-3" onSubmit={handleLogin}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="login-username">用户名</Label>
                  <Input
                    id="login-username"
                    name="username"
                    autoComplete="username"
                    value={loginForm.username}
                    maxLength={50}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    placeholder="请输入用户名"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="login-password">密码</Label>
                  <Input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    value={loginForm.password}
                    maxLength={128}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="请输入密码"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    submitting ||
                    loginForm.username.trim().length === 0 ||
                    loginForm.password.length === 0
                  }
                >
                  {submitting ? <Loader2 className="animate-spin" /> : null}
                  登录
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form className="flex flex-col gap-3" onSubmit={handleRegister}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="register-username">用户名</Label>
                  <Input
                    id="register-username"
                    name="username"
                    autoComplete="username"
                    value={registerForm.username}
                    maxLength={20}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                    }
                    placeholder="3-20 位字母、数字、下划线、点或中划线"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="register-nickname">昵称（可选）</Label>
                  <Input
                    id="register-nickname"
                    name="nickname"
                    value={registerForm.nickname}
                    maxLength={20}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, nickname: event.target.value }))
                    }
                    placeholder="不填则默认与用户名相同"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="register-password">密码</Label>
                  <Input
                    id="register-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    value={registerForm.password}
                    maxLength={128}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="至少 8 位，且包含两类字符"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="register-confirm">确认密码</Label>
                  <Input
                    id="register-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={registerForm.confirmPassword}
                    maxLength={128}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                    }
                    placeholder="请再次输入密码"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    submitting ||
                    registerForm.username.trim().length === 0 ||
                    registerForm.password.length === 0 ||
                    registerForm.confirmPassword.length === 0
                  }
                >
                  {submitting ? <Loader2 className="animate-spin" /> : null}
                  注册并登录
                </Button>
              </form>
            </TabsContent>

            <Separator />
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="lg"
                disabled={!capabilities.wechat}
                onClick={() => {
                  window.location.href = `/api/auth/wechat/authorize?next=${encodeURIComponent(next)}`;
                }}
              >
                微信扫码登录
              </Button>
              {!capabilities.wechat ? (
                <p className="text-xs text-muted-foreground">
                  未检测到微信开放平台凭据（WECHAT_APP_ID / WECHAT_APP_SECRET），
                  生产环境请先在 Pages 环境变量中配置。
                </p>
              ) : null}
            </div>

            {capabilities.devLogin ? (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="nickname">开发模式模拟登录</Label>
                  <div className="flex gap-2">
                    <Input
                      id="nickname"
                      value={nickname}
                      maxLength={20}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="输入昵称，同名即同一账本"
                    />
                    <Button
                      variant="secondary"
                      disabled={submitting || nickname.trim().length === 0}
                      onClick={handleDevLogin}
                    >
                      {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                      进入
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    AUTH_DEV_MODE 已开启（仅限非生产环境）。相同昵称会复用同一个演示账本。
                  </p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Tabs>
      </Card>

      <Link
        href="/admin/login"
        className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        管理员入口
      </Link>
    </div>
  );
}
