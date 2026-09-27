import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { withCookies } from "@/server/http/cookies";
import { buildSessionCookie, USER_SESSION_TTL_SECONDS } from "@/server/auth/session";
import { userRegisterSchema } from "@/server/validation/schemas";
import { userDto } from "@/server/http/serialize";
import { registerUserWithPassword } from "@/server/services/users";

/**
 * POST /api/auth/register
 *
 * 账号密码自助注册：用户名 + 密码。注册成功即签发会话，前端无需再走一次登录。
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();

    const input = userRegisterSchema.parse(await readJsonBody(request));
    const result = await registerUserWithPassword(db, env, input, request);

    return withCookies(jsonOk({ user: userDto(result.user) }, 201), [
      buildSessionCookie("user", result.token, request, USER_SESSION_TTL_SECONDS),
    ]);
  });
}
