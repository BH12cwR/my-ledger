import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { rangeQuerySchema } from "@/server/validation/schemas";
import { getSummary } from "@/server/services/stats";

/** GET /api/stats/summary?from=&to= —— 收支合计，默认最近 30 天 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, rangeQuerySchema);
    return jsonOk(await getSummary(deps.db, auth.principalId, query));
  });
}