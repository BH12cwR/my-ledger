import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { queryFlag } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { accountDto } from "@/server/http/serialize";
import { createAccountSchema } from "@/server/validation/schemas";
import { createAccount, listAccounts } from "@/server/services/accounts";

/** GET /api/accounts?includeArchived=true */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const accounts = await listAccounts(deps.db, auth.principalId, {
      includeArchived: queryFlag(request, "includeArchived"),
    });
    return jsonOk({ items: accounts.map(accountDto) });
  });
}

/** POST /api/accounts */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const input = createAccountSchema.parse(await readJsonBody(request));
    const account = await createAccount(deps.db, auth.principalId, input);

    return jsonOk({ account: accountDto(account) }, 201);
  });
}