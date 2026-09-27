import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { ApiError } from "@/server/http/errors";
import { requireUser } from "@/server/auth/guard";
import { transactionDto } from "@/server/http/serialize";
import { updateTransactionSchema } from "@/server/validation/schemas";
import { deleteTransaction, getTransaction, updateTransaction } from "@/server/services/transactions";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/transactions/:id */
export async function GET(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账目标识");
    const transaction = await getTransaction(deps.db, auth.principalId, id);
    if (!transaction) throw ApiError.notFound("账目不存在或已删除");

    return jsonOk({ transaction: transactionDto(transaction) });
  });
}

/** PATCH /api/transactions/:id */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账目标识");
    const input = updateTransactionSchema.parse(await readJsonBody(request));
    const transaction = await updateTransaction(deps.db, auth.principalId, id, input);

    return jsonOk({ transaction: transactionDto(transaction) });
  });
}

/** DELETE /api/transactions/:id —— 软删除，统计口径可追溯 */
export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账目标识");
    await deleteTransaction(deps.db, auth.principalId, id);

    return jsonOk({ ok: true });
  });
}