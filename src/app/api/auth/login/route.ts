import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { withCookies } from "@/server/http/cookies";
import { buildSessionCookie, USER_SESSION_TTL_SECONDS } from "@/server/auth/session";
import { userLoginSchema } from "@/server/validation/schemas";
import { userDto } from "@/server/http/serialize";
import { authenticateUserWithPassword } from "@/server/services/users";

/**
 * POST /api/auth/login
 *
 * 普通用户的账号密码登录，与微信登录共用同一套用户会话（Cookie ledger_session）。
 * 失败次数与锁定由服务层落到 users 上，无需额外限流组件。
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();

    const input = userLoginSchema.parse(await readJsonBody(request));
    const result = await authenticateUserWithPassword(
      db,
      env,
      input,
      request,
      USER_SESSION_TTL_SECONDS,
    );

    return withCookies(jsonOk({ user: userDto(result.user) }), [
      buildSessionCookie("user", result.token, request, USER_SESSION_TTL_SECONDS),
    ]);
  });
}
