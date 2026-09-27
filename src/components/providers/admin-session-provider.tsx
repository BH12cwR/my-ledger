"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, type AdminDto } from "@/lib/api";

/**
 * 后台会话上下文。
 *
 * 与用户端 SessionProvider 完全独立：不同的引导接口（/api/admin/auth/me）、
 * 不同的 Cookie，同一个浏览器可以同时登录用户端与后台而互不影响。
 */
interface AdminSessionContextValue {
  admin: AdminDto | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionContextValue>({
  admin: null,
  loading: true,
  refresh: async () => undefined,
  logout: async () => undefined,
});

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminDto | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.get<{ admin: AdminDto }>("/api/admin/auth/me");
      setAdmin(payload.admin);
    } catch {
      // 未登录时该接口返回 401，属于正常流程，不弹提示
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/admin/auth/logout");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ admin, loading, refresh, logout }),
    [admin, loading, refresh, logout],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionContextValue {
  return useContext(AdminSessionContext);
}