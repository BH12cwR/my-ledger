import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery, queryFlag } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { rangeQuerySchema } from "@/server/validation/schemas";
import { getSummary } from "@/server/services/stats";

/** GET /api/stats/summary?from=&to=&compare=1 —— 收支合计，默认最近 30 天；compare=1 时带上一同长度周期 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, rangeQuerySchema);
    const summary = await getSummary(deps.db, auth.principalId, query, {
      compare: queryFlag(request, "compare"),
    });
    return jsonOk(summary);
  });
}