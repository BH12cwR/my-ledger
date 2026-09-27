import type { ReactNode } from "react";
import { SessionProvider } from "@/components/providers/session-provider";

/**
 * 登录页布局。
 *
 * /login 必须留在 (app) 路由组之外 —— 那里的 AppShell 会把未登录用户重定向到
 * /login，若登录页也被守卫包裹就会形成死循环。
 *
 * 但登录页同样需要会话上下文：capabilities 决定展示「微信扫码」还是「开发模式
 * 模拟登录」，user 决定已登录时直接跳回站内。因此在这里单独挂载 SessionProvider，
 * 既拿到能力开关，又不引入 AppShell 的守卫与用户端的 Service Worker 注册。
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}