import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { pageDto, transactionDto } from "@/server/http/serialize";
import { createTransactionSchema, listTransactionsQuerySchema } from "@/server/validation/schemas";
import { createTransaction, listTransactions } from "@/server/services/transactions";

/**
 * GET /api/transactions
 * 支持 from / to / kind / categoryId / accountId / keyword 过滤与分页。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, listTransactionsQuerySchema);
    const page = await listTransactions(deps.db, auth.principalId, query);

    return jsonOk(pageDto(page, transactionDto));
  });
}

/** POST /api/transactions */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const input = createTransactionSchema.parse(await readJsonBody(request));
    const transaction = await createTransaction(deps.db, auth.principalId, input);

    return jsonOk({ transaction: transactionDto(transaction) }, 201);
  });
}