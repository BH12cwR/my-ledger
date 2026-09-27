"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type ApiClientError } from "./api";

/**
 * 极简数据请求 hook。
 *
 * 刻意不引入 react-query 之类的依赖：当前页面规模下，
 * 「路径变化即重新拉取 + 手动 reload」已经够用，也更容易讲清楚数据流。
 */
export function useApiQuery<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<T>(path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const code = (cause as ApiClientError)?.code;
        // 401 交给页面层的会话逻辑处理，这里不重复弹出提示
        if (code !== "unauthorized") setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return { data, error, loading, reload, setData };
}