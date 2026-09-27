import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { parseQuery, queryFlag } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { categoryDto } from "@/server/http/serialize";
import { createCategorySchema, categoryListQuerySchema } from "@/server/validation/schemas";
import { createCategory, listCategories } from "@/server/services/categories";

/** GET /api/categories?kind=expense&includeArchived=true */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const query = parseQuery(request, categoryListQuerySchema);
    const categories = await listCategories(deps.db, auth.principalId, {
      kind: query.kind,
      includeArchived: queryFlag(request, "includeArchived"),
    });
    return jsonOk({ items: categories.map(categoryDto) });
  });
}

/** POST /api/categories —— 仅创建用户自有分类，系统内置分类不可通过接口写入 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const input = createCategorySchema.parse(await readJsonBody(request));
    const category = await createCategory(deps.db, auth.principalId, input);

    return jsonOk({ category: categoryDto(category) }, 201);
  });
}