import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { transactionDto } from "@/server/http/serialize";
import { refundTransaction } from "@/server/services/transactions";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/transactions/:id/refund —— 为支出生成等额退款收入并标记原支出 */
export async function POST(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账目标识");
    const { refund, origin } = await refundTransaction(deps.db, auth.principalId, id);

    return jsonOk({ refund: transactionDto(refund), origin: transactionDto(origin) }, 201);
  });
}
