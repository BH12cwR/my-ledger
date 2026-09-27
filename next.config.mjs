import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import withSerwistInit from "@serwist/next";

/**
 * 离线兜底页必须进预缓存，否则断网时 fallback 指向的文档本身也取不到。
 * revision 用于给预缓存条目做版本控制：优先取当前 commit，取不到则退回随机值
 * （CI 环境常常没有 git 元数据）。
 */
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || randomUUID();

/**
 * PWA 仅在用户端生效：
 * 1. `register: false` —— 不全局注入注册脚本，改由用户端布局中的 <ServiceWorkerRegistrar /> 注册。
 * 2. swSrc 里的 runtimeCaching 把 /admin 与 /api 一律走 NetworkOnly，绝不落盘缓存。
 * 3. 离线兜底页仅对用户端文档请求生效。
 * 4. `disable` —— 开发环境不生成也不注册 SW。
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  register: false,
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // 构建阶段不因 lint 失败而中断，lint 由 `npm run lint` 单独负责
    ignoreDuringBuilds: true,
  },
};

// 让 `next dev` 从 wrangler.toml 读取 D1 等绑定，本地即可使用真实的 Cloudflare API。
// 官方说明该调用无需 await。
void initOpenNextCloudflareForDev();

export default withSerwist(nextConfig);