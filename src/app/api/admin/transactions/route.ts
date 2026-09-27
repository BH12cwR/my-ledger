import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireAdmin } from "@/server/auth/guard";
import { pageDto, transactionDto } from "@/server/http/serialize";
import { adminTransactionListQuerySchema } from "@/server/validation/schemas";
import { listTransactions } from "@/server/services/transactions";

/**
 * GET /api/admin/transactions?userId=&kind=&from=&to=&keyword=
 *
 * 跨用户的只读监控视图。listTransactions 的 userId 传 null 表示不限用户，
 * 并开启 includeUser 以带出记账人昵称。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const query = parseQuery(request, adminTransactionListQuerySchema);
    const page = await listTransactions(deps.db, null, query, {
      userId: query.userId,
      includeUser: true,
    });

    return jsonOk(pageDto(page, transactionDto));
  });
}