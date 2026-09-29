import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { transactionsSummaryQuerySchema } from "@/server/validation/schemas";
import { getTransactionsSummary } from "@/server/services/transactions";

/**
 * GET /api/transactions/summary
 *
 * 搜索账单页「搜索汇总」卡：支出 / 收入 / 结余 / 转账 / 退款。
 * 参数与 GET /api/transactions 完全一致（只是不分页、不排序），
 * 两者共用同一段 WHERE，因此 total 必然等于同条件下列表的 total。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, transactionsSummaryQuerySchema);
    const summary = await getTransactionsSummary(deps.db, auth.principalId, query);

    return jsonOk(summary);
  });
}
