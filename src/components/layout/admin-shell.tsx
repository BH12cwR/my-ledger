"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, FileClock, LayoutDashboard, LogOut, ReceiptText, Users } from "lucide-react";
import { LoadingBlock } from "@/components/layout/states";
import { useAdminSession } from "@/components/providers/admin-session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/transactions", label: "账目", icon: ReceiptText },
  { href: "/admin/audit-logs", label: "审计日志", icon: FileClock },
  { href: "/admin/admins", label: "管理员", icon: Activity },
] as const;

const ROLE_LABELS: Record<string, string> = {
  super_admin: "超级管理员",
  admin: "管理员",
  auditor: "审计员",
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 后台外壳：登录守卫 + 顶部导航。
 *
 * 这里不注册 Service Worker，也不加载 PWA manifest 相关的运行时逻辑，
 * 保证「PWA 仅在用户端启用」。
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, loading, logout } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || admin) return;
    router.replace("/admin/login");
  }, [loading, admin, router]);

  if (loading || !admin) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label={loading ? "正在校验管理员会话…" : "正在跳转登录…"} />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-heading text-base font-semibold">轻记账 · 监控后台</span>
              <Badge variant="secondary" className="text-[10px]">
                {ROLE_LABELS[admin.role] ?? admin.role}
              </Badge>
              {admin.mustChangePassword ? (
                <Badge variant="destructive" className="text-[10px]">
                  待修改初始密码
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {admin.displayName}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await logout();
                  router.replace("/admin/login");
                }}
              >
                <LogOut />
                退出
              </Button>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  isActive(pathname, item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}