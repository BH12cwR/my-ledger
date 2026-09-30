"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingBlock } from "./states";
import { BottomNav } from "./bottom-nav";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { useSession } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";

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

  /**
   * 底部导航只属于两个 Tab 根路径。
   *
   * 设计稿里的二级页（搜索 / 筛选 / 统计 / 分类详情 / 账户明细 / 记账）都是全屏推入页，
   * 底部没有导航栏；只有账单页与资产页挂导航。二级页因此也不再为导航预留下边距 ——
   * 这也让「筛选页确定吸底」不会与导航重叠。
   */
  const showNav = pathname === "/" || pathname === "/assets";

  return (
    <>
      <ServiceWorkerRegistrar />
      <main className={cn("mx-auto w-full max-w-2xl px-4 pt-6", showNav ? "pb-28" : "pb-4")}>
        {children}
      </main>
      {showNav ? <BottomNav /> : null}
    </>
  );
}