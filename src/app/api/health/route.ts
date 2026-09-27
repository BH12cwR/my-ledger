import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";

/**
 * GET /api/health
 * 最小连通性探针：确认 Worker 已注入 D1 绑定且可以执行查询。
 * 部署后可用于验证环境变量与数据库绑定是否正确。
 */
export async function GET() {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();

    return jsonOk({
      status: row?.ok === 1 ? "ok" : "degraded",
      database: "d1",
      environment: env.APP_ENV ?? "development",
      wechatConfigured: Boolean(env.WECHAT_APP_ID && env.WECHAT_APP_SECRET),
      time: Date.now(),
    });
  });
}