import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 测试配置。
 *
 * 只跑 tests/ 下的用例，环境固定为 node —— 服务层与工具函数本身不依赖浏览器 API，
 * 集成测试则借助 node:sqlite 在内存中模拟 D1，无需启动 wrangler。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});