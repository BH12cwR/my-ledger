"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage, type Capabilities, type SessionPayload, type UserDto } from "@/lib/api";

/**
 * 用户端会话上下文。
 *
 * 只有一个数据源：GET /api/auth/me。它同时返回登录态与可用登录方式，
 * 因此页面不需要各自猜测「微信是否已配置」「能否使用开发登录」。
 */
interface SessionContextValue {
  user: UserDto | null;
  capabilities: Capabilities;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const DEFAULT_CAPABILITIES: Capabilities = { wechat: false, devLogin: false };

const SessionContext = createContext<SessionContextValue>({
  user: null,
  capabilities: DEFAULT_CAPABILITIES,
  loading: true,
  refresh: async () => undefined,
  logout: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>(DEFAULT_CAPABILITIES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.get<SessionPayload>("/api/auth/me");
      setUser(payload.user);
      setCapabilities(payload.capabilities);
    } catch {
      // 会话引导失败不应阻塞页面渲染，按未登录处理即可
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 微信回调失败时会带着 auth_error 跳回站内，这里负责把提示补上
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (!authError) return;
    toast.error(authError);
    params.delete("auth_error");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, []);

  const value = useMemo(
    () => ({ user, capabilities, loading, refresh, logout }),
    [user, capabilities, loading, refresh, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}