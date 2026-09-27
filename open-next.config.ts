import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * @opennextjs/cloudflare 适配器配置。
 *
 * 本项目页面全部静态预渲染（无 ISR / revalidate），因此不启用 R2 或 KV 增量缓存，
 * 沿用适配器默认的 "dummy" 实现 —— 无需绑定任何额外的 Cloudflare 存储产品。
 *
 * 后续若引入 ISR，只需两处改动：
 *   1. wrangler.toml 声明 R2 绑定 NEXT_INC_CACHE_R2_BUCKET
 *   2. 这里改为：
 *        import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
 *        export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
 */
export default defineCloudflareConfig({});