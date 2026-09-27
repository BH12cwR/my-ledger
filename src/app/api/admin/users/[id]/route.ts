import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { pathParam } from "@/server/http/query";
import { ApiError } from "@/server/http/errors";
import { requireAdmin } from "@/server/auth/guard";
import { userDto } from "@/server/http/serialize";
import { revokeAllSessions } from "@/server/auth/session";
import { adminUpdateUserStatusSchema } from "@/server/validation/schemas";
import { recordAudit } from "@/server/services/audit";
import { getUserById, getUserStats, setUserStatus } from "@/server/services/users";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/users/:id —— 用户详情 + 记账统计 */
export async function GET(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const id = pathParam((await context.params).id, "用户标识");
    const user = await getUserById(deps.db, id);
    if (!user) throw ApiError.notFound("用户不存在");

    return jsonOk({ user: userDto(user), stats: await getUserStats(deps.db, id) });
  });
}

/**
 * PATCH /api/admin/users/:id
 * 仅 super_admin 与 admin 可改状态；禁用会同时吊销该用户的全部会话，使其立即下线。
 */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireAdmin(request, { roles: ["super_admin", "admin"] }, deps);

    const id = pathParam((await context.params).id, "用户标识");
    const { status } = adminUpdateUserStatusSchema.parse(await readJsonBody(request));
    const user = await setUserStatus(deps.db, id, status);

    if (status === "disabled") await revokeAllSessions(deps.db, "user", id);

    await recordAudit(deps.db, {
      actorType: "admin",
      actorId: auth.principalId,
      action: status === "disabled" ? "admin.user.disable" : "admin.user.enable",
      targetType: "user",
      targetId: id,
      detail: { status },
      request,
    });

    return jsonOk({ user: userDto(user) });
  });
}