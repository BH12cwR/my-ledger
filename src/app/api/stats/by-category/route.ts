import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery, queryFlag } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { statsQuerySchema } from "@/server/validation/schemas";
import { getCategoryBreakdown } from "@/server/services/stats";

/** GET /api/stats/by-category?kind=expense|income|all&from=&to=&compare=1 —— 分类/标签占比与排行 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, statsQuerySchema);
    const breakdown = await getCategoryBreakdown(deps.db, auth.principalId, {
      ...query,
      compare: queryFlag(request, "compare"),
    });
    return jsonOk(breakdown);
  });
}