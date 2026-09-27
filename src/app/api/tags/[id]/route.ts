import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { requireUser } from "@/server/auth/guard";
import { tagDto } from "@/server/http/serialize";
import { updateTagSchema } from "@/server/validation/schemas";
import { deleteTag, updateTag } from "@/server/services/tags";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/tags/:id */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "标签标识");
    const input = updateTagSchema.parse(await readJsonBody(request));
    const tag = await updateTag(deps.db, auth.principalId, id, input);

    return jsonOk({ tag: tagDto(tag) });
  });
}

/** DELETE /api/tags/:id —— 标签可物理删除，关联关系由外键级联清理 */
export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireUser(request, deps);

    const id = pathParam((await context.params).id, "标签标识");
    await deleteTag(deps.db, auth.principalId, id);

    return jsonOk({ ok: true });
  });
}