import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { ApiError } from "@/server/http/errors";
import { requireAdmin } from "@/server/auth/guard";
import { adminDto } from "@/server/http/serialize";
import { getAdminById } from "@/server/services/admin";

/** GET /api/admin/auth/me —— 后台会话引导，未登录返回 401 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const deps = defaultDeps();
    const auth = await requireAdmin(request, undefined, deps);

    const admin = await getAdminById(deps.db, auth.principalId);
    if (!admin) throw ApiError.unauthorized("管理员账号不存在或已停用");

    // adminDto 只读取白名单字段，password_hash 不会被序列化出去
    return jsonOk({ admin: adminDto(admin) });
  });
}