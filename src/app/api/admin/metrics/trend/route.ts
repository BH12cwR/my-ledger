import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireAdmin } from "@/server/auth/guard";
import { adminMetricsQuerySchema } from "@/server/validation/schemas";
import { getPlatformTrend } from "@/server/services/admin";

/** GET /api/admin/metrics/trend?days=14 —— 新增用户与记账笔数趋势 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const { days } = parseQuery(request, adminMetricsQuerySchema);
    return jsonOk(await getPlatformTrend(deps.db, days));
  });
}