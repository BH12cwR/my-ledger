import { handleRoute, jsonOk } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { isDevAuthEnabled } from "@/server/db/client";
import { resolveAuth } from "@/server/auth/session";
import { isWechatConfigured } from "@/server/auth/wechat";
import { userDto } from "@/server/http/serialize";
import { getUserById } from "@/server/services/users";

/**
 * GET /api/auth/me
 *
 * 会话引导接口：无论是否登录都返回 200，未登录时 user 为 null。
 * 这样前端首屏可以一次请求同时拿到登录态与可用登录方式，避免 401 造成的闪烁。
 * 需要强制登录的接口请使用 requireUser（见 /api/transactions 等）。
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();
    const auth = await resolveAuth(db, env, request, "user");
    const user = auth ? await getUserById(db, auth.principalId) : null;

    return jsonOk({
      user: user ? userDto(user) : null,
      capabilities: {
        wechat: isWechatConfigured(env),
        devLogin: isDevAuthEnabled() && env.APP_ENV !== "production",
      },
    });
  });
}