import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { withCookies } from "@/server/http/cookies";
import { buildClearSessionCookie, resolveAuth, revokeSession } from "@/server/auth/session";

/**
 * POST /api/auth/logout
 * 无论当前会话是否有效都返回成功，并清空 Cookie —— 登出必须幂等。
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();
    const auth = await resolveAuth(db, env, request, "user");
    if (auth) await revokeSession(db, auth.sessionId);

    return withCookies(jsonOk({ ok: true }), [buildClearSessionCookie("user", request)]);
  });
}