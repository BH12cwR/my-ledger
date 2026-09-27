import { handleRoute, jsonOk, readJsonBody } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { withCookies } from "@/server/http/cookies";
import { ApiError } from "@/server/http/errors";
import { buildSessionCookie, createSession, USER_SESSION_TTL_SECONDS } from "@/server/auth/session";
import { isDevAuthEnabled } from "@/server/db/client";
import { devLoginSchema } from "@/server/validation/schemas";
import { userDto } from "@/server/http/serialize";
import { recordAudit } from "@/server/services/audit";
import { upsertWechatUser } from "@/server/services/users";

/** 开发登录账号的 openid 前缀，便于在后台一眼区分演示数据 */
const DEV_OPENID_PREFIX = "dev:";

/**
 * POST /api/auth/dev-login
 * 本地开发用的模拟登录：绕过微信开放平台，直接以昵称创建/复用账号。
 *
 * 双重开关：既要 AUTH_DEV_MODE=true，又要 APP_ENV !== "production"，
 * 避免线上误开启后成为完全开放的登录后门。
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { db, env } = defaultDeps();

    if (!isDevAuthEnabled()) {
      throw ApiError.forbidden("开发模式登录未启用");
    }
    if (env.APP_ENV === "production") {
      throw ApiError.forbidden("生产环境已禁用开发模式登录");
    }

    const input = devLoginSchema.parse(await readJsonBody(request));

    const user = await upsertWechatUser(db, {
      openid: `${DEV_OPENID_PREFIX}${input.nickname}`,
      unionid: null,
      nickname: input.nickname,
      avatarUrl: null,
    });

    const session = await createSession(db, env, {
      principalType: "user",
      principalId: user.id,
      request,
      ttlSeconds: USER_SESSION_TTL_SECONDS,
    });

    await recordAudit(db, {
      actorType: "user",
      actorId: user.id,
      action: "user.login.dev",
      targetType: "user",
      targetId: user.id,
      request,
    });

    return withCookies(jsonOk({ user: userDto(user) }), [
      buildSessionCookie("user", session.token, request, USER_SESSION_TTL_SECONDS),
    ]);
  });
}