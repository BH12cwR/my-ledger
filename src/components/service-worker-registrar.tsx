"use client";

import { useEffect } from "react";

/**
 * 手动注册 Service Worker。
 *
 * Serwist 以 register: false 生成 sw.js，注册时机完全由我们掌握：
 *  * 只在生产构建注册 —— 开发环境 Serwist 是关闭的，/sw.js 并不存在；
 *  * 延迟到首屏空闲后注册，避免与首屏资源竞争带宽；
 *  * 本组件只挂在用户端布局里，管理后台不会注册 SW（需求要求 PWA 仅限用户端）。
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.error("[pwa] Service Worker 注册失败:", error);
      });
    }, 1500);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}