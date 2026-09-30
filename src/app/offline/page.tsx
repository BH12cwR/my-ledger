import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "网络不可用",
};

/**
 * Service Worker 的离线兜底文档页（仅用户端文档导航会回退到该页面）。
 * 该页面为纯静态，可被 Workbox 预缓存。
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl" aria-hidden>
        📡
      </p>
      <h1 className="text-xl font-semibold">当前处于离线状态</h1>
      <p className="text-sm text-muted-foreground">
        网络连接不可用，已展示本地缓存的应用外壳。恢复网络后即可继续记账。
      </p>
      <Button asChild variant="outline">
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}