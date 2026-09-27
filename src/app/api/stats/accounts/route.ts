import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { queryFlag } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { getAccountBalances } from "@/server/services/stats";

/** GET /api/stats/accounts?includeArchived=true —— 各账户余额（初始余额 + 收入 - 支出） */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const items = await getAccountBalances(deps.db, auth.principalId, {
      includeArchived: queryFlag(request, "includeArchived"),
    });
    return jsonOk({ items });
  });
}