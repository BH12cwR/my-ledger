import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { ApiError } from "@/server/http/errors";
import { requireUser } from "@/server/auth/guard";
import { accountDto } from "@/server/http/serialize";
import { patchAccountSchema } from "@/server/validation/schemas";
import { archiveAccount, deleteAccount, getAccount, updateAccount } from "@/server/services/accounts";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/accounts/:id */
export async function GET(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账户标识");
    const account = await getAccount(deps.db, auth.principalId, id);
    if (!account) throw ApiError.notFound("账户不存在");

    return jsonOk({ account: accountDto(account) });
  });
}

/** PATCH /api/accounts/:id —— 同时承担编辑与归档/恢复 */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账户标识");
    const input = patchAccountSchema.parse(await readJsonBody(request));
    const { archived, ...changes } = input;

    if (Object.keys(changes).length > 0) {
      await updateAccount(deps.db, auth.principalId, id, changes);
    }
    const account =
      archived === undefined
        ? await getAccount(deps.db, auth.principalId, id)
        : await archiveAccount(deps.db, auth.principalId, id, archived);

    if (!account) throw ApiError.notFound("账户不存在");
    return jsonOk({ account: accountDto(account) });
  });
}

/** DELETE /api/accounts/:id —— 无关联账目时物理删除 */
export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "账户标识");
    await deleteAccount(deps.db, auth.principalId, id);

    return jsonOk({ ok: true });
  });
}