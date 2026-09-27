import type { ReactNode } from "react";
import { SessionProvider } from "@/components/providers/session-provider";
import { AppShell } from "@/components/layout/app-shell";

/**
 * 用户端布局（route group 不影响 URL）。
 *
 * 管理后台位于 /admin，不经过这里，因此不会加载会话 Provider 与 Service Worker，
 * 从结构上满足「PWA 仅在用户端启用」的要求。
 */
export default function UserAppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}