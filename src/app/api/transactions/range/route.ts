import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { requireUser } from "@/server/auth/guard";
import { getTransactionDateRange } from "@/server/services/transactions";

/**
 * GET /api/transactions/range
 *
 * 当前用户全部账目的最早 / 最晚业务日；没有任何账目时两天均为 null。
 * 自定义筛选页用它渲染「2025年~2026年」这枚由数据决定跨度的 chip。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const range = await getTransactionDateRange(deps.db, auth.principalId);

    return jsonOk(range);
  });
}
