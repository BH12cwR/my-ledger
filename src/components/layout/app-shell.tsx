"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingBlock } from "./states";
import { BottomNav } from "./bottom-nav";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { useSession } from "@/components/providers/session-provider";

/**
 * 用户端外壳：负责登录守卫、页面容器与底部导航。
 *
 * 这里的前端守卫只是体验优化（避免闪现受保护页面），
 * 真正的权限边界在 API 层 —— 每个接口都会独立校验会话。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || user) return;
    const next = encodeURIComponent(pathname || "/");
    router.replace(`/login?next=${next}`);
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingBlock label={loading ? "正在恢复登录状态…" : "正在跳转登录…"} />
      </div>
    );
  }

  return (
    <>
      <ServiceWorkerRegistrar />
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-28">{children}</main>
      <BottomNav />
    </>
  );
}