import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { categoryDetailQuerySchema } from "@/server/validation/schemas";
import { getCategoryDetail } from "@/server/services/stats";

/** GET /api/stats/category?categoryId=&from=&to=&kind=expense —— 单个分类的详情指标（稿 9） */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, categoryDetailQuerySchema);
    return jsonOk(await getCategoryDetail(deps.db, auth.principalId, query));
  });
}