import type { ReactNode } from "react";

/**
 * /admin 段的根布局。
 *
 * 这里刻意保持"空"，不引入用户端的 SessionProvider 与 Service Worker：
 * 后台与用户端是两套互相独立的鉴权与运行时。
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}