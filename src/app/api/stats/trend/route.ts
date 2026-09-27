import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { trendQuerySchema } from "@/server/validation/schemas";
import { getDailyTrend, getMonthlyTrend } from "@/server/services/stats";

/**
 * GET /api/stats/trend?granularity=day|month&from=&to=
 * 按日返回时会补齐区间内的空日期，前端可直接绘图；按月返回原始月份列表。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, trendQuerySchema);

    if (query.granularity === "month") {
      const points = await getMonthlyTrend(deps.db, auth.principalId, query);
      return jsonOk({ granularity: "month" as const, points });
    }

    const { from, to, points } = await getDailyTrend(deps.db, auth.principalId, query);
    return jsonOk({ granularity: "day" as const, from, to, points });
  });
}