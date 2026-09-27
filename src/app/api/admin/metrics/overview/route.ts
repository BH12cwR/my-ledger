import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireAdmin } from "@/server/auth/guard";
import { adminMetricsQuerySchema } from "@/server/validation/schemas";
import { getOverviewMetrics } from "@/server/services/admin";

/** GET /api/admin/metrics/overview?days=7 —— 平台级核心指标 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const { days } = parseQuery(request, adminMetricsQuerySchema);
    return jsonOk(await getOverviewMetrics(deps.db, days));
  });
}