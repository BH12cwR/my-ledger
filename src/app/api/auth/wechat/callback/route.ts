import { redirectTo } from "@/server/http/response";
import { defaultDeps } from "@/server/http/deps";
import { clearCookie, isSecureRequest, readCookie, withCookies } from "@/server/http/cookies";
import { ApiError } from "@/server/http/errors";
import { exchangeWechatCode, fetchWechatProfile, isWechatConfigured } from "@/server/auth/wechat";
import { buildSessionCookie, createSession, sessionSecret, USER_SESSION_TTL_SECONDS } from "@/server/auth/session";
import { OAUTH_STATE_COOKIE, sanitizeNext, verifyOauthState } from "@/server/auth/state";
import { recordAudit } from "@/server/services/audit";
import { upsertWechatUser } from "@/server/services/users";

/**
 * GET /api/auth/wechat/callback?code=...&state=...
 *
 * 这是浏览器跳转，因此任何失败都必须以 302 回到站内并带上错误提示，
 * 而不是把 JSON 错误体直接渲染给用户。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");

  try {
    const { db, env } = defaultDeps();

    if (!isWechatConfigured(env)) throw ApiError.badRequest("微信登录尚未配置");
    if (!code) {
      throw ApiError.badRequest(
        url.searchParams.get("errcode") ? "已取消微信授权" : "缺少微信授权码",
      );
    }
    if (!stateToken) throw ApiError.badRequest("缺少 state 参数");

    // 双提交校验：签名有效 且 Cookie 中的 nonce 与 state 负载一致
    const verified = await verifyOauthState(stateToken, sessionSecret(env, "user"));
    const cookieNonce = readCookie(request, OAUTH_STATE_COOKIE);
    if (!verified || !cookieNonce || verified.nonce !== cookieNonce) {
      throw ApiError.badRequest("登录请求已失效，请重新扫码");
    }

    const token = await exchangeWechatCode(env, code);
    const profile = await fetchWechatProfile(env, token.accessToken, token.openid);
    const user = await upsertWechatUser(db, {
      openid: profile.openid,
      unionid: profile.unionid,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl,
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
      action: "user.login.wechat",
      targetType: "user",
      targetId: user.id,
      request,
    });

    return withCookies(redirectTo(sanitizeNext(verified.next)), [
      buildSessionCookie("user", session.token, request, USER_SESSION_TTL_SECONDS),
      clearCookie(OAUTH_STATE_COOKIE, {
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: "Lax",
        path: "/",
      }),
    ]);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "微信登录失败，请稍后重试";
    if (!(error instanceof ApiError)) console.error("[auth] wechat callback failed:", error);
    return redirectTo(`/?auth_error=${encodeURIComponent(message)}`);
  }
}