import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { requireUser } from "@/server/auth/guard";
import { createBudgetSchema } from "@/server/validation/schemas";
import { budgetConfigDto, createBudget, getBudgetOverview } from "@/server/services/budgets";

/** GET /api/budgets —— 预算列表，附带当前周期的实时用量 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const budgets = await getBudgetOverview(deps.db, auth.principalId);
    return jsonOk({ items: budgets });
  });
}

/** POST /api/budgets —— 新增预算；categoryId 省略或为 null 表示总预算 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const input = createBudgetSchema.parse(await readJsonBody(request));
    const budget = await createBudget(deps.db, auth.principalId, input);

    return jsonOk({ budget: budgetConfigDto(budget) }, 201);
  });
}
