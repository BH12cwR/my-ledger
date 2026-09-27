import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { withCookies } from "@/server/http/cookies";
import { adminDto } from "@/server/http/serialize";
import { ADMIN_SESSION_TTL_SECONDS, buildSessionCookie } from "@/server/auth/session";
import { adminLoginSchema } from "@/server/validation/schemas";
import { authenticateAdmin } from "@/server/services/admin";

/**
 * POST /api/admin/auth/login
 *
 * 管理员登录与用户端完全独立：不同的凭据来源、不同的签名密钥、不同的 Cookie 名。
 * 失败次数与锁定由服务层落到 admin_users 上，无需额外限流组件。
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();

    const input = adminLoginSchema.parse(await readJsonBody(request));
    const result = await authenticateAdmin(db, env, input, request, ADMIN_SESSION_TTL_SECONDS);

    return withCookies(
      jsonOk({
        admin: adminDto(result.admin),
        expiresAt: result.expiresAt,
        mustChangePassword: result.admin.must_change_password === 1,
      }),
      [buildSessionCookie("admin", result.token, request, ADMIN_SESSION_TTL_SECONDS)],
    );
  });
}