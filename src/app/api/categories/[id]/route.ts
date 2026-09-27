import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { ApiError } from "@/server/http/errors";
import { requireUser } from "@/server/auth/guard";
import { categoryDto } from "@/server/http/serialize";
import { patchCategorySchema } from "@/server/validation/schemas";
import { archiveCategory, getCategory, updateCategory } from "@/server/services/categories";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/categories/:id —— 系统内置分类会返回 404，用户分类可改名/改色/归档 */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "分类标识");
    const input = patchCategorySchema.parse(await readJsonBody(request));
    const { archived, ...changes } = input;

    if (Object.keys(changes).length > 0) {
      await updateCategory(deps.db, auth.principalId, id, changes);
    }
    const category =
      archived === undefined
        ? await getCategory(deps.db, auth.principalId, id)
        : await archiveCategory(deps.db, auth.principalId, id, archived);

    if (!category) throw ApiError.notFound("分类不存在");
    return jsonOk({ category: categoryDto(category) });
  });
}

/** DELETE /api/categories/:id —— 语义为归档 */
export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "分类标识");
    const category = await archiveCategory(deps.db, auth.principalId, id, true);

    return jsonOk({ category: categoryDto(category) });
  });
}