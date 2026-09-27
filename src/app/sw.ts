import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist, type RuntimeCaching } from "serwist";

/**
 * 用户端 Service Worker（Serwist）。
 *
 * 缓存策略：
 *  * /admin 与 /api 一律 NetworkOnly —— 管理后台数据必须实时，且绝不落盘；
 *  * 其余规则沿用 Serwist 官方默认（静态资源、图片、字体的缓存策略）；
 *  * 断网时文档请求回退到预缓存的 /offline 页。
 *
 * 本文件只作用于用户端：管理后台位于 /admin，不经过 (app) 路由组，
 * 因此不会触发 <ServiceWorkerRegistrar />。
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // 由 @serwist/next 在构建期替换为真实的预缓存清单
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  // 管理后台永不缓存，保证监控数据的实时性与鉴权边界
  {
    matcher: ({ url }) => url.pathname.startsWith("/admin"),
    handler: new NetworkOnly(),
  },
  // 接口请求永不缓存，避免账目数据错乱
  {
    matcher: ({ url }) => url.pathname.startsWith("/api"),
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();