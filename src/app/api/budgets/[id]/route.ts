import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { updateBudgetSchema } from "@/server/validation/schemas";
import { budgetConfigDto, deleteBudget, updateBudget } from "@/server/services/budgets";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/budgets/:id —— 仅调整限额 */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "预算标识");
    const input = updateBudgetSchema.parse(await readJsonBody(request));
    const budget = await updateBudget(deps.db, auth.principalId, id, input);

    return jsonOk({ budget: budgetConfigDto(budget) });
  });
}

/** DELETE /api/budgets/:id —— 预算可物理删除，不影响历史账目 */
export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "预算标识");
    await deleteBudget(deps.db, auth.principalId, id);

    return jsonOk({ ok: true });
  });
}
