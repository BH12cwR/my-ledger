import type { ReactNode } from "react";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminSessionProvider } from "@/components/providers/admin-session-provider";

/** 后台受保护区域：会话 Provider + 登录守卫 + 顶部导航 */
export default function AdminDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminSessionProvider>
      <AdminShell>{children}</AdminShell>
    </AdminSessionProvider>
  );
}