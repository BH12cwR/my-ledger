import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Db, Env } from "./types";

/**
 * 读取当前请求的 Cloudflare 绑定。
 *
 * 前端永远不直连数据库：只有 API Route 会经由该函数拿到 D1 句柄。
 *
 * 适配器为 @opennextjs/cloudflare，它以 Next.js 的 **Node.js runtime** 运行
 * （而非已废弃的 Edge runtime），因此这里用同步的 getCloudflareContext()。
 * 本地开发时由 next.config.mjs 中的 initOpenNextCloudflareForDev() 注入
 * wrangler.toml 声明的本地绑定。
 */
export function getBindings(): Env {
  const { env } = getCloudflareContext();
  return env as unknown as Env;
}

export function getDb(): Db {
  return getBindings().DB;
}

/**
 * 读取必需的环境变量/密钥，缺失时抛出明确错误，
 * 避免把「未配置密钥」误判成「签名不匹配」这类难以排查的问题。
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getBindings()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `缺少必需的环境变量 ${String(key)}，请检查 .dev.vars（本地）或 Pages 环境变量（线上）。`,
    );
  }
  return value as NonNullable<Env[K]>;
}

/** 当前运行环境是否为本地开发 */
export function isDevEnvironment(): boolean {
  try {
    return process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
}

/** 模拟登录是否被允许：必须显式设置 AUTH_DEV_MODE=true */
export function isDevAuthEnabled(): boolean {
  const flag = getBindings().AUTH_DEV_MODE;
  return flag === "true" || flag === "TRUE" || flag === "1";
}