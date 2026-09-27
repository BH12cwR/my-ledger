import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { requireUser } from "@/server/auth/guard";
import { getDashboardOverview } from "@/server/services/stats";

/** GET /api/stats/overview —— 首页概览：本月/今日收支 + Top5 支出分类 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    return jsonOk(await getDashboardOverview(deps.db, auth.principalId));
  });
}