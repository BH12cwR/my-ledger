import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { requireAdmin } from "@/server/auth/guard";
import { adminDto } from "@/server/http/serialize";
import { adminCreateAdminSchema } from "@/server/validation/schemas";
import { recordAudit } from "@/server/services/audit";
import { createAdminAccount, listAdmins } from "@/server/services/admin";

/** GET /api/admin/admins —— 管理员列表（不含 password_hash） */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    await requireAdmin(request, undefined, deps);

    const admins = await listAdmins(deps.db);
    return jsonOk({ items: admins.map(adminDto) });
  });
}

/** POST /api/admin/admins —— 仅 super_admin 可新增管理员 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireAdmin(request, { roles: ["super_admin"] }, deps);

    const input = adminCreateAdminSchema.parse(await readJsonBody(request));
    const admin = await createAdminAccount(deps.db, deps.env, input);

    await recordAudit(deps.db, {
      actorType: "admin",
      actorId: auth.principalId,
      action: "admin.account.create",
      targetType: "admin_user",
      targetId: admin.id,
      detail: { username: admin.username, role: admin.role },
      request,
    });

    return jsonOk({ admin: adminDto(admin) }, 201);
  });
}