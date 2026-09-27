import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { statsQuerySchema } from "@/server/validation/schemas";
import { getCategoryBreakdown } from "@/server/services/stats";

/** GET /api/stats/by-category?kind=expense|income&from=&to= —— 分类占比 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, statsQuerySchema);
    return jsonOk(await getCategoryBreakdown(deps.db, auth.principalId, query));
  });
}